import assert from "node:assert/strict";
import test from "node:test";
import { canUseGateWorkflow } from "./gate-workflow-policy.js";

const activeSecurity = {
  estate_id: "estate-a",
  membership_role: "security",
  status: "active",
};

test("allows active security in the requested estate", () => {
  assert.equal(canUseGateWorkflow(activeSecurity, "estate-a"), true);
});

test("denies security membership from another estate", () => {
  assert.equal(canUseGateWorkflow(activeSecurity, "estate-b"), false);
});

test("denies residents and estate managers", () => {
  assert.equal(canUseGateWorkflow({ ...activeSecurity, membership_role: "resident" }, "estate-a"), false);
  assert.equal(canUseGateWorkflow({ ...activeSecurity, membership_role: "facility_manager" }, "estate-a"), false);
  assert.equal(canUseGateWorkflow({ ...activeSecurity, membership_role: "estate_admin" }, "estate-a"), false);
});

test("denies inactive memberships and missing membership records", () => {
  assert.equal(canUseGateWorkflow({ ...activeSecurity, status: "inactive" }, "estate-a"), false);
  assert.equal(canUseGateWorkflow(null, "estate-a"), false);
  assert.equal(canUseGateWorkflow(undefined, "estate-a"), false);
});

test("denies empty estate identifiers", () => {
  assert.equal(canUseGateWorkflow(activeSecurity, ""), false);
});
