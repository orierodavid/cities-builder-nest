BEGIN;

DROP POLICY IF EXISTS "Managers view estate recharge orders" ON public.electricity_recharge_orders;
CREATE POLICY "Managers view estate recharge orders"
ON public.electricity_recharge_orders FOR SELECT TO authenticated
USING (private.is_platform_admin() OR private.is_active_estate_manager(estate_id));

DROP POLICY IF EXISTS "Managers view estate service charge payments" ON public.service_charge_payments;
CREATE POLICY "Managers view estate service charge payments"
ON public.service_charge_payments FOR SELECT TO authenticated
USING (private.is_platform_admin() OR private.is_active_estate_manager(estate_id));

DROP POLICY IF EXISTS "Managers view estate rent savings contributions" ON public.rent_savings_contributions;
CREATE POLICY "Managers view estate rent savings contributions"
ON public.rent_savings_contributions FOR SELECT TO authenticated
USING (private.is_platform_admin() OR private.is_active_estate_manager(estate_id));

DROP POLICY IF EXISTS visitor_visits_manager_select ON public.visitor_visits;
CREATE POLICY visitor_visits_manager_select
ON public.visitor_visits FOR SELECT TO authenticated
USING (private.is_platform_admin() OR private.is_active_estate_manager(estate_id));

COMMIT;