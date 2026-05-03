-- Run this in the Supabase SQL editor once.

create table if not exists public.beans (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  added_by_name text,
  name text not null,
  roaster text,
  rating int not null default 0 check (rating between 0 and 5),
  roast_type text,
  notes text,
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists beans_collection_id_idx on public.beans (collection_id, created_at desc);

alter table public.beans enable row level security;

drop policy if exists beans_select_all on public.beans;
create policy beans_select_all
  on public.beans for select
  using (true);

drop policy if exists beans_insert_own on public.beans;
create policy beans_insert_own
  on public.beans for insert
  to authenticated
  with check (added_by = auth.uid());

drop policy if exists beans_update_own on public.beans;
create policy beans_update_own
  on public.beans for update
  to authenticated
  using (added_by = auth.uid())
  with check (added_by = auth.uid());

drop policy if exists beans_delete_own on public.beans;
create policy beans_delete_own
  on public.beans for delete
  to authenticated
  using (added_by = auth.uid());
