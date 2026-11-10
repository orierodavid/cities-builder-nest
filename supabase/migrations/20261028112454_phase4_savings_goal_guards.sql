-- Phase 4: harden resident savings-goal writes without enabling payments.
BEGIN;
CREATE OR REPLACE FUNCTION private.guard_resident_savings_goal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.resident_user_id IS DISTINCT FROM actor_id THEN
        RAISE EXCEPTION 'savings_goal_owner_mismatch' USING ERRCODE = '42501';
      END IF;
      IF NEW.status <> 'active' THEN
        RAISE EXCEPTION 'savings_goal_initial_status_must_be_active' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF OLD.resident_user_id IS DISTINCT FROM actor_id
         OR NEW.resident_user_id IS DISTINCT FROM OLD.resident_user_id THEN
        RAISE EXCEPTION 'savings_goal_owner_immutable' USING ERRCODE = '42501';
      END IF;
      IF NEW.estate_id IS DISTINCT FROM OLD.estate_id THEN
        RAISE EXCEPTION 'savings_goal_estate_immutable' USING ERRCODE = '42501';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status = 'active' AND NEW.status IN ('paused', 'cancelled') THEN
          NULL;
        ELSIF OLD.status = 'paused' AND NEW.status IN ('active', 'cancelled') THEN
          NULL;
        ELSE
          RAISE EXCEPTION 'invalid_savings_goal_status_transition' USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
    IF NEW.estate_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.estate_memberships m
      WHERE m.estate_id = NEW.estate_id AND m.user_id = actor_id
        AND m.membership_role = 'resident' AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'active_resident_membership_required_for_estate_goal' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.target_amount_kobo <= 0 OR NEW.currency <> 'NGN' THEN
    RAISE EXCEPTION 'invalid_savings_goal_amount_or_currency' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_resident_savings_goal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_resident_savings_goal_write ON public.rent_savings_goals;
CREATE TRIGGER guard_resident_savings_goal_write
BEFORE INSERT OR UPDATE ON public.rent_savings_goals
FOR EACH ROW EXECUTE FUNCTION private.guard_resident_savings_goal();
COMMIT;