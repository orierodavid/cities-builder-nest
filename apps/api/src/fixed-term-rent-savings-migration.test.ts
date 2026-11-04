import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");
const migration = readFileSync(resolve(root, "20261104090000_fixed_term_rent_savings_goals.sql"), "utf8");

test("rent savings goals are restricted to three- or six-month terms", () => {
  assert.match(migration, /duration_months IN \(3, 6\)/);
  assert.match(migration, /NEW\.duration_months NOT IN \(3, 6\)/);
});

test("the database calculates the due date from the server-side start date", () => {
  assert.match(migration, /NEW\.target_date := \(CURRENT_DATE \+ make_interval\(months => NEW\.duration_months\)\)::date/);
});

test("goal duration, start and due date cannot be changed after creation", () => {
  assert.match(migration, /savings_goal_term_is_immutable/);
  assert.match(migration, /NEW\.duration_months IS DISTINCT FROM OLD\.duration_months/);
  assert.match(migration, /NEW\.target_date IS DISTINCT FROM OLD\.target_date/);
});

test("resident updates cannot pause or cancel a started goal", () => {
  assert.match(migration, /savings_goal_cannot_be_paused_or_cancelled_and_must_run_full_term/);
  assert.doesNotMatch(migration, /OLD\.status = 'active' AND NEW\.status IN \('paused', 'cancelled'\)/);
});

test("completion is only allowed after the fixed due date", () => {
  assert.match(migration, /OLD\.status = 'active' AND NEW\.status = 'completed'[\s\S]*?CURRENT_DATE >= OLD\.target_date/);
});

test("owner, estate membership and positive NGN amount checks remain enforced", () => {
  assert.match(migration, /savings_goal_owner_immutable/);
  assert.match(migration, /active_resident_membership_required_for_estate_goal/);
  assert.match(migration, /NEW\.target_amount_kobo <= 0 OR NEW\.currency <> 'NGN'/);
});
