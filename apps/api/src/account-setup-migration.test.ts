import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261110180000_atomic_estate_account_provisioning.sql");

test("estate account provisioning is an authenticated, narrowly granted security-definer operation", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_estate_account_membership/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /actor_id uuid := auth\.uid\(\)/);
  assert.match(sql, /public\.current_user_has_required_legal_consent\(\)/);
  assert.match(sql, /private\.is_active_estate_manager\(target_estate_id\)/);
  assert.match(sql, /private\.is_platform_admin\(\)/);
  assert.match(sql, /target_role = 'estate_admin' AND NOT is_admin/);
  assert.match(sql, /INSERT INTO public\.estate_memberships/);
  assert.match(sql, /INSERT INTO public\.resident_units/);
  assert.match(sql, /UPDATE public\.units AS target\s+SET status = 'occupied'/);
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.create_estate_account_membership(uuid, uuid, text, text, uuid) FROM PUBLIC, anon"));
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.create_estate_account_membership(uuid, uuid, text, text, uuid) TO authenticated"));
});

test("resident account provisioning locks the selected unit and prevents duplicate active assignments", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /WHERE u\.id = target_unit_id AND u\.estate_id = target_estate_id\s+FOR UPDATE/);
  assert.match(sql, /WHERE ru\.unit_id = target_unit_id AND ru\.end_date IS NULL\s+FOR UPDATE/);
  assert.match(sql, /RAISE EXCEPTION 'unit already assigned'/);
});
