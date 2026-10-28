import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../database/migrations/016_visitor_pass_lifecycle_guards.sql");

test("database migration makes visitor passes single-use, estate-scoped, and validity-checked", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS visitor_visits_one_visit_per_pass/);
  assert.match(sql, /p\.estate_id = NEW\.estate_id/);
  assert.match(sql, /p\.status = 'active'/);
  assert.match(sql, /p\.valid_from <= now\(\)/);
  assert.match(sql, /p\.valid_until > now\(\)/);
  assert.match(sql, /SET status = 'used'/);
  assert.match(sql, /e\.is_enabled = true/);
  assert.match(sql, /visitor_pass_consume_on_check_in/);
  assert.match(sql, /visitor_pass_enabled_estate_guard/);
});

test("lifecycle guard fails closed with a check-constraint SQLSTATE", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.equal((sql.match(/USING ERRCODE = '23514'/g) ?? []).length, 2);
});
