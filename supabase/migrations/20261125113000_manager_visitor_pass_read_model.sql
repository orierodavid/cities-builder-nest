-- Safe management read model for visitor passes; access-code hashes/ciphertext are excluded.
DROP POLICY IF EXISTS estate_managers_view_visitor_passes ON public.visitor_passes;
CREATE POLICY estate_managers_view_visitor_passes ON public.visitor_passes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = visitor_passes.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('facility_manager','estate_manager','estate_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'platform_admin'
    )
  );

CREATE OR REPLACE VIEW public.manager_visitor_passes
WITH (security_invoker = true)
AS
SELECT id, estate_id, host_user_id, visitor_name, visitor_phone,
       visitor_count, visit_frequency, schedule_start_date, schedule_end_date,
       valid_from, valid_until, status, created_at
FROM public.visitor_passes;
GRANT SELECT ON public.manager_visitor_passes TO authenticated;
