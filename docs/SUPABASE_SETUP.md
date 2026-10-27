# Supabase setup (default)

Supabase is the default database platform for Cities Builder Nest. Railway is optional for hosting the API/worker or as an alternative PostgreSQL provider.

## 1. Create a project
Create a Supabase project and choose a strong database password. Save credentials in a secure password manager.

## 2. Configure the API database
Copy `apps/api/.env.example` to a local `.env` file (never commit it). Set `DATABASE_URL` to the PostgreSQL connection string supplied by the Supabase dashboard. Choose the direct or pooler connection method suitable for the runtime.

The current API uses the standard PostgreSQL driver. This supports database connectivity through `DATABASE_URL`; it does not automatically enable Supabase Auth.

## 3. Authentication status
Supabase Auth is the intended default, but the scaffold still needs:
- Supabase Auth sign-up/sign-in flows in the mobile app.
- API access-token verification.
- Role and estate-level authorization checks on protected routes.
- Tests for expired/invalid tokens and cross-estate access.

Do not treat authentication as complete until these changes are implemented and tested. Keep `AUTH_PROVIDER=local` until the actual Supabase Auth integration is ready.

## 4. Configure the mobile app
If the mobile app will use the Supabase client directly, copy `apps/mobile/.env.example` to a local environment file and provide the project URL and publishable/anon key. Install and configure the Supabase client only as part of a reviewed implementation change.

Never expose the service-role/secret key in Expo variables. Any variable prefixed with `EXPO_PUBLIC_` is bundled for the client and must be treated as public.

## 5. Database and security
Review and test `database/migrations/001_initial_schema.sql` against a clean Supabase database before applying it. If tables are accessed directly from mobile clients, enable and test Row Level Security policies before exposing them. The API must enforce roles and estate-level permissions as well.

## 6. Validate before launch
- Verify the API can connect to the selected database.
- Add automated migration and integration tests.
- Verify authentication and authorization, including resident/facility-manager/security boundaries.
- Test backups and recovery.
- Keep financial operations server-side and use verified financial-partner events.
- Never accept real-money transactions until the regulated partner, legal/compliance reviewers, and security reviewers approve the implementation.
