import type { PoolClient } from "pg";

export interface EventInvitationVerification {
  status: string;
  event: Record<string, unknown> | null;
  invitation: Record<string, unknown> | null;
  guest: Record<string, unknown> | null;
  checkIn: Record<string, unknown> | null;
}

/**
 * Security-staff-only invitation lookup. The SECURITY DEFINER SQL function
 * performs its own auth.uid(), estate, role and legal-consent checks and
 * returns only the event/guest fields needed for the gate decision.
 */
export async function verifyEstateEventInvitation(
  client: PoolClient,
  estateId: string,
  eventId: string,
  codeHash: string,
): Promise<EventInvitationVerification | null> {
  const result = await client.query<{
    status: string;
    event_data: Record<string, unknown> | null;
    invitation_data: Record<string, unknown> | null;
    guest_data: Record<string, unknown> | null;
    check_in_data: Record<string, unknown> | null;
  }>(
    `SELECT status, event_data, invitation_data, guest_data, check_in_data
     FROM public.verify_estate_event_invitation_for_security($1, $2, $3)`,
    [estateId, eventId, codeHash],
  );
  const row = result.rows[0];
  return row ? {
    status: row.status,
    event: row.event_data,
    invitation: row.invitation_data,
    guest: row.guest_data,
    checkIn: row.check_in_data,
  } : null;
}
