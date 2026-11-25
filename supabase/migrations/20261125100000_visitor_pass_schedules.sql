-- Visitor pass details: group size and one-time/daily/weekly validity schedule.
ALTER TABLE public.visitor_passes
  ADD COLUMN IF NOT EXISTS visitor_count integer NOT NULL DEFAULT 1
    CHECK (visitor_count BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS visit_frequency text NOT NULL DEFAULT 'once'
    CHECK (visit_frequency IN ('once','daily','weekly')),
  ADD COLUMN IF NOT EXISTS schedule_start_date date,
  ADD COLUMN IF NOT EXISTS schedule_end_date date;
UPDATE public.visitor_passes
SET schedule_start_date = COALESCE(schedule_start_date, (valid_from AT TIME ZONE 'Africa/Lagos')::date),
    schedule_end_date = COALESCE(schedule_end_date, (valid_until AT TIME ZONE 'Africa/Lagos')::date);
ALTER TABLE public.visitor_passes
  ALTER COLUMN schedule_start_date SET NOT NULL,
  ALTER COLUMN schedule_end_date SET NOT NULL;
ALTER TABLE public.visitor_passes
  ADD CONSTRAINT visitor_pass_schedule_dates_valid
  CHECK (schedule_end_date >= schedule_start_date);
