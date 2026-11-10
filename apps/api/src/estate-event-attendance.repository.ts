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
         'id', e.id, 'title', e.title, 'venue', e.venue,
         'starts_at', e.starts_at, 'ends_at', e.ends_at, 'status', e.status
       ) AS event,
       (SELECT count(*)::int FROM public.estate_event_guests g
         WHERE g.estate_id = e.estate_id AND g.event_id = e.id) AS total_guests,
       (SELECT count(*)::int FROM public.estate_event_checkins c
         WHERE c.estate_id = e.estate_id AND c.event_id = e.id) AS checked_in,
       (SELECT count(*)::int FROM public.estate_event_invitations i
         WHERE i.estate_id = e.estate_id AND i.event_id = e.id AND i.status = 'active') AS active_invitations,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'id', page_guest.id, 'guest_name', page_guest.guest_name,
           'email', page_guest.email, 'phone', page_guest.phone,
           'invitationStatus', page_guest.invitation_status,
           'checkedInAt', page_guest.checked_in_at,
           'attendanceStatus', page_guest.attendance_status
         ) ORDER BY page_guest.guest_name ASC, page_guest.id ASC)
         FROM (
           SELECT g.id, g.guest_name, g.email, g.phone,
             CASE WHEN EXISTS (
               SELECT 1 FROM public.estate_event_invitations i
                WHERE i.estate_id = g.estate_id AND i.event_id = g.event_id
                  AND i.guest_id = g.id AND i.status = 'active'
             ) THEN 'active' ELSE 'none' END AS invitation_status,
             c.checked_in_at,
             CASE WHEN c.id IS NULL THEN 'not_checked_in' ELSE 'checked_in' END AS attendance_status
           FROM public.estate_event_guests g
           LEFT JOIN public.estate_event_checkins c
             ON c.guest_id = g.id AND c.estate_id = g.estate_id AND c.event_id = g.event_id
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

export interface EstateEventAttendanceSummary {
  event_id: string;
  total_guests: number;
  checked_in: number;
  active_invitations: number;
}

/**
 * Aggregate counts only for the current event page. This avoids running three
 * correlated count subqueries for every event in the full estate history.
 */
export async function getEstateEventAttendanceSummaries(
  client: PoolClient,
  estateId: string,
  creatorUserId: string,
  pageSize: number,
  offset: number,
): Promise<Array<{
  eventId: string;
  totalGuests: number;
  checkedIn: number;
  activeInvitations: number;
  outstanding: number;
  attendancePercentage: number;
}>> {
  const result = await client.query<EstateEventAttendanceSummary>(
    `WITH event_page AS (
       SELECT e.id, e.estate_id, e.starts_at
       FROM public.estate_events e
       WHERE e.estate_id = $1 AND e.created_by = $2
       ORDER BY e.starts_at ASC, e.id ASC
       LIMIT $3 OFFSET $4
     ),
     guest_counts AS (
       SELECT g.event_id, count(*)::int AS total_guests
       FROM public.estate_event_guests g
       JOIN event_page e ON e.id = g.event_id AND e.estate_id = g.estate_id
       GROUP BY g.event_id
     ),
     checkin_counts AS (
       SELECT c.event_id, count(*)::int AS checked_in
       FROM public.estate_event_checkins c
       JOIN event_page e ON e.id = c.event_id AND e.estate_id = c.estate_id
       GROUP BY c.event_id
     ),
     invitation_counts AS (
       SELECT i.event_id, count(*)::int AS active_invitations
       FROM public.estate_event_invitations i
       JOIN event_page e ON e.id = i.event_id AND e.estate_id = i.estate_id
       WHERE i.status = 'active'
       GROUP BY i.event_id
     )
     SELECT e.id AS event_id,
       COALESCE(g.total_guests, 0) AS total_guests,
       COALESCE(c.checked_in, 0) AS checked_in,
       COALESCE(i.active_invitations, 0) AS active_invitations
     FROM event_page e
     LEFT JOIN guest_counts g ON g.event_id = e.id
     LEFT JOIN checkin_counts c ON c.event_id = e.id
     LEFT JOIN invitation_counts i ON i.event_id = e.id
     ORDER BY e.starts_at ASC, e.id ASC`,
    [estateId, creatorUserId, pageSize, offset],
  );
  return result.rows.map((row) => {
    const totalGuests = Number(row.total_guests);
    const checkedIn = Number(row.checked_in);
    return {
      eventId: row.event_id,
      totalGuests,
      checkedIn,
      activeInvitations: Number(row.active_invitations),
      outstanding: Math.max(0, totalGuests - checkedIn),
      attendancePercentage: totalGuests ? Math.round((checkedIn / totalGuests) * 100) : 0,
    };
  });
}
