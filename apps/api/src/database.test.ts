import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl = process.env.DATABASE_ACCESS_TEST_DATABASE_URL;

test("authenticated PostgreSQL transactions apply RLS identity and reset claims after use", {
  skip: !databaseUrl ? "Set DATABASE_ACCESS_TEST_DATABASE_URL to an isolated disposable PostgreSQL database." : false,
}, async () => {
  assert.ok(databaseUrl);
  const adminPool = new pg.Pool({ connectionString: databaseUrl });
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";

  try {
    await adminPool.query(`
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      DROP TABLE IF EXISTS public.database_access_test_rows;
      CREATE TABLE public.database_access_test_rows (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        owner_id uuid NOT NULL,
        value text NOT NULL
      );
      ALTER TABLE public.database_access_test_rows ENABLE ROW LEVEL SECURITY;
      CREATE POLICY database_access_test_rows_owner_select
        ON public.database_access_test_rows
        FOR SELECT TO authenticated
        USING (owner_id = (SELECT auth.uid()));
      GRANT SELECT ON public.database_access_test_rows TO authenticated;
      INSERT INTO public.database_access_test_rows (owner_id, value)
      VALUES ('${userA}', 'user-a'), ('${userB}', 'user-b');
    `);

    // The helper reads DATABASE_URL when its module is initialized.
    process.env.DATABASE_URL = databaseUrl;
    const { withAuthenticatedTransaction } = await import("./database.js");
    const { closeDatabase } = await import("./storage.js");

    const visibleRows = await withAuthenticatedTransaction(userA, async (client) => {
      const result = await client.query(
        "SELECT value FROM public.database_access_test_rows ORDER BY value",
      );
      return result.rows.map((row: { value: string }) => row.value);
    });
    assert.deepEqual(visibleRows, ["user-a"], "RLS must restrict native SQL to the validated user");

    const secondUserRows = await withAuthenticatedTransaction(userB, async (client) => {
      const result = await client.query(
        "SELECT value FROM public.database_access_test_rows ORDER BY value",
      );
      return result.rows.map((row: { value: string }) => row.value);
    });
    assert.deepEqual(secondUserRows, ["user-b"], "a reused connection must receive the next user's identity, not retain the previous one");

    await assert.rejects(
      withAuthenticatedTransaction(userA, async (client) => {
        await client.query("SELECT 1");
        throw new Error("intentional rollback");
      }),
      /intentional rollback/,
    );

    await closeDatabase();
  } finally {
    const { closeDatabase } = await import("./storage.js");
    await closeDatabase().catch(() => undefined);
    await adminPool.query("DROP TABLE IF EXISTS public.database_access_test_rows").catch(() => undefined);
    await adminPool.query("DROP FUNCTION IF EXISTS auth.uid()").catch(() => undefined);
    await adminPool.end();
  }
});
