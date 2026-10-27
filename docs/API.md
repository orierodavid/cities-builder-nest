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


## Estate setup and membership onboarding (implemented)

All routes below require a valid Supabase access token in `Authorization: Bearer <token>`. Authorization is checked server-side and writes are subject to Supabase RLS.

- `POST /v1/estates` — platform admin only. Body: `{ "name", "address", "city", "state", "countryCode"?, "timezone"? }`. Creates an estate.

- `PATCH /v1/estates/:estateId/subscription` — platform admin only. Body: `{ "enabled": boolean, "reason"?: string }`. Disables or re-enables an estate. Disabling blocks dashboard access and database writes for estate operations; re-enabling clears the suspension metadata. Requires migration `009_estate_subscription_status.sql`.
- `POST /v1/estates/:estateId/staff` — platform admin only. Body: `{ "userId", "role": "facility_manager" | "security" }`. Assigns an existing active account to that estate.
- `POST /v1/estates/:estateId/residents` — assigned facility/estate manager or platform admin. Body: `{ "userId" }`. Adds an existing active account as a resident of that estate.\n- `POST /v1/estates/:estateId/buildings` — assigned facility/estate manager or platform admin. Body: `{ "name" }`. Creates a building in the estate.\n- `POST /v1/estates/:estateId/buildings/:buildingId/units` — assigned facility/estate manager or platform admin. Body: `{ "unitCode", "unitType"? }`. Creates an available unit after verifying the building belongs to that estate.\n- `POST /v1/estates/:estateId/units/:unitId/assignments` — assigned facility/estate manager or platform admin. Body: `{ "residentUserId", "startDate"? }`. Assigns an active resident membership to an available unit in the same estate. Requires migration `007_resident_unit_assignment.sql`.

**Current limitation:** These endpoints link existing registered accounts; they do not send email invitations or create Supabase Auth users. Building and unit creation require migration `008_building_unit_management.sql`; unit assignment requires migration `007_resident_unit_assignment.sql`; estate subscription controls require migration `009_estate_subscription_status.sql`. Do not pass passwords or service-role credentials from the mobile app. The first platform-admin account must be bootstrapped by a trusted database operator; there is no public endpoint for granting platform-admin status.
