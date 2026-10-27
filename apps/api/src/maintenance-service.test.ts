import assert from "node:assert/strict";
import test from "node:test";
import { submitMaintenanceRequest } from "./maintenance-service.js";

const validBody = {
  title: "Leaking tap",
  description: "Water is leaking under the kitchen sink.",
  priority: "high",
};

test("rejects invalid input before checking membership or inserting", async () => {
  let membershipChecks = 0;
  let inserts = 0;
  const result = await submitMaintenanceRequest("estate-a", "user-a", {
    title: "x",
    description: "too short",
  }, {
    async hasActiveMembership() {
      membershipChecks += 1;
      return { active: true };
    },
    async insertRequest() {
      inserts += 1;
      return { data: { id: "should-not-exist" } };
    },
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "invalid_maintenance_request", message: "Title must be 3–120 characters and description 5–3000 characters." });
  assert.equal(membershipChecks, 0);
  assert.equal(inserts, 0);
});

test("denies users without active estate membership and never inserts", async () => {
  let inserts = 0;
  let checkedEstate = "";
  let checkedUser = "";
  const result = await submitMaintenanceRequest("estate-other", "user-resident", validBody, {
    async hasActiveMembership(estateId, userId) {
      checkedEstate = estateId;
      checkedUser = userId;
      return { active: false };
    },
    async insertRequest() {
      inserts += 1;
      return { data: { id: "unexpected" } };
    },
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "active_estate_membership_required" });
  assert.equal(checkedEstate, "estate-other");
  assert.equal(checkedUser, "user-resident");
  assert.equal(inserts, 0);
});

test("fails closed when the membership lookup errors", async () => {
  let inserts = 0;
  const result = await submitMaintenanceRequest("estate-a", "user-a", validBody, {
    async hasActiveMembership() {
      return { active: false, error: true };
    },
    async insertRequest() {
      inserts += 1;
      return { data: { id: "unexpected" } };
    },
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "estate_membership_check_failed" });
  assert.equal(inserts, 0);
});

test("inserts only after active membership and binds the authenticated user as creator", async () => {
  const calls: unknown[][] = [];
  const expected = { id: "request-1", title: "Leaking tap" };
  const result = await submitMaintenanceRequest("estate-a", "authenticated-user", validBody, {
    async hasActiveMembership(estateId, userId) {
      calls.push(["membership", estateId, userId]);
      return { active: true };
    },
    async insertRequest(estateId, userId, input) {
      calls.push(["insert", estateId, userId, input.title, input.priority]);
      return { data: expected };
    },
  });

  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { maintenanceRequest: expected });
  assert.deepEqual(calls, [
    ["membership", "estate-a", "authenticated-user"],
    ["insert", "estate-a", "authenticated-user", "Leaking tap", "high"],
  ]);
});

test("fails when the database insert fails", async () => {
  const result = await submitMaintenanceRequest("estate-a", "user-a", validBody, {
    async hasActiveMembership() {
      return { active: true };
    },
    async insertRequest() {
      return { data: null, error: true };
    },
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "maintenance_request_create_failed" });
});
