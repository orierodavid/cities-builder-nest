alter table public.service_charge_payments add column if not exists checkout_url text;
alter table public.rent_savings_contributions add column if not exists checkout_url text;
comment on column public.service_charge_payments.checkout_url is 'Squad-hosted checkout URL for reopening an existing pending resident service-charge payment.';
comment on column public.rent_savings_contributions.checkout_url is 'Squad-hosted checkout URL for reopening an existing pending rent-savings contribution.';