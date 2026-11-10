BEGIN;
DROP POLICY IF EXISTS visitor_passes_select_estate_manager ON public.visitor_passes;
CREATE POLICY visitor_passes_select_estate_manager
ON public.visitor_passes FOR SELECT TO authenticated
USING (private.is_platform_admin() OR private.is_active_estate_manager(estate_id));

DROP POLICY IF EXISTS savings_goals_select_estate_manager ON public.rent_savings_goals;
CREATE POLICY savings_goals_select_estate_manager
ON public.rent_savings_goals FOR SELECT TO authenticated
USING (private.is_platform_admin() OR private.is_active_estate_manager(estate_id));
COMMIT;