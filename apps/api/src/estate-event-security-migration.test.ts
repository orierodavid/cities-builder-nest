import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261110190000_security_event_invitation_verification.sql");

test("security invitation verification is limited to authenticated security staff in an enabled estate", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /actor_id uuid := auth\.uid\(\)/);
  assert.match(sql, /m\.membership_role = 'security'/);
  assert.match(sql, /m\.status = 'active'/);
  assert.match(sql, /e\.is_enabled = true/);
  assert.match(sql, /public\.current_user_has_required_legal_consent\(\)/);
});

test("verification only returns scoped event, active invitation, guest and prior check-in data", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /i\.estate_id = target_estate_id/);
  assert.match(sql, /i\.event_id = target_event_id/);
  assert.match(sql, /i\.code_hash = target_code_hash/);
  assert.match(sql, /i\.status = 'active'/);
  assert.match(sql, /g\.id = invitation_row\.guest_id/);
  assert.match(sql, /c\.guest_id = guest_row\.id/);
  assert.match(sql, /'already_checked_in'/);
  assert.match(sql, /'venue_pending'/);
  assert.match(sql, /'event_not_open'/);
});

test("security verification function cannot be called by anonymous or public roles", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.verify_estate_event_invitation_for_security(uuid, uuid, text) FROM PUBLIC, anon"));
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.verify_estate_event_invitation_for_security(uuid, uuid, text) TO authenticated"));
});
