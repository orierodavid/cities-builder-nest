import assert from "node:assert/strict";
import test from "node:test";
import { trustedProxyHops } from "./proxy-config.js";

test("trusts one reverse proxy in production by default", () => {
  assert.equal(trustedProxyHops(undefined, "production"), 1);
});

test("does not trust forwarded headers during local development by default", () => {
  assert.equal(trustedProxyHops(undefined, "development"), 0);
});

test("accepts an explicit bounded proxy hop count", () => {
  assert.equal(trustedProxyHops("2", "production"), 2);
  assert.equal(trustedProxyHops("0", "production"), 0);
});

test("fails closed for malformed or unreasonable proxy settings", () => {
  assert.equal(trustedProxyHops("all", "production"), 0);
  assert.equal(trustedProxyHops("-1", "production"), 0);
  assert.equal(trustedProxyHops("99", "production"), 0);
});
