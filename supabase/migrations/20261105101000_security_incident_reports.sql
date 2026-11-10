-- Security incident reports with estate-scoped access and auditable ownership.
BEGIN;

CREATE TABLE IF NOT EXISTS public.security_incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  category text NOT NULL CHECK (category IN (
    'unauthorised_access', 'theft', 'property_damage', 'disturbance',
    'safety_hazard', 'medical', 'fire', 'other'
  )),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 5000),
  location text CHECK (location IS NULL OR char_length(location) <= 240),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  resolution_note text CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_incident_resolution_pair CHECK (
    (status <> 'resolved') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS security_incident_reports_estate_created_idx
  ON public.security_incident_reports (estate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_incident_reports_estate_status_idx
  ON public.security_incident_reports (estate_id, status, severity);

ALTER TABLE public.security_incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_incident_reports_select_estate_staff
ON public.security_incident_reports FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_incident_reports.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role IN ('security', 'facility_manager', 'estate_manager', 'estate_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'platform_admin'
  )
);

CREATE POLICY security_incident_reports_insert_security
ON public.security_incident_reports FOR INSERT TO authenticated WITH CHECK (
  reported_by = (SELECT auth.uid())
  AND status = 'open'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_incident_reports.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
);

CREATE POLICY security_incident_reports_update_estate_managers
ON public.security_incident_reports FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_incident_reports.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'platform_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_incident_reports.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role IN ('facility_manager', 'estate_manager', 'estate_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'platform_admin'
  )
);

COMMIT;
