# Cities Builder Nest — Role Access and Estate Onboarding

## Core ownership rule

The platform is multi-estate. A **platform admin** manages the platform and creates estates. Each estate has its own facility managers, security users, residents, buildings, units, announcements, maintenance requests, and visitor activity. A facility manager can add residents **only to an estate they are assigned to**. Residents and security users must never see another estate's records just because they have an account.

A role shown in the interface is not a security boundary by itself. The API and PostgreSQL row-level security (RLS) must enforce the same rules on every request. Default to deny when a role or estate membership cannot be verified.

## Roles and what each should see

### 1. Platform Admin

**Purpose:** Platform-wide setup, oversight, and access management.

- **Overview:** estate count, active users, resident counts, outstanding maintenance totals, recent platform activity, and operational alerts.
- **Estates:** create, view, edit, activate/deactivate estates; manage estate address and core details.
- **Estate setup:** create buildings and units, or delegate building/unit setup to the assigned facility manager if that workflow is chosen.
- **People and assignments:** add/invite facility managers and security users; assign each to one or more specific estates; suspend/reactivate memberships; view resident membership summaries.
- **Oversight:** view estate-level dashboards and reports across estates where platform policy permits; review audit events and access/operational issues.
- **Configuration:** platform-wide settings and integrations.
- **Financial controls:** access to sensitive finance data only if explicitly authorized for that duty; platform admin status alone must not silently grant unsafe payment or ledger mutation powers.

**Platform Admin must not:** use a facility manager's estate-scoped access implicitly, change a resident's unit without an auditable action, or bypass financial controls. All privileged actions need actor, timestamp, target estate, and outcome recorded.

### 2. Facility Manager (estate-scoped)

**Purpose:** Run the day-to-day operations of the estate(s) assigned to them.

- **Dashboard:** residents/occupied units, open and overdue maintenance, recent announcements, visitor activity summaries, and operational tasks for assigned estate(s).
- **Estate directory:** view the estate details, buildings, and units they are permitted to manage.
- **Residents:** add/invite a resident to a particular assigned estate; capture name, contact details, building/unit, and occupancy start date; assign the resident to a unit; update permitted resident details; end an occupancy or suspend a membership with an audit trail.
- **Membership workflow:** select the estate first, then choose only a building/unit belonging to that same estate. Confirm that the resident has an active resident membership before creating the unit assignment.
- **Maintenance:** view requests for assigned estate(s), assign/triage work, change status, record resolution, and communicate updates.
- **Announcements:** draft and publish estate-specific notices.
- **Visitors:** see visitor passes and visit status relevant to the estate, subject to privacy policy.
- **Security coordination:** see relevant security logs and operational incidents, without access to unrelated estates.
- **Reports:** resident directory, occupancy, maintenance, and estate operational reports for assigned estate(s).

**Facility Manager must not:** create or manage estates globally; assign themselves platform-admin rights; add a resident to an estate they are not assigned to; view another estate's residents, units, visitor records, or maintenance requests; see private resident data or financial records beyond explicitly granted permissions.

### 3. Resident

**Purpose:** Use services for their own estate, household, and assigned unit.

- **Home:** their selected estate, assigned unit, current announcements, and their own recent activity.
- **My profile:** view/update permitted personal contact details and account settings.
- **My unit/estate:** view their assigned unit and basic estate information; do not edit estate setup.
- **Announcements:** read published notices for their active estate.
- **Maintenance:** create a request for their unit, view their own requests and status, and add relevant updates/photos if supported.
- **Visitors:** create or manage visitor passes for their guests, view pass status, and revoke a pass where permitted.
- **Community directory:** only the limited resident information intentionally published to residents; no private phone numbers or household details by default.
- **Save for Rent:** view their own savings goals, verified transactions, and withdrawal requests only when the approved financial integration is enabled.

**Resident must not:** browse the full private resident directory, edit another resident's records, manage buildings/units, assign roles, access staff-only maintenance notes, view security-only logs, or access another resident's financial data.

### 4. Security / Guard

**Purpose:** Verify and record visitor access at assigned estate gates.

- **Today / gate dashboard:** active expected visits, pending arrivals, recently checked-in visitors, and relevant alerts for assigned estate(s).
- **Visitor verification:** search/scan a pass or enter its code; verify visitor name, host, estate, and validity window; record check-in and check-out; flag denied, expired, revoked, or suspicious passes.
- **Visit log:** view the minimum visitor details needed to perform gate duties and recent access events for the assigned estate.
- **Incident reporting:** record a gate incident and escalate it to the facility manager.
- **Account:** own profile and sign-out.

**Security must not:** add residents, change resident/unit assignments, create estates, publish announcements, resolve maintenance requests, issue or edit visitor passes on behalf of residents, see financial data, or browse unrelated estates. Security access to host contact details should be limited to what is necessary for verification and follow-up.

## Required onboarding sequence

1. **Platform Admin creates an estate** with its name, address, city/state, country, and timezone.
2. **Platform Admin assigns estate staff** by inviting/creating a facility manager and security user, then creating an active membership tied to that specific estate. A staff account alone does not grant access to every estate.
3. **Estate structure is configured:** buildings and units are created for that estate. This can be done by the platform admin or delegated to that estate's facility manager, depending on the final permission configuration.
4. **Facility Manager selects their assigned estate** and opens Residents → Add Resident.
5. **Facility Manager invites/adds the resident** with the required identity/contact details. The system creates or links the user's account and creates an active `resident` membership for the selected estate. Existing accounts must be linked safely rather than duplicated.
6. **Facility Manager assigns a unit** by selecting a building and unit from that same estate and recording the occupancy start date. The unit becomes occupied only after the assignment succeeds.
7. **Resident signs in** and sees only estates where they have an active membership, plus the unit and features allowed to their role.
8. **Audit and notifications:** record who invited/added the user, estate, role, unit assignment, and timestamp; send an invitation/notification without exposing passwords. A suspended/ended membership must immediately lose access to that estate.

## Data and authorization rules that must hold

- Platform-wide role is separate from estate membership. Platform admin is a global role; facility manager, security, and resident access is scoped to an estate membership.
- Every estate-specific read/write must validate the user's active membership and role for the exact `estate_id`.
- Never trust an `estate_id`, `unit_id`, or role sent by the client without checking it server-side.
- A resident-unit assignment must reference a unit in the same estate as the resident's active membership.
- One active occupancy per unit should be enforced by a database constraint or transaction-safe application logic; do not allow concurrent assignments to double-book a unit.
- Inviting an existing user must not grant them access to a new estate until an authorized membership is created.
- RLS and API authorization must agree. Hiding a button in the app is not authorization.
- Role changes, invitations, membership suspension/end, unit assignment changes, visitor verification, and privileged edits should be audit logged.
- Sensitive financial endpoints and ledger writes remain deny-by-default until separately authorized, tested, and approved.

## Navigation summary

| Area | Platform Admin | Facility Manager | Resident | Security |
|---|---|---|---|---|
| Overview | Cross-estate summary | Assigned estate summary | Personal/estate home | Gate activity |
| Estates | Create/manage all | View assigned | View own estate basics | Assigned estate basics |
| Buildings & units | Manage all / delegate | Manage assigned | View own unit | No management |
| Residents | Manage/invite staff; view summaries | Add/manage residents in assigned estate | Own profile only | Minimum host details needed |
| Maintenance | Cross-estate oversight | Manage assigned estate | Create/view own requests | No |
| Announcements | Oversight | Publish assigned estate | Read published | Read relevant notices |
| Visitors | Oversight where permitted | Review assigned estate | Manage own passes | Verify and log visits |
| Security logs | Audit oversight | Review assigned estate | No | Record/view gate events |
| Finance / Save for Rent | Explicit permission only | No by default | Own financial data only | No |
| Roles & access | Platform and estate assignments | No global role control | No | No |

This matrix is the intended product contract. It does not claim every listed screen or endpoint is implemented yet; implementation should proceed with database/API enforcement and cross-estate authorization tests before exposing privileged UI.
