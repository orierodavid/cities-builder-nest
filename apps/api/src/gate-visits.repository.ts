import type { PoolClient } from "pg";

export interface ActiveGateVisit {
  id: string;
  visitor_pass_id: string;
  checked_in_at: string;
  visitor_passes: {
    visitor_name: string;
    visitor_phone: string | null;
  } | null;
}

export interface ActiveGateVisitPage {
  visits: ActiveGateVisit[];
  hasMore: boolean;
}

/**
 * Lists open gate visits in one estate. The caller must use the authenticated
 * transaction; RLS on visitor_visits and visitor_passes remains authoritative.
 */
export async function getActiveGateVisitsForEstate(
  client: PoolClient,
  estateId: string,
  pageSize: number,
  offset: number,
): Promise<ActiveGateVisitPage> {
  const result = await client.query<ActiveGateVisit>(
    `SELECT
       v.id,
       v.visitor_pass_id,
       v.checked_in_at,
       jsonb_build_object(
         'visitor_name', p.visitor_name,
         'visitor_phone', p.visitor_phone
       ) AS visitor_passes
     FROM public.visitor_visits v
     INNER JOIN public.visitor_passes p
       ON p.id = v.visitor_pass_id
      AND p.estate_id = v.estate_id
     WHERE v.estate_id = $1
       AND v.checked_out_at IS NULL
     ORDER BY v.checked_in_at DESC
     LIMIT $2 OFFSET $3`,
    [estateId, pageSize + 1, offset],
  );

  const hasMore = result.rows.length > pageSize;
  return { visits: result.rows.slice(0, pageSize), hasMore };
}
