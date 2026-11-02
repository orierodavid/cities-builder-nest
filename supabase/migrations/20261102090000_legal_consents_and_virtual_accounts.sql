-- Versioned legal acceptance, web cookie preferences, and provider-neutral resident virtual accounts.
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('terms', 'privacy')),
  title text not null check (char_length(trim(title)) between 3 and 160),
  version text not null check (char_length(trim(version)) between 1 and 40),
  content text not null check (char_length(trim(content)) >= 1),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_required boolean not null default true,
  effective_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_type, version)
);
create unique index if not exists legal_documents_one_published_version
  on public.legal_documents(document_type)
  where status = 'published' and is_required;

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  legal_document_id uuid not null references public.legal_documents(id) on delete restrict,
  document_type text not null check (document_type in ('terms', 'privacy')),
  document_title text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('web', 'mobile')),
  unique (user_id, legal_document_id)
);
create index if not exists user_consents_user_history_idx
  on public.user_consents(user_id, accepted_at desc);

create table if not exists public.cookie_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  essential boolean not null default true check (essential = true),
  analytics boolean not null default false,
  marketing boolean not null default false,
  policy_version text not null default '1',
  updated_at timestamptz not null default now()
);

create table if not exists public.resident_virtual_accounts (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null references auth.users(id) on delete restrict,
  estate_id uuid not null references public.estates(id) on delete restrict,
  provider text not null,
  provider_customer_reference text,
  provider_account_reference text,
  bank_name text,
  account_number text,
  account_name text,
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending', 'active', 'failed', 'disabled')),
  idempotency_key text not null unique,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resident_user_id, estate_id),
  unique (provider, provider_account_reference)
);
create index if not exists resident_virtual_accounts_estate_idx
  on public.resident_virtual_accounts(estate_id, status);

alter table public.legal_documents enable row level security;
alter table public.user_consents enable row level security;
alter table public.cookie_preferences enable row level security;
alter table public.resident_virtual_accounts enable row level security;

grant select on public.legal_documents to authenticated;
grant select on public.user_consents to authenticated;
grant select, insert, update on public.cookie_preferences to authenticated;
grant select on public.resident_virtual_accounts to authenticated;

revoke insert, update, delete on public.legal_documents from anon, authenticated;
revoke insert, update, delete on public.user_consents from anon, authenticated;
revoke insert, update, delete on public.resident_virtual_accounts from anon, authenticated;

drop policy if exists "Read published legal documents" on public.legal_documents;
create policy "Read published legal documents"
  on public.legal_documents for select to authenticated
  using (status = 'published' and effective_at <= now());

drop policy if exists "Read own consent history" on public.user_consents;
create policy "Read own consent history"
  on public.user_consents for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Manage own cookie preferences" on public.cookie_preferences;
create policy "Manage own cookie preferences"
  on public.cookie_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and essential is true);

drop policy if exists "Read own resident virtual account" on public.resident_virtual_accounts;
create policy "Read own resident virtual account"
  on public.resident_virtual_accounts for select to authenticated
  using (resident_user_id = (select auth.uid()));

create or replace function public.current_user_has_required_legal_consent()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_required_role boolean;
  v_document_types integer;
begin
  if v_user_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.estate_memberships em
    where em.user_id = v_user_id
      and em.status = 'active'
      and em.membership_role in ('resident', 'facility_manager', 'estate_manager', 'estate_admin')
  ) into v_required_role;

  if not v_required_role then
    return true;
  end if;

  select count(distinct ld.document_type)
  into v_document_types
  from public.legal_documents ld
  where ld.status = 'published'
    and ld.is_required
    and ld.effective_at <= now();

  -- Do not lock out the platform while the administrator is still preparing
  -- the two required documents. Publishing both activates the mandatory gate.
  if v_document_types < 2 then
    return true;
  end if;

  return not exists (
    select 1
    from public.legal_documents ld
    where ld.status = 'published'
      and ld.is_required
      and ld.effective_at <= now()
      and not exists (
        select 1
        from public.user_consents uc
        where uc.user_id = v_user_id
          and uc.legal_document_id = ld.id
      )
  );
end;
$$;

create or replace function public.get_legal_consent_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_roles text[] := array[]::text[];
  v_required_role boolean := false;
  v_document_types integer := 0;
  v_documents jsonb := '[]'::jsonb;
  v_accepted jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_configuration_required boolean := false;
  v_requires_acceptance boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select coalesce(array_agg(distinct em.membership_role), array[]::text[])
  into v_roles
  from public.estate_memberships em
  where em.user_id = v_user_id and em.status = 'active';

  v_required_role := v_roles && array['resident', 'facility_manager', 'estate_manager', 'estate_admin']::text[];

  select count(distinct ld.document_type)
  into v_document_types
  from public.legal_documents ld
  where ld.status = 'published' and ld.is_required and ld.effective_at <= now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ld.id,
    'documentType', ld.document_type,
    'title', ld.title,
    'version', ld.version,
    'content', ld.content,
    'effectiveAt', ld.effective_at,
    'publishedAt', ld.published_at
  ) order by ld.document_type), '[]'::jsonb)
  into v_documents
  from public.legal_documents ld
  where ld.status = 'published' and ld.is_required and ld.effective_at <= now();

  select coalesce(jsonb_agg(uc.legal_document_id), '[]'::jsonb)
  into v_accepted
  from public.user_consents uc
  where uc.user_id = v_user_id;

  select coalesce(jsonb_agg(ld.id), '[]'::jsonb)
  into v_pending
  from public.legal_documents ld
  where ld.status = 'published'
    and ld.is_required
    and ld.effective_at <= now()
    and not exists (
      select 1 from public.user_consents uc
      where uc.user_id = v_user_id and uc.legal_document_id = ld.id
    );

  v_configuration_required := v_required_role and v_document_types < 2;
  v_requires_acceptance := v_required_role
    and not v_configuration_required
    and jsonb_array_length(v_pending) > 0;

  return jsonb_build_object(
    'roles', to_jsonb(v_roles),
    'requiresAcceptance', v_requires_acceptance,
    'configurationRequired', v_configuration_required,
    'accepted', not v_requires_acceptance,
    'documents', v_documents,
    'acceptedDocumentIds', v_accepted,
    'pendingDocumentIds', v_pending
  );
end;
$$;

create or replace function public.accept_legal_documents(
  p_document_ids uuid[],
  p_source text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_required_role boolean;
  v_document_types integer;
  v_current_ids uuid[];
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_source not in ('web', 'mobile') then
    raise exception 'invalid_consent_source' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.estate_memberships em
    where em.user_id = v_user_id and em.status = 'active'
      and em.membership_role in ('resident', 'facility_manager', 'estate_manager', 'estate_admin')
  ) into v_required_role;

  if not v_required_role then
    raise exception 'consent_not_required_for_role' using errcode = '42501';
  end if;

  select count(distinct ld.document_type)
  into v_document_types
  from public.legal_documents ld
  where ld.status = 'published' and ld.is_required and ld.effective_at <= now();

  if v_document_types < 2 then
    raise exception 'legal_documents_not_ready' using errcode = '55000';
  end if;

  select array_agg(ld.id order by ld.id)
  into v_current_ids
  from public.legal_documents ld
  where ld.status = 'published' and ld.is_required and ld.effective_at <= now();

  if coalesce(cardinality(p_document_ids), 0) <> coalesce(cardinality(v_current_ids), 0)
     or not (v_current_ids <@ coalesce(p_document_ids, array[]::uuid[]))
     or not (coalesce(p_document_ids, array[]::uuid[]) <@ v_current_ids) then
    raise exception 'all_current_legal_documents_must_be_accepted' using errcode = '22023';
  end if;

  insert into public.user_consents (
    user_id, legal_document_id, document_type, document_title, document_version, source
  )
  select v_user_id, ld.id, ld.document_type, ld.title, ld.version, p_source
  from public.legal_documents ld
  where ld.id = any(v_current_ids)
  on conflict (user_id, legal_document_id) do nothing;

  return public.get_legal_consent_status();
end;
$$;

create or replace function public.list_legal_documents_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'platform_admin'
  ) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(ld) order by ld.document_type, ld.created_at desc)
    from public.legal_documents ld
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_legal_document(
  p_document_type text,
  p_title text,
  p_version text,
  p_content text,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_status text;
  v_saved public.legal_documents;
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'platform_admin'
  ) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  if p_document_type not in ('terms', 'privacy')
     or length(trim(coalesce(p_title, ''))) not between 3 and 160
     or length(trim(coalesce(p_version, ''))) not between 1 and 40
     or length(trim(coalesce(p_content, ''))) < 500
     or length(p_content) > 100000 then
    raise exception 'invalid_legal_document' using errcode = '22023';
  end if;

  select ld.status into v_existing_status
  from public.legal_documents ld
  where ld.document_type = p_document_type and ld.version = p_version;

  if v_existing_status in ('published', 'archived') then
    raise exception 'published_legal_versions_are_immutable' using errcode = '55000';
  end if;

  if p_publish then
    update public.legal_documents
    set status = 'archived'
    where document_type = p_document_type and status = 'published';
  end if;

  insert into public.legal_documents (
    document_type, title, version, content, status, is_required,
    effective_at, published_at, created_by
  )
  values (
    p_document_type, trim(p_title), trim(p_version), p_content,
    case when p_publish then 'published' else 'draft' end,
    true,
    case when p_publish then now() else null end,
    case when p_publish then now() else null end,
    auth.uid()
  )
  on conflict (document_type, version) do update
  set title = excluded.title,
      content = excluded.content,
      status = excluded.status,
      effective_at = excluded.effective_at,
      published_at = excluded.published_at
  where public.legal_documents.status = 'draft'
  returning * into v_saved;

  if v_saved.id is null then
    raise exception 'legal_document_version_conflict' using errcode = '23505';
  end if;

  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.current_user_has_required_legal_consent() from public, anon;
revoke all on function public.get_legal_consent_status() from public, anon;
revoke all on function public.accept_legal_documents(uuid[], text) from public, anon;
revoke all on function public.list_legal_documents_admin() from public, anon;
revoke all on function public.save_legal_document(text, text, text, text, boolean) from public, anon;
grant execute on function public.current_user_has_required_legal_consent() to authenticated;
grant execute on function public.get_legal_consent_status() to authenticated;
grant execute on function public.accept_legal_documents(uuid[], text) to authenticated;
grant execute on function public.list_legal_documents_admin() to authenticated;
grant execute on function public.save_legal_document(text, text, text, text, boolean) to authenticated;

-- Add a restrictive policy to every existing RLS-protected application table.
-- This composes with the current row-specific policies and blocks direct client
-- reads/writes until the user's current required legal versions are accepted.
do $$
declare
  v_table record;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname not in ('legal_documents', 'user_consents', 'cookie_preferences')
  loop
    execute format('drop policy if exists %I on public.%I', 'Require current legal acceptance', v_table.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.current_user_has_required_legal_consent()) with check (public.current_user_has_required_legal_consent())',
      'Require current legal acceptance',
      v_table.relname
    );
  end loop;
end;
$$;
