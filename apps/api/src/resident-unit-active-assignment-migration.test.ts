import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261110220000_resident_unit_active_assignment_unique.sql");

test("only one active resident assignment can exist for a unit", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS resident_units_one_active_assignment_per_unit_idx/);
  assert.match(sql, /ON public\.resident_units \(unit_id\)/);
  assert.match(sql, /WHERE end_date IS NULL/);
});
