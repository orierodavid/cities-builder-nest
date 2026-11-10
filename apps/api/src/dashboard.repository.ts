import type { PoolClient } from "pg";

export interface EstateDashboardResult {
  estate: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    timezone: string;
    is_enabled: boolean;
    disabled_at: string | null;
    disabled_reason: string | null;
    membershipRole: string | null;
  } | null;
  summary: {
    units: number;
    occupiedUnits: number;
    openMaintenanceRequests: number;
    publishedAnnouncements: number;
  };
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    published_at: string;
    created_at: string;
  }>;
  maintenanceRequests: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    created_at: string;
  }>;
}

interface DashboardRow {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  timezone: string;
  is_enabled: boolean;
  disabled_at: string | null;
  disabled_reason: string | null;
  membership_role: string | null;
  units: number;
  occupied_units: number;
  open_maintenance_requests: number;
  published_announcements: number;
  announcements: EstateDashboardResult["announcements"];
  maintenance_requests: EstateDashboardResult["maintenanceRequests"];
}

/**
 * Single-round-trip, user-scoped dashboard read. The access CTE gates every
 * aggregate and preview query; RLS remains active for the authenticated role.
 */
export async function getEstateDashboard(
  client: PoolClient,
  userId: string,
  estateId: string,
): Promise<EstateDashboardResult & { membershipFound: boolean }> {
  const result = await client.query<DashboardRow>(
    `WITH current_user_roles AS (
       SELECT EXISTS (
         SELECT 1 FROM public.user_roles
         WHERE user_id = $1 AND role = 'platform_admin'
       ) AS is_platform_admin
     ),
     active_membership AS (
       SELECT membership_role
       FROM public.estate_memberships
       WHERE estate_id = $2 AND user_id = $1 AND status = 'active'
       LIMIT 1
     ),
     authorized_estate AS (
       SELECT e.id, e.name, e.address, e.city, e.state, e.timezone,
              e.is_enabled, e.disabled_at, e.disabled_reason,
              COALESCE(m.membership_role,
                CASE WHEN r.is_platform_admin THEN 'platform_admin' END
              ) AS membership_role
       FROM public.estates e
       CROSS JOIN current_user_roles r
       LEFT JOIN active_membership m ON TRUE
       WHERE e.id = $2
         AND (m.membership_role IS NOT NULL OR r.is_platform_admin)
     )
     SELECT
       e.id, e.name, e.address, e.city, e.state, e.timezone,
       e.is_enabled, e.disabled_at, e.disabled_reason, e.membership_role,
       (SELECT count(*)::int FROM public.units u WHERE u.estate_id = e.id) AS units,
       (SELECT count(*)::int FROM public.units u
         WHERE u.estate_id = e.id AND u.status = 'occupied') AS occupied_units,
       (SELECT count(*)::int FROM public.maintenance_requests m
         WHERE m.estate_id = e.id AND m.status NOT IN ('resolved', 'closed')) AS open_maintenance_requests,
       (SELECT count(*)::int FROM public.announcements a
         WHERE a.estate_id = e.id AND a.published_at IS NOT NULL) AS published_announcements,
       COALESCE((
         SELECT jsonb_agg(to_jsonb(a) ORDER BY a.published_at DESC)
         FROM (
           SELECT id, title, body, published_at, created_at
           FROM public.announcements
           WHERE estate_id = e.id AND published_at IS NOT NULL
           ORDER BY published_at DESC
           LIMIT 3
         ) a
       ), '[]'::jsonb) AS announcements,
       COALESCE((
         SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC)
         FROM (
           SELECT id, title, status, priority, created_at
           FROM public.maintenance_requests
           WHERE estate_id = e.id AND status NOT IN ('resolved', 'closed')
           ORDER BY created_at DESC
           LIMIT 5
         ) m
       ), '[]'::jsonb) AS maintenance_requests
     FROM authorized_estate e`,
    [userId, estateId],
  );

  const row = result.rows[0];
  if (!row) {
    return {
      estate: null,
      membershipFound: false,
      summary: { units: 0, occupiedUnits: 0, openMaintenanceRequests: 0, publishedAnnouncements: 0 },
      announcements: [],
      maintenanceRequests: [],
    };
  }

  return {
    estate: {
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      state: row.state,
      timezone: row.timezone,
      is_enabled: row.is_enabled,
      disabled_at: row.disabled_at,
      disabled_reason: row.disabled_reason,
      membershipRole: row.membership_role,
    },
    membershipFound: row.membership_role !== "platform_admin",
    summary: {
      units: Number(row.units ?? 0),
      occupiedUnits: Number(row.occupied_units ?? 0),
      openMaintenanceRequests: Number(row.open_maintenance_requests ?? 0),
      publishedAnnouncements: Number(row.published_announcements ?? 0),
    },
    announcements: row.announcements ?? [],
    maintenanceRequests: row.maintenance_requests ?? [],
  };
}
