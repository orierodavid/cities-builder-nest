import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { createVisitorPass } from "./visitor-pass-mutations.repository.js";

test("visitor pass creation is parameterized and returns no encrypted access-code material", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const row = { id: "pass-1", estate_id: "estate-1", visitor_name: "Guest", valid_from: "from", valid_until: "until", status: "active", created_at: "now" };
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: [row], rowCount: 1 } as QueryResult;
    },
  } as unknown as PoolClient;
  const result = await createVisitorPass(client, {
    estateId: "estate-1", hostUserId: "resident-1", visitorName: "Guest", visitorPhone: null,
    accessCodeHash: "a".repeat(64), accessCodeCiphertext: "encrypted", validFrom: "from", validUntil: "until",
  });
  assert.deepEqual(result, row);
  assert.deepEqual(calls[0].values, ["estate-1", "resident-1", "Guest", null, "a".repeat(64), "encrypted", "from", "until"]);
  assert.match(calls[0].sql, /INSERT INTO public\.visitor_passes/);
  assert.doesNotMatch(calls[0].sql, /RETURNING[^;]*access_code_ciphertext/i);
});
