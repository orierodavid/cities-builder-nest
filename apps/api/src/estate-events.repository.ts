import type { PoolClient } from "pg";

export interface EstateEvent {
  id: string;
  estate_id: string;
  title: string;
  description: string;
  venue: string;
  venue_id: string | null;
  venue_approval_status: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EstateEventPage {
  events: EstateEvent[];
  hasMore: boolean;
}

/**
 * RLS enforces active estate membership or platform-admin visibility.
 * The API's existing created_by filter is preserved. The id tie-breaker makes
 * offset pagination deterministic when multiple events share a start time.
 */
export async function getEstateEventsForCreator(
  client: PoolClient,
  estateId: string,
  creatorUserId: string,
  pageSize: number,
  offset: number,
): Promise<EstateEventPage> {
  const result = await client.query<EstateEvent>(
    `SELECT id, estate_id, title, description, venue, venue_id,
            venue_approval_status, starts_at, ends_at, status,
            created_by, created_at, updated_at
     FROM public.estate_events
     WHERE estate_id = $1
       AND created_by = $2
     ORDER BY starts_at ASC, id ASC
     LIMIT $3 OFFSET $4`,
    [estateId, creatorUserId, pageSize + 1, offset],
  );
  return {
    events: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
