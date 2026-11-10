import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { getEstateEnabledStatus, getEstateMembershipAccess, getEventCreator, hasEstateManagerRole, hasPlatformAdminRole } from "./authorization.repository.js";

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

      DROP TABLE IF EXISTS public.estate_events;
      DROP TABLE IF EXISTS public.estates;
      DROP TABLE IF EXISTS public.estate_memberships;
      DROP TABLE IF EXISTS public.user_roles;
      CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
      CREATE TABLE public.estate_memberships (estate_id uuid NOT NULL, user_id uuid NOT NULL, membership_role text NOT NULL, status text NOT NULL);
      CREATE TABLE public.estates (id uuid PRIMARY KEY, is_enabled boolean NOT NULL);
      CREATE TABLE public.estate_events (id uuid PRIMARY KEY, estate_id uuid NOT NULL, created_by uuid NOT NULL);
      ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.estate_memberships ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.estates ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.estate_events ENABLE ROW LEVEL SECURITY;
      CREATE POLICY authorization_test_roles_owner ON public.user_roles
        FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
      CREATE POLICY authorization_test_memberships_owner ON public.estate_memberships
        FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) AND status = 'active');
      CREATE POLICY authorization_test_estates_member_or_admin ON public.estates
        FOR SELECT TO authenticated USING (
          EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id = estates.id AND m.user_id = (SELECT auth.uid()) AND m.status = 'active')
          OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'platform_admin')
        );
      CREATE POLICY authorization_test_events_member_or_admin ON public.estate_events
        FOR SELECT TO authenticated USING (
          EXISTS (SELECT 1 FROM public.estate_memberships m WHERE m.estate_id = estate_events.estate_id AND m.user_id = (SELECT auth.uid()) AND m.status = 'active')
          OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'platform_admin')
        );
      GRANT SELECT ON public.user_roles, public.estate_memberships, public.estates, public.estate_events TO authenticated;
      INSERT INTO public.user_roles (user_id, role) VALUES ('${userA}', 'platform_admin'), ('${userB}', 'resident');
      INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status)
        VALUES ('44444444-4444-4444-8444-444444444444', '${userB}', 'facility_manager', 'active');
      INSERT INTO public.estates (id, is_enabled) VALUES ('44444444-4444-4444-8444-444444444444', true);
      INSERT INTO public.estate_events (id, estate_id, created_by)
        VALUES ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', '${userB}');
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

    const adminAccess = await withAuthenticatedTransaction(userA, async (client) => ({
      platformAdmin: await hasPlatformAdminRole(client, userA),
      manager: await hasEstateManagerRole(client, userA, "44444444-4444-4444-8444-444444444444"),
      estateEnabled: await getEstateEnabledStatus(client, "44444444-4444-4444-8444-444444444444"),
    }));
    assert.deepEqual(adminAccess, { platformAdmin: true, manager: false, estateEnabled: true });

    const managerAccess = await withAuthenticatedTransaction(userB, async (client) => ({
      platformAdmin: await hasPlatformAdminRole(client, userB),
      manager: await hasEstateManagerRole(client, userB, "44444444-4444-4444-8444-444444444444"),
      membership: await getEstateMembershipAccess(client, userB, "44444444-4444-4444-8444-444444444444"),
      estateEnabled: await getEstateEnabledStatus(client, "44444444-4444-4444-8444-444444444444"),
      eventCreator: await getEventCreator(client, "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"),
    }));
    assert.equal(managerAccess.platformAdmin, false);
    assert.equal(managerAccess.manager, true);
    assert.equal(managerAccess.membership?.membership_role, "facility_manager");
    assert.equal(managerAccess.estateEnabled, true);
    assert.equal(managerAccess.eventCreator, userB);

    const outsiderId = "33333333-3333-4333-8333-333333333333";
    const outsiderAccess = await withAuthenticatedTransaction(outsiderId, async (client) => ({
      manager: await hasEstateManagerRole(client, outsiderId, "44444444-4444-4444-8444-444444444444"),
      membership: await getEstateMembershipAccess(client, outsiderId, "44444444-4444-4444-8444-444444444444"),
      estateEnabled: await getEstateEnabledStatus(client, "44444444-4444-4444-8444-444444444444"),
      eventCreator: await getEventCreator(client, "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"),
    }));
    assert.deepEqual(outsiderAccess, { manager: false, membership: null, estateEnabled: null, eventCreator: null });

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
    await adminPool.query("DROP TABLE IF EXISTS public.estate_events").catch(() => undefined);
    await adminPool.query("DROP TABLE IF EXISTS public.estates").catch(() => undefined);
    await adminPool.query("DROP TABLE IF EXISTS public.estate_memberships").catch(() => undefined);
    await adminPool.query("DROP TABLE IF EXISTS public.user_roles").catch(() => undefined);
    await adminPool.query("DROP TABLE IF EXISTS public.database_access_test_rows").catch(() => undefined);
    await adminPool.query("DROP FUNCTION IF EXISTS auth.uid()").catch(() => undefined);
    await adminPool.end();
  }
});
