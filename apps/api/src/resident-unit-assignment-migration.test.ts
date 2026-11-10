import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261028101846_resident_unit_assignment_rls.sql");

test("resident unit assignment INSERT is restricted to managers or platform admins in the same enabled estate", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE POLICY resident_units_insert_manager_same_estate/);
  assert.match(sql, /FOR INSERT\s+TO authenticated/);
  assert.match(sql, /private\.is_platform_admin\(\)/);
  assert.match(sql, /private\.is_active_estate_manager\(resident_units\.estate_id\)/);
  assert.match(sql, /e\.is_enabled = true/);
  assert.match(sql, /m\.estate_id = resident_units\.estate_id/);
  assert.match(sql, /m\.user_id = resident_units\.resident_user_id/);
  assert.match(sql, /m\.membership_role = 'resident'/);
  assert.match(sql, /m\.status = 'active'/);
  assert.match(sql, /u\.id = resident_units\.unit_id/);
  assert.match(sql, /u\.estate_id = resident_units\.estate_id/);
  assert.doesNotMatch(sql, /FOR ALL/);
});
