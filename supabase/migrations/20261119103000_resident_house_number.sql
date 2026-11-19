-- Keep the resident's apartment/suite in the existing home_number column
-- and store the separate street-facing house number independently.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS house_number text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_house_number_length_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_house_number_length_check
      CHECK (house_number IS NULL OR char_length(house_number) BETWEEN 1 AND 80);
  END IF;
END
$$;
