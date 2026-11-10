import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const roleIsolationMigration = resolve(here, "../../../supabase/migrations/20261028100107_phase1_role_isolation_hardening.sql");
const assignmentMigration = resolve(here, "../../../supabase/migrations/20261028101846_resident_unit_assignment_rls.sql");
const databaseUrl = process.env.ROLE_ISOLATION_TEST_DATABASE_URL;

test("PostgreSQL RLS prevents cross-estate reads and role escalation through direct table access", {
  skip: !databaseUrl ? "Set ROLE_ISOLATION_TEST_DATABASE_URL to an isolated disposable PostgreSQL database." : false,
}, async () => {
  assert.ok(databaseUrl);
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    ["localhost", "127.0.0.1", "::1", "postgres"].includes(hostname),
    "Refusing to run destructive RLS fixtures against a non-local database host.",
  );

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DROP SCHEMA IF EXISTS private CASCADE;
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP TABLE IF EXISTS public.resident_units CASCADE;
      DROP TABLE IF EXISTS public.units CASCADE;
      DROP TABLE IF EXISTS public.users CASCADE;
      DROP TABLE IF EXISTS public.user_roles CASCADE;
      DROP TABLE IF EXISTS public.estate_memberships CASCADE;
      DROP TABLE IF EXISTS public.estates CASCADE;
      DROP TYPE IF EXISTS public.app_role CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TYPE public.app_role AS ENUM ('platform_admin', 'resident');
      CREATE TABLE public.estates (
        id uuid PRIMARY KEY,
        is_enabled boolean NOT NULL
      );
      CREATE TABLE public.estate_memberships (
        estate_id uuid NOT NULL,
        user_id uuid NOT NULL,
        membership_role text NOT NULL,
        status text NOT NULL,
        PRIMARY KEY (estate_id, user_id)
      );
      CREATE TABLE public.user_roles (
        user_id uuid NOT NULL,
        role public.app_role NOT NULL,
        PRIMARY KEY (user_id, role)
      );
      CREATE TABLE public.units (
        id uuid PRIMARY KEY,
        estate_id uuid NOT NULL
      );
      CREATE TABLE public.resident_units (
        estate_id uuid NOT NULL,
        unit_id uuid NOT NULL,
        resident_user_id uuid NOT NULL,
        start_date date NOT NULL,
        end_date date,
        PRIMARY KEY (estate_id, unit_id, resident_user_id, start_date)
      );
      CREATE TABLE public.users (
        id uuid PRIMARY KEY,
        is_active boolean NOT NULL
      );
      ALTER TABLE public.estates ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.estate_memberships ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.resident_units ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      -- Model the baseline self-membership and assigned-resident read policies
      -- that exist before the role-isolation hardening migrations are applied.
      CREATE POLICY estates_select_active_member ON public.estates
        FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = estates.id AND m.user_id = auth.uid() AND m.status = 'active'
        ));
      CREATE POLICY memberships_select_own ON public.estate_memberships
        FOR SELECT TO authenticated USING (user_id = auth.uid());
      CREATE POLICY resident_units_select_own ON public.resident_units
        FOR SELECT TO authenticated USING (resident_user_id = auth.uid());
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT SELECT ON public.estates, public.estate_memberships, public.user_roles,
        public.units, public.resident_units, public.users TO authenticated;
      GRANT INSERT ON public.resident_units TO authenticated;
    `);

    await client.query(await readFile(roleIsolationMigration, "utf8"));
    await client.query(await readFile(assignmentMigration, "utf8"));

    const estateA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const estateB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const managerA = "11111111-1111-4111-8111-111111111111";
    const managerB = "22222222-2222-4222-8222-222222222222";
    const residentA = "33333333-3333-4333-8333-333333333333";
    const residentB = "44444444-4444-4444-8444-444444444444";
    const securityA = "55555555-5555-4555-8555-555555555555";
    const unitA = "aaaaaaaa-0000-4000-8000-000000000001";
    const unitB = "bbbbbbbb-0000-4000-8000-000000000002";

    await client.query(
      "INSERT INTO public.estates (id, is_enabled) VALUES ($1, true), ($2, true)",
      [estateA, estateB],
    );
    await client.query(
      "INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status) VALUES " +
      "($1, $3, 'facility_manager', 'active'), ($2, $4, 'facility_manager', 'active'), " +
      "($1, $5, 'resident', 'active'), ($2, $6, 'resident', 'active'), ($1, $7, 'security', 'active')",
      [estateA, estateB, managerA, managerB, residentA, residentB, securityA],
    );
    await client.query(
      "INSERT INTO public.units (id, estate_id) VALUES ($1, $2), ($3, $4)",
      [unitA, estateA, unitB, estateB],
    );
    await client.query(
      "INSERT INTO public.resident_units (estate_id, unit_id, resident_user_id, start_date) VALUES " +
      "($1, $2, $3, CURRENT_DATE), ($4, $5, $6, CURRENT_DATE)",
      [estateA, unitA, residentA, estateB, unitB, residentB],
    );
    await client.query(
      "INSERT INTO public.users (id, is_active) VALUES ($1, true), ($2, true)",
      [residentA, residentB],
    );

    const asUser = async <T>(userId: string, operation: () => Promise<T>): Promise<T> => {
      await client.query("RESET ROLE");
      await client.query("SET ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
      return operation();
    };

    const managerAUnits = await asUser(managerA, () =>
      client.query("SELECT id FROM public.units ORDER BY id"),
    );
    assert.deepEqual(managerAUnits.rows.map((row) => row.id), [unitA],
      "Estate A manager must not see Estate B units.");

    const managerAMembers = await asUser(managerA, () =>
      client.query("SELECT estate_id, user_id FROM public.estate_memberships WHERE membership_role = 'resident'"),
    );
    assert.deepEqual(managerAMembers.rows, [{ estate_id: estateA, user_id: residentA }],
      "Estate A manager must only see resident memberships in Estate A.");

    const managerAUsers = await asUser(managerA, () =>
      client.query("SELECT id FROM public.users ORDER BY id"),
    );
    assert.deepEqual(managerAUsers.rows.map((row) => row.id), [residentA],
      "Estate A manager must not see Estate B resident profiles.");

    const managerBUnits = await asUser(managerB, () =>
      client.query("SELECT id FROM public.units ORDER BY id"),
    );
    assert.deepEqual(managerBUnits.rows.map((row) => row.id), [unitB],
      "Estate B manager must not see Estate A units.");

    const residentAUnits = await asUser(residentA, () =>
      client.query("SELECT id FROM public.units ORDER BY id"),
    );
    assert.deepEqual(residentAUnits.rows.map((row) => row.id), [unitA],
      "Resident must only see their currently assigned unit.");

    const securityUnits = await asUser(securityA, () =>
      client.query("SELECT id FROM public.units ORDER BY id"),
    );
    assert.deepEqual(securityUnits.rows, [],
      "Security staff must not receive the resident/unit directory.");

    await asUser(managerA, async () => {
      await assert.rejects(
        client.query(
          "INSERT INTO public.resident_units (estate_id, unit_id, resident_user_id, start_date) VALUES ($1, $2, $3, CURRENT_DATE)",
          [estateB, unitB, residentB],
        ),
        (error: unknown) => (error as { code?: string }).code === "42501",
        "Manager must not create assignments in another estate.",
      );
    });
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    client.release();
    await pool.end();
  }
});
