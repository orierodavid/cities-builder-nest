import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261110130000_dashboard_unit_count_index.sql"),
  "utf8",
);

test("estate dashboard unit counts have a composite estate/status index", () => {
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_units_estate_status_dashboard\s+ON public\.units \(estate_id, status\)/i,
  );
});
