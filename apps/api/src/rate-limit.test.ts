import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimitBucketKey, rateLimitForMethod } from "./rate-limit.js";

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
