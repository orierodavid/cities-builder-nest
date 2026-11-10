# Controlled API load testing

CB Nest has two separate GitHub Actions load tests.

## 1. Database canary

`.github/workflows/api-load-test.yml` sends read-only requests to a CI-only route that executes `SELECT 1` through the API PostgreSQL pool. This is a basic HTTP/pool baseline only. It does not represent the cost of real application endpoints.

## 2. Realistic endpoint workload

`.github/workflows/api-realistic-load-test.yml` starts the actual Express API with `NATIVE_POSTGRES_READS=true`, an ephemeral PostgreSQL 16 database, synthetic fixture records, and a local Supabase-compatible Auth/PostgREST stub.

It exercises these real read routes:
- Facility Manager dashboard
- Resident visitor-pass history
- Event attendance summaries
- Event attendance report

The synthetic database includes role and estate membership records, 1,000 units, 250 maintenance requests, 50 announcements, 500 visitor passes, 50 events, 10,000 event guests, invitations and check-ins. Actual API authentication middleware, native PostgreSQL transaction handling, RLS fixture policies, repository SQL, and connection-pool behavior are exercised.

The local auth stub accepts only fixed test tokens and serves the test user's profile/legal-consent checks. It does not measure real Supabase Auth or production network latency. No production Supabase, resident data, email provider, Squad API, or payment workflow is contacted.

The realistic workload is read-only. It does not create/revoke visitor passes, check visitors in, mutate events, or issue payments. Its full profile progressively ramps through 250, 500, and 1,000 virtual users. Each virtual user waits one second between requests. The k6 workload supplies distinct synthetic client IPs through the one-hop trusted test ingress so the per-IP limiter is not accidentally measured as a single-client burst. This is a distributed-client simulation, not a rate-limit stress test.

The workflow uploads the k6 summary and API/auth logs as a 14-day artifact.

## Safety and interpretation

Both workflows are restricted to a local GitHub Actions ephemeral API/database. The realistic workflow's fixture SQL also refuses to run unless the current database is named `cbnest_load_test`.

These runs are repeatable CI benchmarks, not production capacity certification. The realistic test covers real Express routes and database query shapes but uses a reduced synthetic schema and local auth stub rather than the complete production Supabase environment. GitHub runner CPU, PostgreSQL resources, pool size and test data volume affect results. Review per-endpoint latency percentiles, throughput, HTTP failures, pool saturation and database constraints before setting acceptance targets or estimating VPS capacity.

For exact fixture and workload details, see [REALISTIC_API_LOAD_TEST.md](./REALISTIC_API_LOAD_TEST.md).
