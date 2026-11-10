import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261028102324_authorized_estate_create_policies.sql"),
  "utf8",
);

test("estate creation is platform-admin only", () => {
  assert.match(migration, /CREATE POLICY estates_insert_platform_admin[\s\S]*?FOR INSERT TO authenticated[\s\S]*?WITH CHECK \(private\.is_platform_admin\(\)\)/);
});

test("membership creation is limited to active users and authorized estate roles", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.is_active_user\(target_user_id uuid\)/);
  assert.match(migration, /CREATE POLICY estate_memberships_insert_authorized[\s\S]*?FOR INSERT TO authenticated/);
  assert.match(migration, /private\.is_active_user\(estate_memberships\.user_id\)/);
  assert.match(migration, /private\.is_active_estate_manager\(estate_memberships\.estate_id\)[\s\S]*?membership_role = 'resident'[\s\S]*?status = 'active'/);
});

test("building and unit creation are estate-scoped and require an enabled estate", () => {
  assert.match(migration, /CREATE POLICY buildings_insert_manager_same_estate[\s\S]*?private\.is_active_estate_manager\(buildings\.estate_id\)/);
  assert.match(migration, /CREATE POLICY units_insert_manager_same_estate[\s\S]*?private\.is_active_estate_manager\(units\.estate_id\)/);
  assert.match(migration, /b\.id = units\.building_id AND b\.estate_id = units\.estate_id/);
  assert.equal((migration.match(/FOR INSERT TO authenticated/g) ?? []).length, 4);
  assert.doesNotMatch(migration, /FOR ALL TO authenticated/);
});
