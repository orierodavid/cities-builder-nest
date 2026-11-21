-- Require current CB Nest legal acceptance for every authenticated account,
-- including residents, security, event organisers, estate managers and platform admins.
create or replace function public.current_user_has_required_legal_consent()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return false; end if;
  return not exists (
    select 1
    from public.legal_documents ld
    where ld.status = 'published'
      and ld.is_required
      and ld.effective_at <= now()
      and not exists (
        select 1 from public.user_consents uc
        where uc.user_id = v_user_id and uc.legal_document_id = ld.id
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
  v_documents jsonb := '[]'::jsonb;
  v_accepted jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_document_types integer := 0;
  v_configuration_required boolean := false;
  v_requires_acceptance boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

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

  v_configuration_required := v_document_types < 2;
  v_requires_acceptance := not v_configuration_required and jsonb_array_length(v_pending) > 0;

  return jsonb_build_object(
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
  v_document_types integer;
  v_current_ids uuid[];
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_source not in ('web', 'mobile') then
    raise exception 'invalid_consent_source' using errcode = '22023';
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

revoke all on function public.current_user_has_required_legal_consent() from public, anon;
revoke all on function public.get_legal_consent_status() from public, anon;
revoke all on function public.accept_legal_documents(uuid[], text) from public, anon;
grant execute on function public.current_user_has_required_legal_consent() to authenticated;
grant execute on function public.get_legal_consent_status() to authenticated;
grant execute on function public.accept_legal_documents(uuid[], text) to authenticated;
