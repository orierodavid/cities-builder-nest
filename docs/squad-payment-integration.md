# Squad payment integration

CB Nest uses Squad's server-side checkout API. The Edge Function `initiate-squad-payment` creates a pending ledger row before requesting checkout. The public `squad-payment-webhook` validates the webhook HMAC and then independently calls Squad's transaction verification endpoint. Only a verified NGN transaction with the exact expected reference, amount, and resident email can change a pending ledger row to successful.

## Supabase Edge Function secrets

Set these in the Supabase project before testing:

- `SQUAD_SECRET_KEY`: Squad sandbox secret key for sandbox testing; never expose it in a mobile or web environment variable.
- `SQUAD_ENVIRONMENT=sandbox`: use sandbox until end-to-end tests pass.
- `SQUAD_SECRET_KEY` must be replaced with the live secret only after the merchant account is approved and production testing is signed off.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions.

## Dashboard webhook

Configure the Squad webhook URL as:

`https://<project-ref>.supabase.co/functions/v1/squad-payment-webhook`

The webhook function is configured for public delivery because Squad cannot send a Supabase user JWT. It validates the Squad signature, then verifies every transaction server-to-server before recording success. Never disable signature validation or transaction verification.

## Supported payment types

- Estate service charges: amount is always loaded from the active charge in the database; the client cannot choose or override it.
- Save for Rent contributions: resident supplies a contribution amount (minimum NGN 100), and the goal must belong to that resident, be active, and remain within its commitment term.

The payment gateway settles to the merchant account. It does not by itself create a regulated savings custody arrangement, escrow, or a segregated resident balance. Do not represent gateway payments as custodially held savings or show them as available rent savings until the appropriate custody/settlement arrangement and reconciliation process have been established.

## Deployment and verification checklist

1. Apply migration `20261104120000_squad_payment_ledger.sql`.
2. Deploy `initiate-squad-payment` and `squad-payment-webhook`.
3. Set the sandbox secret and `SQUAD_ENVIRONMENT=sandbox`.
4. Register the webhook URL in Squad's sandbox dashboard.
5. Run a sandbox service-charge transaction and a sandbox rent-goal contribution.
6. Confirm the webhook signature is accepted, Squad verification returns the matching transaction, and exactly one pending row changes to successful.
7. Replay the same webhook and confirm the ledger is unchanged.
8. Test wrong amount, currency, email, reference, invalid signature, abandoned and failed transactions; none may be marked successful.
9. Switch to live only after merchant KYC/approval, dashboard configuration, and successful sandbox sign-off.

## Important current limitation

The Edge Functions and database ledger are the server-side integration layer. The resident mobile checkout controls and post-checkout refresh/reconciliation still need to be wired and device-tested before residents can use this flow in the app. Dedicated Virtual Accounts remain a separate Squad product and are not enabled by this checkout integration.
