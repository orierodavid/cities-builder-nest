import type { PoolClient } from "pg";

export interface PublishedEmergencyAlert {
  alert: Record<string, unknown>;
  notificationId: string | null;
  recipientCount: number;
}

export async function publishSecurityEmergencyAlert(
  client: PoolClient,
  input: { estateId: string; alertType: string; severity: string; title: string; message: string; location: string | null },
): Promise<PublishedEmergencyAlert | null> {
  const result = await client.query<{ result: PublishedEmergencyAlert }>(
    `SELECT public.publish_security_emergency_alert($1, $2, $3, $4, $5, $6) AS result`,
    [input.estateId, input.alertType, input.severity, input.title, input.message, input.location],
  );
  return result.rows[0]?.result ?? null;
}

export async function resolveSecurityEmergencyAlert(
  client: PoolClient,
  input: { estateId: string; alertId: string; userId: string; resolvedAt: string },
): Promise<{ id: string; estate_id: string; title: string; status: string; resolved_by: string; resolved_at: string } | null> {
  const result = await client.query(
    `UPDATE public.security_emergency_alerts
     SET status = 'resolved', resolved_by = $3, resolved_at = $4, updated_at = $4
     WHERE id = $1 AND estate_id = $2 AND status = 'active'
     RETURNING id, estate_id, title, status, resolved_by, resolved_at`,
    [input.alertId, input.estateId, input.userId, input.resolvedAt],
  );
  return result.rows[0] ?? null;
}
