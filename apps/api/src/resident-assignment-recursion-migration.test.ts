import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261028150000_resident_assignment_recursion_fix.sql"),
  "utf8",
);

test("resident assignment membership and unit checks use security-definer helpers", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.has_active_resident_membership\(\s*target_estate_id uuid,\s*target_user_id uuid\s*\)[\s\S]*?SECURITY DEFINER/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.unit_belongs_to_estate\(\s*target_unit_id uuid,\s*target_estate_id uuid\s*\)[\s\S]*?SECURITY DEFINER/);
  assert.match(migration, /private\.has_active_resident_membership\(\s*resident_units\.estate_id,\s*resident_units\.resident_user_id\s*\)/);
  assert.match(migration, /private\.unit_belongs_to_estate\(\s*resident_units\.unit_id,\s*resident_units\.estate_id\s*\)/);
  assert.doesNotMatch(migration, /FROM public\.estate_memberships m[\s\S]*?CREATE POLICY resident_units_insert_manager_same_estate/);
  assert.doesNotMatch(migration, /FROM public\.units u[\s\S]*?CREATE POLICY resident_units_insert_manager_same_estate/);
});
