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

/** User-scoped dashboard read. Caller must use withAuthenticatedTransaction. */
export async function getEstateDashboard(
  client: PoolClient,
  userId: string,
  estateId: string,
): Promise<EstateDashboardResult & { membershipFound: boolean }> {
  const [roles, membership, estate, announcements, announcementCount, maintenance, maintenanceCount, units, occupiedUnits] = await Promise.all([
    client.query<{ role: string }>(
      "SELECT role FROM public.user_roles WHERE user_id = $1",
      [userId],
    ),
    client.query<{ membership_role: string }>(
      "SELECT membership_role FROM public.estate_memberships WHERE estate_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1",
      [estateId, userId],
    ),
    client.query<EstateDashboardResult["estate"] extends infer T ? Omit<NonNullable<T>, "membershipRole"> : never>(
      "SELECT id, name, address, city, state, timezone, is_enabled, disabled_at, disabled_reason FROM public.estates WHERE id = $1 LIMIT 1",
      [estateId],
    ),
    client.query<EstateDashboardResult["announcements"][number]>(
      "SELECT id, title, body, published_at, created_at FROM public.announcements WHERE estate_id = $1 AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 3",
      [estateId],
    ),
    client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.announcements WHERE estate_id = $1 AND published_at IS NOT NULL",
      [estateId],
    ),
    client.query<EstateDashboardResult["maintenanceRequests"][number]>(
      "SELECT id, title, status, priority, created_at FROM public.maintenance_requests WHERE estate_id = $1 AND status NOT IN ('resolved', 'closed') ORDER BY created_at DESC LIMIT 5",
      [estateId],
    ),
    client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.maintenance_requests WHERE estate_id = $1 AND status NOT IN ('resolved', 'closed')",
      [estateId],
    ),
    client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.units WHERE estate_id = $1",
      [estateId],
    ),
    client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.units WHERE estate_id = $1 AND status = 'occupied'",
      [estateId],
    ),
  ]);

  const platformAdmin = roles.rows.some((row) => row.role === "platform_admin");
  const membershipRole = membership.rows[0]?.membership_role ?? null;
  const estateRow = estate.rows[0];

  if (!estateRow || (!membershipRole && !platformAdmin)) {
    return {
      estate: null,
      membershipFound: Boolean(membershipRole),
      summary: { units: 0, occupiedUnits: 0, openMaintenanceRequests: 0, publishedAnnouncements: 0 },
      announcements: [],
      maintenanceRequests: [],
    };
  }

  return {
    estate: { ...estateRow, membershipRole: membershipRole ?? (platformAdmin ? "platform_admin" : null) },
    membershipFound: Boolean(membershipRole),
    summary: {
      units: Number(units.rows[0]?.count ?? 0),
      occupiedUnits: Number(occupiedUnits.rows[0]?.count ?? 0),
      openMaintenanceRequests: Number(maintenanceCount.rows[0]?.count ?? 0),
      publishedAnnouncements: Number(announcementCount.rows[0]?.count ?? 0),
    },
    announcements: announcements.rows,
    maintenanceRequests: maintenance.rows,
  };
}
