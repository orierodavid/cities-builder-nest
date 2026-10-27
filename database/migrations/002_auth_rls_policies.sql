-- Cities Builder Nest: Supabase Auth profile sync and initial least-privilege policies.
-- Financial and operational write paths remain server-only until reviewed API endpoints exist.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, phone_e164, full_name)
  VALUES (
    NEW.id,
    NULLIF(NEW.phone, ''),
    COALESCE(
      NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(SPLIT_PART(COALESCE(NEW.email, NEW.phone, ''), '@', 1), ''),
      'New user'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_auth_user_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_sync_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.sync_auth_user_profile();

-- User-visible profile and estate/community reads.
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);

CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY memberships_select_own ON public.estate_memberships
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY estates_select_member ON public.estates
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estates.id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY buildings_select_member ON public.buildings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = buildings.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY units_select_member ON public.units
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.buildings b
      JOIN public.estate_memberships m ON m.estate_id = b.estate_id
      WHERE b.id = units.building_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY resident_units_select_own ON public.resident_units
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = resident_user_id);

CREATE POLICY announcements_select_published_member ON public.announcements
  FOR SELECT TO authenticated USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = announcements.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY maintenance_select_own_or_manager ON public.maintenance_requests
  FOR SELECT TO authenticated USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = maintenance_requests.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role = 'facility_manager'
    )
  );

CREATE POLICY maintenance_insert_own_member ON public.maintenance_requests
  FOR INSERT TO authenticated WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = maintenance_requests.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY visitor_passes_select_host ON public.visitor_passes
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = host_user_id);

CREATE POLICY visitor_passes_insert_host_member ON public.visitor_passes
  FOR INSERT TO authenticated WITH CHECK (
    host_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = visitor_passes.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY savings_goals_select_own ON public.rent_savings_goals
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = resident_user_id);

CREATE POLICY savings_goals_insert_own ON public.rent_savings_goals
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = resident_user_id);

CREATE POLICY savings_goals_update_own ON public.rent_savings_goals
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = resident_user_id)
  WITH CHECK ((SELECT auth.uid()) = resident_user_id);

CREATE POLICY financial_partners_select_active ON public.financial_partners
  FOR SELECT TO authenticated USING (is_active = true);

-- No client-facing policies are created for payments, withdrawals, ledger,
-- provider events, reconciliation, audit logs, or role administration.
-- Those operations must be mediated by authenticated server endpoints.
