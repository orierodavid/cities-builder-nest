-- Security shift handovers between assigned officers.
BEGIN;

CREATE TABLE IF NOT EXISTS public.security_shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES public.estates(id) ON DELETE CASCADE,
  outgoing_officer uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  shift_label text NOT NULL CHECK (char_length(btrim(shift_label)) BETWEEN 2 AND 80),
  shift_started_at timestamptz NOT NULL,
  shift_ended_at timestamptz NOT NULL,
  handover_notes text NOT NULL CHECK (char_length(btrim(handover_notes)) BETWEEN 10 AND 4000),
  pending_actions text CHECK (pending_actions IS NULL OR char_length(pending_actions) <= 3000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged')),
  acknowledged_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_shift_handover_time_order CHECK (shift_ended_at >= shift_started_at),
  CONSTRAINT security_shift_handover_ack_pair CHECK (
    (status = 'pending' AND acknowledged_by IS NULL AND acknowledged_at IS NULL)
    OR (status = 'acknowledged' AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)
  ),
  CONSTRAINT security_shift_handover_not_self_ack CHECK (
    acknowledged_by IS NULL OR acknowledged_by <> outgoing_officer
  )
);

CREATE INDEX IF NOT EXISTS security_shift_handovers_estate_created_idx
  ON public.security_shift_handovers (estate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_shift_handovers_estate_pending_idx
  ON public.security_shift_handovers (estate_id, status, shift_ended_at DESC);

ALTER TABLE public.security_shift_handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_shift_handovers_select_estate_security
ON public.security_shift_handovers FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_shift_handovers.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
);

CREATE POLICY security_shift_handovers_insert_outgoing_security
ON public.security_shift_handovers FOR INSERT TO authenticated WITH CHECK (
  outgoing_officer = (SELECT auth.uid())
  AND status = 'pending'
  AND acknowledged_by IS NULL
  AND acknowledged_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_shift_handovers.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
);

CREATE POLICY security_shift_handovers_acknowledge_incoming_security
ON public.security_shift_handovers FOR UPDATE TO authenticated
USING (
  status = 'pending'
  AND outgoing_officer <> (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_shift_handovers.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
)
WITH CHECK (
  status = 'acknowledged'
  AND acknowledged_by = (SELECT auth.uid())
  AND acknowledged_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = security_shift_handovers.estate_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.membership_role = 'security'
  )
);

COMMIT;
