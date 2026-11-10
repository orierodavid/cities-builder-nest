import type { PoolClient } from "pg";

export interface EstateEventGuest {
  id: string;
  estate_id: string;
  event_id: string;
  guest_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstateEventGuestPage {
  guests: EstateEventGuest[];
  hasMore: boolean;
}

/**
 * The authenticated role's RLS policies restrict this read to event organisers.
 * Keep the route's existing event-owner check and apply explicit estate/event
 * scope plus stable ascending pagination.
 */
export async function getEstateEventGuests(
  client: PoolClient,
  estateId: string,
  eventId: string,
  pageSize: number,
  offset: number,
): Promise<EstateEventGuestPage> {
  const result = await client.query<EstateEventGuest>(
    `SELECT id, estate_id, event_id, guest_name, email, phone, notes,
            created_at, updated_at
     FROM public.estate_event_guests
     WHERE estate_id = $1 AND event_id = $2
     ORDER BY created_at ASC, id ASC
     LIMIT $3 OFFSET $4`,
    [estateId, eventId, pageSize + 1, offset],
  );
  return {
    guests: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
