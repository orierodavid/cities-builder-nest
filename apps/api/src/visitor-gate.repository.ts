import type { PoolClient } from "pg";
export interface GateVisitorPass { id: string; host_user_id: string; visitor_name: string; visitor_phone: string | null; valid_from: string; valid_until: string; status: string; host_full_name: string | null }
export async function getGateVisitorPass(client: PoolClient, estateId: string, accessCodeHash: string): Promise<GateVisitorPass | null> {
  const result = await client.query<GateVisitorPass>(
    `SELECT id, host_user_id, visitor_name, visitor_phone, valid_from, valid_until, status, host_full_name
     FROM public.get_gate_visitor_pass_for_security($1, $2)`,
    [estateId, accessCodeHash],
  );
  return result.rows[0] ?? null;
}

export interface VisitorPassDenialResult { result: "denied" | "not_active" | "forbidden"; pass_id: string | null; pass_status: string | null }
export async function denyVisitorPass(
  client: PoolClient,
  input: { estateId: string; passId: string; reason: string | null },
): Promise<VisitorPassDenialResult | null> {
  const result = await client.query<VisitorPassDenialResult>(
    `SELECT result, pass_id, pass_status
     FROM public.deny_visitor_pass_for_security($1, $2, $3)`,
    [input.estateId, input.passId, input.reason],
  );
  return result.rows[0] ?? null;
}
export async function createGateVisitorVisit(client: PoolClient, input: { estateId: string; visitorPassId: string; checkedInBy: string }): Promise<{ id: string; visitor_pass_id: string; checked_in_at: string } | null> {
  const result = await client.query(
    `INSERT INTO public.visitor_visits (estate_id, visitor_pass_id, checked_in_by)
     VALUES ($1, $2, $3) RETURNING id, visitor_pass_id, checked_in_at`,
    [input.estateId, input.visitorPassId, input.checkedInBy],
  );
  return result.rows[0] ?? null;
}
export async function checkoutGateVisitorVisit(client: PoolClient, input: { estateId: string; visitId: string; checkedOutBy: string; checkedOutAt: string }): Promise<{ id: string; checked_in_at: string; checked_out_at: string } | null> {
  const result = await client.query(
    `UPDATE public.visitor_visits SET checked_out_by = $3, checked_out_at = $4
     WHERE id = $1 AND estate_id = $2 AND checked_out_at IS NULL
     RETURNING id, checked_in_at, checked_out_at`,
    [input.visitId, input.estateId, input.checkedOutBy, input.checkedOutAt],
  );
  return result.rows[0] ?? null;
}
