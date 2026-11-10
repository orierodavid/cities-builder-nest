import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { getMeData } from "./me.repository.js";

test("current-user repository preserves profile and nested estate/unit response shape", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const responses: unknown[][] = [
    [{
      id: userId,
      full_name: "Resident One",
      phone_e164: null,
      home_number: "12B",
      street_name: "Palm Street",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    }],
    [{ role: "platform_admin" }],
    [{
      id: "membership-1",
      estate_id: "estate-1",
      membership_role: "resident",
      status: "active",
      estate: { name: "Estate One", address: "1 Road", city: "Lagos", state: "Lagos" },
    }],
    [{
      unit_id: "unit-1",
      start_date: "2026-01-01",
      end_date: null,
      units: {
        unit_code: "12B",
        unit_type: "flat",
        building_id: "building-1",
        buildings: {
          name: "Block A",
          estate_id: "estate-1",
          estates: { name: "Estate One" },
        },
      },
    }],
  ];

  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: responses[calls.length - 1] ?? [], rowCount: 0 } as QueryResult;
    },
  } as unknown as PoolClient;

  const result = await getMeData(client, userId);

  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.values[0] === userId));
  assert.match(calls[0].sql, /FROM public\.users/);
  assert.match(calls[2].sql, /LEFT JOIN public\.estates/);
  assert.match(calls[3].sql, /ru\.end_date IS NULL/);
  assert.equal(result.profile?.home_number, "12B");
  assert.deepEqual(result.globalRoles, ["platform_admin"]);
  assert.deepEqual(result.estateMemberships[0].estates, {
    name: "Estate One",
    address: "1 Road",
    city: "Lagos",
    state: "Lagos",
  });
  assert.deepEqual(result.residentUnits[0].units?.buildings?.estates, { name: "Estate One" });
});

test("current-user repository returns null profile and empty relationship lists when no rows are visible", async () => {
  const client = {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as PoolClient;

  const result = await getMeData(client, "22222222-2222-4222-8222-222222222222");
  assert.equal(result.profile, null);
  assert.deepEqual(result.globalRoles, []);
  assert.deepEqual(result.estateMemberships, []);
  assert.deepEqual(result.residentUnits, []);
});
