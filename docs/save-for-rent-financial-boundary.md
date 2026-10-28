# Save for Rent — provider-neutral financial boundary

## Current phase boundary
This phase protects savings-goal metadata only. It does **not** collect, hold, transfer, withdraw, refund, or settle money. No payment-provider SDK, public webhook, or financial mutation endpoint is introduced here.

Amounts are integer NGN kobo (PostgreSQL bigint); clients must never submit decimal naira values as the stored amount. Server-side code must validate positive safe integer values and enforce configured business limits before accepting a future payment intent.

## Savings-goal ownership and lifecycle
- A signed-in resident may create a goal only for their own authenticated user ID.
- If a goal is linked to an estate, the caller must have an active resident membership in that estate.
- A client cannot change a goal's owner or estate after creation.
- Client-created goals start as active.
- Client status transitions: active -> paused/cancelled; paused -> active/cancelled. A client cannot mark a goal completed; completion must be derived from trusted server-side financial state after a separately reviewed implementation.
- RLS remains enabled. Existing least-privilege table grants remain in place; this migration does not grant access to payment intents, withdrawals, ledger records, provider events, reconciliation, or audit logs.

## Future payment-intent contract (not implemented)
When provider decisions are approved, the server—not the client—must create the payment intent and its idempotency key. The server must bind the authenticated resident, goal, currency, and amount; reject mismatched owner/goal/estate associations; persist a unique idempotency key and internal reference; and return only minimum client-safe status fields. Provider callbacks must be authenticated according to the provider's documented signature scheme, deduplicated by provider event ID, and verified against the provider's server-side transaction lookup before any ledger posting. Browser redirects alone are never proof of payment.

Ledger writes must be atomic, balanced, immutable after posting, and idempotent. Reversals should be new linked transactions rather than edits to posted entries. Reconciliation exceptions and audit records remain server-only.

## Gate before provider integration
Before implementation, confirm both providers and merchant-account readiness; supported NGN collection/payout methods; who legally holds customer funds; and responsibilities for KYC/AML, safeguarding/custody, settlement, fees, refunds, disputes, chargebacks, reversals, and reconciliation. Provider-specific integration requires a separate scope and security/compliance review.
