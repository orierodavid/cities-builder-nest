# CB Nest tester release checklist

This guide prepares a controlled external test release. It does not make the current production data safe for public testing by itself.

## Current release blockers

- The Vercel project has a READY production deployment, but Vercel Authentication (SSO) is enabled for non-custom domains. Do not disable it globally just to share a preview.
- The API is a separate Express service. The repository has a Railway configuration file, but a live public API URL and a successful public `/health` response have not yet been verified.
- Mobile currently defaults to `EXPO_PUBLIC_API_URL=http://localhost:4000` in its example environment. A tester build must use the deployed HTTPS API URL, never localhost.
- No EAS project ID or EAS build profile was previously committed. The build profiles in `apps/mobile/eas.json` are now added, but they still need to be linked to an Expo account/project and supplied with environment variables.
- Do not issue test accounts against real estates or real resident/payment data. Create a dedicated test estate and test users for each role first.

## 1. Deploy the API

Create a Railway service from `orierodavid/cities-builder-nest`:

- Service root directory: `/apps/api`
- Builder: Nixpacks
- Build command: `npm install --no-audit --no-fund && npm run build`
- Start command: `npm start`
- Health-check path: `/health`
- Restart on failure: enabled

Configure server-side variables in Railway (never in Expo/mobile):

- `NODE_ENV=production`
- `SUPABASE_URL=https://ldnxotehzkrrtovelmiz.supabase.co`
- `SUPABASE_ANON_KEY`: the project's publishable/anon key
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service role key
- `CORS_ORIGINS`: exact trusted web origins, comma-separated; do not use wildcard origins
- `TRUST_PROXY_HOPS=1` when running behind Railway's single ingress proxy
- Let Railway provide `PORT`

`DATABASE_URL` is optional for the current `/health` implementation; when present, the health route also checks the direct PostgreSQL pool. The application still uses Supabase APIs for its estate data. Do not paste database credentials into GitHub or this document.

After deployment, verify:
- `https://YOUR-API-DOMAIN/health` returns HTTP 200.
- Response reports `status: ok` and `authentication: configured`.
- `database: not-configured` is expected if the optional direct `DATABASE_URL` has not been set; it is not proof that the Supabase REST connection is unavailable.
- Confirm the API's required production secrets exist before inviting testers. Production shared rate limiting and event gate verification require the service-role key.

## 2. Configure Expo EAS

From PowerShell:

```powershell
cd apps\mobile
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest build:configure
```

Follow the EAS prompts to link this app to the correct Expo account and project. EAS will add the project ID to Expo configuration; do not invent or manually guess that ID.

In the Expo project's EAS environment settings, create the `preview` environment variables:

- `EXPO_PUBLIC_SUPABASE_URL=https://ldnxotehzkrrtovelmiz.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: the project's publishable/anon key
- `EXPO_PUBLIC_API_URL=https://YOUR-API-DOMAIN`

Use the same public client values and the production API URL in the `production` environment only when a production release is approved. Never add `SUPABASE_SERVICE_ROLE_KEY`, database passwords, Squad secret keys, or other server secrets to EAS variables prefixed with `EXPO_PUBLIC_`.

Build an internal Android APK:

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
```

For iPhone testing, configure the Apple Developer account and device distribution, then use an iOS internal build or TestFlight. TestFlight/App Store submission requires the Apple account, signing credentials, and bundle identifier ownership to be confirmed.

## 3. Make web testing available safely

The Vercel project currently has SSO protection enabled for non-custom domains. Keep that protection in place until a dedicated test environment and access policy are chosen.

Preferred approach:
- Create a separate staging/test deployment environment with test-only Supabase data and test credentials.
- Grant tester access only to the test deployment.
- Do not disable protection on the production project or point a public preview at production financial data.
- Confirm the deployed web build's Supabase project and environment before sharing any URL.

## 4. Create the test estate and accounts

Use a dedicated estate containing synthetic data only. Create separate accounts for:
- Super Admin (internal owner only; do not distribute this credential)
- Facility Manager
- Resident
- Security
- Event Coordinator

Use unique passwords for each tester. Do not share a single login across people; it makes audit trails and role testing unreliable.

## 5. Test plan

Before sending the install link, verify each role on a real device/browser:
- Login, logout, session persistence and password reset
- Estate membership and cross-estate access denial
- Resident profile, unit, service charges, visitor pass, maintenance and payment history
- Security visitor QR verification and event invitation verification
- Event Coordinator event creation, venue selection, guest invitations, gate verification hand-off and attendance check-in
- Facility Manager dashboards, users, venues, maintenance and service charges
- Payment tests only with Squad sandbox credentials and synthetic records

Record device model, OS version, app version, role, steps, expected result, actual result and screenshots/video with each bug.

## 6. Scaling readiness

Do not add Redis or multiple API replicas before a baseline load test. The API currently has a PostgreSQL pool configuration and a Supabase-backed shared rate-limit RPC in production; its local in-memory limiter is only used outside production/CI. This is already safer across multiple API instances than an in-memory-only limiter, provided the rate-limit migration and service credentials are present.

Next scaling steps after a test baseline:
1. Measure p50/p95 API latency, error rate, database CPU/connections and rate-limit RPC latency.
2. Confirm Supabase connection pooling and keep per-instance PostgreSQL pool sizes bounded.
3. Add Redis only for cacheable, non-financial read data and distributed ephemeral coordination; never use it as the source of truth for balances, payments, ledgers, or attendance.
4. Add a second API replica behind the hosting platform's load balancer and run the same tests.
5. Add alerting, backup/restore drills and payment reconciliation monitoring.

## Release decision

The app is ready for external testers only after the API URL is live and verified, the mobile build points to it, web access is safely scoped, and the dedicated test estate/accounts are created. A successful GitHub CI run alone does not satisfy these checks.
