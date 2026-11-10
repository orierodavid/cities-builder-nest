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

export type AccountUnitValidation = "available" | "not_found" | "already_assigned";

/** Validate a resident's selected unit under the caller's authenticated RLS context. */
export async function validateAccountUnit(
  client: PoolClient,
  estateId: string,
  unitId: string,
): Promise<AccountUnitValidation> {
  const result = await client.query<{ already_assigned: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.resident_units ru
       WHERE ru.unit_id = u.id AND ru.estate_id = u.estate_id AND ru.end_date IS NULL
     ) AS already_assigned
     FROM public.units u
     WHERE u.id = $1 AND u.estate_id = $2
     LIMIT 1`,
    [unitId, estateId],
  );
  const row = result.rows[0];
  if (!row) return "not_found";
  return row.already_assigned ? "already_assigned" : "available";
}
