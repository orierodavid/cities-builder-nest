BEGIN;
ALTER TABLE public.resident_household_invites
  DROP CONSTRAINT IF EXISTS resident_household_invites_invitee_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS resident_household_invites_one_pending_per_invitee_idx
  ON public.resident_household_invites(invitee_user_id)
  WHERE invitee_user_id IS NOT NULL AND status = 'pending';
COMMIT;