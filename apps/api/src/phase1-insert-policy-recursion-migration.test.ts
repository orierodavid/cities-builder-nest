import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261028140000_phase1_insert_policy_recursion_fix.sql"),
  "utf8",
);

test("enabled-estate checks use a security-definer helper to avoid RLS recursion", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.is_enabled_estate\(target_estate_id uuid\)/);
  assert.match(migration, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.is_enabled_estate\(uuid\) TO authenticated/);
  assert.doesNotMatch(migration, /FROM public\.estates e[\s\S]{0,120}WITH CHECK/);
});

test("all estate-scoped insert policies call the enabled-estate helper", () => {
  assert.match(migration, /CREATE POLICY estate_memberships_insert_authorized[\s\S]*?private\.is_enabled_estate\(estate_memberships\.estate_id\)/);
  assert.match(migration, /CREATE POLICY buildings_insert_manager_same_estate[\s\S]*?private\.is_enabled_estate\(buildings\.estate_id\)/);
  assert.match(migration, /CREATE POLICY units_insert_manager_same_estate[\s\S]*?private\.is_enabled_estate\(units\.estate_id\)/);
  assert.match(migration, /CREATE POLICY resident_units_insert_manager_same_estate[\s\S]*?private\.is_enabled_estate\(resident_units\.estate_id\)/);
});
