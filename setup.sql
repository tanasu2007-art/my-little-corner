-- ✿ my little corner — database setup ✿
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It's safe to run more than once.

-- 1. Tables ---------------------------------------------------------------

create table if not exists public.thoughts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  text        text not null,
  color       text default 'cream',
  created_at  timestamptz not null default now()
);

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  path        text not null,           -- where the file lives in storage
  caption     text default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  day         date not null,
  text        text not null,
  done        boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.journal (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  day         date not null,
  text        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- 2. Privacy rules: each person can only ever see and change their own rows --

alter table public.thoughts enable row level security;
alter table public.photos   enable row level security;
alter table public.todos    enable row level security;
alter table public.journal  enable row level security;

drop policy if exists "own thoughts" on public.thoughts;
create policy "own thoughts" on public.thoughts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own photos" on public.photos;
create policy "own photos" on public.photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own todos" on public.todos;
create policy "own todos" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own journal" on public.journal;
create policy "own journal" on public.journal
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. A private folder for your pictures -----------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photo files: read"   on storage.objects;
drop policy if exists "own photo files: add"    on storage.objects;
drop policy if exists "own photo files: change" on storage.objects;
drop policy if exists "own photo files: remove" on storage.objects;

create policy "own photo files: read" on storage.objects
  for select using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo files: add" on storage.objects
  for insert with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo files: change" on storage.objects
  for update using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo files: remove" on storage.objects
  for delete using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Done! ✿
