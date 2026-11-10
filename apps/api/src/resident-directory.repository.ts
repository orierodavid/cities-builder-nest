import type { PoolClient } from "pg";

export interface ResidentDirectoryItem {
  id: string;
  full_name: string;
  phone_e164: string | null;
}

export interface ResidentDirectoryPage {
  residents: ResidentDirectoryItem[];
  hasMore: boolean;
}

/**
 * Mirrors the estate-membership-first pagination used by the Supabase route.
 * Both reads execute as the authenticated user, so RLS on memberships and
 * user profiles remains the authorization boundary.
 */
export async function getResidentsForEstate(
  client: PoolClient,
  estateId: string,
  pageSize: number,
  offset: number,
): Promise<ResidentDirectoryPage> {
  const membershipResult = await client.query<{ user_id: string }>(
    `SELECT user_id
     FROM public.estate_memberships
     WHERE estate_id = $1
       AND membership_role = 'resident'
       AND status = 'active'
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [estateId, pageSize + 1, offset],
  );

  const hasMore = membershipResult.rows.length > pageSize;
  const userIds = [...new Set(membershipResult.rows.slice(0, pageSize).map((row) => row.user_id))];
  if (userIds.length === 0) return { residents: [], hasMore };

  const residentsResult = await client.query<ResidentDirectoryItem>(
    `SELECT id, full_name, phone_e164
     FROM public.users
     WHERE id = ANY($1::uuid[])
     ORDER BY full_name ASC`,
    [userIds],
  );

  return { residents: residentsResult.rows, hasMore };
}
