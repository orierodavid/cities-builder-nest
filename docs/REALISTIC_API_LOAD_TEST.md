# CB Nest app-role load simulation

This is an isolated API/data-load simulation of the read-only app journeys for the Resident, Security, Facility Manager and Super Admin roles. It is not a browser test and it does not launch hundreds of native app instances. k6 virtual users act like signed-in app users: they open a role's initial context and request the data for successive app screens, pausing between screens to approximate a person navigating the app.

## Role journeys exercised

| App role | Screen / navigation destination | API request |
|---|---|---|
| Resident | Home profile | `GET /v1/me` |
| Resident | Estate / property context | `GET /v1/estates` |
| Resident | Visitor management history | `GET /v1/estates/:estateId/visitor-passes?page=1&pageSize=20` |
| Security | Security home / assigned estate | `GET /v1/estates` |
| Security | Visitor entry records | `GET /v1/estates/:estateId/gate/visits?page=1&pageSize=20` |
| Security | Shift handover | `GET /v1/estates/:estateId/security/shift-handovers?page=1&pageSize=20` |
| Security | Emergency alerts | `GET /v1/estates/:estateId/emergency-alerts?page=1&pageSize=20` |
| Security | Incident history | `GET /v1/estates/:estateId/security/incidents?page=1&pageSize=20` |
| Facility Manager | Management profile | `GET /v1/me` |
| Facility Manager | Estate dashboard | `GET /v1/estates/:estateId/dashboard` |
| Facility Manager | Estate list | `GET /v1/estates` |
| Facility Manager | Building directory | `GET /v1/estates/:estateId/buildings?page=1&pageSize=20` |
| Facility Manager | Property units | `GET /v1/estates/:estateId/units?page=1&pageSize=20` |
| Facility Manager | Resident directory | `GET /v1/estates/:estateId/residents?page=1&pageSize=20` |
| Super Admin | Admin profile and role | `GET /v1/me` |
| Super Admin | Platform estate list | `GET /v1/estates` |
| Super Admin | Estate overview | `GET /v1/estates/:estateId/dashboard` |
| Super Admin | Building directory | `GET /v1/estates/:estateId/buildings?page=1&pageSize=20` |
| Super Admin | Property units | `GET /v1/estates/:estateId/units?page=1&pageSize=20` |
| Super Admin | Resident directory | `GET /v1/estates/:estateId/residents?page=1&pageSize=20` |

Event Organiser is excluded from the load-test identities, fixture memberships and k6 workloads.

## Safety and isolation

- A disposable PostgreSQL 16 service is created for each GitHub Actions run.
- Authentication is handled by a local synthetic Supabase Auth stub.
- The API starts through the CI-only `load-test-server.ts` entry point with native PostgreSQL reads.
- The k6 script refuses to run unless the target is exactly `http://127.0.0.1:4000` and the ephemeral CI confirmation variables are present.
- No production Supabase, Vercel API, payment provider, email provider or live estate records are used.
- All tested destinations are GET reads. No payments, visitor decisions, incident submissions, approvals, invitations, check-ins, deletes or other writes are generated.
- The fixtures include synthetic role identities, an estate, property units, visitor passes, gate records, shift handovers, alerts and incidents. The fixture policies are designed to preserve the role-scoped read boundaries used by the endpoints.

## Load profiles and measurements

The default push workflow runs sequential 250, 500 and 1,000 virtual-user stages. A manual dispatch can select `full`, `250`, `500` or `1000`.

The k6 summary exports average, median, p90, p95 and p99 request latency, throughput (`http_reqs`), HTTP failure rate, checks, transport errors and timeouts. Request and custom screen-API latency metrics are tagged by role, screen and observed concurrency band (`250`, `500`, `1000`) so the latency percentiles can be compared as concurrency increases. Each virtual user remains in one role and pauses between screen requests.

Artifacts include the k6 JSON summary, API log and auth-stub log and are retained by GitHub Actions for 14 days.

## Interpretation and limitations

These measurements describe the isolated CI runner, its disposable PostgreSQL instance, API process and synthetic fixtures only. They are not evidence of Vercel, production Supabase or real-device capacity.

This workload measures the API/data requests used to populate selected app screens. It does not measure React Native rendering, device memory/CPU, network quality on physical phones, native navigation animation, or screen paint time. Some CB Nest screens read Supabase tables or RPCs directly (including portions of service-charge/payment history and management dashboards); those direct Supabase queries are not represented by these API routes. Security visitor-code verification is a POST lookup operation and is intentionally omitted from this all-GET run. The current simulation therefore does not claim complete screen or data-source coverage.

Production-safe observations, if separately authorized, must be reported separately and must never be mixed with isolated CI capacity figures. Do not send high-volume traffic to the live Vercel API.
