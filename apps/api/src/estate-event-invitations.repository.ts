import type { PoolClient } from "pg";

export interface EstateEventInvitation {
  id: string;
  guest_id: string;
  status: string;
  created_at: string;
  estate_event_guests: {
    guest_name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface EstateEventInvitationPage {
  invitations: EstateEventInvitation[];
  hasMore: boolean;
}

/**
 * Both invitations and guest details are read under the authenticated role.
 * Their live RLS policies require active event-organiser membership and legal
 * consent; the route also retains its existing event-owner authorization.
 */
export async function getEstateEventInvitations(
  client: PoolClient,
  estateId: string,
  eventId: string,
  pageSize: number,
  offset: number,
): Promise<EstateEventInvitationPage> {
  const result = await client.query<EstateEventInvitation>(
    `SELECT i.id, i.guest_id, i.status, i.created_at,
            jsonb_build_object(
              'guest_name', g.guest_name,
              'email', g.email,
              'phone', g.phone
            ) AS estate_event_guests
     FROM public.estate_event_invitations i
     INNER JOIN public.estate_event_guests g
       ON g.id = i.guest_id
      AND g.estate_id = i.estate_id
      AND g.event_id = i.event_id
     WHERE i.estate_id = $1 AND i.event_id = $2
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT $3 OFFSET $4`,
    [estateId, eventId, pageSize + 1, offset],
  );
  return {
    invitations: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
