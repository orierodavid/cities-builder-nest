-- Estate-scoped emergency broadcasts for in-app visibility.
BEGIN;

CREATE TABLE IF NOT EXISTS public.security_emergency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  alert_type text NOT NULL CHECK (alert_type IN (
    'security_threat', 'fire', 'medical', 'utility', 'weather', 'other'
  )),
  severity text NOT NULL CHECK (severity IN ('high', 'critical')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 3000),
  location text CHECK (location IS NULL OR char_length(location) <= 240),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cancelled')),
  resolved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_emergency_alert_resolution_pair CHECK (
    (status = 'active' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status <> 'active' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS security_emergency_alerts_estate_created_idx
  ON public.security_emergency_alerts (estate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_emergency_alerts_estate_active_idx
  ON public.security_emergency_alerts (estate_id, status, severity);

ALTER TABLE public.security_emergency_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_emergency_alerts_select_estate_members
ON public.security_emergency_alerts FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_emergency_alerts.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'platform_admin'
  )
);

CREATE POLICY security_emergency_alerts_insert_security
ON public.security_emergency_alerts FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND status = 'active'
  AND resolved_by IS NULL
  AND resolved_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_emergency_alerts.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
);

CREATE POLICY security_emergency_alerts_update_security
ON public.security_emergency_alerts FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_emergency_alerts.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
)
WITH CHECK (
  resolved_by = (SELECT auth.uid())
  AND resolved_at IS NOT NULL
  AND status IN ('resolved', 'cancelled')
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_emergency_alerts.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
);

COMMIT;
