import assert from "node:assert/strict";
import test from "node:test";
import { consumeRedisBucket, createRateLimitBucketKey, rateLimitForMethod } from "./rate-limit.js";

test("applies a higher read limit and a stricter write limit", () => {
  assert.equal(rateLimitForMethod("GET"), 120);
  assert.equal(rateLimitForMethod("HEAD"), 120);
  assert.equal(rateLimitForMethod("POST"), 30);
  assert.equal(rateLimitForMethod("PUT"), 30);
  assert.equal(rateLimitForMethod("PATCH"), 30);
  assert.equal(rateLimitForMethod("DELETE"), 30);
});

test("does not apply a request quota to unsupported HTTP methods", () => {
  assert.equal(rateLimitForMethod("OPTIONS"), null);
  assert.equal(rateLimitForMethod("TRACE"), null);
});

test("hashes client identifiers and separates read and write buckets", () => {
  const readKey = createRateLimitBucketKey("203.0.113.10", "read");
  const writeKey = createRateLimitBucketKey("203.0.113.10", "write");
  assert.equal(readKey.length, 64);
  assert.equal(writeKey.length, 64);
  assert.notEqual(readKey, writeKey);
  assert.equal(readKey, createRateLimitBucketKey("203.0.113.10", "read"));
  assert.equal(readKey.includes("203.0.113.10"), false);
});

test("uses one atomic Redis increment with a first-request expiry", async () => {
  let count = 0;
  let receivedScript = "";
  let receivedOptions: { keys: string[]; arguments: string[] } | undefined;
  const fakeRedis = {
    async eval(script: string, options: { keys: string[]; arguments: string[] }) {
      receivedScript = script;
      receivedOptions = options;
      count += 1;
      return [count, 60 - count];
    },
  };

  const first = await consumeRedisBucket(fakeRedis, "cbnest:rate-limit:v1:read:hashed-ip", 60);
  const second = await consumeRedisBucket(fakeRedis, "cbnest:rate-limit:v1:read:hashed-ip", 60);

  assert.deepEqual(first, { count: 1, retryAfterSeconds: 59 });
  assert.deepEqual(second, { count: 2, retryAfterSeconds: 58 });
  assert.deepEqual(receivedOptions, {
    keys: ["cbnest:rate-limit:v1:read:hashed-ip"],
    arguments: ["60"],
  });
  assert.match(receivedScript, /redis\.call\("INCR", KEYS\[1\]\)/);
  assert.match(receivedScript, /if count == 1 then[\s\S]*redis\.call\("EXPIRE", KEYS\[1\], ARGV\[1\]\)/);
});

test("rejects malformed Redis responses rather than allowing a request", async () => {
  const fakeRedis = { async eval() { return null; } };
  await assert.rejects(
    consumeRedisBucket(fakeRedis, "key", 60),
    /invalid rate-limit result/,
  );
});
