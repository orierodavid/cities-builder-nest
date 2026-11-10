-- Keep emergency-alert delivery under caller RLS rather than SECURITY DEFINER.
BEGIN;

DROP POLICY IF EXISTS security_send_resident_notifications
  ON public.resident_notifications;
CREATE POLICY security_send_resident_notifications
ON public.resident_notifications FOR INSERT TO authenticated WITH CHECK (
  sent_by = (SELECT auth.uid())
  AND sent_by_role = 'security'
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
);

DROP POLICY IF EXISTS security_deliver_resident_notifications
  ON public.resident_notification_recipients;
CREATE POLICY security_deliver_resident_notifications
ON public.resident_notification_recipients FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.resident_notifications n
    WHERE n.id = resident_notification_recipients.notification_id
      AND n.sent_by = (SELECT auth.uid())
      AND n.sent_by_role = 'security'
  )
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships sender
    WHERE sender.estate_id = resident_notification_recipients.estate_id
      AND sender.user_id = (SELECT auth.uid())
      AND sender.status = 'active'
      AND sender.membership_role = 'security'
  )
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships recipient
    WHERE recipient.estate_id = resident_notification_recipients.estate_id
      AND recipient.user_id = resident_notification_recipients.recipient_user_id
      AND recipient.status = 'active'
      AND recipient.membership_role = 'resident'
  )
);

CREATE OR REPLACE FUNCTION public.publish_security_emergency_alert(
  p_estate_id uuid,
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_location text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_alert_id uuid;
  v_notification_id uuid;
  v_created_at timestamptz;
  v_recipient_count integer := 0;
  v_alert jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING errcode = '28000';
  END IF;

  IF p_alert_type NOT IN ('security_threat', 'fire', 'medical', 'utility', 'weather', 'other')
     OR p_severity NOT IN ('high', 'critical')
     OR char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 3 AND 160
     OR char_length(btrim(coalesce(p_message, ''))) NOT BETWEEN 10 AND 3000
     OR char_length(coalesce(p_location, '')) > 240 THEN
    RAISE EXCEPTION 'invalid_emergency_alert' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = p_estate_id AND m.user_id = v_actor
      AND m.status = 'active' AND m.membership_role = 'security'
  ) THEN
    RAISE EXCEPTION 'security_membership_required' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.estates e WHERE e.id = p_estate_id AND e.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'estate_subscription_inactive' USING errcode = '42501';
  END IF;

  INSERT INTO public.security_emergency_alerts (
    estate_id, created_by, alert_type, severity, title, message, location, status
  ) VALUES (
    p_estate_id, v_actor, p_alert_type, p_severity, btrim(p_title),
    btrim(p_message), nullif(btrim(coalesce(p_location, '')), ''), 'active'
  )
  RETURNING id, created_at INTO v_alert_id, v_created_at;

  v_alert := pg_catalog.jsonb_build_object(
    'id', v_alert_id, 'estate_id', p_estate_id, 'created_by', v_actor,
    'alert_type', p_alert_type, 'severity', p_severity, 'title', btrim(p_title),
    'message', btrim(p_message), 'location', nullif(btrim(coalesce(p_location, '')), ''),
    'status', 'active', 'resolved_by', NULL, 'resolved_at', NULL, 'created_at', v_created_at
  );

  IF EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = p_estate_id AND m.membership_role = 'resident' AND m.status = 'active'
  ) THEN
    INSERT INTO public.resident_notifications(title, body, priority, sent_by, sent_by_role)
    VALUES (btrim(p_title), btrim(p_message), 'urgent', v_actor, 'security')
    RETURNING id INTO v_notification_id;

    INSERT INTO public.resident_notification_recipients(notification_id, recipient_user_id, estate_id)
    SELECT v_notification_id, m.user_id, m.estate_id
    FROM public.estate_memberships m
    WHERE m.estate_id = p_estate_id
      AND m.membership_role = 'resident'
      AND m.status = 'active'
    ON CONFLICT (notification_id, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS v_recipient_count = ROW_COUNT;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'alert', v_alert,
    'notificationId', v_notification_id,
    'recipientCount', v_recipient_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_security_emergency_alert(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_security_emergency_alert(uuid, text, text, text, text, text) TO authenticated;

COMMIT;
