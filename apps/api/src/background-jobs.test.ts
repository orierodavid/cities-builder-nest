import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKGROUND_JOB_TYPES,
  backgroundJobRetryDelaySeconds,
  isBackgroundJobType,
  validateEnqueueBackgroundJobInput,
} from "./background-jobs.js";

test("background job types are an explicit allowlist", () => {
  assert.deepEqual(BACKGROUND_JOB_TYPES, ["email.send", "notification.deliver", "report.generate"]);
});

test("background queue rejects arbitrary job types", () => {
  assert.equal(isBackgroundJobType("payment.execute"), false);
  assert.equal(isBackgroundJobType("shell.execute"), false);
  assert.equal(isBackgroundJobType("email.send"), true);
});

test("enqueue validation accepts a safe, bounded job payload", () => {
  assert.doesNotThrow(() => validateEnqueueBackgroundJobInput({
    type: "email.send",
    payload: { recipientEmail: "resident@example.com", subject: "Welcome" },
    idempotencyKey: "welcome-user-123",
    maxAttempts: 4,
    availableAt: new Date("2026-11-10T12:00:00.000Z"),
  }));
});

test("enqueue validation rejects invalid payloads and retry limits", () => {
  assert.throws(() => validateEnqueueBackgroundJobInput({
    type: "email.send",
    payload: [] as unknown as Record<string, unknown>,
  }), /payload must be an object/);
  assert.throws(() => validateEnqueueBackgroundJobInput({
    type: "email.send",
    payload: {},
    maxAttempts: 21,
  }), /maxAttempts/);
  assert.throws(() => validateEnqueueBackgroundJobInput({
    type: "email.send",
    payload: {},
    availableAt: new Date("invalid"),
  }), /valid date/);
});

test("retry backoff grows exponentially and caps at one hour", () => {
  assert.equal(backgroundJobRetryDelaySeconds(1), 15);
  assert.equal(backgroundJobRetryDelaySeconds(2), 30);
  assert.equal(backgroundJobRetryDelaySeconds(3), 60);
  assert.equal(backgroundJobRetryDelaySeconds(20), 3600);
  assert.throws(() => backgroundJobRetryDelaySeconds(0), /positive integer/);
});
