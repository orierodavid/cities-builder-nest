-- Security staff can verify an event invitation without broad access to guest/invitation tables.
BEGIN;

CREATE OR REPLACE FUNCTION public.verify_estate_event_invitation_for_security(
  target_estate_id uuid,
  target_event_id uuid,
  target_code_hash text
)
RETURNS TABLE (
  status text,
  event_data jsonb,
  invitation_data jsonb,
  guest_data jsonb,
  check_in_data jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  event_row public.estate_events%ROWTYPE;
  invitation_row public.estate_event_invitations%ROWTYPE;
  guest_row public.estate_event_guests%ROWTYPE;
  checkin_row public.estate_event_checkins%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR target_code_hash IS NULL OR length(target_code_hash) <> 64 THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF NOT public.current_user_has_required_legal_consent()
     OR NOT EXISTS (
       SELECT 1
       FROM public.estate_memberships m
       JOIN public.estates e ON e.id = m.estate_id
       WHERE m.estate_id = target_estate_id
         AND m.user_id = actor_id
         AND m.membership_role = 'security'
         AND m.status = 'active'
         AND e.is_enabled = true
     ) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT e.* INTO event_row
  FROM public.estate_events e
  WHERE e.id = target_event_id AND e.estate_id = target_estate_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'event_not_found'::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF event_row.venue_approval_status IS NOT NULL AND event_row.venue_approval_status <> 'approved' THEN
    RETURN QUERY SELECT 'venue_pending'::text, to_jsonb(event_row), NULL::jsonb, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;
  IF event_row.status <> 'published' THEN
    RETURN QUERY SELECT 'event_not_open'::text, to_jsonb(event_row), NULL::jsonb, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT i.* INTO invitation_row
  FROM public.estate_event_invitations i
  WHERE i.estate_id = target_estate_id
    AND i.event_id = target_event_id
    AND i.code_hash = target_code_hash
    AND i.status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invitation_not_found'::text, to_jsonb(event_row), NULL::jsonb, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT g.* INTO guest_row
  FROM public.estate_event_guests g
  WHERE g.id = invitation_row.guest_id
    AND g.estate_id = target_estate_id
    AND g.event_id = target_event_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'guest_not_found'::text, to_jsonb(event_row),
      jsonb_build_object('id', invitation_row.id, 'status', invitation_row.status), NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT c.* INTO checkin_row
  FROM public.estate_event_checkins c
  WHERE c.estate_id = target_estate_id
    AND c.event_id = target_event_id
    AND c.guest_id = guest_row.id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT 'already_checked_in'::text,
      jsonb_build_object('id', event_row.id, 'estate_id', event_row.estate_id, 'title', event_row.title,
        'venue', event_row.venue, 'starts_at', event_row.starts_at, 'ends_at', event_row.ends_at,
        'status', event_row.status, 'venue_approval_status', event_row.venue_approval_status),
      jsonb_build_object('id', invitation_row.id, 'status', invitation_row.status),
      jsonb_build_object('id', guest_row.id, 'guest_name', guest_row.guest_name, 'email', guest_row.email, 'phone', guest_row.phone),
      jsonb_build_object('id', checkin_row.id, 'checked_in_at', checkin_row.checked_in_at);
    RETURN;
  END IF;

  RETURN QUERY SELECT 'verified'::text,
    jsonb_build_object('id', event_row.id, 'estate_id', event_row.estate_id, 'title', event_row.title,
      'venue', event_row.venue, 'starts_at', event_row.starts_at, 'ends_at', event_row.ends_at,
      'status', event_row.status, 'venue_approval_status', event_row.venue_approval_status),
    jsonb_build_object('id', invitation_row.id, 'status', invitation_row.status),
    jsonb_build_object('id', guest_row.id, 'guest_name', guest_row.guest_name, 'email', guest_row.email, 'phone', guest_row.phone),
    NULL::jsonb;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_estate_event_invitation_for_security(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_estate_event_invitation_for_security(uuid, uuid, text) TO authenticated;

COMMIT;
