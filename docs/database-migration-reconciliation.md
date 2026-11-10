# Database migration reconciliation

## Canonical Supabase migration stream

`supabase/migrations/` is the ordered migration stream for the connected Supabase project. Its numeric prefixes now match the versions returned by the live project's migration ledger for applied migrations. Missing historical definitions have been restored from the legacy migration folder or reconstructed from the live policy/constraint state.

The migration history was inspected read-only. **No migration was applied to the live database as part of this reconciliation.**

## Directory responsibilities

- `supabase/migrations/`: Supabase CLI migration stream, with 14-digit unique version prefixes.
- `database/migrations/`: legacy numbered schema/bootstrap history. Do not run this directory on top of the Supabase migration stream; several files overlap by design.
- Fresh non-Supabase PostgreSQL/VPS bootstrap still requires a separate portable baseline that replaces Supabase-specific dependencies such as `auth.users`, `auth.uid()`, `authenticated`, `service_role`, and `private.*` helpers. This file set is not yet a VPS-ready baseline.

## Consolidated historical migrations

The maintenance reply/read/realtime changes are consolidated into the restored `20261108161606` migration. The later recorded versions `20261108161707`, `20261108161752`, and `20261108161853` are retained as explicit no-op history markers because their SQL effects are already included in the consolidated migration.

The duplicate historical `phase1_insert_policy_recursion_fix` version `20261028103221` is retained as a no-op marker; the current repository's final policy implementation is in the adjacent recursion-fix migrations.

## Pending migrations

The following migrations are local but were not present in the live migration ledger at audit time, so they remain pending and are not applied here:
- `20261110130000_dashboard_unit_count_index.sql`
- `20261110150000_event_attendance_summary_rpc.sql`
- `20261110160000_event_attendance_read_indexes.sql`
- `20261110170000_squad_electricity_meter_validation.sql`

Before any future `supabase db push`, review the pending list and run the normal CI migration checks. Never apply these to production merely to complete this repository reconciliation.
