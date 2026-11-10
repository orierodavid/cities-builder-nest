import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { createClient } from "redis";

const WINDOW_SECONDS = 60;
const READ_LIMIT = 120;
const WRITE_LIMIT = 30;
const localBuckets = new Map<string, { startedAt: number; count: number }>();

type RedisClient = ReturnType<typeof createClient>;
type RedisRateLimitClient = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};
type RedisWindowResult = { count: number; retryAfterSeconds: number };

const CONSUME_RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return { count, ttl }
`;

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<void> | null = null;

function getRedisClient(): RedisClient | null {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries: number) => Math.min(100 * (2 ** Math.min(retries, 4)), 2_000),
    },
  });
  client.on("error", (error: Error) => {
    console.error("Shared API rate limiter Redis error", { name: error.name });
  });
  redisClient = client;
  return client;
}

async function connectRedis(client: RedisClient): Promise<void> {
  if (!client.isOpen) {
    if (!redisConnectPromise) {
      const connection = client.connect().then(() => undefined);
      const tracked = connection.finally(() => {
        if (redisConnectPromise === tracked) redisConnectPromise = null;
      });
      redisConnectPromise = tracked;
    }
  }
  if (redisConnectPromise) await redisConnectPromise;
  if (!client.isReady) throw new Error("Redis rate limiter is not ready");
}

export function rateLimitForMethod(method: string): number | null {
  if (method === "GET" || method === "HEAD") return READ_LIMIT;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return WRITE_LIMIT;
  return null;
}

export function createRateLimitBucketKey(ip: string, tier: "read" | "write"): string {
  return createHash("sha256").update(`cbnest:${tier}:${ip}`).digest("hex");
}

export async function consumeRedisBucket(
  client: RedisRateLimitClient,
  key: string,
  windowSeconds: number,
): Promise<RedisWindowResult> {
  const result: unknown = await client.eval(CONSUME_RATE_LIMIT_SCRIPT, {
    keys: [key],
    arguments: [String(windowSeconds)],
  });
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("Redis returned an invalid rate-limit result");
  }
  const count = Number(result[0]);
  const retryAfterSeconds = Number(result[1]);
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(retryAfterSeconds)) {
    throw new Error("Redis returned an invalid rate-limit counter");
  }
  return { count, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
}

function consumeLocalBucket(key: string, maxRequests: number): boolean {
  const now = Date.now();
  const existing = localBuckets.get(key);
  if (!existing || now - existing.startedAt >= WINDOW_SECONDS * 1000) {
    localBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  existing.count += 1;
  return existing.count <= maxRequests;
}

function rejectUnavailable(res: Parameters<RequestHandler>[1]): void {
  res.setHeader("Retry-After", "5");
  res.status(503).json({
    error: "rate_limit_unavailable",
    message: "Request protection is temporarily unavailable. Please retry shortly.",
  });
}

export async function closeRateLimitStore(): Promise<void> {
  const client = redisClient;
  redisClient = null;
  const pendingConnection = redisConnectPromise;
  if (pendingConnection) await pendingConnection.catch(() => undefined);
  redisConnectPromise = null;
  if (!client) return;
  if (client.isReady) await client.quit();
  else if (client.isOpen) client.disconnect();
}

export const sharedRateLimit: RequestHandler = (req, res, next) => {
  const maxRequests = rateLimitForMethod(req.method);
  if (maxRequests === null) {
    next();
    return;
  }

  const tier = req.method === "GET" || req.method === "HEAD" ? "read" : "write";
  const bucketKey = createRateLimitBucketKey(req.ip || req.socket.remoteAddress || "unknown", tier);
  // Keep local development and CI deterministic. Production uses one Redis
  // counter shared by every API instance.
  if (process.env.NODE_ENV !== "production" || process.env.CI === "true") {
    if (!consumeLocalBucket(bucketKey, maxRequests)) {
      res.setHeader("Retry-After", String(WINDOW_SECONDS));
      res.status(429).json({ error: "rate_limit_exceeded", message: "Too many requests. Please retry shortly." });
      return;
    }
    next();
    return;
  }

  const client = getRedisClient();
  if (!client) {
    rejectUnavailable(res);
    return;
  }

  void connectRedis(client)
    .then(() => consumeRedisBucket(client, `cbnest:rate-limit:v1:${tier}:${bucketKey}`, WINDOW_SECONDS))
    .then(({ count, retryAfterSeconds }) => {
      if (count > maxRequests) {
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(429).json({ error: "rate_limit_exceeded", message: "Too many requests. Please retry shortly." });
        return;
      }
      next();
    })
    .catch((error: unknown) => {
      console.error("Shared API rate limiter unavailable", {
        name: error instanceof Error ? error.name : "unknown",
      });
      rejectUnavailable(res);
    });
};
