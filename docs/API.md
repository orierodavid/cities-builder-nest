# API outline

Initial health endpoint:
- `GET /health` — process health check.

Planned authenticated API groups:
- `/auth` — sign-in, session refresh, account recovery
- `/me` — current user and role
- `/estates`, `/buildings`, `/units`
- `/announcements`
- `/maintenance`
- `/visitor-passes`
- `/savings/goals`, `/savings/payment-intents`, `/savings/withdrawals`

This list is a planning outline, not a claim that all routes are implemented. Financial endpoints must enforce authorization, idempotency, server-side verification, and audit logging.
