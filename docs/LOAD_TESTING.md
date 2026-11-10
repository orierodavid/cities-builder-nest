# Controlled API load testing

The repository supports two separate test modes:

1. **GitHub Actions ephemeral test (available now):** builds and starts the API against a disposable PostgreSQL service, then sends read-only load to a CI-only database query route. It never connects to the live Supabase project or payment provider.
2. **Isolated staging deployment (optional later):** uses the authenticated `GET /v1/me` endpoint with a dedicated staging account and token. Never point it at production.

## GitHub Actions ephemeral test

The workflow `.github/workflows/api-load-test.yml` runs when its load-test files change on `main`, and can also be started manually from the Actions tab.

It starts:
- a temporary PostgreSQL 16 service with an empty disposable database
- the API compiled from the checked-out commit
- a CI-only `GET /__loadtest/database-read` route that executes `SELECT 1` through the API's configured PostgreSQL connection pool
- k6 in a pinned container image

The test route is registered only when all three conditions are true: `CI=true`, `NODE_ENV=test`, and `LOAD_TEST_MODE=true`. The separate load-test server entry point refuses to start unless those conditions are present. It is not part of the production bootstrap and is not registered in normal development or production mode.

The k6 script requires explicit confirmation and restricts this mode to `http://127.0.0.1` and the exact CI-only route. It does not call `/health`, Supabase, authenticated user data, payments, email, visitor/event mutations, or background-job writes.

## Profiles

The progressive `full` profile runs:
- 250 virtual users: 1-minute ramp, 2-minute hold
- 500 virtual users: 1-minute ramp, 2-minute hold
- 1,000 virtual users: 1-minute ramp, 2-minute hold
- 1-minute ramp down

Each virtual user waits one second between requests. Virtual users are not a fixed requests-per-second guarantee. GitHub-hosted runner capacity may itself become the bottleneck at 1,000 VUs; the result must therefore be treated as a CI baseline, not a production capacity certification.

The workflow uploads the k6 JSON summary and API log as a run artifact. Review request count, request rate, latency percentiles, failed checks, HTTP errors, and runner/database constraints before drawing conclusions.

## Isolated staging API (not run by this workflow)

For a future isolated staging deployment, use only `GET /v1/me` with a dedicated staging account and short-lived token. Set `LOAD_TEST_ENVIRONMENT=isolated-staging`, `LOAD_TEST_CONFIRM=YES`, an exact HTTPS target host, and the token through a protected secret. Do not use production credentials or production data.

## Safety and interpretation

- Never load-test the live production API or live Supabase project with this harness.
- No write endpoints or payment provider calls are included.
- The CI database is temporary and contains no production data.
- The CI-only `SELECT 1` route measures Express request handling and PostgreSQL pool/query throughput. It does not represent dashboard query complexity, Supabase Auth latency, or end-to-end production behavior.
- Do not invent an acceptance SLA. Record the observed latency and error rates, then set explicit targets before any production readiness decision.

## Current status

The GitHub Actions workflow is configured to run the ephemeral profile after its commit lands on `main`. The resulting run and artifact must be inspected before reporting measurements.
