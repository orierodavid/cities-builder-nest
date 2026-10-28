import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "server.ts");
const singleUseMigrationPath = resolve(here, "../../../supabase/migrations/20261028020000_visitor_pass_single_use.sql");
const lifecycleMigrationPath = resolve(here, "../../../supabase/migrations/20261028020100_visitor_pass_lifecycle_guards.sql");

test("visitor pass creation and gate endpoints keep role checks and estate scoping", async () => {
  const server = await readFile(serverPath, "utf8");
  assert.match(server, /canCreateVisitorPass\(membership, estateId\)/);
  assert.match(server, /canUseGateWorkflow\(membership, estateId\)/);
  assert.match(server, /\.eq\("estate_id", estateId\)\.eq\("access_code_hash", hash\)/);
  assert.match(server, /\.eq\("id", visitId\)\.eq\("estate_id", estateId\)\.is\("checked_out_at", null\)/);
  assert.match(server, /if \(!isValidVisitorAccessCode\(accessCode\)\)/);
});

test("database migrations enforce single use and pass validity at the database boundary", async () => {
  const singleUse = await readFile(singleUseMigrationPath, "utf8");
  const lifecycle = await readFile(lifecycleMigrationPath, "utf8");
  assert.match(singleUse, /CREATE UNIQUE INDEX IF NOT EXISTS visitor_visits_one_entry_per_pass/i);
  assert.match(singleUse, /ON public\.visitor_visits \(visitor_pass_id\)/i);
  assert.match(lifecycle, /p\.estate_id = NEW\.estate_id/);
  assert.match(lifecycle, /p\.status = 'active'/);
  assert.match(lifecycle, /p\.valid_from <= now\(\)/);
  assert.match(lifecycle, /p\.valid_until > now\(\)/);
  assert.match(lifecycle, /e\.id = NEW\.estate_id AND e\.is_enabled = true/);
  assert.match(lifecycle, /visitor_pass_consume_on_check_in/);
});

test("checkout stays estate-scoped and can only close an open visit once", async () => {
  const server = await readFile(serverPath, "utf8");
  const start = server.indexOf('app.post("/v1/estates/:estateId/gate/visits/:visitId/check-out"');
  assert.notEqual(start, -1);
  const end = server.indexOf('\napp.get("/v1/me"', start);
  assert.notEqual(end, -1);
  const checkoutRoute = server.slice(start, end);
  assert.match(checkoutRoute, /canUseGateWorkflow\(membership, estateId\)/);
  assert.match(checkoutRoute, /\.eq\("id", visitId\)\.eq\("estate_id", estateId\)\.is\("checked_out_at", null\)/);
  assert.match(checkoutRoute, /res\.status\(409\)\.json\(\{ error: "open_visit_not_found_or_checkout_failed" \}\)/);
});
