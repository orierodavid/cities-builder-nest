import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult } from "pg";
import { createVisitorPass, updateVisitorPassStatus } from "./visitor-pass-mutations.repository.js";

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

test("visitor pass status changes lock the host-owned pass and update only its status", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (calls.length === 1) return { rows: [{ id: "pass-1", status: "active", valid_until: "2999-01-01T00:00:00.000Z" }], rowCount: 1 } as QueryResult;
      return { rows: [{ id: "pass-1", status: "revoked", valid_until: "2999-01-01T00:00:00.000Z" }], rowCount: 1 } as QueryResult;
    },
  } as unknown as PoolClient;
  const result = await updateVisitorPassStatus(client, {
    estateId: "estate-1", passId: "pass-1", hostUserId: "resident-1", targetStatus: "revoked",
  });
  assert.deepEqual(result, { kind: "updated", pass: { id: "pass-1", status: "revoked", valid_until: "2999-01-01T00:00:00.000Z" } });
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.deepEqual(calls[0].values, ["pass-1", "estate-1", "resident-1"]);
  assert.match(calls[1].sql, /SET status = \$4/);
  assert.match(calls[1].sql, /valid_until > now\(\)/);
  assert.deepEqual(calls[1].values, ["pass-1", "estate-1", "resident-1", "revoked", "active"]);
});

test("visitor pass status changes refuse expired and consumed passes", async () => {
  const makeClient = (status: string, validUntil: string) => ({
    query: async () => ({ rows: [{ id: "pass-1", status, valid_until: validUntil }], rowCount: 1 }) as QueryResult,
  } as unknown as PoolClient);
  assert.deepEqual(await updateVisitorPassStatus(makeClient("used", "2999-01-01T00:00:00.000Z"), {
    estateId: "estate-1", passId: "pass-1", hostUserId: "resident-1", targetStatus: "active",
  }), { kind: "not_reactivatable" });
  assert.deepEqual(await updateVisitorPassStatus(makeClient("revoked", "2000-01-01T00:00:00.000Z"), {
    estateId: "estate-1", passId: "pass-1", hostUserId: "resident-1", targetStatus: "active",
  }), { kind: "expired" });
});
