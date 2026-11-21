import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261122120000_enforce_legal_acceptance_at_database_layer.sql"),
  "utf8",
);

test("current legal acceptance is enforced as a restrictive policy on every RLS-enabled public table", () => {
  assert.match(migration, /n\.nspname = 'public'/i);
  assert.match(migration, /c\.relrowsecurity/i);
  assert.match(migration, /as restrictive for all to authenticated/i);
  assert.match(migration, /using \(public\.current_user_has_required_legal_consent\(\)\)/i);
  assert.match(migration, /with check \(public\.current_user_has_required_legal_consent\(\)\)/i);
});

test("policy creation is repeatable and leaves consent RPCs available for the acceptance flow", () => {
  assert.match(migration, /drop policy if exists require_current_legal_consent/i);
  assert.match(migration, /create policy require_current_legal_consent/i);
  assert.match(migration, /to authenticated/i);
  assert.match(migration, /SECURITY DEFINER consent RPCs remain usable/i);
});
