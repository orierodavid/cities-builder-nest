import assert from "node:assert/strict";
import test from "node:test";
import { parseVisitorPassInput } from "./visitor-pass-input-policy.js";

const now = Date.parse("2026-10-28T12:00:00.000Z");

test("trims visitor name and phone and defaults to one visitor for a one-time pass", () => {
  const result = parseVisitorPassInput({ visitorName: "  Ada Visitor  ", visitorPhone: " +234 800 000 0000 " }, now);
  assert.ok(result);
  assert.equal(result.visitorName, "Ada Visitor");
  assert.equal(result.visitorPhone, "+234 800 000 0000");
  assert.equal(result.visitorCount, 1);
  assert.equal(result.frequency, "once");
  assert.equal(result.scheduleStartDate, "2026-10-28");
  assert.equal(result.scheduleEndDate, "2026-10-28");
  assert.equal(result.validUntil.getTime() - result.validFrom.getTime(), 12 * 60 * 60 * 1000);
});

test("accepts daily recurring visits with a bounded date range and visitor count", () => {
  const result = parseVisitorPassInput({
    visitorName: "Ada Visitor", visitorPhone: "08000000000", visitorCount: 4,
    frequency: "daily", scheduleStartDate: "2026-10-29", scheduleEndDate: "2026-11-04",
  }, now);
  assert.ok(result);
  assert.equal(result.visitorCount, 4);
  assert.equal(result.frequency, "daily");
  assert.equal(result.validFrom.toISOString(), "2026-10-29T00:00:00.000Z");
});

test("accepts weekly recurring visits", () => {
  const result = parseVisitorPassInput({
    visitorName: "Ada Visitor", visitorCount: 2, frequency: "weekly",
    scheduleStartDate: "2026-10-28", scheduleEndDate: "2026-12-30",
  }, now);
  assert.ok(result);
  assert.equal(result.frequency, "weekly");
});

test("rejects missing or invalid visitor details", () => {
  assert.equal(parseVisitorPassInput({}, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "A" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", visitorPhone: "bad" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", visitorCount: 0 }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", visitorCount: 51 }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", frequency: "monthly" }, now), null);
});

test("rejects invalid, reversed, expired, or overlong schedule dates", () => {
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", scheduleStartDate: "not-a-date" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", scheduleStartDate: "2026-11-01", scheduleEndDate: "2026-10-31", frequency: "daily" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", scheduleStartDate: "2026-10-01", scheduleEndDate: "2026-10-01" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", frequency: "daily", scheduleStartDate: "2026-10-29", scheduleEndDate: "2027-11-01" }, now), null);
  assert.equal(parseVisitorPassInput({ visitorName: "Ada Visitor", frequency: "once", scheduleStartDate: "2026-10-29", scheduleEndDate: "2026-10-30" }, now), null);
});
