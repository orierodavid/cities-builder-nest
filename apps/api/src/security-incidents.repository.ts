import type { PoolClient } from "pg";

export interface SecurityIncident {
  id: string;
  estate_id: string;
  reported_by: string;
  title: string;
  category: string;
  severity: string;
  description: string;
  location: string | null;
  occurred_at: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityIncidentPage {
  incidents: SecurityIncident[];
  hasMore: boolean;
}

/**
 * RLS controls visibility for active security, estate managers and platform
 * administrators. The query adds estate scoping and stable newest-first paging.
 */
export async function getSecurityIncidents(
  client: PoolClient,
  estateId: string,
  pageSize: number,
  offset: number,
): Promise<SecurityIncidentPage> {
  const result = await client.query<SecurityIncident>(
    `SELECT id, estate_id, reported_by, title, category, severity, description,
            location, occurred_at, status, reviewed_by, reviewed_at,
            resolution_note, created_at, updated_at
     FROM public.security_incident_reports
     WHERE estate_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [estateId, pageSize + 1, offset],
  );
  return {
    incidents: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
