# Database and service options

Cities Builder Nest currently defaults to Railway for the API, PostgreSQL, and background worker. Supabase is documented as an optional alternative, not an active dependency.

## Option A — Railway (current default)
- Deploy the Node.js API and background worker on Railway.
- Use Railway PostgreSQL through `DATABASE_URL`.
- Configure secrets in Railway project variables.

## Option B — Supabase
- Use a Supabase project for PostgreSQL and, optionally, Supabase Auth.
- Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` only if a future server-side integration needs them.
- For direct PostgreSQL connections, obtain the connection string from the Supabase dashboard and store it as `DATABASE_URL` in the API runtime. Prefer the pooler connection for serverless/high-connection environments where appropriate.
- Keep the API as the only trusted place for privileged business operations and financial state transitions.

## Switching options
1. Choose one primary PostgreSQL database for each environment.
2. Set `DATABASE_URL` to the selected provider's database connection string.
3. If using Supabase Auth, implement and test token verification in the API before enabling protected routes. Merely setting the environment variables does not enable authentication.
4. Apply reviewed migrations to the selected database. The SQL migration in this repository is a starting point and should be tested against a fresh database before production use.
5. Update deployment variables and run database, API, and mobile integration tests.
6. If migrating an existing database, plan and verify a data export/import, row counts, constraints, indexes, and rollback strategy. Do not point two environments at production data accidentally.

## Security notes
- Never commit real keys or database passwords.
- A Supabase publishable/anon key is not a substitute for access control. Configure Row Level Security for any tables exposed through Supabase client APIs.
- Never ship the Supabase service-role/secret key in the mobile app. It bypasses Row Level Security and must remain server-side.
- If using Supabase Auth, the API must validate access tokens and enforce application roles and estate-level permissions.
- Save for Rent still requires a regulated financial partner, verified provider events, idempotency, an append-only ledger, atomic withdrawal reservations, audit trails, and reconciliation. Supabase does not itself replace the financial partner.

See `apps/api/.env.example` for placeholder environment variables.
