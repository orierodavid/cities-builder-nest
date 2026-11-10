# Background worker

The API background worker is a separate, long-running Node.js process. It shares the API's PostgreSQL connection configuration and does not expose an HTTP port.

## Current handlers

- `email.send`: sends queued welcome emails through Resend.
- `notification.deliver` and `report.generate`: reserved queue types; the worker deliberately does not claim these until their handlers are implemented. Resident in-app notifications currently use existing transactional database inbox writes and realtime updates, so no duplicate notification worker is added. Event attendance reports are currently authorization-scoped, paginated reads; a generated-file/export workflow has not yet been defined.

## Required configuration

- `DATABASE_URL`: PostgreSQL connection string used by the API.
- `EMAIL_DELIVERY_ENABLED`: must be explicitly set to `true` before the worker claims email jobs. Defaults to disabled.
- `RESEND_API_KEY`: Resend API key, configured only in the worker's private environment.
- `WELCOME_EMAIL_FROM`: verified sender address configured in the worker's private environment.

Optional:
- `WORKER_POLL_INTERVAL_MS`: polling interval, default 3000; allowed 250–60000.
- `WORKER_BATCH_SIZE`: jobs claimed per batch, default 5; allowed 1–50.

Do not put credentials, payment secrets, or account passwords in job payloads. Email job payloads contain only the recipient address/name and the composed message.

## Run

From `apps/api`:

```sh
npm install
npm run build
npm run worker
```

For development, use `npm run worker:dev`.

Run this as a supervised background service, separate from the web/API process. Send SIGTERM or SIGINT for graceful shutdown. The process emits structured JSON logs for startup, polling errors, job outcomes, and shutdown; it does not log message contents or provider credentials.

## Queue monitoring

The authenticated endpoint `GET /v1/admin/background-jobs` is restricted to platform administrators. It returns counts grouped by job type and status, stale-running counts (leases older than five minutes), the oldest queued timestamp, and failures updated in the last 24 hours. It intentionally excludes payloads, recipient details, provider responses, and raw error text. Expired leases are reclaimed by the next worker claim; the monitor is read-only and does not retry or mutate jobs.

## Deployment status

The worker code is committed, but it is not deployed or running in production. Do not enable the Edge Function's queue-based send path in production until a worker host is configured and the worker's private environment has been set. Email sending remains disabled unless `EMAIL_DELIVERY_ENABLED=true` is explicitly supplied to the worker.
