import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_MIGRATION_TEST_DATABASE_URL;
const here = dirname(fileURLToPath(import.meta.url));
const accountMigration = resolve(here, "../../../supabase/migrations/20261110180000_atomic_estate_account_provisioning.sql");
const eventMigration = resolve(here, "../../../supabase/migrations/20261110190000_security_event_invitation_verification.sql");
const visitorSecurityMigration = resolve(here, "../../../supabase/migrations/20261110210000_security_visitor_pass_operations.sql");
const visitorHostStatusMigration = resolve(here, "../../../supabase/migrations/20261110170000_visitor_pass_host_status_updates.sql");
const activeAssignmentMigration = resolve(here, "../../../supabase/migrations/20261110220000_resident_unit_active_assignment_unique.sql");

test("PostgreSQL enforces account provisioning and security event verification permissions", {
  skip: !databaseUrl ? "Set DATABASE_MIGRATION_TEST_DATABASE_URL to an isolated disposable PostgreSQL database." : false,
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1", "::1", "postgres"].includes(new URL(databaseUrl).hostname),
    "Refusing to run destructive migration fixtures against a non-local database host.");
  const adminPool = new pg.Pool({ connectionString: databaseUrl });
  const manager = "10000000-0000-4000-8000-000000000001";
  const platformAdmin = "10000000-0000-4000-8000-000000000002";
  const outsider = "10000000-0000-4000-8000-000000000003";
  const security = "10000000-0000-4000-8000-000000000004";
  const estate = "20000000-0000-4000-8000-000000000001";
  const disabledEstate = "20000000-0000-4000-8000-000000000002";
  const unit = "30000000-0000-4000-8000-000000000001";
  const assignedUnit = "30000000-0000-4000-8000-000000000002";
  const event = "40000000-0000-4000-8000-000000000001";
  const guest = "50000000-0000-4000-8000-000000000001";
  const invitation = "60000000-0000-4000-8000-000000000001";
  const codeHash = "a".repeat(64);

  async function asUser<T>(userId: string, operation: (client: pg.PoolClient) => Promise<T>, legalConsent = true): Promise<T> {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('test.legal_consent', $2, true)",
        [userId, String(legalConsent)],
      );
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function addAuthUser(id: string) {
    await adminPool.query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
  }

  try {
    await adminPool.query(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DROP SCHEMA IF EXISTS private CASCADE;
      DROP SCHEMA IF EXISTS auth CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA private;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
      CREATE TABLE public.users (id uuid PRIMARY KEY, full_name text NOT NULL, phone_e164 text, is_active boolean NOT NULL);
      CREATE TABLE public.estates (id uuid PRIMARY KEY, is_enabled boolean NOT NULL);
      CREATE TABLE public.estate_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL, user_id uuid NOT NULL,
        membership_role text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.units (id uuid PRIMARY KEY, estate_id uuid NOT NULL, status text NOT NULL);
      CREATE TABLE public.resident_units (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL, unit_id uuid NOT NULL,
        resident_user_id uuid NOT NULL, start_date date NOT NULL DEFAULT current_date,
        end_date date, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE OR REPLACE FUNCTION private.is_platform_admin() RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
        AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'platform_admin') $$;
      CREATE OR REPLACE FUNCTION private.is_active_estate_manager(target_estate_id uuid) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
        AS $$ SELECT EXISTS (
          SELECT 1 FROM public.estate_memberships m JOIN public.estates e ON e.id = m.estate_id
          WHERE m.estate_id = target_estate_id AND m.user_id = auth.uid() AND m.status = 'active'
            AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin') AND e.is_enabled
        ) $$;
      CREATE OR REPLACE FUNCTION public.current_user_has_required_legal_consent() RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
        AS $$ SELECT coalesce(nullif(current_setting('test.legal_consent', true), '')::boolean, false) $$;

      CREATE TABLE public.estate_events (
        id uuid PRIMARY KEY, estate_id uuid NOT NULL, title text NOT NULL, venue text NOT NULL,
        starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status text NOT NULL,
        venue_approval_status text NOT NULL DEFAULT 'approved'
      );
      CREATE TABLE public.estate_event_guests (
        id uuid PRIMARY KEY, estate_id uuid NOT NULL, event_id uuid NOT NULL,
        guest_name text NOT NULL, email text, phone text
      );
      CREATE TABLE public.estate_event_invitations (
        id uuid PRIMARY KEY, estate_id uuid NOT NULL, event_id uuid NOT NULL, guest_id uuid NOT NULL,
        code_hash text NOT NULL, status text NOT NULL
      );
      CREATE TABLE public.estate_event_checkins (
        id uuid PRIMARY KEY, estate_id uuid NOT NULL, event_id uuid NOT NULL, guest_id uuid NOT NULL,
        checked_in_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.visitor_passes (
        id uuid PRIMARY KEY, estate_id uuid NOT NULL, host_user_id uuid NOT NULL,
        visitor_name text NOT NULL, visitor_phone text, access_code_hash text NOT NULL,
        valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, status text NOT NULL
      );
      CREATE TABLE public.visitor_pass_denials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
        visitor_pass_id uuid NOT NULL, denied_by uuid NOT NULL, reason text, denied_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.visitor_passes ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, UPDATE ON public.visitor_passes TO authenticated;
      GRANT SELECT ON public.estate_memberships TO authenticated;
      CREATE POLICY visitor_passes_select_host_test ON public.visitor_passes
        FOR SELECT TO authenticated USING (host_user_id = (SELECT auth.uid()));
      GRANT USAGE ON SCHEMA public, auth, private TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid(), public.current_user_has_required_legal_consent(),
        private.is_platform_admin(), private.is_active_estate_manager(uuid) TO authenticated;
    `);

    await adminPool.query(await readFile(accountMigration, "utf8"));
    await adminPool.query(await readFile(eventMigration, "utf8"));
    await adminPool.query(await readFile(visitorHostStatusMigration, "utf8"));
    await adminPool.query(await readFile(visitorSecurityMigration, "utf8"));
    await adminPool.query(await readFile(activeAssignmentMigration, "utf8"));

    await adminPool.query(
      "INSERT INTO public.estates (id, is_enabled) VALUES ($1, true), ($2, false)",
      [estate, disabledEstate],
    );
    await adminPool.query("INSERT INTO public.units (id, estate_id, status) VALUES ($1, $2, 'available'), ($3, $2, 'available')",
      [unit, estate, assignedUnit]);
    await adminPool.query("INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status) VALUES ($1, $2, 'facility_manager', 'active'), ($1, $3, 'security', 'active')",
      [estate, manager, security]);
    await adminPool.query("INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'platform_admin')", [platformAdmin]);
    const hostUser = "90000000-0000-4000-8000-000000000001";
    await addAuthUser(hostUser);
    await adminPool.query("INSERT INTO public.users (id, full_name, phone_e164, is_active) VALUES ($1, 'Host Resident', NULL, true)", [hostUser]);
    await adminPool.query("INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status) VALUES ($1, $2, 'resident', 'active')", [estate, hostUser]);

    const residentUser = "70000000-0000-4000-8000-000000000001";
    const staffUser = "70000000-0000-4000-8000-000000000002";
    const estateAdminUser = "70000000-0000-4000-8000-000000000003";
    const outsiderTarget = "70000000-0000-4000-8000-000000000004";
    const disabledTarget = "70000000-0000-4000-8000-000000000005";
    const wrongUnitTarget = "70000000-0000-4000-8000-000000000006";
    const occupiedUnitTarget = "70000000-0000-4000-8000-000000000007";
    const noConsentTarget = "70000000-0000-4000-8000-000000000008";
    for (const id of [residentUser, staffUser, estateAdminUser, outsiderTarget, disabledTarget, wrongUnitTarget, occupiedUnitTarget, noConsentTarget]) await addAuthUser(id);

    const createdResident = await asUser(manager, async (client) => {
      const result = await client.query(
        "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, $5)",
        [estate, residentUser, "Resident One", "resident", unit],
      );
      return result.rows[0];
    });
    assert.equal(createdResident.membership_role, "resident");
    const assigned = await adminPool.query("SELECT resident_user_id FROM public.resident_units WHERE unit_id = $1 AND end_date IS NULL", [unit]);
    assert.equal(assigned.rows[0]?.resident_user_id, residentUser);
    await assert.rejects(
      adminPool.query("INSERT INTO public.resident_units (estate_id, unit_id, resident_user_id) VALUES ($1, $2, $3)", [estate, unit, staffUser]),
      (error: unknown) => (error as { code?: string }).code === "23505",
    );
    const occupied = await adminPool.query("SELECT status FROM public.units WHERE id = $1", [unit]);
    assert.equal(occupied.rows[0]?.status, "occupied");

    const createdStaff = await asUser(manager, async (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, NULL)",
      [estate, staffUser, "Security Staff", "security"],
    ));
    assert.equal(createdStaff.rows[0]?.membership_role, "security");

    await assert.rejects(asUser(manager, (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, NULL)",
      [estate, estateAdminUser, "Estate Admin", "estate_admin"],
    )), (error: unknown) => (error as { code?: string }).code === "42501");
    await assert.rejects(asUser(outsider, (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, NULL)",
      [estate, outsiderTarget, "Outsider", "security"],
    )), (error: unknown) => (error as { code?: string }).code === "42501");
    await assert.rejects(asUser(manager, (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, NULL)",
      [disabledEstate, disabledTarget, "Disabled Estate", "security"],
    )), (error: unknown) => (error as { code?: string }).code === "P0002");
    await assert.rejects(asUser(manager, (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, $5)",
      [estate, wrongUnitTarget, "Wrong Unit", "resident", "30000000-0000-4000-8000-000000000099"],
    )), (error: unknown) => (error as { code?: string }).code === "22023");
    await adminPool.query("INSERT INTO public.resident_units (estate_id, unit_id, resident_user_id) VALUES ($1, $2, $3)",
      [estate, assignedUnit, residentUser]);
    await assert.rejects(asUser(manager, (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, $5)",
      [estate, occupiedUnitTarget, "Occupied Unit", "resident", assignedUnit],
    )), (error: unknown) => (error as { code?: string }).code === "23505");
    await assert.rejects(asUser(manager, (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, NULL)",
      [estate, noConsentTarget, "No Consent", "security"],
    ), false), (error: unknown) => (error as { code?: string }).code === "42501");

    const createdEstateAdmin = await asUser(platformAdmin, (client) => client.query(
      "SELECT * FROM public.create_estate_account_membership($1, $2, $3, $4, NULL)",
      [estate, estateAdminUser, "Estate Admin", "estate_admin"],
    ));
    assert.equal(createdEstateAdmin.rows[0]?.membership_role, "estate_admin");

    await adminPool.query("INSERT INTO public.estate_events (id, estate_id, title, venue, starts_at, ends_at, status, venue_approval_status) VALUES ($1, $2, 'Event', 'Hall', now(), now() + interval '2 hours', 'published', 'approved')", [event, estate]);
    await adminPool.query("INSERT INTO public.estate_event_guests (id, estate_id, event_id, guest_name, email, phone) VALUES ($1, $2, $3, 'Guest One', NULL, NULL)", [guest, estate, event]);
    await adminPool.query("INSERT INTO public.estate_event_invitations (id, estate_id, event_id, guest_id, code_hash, status) VALUES ($1, $2, $3, $4, $5, 'active')", [invitation, estate, event, guest, codeHash]);

    const verified = await asUser(security, (client) => client.query(
      "SELECT * FROM public.verify_estate_event_invitation_for_security($1, $2, $3)",
      [estate, event, codeHash],
    ));
    assert.equal(verified.rows[0]?.status, "verified");
    assert.equal((verified.rows[0]?.guest_data as { guest_name: string }).guest_name, "Guest One");

    await adminPool.query("INSERT INTO public.estate_event_checkins (id, estate_id, event_id, guest_id) VALUES ($1, $2, $3, $4)",
      ["80000000-0000-4000-8000-000000000001", estate, event, guest]);
    const checkedIn = await asUser(security, (client) => client.query(
      "SELECT * FROM public.verify_estate_event_invitation_for_security($1, $2, $3)",
      [estate, event, codeHash],
    ));
    assert.equal(checkedIn.rows[0]?.status, "already_checked_in");
    assert.ok(checkedIn.rows[0]?.check_in_data);

    const forbidden = await asUser(outsider, (client) => client.query(
      "SELECT * FROM public.verify_estate_event_invitation_for_security($1, $2, $3)",
      [estate, event, codeHash],
    ));
    assert.equal(forbidden.rows[0]?.status, "forbidden");
    const noLegalConsent = await asUser(security, (client) => client.query(
      "SELECT * FROM public.verify_estate_event_invitation_for_security($1, $2, $3)",
      [estate, event, codeHash],
    ), false);
    assert.equal(noLegalConsent.rows[0]?.status, "forbidden");

    const passId = "a0000000-0000-4000-8000-000000000001";
    const denialPassId = "a0000000-0000-4000-8000-000000000002";
    await adminPool.query(
      "INSERT INTO public.visitor_passes (id, estate_id, host_user_id, visitor_name, visitor_phone, access_code_hash, valid_from, valid_until, status) VALUES ($1, $2, $3, 'Visitor One', NULL, $4, now() - interval '1 minute', now() + interval '1 hour', 'active'), ($5, $2, $3, 'Visitor Two', NULL, $6, now() - interval '1 minute', now() + interval '1 hour', 'active')",
      [passId, estate, hostUser, "b".repeat(64), denialPassId, "c".repeat(64)],
    );
    const gateLookup = await asUser(security, (client) => client.query(
      "SELECT * FROM public.get_gate_visitor_pass_for_security($1, $2)",
      [estate, "b".repeat(64)],
    ));
    assert.equal(gateLookup.rows[0]?.host_full_name, "Host Resident");

    const hostStatusUpdate = await asUser(hostUser, (client) => client.query(
      "UPDATE public.visitor_passes SET status = 'revoked' WHERE id = $1 RETURNING status",
      [passId],
    ));
    assert.equal(hostStatusUpdate.rows[0]?.status, "revoked");
    const hostStatusRestore = await asUser(hostUser, (client) => client.query(
      "UPDATE public.visitor_passes SET status = 'active' WHERE id = $1 RETURNING status",
      [passId],
    ));
    assert.equal(hostStatusRestore.rows[0]?.status, "active");
    const securityCannotChangeHostPass = await asUser(security, (client) => client.query(
      "UPDATE public.visitor_passes SET status = 'revoked' WHERE id = $1 RETURNING status",
      [passId],
    ));
    assert.equal(securityCannotChangeHostPass.rowCount, 0);
    await assert.rejects(asUser(hostUser, (client) => client.query(
      "UPDATE public.visitor_passes SET host_user_id = $2 WHERE id = $1",
      [passId, security],
    )), (error: unknown) => (error as { code?: string }).code === "42501");
    const denied = await asUser(security, (client) => client.query(
      "SELECT * FROM public.deny_visitor_pass_for_security($1, $2, $3)",
      [estate, denialPassId, "Not authorised"],
    ));
    assert.equal(denied.rows[0]?.result, "denied");
    assert.equal(denied.rows[0]?.pass_status, "revoked");
    const passStatus = await adminPool.query("SELECT status FROM public.visitor_passes WHERE id = $1", [denialPassId]);
    assert.equal(passStatus.rows[0]?.status, "revoked");
    const denialAudit = await adminPool.query("SELECT denied_by, reason FROM public.visitor_pass_denials WHERE visitor_pass_id = $1", [denialPassId]);
    assert.equal(denialAudit.rows[0]?.denied_by, security);
    assert.equal(denialAudit.rows[0]?.reason, "Not authorised");
    const deniedAgain = await asUser(security, (client) => client.query(
      "SELECT * FROM public.deny_visitor_pass_for_security($1, $2, NULL)",
      [estate, denialPassId],
    ));
    assert.equal(deniedAgain.rows[0]?.result, "not_active");
    const outsiderLookup = await asUser(outsider, (client) => client.query(
      "SELECT * FROM public.get_gate_visitor_pass_for_security($1, $2)",
      [estate, "b".repeat(64)],
    ));
    assert.equal(outsiderLookup.rowCount, 0);
  } finally {
    await adminPool.query("DROP SCHEMA IF EXISTS private CASCADE").catch(() => undefined);
    await adminPool.query("DROP SCHEMA IF EXISTS auth CASCADE").catch(() => undefined);
    for (const table of ["visitor_pass_denials", "visitor_passes", "estate_event_checkins", "estate_event_invitations", "estate_event_guests", "estate_events", "resident_units", "units", "estate_memberships", "estates", "users", "user_roles"]) {
      await adminPool.query(`DROP TABLE IF EXISTS public.${table} CASCADE`).catch(() => undefined);
    }
    await adminPool.end();
  }
});
