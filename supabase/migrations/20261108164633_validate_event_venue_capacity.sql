create or replace function public.validate_estate_event_venue_capacity()
returns trigger language plpgsql set search_path=public as $$
declare v_capacity integer; v_status text;
begin
 if new.venue_id is null then return new; end if;
 select capacity,status into v_capacity,v_status from public.estate_venues where id=new.venue_id and estate_id=new.estate_id;
 if not found then raise exception 'Selected venue is not available in this estate.'; end if;
 if v_status <> 'available' then raise exception 'Selected venue is not currently available.'; end if;
 if new.expected_attendance is not null and new.expected_attendance > v_capacity then
  raise exception 'Expected attendance (%) exceeds venue capacity (%).',new.expected_attendance,v_capacity;
 end if;
 return new;
end $$;
drop trigger if exists estate_events_validate_venue_capacity on public.estate_events;
create trigger estate_events_validate_venue_capacity before insert or update of venue_id,estate_id,expected_attendance on public.estate_events for each row execute function public.validate_estate_event_venue_capacity();
revoke all on function public.validate_estate_event_venue_capacity() from public,anon,authenticated;
