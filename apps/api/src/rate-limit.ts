import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";

const WINDOW_SECONDS = 60;
const READ_LIMIT = 120;
const WRITE_LIMIT = 30;
const localBuckets = new Map<string, { startedAt: number; count: number }>();

let adminClient: ReturnType<typeof createClient> | null | undefined;

function getAdminClient(): ReturnType<typeof createClient> | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })
    : null;
  return adminClient;
}

export function rateLimitForMethod(method: string): number | null {
  if (method === "GET" || method === "HEAD") return READ_LIMIT;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return WRITE_LIMIT;
  return null;
}

export function createRateLimitBucketKey(ip: string, tier: "read" | "write"): string {
  return createHash("sha256").update(`cbnest:${tier}:${ip}`).digest("hex");
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

export const sharedRateLimit: RequestHandler = (req, res, next) => {
  const maxRequests = rateLimitForMethod(req.method);
  if (maxRequests === null) {
    next();
    return;
  }

  const tier = req.method === "GET" || req.method === "HEAD" ? "read" : "write";
  const bucketKey = createRateLimitBucketKey(req.ip || req.socket.remoteAddress || "unknown", tier);
  // Integration/unit tests use mocked Supabase REST endpoints. Keep their rate
  // limiting deterministic and local; production always uses the shared RPC.
  if (process.env.NODE_ENV !== "production") {
    if (!consumeLocalBucket(bucketKey, maxRequests)) {
      res.setHeader("Retry-After", String(WINDOW_SECONDS));
      res.status(429).json({ error: "rate_limit_exceeded", message: "Too many requests. Please retry shortly." });
      return;
    }
    next();
    return;
  }

  const client = getAdminClient();
  if (!client) {
    res.setHeader("Retry-After", "5");
    res.status(503).json({
      error: "rate_limit_unavailable",
      message: "Request protection is temporarily unavailable. Please retry shortly.",
    });
    return;
  }

  const rpc = client.rpc.bind(client) as unknown as (
    functionName: string,
    args: { p_bucket_key: string; p_window_seconds: number; p_max_requests: number },
  ) => PromiseLike<{ data: boolean | null; error: { code?: string } | null }>;
  void Promise.resolve(rpc("consume_api_rate_limit", {
    p_bucket_key: bucketKey,
    p_window_seconds: WINDOW_SECONDS,
    p_max_requests: maxRequests,
  })).then(({ data, error }) => {
    if (error) {
      console.error("Shared API rate limiter unavailable", { code: error.code ?? "unknown" });
      res.setHeader("Retry-After", "5");
      res.status(503).json({
        error: "temporarily_unavailable",
        message: "Request protection is temporarily unavailable. Please retry shortly.",
      });
      return;
    }
    if (data !== true) {
      res.setHeader("Retry-After", String(WINDOW_SECONDS));
      res.status(429).json({ error: "rate_limit_exceeded", message: "Too many requests. Please retry shortly." });
      return;
    }
    next();
  }).catch((error: unknown) => {
    console.error("Shared API rate limiter failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    res.setHeader("Retry-After", "5");
    res.status(503).json({
      error: "temporarily_unavailable",
      message: "Request protection is temporarily unavailable. Please retry shortly.",
    });
  });
};
