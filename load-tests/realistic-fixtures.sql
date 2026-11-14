-- Disposable fixture schema for realistic API endpoint load tests.
-- This file refuses to run outside the dedicated GitHub Actions database.
DO $guard$
BEGIN
  IF current_database() <> 'cbnest_load_test' THEN
    RAISE EXCEPTION 'Refusing to seed non-load-test database: %', current_database();
  END IF;
END
$guard$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $authuid$ SELECT COALESCE(
  NULLIF(current_setting('request.jwt.claim.sub', true), ''),
  NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
)::uuid $authuid$;

CREATE OR REPLACE FUNCTION public.current_user_has_required_legal_consent() RETURNS boolean
LANGUAGE sql STABLE
AS $consent$ SELECT true $consent$;
CREATE TABLE public.users (
  id uuid PRIMARY KEY, full_name text NOT NULL, phone_e164 text,
  home_number text, street_name text, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role)
);
CREATE TABLE public.estates (
  id uuid PRIMARY KEY, name text NOT NULL, address text NOT NULL, city text NOT NULL,
  state text NOT NULL, timezone text NOT NULL, is_enabled boolean NOT NULL DEFAULT true,
  disabled_at timestamptz, disabled_reason text
);
CREATE TABLE public.estate_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  user_id uuid NOT NULL, membership_role text NOT NULL, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (estate_id, user_id)
);
CREATE TABLE public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  building_id uuid NOT NULL, unit_code text NOT NULL, unit_type text,
  status text NOT NULL
);
CREATE TABLE public.resident_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resident_user_id uuid NOT NULL,
  unit_id uuid NOT NULL, start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date, estate_id uuid NOT NULL
);
CREATE TABLE public.maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  title text NOT NULL, status text NOT NULL, priority text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  title text NOT NULL, body text NOT NULL, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.visitor_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  host_user_id uuid NOT NULL, visitor_name text NOT NULL, visitor_phone text,
  access_code_hash text NOT NULL, access_code_ciphertext text,
  valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.estate_service_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  title text NOT NULL, description text, amount_kobo bigint NOT NULL,
  due_date date, is_active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.service_charge_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), charge_id uuid NOT NULL REFERENCES public.estate_service_charges(id),
  estate_id uuid NOT NULL, resident_user_id uuid NOT NULL, amount_kobo bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'NGN', status text NOT NULL DEFAULT 'pending',
  provider text, provider_reference text, verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rent_savings_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resident_user_id uuid NOT NULL,
  estate_id uuid NOT NULL, amount_kobo bigint NOT NULL, currency char(3) NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending', provider_reference text, verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.electricity_recharge_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resident_user_id uuid NOT NULL,
  estate_id uuid NOT NULL, amount_kobo bigint NOT NULL, currency char(3) NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending', units_purchased numeric(14,4), verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.visitor_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  visitor_pass_id uuid NOT NULL, checked_in_by uuid NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_out_by uuid, checked_out_at timestamptz
);
CREATE TABLE public.security_shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  outgoing_officer uuid NOT NULL, shift_label text NOT NULL,
  shift_started_at timestamptz NOT NULL, shift_ended_at timestamptz NOT NULL,
  handover_notes text NOT NULL, pending_actions text, status text NOT NULL DEFAULT 'pending',
  acknowledged_by uuid, acknowledged_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.security_emergency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  created_by uuid NOT NULL, alert_type text NOT NULL, severity text NOT NULL,
  title text NOT NULL, message text NOT NULL, location text, status text NOT NULL DEFAULT 'active',
  resolved_by uuid, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.security_incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  reported_by uuid NOT NULL, title text NOT NULL, category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium', description text NOT NULL, location text,
  occurred_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'open',
  reviewed_by uuid, reviewed_at timestamptz, resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.estate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  title text NOT NULL, venue text NOT NULL, starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL, status text NOT NULL, created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.estate_event_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  event_id uuid NOT NULL, guest_name text NOT NULL, email text, phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.estate_event_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  event_id uuid NOT NULL, guest_id uuid NOT NULL, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.estate_event_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estate_id uuid NOT NULL,
  event_id uuid NOT NULL, guest_id uuid NOT NULL, checked_in_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.is_active_estate_manager(target_estate_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $manager$ SELECT EXISTS (
  SELECT 1 FROM public.estate_memberships m
  JOIN public.estates e ON e.id = m.estate_id
  WHERE m.estate_id = target_estate_id AND m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.membership_role IN ('facility_manager','estate_manager','estate_admin')
    AND e.is_enabled = true
) $manager$;
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $platformadmin$ SELECT EXISTS (
  SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'platform_admin'
) $platformadmin$;


CREATE INDEX idx_load_buildings_estate ON public.buildings(estate_id, name);
CREATE INDEX idx_load_resident_units_user ON public.resident_units(resident_user_id, end_date);
CREATE INDEX idx_load_visits_estate_open ON public.visitor_visits(estate_id, checked_in_at DESC) WHERE checked_out_at IS NULL;
CREATE INDEX idx_load_handovers_estate_created ON public.security_shift_handovers(estate_id, created_at DESC);
CREATE INDEX idx_load_alerts_estate_created ON public.security_emergency_alerts(estate_id, created_at DESC);
CREATE INDEX idx_load_incidents_estate_created ON public.security_incident_reports(estate_id, created_at DESC);
CREATE INDEX idx_load_membership_user_estate ON public.estate_memberships(user_id, estate_id, status);
CREATE INDEX idx_load_units_estate_status ON public.units(estate_id, status);
CREATE INDEX idx_load_maintenance_estate_status ON public.maintenance_requests(estate_id, status);
CREATE INDEX idx_load_announcements_estate_published ON public.announcements(estate_id, published_at DESC);
CREATE INDEX idx_load_pass_host_created ON public.visitor_passes(estate_id, host_user_id, created_at DESC);
CREATE INDEX idx_load_pass_gate_hash ON public.visitor_passes(estate_id, access_code_hash);
CREATE INDEX idx_load_events_estate_creator ON public.estate_events(estate_id, created_by, starts_at, id);
CREATE INDEX idx_load_guests_event ON public.estate_event_guests(estate_id, event_id, guest_name, id);
CREATE INDEX idx_load_invitations_event_status ON public.estate_event_invitations(estate_id, event_id, status);
CREATE INDEX idx_load_checkins_event ON public.estate_event_checkins(estate_id, event_id);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_service_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_charge_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_savings_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_recharge_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_event_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_event_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_event_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY load_users_self ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY load_roles_self ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY load_memberships_self ON public.estate_memberships FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY load_estate_member ON public.estates FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = estates.id AND m.user_id = auth.uid() AND m.status = 'active')
);
CREATE POLICY load_units_member ON public.units FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = units.estate_id AND m.user_id = auth.uid() AND m.status = 'active')
);
CREATE POLICY load_maintenance_member ON public.maintenance_requests FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = maintenance_requests.estate_id AND m.user_id = auth.uid() AND m.status = 'active')
);
CREATE POLICY load_announcements_member ON public.announcements FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = announcements.estate_id AND m.user_id = auth.uid() AND m.status = 'active')
);
CREATE POLICY load_pass_host ON public.visitor_passes FOR SELECT TO authenticated USING (
  host_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.estate_memberships m
    WHERE m.estate_id = visitor_passes.estate_id AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.membership_role = 'resident'
  )
);
CREATE POLICY load_events_member ON public.estate_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = estate_events.estate_id AND m.user_id = auth.uid() AND m.status = 'active')
);
CREATE POLICY load_guests_member ON public.estate_event_guests FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = estate_event_guests.estate_id AND m.user_id = auth.uid() AND m.status = 'active')
);
CREATE POLICY load_invitations_member ON public.estate_event_invitations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = estate_event_invitations.estate_id AND m.user_id = auth.uid() AND m.status = 'active')
);
CREATE POLICY load_checkins_member ON public.estate_event_checkins FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.estate_memberships m
          WHERE m.estate_id = estate_event_checkins.estate_id AND m.user_id = auth.uid() AND m.status = 'active')
);

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_estate_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_required_legal_consent() TO authenticated;
GRANT SELECT ON public.users, public.user_roles, public.estates, public.estate_memberships,
  public.buildings, public.resident_units, public.units, public.visitor_visits,
  public.security_shift_handovers, public.security_emergency_alerts, public.security_incident_reports,
  public.estate_service_charges, public.service_charge_payments, public.rent_savings_contributions,
  public.electricity_recharge_orders, public.maintenance_requests, public.announcements, public.visitor_passes,
  public.estate_events, public.estate_event_guests, public.estate_event_invitations,
  public.estate_event_checkins TO authenticated;

CREATE OR REPLACE FUNCTION public.get_gate_visitor_pass_for_security(
  target_estate_id uuid, target_access_code_hash text
)
RETURNS TABLE (
  id uuid, host_user_id uuid, visitor_name text, visitor_phone text,
  valid_from timestamptz, valid_until timestamptz, status text, host_full_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL OR target_access_code_hash IS NULL OR length(target_access_code_hash) <> 64
     OR NOT public.current_user_has_required_legal_consent()
     OR NOT EXISTS (
       SELECT 1 FROM public.estate_memberships m
       JOIN public.estates e ON e.id = m.estate_id
       WHERE m.estate_id = target_estate_id AND m.user_id = actor_id
         AND m.membership_role = 'security' AND m.status = 'active' AND e.is_enabled = true
     ) THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.host_user_id, p.visitor_name, p.visitor_phone, p.valid_from,
         p.valid_until, p.status, u.full_name
  FROM public.visitor_passes p
  LEFT JOIN public.users u ON u.id = p.host_user_id
  WHERE p.estate_id = target_estate_id AND p.access_code_hash = target_access_code_hash
  LIMIT 1;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_gate_visitor_pass_for_security(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gate_visitor_pass_for_security(uuid, text) TO authenticated;

INSERT INTO public.users (id, full_name, is_active) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Load Test Facility Manager', true),
  ('22222222-2222-4222-8222-222222222222', 'Load Test Resident', true),
  ('33333333-3333-4333-8333-333333333333', 'Load Test Security Officer', true),
  ('55555555-5555-4555-8555-555555555555', 'Load Test Super Administrator', true);
INSERT INTO public.estates (id, name, address, city, state, timezone, is_enabled)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CB Nest Load Test Estate',
        '1 Synthetic Test Road', 'Lagos', 'Lagos', 'Africa/Lagos', true);
INSERT INTO public.user_roles (user_id, role)
VALUES ('55555555-5555-4555-8555-555555555555', 'platform_admin');
INSERT INTO public.estate_memberships (estate_id, user_id, membership_role, status) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'facility_manager', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'resident', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'security', 'active');

INSERT INTO public.buildings (id, estate_id, name)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Load Test Building');
INSERT INTO public.units (estate_id, building_id, unit_code, unit_type, status)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'UNIT-' || lpad(n::text, 4, '0'), 'apartment',
       CASE WHEN n <= 800 THEN 'occupied' ELSE 'available' END
FROM generate_series(1, 1000) AS n;
INSERT INTO public.maintenance_requests (estate_id, title, status, priority, created_at)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Synthetic maintenance request ' || n,
       CASE WHEN n % 4 = 0 THEN 'in_progress' ELSE 'open' END,
       CASE WHEN n % 5 = 0 THEN 'high' ELSE 'normal' END,
       now() - (n || ' minutes')::interval
FROM generate_series(1, 250) AS n;
INSERT INTO public.announcements (estate_id, title, body, published_at, created_at)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Synthetic estate notice ' || n,
       'Synthetic load-test announcement body.',
       now() - (n || ' hours')::interval, now() - (n || ' hours')::interval
FROM generate_series(1, 50) AS n;

INSERT INTO public.visitor_passes (
  estate_id, host_user_id, visitor_name, visitor_phone, access_code_hash,
  access_code_ciphertext, valid_from, valid_until, status, created_at
)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       '22222222-2222-4222-8222-222222222222',
       'Synthetic Visitor ' || n, '0800000' || lpad(n::text, 4, '0'),
       CASE WHEN n = 1 THEN encode(digest('123456', 'sha256'), 'hex')
            ELSE encode(digest(('synthetic-code-' || n), 'sha256'), 'hex') END,
       NULL, now() - interval '1 hour', now() + interval '1 day', 'active',
       now() - (n || ' seconds')::interval
FROM generate_series(1, 500) AS n;


INSERT INTO public.resident_units (resident_user_id, unit_id, estate_id)
SELECT '22222222-2222-4222-8222-222222222222', id, estate_id
FROM public.units WHERE unit_code = 'UNIT-0001' LIMIT 1;
INSERT INTO public.estate_service_charges (id, estate_id, title, description, amount_kobo, due_date, is_active, created_by)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Synthetic Estate Service Charge', 'Read-only load fixture', 2500000,
        CURRENT_DATE + 14, true, '11111111-1111-4111-8111-111111111111');
INSERT INTO public.service_charge_payments (
  charge_id, estate_id, resident_user_id, amount_kobo, status, provider_reference, verified_at
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222', 2500000, 'successful',
  'LOAD-TEST-VERIFIED-CHARGE', now() - interval '1 day'
);
INSERT INTO public.rent_savings_contributions (
  resident_user_id, estate_id, amount_kobo, status, provider_reference, verified_at
) VALUES (
  '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  500000, 'successful', 'LOAD-TEST-RENT-CONTRIBUTION', now() - interval '2 days'
);
INSERT INTO public.electricity_recharge_orders (
  resident_user_id, estate_id, amount_kobo, status, units_purchased, verified_at
) VALUES (
  '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  1000000, 'successful', 75.0, now() - interval '3 days'
);
INSERT INTO public.visitor_visits (estate_id, visitor_pass_id, checked_in_by, checked_in_at)
SELECT p.estate_id, p.id, '33333333-3333-4333-8333-333333333333', now() - interval '15 minutes'
FROM public.visitor_passes p WHERE p.visitor_name = 'Synthetic Visitor 1';
INSERT INTO public.security_shift_handovers (
  estate_id, outgoing_officer, shift_label, shift_started_at, shift_ended_at, handover_notes, pending_actions
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
  'Day Shift', now() - interval '12 hours', now() - interval '1 hour',
  'Synthetic handover for read-only load testing.', 'Monitor the main gate.'
);
INSERT INTO public.security_emergency_alerts (
  estate_id, created_by, alert_type, severity, title, message, location
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
  'security_threat', 'high', 'Synthetic security notice',
  'Synthetic alert fixture for read-only load testing.', 'Main gate'
);
INSERT INTO public.security_incident_reports (
  estate_id, reported_by, title, category, severity, description, location
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
  'Synthetic incident record', 'other', 'low',
  'Synthetic incident fixture for read-only load testing.', 'Main gate'
);

CREATE OR REPLACE FUNCTION public.get_platform_dashboard_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $metrics$
BEGIN
  IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'estates', (SELECT count(*) FROM public.estates),
    'users', (SELECT count(*) FROM public.users),
    'properties', (SELECT count(*) FROM public.units),
    'residents', (SELECT count(DISTINCT user_id) FROM public.estate_memberships WHERE status='active' AND membership_role='resident'),
    'charges', (SELECT count(*) FROM public.estate_service_charges),
    'payments', (SELECT count(*) FROM public.service_charge_payments WHERE status='successful'),
    'outstanding_kobo', (SELECT COALESCE(sum(GREATEST(c.amount_kobo - COALESCE(p.paid,0),0)),0)
      FROM public.estate_service_charges c
      JOIN public.estate_memberships m ON m.estate_id=c.estate_id AND m.status='active' AND m.membership_role='resident'
      LEFT JOIN (SELECT charge_id,resident_user_id,sum(amount_kobo) AS paid FROM public.service_charge_payments WHERE status='successful' GROUP BY charge_id,resident_user_id) p
      ON p.charge_id=c.id AND p.resident_user_id=m.user_id
      WHERE c.is_active=true),
    'maintenance', (SELECT count(*) FROM public.maintenance_requests)
  );
END;
$metrics$;
CREATE OR REPLACE FUNCTION public.get_platform_growth_analytics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $growth$
BEGIN
  IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'summary', jsonb_build_object(
      'verified_payments', (SELECT count(*) FROM public.service_charge_payments WHERE status='successful'),
      'active_charges', (SELECT count(*) FROM public.estate_service_charges WHERE is_active=true),
      'outstanding_kobo', (SELECT COALESCE(sum(amount_kobo),0) FROM public.estate_service_charges WHERE is_active=true),
      'collected_kobo', (SELECT COALESCE(sum(amount_kobo),0) FROM public.service_charge_payments WHERE status='successful')
    ),
    'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'month', to_char(month_start,'YYYY-MM'), 'label', to_char(month_start,'Mon'),
      'payment_count', 0, 'collected_kobo', 0
    ) ORDER BY month_start) FROM generate_series(date_trunc('month',now())-interval '11 months',date_trunc('month',now()),interval '1 month') month_start),'[]'::jsonb),
    'estates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'estate_id', e.id, 'estate_name', e.name, 'payment_count', 0,
      'collected_kobo', 0, 'outstanding_kobo', 0, 'active_charges', 0
    )) FROM public.estates e),'[]'::jsonb)
  );
END;
$growth$;
GRANT EXECUTE ON FUNCTION public.get_platform_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_growth_analytics() TO authenticated;
ANALYZE;
