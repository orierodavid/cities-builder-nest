import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Supabase migrations use unique 14-digit ordered version identifiers", () => {
  const directory = resolve(process.cwd(), "../../supabase/migrations");
  const files = readdirSync(directory).filter((file) => file.endsWith(".sql"));
  assert.ok(files.length > 0, "Supabase migration directory must not be empty");
  const versions = files.map((file) => {
    const match = file.match(/^(\d{14})_.+\.sql$/);
    assert.ok(match, `Migration filename must start with a 14-digit version: ${file}`);
    return match[1];
  });
  assert.equal(new Set(versions).size, versions.length, "Migration version prefixes must be unique");
});
