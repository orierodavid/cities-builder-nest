import type { PoolClient } from "pg";

export interface EstateMembershipAccess {
  estate_id: string;
  membership_role: string;
  status: string;
}

export async function hasPlatformAdminRole(client: PoolClient, userId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM public.user_roles
     WHERE user_id = $1
       AND role = 'platform_admin'
     LIMIT 1`,
    [userId],
  );
  return result.rows.length > 0;
}

export async function hasEstateManagerRole(
  client: PoolClient,
  userId: string,
  estateId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM public.estate_memberships
     WHERE estate_id = $1
       AND user_id = $2
       AND status = 'active'
       AND membership_role = ANY($3::text[])
     LIMIT 1`,
    [estateId, userId, ["facility_manager", "estate_manager", "estate_admin"]],
  );
  return result.rows.length > 0;
}

export async function getEstateMembershipAccess(
  client: PoolClient,
  userId: string,
  estateId: string,
): Promise<EstateMembershipAccess | null> {
  const result = await client.query<EstateMembershipAccess>(
    `SELECT estate_id, membership_role, status
     FROM public.estate_memberships
     WHERE estate_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [estateId, userId],
  );
  return result.rows[0] ?? null;
}

export async function getEstateEnabledStatus(
  client: PoolClient,
  estateId: string,
): Promise<boolean | null> {
  const result = await client.query<{ is_enabled: boolean }>(
    `SELECT is_enabled
     FROM public.estates
     WHERE id = $1
     LIMIT 1`,
    [estateId],
  );
  return result.rows[0]?.is_enabled ?? null;
}

export async function getEventCreator(
  client: PoolClient,
  estateId: string,
  eventId: string,
): Promise<string | null> {
  const result = await client.query<{ created_by: string }>(
    `SELECT created_by
     FROM public.estate_events
     WHERE estate_id = $1
       AND id = $2
     LIMIT 1`,
    [estateId, eventId],
  );
  return result.rows[0]?.created_by ?? null;
}
