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
  status: string;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
}

export async function createSecurityShiftHandover(
  client: PoolClient,
  input: {
    estateId: string; userId: string; shiftLabel: string; shiftStartedAt: string;
    shiftEndedAt: string; handoverNotes: string; pendingActions: string | null;
  },
): Promise<SecurityShiftHandover | null> {
  const result = await client.query<SecurityShiftHandover>(
    `INSERT INTO public.security_shift_handovers
       (estate_id, outgoing_officer, shift_label, shift_started_at, shift_ended_at,
        handover_notes, pending_actions, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id, estate_id, outgoing_officer, shift_label, shift_started_at,
       shift_ended_at, handover_notes, pending_actions, status, created_at`,
    [input.estateId, input.userId, input.shiftLabel, input.shiftStartedAt, input.shiftEndedAt, input.handoverNotes, input.pendingActions],
  );
  return result.rows[0] ?? null;
}

export async function acknowledgeSecurityShiftHandover(
  client: PoolClient,
  input: { estateId: string; handoverId: string; userId: string; acknowledgedAt: string },
): Promise<{ id: string; estate_id: string; status: string; acknowledged_by: string; acknowledged_at: string } | null> {
  const result = await client.query(
    `UPDATE public.security_shift_handovers
     SET status = 'acknowledged', acknowledged_by = $3, acknowledged_at = $4
     WHERE id = $1 AND estate_id = $2 AND status = 'pending'
       AND outgoing_officer <> $3
     RETURNING id, estate_id, status, acknowledged_by, acknowledged_at`,
    [input.handoverId, input.estateId, input.userId, input.acknowledgedAt],
  );
  return result.rows[0] ?? null;
}

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
  created_at: string;
}

export async function createSecurityIncident(
  client: PoolClient,
  input: {
    estateId: string; userId: string; title: string; category: string; severity: string;
    description: string; location: string | null; occurredAt: string;
  },
): Promise<SecurityIncident | null> {
  const result = await client.query<SecurityIncident>(
    `INSERT INTO public.security_incident_reports
       (estate_id, reported_by, title, category, severity, description, location, occurred_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
     RETURNING id, estate_id, reported_by, title, category, severity, description,
       location, occurred_at, status, created_at`,
    [input.estateId, input.userId, input.title, input.category, input.severity, input.description, input.location, input.occurredAt],
  );
  return result.rows[0] ?? null;
}
