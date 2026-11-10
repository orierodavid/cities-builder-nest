import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const singleUseMigrationPath = resolve(here, "../../../supabase/migrations/20261028095151_visitor_pass_single_use.sql");
const lifecycleMigrationPath = resolve(here, "../../../supabase/migrations/20261028095159_visitor_pass_lifecycle_guards.sql");
const databaseUrl = process.env.VISITOR_LIFECYCLE_TEST_DATABASE_URL;

test("PostgreSQL enforces visitor pass lifecycle, estate boundaries, and single use", {
  skip: !databaseUrl ? "Set VISITOR_LIFECYCLE_TEST_DATABASE_URL only for an isolated disposable PostgreSQL database." : false,
}, async () => {
  assert.ok(databaseUrl);
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    ["localhost", "127.0.0.1", "::1", "postgres"].includes(hostname),
    "Refusing to run destructive lifecycle fixtures against a non-local database host.",
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    // This test is enabled only for a dedicated disposable CI PostgreSQL service.
    await pool.query(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DROP TABLE IF EXISTS public.visitor_visits CASCADE;
      DROP TABLE IF EXISTS public.visitor_passes CASCADE;
      DROP TABLE IF EXISTS public.estates CASCADE;
      DROP SCHEMA IF EXISTS private CASCADE;
      CREATE SCHEMA private;
      CREATE TABLE public.estates (
        id uuid PRIMARY KEY,
        is_enabled boolean NOT NULL
      );
      CREATE TABLE public.visitor_passes (
        id uuid PRIMARY KEY,
        estate_id uuid NOT NULL,
        status text NOT NULL CHECK (status IN ('active', 'used', 'expired', 'revoked')),
        valid_from timestamptz NOT NULL,
        valid_until timestamptz NOT NULL
      );
      CREATE TABLE public.visitor_visits (
        id uuid PRIMARY KEY,
        estate_id uuid NOT NULL,
        visitor_pass_id uuid NOT NULL,
        checked_in_by uuid NOT NULL,
        checked_in_at timestamptz NOT NULL DEFAULT now(),
        checked_out_by uuid,
        checked_out_at timestamptz,
        CHECK ((checked_out_by IS NULL) = (checked_out_at IS NULL))
      );
    `);

    await pool.query(await readFile(singleUseMigrationPath, "utf8"));
    await pool.query(await readFile(lifecycleMigrationPath, "utf8"));

    const estateA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const estateB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const securityUser = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await pool.query("INSERT INTO public.estates (id, is_enabled) VALUES ($1, true), ($2, true), ($3, false)", [
      estateA, estateB, "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ]);

    const insertPass = async (id: string, estateId: string, status = "active", from = "-1 minute", until = "+1 hour") => {
      await pool.query(
        "INSERT INTO public.visitor_passes (id, estate_id, status, valid_from, valid_until) VALUES ($1, $2, $3, now() + $4::interval, now() + $5::interval)",
        [id, estateId, status, from, until],
      );
    };
    const insertVisit = (id: string, estateId: string, passId: string) => pool.query(
      "INSERT INTO public.visitor_visits (id, estate_id, visitor_pass_id, checked_in_by) VALUES ($1, $2, $3, $4)",
      [id, estateId, passId, securityUser],
    );
    const expectSqlState = async (operation: () => Promise<unknown>, expected: string) => {
      let actual: unknown;
      try {
        await operation();
      } catch (error) {
        actual = error;
      }
      assert.ok(actual instanceof Error, `Expected PostgreSQL SQLSTATE ${expected}`);
      assert.equal((actual as Error & { code?: string }).code, expected);
    };

    const passA = "11111111-1111-4111-8111-111111111111";
    await insertPass(passA, estateA);
    await insertVisit("21111111-1111-4111-8111-111111111111", estateA, passA);
    const consumed = await pool.query("SELECT status FROM public.visitor_passes WHERE id = $1", [passA]);
    assert.equal(consumed.rows[0]?.status, "used");

    const visitA = "21111111-1111-4111-8111-111111111111";
    const crossEstateCheckout = await pool.query(
      "UPDATE public.visitor_visits SET checked_out_by = $1, checked_out_at = now() WHERE id = $2 AND estate_id = $3 AND checked_out_at IS NULL RETURNING id",
      [securityUser, visitA, estateB],
    );
    assert.equal(crossEstateCheckout.rowCount, 0, "A visit cannot be checked out through another estate.");

    const firstCheckout = await pool.query(
      "UPDATE public.visitor_visits SET checked_out_by = $1, checked_out_at = now() WHERE id = $2 AND estate_id = $3 AND checked_out_at IS NULL RETURNING id",
      [securityUser, visitA, estateA],
    );
    assert.equal(firstCheckout.rowCount, 1, "An open visit can be checked out once.");

    const repeatedCheckout = await pool.query(
      "UPDATE public.visitor_visits SET checked_out_by = $1, checked_out_at = now() WHERE id = $2 AND estate_id = $3 AND checked_out_at IS NULL RETURNING id",
      [securityUser, visitA, estateA],
    );
    assert.equal(repeatedCheckout.rowCount, 0, "A checked-out visit cannot be checked out again.");

    await expectSqlState(
      () => insertVisit("31111111-1111-4111-8111-111111111111", estateA, passA),
      "23505",
    );

    const expiredPass = "12222222-2222-4222-8222-222222222222";
    await insertPass(expiredPass, estateA, "active", "-2 hours", "-1 hour");
    await expectSqlState(
      () => insertVisit("22222222-2222-4222-8222-222222222222", estateA, expiredPass),
      "23514",
    );

    const revokedPass = "13333333-3333-4333-8333-333333333333";
    await insertPass(revokedPass, estateA, "revoked");
    await expectSqlState(
      () => insertVisit("23333333-3333-4333-8333-333333333333", estateA, revokedPass),
      "23514",
    );

    const crossEstatePass = "14444444-4444-4444-8444-444444444444";
    await insertPass(crossEstatePass, estateA);
    await expectSqlState(
      () => insertVisit("24444444-4444-4444-8444-444444444444", estateB, crossEstatePass),
      "23514",
    );

    await expectSqlState(
      () => pool.query(
        "INSERT INTO public.visitor_passes (id, estate_id, status, valid_from, valid_until) VALUES ($1, $2, 'active', now(), now() + interval '1 hour')",
        ["15555555-5555-4555-8555-555555555555", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
      ),
      "55000",
    );

    const concurrentPass = "16666666-6666-4666-8666-666666666666";
    await insertPass(concurrentPass, estateA);
    const concurrentResults = await Promise.allSettled([
      insertVisit("26666666-6666-4666-8666-666666666666", estateA, concurrentPass),
      insertVisit("36666666-6666-4666-8666-666666666666", estateA, concurrentPass),
    ]);
    assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = concurrentResults.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.equal((rejected.reason as Error & { code?: string }).code, "23505");
    const visits = await pool.query("SELECT count(*)::int AS count FROM public.visitor_visits WHERE visitor_pass_id = $1", [concurrentPass]);
    assert.equal(visits.rows[0]?.count, 1);
  } finally {
    await pool.end();
  }
});
