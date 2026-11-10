import type { PoolClient } from "pg";

export interface VisitorPassRecord {
  id: string;
  estate_id: string;
  visitor_name: string;
  visitor_phone: string | null;
  valid_from: string;
  valid_until: string;
  status: string;
  created_at: string;
  access_code_ciphertext: string | null;
}

export interface VisitorPassPage {
  visitorPasses: VisitorPassRecord[];
  hasMore: boolean;
}

/**
 * Reads only passes created by the authenticated resident in the requested
 * estate. The transaction must run as the authenticated user so PostgreSQL
 * RLS remains the authorization boundary.
 */
export async function getVisitorPassesForHost(
  client: PoolClient,
  estateId: string,
  hostUserId: string,
  pageSize: number,
  offset: number,
): Promise<VisitorPassPage> {
  const result = await client.query<VisitorPassRecord>(
    `SELECT id, estate_id, visitor_name, visitor_phone, valid_from,
            valid_until, status, created_at, access_code_ciphertext
     FROM public.visitor_passes
     WHERE estate_id = $1
       AND host_user_id = $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [estateId, hostUserId, pageSize + 1, offset],
  );

  const hasMore = result.rows.length > pageSize;
  return { visitorPasses: result.rows.slice(0, pageSize), hasMore };
}
