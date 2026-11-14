# CB Nest mobile and management-app load simulation

This test simulates signed-in users navigating selected CB Nest app screens by issuing the same read-only Supabase REST/RPC and API data requests used to populate those screens. It is not a browser test and it does not launch hundreds of physical or emulated phones. k6 virtual users stay in one app role and pause between screen requests to approximate in-app navigation.

## Role journeys exercised

| Role | App screen / journey | Read-only data destination |
|---|---|---|
| Resident | Home profile | Supabase REST: `users` |
| Resident | My Property | Supabase REST: `resident_units`, `units`, `buildings`, `estates` |
| Resident | Service Charges | Supabase REST: `estate_memberships`, `service_charge_payments`, `estate_service_charges` |
| Resident | Payment History | Supabase REST: `service_charge_payments` (including its charge relation), `rent_savings_contributions`, `electricity_recharge_orders` |
| Resident | Visitor Management / history | API: `GET /v1/estates`; `GET /v1/estates/:estateId/visitor-passes` |
| Security | Profile and assigned estate context | Supabase REST: `users`, `estate_memberships`, `estates` |
| Security | Visitor Entry Records | API: `GET /v1/estates/:estateId/gate/visits` |
| Security | Shift Handover | API: `GET /v1/estates/:estateId/security/shift-handovers` |
| Security | Emergency Alerts | API: `GET /v1/estates/:estateId/emergency-alerts` |
| Security | Incident History | API: `GET /v1/estates/:estateId/security/incidents` |
| Facility Manager | Portal role/profile checks | Supabase REST: `user_roles`, `estate_memberships`, `users` |
| Facility Manager | Dashboard properties, residents and visitors | Supabase REST: `units`, `estate_memberships`, `visitor_visits`, `estate_events` |
| Facility Manager | Dashboard charges, payments and maintenance | Supabase REST: `estate_service_charges`, `service_charge_payments`, `maintenance_requests` |
| Super Admin | Portal role/profile checks | Supabase REST: `user_roles`, `users` |
| Super Admin | Estate and user management lists | Supabase REST: `estates`, `users` |
| Super Admin | Platform dashboard metrics and growth | Read-only Supabase RPCs: `get_platform_dashboard_metrics`, `get_platform_growth_analytics` |

The Security visitor-code lookup screen is not part of this all-GET/HEAD workload. Event Organiser is excluded from identities, memberships and simulated journeys.

## Safety and isolation

- Each run uses a disposable PostgreSQL 16 service populated only with synthetic fixtures.
- A local PostgREST service reads that database with PostgreSQL RLS enabled; a separate local Supabase Auth stub validates the synthetic app sessions used by the API.
- The API starts through the CI-only `load-test-server.ts` entry point with native PostgreSQL reads.
- k6 refuses to run unless both targets are exactly `http://127.0.0.1:4000` (API) and `http://127.0.0.1:4100` (isolated PostgREST), with explicit ephemeral CI confirmation.
- No production Supabase, Vercel API, payment provider, email provider or live estate records are used.
- Workload requests use GET or HEAD only. The dashboard RPC fixtures are read-only. No payments, visitor decisions, incident submissions, approvals, invitations, check-ins, deletes or other writes are generated.
- Synthetic role identities are Resident, Security, Facility Manager and Super Admin only. The fixtures include synthetic estate, unit, visitor, security, service-charge and payment-history records.

## Load profiles and measurements

The default push workflow runs sequential 250, 500 and 1,000 virtual-user stages. A manual dispatch can select `full`, `250`, `500` or `1000`.

The k6 summary reports average, median, p90, p95 and p99 latency, throughput (`http_reqs`), HTTP failure rate, checks, transport errors and timeouts. Request and custom screen-data latency metrics are tagged by role, screen, data source and observed concurrency band (`250`, `500`, `1000`) to compare performance as concurrency increases. Each virtual user remains in one role and pauses between screen requests.

Artifacts include the k6 JSON summary, API log, Auth-stub log and PostgREST log and are retained by GitHub Actions for 14 days.

## Interpretation and limitations

Results describe only the isolated GitHub Actions runner, its disposable PostgreSQL instance, local PostgREST service and local API process. They are not evidence of Vercel, production Supabase or real-device capacity.

This is a data/API load simulation of app journeys. It does not measure React Native rendering, device CPU/memory, poor mobile-network behavior, native navigation animation or screen paint time. It covers the listed high-traffic read paths, not every app route or every Supabase table/RPC. In particular, Security visitor-code lookup and some secondary screens are not included. No browser automation is required or run.

Production-safe observations, if separately authorized, must be reported separately and must never be mixed with isolated CI capacity figures. Do not send high-volume traffic to the live Vercel API.
