import type { PoolClient } from "pg";

interface ProfileRow {
  id: string;
  full_name: string;
  phone_e164: string | null;
  home_number: string | null;
  street_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MembershipRow {
  id: string;
  estate_id: string;
  membership_role: string;
  status: string;
  estate: {
    name: string;
    address: string;
    city: string;
    state: string;
  } | null;
}

interface ResidentUnitRow {
  unit_id: string;
  start_date: string;
  end_date: string | null;
  units: {
    unit_code: string;
    unit_type: string | null;
    building_id: string;
    buildings: {
      name: string;
      estate_id: string;
      estates: { name: string } | null;
    } | null;
  } | null;
}

export interface MeRepositoryResult {
  profile: ProfileRow | null;
  globalRoles: string[];
  estateMemberships: Array<Omit<MembershipRow, "estate"> & { estates: MembershipRow["estate"] }>;
  residentUnits: ResidentUnitRow[];
}

/**
 * Reads the current user's profile and memberships through PostgreSQL.
 * The caller must run this repository inside withAuthenticatedTransaction()
 * so database RLS is evaluated for the validated user.
 */
export async function getMeData(
  client: PoolClient,
  userId: string,
): Promise<MeRepositoryResult> {
  const [profileResult, rolesResult, membershipsResult, residentUnitsResult] = await Promise.all([
    client.query<ProfileRow>(
      `SELECT id, full_name, phone_e164, home_number, street_name, is_active, created_at, updated_at
       FROM public.users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    ),
    client.query<{ role: string }>(
      `SELECT role
       FROM public.user_roles
       WHERE user_id = $1`,
      [userId],
    ),
    client.query<MembershipRow>(
      `SELECT
         m.id,
         m.estate_id,
         m.membership_role,
         m.status,
         CASE WHEN e.id IS NULL THEN NULL
           ELSE jsonb_build_object(
             'name', e.name,
             'address', e.address,
             'city', e.city,
             'state', e.state
           )
         END AS estate
       FROM public.estate_memberships m
       LEFT JOIN public.estates e ON e.id = m.estate_id
       WHERE m.user_id = $1
       ORDER BY m.created_at ASC`,
      [userId],
    ),
    client.query<ResidentUnitRow>(
      `SELECT
         ru.unit_id,
         ru.start_date,
         ru.end_date,
         CASE WHEN u.id IS NULL THEN NULL
           ELSE jsonb_build_object(
             'unit_code', u.unit_code,
             'unit_type', u.unit_type,
             'building_id', u.building_id,
             'buildings', CASE WHEN b.id IS NULL THEN NULL
               ELSE jsonb_build_object(
                 'name', b.name,
                 'estate_id', b.estate_id,
                 'estates', CASE WHEN e.id IS NULL THEN NULL
                   ELSE jsonb_build_object('name', e.name)
                 END
               )
             END
           )
         END AS units
       FROM public.resident_units ru
       LEFT JOIN public.units u ON u.id = ru.unit_id
       LEFT JOIN public.buildings b ON b.id = u.building_id
       LEFT JOIN public.estates e ON e.id = b.estate_id
       WHERE ru.resident_user_id = $1
         AND ru.end_date IS NULL`,
      [userId],
    ),
  ]);

  return {
    profile: profileResult.rows[0] ?? null,
    globalRoles: rolesResult.rows.map((row) => row.role),
    estateMemberships: membershipsResult.rows.map(({ estate, ...membership }) => ({
      ...membership,
      estates: estate,
    })),
    residentUnits: residentUnitsResult.rows,
  };
}
