# Controlled API load testing

This test harness is for an **isolated staging environment only**. It is not a production smoke test and must not be pointed at the live API, live Supabase project, payment provider, or production database.

## What the script does

`load-tests/api-read-only.js` uses k6 and makes GET requests only:

- `/health`: exercises API health and, when `DATABASE_URL` is configured, the API's database connectivity check.
- `/v1/me`: optional authenticated read path. It exercises bearer-token verification and the account/legal-consent checks. Use a dedicated staging test account and token, never a personal or production token.

No accounts, payments, visitors, events, emails, or queue jobs are created. The script refuses to run unless the environment and confirmation variables are explicitly set, the exact target host is allowlisted, and HTTPS is used. HTTP is allowed only for localhost when separately enabled. It refuses direct `.supabase.co` targets.

## Profiles

Each profile ramps up for one minute, holds for two minutes, then ramps down for one minute:

- `250`: up to 250 virtual users
- `500`: up to 500 virtual users
- `1000`: up to 1,000 virtual users
- `full`: progressive 250, 500, then 1,000 virtual users, with two-minute holds at each level

Run the individual profiles in order first. Run `full` only after reviewing the lower-level results. These are virtual users, not a guarantee of a specific requests-per-second rate; each VU pauses for one second between requests.

## Prerequisites and target setup

1. Provision a separate staging API deployment and a separate staging Supabase project/database. Do not reuse production credentials or data.
2. Seed only synthetic test data. Ensure payment, email, SMS, and other external side effects are disabled in staging.
3. Confirm staging has adequate database connection limits, pool settings, Redis capacity, CPU/RAM monitoring, and backups.
4. Choose either `/health` first or `/v1/me` with a dedicated staging test account.
5. Install k6 locally or use the official `grafana/k6` Docker image.

## Run with Docker (PowerShell)

From the repository root, set the exact host in both variables. Do not paste secrets into source files or commit them.

```powershell
$env:LOAD_TEST_ENVIRONMENT = "isolated-staging"
$env:LOAD_TEST_CONFIRM = "YES"
$env:LOAD_TEST_BASE_URL = "https://staging-api.example.test"
$env:LOAD_TEST_ALLOWED_HOST = "staging-api.example.test"
$env:LOAD_TEST_PATH = "/health"
$env:LOAD_TEST_PROFILE = "250"

docker run --rm -i `
  -e LOAD_TEST_ENVIRONMENT -e LOAD_TEST_CONFIRM `
  -e LOAD_TEST_BASE_URL -e LOAD_TEST_ALLOWED_HOST `
  -e LOAD_TEST_PATH -e LOAD_TEST_PROFILE `
  -v "${PWD}:/work" -w /work grafana/k6 run load-tests/api-read-only.js
```

To exercise the authenticated read path, set `LOAD_TEST_PATH=/v1/me` and set `LOAD_TEST_BEARER_TOKEN` to a short-lived token for the dedicated staging test account. Pass the token to Docker with `-e LOAD_TEST_BEARER_TOKEN`; do not place it in this file, a command committed to the repository, or a CI log.

For local Docker testing only, `http://localhost:4000` may be used by setting `LOAD_TEST_ALLOW_LOCAL_HTTP=true` and `LOAD_TEST_ALLOWED_HOST=localhost:4000`. Do not use this exception for remote hosts.

## Results to record

For every run, record:

- profile, target host, endpoint, test date/time, commit SHA, and staging configuration
- total requests, request rate, check/error rate, and p50/p90/p95/p99 latency
- API CPU and memory, restarts, event-loop/timeout symptoms, and HTTP 5xx/429 counts
- PostgreSQL active/idle connections, pool wait time/timeouts, CPU, memory, slow queries, and connection saturation
- Redis memory, command latency, evictions, and connection errors where Redis is in the request path

Do not invent an acceptance SLA. Agree the required latency, error-rate, and resource headroom targets before executing the first staging run, then compare every profile against those targets. Stop immediately if staging becomes unhealthy, connections saturate, unexpected side effects occur, or the target is not positively confirmed as isolated staging.

## Current status

The script and procedure are committed as preparation only. No load test has been run, no staging API host has been supplied or verified, and no production service has been load-tested.
