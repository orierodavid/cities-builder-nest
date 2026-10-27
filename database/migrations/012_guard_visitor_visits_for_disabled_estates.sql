-- Enforce estate subscription status for visitor gate writes at the database layer.
-- The API checks are useful for clear errors, but database enforcement protects
-- against writes from any other authenticated client.
BEGIN;

DROP TRIGGER IF EXISTS estate_enabled_visitor_visits_guard ON public.visitor_visits;
CREATE TRIGGER estate_enabled_visitor_visits_guard
BEFORE INSERT OR UPDATE OF estate_id, visitor_pass_id, checked_in_by, checked_out_by, checked_out_at
ON public.visitor_visits
FOR EACH ROW EXECUTE FUNCTION private.reject_disabled_estate_operations();

COMMIT;
