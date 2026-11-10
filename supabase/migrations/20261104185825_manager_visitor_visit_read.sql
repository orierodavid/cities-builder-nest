create policy "visitor_visits_manager_select"
on public.visitor_visits
for select
to authenticated
using (private.is_active_estate_manager(estate_id));
