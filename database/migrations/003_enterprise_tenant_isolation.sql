-- Cities Builder Nest: enterprise multi-estate tenant isolation hardening.
-- This migration preserves fail-closed access for financial and administrative write paths.
BEGIN;

-- Drop dependent policy before changing the membership role column type.
DROP POLICY IF EXISTS maintenance_select_own_or_manager ON public.maintenance_requests;

-- A user has one estate-scoped role per estate. Platform-wide authority is separate.
ALTER TABLE public.estate_memberships
  DROP CONSTRAINT IF EXISTS estate_memberships_membership_role_check;
ALTER TABLE public.estate_memberships
  ALTER COLUMN membership_role TYPE text USING membership_role::text;
ALTER TABLE public.estate_memberships
  ADD CONSTRAINT estate_memberships_membership_role_check
  CHECK (membership_role IN (
    'resident', 'security', 'facility_manager', 'estate_manager',
    'estate_admin', 'finance_admin'
  ));
ALTER TABLE public.estate_memberships
  DROP CONSTRAINT IF EXISTS estate_memberships_estate_id_user_id_membership_role_key;
ALTER TABLE public.estate_memberships
  ADD CONSTRAINT estate_memberships_estate_user_unique UNIQUE (estate_id, user_id);

-- The global role table is reserved for platform-wide privileges, never estate staff roles.
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_platform_only_check CHECK (role = 'platform_admin');

-- Denormalize estate_id onto units so the database can enforce tenant-consistent relationships.
ALTER TABLE public.buildings
  ADD CONSTRAINT buildings_id_estate_unique UNIQUE (id, estate_id);
ALTER TABLE public.units ADD COLUMN estate_id uuid;
UPDATE public.units u
SET estate_id = b.estate_id
FROM public.buildings b
WHERE b.id = u.building_id;
ALTER TABLE public.units ALTER COLUMN estate_id SET NOT NULL;
ALTER TABLE public.units
  ADD CONSTRAINT units_building_estate_fk
  FOREIGN KEY (building_id, estate_id)
  REFERENCES public.buildings (id, estate_id) ON DELETE RESTRICT;
ALTER TABLE public.units
  ADD CONSTRAINT units_id_estate_unique UNIQUE (id, estate_id);

-- A resident-unit link must refer to a unit and a membership in the same estate.
ALTER TABLE public.resident_units ADD COLUMN estate_id uuid;
UPDATE public.resident_units ru
SET estate_id = u.estate_id
FROM public.units u
WHERE u.id = ru.unit_id;
ALTER TABLE public.resident_units ALTER COLUMN estate_id SET NOT NULL;
ALTER TABLE public.resident_units
  ADD CONSTRAINT resident_units_unit_estate_fk
  FOREIGN KEY (unit_id, estate_id)
  REFERENCES public.units (id, estate_id) ON DELETE RESTRICT;
ALTER TABLE public.resident_units
  ADD CONSTRAINT resident_units_membership_estate_fk
  FOREIGN KEY (estate_id, resident_user_id)
  REFERENCES public.estate_memberships (estate_id, user_id) ON DELETE RESTRICT;

-- A maintenance request's optional unit must belong to the request's estate.
ALTER TABLE public.maintenance_requests
  ADD CONSTRAINT maintenance_unit_estate_fk
  FOREIGN KEY (unit_id, estate_id)
  REFERENCES public.units (id, estate_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_memberships_estate_status_role
  ON public.estate_memberships (estate_id, status, membership_role, user_id);
CREATE INDEX IF NOT EXISTS idx_units_estate_building
  ON public.units (estate_id, building_id);
CREATE INDEX IF NOT EXISTS idx_resident_units_estate_resident
  ON public.resident_units (estate_id, resident_user_id, end_date);

-- Validate estate-level ownership/assignment even if a privileged server endpoint is used.
CREATE OR REPLACE FUNCTION private.validate_estate_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  membership_status text;
  membership_role text;
BEGIN
  IF TG_TABLE_NAME = 'resident_units' THEN
    SELECT m.status, m.membership_role
      INTO membership_status, membership_role
    FROM public.estate_memberships m
    WHERE m.estate_id = NEW.estate_id
      AND m.user_id = NEW.resident_user_id;

    IF membership_status IS DISTINCT FROM 'active'
       OR membership_role IS DISTINCT FROM 'resident' THEN
      RAISE EXCEPTION 'Resident must have an active resident membership in the same estate'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'maintenance_requests' THEN
    IF NEW.created_by IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = NEW.estate_id
        AND m.user_id = NEW.created_by
        AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Request creator must be an active member of the request estate'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = NEW.estate_id
        AND m.user_id = NEW.assigned_to
        AND m.status = 'active'
        AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin', 'security')
    ) THEN
      RAISE EXCEPTION 'Assignee must have an active operational role in the request estate'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'visitor_passes' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = NEW.estate_id
        AND m.user_id = NEW.host_user_id
        AND m.status = 'active'
        AND m.membership_role IN ('resident', 'estate_manager', 'estate_admin')
    ) THEN
      RAISE EXCEPTION 'Visitor host must have an active host-eligible membership in the estate'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_estate_relationships() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS resident_units_validate_estate ON public.resident_units;
CREATE TRIGGER resident_units_validate_estate
BEFORE INSERT OR UPDATE OF estate_id, unit_id, resident_user_id
ON public.resident_units
FOR EACH ROW EXECUTE FUNCTION private.validate_estate_relationships();

DROP TRIGGER IF EXISTS maintenance_requests_validate_estate ON public.maintenance_requests;
CREATE TRIGGER maintenance_requests_validate_estate
BEFORE INSERT OR UPDATE OF estate_id, unit_id, created_by, assigned_to
ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION private.validate_estate_relationships();

DROP TRIGGER IF EXISTS visitor_passes_validate_estate ON public.visitor_passes;
CREATE TRIGGER visitor_passes_validate_estate
BEFORE INSERT OR UPDATE OF estate_id, host_user_id
ON public.visitor_passes
FOR EACH ROW EXECUTE FUNCTION private.validate_estate_relationships();

-- Replace policies whose old predicates were too broad for enterprise tenant boundaries.
DROP POLICY IF EXISTS estates_select_member ON public.estates;
CREATE POLICY estates_select_member ON public.estates
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = estates.id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS resident_units_select_own ON public.resident_units;
CREATE POLICY resident_units_select_own ON public.resident_units
  FOR SELECT TO authenticated USING (
    resident_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = resident_units.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS maintenance_select_own_or_manager ON public.maintenance_requests;
CREATE POLICY maintenance_select_own_or_manager ON public.maintenance_requests
  FOR SELECT TO authenticated USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = maintenance_requests.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS visitor_passes_select_host ON public.visitor_passes;
CREATE POLICY visitor_passes_select_host ON public.visitor_passes
  FOR SELECT TO authenticated USING (
    (
      host_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.estate_memberships m
        WHERE m.estate_id = visitor_passes.estate_id
          AND m.user_id = (SELECT auth.uid())
          AND m.status = 'active'
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = visitor_passes.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('security', 'facility_manager', 'estate_manager', 'estate_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS visitor_passes_insert_host_member ON public.visitor_passes;
CREATE POLICY visitor_passes_insert_host_member ON public.visitor_passes
  FOR INSERT TO authenticated WITH CHECK (
    host_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = visitor_passes.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('resident', 'estate_manager', 'estate_admin')
    )
  );

DROP POLICY IF EXISTS savings_goals_insert_own ON public.rent_savings_goals;
CREATE POLICY savings_goals_insert_own ON public.rent_savings_goals
  FOR INSERT TO authenticated WITH CHECK (
    resident_user_id = (SELECT auth.uid())
    AND (
      estate_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.estate_memberships m
        WHERE m.estate_id = rent_savings_goals.estate_id
          AND m.user_id = (SELECT auth.uid())
          AND m.status = 'active'
          AND m.membership_role = 'resident'
      )
    )
  );

DROP POLICY IF EXISTS savings_goals_update_own ON public.rent_savings_goals;
CREATE POLICY savings_goals_update_own ON public.rent_savings_goals
  FOR UPDATE TO authenticated
  USING (resident_user_id = (SELECT auth.uid()))
  WITH CHECK (
    resident_user_id = (SELECT auth.uid())
    AND (
      estate_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.estate_memberships m
        WHERE m.estate_id = rent_savings_goals.estate_id
          AND m.user_id = (SELECT auth.uid())
          AND m.status = 'active'
          AND m.membership_role = 'resident'
      )
    )
  );

COMMIT;
