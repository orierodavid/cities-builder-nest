alter table public.users
  add column if not exists building_name text,
  add column if not exists unit_number text;

create or replace function public.management_update_resident_profile(
  p_estate_id uuid,
  p_resident_user_id uuid,
  p_full_name text,
  p_phone_e164 text,
  p_home_number text,
  p_street_name text,
  p_building_name text,
  p_unit_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_home text := nullif(btrim(coalesce(p_home_number, '')), '');
  v_street text := nullif(btrim(coalesce(p_street_name, '')), '');
  v_building text := nullif(btrim(coalesce(p_building_name, '')), '');
  v_unit text := nullif(btrim(coalesce(p_unit_number, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Enter a valid resident name';
  end if;
  if v_phone is not null and (char_length(v_phone) < 7 or char_length(v_phone) > 20) then
    raise exception 'Enter a valid phone number';
  end if;
  if v_home is not null and char_length(v_home) > 80 then
    raise exception 'Home or apartment number is too long';
  end if;
  if v_street is not null and char_length(v_street) > 160 then
    raise exception 'Street name is too long';
  end if;
  if v_building is not null and char_length(v_building) > 120 then
    raise exception 'Building name is too long';
  end if;
  if v_unit is not null and char_length(v_unit) > 80 then
    raise exception 'Unit number is too long';
  end if;
  if not private.is_platform_admin()
     and not private.is_active_estate_manager(p_estate_id) then
    raise exception 'You are not authorised to manage residents in this estate';
  end if;
  if not exists (
    select 1
    from public.estate_memberships m
    where m.estate_id = p_estate_id
      and m.user_id = p_resident_user_id
      and m.membership_role = 'resident'
      and m.status in ('active', 'invited')
  ) then
    raise exception 'Resident does not belong to this estate';
  end if;

  update public.users
  set full_name = v_name,
      first_name = split_part(v_name, ' ', 1),
      last_name = nullif(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''),
      phone_e164 = v_phone,
      home_number = v_home,
      street_name = v_street,
      building_name = v_building,
      unit_number = v_unit,
      updated_at = now()
  where id = p_resident_user_id;

  if not found then
    raise exception 'Resident profile was not found';
  end if;
end;
$function$;

revoke all on function public.management_update_resident_profile(uuid,uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.management_update_resident_profile(uuid,uuid,text,text,text,text,text,text) to authenticated;
