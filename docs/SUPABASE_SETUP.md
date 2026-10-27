# Supabase setup (default)

Supabase is the default database platform for Cities Builder Nest. Railway is optional for hosting the API/worker or as an alternative PostgreSQL provider.

## 1. Configure mobile authentication

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set:
- `EXPO_PUBLIC_SUPABASE_URL`: Project URL from Supabase Project Settings → API.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: project publishable key (or legacy anon key).
- `EXPO_PUBLIC_API_URL`: deployed API URL; use `http://localhost:4000` for a local web/dev environment. A physical phone needs your development machine's LAN IP instead of localhost.

Install mobile dependencies with the repository's package manager from `apps/mobile`, then run the typecheck. The app stores the Supabase session in AsyncStorage. Treat the publishable/anon key as public and rely on RLS; never put a service-role/secret key in an Expo variable.

In Supabase Dashboard → Authentication → URL Configuration, configure only the redirect URLs needed for the chosen app flow. Email confirmation may be enabled; in that case, signup may not create a session until the user confirms the email.

## 2. Configure API authentication

Copy `apps/api/.env.example` to `apps/api/.env` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the same project. Keep `AUTH_PROVIDER=supabase`. The API's `requireAuth` middleware validates bearer tokens with Supabase Auth using `auth.getUser(token)`; it does not merely decode the JWT. `GET /v1/me` uses the user's bearer token and public RLS policy to read only their own profile.

The API database connection `DATABASE_URL` is currently used only for health checks. Do not use a privileged PostgreSQL connection for user-scoped queries unless the API explicitly sets and safely scopes the database role/claims. Keep privileged finance and administration workflows server-only.

## 3. Profile creation

Migration `002_auth_rls_policies.sql` creates a trigger that inserts a matching `public.users` profile after a Supabase Auth user is created. If email confirmation is required, the profile may exist while the mobile app has no active session yet.

## 4. Tenant authorization status

The current endpoint verifies identity and reads the current user's own profile. It does not yet implement estate administration, estate-scoped business endpoints, platform-admin controls, or role-based API actions. For each future estate endpoint, derive the authenticated user from the validated token and check an active `estate_memberships` row for the requested estate and required role. Never trust a client-supplied estate ID, role, or user ID as proof of authorization.

Add automated tests for invalid/expired tokens, missing profiles, inactive memberships, and attempts to access another estate before enabling additional protected routes.

## 5. Database and financial safety

Review migrations in order: `001_initial_schema.sql`, `002_auth_rls_policies.sql`, `003_enterprise_tenant_isolation.sql`, `004_tenant_fk_indexes.sql`, and `005_foreign_key_indexes.sql`. The connected Supabase project has migrations 001–005 applied.

Financial tables (payment intents, withdrawals, ledger, provider events, reconciliation, audit logs) have no direct client-facing policies. Keep real-money operations disabled until server-controlled payment intents, verified provider webhooks, idempotency, ledger integrity, reconciliation, and required partner/legal/compliance/security reviews are complete.
