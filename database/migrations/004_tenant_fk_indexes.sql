-- Cities Builder Nest: indexes for tenant-consistency foreign keys.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_units_building_estate_fk
  ON public.units (building_id, estate_id);
CREATE INDEX IF NOT EXISTS idx_resident_units_unit_estate_fk
  ON public.resident_units (unit_id, estate_id);
CREATE INDEX IF NOT EXISTS idx_resident_units_membership_estate_fk
  ON public.resident_units (estate_id, resident_user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_unit_estate_fk
  ON public.maintenance_requests (unit_id, estate_id);
COMMIT;
