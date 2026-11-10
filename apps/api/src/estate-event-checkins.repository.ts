import type { PoolClient } from "pg";

export interface EstateEventCheckIn {
  id: string;
  guest_id: string;
  invitation_id: string | null;
  checked_in_at: string;
  estate_event_guests: {
    guest_name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface EstateEventCheckInPage {
  checkIns: EstateEventCheckIn[];
  hasMore: boolean;
}

/**
 * Read check-ins and their guest details as the authenticated user. Live RLS
 * policies on both tables require active event-organiser membership and legal
 * consent; the route retains its existing event-owner authorization check.
 */
export async function getEstateEventCheckIns(
  client: PoolClient,
  estateId: string,
  eventId: string,
  pageSize: number,
  offset: number,
): Promise<EstateEventCheckInPage> {
  const result = await client.query<EstateEventCheckIn>(
    `SELECT c.id, c.guest_id, c.invitation_id, c.checked_in_at,
            jsonb_build_object(
              'guest_name', g.guest_name,
              'email', g.email,
              'phone', g.phone
            ) AS estate_event_guests
     FROM public.estate_event_checkins c
     INNER JOIN public.estate_event_guests g
       ON g.id = c.guest_id
      AND g.estate_id = c.estate_id
      AND g.event_id = c.event_id
     WHERE c.estate_id = $1 AND c.event_id = $2
     ORDER BY c.checked_in_at DESC, c.id DESC
     LIMIT $3 OFFSET $4`,
    [estateId, eventId, pageSize + 1, offset],
  );
  return {
    checkIns: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
