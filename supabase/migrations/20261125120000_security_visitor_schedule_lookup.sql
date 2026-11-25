-- Security-scoped schedule lookup avoids granting broad table reads to gate staff.
CREATE OR REPLACE FUNCTION public.get_visitor_pass_schedule_for_security(
  p_estate_id uuid, p_visitor_pass_id uuid
)
RETURNS TABLE(
  visitor_count integer, visit_frequency text,
  schedule_start_date date, schedule_end_date date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = p_estate_id AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.membership_role = 'security'
  ) THEN
    RAISE EXCEPTION 'security_membership_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.visitor_count,p.visit_frequency,p.schedule_start_date,p.schedule_end_date
    FROM public.visitor_passes p
    WHERE p.id = p_visitor_pass_id AND p.estate_id = p_estate_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_visitor_pass_schedule_for_security(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_visitor_pass_schedule_for_security(uuid,uuid) TO authenticated;
