import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261028130000_resident_candidate_lookup_rpc.sql"),
  "utf8",
);
const hardeningMigration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261108220000_resident_candidate_lookup_estate_scope.sql"),
  "utf8",
);

test("resident candidate RPC is restricted to an explicitly requested active user in an enabled authorized estate", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\\.get_active_resident_candidate\\(/);
  assert.match(migration, /SECURITY DEFINER[\\s\\S]*?SET search_path = ''/);
  assert.match(migration, /u\\.id = target_user_id[\\s\\S]*?u\\.is_active = true[\\s\\S]*?e\\.is_enabled = true/);
  assert.match(migration, /private\\.is_platform_admin\\(\\)[\\s\\S]*?private\\.is_active_estate_manager\\(target_estate_id\\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\\.get_active_resident_candidate\\(uuid, uuid\\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\\.get_active_resident_candidate\\(uuid, uuid\\) TO authenticated/);
});

test("resident candidate lookup requires active resident membership in the same estate", () => {
  assert.match(hardeningMigration, /em\\.estate_id = target_estate_id/);
  assert.match(hardeningMigration, /em\\.user_id = target_user_id/);
  assert.match(hardeningMigration, /em\\.membership_role = 'resident'/);
  assert.match(hardeningMigration, /em\\.status = 'active'/);
  assert.match(hardeningMigration, /private\\.is_active_estate_manager\\(target_estate_id\\)/);
});
