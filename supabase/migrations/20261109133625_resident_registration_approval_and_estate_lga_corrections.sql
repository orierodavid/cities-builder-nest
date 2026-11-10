-- Resident self-registration and administrator approval.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

ALTER TABLE public.estates
  ADD COLUMN IF NOT EXISTS lga text;

-- Correct the two known estate locations before enabling State/LGA-based registration.
UPDATE public.estates SET state = 'Lagos', lga = 'Alimosho' WHERE id = 'b634ce1b-587c-45ef-8d7a-657ac3666627' AND name = 'Peace Estate';
UPDATE public.estates SET state = 'Lagos', lga = 'Eti-Osa' WHERE id = '03b1d138-7f0d-4b6b-8543-e656503fdbe1' AND name = 'Oniru Estate Lekki';

UPDATE public.estates
SET lga = COALESCE(NULLIF(BTRIM(lga), ''), NULLIF(BTRIM(city), ''), 'Unknown')
WHERE lga IS NULL OR BTRIM(lga) = '';

CREATE TABLE IF NOT EXISTS public.resident_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('account_pending_approval', 'account_activated')),
  recipient_email text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS resident_email_notifications_user_created_idx
  ON public.resident_email_notifications(user_id, created_at DESC);

ALTER TABLE public.resident_email_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resident_email_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.resident_email_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.approve_resident_account(
  p_estate_id uuid,
  p_user_id uuid,
  p_approver_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_user uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_approver_id AND ur.role = 'platform_admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.estate_memberships manager
    WHERE manager.estate_id = p_estate_id
      AND manager.user_id = p_approver_id
      AND manager.membership_role = 'facility_manager'
      AND manager.status = 'active'
  ) THEN
    RAISE EXCEPTION 'resident_approval_not_authorized';
  END IF;

  UPDATE public.estate_memberships
  SET status = 'active'
  WHERE estate_id = p_estate_id
    AND user_id = p_user_id
    AND membership_role = 'resident'
    AND status = 'invited';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.users
  SET is_active = true, updated_at = now()
  WHERE id = p_user_id
  RETURNING id INTO v_updated_user;

  IF v_updated_user IS NULL THEN
    RAISE EXCEPTION 'resident_profile_not_found';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_resident_account(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_resident_account(uuid, uuid, uuid) TO service_role;

COMMIT;
