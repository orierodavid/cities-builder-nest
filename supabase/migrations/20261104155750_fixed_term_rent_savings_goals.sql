ALTER TABLE public.rent_savings_goals
  ADD COLUMN IF NOT EXISTS duration_months smallint NOT NULL DEFAULT 3;

ALTER TABLE public.rent_savings_goals
  DROP CONSTRAINT IF EXISTS rent_savings_goals_duration_months_check;
ALTER TABLE public.rent_savings_goals
  ADD CONSTRAINT rent_savings_goals_duration_months_check
  CHECK (duration_months IN (3, 6));

CREATE OR REPLACE FUNCTION private.guard_resident_savings_goal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.duration_months NOT IN (3, 6) THEN
      RAISE EXCEPTION 'savings_goal_duration_must_be_three_or_six_months' USING ERRCODE = '22023';
    END IF;
    NEW.target_date := (CURRENT_DATE + make_interval(months => NEW.duration_months))::date;
    NEW.status := 'active';
    IF actor_id IS NOT NULL AND NEW.resident_user_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'savings_goal_owner_mismatch' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.resident_user_id IS DISTINCT FROM OLD.resident_user_id THEN
      RAISE EXCEPTION 'savings_goal_owner_immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.estate_id IS DISTINCT FROM OLD.estate_id THEN
      RAISE EXCEPTION 'savings_goal_estate_immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.duration_months IS DISTINCT FROM OLD.duration_months
       OR NEW.target_date IS DISTINCT FROM OLD.target_date
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'savings_goal_term_is_immutable' USING ERRCODE = '42501';
    END IF;
    IF actor_id IS NOT NULL AND OLD.resident_user_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'savings_goal_owner_mismatch' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'active' AND NEW.status = 'completed'
         AND CURRENT_DATE >= OLD.target_date THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'savings_goal_cannot_be_paused_or_cancelled_and_must_run_full_term' USING ERRCODE = '22023';
      END IF;
    END IF;
    NEW.updated_at := now();
  END IF;

  IF NEW.estate_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = NEW.estate_id
      AND m.user_id = NEW.resident_user_id
      AND m.membership_role = 'resident'
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_resident_membership_required_for_estate_goal' USING ERRCODE = '42501';
  END IF;

  IF NEW.target_amount_kobo <= 0 OR NEW.currency <> 'NGN' THEN
    RAISE EXCEPTION 'invalid_savings_goal_amount_or_currency' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_resident_savings_goal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_resident_savings_goal_write ON public.rent_savings_goals;
CREATE TRIGGER guard_resident_savings_goal_write
BEFORE INSERT OR UPDATE ON public.rent_savings_goals
FOR EACH ROW EXECUTE FUNCTION private.guard_resident_savings_goal();