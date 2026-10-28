import assert from "node:assert/strict";
import test from "node:test";
import { parseVisitorPassInput } from "./visitor-pass-input-policy.js";

const now = Date.parse("2026-10-28T12:00:00.000Z");

test("trims the visitor name and phone and supplies a default 12-hour window", () => {
  const result = parseVisitorPassInput({ visitorName: "  Ada Visitor  ", visitorPhone: " 123 " }, now);
  assert.ok(result);
  assert.equal(result.visitorName, "Ada Visitor");
  assert.equal(result.visitorPhone, "123");
  assert.equal(result.validFrom.toISOString(), "2026-10-28T12:00:00.000Z");
  assert.equal(result.validUntil.toISOString(), "2026-10-29T00:00:00.000Z");
});

test("allows a valid custom window of up to seven days", () => {
  const result = parseVisitorPassInput({
    visitorName: "Ada Visitor",
    validFrom: "2026-10-28T12:00:00.000Z",
    validUntil: "2026-11-04T12:00:00.000Z",
  }, now);
  assert.ok(result);
});

test("rejects missing, too-short, and overlong visitor names", () => {
  assert.equal(parseVisitorPassInput({}, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "A" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "x".repeat(121) }, now), null);
});

test("rejects overlong phone numbers and malformed dates", () => {
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", visitorPhone: "1".repeat(41) }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", validFrom: "not-a-date" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", validUntil: "not-a-date" }, now), null);
});

test("rejects expired, reversed, and over-seven-day windows", () => {
  assert.equal(parseVisitorPassInput({
    visitorName: "Ada Visitor", validFrom: "2026-10-28T10:00:00.000Z", validUntil: "2026-10-28T11:00:00.000Z",
  }, now), null);
  assert.equal(parseVisitorPassInput({
    visitorName: "Ada Visitor", validFrom: "2026-10-29T12:00:00.000Z", validUntil: "2026-10-29T11:00:00.000Z",
  }, now), null);
  assert.equal(parseVisitorPassInput({
    visitorName: "Ada Visitor", validFrom: "2026-10-28T12:00:00.000Z", validUntil: "2026-11-04T12:00:00.001Z",
  }, now), null);
});
