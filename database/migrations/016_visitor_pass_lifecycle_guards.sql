-- Make visitor-pass use single-use and fail closed at the database boundary.
-- A successful check-in consumes the pass in the same transaction as the visit insert.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS visitor_visits_one_visit_per_pass
  ON public.visitor_visits(visitor_pass_id);

CREATE OR REPLACE FUNCTION private.consume_visitor_pass_on_check_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pass_estate_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = NEW.estate_id AND e.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'Estate is disabled or unavailable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.visitor_passes p
     SET status = 'used'
   WHERE p.id = NEW.visitor_pass_id
     AND p.estate_id = NEW.estate_id
     AND p.status = 'active'
     AND p.valid_from <= now()
     AND p.valid_until > now()
  RETURNING p.estate_id INTO pass_estate_id;

  IF pass_estate_id IS NULL THEN
    RAISE EXCEPTION 'Visitor pass is invalid, expired, revoked, already used, or belongs to another estate'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visitor_pass_consume_on_check_in ON public.visitor_visits;
CREATE TRIGGER visitor_pass_consume_on_check_in
BEFORE INSERT ON public.visitor_visits
FOR EACH ROW EXECUTE FUNCTION private.consume_visitor_pass_on_check_in();

CREATE OR REPLACE FUNCTION private.reject_disabled_visitor_pass_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = NEW.estate_id AND e.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'Cannot create visitor pass for disabled estate'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visitor_pass_enabled_estate_guard ON public.visitor_passes;
CREATE TRIGGER visitor_pass_enabled_estate_guard
BEFORE INSERT ON public.visitor_passes
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_visitor_pass_creation();

COMMIT;
