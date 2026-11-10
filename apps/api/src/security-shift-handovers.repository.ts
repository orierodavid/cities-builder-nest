import type { PoolClient } from "pg";

export interface SecurityShiftHandover {
  id: string;
  estate_id: string;
  outgoing_officer: string;
  shift_label: string;
  shift_started_at: string;
  shift_ended_at: string;
  handover_notes: string;
  pending_actions: string | null;
  status: "pending" | "acknowledged";
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface SecurityShiftHandoverPage {
  handovers: SecurityShiftHandover[];
  hasMore: boolean;
}

/**
 * Lists handovers for one estate. The caller must use withAuthenticatedTransaction:
 * the database's authenticated role and JWT subject let the existing RLS policy
 * restrict results to active security members of this estate.
 */
export async function getSecurityShiftHandovers(
  client: PoolClient,
  estateId: string,
  pageSize: number,
  offset: number,
): Promise<SecurityShiftHandoverPage> {
  const result = await client.query<SecurityShiftHandover>(
    `SELECT id, estate_id, outgoing_officer, shift_label, shift_started_at,
            shift_ended_at, handover_notes, pending_actions, status,
            acknowledged_by, acknowledged_at, created_at
     FROM public.security_shift_handovers
     WHERE estate_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [estateId, pageSize + 1, offset],
  );
  return {
    handovers: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
