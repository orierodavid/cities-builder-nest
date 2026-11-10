-- Aggregate event attendance in PostgreSQL rather than transferring every guest,
-- invitation, and check-in row to the API process. SECURITY INVOKER preserves
-- the caller's RLS visibility on all three source tables.
create or replace function public.get_event_attendance_summaries(
  p_estate_id uuid,
  p_event_ids uuid[]
)
returns table (
  event_id uuid,
  total_guests bigint,
  checked_in bigint,
  active_invitations bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_events as (
    select distinct unnest(coalesce(p_event_ids, '{}'::uuid[])) as event_id
  ),
  guest_counts as (
    select g.event_id, count(*) as total_guests
    from public.estate_event_guests g
    join requested_events r on r.event_id = g.event_id
    where g.estate_id = p_estate_id
    group by g.event_id
  ),
  checkin_counts as (
    select c.event_id, count(*) as checked_in
    from public.estate_event_checkins c
    join requested_events r on r.event_id = c.event_id
    where c.estate_id = p_estate_id
    group by c.event_id
  ),
  invitation_counts as (
    select i.event_id, count(*) as active_invitations
    from public.estate_event_invitations i
    join requested_events r on r.event_id = i.event_id
    where i.estate_id = p_estate_id
      and i.status = 'active'
    group by i.event_id
  )
  select
    r.event_id,
    coalesce(g.total_guests, 0)::bigint,
    coalesce(c.checked_in, 0)::bigint,
    coalesce(i.active_invitations, 0)::bigint
  from requested_events r
  left join guest_counts g on g.event_id = r.event_id
  left join checkin_counts c on c.event_id = r.event_id
  left join invitation_counts i on i.event_id = r.event_id;
$$;

revoke all on function public.get_event_attendance_summaries(uuid, uuid[]) from public, anon;
grant execute on function public.get_event_attendance_summaries(uuid, uuid[]) to authenticated;
