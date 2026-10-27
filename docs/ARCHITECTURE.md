# Architecture

## Services
- Expo React Native app for residents, facility managers, and security personnel.
- TypeScript API; deploy to an available Node.js host. Railway is optional, not required.
- Supabase PostgreSQL as the default application database.
- Supabase Auth is the intended authentication provider; token verification in the API and mobile auth flows must be implemented and tested before protected features are enabled.
- Background worker for provider events, payouts, and reconciliation; host independently of the database provider.
- Regulated financial partner as custodian of Save for Rent funds.

## Enterprise multi-tenancy
- One shared platform serves many estates; every estate-owned record is scoped to an estate.
- Estate-scoped roles live on `estate_memberships` and are separate from the global `platform_admin` role.
- A user may hold one primary estate role per estate and may belong to multiple estates.
- Database constraints enforce that units belong to their building's estate, resident-unit assignments reference a unit and membership in the same estate, and maintenance units cannot cross estate boundaries.
- Row-level policies restrict client reads to active memberships and the user's own records. Estate creation, membership administration, role assignment, and financial mutations remain server-mediated until the API has token verification and authorization tests.
- Do not trust client-supplied estate IDs or editable user metadata as authorization. The API must validate the bearer token and check the user's active membership and role for every estate-scoped operation.

## Core domains
Identity and roles; estates, buildings and units; resident directory; announcements; maintenance requests; visitor passes; savings goals; payment intents; withdrawals; ledger; provider events; reconciliation; audit logs.

## Financial integrity
- Store NGN amounts as integer kobo.
- Create payment intents server-side with unique references and idempotency keys.
- Verify provider webhook signatures and confirm status server-to-server.
- Never trust client-submitted payment success.
- Keep ledger entries append-only.
- Reserve withdrawals atomically and update them only from confirmed provider states.
- Reconcile internal records with provider statements and retain audit events.

## Deployment
Create the Supabase project and configure its PostgreSQL connection string as the API's `DATABASE_URL`. Store credentials in deployment secrets, never source control. Deploy the API and worker to a hosting provider that is accepting new projects; Railway is optional. Apply reviewed migrations through a controlled release process. Follow `docs/SUPABASE_SETUP.md` and do not assume authentication integration is complete just because environment variables exist.
