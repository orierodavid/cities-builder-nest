import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261110170000_dashboard_event_query_indexes.sql"),
  "utf8",
);

test("dashboard and event page indexes match their estate-scoped filters and ordering", () => {
  assert.match(migration, /idx_announcements_estate_published_dashboard\s+ON public\.announcements \(estate_id, published_at DESC\)\s+WHERE published_at IS NOT NULL/i);
  assert.match(migration, /idx_maintenance_requests_estate_open_dashboard\s+ON public\.maintenance_requests \(estate_id, created_at DESC\)\s+WHERE status NOT IN \('resolved', 'closed'\)/i);
  assert.match(migration, /idx_estate_events_estate_creator_page\s+ON public\.estate_events \(estate_id, created_by, starts_at, id\)/i);
});
