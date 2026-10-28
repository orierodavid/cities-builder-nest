# Phase 1 authorization regression checklist

This checklist is for API/RLS tests and manual verification. A phase is not complete until each case has automated evidence and CI passes.

## Resident directory

- [ ] An active facility manager can list active residents in their own estate.
- [ ] An estate manager/admin can list active residents in their own estate.
- [ ] A platform admin can list resident profiles for administration.
- [ ] A resident cannot list other residents' profiles through the `users` table.
- [ ] Security cannot read resident profiles through the manager-only RLS policy.
- [ ] A manager cannot read profiles of residents who belong only to a different estate.
- [ ] Suspended/ended resident memberships do not grant profile visibility.
- [ ] A manager from a second estate cannot gain visibility unless the target resident is also an active resident of that manager's estate.

## Cross-estate API checks

For every endpoint with an `:estateId`, test a valid user from Estate A against Estate B:

- [ ] Dashboard
- [ ] Buildings and units reads/writes
- [ ] Resident directory and membership creation
- [ ] Unit assignment
- [ ] Maintenance submission
- [ ] Visitor pass creation
- [ ] Gate check-in, open-visit list, and check-out
- [ ] Subscription status update (platform-admin only)

Expected: protected data is not disclosed and writes are rejected. Prefer a consistent 403/404 response where the API's existing contract supports it.

## Role checks

- [ ] Resident cannot create buildings, units, staff assignments, or resident memberships.
- [ ] Security can use gate workflows only in estates where their security membership is active.
- [ ] Facility managers cannot grant themselves platform-admin or finance privileges.
- [ ] Inactive memberships do not authorize reads or writes.
- [ ] Disabled estates reject protected operational reads/writes consistently.
- [ ] Visitor pass creation is restricted to the resident who hosts the pass, consistent with migration 013.

## Unit visibility review

The current dashboard aggregates unit counts for all active estate roles, while unit list endpoints are manager-only at the API layer. Do not tighten the table-level `units` RLS policy until the dashboard aggregation is moved to a narrowly scoped server-side query/RPC or otherwise remains functional. Test that resident/security clients cannot directly retrieve unit fields they do not need.

## Supabase Auth configuration

- [ ] Verify leaked-password protection is enabled in Supabase Auth settings.
- [ ] Keep finance tables server-only; do not add broad RLS policies to silence informational advisor warnings.

## Evidence required to close Phase 1

- Automated API authorization tests covering role × endpoint × estate boundary.
- RLS tests for profile and unit visibility.
- CI success on the final commit.
- Supabase migration history confirms all required migrations were applied.
- Supabase Auth leaked-password protection setting is verified in dashboard.
