import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const dedup = read("supabase/migrations/20261108201859_squad_service_charge_payment_dedup.sql");
const initiate = read("supabase/functions/initiate-squad-payment/index.ts");
const webhook = read("supabase/functions/squad-payment-webhook/index.ts");
const verify = read("supabase/functions/verify-squad-payment/index.ts");

test("service charges serialize payment attempts and reject a second active record", () => {
  assert.match(dedup, /pg_advisory_xact_lock/);
  assert.match(dedup, /existing\.status IN \('pending', 'successful'\)/);
  assert.match(dedup, /active_service_charge_payment_already_exists/);
  assert.match(dedup, /CREATE UNIQUE INDEX IF NOT EXISTS service_charge_payments_one_pending_attempt_idx[\s\S]*?WHERE status = 'pending'/);
});

test("service charge initiation rejects unsafe database amounts", () => {
  assert.match(initiate, /Number\.isSafeInteger\(amountKobo\).*amountKobo<=0/);
});

test("webhook rejects ambiguous references and unsafe ledger amounts", () => {
  assert.match(webhook, /if\(serviceRow&&rentRow\)return reply\(409/);
  assert.match(webhook, /Number\.isSafeInteger\(Number\(row\.amount_kobo\)\)/);
});

test("resident verification rejects ambiguous references and unsafe ledger amounts", () => {
  assert.match(verify, /if \(serviceRow && rentRow\) return reply\(409/);
  assert.match(verify, /Number\.isSafeInteger\(Number\(row\.amount_kobo\)\)/);
});

test("a failed verification reports the final ledger state after a concurrent callback", () => {
  assert.match(verify, /select\("status"\).*maybeSingle\(\)/);
  assert.match(verify, /current\.status === "failed" \|\| current\.status === "reversed"/);
});
