# Architecture

## Services
- Expo React Native app with separate Resident, Security, and Event Organiser experiences; Facility Manager and Super Admin workflows run on the web.
- Express + TypeScript API; can run directly under Node.js or in the repository's production Docker image.
- Supabase PostgreSQL as the default application database.
- Supabase Auth verifies bearer tokens at the API boundary. Protected API routes enforce platform roles and active estate membership; Supabase RLS remains enabled for client-scoped access.
- Durable PostgreSQL background queue and separately supervised Node worker. Welcome-email sending is opt-in; in-app notifications remain on the existing database/realtime path.
- Regulated financial partner as custodian of Save for Rent funds.

## Enterprise multi-tenancy
- One shared platform serves many estates; every estate-owned record is scoped to an estate.
- Estate-scoped roles live on `estate_memberships` and are separate from the global `platform_admin` role.
- A user may hold one primary estate role per estate and may belong to multiple estates.
- Database constraints enforce that units belong to their building's estate, resident-unit assignments reference a unit and membership in the same estate, and maintenance units cannot cross estate boundaries.
- Row-level policies restrict client reads and writes to active memberships and the user's own records. Estate creation, membership administration, role assignment, and privileged financial mutations remain server-mediated.
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
Configure the API's `DATABASE_URL` and Supabase Auth settings in private runtime environment variables. The repository includes a multi-stage API/worker Docker image and a Compose stack with private Redis; see `docs/DOCKER_DEPLOYMENT.md`. Compose does not deploy to a VPS, configure DNS/TLS, or apply database migrations. Store credentials outside source control, use a trusted HTTPS reverse proxy, and apply reviewed migrations through a controlled release process.
