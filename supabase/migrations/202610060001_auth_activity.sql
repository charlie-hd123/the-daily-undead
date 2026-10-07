-- Small, privacy-preserving activity records for the auth-only Supabase project.
-- Gameplay and account data remain in Cloudflare D1.

create table if not exists public.authenticated_activity (
  bucket_start timestamptz primary key,
  visit_count bigint not null default 0 check (visit_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_heartbeat (
  service_name text primary key,
  last_seen_at timestamptz not null,
  source text not null,
  updated_at timestamptz not null default now()
);

alter table public.authenticated_activity enable row level security;
alter table public.service_heartbeat enable row level security;

revoke all on table public.authenticated_activity from anon, authenticated;
revoke all on table public.service_heartbeat from anon, authenticated;

-- The Edge Function uses the server-only service role supplied by Supabase.
grant select, insert, update on table public.service_heartbeat to service_role;

create or replace function public.record_authenticated_visit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_bucket timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  activity_bucket := date_trunc('day', now())
    + floor(extract(hour from now()) / 12) * interval '12 hours';

  insert into public.authenticated_activity (bucket_start, visit_count, updated_at)
  values (activity_bucket, 1, now())
  on conflict (bucket_start) do update
  set visit_count = public.authenticated_activity.visit_count + 1,
      updated_at = now();

  -- Keep only a rolling year of aggregate activity.
  delete from public.authenticated_activity
  where bucket_start < now() - interval '366 days';
end;
$$;

revoke all on function public.record_authenticated_visit() from public, anon;
grant execute on function public.record_authenticated_visit() to authenticated;
