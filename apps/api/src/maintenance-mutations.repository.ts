import type { PoolClient } from "pg";
import type { MaintenanceInput } from "./maintenance-validation.js";

export async function createMaintenanceRequest(
  client: PoolClient,
  estateId: string,
  userId: string,
  input: MaintenanceInput,
): Promise<{ id: string; title: string; description: string; status: string; priority: string; created_at: string } | null> {
  const result = await client.query(
    `INSERT INTO public.maintenance_requests
       (estate_id, created_by, title, description, priority${input.unitId ? ", unit_id" : ""})
     VALUES ($1, $2, $3, $4, $5${input.unitId ? ", $6" : ""})
     RETURNING id, title, description, status, priority, created_at`,
    input.unitId
      ? [estateId, userId, input.title, input.description, input.priority, input.unitId]
      : [estateId, userId, input.title, input.description, input.priority],
  );
  return result.rows[0] ?? null;
}
