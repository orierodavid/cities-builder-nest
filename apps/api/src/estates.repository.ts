import type { PoolClient } from "pg";

export interface EstateListItem {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  timezone: string;
  is_enabled: boolean;
  disabled_at: string | null;
  disabled_reason: string | null;
  membershipRole: string;
}

export interface EstateListResult {
  estates: EstateListItem[];
}

/**
 * Lists estates visible to the authenticated user.
 * The caller must use withAuthenticatedTransaction() so RLS is enforced.
 * Platform administrators receive all estates; other users receive only
 * estates with their active membership.
 */
export async function getEstatesForUser(
  client: PoolClient,
  userId: string,
): Promise<EstateListResult> {
  const roles = await client.query<{ role: string }>(
    `SELECT role
     FROM public.user_roles
     WHERE user_id = $1`,
    [userId],
  );
  const isPlatformAdmin = roles.rows.some((row) => row.role === "platform_admin");

  if (isPlatformAdmin) {
    const result = await client.query<Omit<EstateListItem, "membershipRole">>(
      `SELECT id, name, address, city, state, timezone, is_enabled, disabled_at, disabled_reason
       FROM public.estates
       ORDER BY name ASC`,
    );
    return {
      estates: result.rows.map((estate) => ({ ...estate, membershipRole: "platform_admin" })),
    };
  }

  const result = await client.query<Omit<EstateListItem, "membershipRole"> & { membership_role: string }>(
    `SELECT
       e.id, e.name, e.address, e.city, e.state, e.timezone,
       e.is_enabled, e.disabled_at, e.disabled_reason,
       m.membership_role
     FROM public.estate_memberships m
     INNER JOIN public.estates e ON e.id = m.estate_id
     WHERE m.user_id = $1
       AND m.status = 'active'
     ORDER BY e.name ASC`,
    [userId],
  );

  return {
    estates: result.rows.map(({ membership_role, ...estate }) => ({
      ...estate,
      membershipRole: membership_role,
    })),
  };
}
