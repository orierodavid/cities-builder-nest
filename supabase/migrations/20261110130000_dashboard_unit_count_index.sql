-- Speed up estate dashboard unit totals.
-- The dashboard counts all units by estate and occupied units by estate/status.
-- A single composite index supports both predicates and can enable index-only counts.
create index if not exists idx_units_estate_status_dashboard
  on public.units (estate_id, status);
