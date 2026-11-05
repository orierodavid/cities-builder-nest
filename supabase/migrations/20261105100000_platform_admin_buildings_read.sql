-- Allow platform administrators to inspect building records across estates.
-- Estate managers retain their existing estate-scoped SELECT policy.
create policy "buildings_select_platform_admin"
on public.buildings
for select
to authenticated
using (private.is_platform_admin());
