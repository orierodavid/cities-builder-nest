import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261110150000_event_attendance_summary_rpc.sql"),
  "utf8",
);

test("event attendance summaries aggregate counts in PostgreSQL under caller RLS", () => {
  assert.match(migration, /create or replace function public\.get_event_attendance_summaries/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /public\.estate_event_guests/i);
  assert.match(migration, /public\.estate_event_checkins/i);
  assert.match(migration, /public\.estate_event_invitations/i);
  assert.match(migration, /i\.status = 'active'/i);
  assert.match(migration, /grant execute on function public\.get_event_attendance_summaries\(uuid, uuid\[\]\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.get_event_attendance_summaries\(uuid, uuid\[\]\) from public, anon/i);
});
