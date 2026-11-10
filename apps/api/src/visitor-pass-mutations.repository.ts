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
