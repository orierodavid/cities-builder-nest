# Dual payment-provider architecture

Status: provider-neutral design. Two providers are planned; neither is selected or integrated yet. This document does not enable payment processing.

## Design

Use one internal payment domain and two provider adapters. Provider choice must be explicit for each payment attempt and stored on the server. Do not silently switch providers mid-attempt.

### Shared application contract

Each adapter must implement equivalent operations where supported:

- Create a collection/payment session using a server-created internal reference and idempotency key.
- Verify a transaction server-to-server using provider credentials held only by the backend.
- Verify webhook authenticity against the exact raw request body and provider-defined signature scheme.
- Normalize provider responses into internal states without trusting client-supplied status.
- Normalize provider transaction references, amounts, currency, fees, timestamps, and failure reasons.
- Expose capability flags for refunds, reversals, payouts, and supported payment methods; unsupported capabilities must fail explicitly.

Provider-specific request/response payloads remain inside the adapter and must not leak into resident-facing API contracts.

## Shared payment lifecycle

1. Authenticate the resident and verify ownership of the savings goal or charge.
2. Validate the payable amount as a positive integer in NGN kobo; calculate amounts on the server.
3. Create a pending internal payment record with a unique reference and idempotency key.
4. Create the provider transaction through the selected adapter and save only necessary provider references.
5. Treat redirect/app return as informational. Confirm payment only after authenticated provider verification or a verified webhook.
6. Process duplicate webhook deliveries idempotently; prevent a transaction from being credited twice.
7. Record the normalized result and create ledger entries only from trusted server-side logic.
8. Reconcile internal records against each provider's transaction/settlement reports; flag mismatches for review.

## Isolation and failover

- Store provider identity per payment attempt; keep attempts and webhook event IDs unique within the provider namespace.
- Never treat the same reference from two providers as the same external transaction.
- A retry on another provider creates a separate attempt linked to the same internal business obligation; it must not overwrite the first attempt.
- Do not automatically fail over after an ambiguous/pending result. Verify the first attempt before permitting a second collection to avoid double charging.
- Keep provider credentials in server-side secrets. Never ship secrets in mobile/web bundles or expose service-role credentials.
- Use least-privilege access for payment records, provider events, reconciliation, withdrawals, ledger, and audit logs.

## Required before implementation

Confirm both provider names and merchant-account readiness. For each provider, verify current API/webhook documentation and account-specific support for NGN collections, supported payment methods, settlement timelines, fees, refunds/reversals, and any payout requirements.

Also confirm:
- Which product flows will collect money (e.g. estate fees, rent/savings contributions, or both).
- Whether the platform or a regulated financial partner receives/holds funds.
- The refund, dispute, custody, KYC/AML, and reconciliation responsibilities.
- Whether users choose a provider or the backend selects one by configured availability.

No payment endpoint, provider SDK, webhook, or provider-specific database field should be activated until these decisions are confirmed and tested.
