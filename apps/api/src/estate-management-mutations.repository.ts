import type { PoolClient } from "pg";

export interface EstateRecord {
  id: string; name: string; address: string; city: string; state: string;
  country_code: string; timezone: string; created_at: string;
}
export interface EstateMembershipRecord {
  id: string; estate_id: string; user_id: string; membership_role: string; status: string; created_at: string;
}
export interface BuildingRecord { id: string; estate_id: string; name: string; created_at: string }
export interface UnitRecord { id: string; estate_id: string; building_id: string; unit_code: string; unit_type: string | null; status: string }

export async function updateEstateSubscription(
  client: PoolClient,
  input: { estateId: string; enabled: boolean; reason: string | null; updatedAt: string },
): Promise<{ id: string; name: string; is_enabled: boolean; disabled_at: string | null; disabled_reason: string | null } | null> {
  const result = await client.query(
    `UPDATE public.estates
     SET is_enabled = $2, disabled_at = $3, disabled_reason = $4
     WHERE id = $1
     RETURNING id, name, is_enabled, disabled_at, disabled_reason`,
    [input.estateId, input.enabled, input.enabled ? null : input.updatedAt, input.enabled ? null : (input.reason || "Subscription inactive")],
  );
  return result.rows[0] ?? null;
}

export async function createEstate(
  client: PoolClient,
  input: { name: string; address: string; city: string; state: string; countryCode: string; timezone: string },
): Promise<EstateRecord | null> {
  const result = await client.query<EstateRecord>(
    `INSERT INTO public.estates (name, address, city, state, country_code, timezone)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, address, city, state, country_code, timezone, created_at`,
    [input.name, input.address, input.city, input.state, input.countryCode, input.timezone],
  );
  return result.rows[0] ?? null;
}

export async function addExistingResidentMembership(
  client: PoolClient,
  input: { estateId: string; residentUserId: string },
): Promise<{ resident: { id: string; full_name: string; phone_e164: string | null }; membership: EstateMembershipRecord } | null> {
  const candidate = await client.query<{ id: string; full_name: string; phone_e164: string | null; is_active: boolean }>(
    `SELECT id, full_name, phone_e164, is_active
     FROM public.get_active_resident_candidate($1, $2)`,
    [input.estateId, input.residentUserId],
  );
  const resident = candidate.rows[0];
  if (!resident?.is_active) return null;
  const membershipResult = await client.query<EstateMembershipRecord>(
    `INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status)
     VALUES ($1, $2, 'resident', 'active')
     RETURNING id, estate_id, user_id, membership_role, status, created_at`,
    [input.estateId, input.residentUserId],
  );
  const membership = membershipResult.rows[0];
  return membership ? { resident: { id: resident.id, full_name: resident.full_name, phone_e164: resident.phone_e164 }, membership } : null;
}

export async function assignExistingStaffMembership(
  client: PoolClient,
  input: { estateId: string; userId: string; role: string },
): Promise<{ staff: { id: string; full_name: string }; membership: EstateMembershipRecord } | null> {
  const staffResult = await client.query<{ id: string; full_name: string; is_active: boolean }>(
    "SELECT id, full_name, is_active FROM public.users WHERE id = $1 LIMIT 1",
    [input.userId],
  );
  const staff = staffResult.rows[0];
  if (!staff?.is_active) return null;
  const result = await client.query<EstateMembershipRecord>(
    `INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id, estate_id, user_id, membership_role, status, created_at`,
    [input.estateId, input.userId, input.role],
  );
  const membership = result.rows[0];
  return membership ? { staff: { id: staff.id, full_name: staff.full_name }, membership } : null;
}

export async function createEstateBuilding(
  client: PoolClient,
  estateId: string,
  name: string,
): Promise<BuildingRecord | null> {
  const result = await client.query<BuildingRecord>(
    `INSERT INTO public.buildings (estate_id, name)
     VALUES ($1, $2)
     RETURNING id, estate_id, name, created_at`,
    [estateId, name],
  );
  return result.rows[0] ?? null;
}

export async function createEstateUnit(
  client: PoolClient,
  input: { estateId: string; buildingId: string; unitCode: string; unitType: string | null },
): Promise<UnitRecord | null> {
  const building = await client.query<{ id: string }>(
    "SELECT id FROM public.buildings WHERE id = $1 AND estate_id = $2 LIMIT 1",
    [input.buildingId, input.estateId],
  );
  if (!building.rows[0]) return null;
  const result = await client.query<UnitRecord>(
    `INSERT INTO public.units (building_id, estate_id, unit_code, unit_type, status)
     VALUES ($1, $2, $3, $4, 'available')
     RETURNING id, estate_id, building_id, unit_code, unit_type, status`,
    [input.buildingId, input.estateId, input.unitCode, input.unitType],
  );
  return result.rows[0] ?? null;
}

export interface ResidentUnitAssignment {
  id: string; estate_id: string; unit_id: string; resident_user_id: string;
  start_date: string; end_date: string | null; created_at: string;
}
export type ResidentUnitAssignmentResult =
  | { kind: "unit_not_found" }
  | { kind: "unit_not_available" }
  | { kind: "resident_not_found" }
  | { kind: "assigned"; assignment: ResidentUnitAssignment };

export async function assignResidentToEstateUnit(
  client: PoolClient,
  input: { estateId: string; unitId: string; residentUserId: string; startDate?: string },
): Promise<ResidentUnitAssignmentResult> {
  const unitResult = await client.query<{ id: string; status: string }>(
    "SELECT id, status FROM public.units WHERE id = $1 AND estate_id = $2 LIMIT 1 FOR UPDATE",
    [input.unitId, input.estateId],
  );
  const unit = unitResult.rows[0];
  if (!unit) return { kind: "unit_not_found" };
  if (unit.status !== "available") return { kind: "unit_not_available" };

  const residentResult = await client.query<{ user_id: string }>(
    `SELECT user_id FROM public.estate_memberships
     WHERE estate_id = $1 AND user_id = $2
       AND membership_role = 'resident' AND status = 'active'
     LIMIT 1`,
    [input.estateId, input.residentUserId],
  );
  if (!residentResult.rows[0]) return { kind: "resident_not_found" };

  const values: unknown[] = [input.estateId, input.unitId, input.residentUserId];
  const startDateClause = input.startDate ? ", start_date" : "";
  const startDateValue = input.startDate ? ", $4" : "";
  if (input.startDate) values.push(input.startDate);
  const result = await client.query<ResidentUnitAssignment>(
    `INSERT INTO public.resident_units (estate_id, unit_id, resident_user_id${startDateClause})
     VALUES ($1, $2, $3${startDateValue})
     RETURNING id, estate_id, unit_id, resident_user_id, start_date, end_date, created_at`,
    values,
  );
  const assignment = result.rows[0];
  return assignment ? { kind: "assigned", assignment } : { kind: "unit_not_found" };
}
