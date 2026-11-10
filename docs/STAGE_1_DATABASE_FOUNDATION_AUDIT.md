# Stage 1 — Database foundation audit

Audit date: 2026-11-10  
Source reviewed: `main`  
Scope: API database access, current PostgreSQL connection setup, auth/RLS boundary, migration layout, and CI database coverage.

## Verified current state

- The API is an Express/TypeScript service in `apps/api`.
- `pg` is installed and `apps/api/src/storage.ts` creates a configurable `pg.Pool` when `DATABASE_URL` is present.
- The pool currently supports health checks and shutdown; it is not the API's general-purpose data-access path.
- `apps/api/src/server.ts` is 1,801 lines and contains the HTTP routes. Its current data access uses Supabase PostgREST and RPC calls.
- The API currently accesses these PostgREST tables: `announcements`, `buildings`, `estate_event_checkins`, `estate_event_guests`, `estate_event_invitations`, `estate_events`, `estate_memberships`, `estate_venues`, `estates`, `maintenance_requests`, `resident_units`, `security_emergency_alerts`, `security_incident_reports`, `security_shift_handovers`, `units`, `user_roles`, `users`, `visitor_pass_denials`, `visitor_passes`, and `visitor_visits`.
- API RPC calls currently include `get_active_resident_candidate`, `get_event_attendance_summaries`, and `publish_security_emergency_alert`. Auth middleware additionally calls `get_legal_consent_status`.
- The API also uses Supabase Auth for bearer-token validation and the Auth Admin API for selected account onboarding flows.
- `requireAuth` currently validates tokens remotely with `auth.getUser(token)`, then checks the user's active profile and legal-consent status through Supabase.
- Authenticated route queries use a user-scoped Supabase client and therefore rely on PostgreSQL RLS through PostgREST. Selected privileged workflows create a service-role Supabase client.
- Existing RLS integration tests exercise cross-estate and role isolation directly against PostgreSQL. They do not yet prove that the API's own `pg.Pool` access path applies those same claims and policies.
- The API's `DATABASE_URL` is optional in local configuration. The README explicitly says estate data currently continues to depend on Supabase when the direct connection is not configured.
- The repository contains both `database/migrations/` (numbered baseline/history) and `supabase/migrations/` (timestamped project migrations). The initial schema references Supabase's `auth.users` and `auth.uid()`; this is a real portability dependency, not a generic PostgreSQL-only schema.
- The CI API job has a temporary PostgreSQL 16 service and a separate disposable RLS test database. This is suitable for automated database tests, but it does not prove that a real Supabase connection string or production database role is configured.

## Access inventory

| API area | Current data access | Security / consistency requirements |
|---|---|---|
| Authentication and profile | Supabase Auth, `users`, legal-consent RPC | Validate JWT signature/session; active-account gate; legal consent gate; own-profile RLS |
| Roles and estate membership | `user_roles`, `estate_memberships`, `estates` | Platform roles distinct from estate roles; estate scoping; active membership |
| Resident/property directory | `users`, `buildings`, `units`, `resident_units` | Manager scope; resident's current assignment; free-text home details; tenant-consistent foreign keys |
| Announcements and maintenance | `announcements`, `maintenance_requests` | Estate scope; creator/manager visibility; validated assignments |
| Visitor gate | `visitor_passes`, `visitor_pass_denials`, `visitor_visits` | Host/security permissions; estate scope; lifecycle rules; atomic state transitions; code secrecy |
| Security operations | `security_shift_handovers`, `security_emergency_alerts`, `security_incident_reports` | Estate and role scope; controlled publish/resolve operations; auditability |
| Events and attendance | `estate_events`, `estate_venues`, `estate_event_guests`, `estate_event_invitations`, `estate_event_checkins` | Resident ownership, venue approval, invitation state, check-in uniqueness and event/estate scope |
| Privileged account onboarding | Supabase Auth Admin API plus service-role table writes | Must remain an explicitly privileged workflow; never run as an ordinary authenticated user |

The table inventory above is the set of API PostgREST targets found in the current TypeScript runtime files. It is not a claim that these are the only tables in the whole product: Supabase Edge Functions, web/mobile clients, triggers, and RPC implementations also access data.

## Stage 1 design constraints

1. Keep Supabase Auth as the token issuer and validator during this stage. Do not change the mobile/web sign-in contract.
2. Native PostgreSQL user-scoped queries must run inside a transaction with the validated user's identity and the `authenticated` database role applied transaction-locally. RLS must remain enabled and effective.
3. Do not connect ordinary API requests as a role with `BYPASSRLS`. Do not silently fall back to a privileged connection if `SET LOCAL ROLE authenticated` fails.
4. Privileged workflows must be separately identified and reviewed. They must not inherit the ordinary user's database context or be made privileged just to make a query pass.
5. Multi-row state changes (resident-unit assignment, visitor lifecycle, event invitation/check-in, and financial operations) need explicit transaction boundaries and database constraints. Financial workflows require additional idempotency and ledger review in their later agreed stage; do not redesign those here.
6. Preserve current API response shapes and status/error behavior during route-by-route migration.
7. Do not remove PostgREST access until the equivalent native query and authorization behavior has integration coverage.
8. The current schema's Supabase dependencies (`auth.users`, `auth.uid()`, Auth triggers, Supabase roles/functions) must be inventoried and replaced or deliberately retained before claiming VPS portability.

## Initial implementation boundary

The first native access primitive is intentionally limited to user-scoped, RLS-enforced transactions. It does not expose a service-role bypass and does not migrate any route by itself. Its PostgreSQL integration test uses a disposable CI database and proves that the transaction-local identity is honored by RLS. This test does not establish that the user's actual Supabase `DATABASE_URL` has the required role membership; that must be verified against the configured database before a route is switched.

## Outstanding Stage 1 work

- Verify the actual local `DATABASE_URL` configuration and its database role; no secret value should be shared in chat or committed.
- Verify transaction-local role switching and all required RLS grants against the actual Supabase project, not only CI's PostgreSQL fixture.
- Build typed repositories and migrate one low-risk read route at a time.
- Inventory each RPC's SQL body and preserve its authorization and transaction semantics.
- Inventory all privileged service-role operations and design an explicit privileged repository boundary.
- Establish migration ownership/order and detect drift between `database/migrations/` and `supabase/migrations/`.
- Add route-level parity tests for every migrated route, including cross-estate denial and response-contract checks.
- Only mark Stage 1 complete after the API's primary data access has been migrated and verified, not merely because the pool and transaction helper exist.
