import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261028112454_phase4_savings_goal_guards.sql"),
  "utf8",
);

test("savings-goal guard uses a locked-down SECURITY DEFINER function", () => {
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.guard_resident_savings_goal\(\) FROM PUBLIC, anon, authenticated/i);
});

test("client inserts must use auth.uid and start active", () => {
  assert.match(migration, /NEW\.resident_user_id IS DISTINCT FROM actor_id/);
  assert.match(migration, /NEW\.status <> 'active'/);
});

test("estate-linked goals require an active resident membership", () => {
  assert.match(migration, /m\.estate_id = NEW\.estate_id[\s\S]*?m\.user_id = actor_id[\s\S]*?m\.membership_role = 'resident'[\s\S]*?m\.status = 'active'/);
});

test("owner and estate cannot be reassigned and client transitions are restricted", () => {
  assert.match(migration, /savings_goal_owner_immutable/);
  assert.match(migration, /savings_goal_estate_immutable/);
  assert.match(migration, /invalid_savings_goal_status_transition/);
  assert.match(migration, /OLD\.status = 'active' AND NEW\.status IN \('paused', 'cancelled'\)/);
  assert.match(migration, /OLD\.status = 'paused' AND NEW\.status IN \('active', 'cancelled'\)/);
});

test("positive NGN amounts are required and no finance table grants are added", () => {
  assert.match(migration, /NEW\.target_amount_kobo <= 0 OR NEW\.currency <> 'NGN'/);
  assert.doesNotMatch(migration, /GRANT\s+.*ON TABLE\s+public\.(payment_intents|withdrawal_requests|ledger_transactions)/i);
});
