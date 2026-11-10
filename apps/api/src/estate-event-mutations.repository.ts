import type { PoolClient } from "pg";

export interface EventGuest {
  id: string;
  estate_id: string;
  event_id: string;
  guest_name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface EventInvitationContext {
  guest: { id: string; guest_name: string; email: string | null; phone: string | null };
  event: { id: string; title: string; venue: string; starts_at: string; ends_at: string; venue_approval_status: string | null };
}

export async function createEstateEventGuest(
  client: PoolClient,
  input: { estateId: string; eventId: string; guestName: string; email: string | null; phone: string | null; notes: string; userId: string },
): Promise<EventGuest | null> {
  const result = await client.query<EventGuest>(
    `INSERT INTO public.estate_event_guests
       (estate_id, event_id, guest_name, email, phone, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, estate_id, event_id, guest_name, email, phone, notes, created_at, updated_at`,
    [input.estateId, input.eventId, input.guestName, input.email, input.phone, input.notes, input.userId],
  );
  return result.rows[0] ?? null;
}

export async function deleteEstateEventGuest(
  client: PoolClient,
  estateId: string,
  eventId: string,
  guestId: string,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `DELETE FROM public.estate_event_guests
     WHERE estate_id = $1 AND event_id = $2 AND id = $3
     RETURNING id`,
    [estateId, eventId, guestId],
  );
  return result.rows[0]?.id ?? null;
}

export async function issueEstateEventInvitation(
  client: PoolClient,
  input: { estateId: string; eventId: string; guestId: string; codeHash: string; userId: string; revokedAt: string },
): Promise<
  | { kind: "venue_pending"; context: EventInvitationContext }
  | { kind: "created"; context: EventInvitationContext; invitation: { id: string; guest_id: string; status: string; created_at: string } }
  | null
> {
  // Lock the guest row so two simultaneous issue requests cannot race while
  // replacing the one-active-invitation-per-guest record.
  const contextResult = await client.query<EventInvitationContext>(
    `SELECT
       jsonb_build_object('id', g.id, 'guest_name', g.guest_name, 'email', g.email, 'phone', g.phone) AS guest,
       jsonb_build_object('id', e.id, 'title', e.title, 'venue', e.venue, 'starts_at', e.starts_at,
         'ends_at', e.ends_at, 'venue_approval_status', e.venue_approval_status) AS event
     FROM public.estate_event_guests g
     INNER JOIN public.estate_events e
       ON e.id = g.event_id AND e.estate_id = g.estate_id
     WHERE g.id = $1 AND g.estate_id = $2 AND g.event_id = $3
     FOR UPDATE OF g`,
    [input.guestId, input.estateId, input.eventId],
  );
  const context = contextResult.rows[0];
  if (!context) return null;
  if (context.event.venue_approval_status && context.event.venue_approval_status !== "approved") {
    return { kind: "venue_pending", context };
  }

  await client.query(
    `UPDATE public.estate_event_invitations
     SET status = 'revoked', revoked_at = $4
     WHERE estate_id = $1 AND event_id = $2 AND guest_id = $3 AND status = 'active'`,
    [input.estateId, input.eventId, input.guestId, input.revokedAt],
  );

  const invitationResult = await client.query<{ id: string; guest_id: string; status: string; created_at: string }>(
    `INSERT INTO public.estate_event_invitations
       (estate_id, event_id, guest_id, code_hash, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, guest_id, status, created_at`,
    [input.estateId, input.eventId, input.guestId, input.codeHash, input.userId],
  );
  const invitation = invitationResult.rows[0];
  return invitation ? { kind: "created", context, invitation } : null;
}

export async function revokeEstateEventInvitation(
  client: PoolClient,
  input: { estateId: string; eventId: string; invitationId: string; revokedAt: string },
): Promise<{ id: string; status: string; revoked_at: string } | null> {
  const result = await client.query<{ id: string; status: string; revoked_at: string }>(
    `UPDATE public.estate_event_invitations
     SET status = 'revoked', revoked_at = $4
     WHERE id = $1 AND estate_id = $2 AND event_id = $3 AND status = 'active'
     RETURNING id, status, revoked_at`,
    [input.invitationId, input.estateId, input.eventId, input.revokedAt],
  );
  return result.rows[0] ?? null;
}

export async function createEstateEventCheckIn(
  client: PoolClient,
  input: { estateId: string; eventId: string; codeHash: string; userId: string },
): Promise<
  | { kind: "not_found" }
  | { kind: "already_checked_in"; checkIn: { id: string; checked_in_at: string }; guest: { id: string; guest_name: string; email: string | null; phone: string | null } }
  | { kind: "created"; checkIn: { id: string; guest_id: string; invitation_id: string; checked_in_at: string }; guest: { id: string; guest_name: string; email: string | null; phone: string | null } }
> {
  const invitationResult = await client.query<{
    id: string; guest_id: string; guest_name: string; email: string | null; phone: string | null;
  }>(
    `SELECT i.id, i.guest_id, g.guest_name, g.email, g.phone
     FROM public.estate_event_invitations i
     INNER JOIN public.estate_event_guests g
       ON g.id = i.guest_id AND g.estate_id = i.estate_id AND g.event_id = i.event_id
     WHERE i.estate_id = $1 AND i.event_id = $2
       AND i.code_hash = $3 AND i.status = 'active'
     LIMIT 1`,
    [input.estateId, input.eventId, input.codeHash],
  );
  const invitation = invitationResult.rows[0];
  if (!invitation) return { kind: "not_found" };
  const guest = { id: invitation.guest_id, guest_name: invitation.guest_name, email: invitation.email, phone: invitation.phone };

  const insertResult = await client.query<{ id: string; guest_id: string; invitation_id: string; checked_in_at: string }>(
    `INSERT INTO public.estate_event_checkins
       (estate_id, event_id, guest_id, invitation_id, checked_in_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_id, guest_id) DO NOTHING
     RETURNING id, guest_id, invitation_id, checked_in_at`,
    [input.estateId, input.eventId, invitation.guest_id, invitation.id, input.userId],
  );
  const created = insertResult.rows[0];
  if (created) return { kind: "created", checkIn: created, guest };

  const existingResult = await client.query<{ id: string; checked_in_at: string }>(
    `SELECT id, checked_in_at
     FROM public.estate_event_checkins
     WHERE estate_id = $1 AND event_id = $2 AND guest_id = $3
     LIMIT 1`,
    [input.estateId, input.eventId, invitation.guest_id],
  );
  const existing = existingResult.rows[0];
  if (!existing) return { kind: "not_found" };
  return { kind: "already_checked_in", checkIn: existing, guest };
}

export interface EventVenueRecord { id: string; name: string; location: string | null; status: string }
export interface EventWriteRecord {
  id: string; estate_id: string; title: string; description: string; venue: string; venue_id: string | null;
  venue_approval_status: string; starts_at: string; ends_at: string; status: string; created_by: string; created_at: string; updated_at: string;
}
export type CreateEventResult = { kind: "venue_unavailable" } | { kind: "created"; event: EventWriteRecord };

export async function createEstateEvent(
  client: PoolClient,
  input: { estateId: string; creatorUserId: string; title: string; description: string; venueId: string; venueLabel: string; startsAt: string; endsAt: string; status: string; requestedAt: string },
): Promise<CreateEventResult> {
  let venue: EventVenueRecord | null = null;
  if (input.venueId !== "home") {
    const venueResult = await client.query<EventVenueRecord>(
      "SELECT id, name, location, status FROM public.estate_venues WHERE id = $1 AND estate_id = $2 LIMIT 1",
      [input.venueId, input.estateId],
    );
    venue = venueResult.rows[0] ?? null;
    if (!venue || venue.status !== "available") return { kind: "venue_unavailable" };
  }
  const requiresApproval = input.venueId !== "home";
  const venueLabel = venue ? (venue.location ? venue.name + " · " + venue.location : venue.name) : input.venueLabel;
  const result = await client.query<EventWriteRecord>(
    `INSERT INTO public.estate_events
       (estate_id, title, description, venue, venue_id, venue_approval_status,
        venue_approval_requested_at, venue_approval_publish_requested, starts_at, ends_at, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, estate_id, title, description, venue, venue_id, venue_approval_status,
       starts_at, ends_at, status, created_by, created_at, updated_at`,
    [input.estateId, input.title, input.description, venueLabel, venue?.id ?? null,
      requiresApproval ? "pending" : "approved", requiresApproval ? input.requestedAt : null,
      requiresApproval && input.status === "published", input.startsAt, input.endsAt,
      requiresApproval ? "draft" : input.status, input.creatorUserId],
  );
  const event = result.rows[0];
  return event ? { kind: "created", event } : { kind: "venue_unavailable" };
}

export type UpdateEventResult = { kind: "not_found" } | { kind: "venue_pending" } | { kind: "updated"; event: EventWriteRecord };
export async function updateEstateEvent(
  client: PoolClient,
  input: { estateId: string; eventId: string; title: string; description: string; venue: string; startsAt: string; endsAt: string; status: string; updatedAt: string },
): Promise<UpdateEventResult> {
  const current = await client.query<{ venue_approval_status: string | null }>(
    "SELECT venue_approval_status FROM public.estate_events WHERE estate_id = $1 AND id = $2 FOR UPDATE",
    [input.estateId, input.eventId],
  );
  const event = current.rows[0];
  if (!event) return { kind: "not_found" };
  if (input.status === "published" && event.venue_approval_status && event.venue_approval_status !== "approved") return { kind: "venue_pending" };
  const result = await client.query<EventWriteRecord>(
    `UPDATE public.estate_events
     SET title = $3, description = $4, venue = $5, starts_at = $6, ends_at = $7, status = $8, updated_at = $9
     WHERE estate_id = $1 AND id = $2
     RETURNING id, estate_id, title, description, venue, venue_id, venue_approval_status,
       starts_at, ends_at, status, created_by, created_at, updated_at`,
    [input.estateId, input.eventId, input.title, input.description, input.venue,
      input.startsAt, input.endsAt, input.status, input.updatedAt],
  );
  const updated = result.rows[0];
  return updated ? { kind: "updated", event: updated } : { kind: "not_found" };
}
