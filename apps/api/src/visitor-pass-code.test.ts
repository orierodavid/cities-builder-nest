import assert from "node:assert/strict";
import test from "node:test";
import { decryptVisitorAccessCode, encryptVisitorAccessCode } from "./visitor-pass-code.js";

test("visitor pass codes can be retrieved after authenticated encryption", () => {
  const secret = "a-long-test-secret-that-is-not-used-in-production";
  const encrypted = encryptVisitorAccessCode("123456", secret);
  assert.notEqual(encrypted, "123456");
  assert.equal(decryptVisitorAccessCode(encrypted, secret), "123456");
  assert.equal(decryptVisitorAccessCode(encrypted, "different-secret"), null);
  assert.equal(decryptVisitorAccessCode(null, secret), null);
});

test("visitor pass code encryption rejects values that are not six digits", () => {
  assert.throws(() => encryptVisitorAccessCode("12345", "test-secret"));
});
