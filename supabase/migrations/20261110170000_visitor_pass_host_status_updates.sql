-- Allow residents to reactivate or revoke only their own eligible visitor passes.
-- Column-level grants prevent authenticated clients from changing pass ownership,
-- access-code material, validity windows, or other protected fields.
BEGIN;

REVOKE UPDATE ON TABLE public.visitor_passes FROM authenticated;
GRANT UPDATE (status) ON TABLE public.visitor_passes TO authenticated;

DROP POLICY IF EXISTS visitor_passes_update_host_status ON public.visitor_passes;
CREATE POLICY visitor_passes_update_host_status
ON public.visitor_passes
FOR UPDATE
TO authenticated
USING (
  host_user_id = (SELECT auth.uid())
  AND status IN ('active', 'revoked')
  AND EXISTS (
    SELECT 1
    FROM public.estate_memberships m
    WHERE m.estate_id = visitor_passes.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'resident'
  )
)
WITH CHECK (
  host_user_id = (SELECT auth.uid())
  AND status IN ('active', 'revoked')
  AND EXISTS (
    SELECT 1
    FROM public.estate_memberships m
    WHERE m.estate_id = visitor_passes.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'resident'
  )
);

COMMIT;
