-- Allow active estate managers/admins to create unpublished announcement drafts only.
BEGIN;
DROP POLICY IF EXISTS announcements_insert_manager ON public.announcements;
CREATE POLICY announcements_insert_manager
  ON public.announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND published_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.estate_memberships m
      WHERE m.estate_id = announcements.estate_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.membership_role IN ('estate_manager', 'estate_admin')
    )
  );
COMMIT;
