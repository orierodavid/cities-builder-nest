import assert from "node:assert/strict";
import test from "node:test";
import { BACKGROUND_JOB_TYPES } from "./background-jobs.js";

test("background job types are an explicit allowlist", () => {
  assert.deepEqual(BACKGROUND_JOB_TYPES, ["email.send", "notification.deliver", "report.generate"]);
});

test("background queue does not expose arbitrary job types", () => {
  assert.equal((BACKGROUND_JOB_TYPES as readonly string[]).includes("payment.execute"), false);
  assert.equal((BACKGROUND_JOB_TYPES as readonly string[]).includes("shell.execute"), false);
});
