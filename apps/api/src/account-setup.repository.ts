import type { PoolClient } from "pg";

export interface CreatedEstateAccountMembership {
  id: string;
  estate_id: string;
  user_id: string;
  membership_role: string;
  status: string;
  created_at: string;
}

/**
 * Provisions the profile, estate membership and (for residents) unit assignment
 * through a narrowly scoped SECURITY DEFINER database function. The function
 * validates auth.uid() and estate-manager/platform-admin permissions itself.
 */
export async function createEstateAccountMembership(
  client: PoolClient,
  input: { estateId: string; userId: string; fullName: string; role: string; unitId: string | null },
): Promise<CreatedEstateAccountMembership | null> {
  const result = await client.query<CreatedEstateAccountMembership>(
    `SELECT id, estate_id, user_id, membership_role, status, created_at
     FROM public.create_estate_account_membership($1, $2, $3, $4, $5)`,
    [input.estateId, input.userId, input.fullName, input.role, input.unitId],
  );
  return result.rows[0] ?? null;
}
