# Cities Builder Nest

A starter monorepo for an estate and community management app for iOS and Android.

## Architecture
- **Mobile:** React Native + Expo + TypeScript
- **API:** Node.js + TypeScript
- **Database:** PostgreSQL hosted on Railway
- **Jobs:** Railway worker for payment events and reconciliation
- **Financial partner:** Holds Save for Rent funds and confirms deposits and payouts

## Repository layout
- `apps/mobile` — Expo mobile application
- `apps/api` — HTTP API
- `database/migrations` — PostgreSQL schema migrations
- `docs` — architecture, API outline, and roadmap

## Initial setup
1. Install Node.js LTS and the Expo tooling.
2. Configure environment variables from `apps/api/.env.example`.
3. Create a Railway PostgreSQL service and apply the SQL migration in `database/migrations`.
4. Install dependencies in `apps/api` and `apps/mobile` separately using each package's package manager.
5. Start the API and Expo app using the scripts in their package manifests.

## Important safety note
This is an early scaffold, not a production-ready financial application. Authentication, authorization, tests, provider integration, webhook verification, reconciliation jobs, and hardened deployment still need implementation. Do not accept real money until the regulated financial partner, legal/compliance reviewers, and security reviewers have approved the full flow.

Save for Rent amounts must use integer minor units (NGN kobo). Payment confirmations must come from verified provider events or status checks, with unique references, idempotency, append-only ledger records, atomic withdrawal reservations, audit trails, and reconciliation.
