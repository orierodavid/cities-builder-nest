create or replace function private.validate_estate_event_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = new.estate_id
      and m.user_id = new.created_by
      and m.status = 'active'
      and m.membership_role in ('resident','event_organiser')
  ) then
    raise exception 'Event creator must be an active resident or legacy event organiser in the same estate'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;