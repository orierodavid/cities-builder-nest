-- Resident-to-Facility-Manager support tickets.
-- Residents create tickets for their estate's active Facility Manager.
-- Replies stay in one ticket thread; there is no automatic Super Admin escalation.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete restrict,
  resident_user_id uuid not null references public.users(id) on delete restrict,
  assigned_manager_id uuid not null references public.users(id) on delete restrict,
  subject text not null check (char_length(btrim(subject)) between 3 and 160),
  status text not null default 'awaiting_management'
    check (status in ('awaiting_management','awaiting_resident','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists support_tickets_resident_updated_idx
  on public.support_tickets (resident_user_id, updated_at desc);
create index if not exists support_tickets_manager_status_updated_idx
  on public.support_tickets (assigned_manager_id, status, updated_at desc);
create index if not exists support_tickets_estate_updated_idx
  on public.support_tickets (estate_id, updated_at desc);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_user_id uuid not null references public.users(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at asc);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists support_tickets_participant_read on public.support_tickets;
create policy support_tickets_participant_read
on public.support_tickets for select to authenticated
using (
  resident_user_id = (select auth.uid())
  or (
    assigned_manager_id = (select auth.uid())
    and private.is_active_estate_manager(estate_id)
  )
);

drop policy if exists support_ticket_messages_participant_read on public.support_ticket_messages;
create policy support_ticket_messages_participant_read
on public.support_ticket_messages for select to authenticated
using (
  exists (
    select 1 from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and (
        t.resident_user_id = (select auth.uid())
        or (
          t.assigned_manager_id = (select auth.uid())
          and private.is_active_estate_manager(t.estate_id)
        )
      )
  )
);

revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_ticket_messages from anon, authenticated;
grant select on public.support_tickets to authenticated;
grant select on public.support_ticket_messages to authenticated;

create or replace function public.create_support_ticket(
  p_estate_id uuid,
  p_subject text,
  p_message text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_ticket_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not private.is_active_user(v_user_id) then raise exception 'Active account required'; end if;
  if char_length(btrim(coalesce(p_subject,''))) not between 3 and 160 then
    raise exception 'Subject must be between 3 and 160 characters';
  end if;
  if char_length(btrim(coalesce(p_message,''))) not between 1 and 10000 then
    raise exception 'Message must be between 1 and 10000 characters';
  end if;
  if not exists (
    select 1 from public.estate_memberships m
    where m.estate_id = p_estate_id and m.user_id = v_user_id
      and m.status = 'active' and m.membership_role = 'resident'
  ) then raise exception 'You are not an active resident of this estate'; end if;

  select m.user_id into v_manager_id
  from public.estate_memberships m
  where m.estate_id = p_estate_id
    and m.status = 'active'
    and m.membership_role = 'facility_manager'
    and private.is_active_user(m.user_id)
  order by m.created_at asc
  limit 1;

  if v_manager_id is null then
    raise exception 'Your estate does not currently have an active Facility Manager assigned';
  end if;

  insert into public.support_tickets (
    estate_id, resident_user_id, assigned_manager_id, subject, status
  ) values (
    p_estate_id, v_user_id, v_manager_id, btrim(p_subject), 'awaiting_management'
  ) returning id into v_ticket_id;

  insert into public.support_ticket_messages (ticket_id, sender_user_id, body)
  values (v_ticket_id, v_user_id, btrim(p_message));

  return v_ticket_id;
end;
$$;

create or replace function public.send_support_ticket_message(
  p_ticket_id uuid,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.support_tickets%rowtype;
  v_message_id uuid;
  v_is_manager boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not private.is_active_user(v_user_id) then raise exception 'Active account required'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 10000 then
    raise exception 'Message must be between 1 and 10000 characters';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then raise exception 'Ticket not found'; end if;
  if v_ticket.status = 'closed' then raise exception 'This ticket is closed'; end if;

  v_is_manager := (
    v_ticket.assigned_manager_id = v_user_id
    and private.is_active_estate_manager(v_ticket.estate_id)
  );

  if v_ticket.resident_user_id <> v_user_id and not v_is_manager then
    raise exception 'You are not allowed to reply to this ticket';
  end if;

  insert into public.support_ticket_messages (ticket_id, sender_user_id, body)
  values (p_ticket_id, v_user_id, btrim(p_body))
  returning id into v_message_id;

  update public.support_tickets
  set status = case when v_is_manager then 'awaiting_resident' else 'awaiting_management' end,
      updated_at = now()
  where id = p_ticket_id;

  return v_message_id;
end;
$$;

create or replace function public.close_support_ticket(p_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.support_tickets%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if v_ticket.resident_user_id <> v_user_id
     and not (v_ticket.assigned_manager_id = v_user_id and private.is_active_estate_manager(v_ticket.estate_id)) then
    raise exception 'You are not allowed to close this ticket';
  end if;
  update public.support_tickets
  set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_ticket_id and status <> 'closed';
  return true;
end;
$$;

revoke all on function public.create_support_ticket(uuid,text,text) from public, anon;
revoke all on function public.send_support_ticket_message(uuid,text) from public, anon;
revoke all on function public.close_support_ticket(uuid) from public, anon;
grant execute on function public.create_support_ticket(uuid,text,text) to authenticated;
grant execute on function public.send_support_ticket_message(uuid,text) to authenticated;
grant execute on function public.close_support_ticket(uuid) to authenticated;
