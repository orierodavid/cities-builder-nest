-- Enforce pass validity, estate availability, and single-use semantics at the database boundary.
BEGIN;

CREATE OR REPLACE FUNCTION private.consume_visitor_pass_on_check_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  consumed_pass_id uuid;
  current_pass_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.estates e
    WHERE e.id = NEW.estate_id AND e.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'Estate is disabled or unavailable'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.visitor_passes p
     SET status = 'used'
   WHERE p.id = NEW.visitor_pass_id
     AND p.estate_id = NEW.estate_id
     AND p.status = 'active'
     AND p.valid_from <= now()
     AND p.valid_until > now()
  RETURNING p.id INTO consumed_pass_id;

  IF consumed_pass_id IS NULL THEN
    SELECT p.status INTO current_pass_status
      FROM public.visitor_passes p
     WHERE p.id = NEW.visitor_pass_id
       AND p.estate_id = NEW.estate_id;

    IF current_pass_status = 'used' THEN
      RAISE EXCEPTION 'Visitor pass already used'
        USING ERRCODE = '23505';
    END IF;

    RAISE EXCEPTION 'Visitor pass is invalid, expired, revoked, or belongs to another estate'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.consume_visitor_pass_on_check_in() FROM PUBLIC, anon, authenticated;

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
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reject_disabled_visitor_pass_creation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS visitor_pass_enabled_estate_guard ON public.visitor_passes;
CREATE TRIGGER visitor_pass_enabled_estate_guard
BEFORE INSERT ON public.visitor_passes
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_visitor_pass_creation();

COMMIT;