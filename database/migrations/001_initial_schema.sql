-- Cities Builder Nest initial schema.
-- Apply only to a new database after review. Amounts are integer minor units (NGN kobo).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app_role AS ENUM ('resident', 'facility_manager', 'security', 'finance_admin', 'platform_admin');
CREATE TYPE savings_goal_status AS ENUM ('active', 'paused', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('created', 'pending', 'successful', 'failed', 'reversed', 'disputed');
CREATE TYPE ledger_entry_kind AS ENUM ('deposit', 'withdrawal', 'withdrawal_reservation', 'reservation_release', 'reversal', 'adjustment');

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  phone_e164 text UNIQUE,
  full_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role app_role NOT NULL,
  assigned_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE estates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'NG',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE estate_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES estates(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  membership_role app_role NOT NULL CHECK (membership_role IN ('resident', 'facility_manager', 'security')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estate_id, user_id, membership_role)
);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES estates(id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estate_id, name)
);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  unit_code text NOT NULL,
  unit_type text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance', 'inactive')),
  UNIQUE (building_id, unit_code)
);

CREATE TABLE resident_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  resident_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES estates(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  body text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES estates(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to uuid REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE visitor_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES estates(id) ON DELETE RESTRICT,
  host_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  visitor_name text NOT NULL,
  visitor_phone text,
  access_code_hash text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > valid_from)
);

CREATE TABLE rent_savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  estate_id uuid REFERENCES estates(id) ON DELETE RESTRICT,
  name text NOT NULL,
  target_amount_kobo bigint NOT NULL CHECK (target_amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  target_date date,
  status savings_goal_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE financial_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  partner_code text NOT NULL UNIQUE,
  custody_model_description text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  goal_id uuid REFERENCES rent_savings_goals(id) ON DELETE RESTRICT,
  partner_id uuid REFERENCES financial_partners(id) ON DELETE RESTRICT,
  provider_reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status payment_status NOT NULL DEFAULT 'created',
  provider_status text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  goal_id uuid REFERENCES rent_savings_goals(id) ON DELETE RESTRICT,
  partner_id uuid REFERENCES financial_partners(id) ON DELETE RESTRICT,
  provider_reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  destination_token text,
  status payment_status NOT NULL DEFAULT 'created',
  provider_status text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  goal_id uuid REFERENCES rent_savings_goals(id) ON DELETE RESTRICT,
  payment_intent_id uuid UNIQUE REFERENCES payment_intents(id) ON DELETE RESTRICT,
  withdrawal_request_id uuid UNIQUE REFERENCES withdrawal_requests(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'reservation', 'release', 'reversal', 'adjustment')),
  status payment_status NOT NULL DEFAULT 'pending',
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  external_reference text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_code text NOT NULL,
  debit_kobo bigint NOT NULL DEFAULT 0 CHECK (debit_kobo >= 0),
  credit_kobo bigint NOT NULL DEFAULT 0 CHECK (credit_kobo >= 0),
  currency char(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit_kobo > 0 AND credit_kobo = 0) OR (credit_kobo > 0 AND debit_kobo = 0))
);

CREATE TABLE provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES financial_partners(id) ON DELETE RESTRICT,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processing', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (partner_id, provider_event_id)
);

CREATE TABLE reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES financial_partners(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'exceptions', 'failed')),
  total_records integer NOT NULL DEFAULT 0,
  exception_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES reconciliation_runs(id) ON DELETE RESTRICT,
  external_reference text,
  exception_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'accepted')),
  resolved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  request_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memberships_user ON estate_memberships(user_id, status);
CREATE INDEX idx_units_building ON units(building_id);
CREATE INDEX idx_resident_units_resident ON resident_units(resident_user_id, end_date);
CREATE INDEX idx_maintenance_estate_status ON maintenance_requests(estate_id, status, created_at DESC);
CREATE INDEX idx_visitor_passes_estate_validity ON visitor_passes(estate_id, valid_from, valid_until);
CREATE INDEX idx_savings_goals_resident ON rent_savings_goals(resident_user_id, status);
CREATE INDEX idx_payment_intents_resident ON payment_intents(resident_user_id, created_at DESC);
CREATE INDEX idx_withdrawals_resident ON withdrawal_requests(resident_user_id, created_at DESC);
CREATE INDEX idx_ledger_tx_resident ON ledger_transactions(resident_user_id, created_at DESC);
CREATE INDEX idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_provider_events_processing ON provider_events(processing_status, received_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id, created_at DESC);


-- Fail closed until table-specific authorization policies are reviewed and added.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- The auto-enable event-trigger function must not be callable through the Data API.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

COMMIT;
