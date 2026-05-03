-- Idempotent. Safe to re-run; will migrate from the previous (Google-auth) version.

create table if not exists public.beans (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  added_by uuid not null,
  added_by_name text,
  name text not null,
  roaster text,
  rating int not null default 0 check (rating between 0 and 5),
  roast_type text,
  notes text,
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);

-- Drop the old FK to auth.users if a previous version of this script created it.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'beans_added_by_fkey') then
    alter table public.beans drop constraint beans_added_by_fkey;
  end if;
end$$;

create index if not exists beans_collection_id_idx on public.beans (collection_id, created_at desc);

alter table public.beans enable row level security;

drop policy if exists beans_select_all on public.beans;
create policy beans_select_all
  on public.beans for select
  using (true);

drop policy if exists beans_insert_own on public.beans;
drop policy if exists beans_insert_anon on public.beans;
create policy beans_insert_anon
  on public.beans for insert
  to anon, authenticated
  with check (true);

drop policy if exists beans_update_own on public.beans;
drop policy if exists beans_update_anon on public.beans;
create policy beans_update_anon
  on public.beans for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists beans_delete_own on public.beans;
drop policy if exists beans_delete_anon on public.beans;
create policy beans_delete_anon
  on public.beans for delete
  to anon, authenticated
  using (true);
