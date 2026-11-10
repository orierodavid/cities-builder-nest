import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { createEstateAccountMembership } from "./account-setup.repository.js";

test("account provisioning delegates profile, membership and resident-unit writes to the guarded database function", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const membership = {
    id: "membership-1", estate_id: "estate-1", user_id: "user-1",
    membership_role: "resident", status: "active", created_at: "2026-11-10T00:00:00.000Z",
  };
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: [membership], rowCount: 1 } as QueryResult;
    },
  } as unknown as PoolClient;
  assert.deepEqual(await createEstateAccountMembership(client, {
    estateId: "estate-1", userId: "user-1", fullName: "Resident One", role: "resident", unitId: "unit-1",
  }), membership);
  assert.match(calls[0].sql, /create_estate_account_membership/);
  assert.deepEqual(calls[0].values, ["estate-1", "user-1", "Resident One", "resident", "unit-1"]);
});

test("account provisioning passes a null unit for staff roles", async () => {
  const calls: unknown[][] = [];
  const client = {
    query: async (_sql: string, values: unknown[] = []) => {
      calls.push(values);
      return { rows: [], rowCount: 0 } as QueryResult;
    },
  } as unknown as PoolClient;
  assert.equal(await createEstateAccountMembership(client, {
    estateId: "estate-1", userId: "user-2", fullName: "Security Officer", role: "security", unitId: null,
  }), null);
  assert.deepEqual(calls[0], ["estate-1", "user-2", "Security Officer", "security", null]);
});
