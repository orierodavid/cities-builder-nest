import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { createMaintenanceRequest } from "./maintenance-mutations.repository.js";

test("maintenance request creation is estate/user scoped and optionally binds a unit", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const row = { id: "m1", title: "Leak", description: "Water leak", status: "open", priority: "high", created_at: "now" };
  const client = { query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: [row], rowCount: 1 } as QueryResult; } } as unknown as PoolClient;
  assert.deepEqual(await createMaintenanceRequest(client, "e1", "u1", { title: "Leak", description: "Water leak", priority: "high", unitId: "unit-1" }), row);
  assert.deepEqual(calls[0].values, ["e1", "u1", "Leak", "Water leak", "high", "unit-1"]);
  assert.match(calls[0].sql, /INSERT INTO public\.maintenance_requests/);
});
test("maintenance request creation omits the unit column when no unit is selected", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = { query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: [{ id: "m1" }], rowCount: 1 } as QueryResult; } } as unknown as PoolClient;
  await createMaintenanceRequest(client, "e1", "u1", { title: "Leak", description: "Water leak", priority: "normal", unitId: null });
  assert.deepEqual(calls[0].values, ["e1", "u1", "Leak", "Water leak", "normal"]);
  assert.doesNotMatch(calls[0].sql, /unit_id/);
});
