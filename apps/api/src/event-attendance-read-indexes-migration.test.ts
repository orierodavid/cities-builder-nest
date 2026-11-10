import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261110160000_event_attendance_read_indexes.sql"),
  "utf8",
);

test("event attendance indexes support ordered guest pages and active invitation reads", () => {
  assert.match(migration, /create index if not exists idx_event_guests_estate_event_name\s+on public\.estate_event_guests \(estate_id, event_id, guest_name, id\)/i);
  assert.match(migration, /create index if not exists idx_event_invitations_estate_event_active_guest\s+on public\.estate_event_invitations \(estate_id, event_id, guest_id\)\s+where status = 'active'/i);
});
