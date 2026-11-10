import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261102081313_legal_consents_and_virtual_accounts.sql"),
  "utf8",
);

test("legal documents are versioned and published versions cannot overlap", () => {
  assert.match(migration, /unique \(document_type, version\)/i);
  assert.match(migration, /legal_documents_one_published_version/i);
  assert.match(migration, /published_legal_versions_are_immutable/);
});

test("acceptance records identify the user, immutable document version, timestamp and source", () => {
  assert.match(migration, /create table if not exists public\.user_consents/i);
  assert.match(migration, /legal_document_id uuid not null references public\.legal_documents\(id\) on delete restrict/i);
  assert.match(migration, /document_version text not null/i);
  assert.match(migration, /accepted_at timestamptz not null default now\(\)/i);
  assert.match(migration, /source text not null check \(source in \('web', 'mobile'\)\)/i);
  assert.match(migration, /create or replace function public\.accept_legal_documents/i);
});

test("current consent is enforced by restrictive RLS policies across application tables", () => {
  assert.match(migration, /create or replace function public\.current_user_has_required_legal_consent/i);
  assert.match(migration, /as restrictive for all to authenticated using \(public\.current_user_has_required_legal_consent\(\)\)/i);
  assert.match(migration, /'resident', 'facility_manager', 'estate_manager', 'estate_admin'/);
});

test("cookie preferences keep essential storage mandatory and optional categories separate", () => {
  assert.match(migration, /essential boolean not null default true check \(essential = true\)/i);
  assert.match(migration, /analytics boolean not null default false/i);
  assert.match(migration, /marketing boolean not null default false/i);
});

test("virtual account rows are unique per resident and estate and clients cannot write provider results", () => {
  assert.match(migration, /unique \(resident_user_id, estate_id\)/i);
  assert.match(migration, /idempotency_key text not null unique/i);
  assert.match(migration, /revoke insert, update, delete on public\.resident_virtual_accounts from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant\s+insert\s+on\s+public\.service_charge_payments/i);
});
