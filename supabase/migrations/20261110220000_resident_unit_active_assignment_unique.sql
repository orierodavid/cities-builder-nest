-- Prevent concurrent workflows from assigning one unit to multiple active residents.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS resident_units_one_active_assignment_per_unit_idx
  ON public.resident_units (unit_id)
  WHERE end_date IS NULL;
COMMIT;
