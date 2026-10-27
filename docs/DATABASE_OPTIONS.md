# Database and service options

Cities Builder Nest now defaults to **Supabase PostgreSQL** because Railway signup is currently unavailable to the project owner. Railway remains an optional API/worker hosting alternative if access becomes available later.

## Option A — Supabase (default)
- Create a Supabase project for PostgreSQL.
- Set the API runtime's `DATABASE_URL` to the database connection string from the Supabase dashboard. Choose the direct or pooler connection appropriate for the runtime.
- Supabase Auth is the intended default for user authentication, but token verification in the API, role/estate checks, and mobile sign-in still require implementation and tests.
- Keep secrets in local untracked environment files or the chosen hosting provider's secret manager.

## Option B — Railway (optional)
- If Railway signup becomes available, deploy the Node.js API and background worker there.
- You can use Railway PostgreSQL instead by changing `DATABASE_URL` to that database's connection string.
- Keep provider secrets in deployment variables.

## Switching database providers
1. Choose one primary PostgreSQL database for each environment.
2. Set `DATABASE_URL` to the selected provider's database connection string.
3. If using Supabase Auth, implement and test token verification in the API before enabling protected routes. Environment variables alone do not enable authentication.
4. Apply reviewed migrations to the selected database. The SQL migration in this repository is a starting point and should be tested against a fresh database before production use.
5. Update deployment variables and run database, API, and mobile integration tests.
6. If migrating an existing database, plan and verify a data export/import, row counts, constraints, indexes, and rollback strategy. Do not point two environments at production data accidentally.

## Security notes
- Never commit real keys or database passwords.
- A Supabase publishable/anon key is not a substitute for access control. Configure Row Level Security for any tables exposed through Supabase client APIs.
- Never ship the Supabase service-role/secret key in the mobile app. It bypasses Row Level Security and must remain server-side.
- The API must validate access tokens and enforce application roles and estate-level permissions.
- Save for Rent still requires a regulated financial partner, verified provider events, idempotency, an append-only ledger, atomic withdrawal reservations, audit trails, and reconciliation. Supabase does not itself replace the financial partner.

See `apps/api/.env.example` for placeholder environment variables.
