import type { PoolClient } from "pg";

export interface EstateEventAttendanceGuest {
  id: string;
  guest_name: string;
  email: string | null;
  phone: string | null;
  invitationStatus: "active" | "none";
  checkedInAt: string | null;
  attendanceStatus: "checked_in" | "not_checked_in";
}

export interface EstateEventAttendanceReport {
  event: {
    id: string;
    title: string;
    venue: string;
    starts_at: string;
    ends_at: string;
    status: string;
  };
  summary: {
    totalGuests: number;
    checkedIn: number;
    outstanding: number;
    activeInvitations: number;
    attendancePercentage: number;
  };
  guests: EstateEventAttendanceGuest[];
  hasMore: boolean;
}

/**
 * Read the event attendance report using the caller's authenticated role.
 * RLS on events, guests, invitations and check-ins remains in force.
 */
export async function getEstateEventAttendanceReport(
  client: PoolClient,
  estateId: string,
  eventId: string,
  pageSize: number,
  offset: number,
): Promise<EstateEventAttendanceReport | null> {
  const result = await client.query<{
    event: EstateEventAttendanceReport["event"];
    total_guests: number;
    checked_in: number;
    active_invitations: number;
    guests: EstateEventAttendanceGuest[];
  }>(
    `SELECT
       jsonb_build_object(
         'id', e.id,
         'title', e.title,
         'venue', e.venue,
         'starts_at', e.starts_at,
         'ends_at', e.ends_at,
         'status', e.status
       ) AS event,
       (SELECT count(*)::int
          FROM public.estate_event_guests g
         WHERE g.estate_id = e.estate_id AND g.event_id = e.id) AS total_guests,
       (SELECT count(*)::int
          FROM public.estate_event_checkins c
         WHERE c.estate_id = e.estate_id AND c.event_id = e.id) AS checked_in,
       (SELECT count(*)::int
          FROM public.estate_event_invitations i
         WHERE i.estate_id = e.estate_id AND i.event_id = e.id AND i.status = 'active') AS active_invitations,
       COALESCE((
         SELECT jsonb_agg(
           jsonb_build_object(
             'id', page_guest.id,
             'guest_name', page_guest.guest_name,
             'email', page_guest.email,
             'phone', page_guest.phone,
             'invitationStatus', page_guest.invitation_status,
             'checkedInAt', page_guest.checked_in_at,
             'attendanceStatus', page_guest.attendance_status
           ) ORDER BY page_guest.guest_name ASC, page_guest.id ASC
         )
         FROM (
           SELECT
             g.id,
             g.guest_name,
             g.email,
             g.phone,
             CASE WHEN EXISTS (
               SELECT 1 FROM public.estate_event_invitations i
                WHERE i.estate_id = g.estate_id
                  AND i.event_id = g.event_id
                  AND i.guest_id = g.id
                  AND i.status = 'active'
             ) THEN 'active' ELSE 'none' END AS invitation_status,
             c.checked_in_at,
             CASE WHEN c.id IS NULL THEN 'not_checked_in' ELSE 'checked_in' END AS attendance_status
           FROM public.estate_event_guests g
           LEFT JOIN public.estate_event_checkins c
             ON c.guest_id = g.id
            AND c.estate_id = g.estate_id
            AND c.event_id = g.event_id
           WHERE g.estate_id = e.estate_id AND g.event_id = e.id
           ORDER BY g.guest_name ASC, g.id ASC
           LIMIT $3 OFFSET $4
         ) AS page_guest
       ), '[]'::jsonb) AS guests
     FROM public.estate_events e
     WHERE e.id = $1 AND e.estate_id = $2`,
    [eventId, estateId, pageSize + 1, offset],
  );

  const row = result.rows[0];
  if (!row) return null;
  const totalGuests = row.total_guests;
  const checkedIn = row.checked_in;
  return {
    event: row.event,
    summary: {
      totalGuests,
      checkedIn,
      outstanding: Math.max(0, totalGuests - checkedIn),
      activeInvitations: row.active_invitations,
      attendancePercentage: totalGuests ? Math.round((checkedIn / totalGuests) * 100) : 0,
    },
    guests: row.guests.slice(0, pageSize),
    hasMore: row.guests.length > pageSize,
  };
}
