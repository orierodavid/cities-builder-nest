alter table public.resident_virtual_accounts
  add column if not exists paystack_dva_consent_at timestamptz;