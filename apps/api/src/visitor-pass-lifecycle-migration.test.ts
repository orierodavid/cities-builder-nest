import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../database/migrations/017_visitor_pass_lifecycle_guards.sql");

test("check-in consumes only an active, unexpired pass for the same enabled estate", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /e\.id = NEW\.estate_id AND e\.is_enabled = true/);
  assert.match(sql, /p\.id = NEW\.visitor_pass_id/);
  assert.match(sql, /p\.estate_id = NEW\.estate_id/);
  assert.match(sql, /p\.status = 'active'/);
  assert.match(sql, /p\.valid_from <= now\(\)/);
  assert.match(sql, /p\.valid_until > now\(\)/);
  assert.match(sql, /SET status = 'used'/);
  assert.match(sql, /visitor_pass_consume_on_check_in/);
});

test("pass creation rejects disabled estates and lifecycle guards fail closed", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /visitor_pass_enabled_estate_guard/);
  assert.equal((sql.match(/USING ERRCODE = '23514'/g) ?? []).length, 3);
});
