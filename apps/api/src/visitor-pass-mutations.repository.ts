import type { PoolClient } from "pg";

export interface CreatedVisitorPass {
  id: string;
  estate_id: string;
  visitor_name: string;
  valid_from: string;
  valid_until: string;
  status: string;
  created_at: string;
}

export async function createVisitorPass(
  client: PoolClient,
  input: {
    estateId: string;
    hostUserId: string;
    visitorName: string;
    visitorPhone: string | null;
    accessCodeHash: string;
    accessCodeCiphertext: string;
    validFrom: string;
    validUntil: string;
  },
): Promise<CreatedVisitorPass | null> {
  const result = await client.query<CreatedVisitorPass>(
    `INSERT INTO public.visitor_passes
       (estate_id, host_user_id, visitor_name, visitor_phone, access_code_hash,
        access_code_ciphertext, valid_from, valid_until, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
     RETURNING id, estate_id, visitor_name, valid_from, valid_until, status, created_at`,
    [input.estateId, input.hostUserId, input.visitorName, input.visitorPhone, input.accessCodeHash,
      input.accessCodeCiphertext, input.validFrom, input.validUntil],
  );
  return result.rows[0] ?? null;
}

export type VisitorPassStatusUpdate =
  | { kind: "not_found" }
  | { kind: "not_reactivatable" }
  | { kind: "expired" }
  | { kind: "unchanged"; pass: { id: string; status: string; valid_until: string } }
  | { kind: "updated"; pass: { id: string; status: string; valid_until: string } };

export async function updateVisitorPassStatus(
  client: PoolClient,
  input: { estateId: string; passId: string; hostUserId: string; targetStatus: "active" | "revoked" },
): Promise<VisitorPassStatusUpdate> {
  const currentResult = await client.query<{ id: string; status: string; valid_until: string }>(
    `SELECT id, status, valid_until
     FROM public.visitor_passes
     WHERE id = $1 AND estate_id = $2 AND host_user_id = $3
     FOR UPDATE`,
    [input.passId, input.estateId, input.hostUserId],
  );
  const current = currentResult.rows[0];
  if (!current) return { kind: "not_found" };
  if (current.status !== "active" && current.status !== "revoked") return { kind: "not_reactivatable" };
  if (new Date(current.valid_until).getTime() <= Date.now()) return { kind: "expired" };
  if (current.status === input.targetStatus) return { kind: "unchanged", pass: current };

  const updatedResult = await client.query<{ id: string; status: string; valid_until: string }>(
    `UPDATE public.visitor_passes
     SET status = $4
     WHERE id = $1 AND estate_id = $2 AND host_user_id = $3
       AND status = $5 AND valid_until > now()
     RETURNING id, status, valid_until`,
    [input.passId, input.estateId, input.hostUserId, input.targetStatus, current.status],
  );
  const updated = updatedResult.rows[0];
  if (!updated) return { kind: "expired" };
  return { kind: "updated", pass: updated };
}
