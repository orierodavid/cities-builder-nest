create table if not exists public.api_rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;

create index if not exists api_rate_limit_buckets_updated_at_idx
  on public.api_rate_limit_buckets (updated_at);

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_count integer;
begin
  if p_bucket_key is null or length(p_bucket_key) < 32 or length(p_bucket_key) > 128
     or p_window_seconds < 1 or p_window_seconds > 3600
     or p_max_requests < 1 or p_max_requests > 10000 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.api_rate_limit_buckets (
    bucket_key, window_started_at, request_count, updated_at
  )
  values (p_bucket_key, now(), 1, now())
  on conflict (bucket_key) do update
    set window_started_at = case
          when public.api_rate_limit_buckets.window_started_at
            <= now() - make_interval(secs => p_window_seconds)
          then now()
          else public.api_rate_limit_buckets.window_started_at
        end,
        request_count = case
          when public.api_rate_limit_buckets.window_started_at
            <= now() - make_interval(secs => p_window_seconds)
          then 1
          else public.api_rate_limit_buckets.request_count + 1
        end,
        updated_at = now()
  returning request_count into v_request_count;

  return v_request_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;
