-- Role-authorized estate setup and resident onboarding.
-- Platform admins must be bootstrapped by a trusted database operator; no public self-promotion path exists.
BEGIN;

ALTER TABLE public.estates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estates_insert_platform_admin ON public.estates;
CREATE POLICY estates_insert_platform_admin ON public.estates
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
  ));

DROP POLICY IF EXISTS estates_update_platform_admin ON public.estates;
CREATE POLICY estates_update_platform_admin ON public.estates
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
  ));

DROP POLICY IF EXISTS memberships_insert_authorized ON public.estate_memberships;
CREATE POLICY memberships_insert_authorized ON public.estate_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      membership_role = 'resident'
      AND status IN ('invited', 'active')
      AND EXISTS (
        SELECT 1 FROM public.estate_memberships fm
        WHERE fm.estate_id = estate_memberships.estate_id
          AND fm.user_id = (SELECT auth.uid())
          AND fm.status = 'active'
          AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
      )
    )
    OR (
      membership_role IN ('facility_manager', 'security', 'estate_manager', 'estate_admin', 'finance_admin')
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
      )
    )
  );

DROP POLICY IF EXISTS memberships_update_authorized ON public.estate_memberships;
CREATE POLICY memberships_update_authorized ON public.estate_memberships
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
    )
    OR (
      membership_role = 'resident'
      AND EXISTS (
        SELECT 1 FROM public.estate_memberships fm
        WHERE fm.estate_id = estate_memberships.estate_id
          AND fm.user_id = (SELECT auth.uid())
          AND fm.status = 'active'
          AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'platform_admin'
    )
    OR membership_role = 'resident'
  );

DROP POLICY IF EXISTS resident_units_insert_manager ON public.resident_units;
CREATE POLICY resident_units_insert_manager ON public.resident_units
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estate_memberships fm
      WHERE fm.estate_id = resident_units.estate_id
        AND fm.user_id = (SELECT auth.uid())
        AND fm.status = 'active'
        AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
  );

DROP POLICY IF EXISTS resident_units_update_manager ON public.resident_units;
CREATE POLICY resident_units_update_manager ON public.resident_units
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estate_memberships fm
      WHERE fm.estate_id = resident_units.estate_id
        AND fm.user_id = (SELECT auth.uid())
        AND fm.status = 'active'
        AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estate_memberships fm
      WHERE fm.estate_id = resident_units.estate_id
        AND fm.user_id = (SELECT auth.uid())
        AND fm.status = 'active'
        AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
  );

-- Unit assignment updates are intentionally manager-scoped and estate-consistent.
DROP POLICY IF EXISTS units_update_manager ON public.units;
CREATE POLICY units_update_manager ON public.units
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estate_memberships fm
      WHERE fm.estate_id = units.estate_id
        AND fm.user_id = (SELECT auth.uid())
        AND fm.status = 'active'
        AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estate_memberships fm
      WHERE fm.estate_id = units.estate_id
        AND fm.user_id = (SELECT auth.uid())
        AND fm.status = 'active'
        AND fm.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
    )
  );

COMMIT;
