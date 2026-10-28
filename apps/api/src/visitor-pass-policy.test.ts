import assert from "node:assert/strict";
import test from "node:test";
import { canCreateVisitorPass } from "./visitor-pass-policy.js";

test("allows an active resident to create a pass for their own estate", () => {
  assert.equal(canCreateVisitorPass({
    estate_id: "estate-a",
    membership_role: "resident",
    status: "active",
  }, "estate-a"), true);
});

test("denies security staff from creating visitor passes", () => {
  assert.equal(canCreateVisitorPass({
    estate_id: "estate-a",
    membership_role: "security",
    status: "active",
  }, "estate-a"), false);
});

test("denies facility managers from creating visitor passes", () => {
  assert.equal(canCreateVisitorPass({
    estate_id: "estate-a",
    membership_role: "facility_manager",
    status: "active",
  }, "estate-a"), false);
});

test("denies residents attempting to create a pass for another estate", () => {
  assert.equal(canCreateVisitorPass({
    estate_id: "estate-a",
    membership_role: "resident",
    status: "active",
  }, "estate-b"), false);
});

test("denies inactive residents and missing memberships", () => {
  assert.equal(canCreateVisitorPass({
    estate_id: "estate-a",
    membership_role: "resident",
    status: "inactive",
  }, "estate-a"), false);
  assert.equal(canCreateVisitorPass(null, "estate-a"), false);
  assert.equal(canCreateVisitorPass(undefined, "estate-a"), false);
});
