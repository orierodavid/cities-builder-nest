# Optional Supabase setup

Supabase is an alternative option. The project remains Railway-first until you deliberately configure and test a switch.

## 1. Create a project
Create a Supabase project and choose a strong database password. Save credentials in a secure password manager.

## 2. Configure the API
Copy `apps/api/.env.example` to a local `.env` file (never commit it). For Supabase PostgreSQL, set `DATABASE_URL` to the database connection string supplied by the Supabase dashboard. Use the connection method suitable for your runtime (direct or pooler).

If later using Supabase Auth, configure `SUPABASE_URL` and the appropriate server-side verification settings. Do not set `AUTH_PROVIDER=supabase` until token verification, role checks, and tests have actually been implemented.

## 3. Configure the mobile app
If the mobile app will use the Supabase client directly, copy `apps/mobile/.env.example` to a local environment file and provide the project URL and publishable/anon key. Install and configure the Supabase client only as part of a reviewed implementation change.

Never expose the service-role/secret key in Expo variables. Any variable prefixed with `EXPO_PUBLIC_` is bundled for the client and must be treated as public.

## 4. Database and security
Review and test `database/migrations/001_initial_schema.sql` against a clean Supabase database before applying it. If tables are accessed directly from mobile clients, enable and test Row Level Security policies before exposing them. The API must enforce roles and estate-level permissions as well.

## 5. Validate before switching
- Verify the API can connect to the selected database.
- Add automated migration and integration tests.
- Verify authentication and authorization, including resident/facility-manager/security boundaries.
- Test backups and recovery.
- Keep financial operations server-side and use verified financial-partner events.
- Never accept real-money transactions until the regulated partner, legal/compliance reviewers, and security reviewers approve the implementation.
