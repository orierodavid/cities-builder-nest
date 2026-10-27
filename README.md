# Cities Builder Nest

A starter monorepo for an estate and community management app for iOS and Android.

## Architecture
- **Mobile:** React Native + Expo + TypeScript
- **API:** Node.js + TypeScript (host on an available provider; Railway is optional)
- **Database:** Supabase PostgreSQL by default
- **Authentication:** Supabase Auth sign-up/sign-in and API bearer-token validation are implemented; full estate-role authorization and end-to-end tests remain outstanding
- **Jobs:** Background worker for payment events and reconciliation (hosting provider is configurable)
- **Financial partner:** Holds Save for Rent funds and confirms deposits and payouts

## Local browser development

Open two VS Code terminals from the repository root.

### Terminal 1 — API

```powershell
cd apps\api
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Leave this terminal running. Verify the API by opening [http://localhost:4000/health](http://localhost:4000/health). A response with `"status":"ok"` means the HTTP service is running. `"database":"not-configured"` means the optional direct PostgreSQL connection string has not been set; estate data still depends on the configured Supabase project, schema, memberships, and RLS policies.

### Terminal 2 — Expo web

```powershell
cd apps\mobile
npm.cmd install
Copy-Item .env.example .env -Force
npx.cmd expo start --web --clear
```

Keep `EXPO_PUBLIC_API_URL=http://localhost:4000` for a browser running on the same computer. The mobile app and API must run in separate terminals. If an `.env` file already exists, review it before overwriting it.

The URL and `sb_publishable_...` value in the example files are public client configuration, not server secrets. Never put a Supabase service-role key or database password in the mobile app or commit them to Git. Email confirmation, database schema, RLS policies, and an active estate membership may still be required for all features to work.

## Enterprise multi-estate model
Cities Builder Nest is designed as one shared platform for many estates, not a single-estate deployment. Estate-scoped roles and memberships are separated from platform-wide administration, and the database enforces same-estate relationships between buildings, units, resident assignments, and maintenance requests. RLS remains fail-closed for finance, ledger, audit, and privileged administration paths until secure server endpoints are implemented and tested.

Apply reviewed migrations in order: `001_initial_schema.sql`, `002_auth_rls_policies.sql`, `003_enterprise_tenant_isolation.sql`, then `004_tenant_fk_indexes.sql` and `005_foreign_key_indexes.sql`. Migrations 003–005 are applied to the connected Supabase project; 004–005 add supporting indexes.

## Repository layout
- `apps/mobile` — Expo mobile application
- `apps/api` — HTTP API
- `database/migrations` — PostgreSQL schema migrations
- `docs` — architecture, API outline, database options, setup, and roadmap

## Initial setup
1. Install Node.js LTS and the Expo tooling.
2. Create a Supabase project and configure its PostgreSQL connection string as `DATABASE_URL` in `apps/api/.env`, using `apps/api/.env.example` as a template.
3. Review and test `database/migrations/001_initial_schema.sql` against the new Supabase database before applying it.
4. Install dependencies in `apps/api` and `apps/mobile` separately using each package's package manager.
5. Start the API and Expo app using the scripts in their package manifests.
6. Configure the mobile and API environment variables using their `.env.example` files. Run the CI typechecks and API middleware tests; then verify signup, email confirmation, sign-in, `/v1/me`, and estate isolation against the connected Supabase project. See `docs/SUPABASE_SETUP.md`.

Railway remains an optional hosting alternative. Supabase environment placeholders and documentation do not mean that Supabase Auth is already integrated or that deployment is complete.

## Important safety note
This is an early scaffold, not a production-ready financial application. Authentication scaffolding is implemented, but estate authorization, end-to-end security tests, provider integration, webhook verification, reconciliation jobs, and hardened deployment still need implementation. Do not accept real money until the regulated financial partner, legal/compliance reviewers, and security reviewers have approved the full flow.

Save for Rent amounts must use integer minor units (NGN kobo). Payment confirmations must come from verified provider events or status checks, with unique references, idempotency, append-only ledger records, atomic withdrawal reservations, audit trails, and reconciliation.
