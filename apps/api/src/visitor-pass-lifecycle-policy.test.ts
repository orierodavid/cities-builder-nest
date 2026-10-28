import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidVisitorAccessCode,
  isVisitorPassCurrentlyValid,
  visitorCheckInFailure,
  visitorPassAvailabilityError,
} from "./visitor-pass-lifecycle-policy.js";

const activePass = {
  status: "active",
  valid_from: "2026-10-28T10:00:00.000Z",
  valid_until: "2026-10-28T12:00:00.000Z",
};

test("accepts only six-digit string access codes", () => {
  assert.equal(isValidVisitorAccessCode("123456"), true);
  assert.equal(isValidVisitorAccessCode(" 123456 "), true);
  assert.equal(isValidVisitorAccessCode("12345"), false);
  assert.equal(isValidVisitorAccessCode("1234567"), false);
  assert.equal(isValidVisitorAccessCode("12a456"), false);
  assert.equal(isValidVisitorAccessCode(123456), false);
  assert.equal(isValidVisitorAccessCode(null), false);
});

test("accepts only active passes inside the validity window", () => {
  const now = Date.parse("2026-10-28T11:00:00.000Z");
  assert.equal(isVisitorPassCurrentlyValid(activePass, now), true);
  assert.equal(isVisitorPassCurrentlyValid({ ...activePass, status: "revoked" }, now), false);
  assert.equal(isVisitorPassCurrentlyValid(activePass, Date.parse(activePass.valid_from) - 1), false);
  assert.equal(isVisitorPassCurrentlyValid(activePass, Date.parse(activePass.valid_until)), false);
  assert.equal(isVisitorPassCurrentlyValid({ ...activePass, valid_until: "bad-date" }, now), false);
});

test("identifies replay separately from expired or revoked passes", () => {
  assert.equal(visitorPassAvailabilityError({ ...activePass, status: "used" }, Date.parse("2026-10-28T11:00:00.000Z")), "visitor_pass_already_used");
  assert.equal(visitorPassAvailabilityError({ ...activePass, status: "revoked" }, Date.parse("2026-10-28T11:00:00.000Z")), "visitor_pass_expired_or_inactive");
  assert.equal(visitorPassAvailabilityError(activePass, Date.parse("2026-10-28T11:00:00.000Z")), null);
});

test("maps database lifecycle failures to stable HTTP responses", () => {
  assert.deepEqual(visitorCheckInFailure("23505"), { status: 409, error: "visitor_pass_already_used" });
  assert.deepEqual(visitorCheckInFailure("55000"), { status: 423, error: "estate_subscription_inactive" });
  assert.deepEqual(visitorCheckInFailure("23514"), { status: 409, error: "visitor_pass_expired_or_inactive" });
  assert.deepEqual(visitorCheckInFailure("XX000"), { status: 400, error: "visitor_check_in_failed" });
});
