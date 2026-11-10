-- A visitor pass represents one entry only. This prevents concurrent or replayed
-- check-ins, including attempts to reuse a pass after its original visit is checked out.
create unique index if not exists visitor_visits_one_entry_per_pass
  on public.visitor_visits (visitor_pass_id);