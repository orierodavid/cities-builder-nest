-- Allow an alert issuer to read the notification row they just created for recipient fan-out.
BEGIN;

DROP POLICY IF EXISTS security_read_own_sent_notifications
  ON public.resident_notifications;
CREATE POLICY security_read_own_sent_notifications
ON public.resident_notifications FOR SELECT TO authenticated USING (
  sent_by = (SELECT auth.uid())
  AND sent_by_role = 'security'
);

COMMIT;
