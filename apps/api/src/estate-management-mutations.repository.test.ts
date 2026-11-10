import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  addExistingResidentMembership,
  assignExistingStaffMembership,
  assignResidentToEstateUnit,
  createEstate,
  createEstateBuilding,
  createEstateUnit,
  updateEstateSubscription,
} from "./estate-management-mutations.repository.js";

function mockClient(responses: unknown[][]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: responses[calls.length - 1] ?? [], rowCount: 0 } as QueryResult;
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("subscription update writes the disabled timestamp and safe reason", async () => {
  const row = { id: "e1", name: "Estate", is_enabled: false, disabled_at: "now", disabled_reason: "Overdue" };
  const { client, calls } = mockClient([[row]]);
  assert.deepEqual(await updateEstateSubscription(client, { estateId: "e1", enabled: false, reason: "Overdue", updatedAt: "now" }), row);
  assert.deepEqual(calls[0].values, ["e1", false, "now", "Overdue"]);
});

test("estate creation is parameterized", async () => {
  const row = { id: "e1", name: "Estate", address: "Road", city: "Lagos", state: "Lagos", country_code: "NG", timezone: "Africa/Lagos", created_at: "now" };
  const { client, calls } = mockClient([[row]]);
  assert.deepEqual(await createEstate(client, { name: "Estate", address: "Road", city: "Lagos", state: "Lagos", countryCode: "NG", timezone: "Africa/Lagos" }), row);
  assert.deepEqual(calls[0].values, ["Estate", "Road", "Lagos", "Lagos", "NG", "Africa/Lagos"]);
});

test("resident membership creation uses the scoped database candidate function", async () => {
  const resident = { id: "u1", full_name: "Resident", phone_e164: null, is_active: true };
  const membership = { id: "m1", estate_id: "e1", user_id: "u1", membership_role: "resident", status: "active", created_at: "now" };
  const { client, calls } = mockClient([[resident], [membership]]);
  assert.deepEqual(await addExistingResidentMembership(client, { estateId: "e1", residentUserId: "u1" }), {
    resident: { id: "u1", full_name: "Resident", phone_e164: null }, membership,
  });
  assert.deepEqual(calls[0].values, ["e1", "u1"]);
  assert.match(calls[0].sql, /get_active_resident_candidate/);
  assert.match(calls[1].sql, /INSERT INTO public\.estate_memberships/);
});

test("staff membership creation checks active user status before inserting role", async () => {
  const membership = { id: "m1", estate_id: "e1", user_id: "u1", membership_role: "security", status: "active", created_at: "now" };
  const { client, calls } = mockClient([[{ id: "u1", full_name: "Officer", is_active: true }], [membership]]);
  assert.deepEqual(await assignExistingStaffMembership(client, { estateId: "e1", userId: "u1", role: "security" }), {
    staff: { id: "u1", full_name: "Officer" }, membership,
  });
  assert.deepEqual(calls[0].values, ["u1"]);
  assert.deepEqual(calls[1].values, ["e1", "u1", "security"]);
});

test("building and unit creation retain estate/building scope", async () => {
  const building = { id: "b1", estate_id: "e1", name: "Block A", created_at: "now" };
  const unit = { id: "u1", estate_id: "e1", building_id: "b1", unit_code: "A1", unit_type: "flat", status: "available" };
  const b = mockClient([[building]]);
  assert.deepEqual(await createEstateBuilding(b.client, "e1", "Block A"), building);
  const u = mockClient([[{ id: "b1" }], [unit]]);
  assert.deepEqual(await createEstateUnit(u.client, { estateId: "e1", buildingId: "b1", unitCode: "A1", unitType: "flat" }), unit);
  assert.deepEqual(u.calls[0].values, ["b1", "e1"]);
  assert.deepEqual(u.calls[1].values, ["b1", "e1", "A1", "flat"]);
});

test("resident assignment rejects missing and unavailable units before insert", async () => {
  const missing = mockClient([[]]);
  assert.deepEqual(await assignResidentToEstateUnit(missing.client, { estateId: "e1", unitId: "u1", residentUserId: "r1" }), { kind: "unit_not_found" });
  const occupied = mockClient([[{ id: "u1", status: "occupied" }]]);
  assert.deepEqual(await assignResidentToEstateUnit(occupied.client, { estateId: "e1", unitId: "u1", residentUserId: "r1" }), { kind: "unit_not_available" });
});

test("resident assignment validates active resident membership then inserts estate-scoped assignment", async () => {
  const assignment = { id: "a1", estate_id: "e1", unit_id: "u1", resident_user_id: "r1", start_date: "2026-01-01", end_date: null, created_at: "now" };
  const { client, calls } = mockClient([[{ id: "u1", status: "available" }], [{ user_id: "r1" }], [assignment]]);
  assert.deepEqual(await assignResidentToEstateUnit(client, { estateId: "e1", unitId: "u1", residentUserId: "r1", startDate: "2026-01-01" }), { kind: "assigned", assignment });
  assert.deepEqual(calls[1].values, ["e1", "r1"]);
  assert.deepEqual(calls[2].values, ["e1", "u1", "r1", "2026-01-01"]);
});
