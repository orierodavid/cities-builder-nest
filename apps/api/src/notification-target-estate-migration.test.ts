import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261108204251_notification_target_estate_validation.sql"),
  "utf8",
);

test("resident notification RPC rejects missing and disabled estate targets", () => {
  assert.match(migration, /where not exists\s*\(\s*select 1 from public\.estates e\s*where e\.id = requested\.estate_id and e\.is_enabled = true\s*\)/i);
  assert.match(migration, /estate_target_unavailable/);
  assert.match(migration, /duplicate_or_null_estate_targets/);
});

test("resident notification RPC still restricts managers to active memberships", () => {
  assert.match(migration, /em\.estate_id = requested\.estate_id[\s\S]*?em\.user_id = v_actor[\s\S]*?em\.status = 'active'[\s\S]*?em\.membership_role in \('facility_manager', 'estate_manager', 'estate_admin'\)/i);
});
