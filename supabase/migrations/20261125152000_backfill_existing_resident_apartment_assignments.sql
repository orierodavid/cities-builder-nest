DO $backfill$
DECLARE
  candidate record;
  building_row public.buildings%ROWTYPE;
  unit_row public.units%ROWTYPE;
  assigned_count integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.estate_memberships em ON em.user_id = u.id
    WHERE em.membership_role = 'resident' AND em.status = 'active'
      AND u.deleted_at IS NULL AND coalesce(u.is_disabled, false) = false
      AND coalesce(nullif(btrim(u.building_name), ''), nullif(btrim(u.house_number), '')) IS NOT NULL
      AND coalesce(nullif(btrim(u.unit_number), ''), nullif(btrim(u.home_number), '')) IS NOT NULL
    GROUP BY em.estate_id,
      lower(coalesce(nullif(btrim(u.building_name), ''), nullif(btrim(u.house_number), ''))),
      lower(coalesce(nullif(btrim(u.unit_number), ''), nullif(btrim(u.home_number), '')))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ambiguous_existing_resident_apartment_details';
  END IF;

  FOR candidate IN
    SELECT u.id AS user_id, em.estate_id,
      coalesce(nullif(btrim(u.building_name), ''), nullif(btrim(u.house_number), '')) AS building_name,
      coalesce(nullif(btrim(u.unit_number), ''), nullif(btrim(u.home_number), '')) AS unit_code
    FROM public.users u
    JOIN public.estate_memberships em ON em.user_id = u.id
    WHERE em.membership_role = 'resident' AND em.status = 'active'
      AND u.deleted_at IS NULL AND coalesce(u.is_disabled, false) = false
      AND coalesce(nullif(btrim(u.building_name), ''), nullif(btrim(u.house_number), '')) IS NOT NULL
      AND coalesce(nullif(btrim(u.unit_number), ''), nullif(btrim(u.home_number), '')) IS NOT NULL
    ORDER BY em.created_at, u.id
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.resident_user_id = candidate.user_id AND ru.end_date IS NULL
        AND (ru.estate_id <> candidate.estate_id)
    ) THEN
      RAISE EXCEPTION 'resident_has_conflicting_active_apartment_assignment:%', candidate.user_id;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      candidate.estate_id::text || ':' || lower(candidate.building_name) || ':' || lower(candidate.unit_code), 0
    ));

    SELECT b.* INTO building_row
    FROM public.buildings b
    WHERE b.estate_id = candidate.estate_id AND lower(b.name) = lower(candidate.building_name)
    ORDER BY b.created_at ASC LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.buildings(estate_id, name)
      VALUES (candidate.estate_id, candidate.building_name)
      RETURNING * INTO building_row;
    END IF;

    SELECT un.* INTO unit_row
    FROM public.units un
    WHERE un.estate_id = candidate.estate_id
      AND un.building_id = building_row.id
      AND lower(un.unit_code) = lower(candidate.unit_code)
    LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.units(estate_id, building_id, unit_code, unit_type, status)
      VALUES (candidate.estate_id, building_row.id, candidate.unit_code, 'Apartment', 'available')
      RETURNING * INTO unit_row;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.unit_id = unit_row.id AND ru.end_date IS NULL
        AND ru.resident_user_id <> candidate.user_id
    ) THEN
      RAISE EXCEPTION 'apartment_has_another_primary_resident:%', candidate.user_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.resident_user_id = candidate.user_id AND ru.end_date IS NULL
        AND ru.unit_id <> unit_row.id
    ) THEN
      RAISE EXCEPTION 'resident_has_multiple_active_apartments:%', candidate.user_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.resident_units ru
      WHERE ru.unit_id = unit_row.id AND ru.resident_user_id = candidate.user_id
        AND ru.end_date IS NULL
    ) THEN
      INSERT INTO public.resident_units(estate_id, unit_id, resident_user_id, start_date)
      VALUES (candidate.estate_id, unit_row.id, candidate.user_id, CURRENT_DATE);
      assigned_count := assigned_count + 1;
    END IF;

    UPDATE public.units SET status = 'occupied' WHERE id = unit_row.id;
  END LOOP;

  RAISE NOTICE 'Resident apartment assignments backfilled: %', assigned_count;
END;
$backfill$;
