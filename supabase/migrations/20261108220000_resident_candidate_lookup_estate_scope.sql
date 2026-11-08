-- Restrict resident candidate lookup to residents who belong to the requested estate.
-- The function runs as SECURITY DEFINER, so the membership boundary must be explicit.
begin;

create or replace function public.get_active_resident_candidate(
  target_estate_id uuid,
  target_user_id uuid
)
returns table(id uuid, full_name text, phone_e164 text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.id, u.full_name, u.phone_e164, u.is_active
  from public.users u
  join public.estates e on e.id = target_estate_id
  where u.id = target_user_id
    and u.is_active = true
    and e.is_enabled = true
    and exists (
      select 1
      from public.estate_memberships em
      where em.estate_id = target_estate_id
        and em.user_id = target_user_id
        and em.membership_role = 'resident'
        and em.status = 'active'
    )
    and (
      private.is_platform_admin()
      or private.is_active_estate_manager(target_estate_id)
    );
$function$;

revoke all on function public.get_active_resident_candidate(uuid, uuid) from public, anon;
grant execute on function public.get_active_resident_candidate(uuid, uuid) to authenticated;

commit;
