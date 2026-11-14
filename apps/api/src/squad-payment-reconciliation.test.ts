import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const migration = readFileSync(resolve(root, "supabase/migrations/20261110190000_squad_payment_reconciliation.sql"), "utf8");
const reconciler = readFileSync(resolve(root, "supabase/functions/reconcile-squad-payments/index.ts"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/deploy-squad-payment-webhook.yml"), "utf8");
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");

test("pending payment reconciliation has bounded, indexed retry selection", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_reconciled_at/);
  assert.match(migration, /WHERE status = 'pending'/);
  assert.match(reconciler, /\.lt\("created_at", staleBefore\)/);
  assert.match(reconciler, /last_reconciled_at\.is\.null/);
  assert.match(reconciler, /\.limit\(50\)/);
});

test("reconciliation requires a separate secret and verifies the provider transaction", () => {
  assert.match(reconciler, /PAYMENT_RECONCILIATION_SECRET/);
  assert.match(reconciler, /x-reconciliation-secret/);
  assert.match(reconciler, /transaction\/verify/);
  assert.match(reconciler, /AbortSignal\.timeout\(10_000\)/);
});

test("reconciliation validates reference, exact NGN amount and resident email", () => {
  assert.match(reconciler, /amount !== ledgerAmount/);
  assert.match(reconciler, /currency !== "NGN"/);
  assert.match(reconciler, /reference !== row\.provider_reference/);
  assert.match(reconciler, /emailMatches/);
});

test("reconciliation state transitions are conditional on pending status", () => {
  assert.match(reconciler, /\.eq\("status", "pending"\)/);
  assert.match(reconciler, /status: "successful"/);
  assert.match(reconciler, /status: "failed"/);
});

test("the payment deployment workflow type-checks and deploys the reconciler", () => {
  assert.match(workflow, /reconcile-squad-payments/);
  assert.match(config, /\[functions\.reconcile-squad-payments\][\s\S]*?verify_jwt = false/);
});


test("an uncreated Squad reference is only failed after the 15-minute safety window", () => {
  assert.match(reconciler, /response\.status === 400/);
  assert.match(reconciler, /status === "not_found"/);
  assert.match(reconciler, /ageMs >= 15 \* 60_000/);
  assert.match(reconciler, /status: "failed", verified_at: attemptedAt/);
});
