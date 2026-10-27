# Architecture

## Services
- Expo React Native app for residents, facility managers, and security personnel.
- TypeScript API deployed on Railway.
- Railway PostgreSQL for application records.
- Background worker for provider events, payouts, and reconciliation.
- Regulated financial partner as custodian of Save for Rent funds.

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
Deploy API and worker separately on Railway. Use Railway PostgreSQL. Keep secrets in Railway variables, not source control. Apply migrations through a controlled release process.
