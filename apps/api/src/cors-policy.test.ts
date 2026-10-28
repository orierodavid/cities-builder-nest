import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedCorsOrigin } from "./cors-policy.js";

test("allows requests without an Origin header for server-to-server calls", () => {
  assert.equal(isAllowedCorsOrigin(undefined, new Set()), true);
});

test("allows an explicitly configured exact origin", () => {
  assert.equal(isAllowedCorsOrigin("https://app.example.com", new Set(["https://app.example.com"])), true);
});

test("rejects origins that are not explicitly configured", () => {
  const allowed = new Set(["https://app.example.com"]);
  assert.equal(isAllowedCorsOrigin("https://evil.example", allowed), false);
  assert.equal(isAllowedCorsOrigin("https://app.example.com.evil.example", allowed), false);
});

test("rejects browser origins when no origins are configured", () => {
  assert.equal(isAllowedCorsOrigin("http://localhost:3000", new Set()), false);
});
