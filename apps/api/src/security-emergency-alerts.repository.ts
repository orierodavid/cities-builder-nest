import type { PoolClient } from "pg";

export interface SecurityEmergencyAlert {
  id: string;
  estate_id: string;
  created_by: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  location: string | null;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityEmergencyAlertPage {
  alerts: SecurityEmergencyAlert[];
  hasMore: boolean;
}

/**
 * RLS remains the visibility boundary: active estate members and platform
 * administrators can read alerts visible to their authenticated database role.
 */
export async function getSecurityEmergencyAlerts(
  client: PoolClient,
  estateId: string,
  pageSize: number,
  offset: number,
): Promise<SecurityEmergencyAlertPage> {
  const result = await client.query<SecurityEmergencyAlert>(
    `SELECT id, estate_id, created_by, alert_type, severity, title, message,
            location, status, resolved_by, resolved_at, created_at, updated_at
     FROM public.security_emergency_alerts
     WHERE estate_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [estateId, pageSize + 1, offset],
  );
  return {
    alerts: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
