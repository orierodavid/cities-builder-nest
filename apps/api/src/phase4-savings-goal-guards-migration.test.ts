import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261028120000_phase4_savings_goal_guards.sql", import.meta.url),
  "utf8",
);

describe("Phase 4 savings-goal guard migration", () => {
  it("uses a locked-down SECURITY DEFINER function with an empty search path", () => {
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION private\.guard_resident_savings_goal\(\) FROM PUBLIC, anon, authenticated/i);
  });
  it("binds client inserts to auth.uid and requires initial active status", () => {
    expect(migration).toMatch(/NEW\.resident_user_id IS DISTINCT FROM actor_id/);
    expect(migration).toMatch(/NEW\.status <> 'active'/);
  });
  it("requires an active resident membership for estate-linked goals", () => {
    expect(migration).toMatch(/m\.estate_id = NEW\.estate_id[\s\S]*?m\.user_id = actor_id[\s\S]*?m\.membership_role = 'resident'[\s\S]*?m\.status = 'active'/);
  });
  it("prevents owner and estate reassignment and disallows client-side completion", () => {
    expect(migration).toMatch(/savings_goal_owner_immutable/);
    expect(migration).toMatch(/savings_goal_estate_immutable/);
    expect(migration).toMatch(/invalid_savings_goal_status_transition/);
    expect(migration).toMatch(/OLD\.status = 'active' AND NEW\.status IN \('paused', 'cancelled'\)/);
    expect(migration).toMatch(/OLD\.status = 'paused' AND NEW\.status IN \('active', 'cancelled'\)/);
  });
  it("keeps amounts positive and currency NGN and never enables finance writes", () => {
    expect(migration).toMatch(/NEW\.target_amount_kobo <= 0 OR NEW\.currency <> 'NGN'/);
    expect(migration).not.toMatch(/GRANT\s+.*ON TABLE\s+public\.(payment_intents|withdrawal_requests|ledger_transactions)/i);
  });
});
