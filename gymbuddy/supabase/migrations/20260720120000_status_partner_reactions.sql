-- Flaga "szukam partnera na dzis" przy statusie treningowym
alter table public.training_status
  add column if not exists looking_for_partner boolean not null default false;

-- Reakcje na status treningowy (jedna reakcja na uzytkownika na wlasciciela statusu)
create table if not exists public.status_reactions (
  id uuid primary key default gen_random_uuid(),
  status_profile_id uuid not null references public.profiles(id) on delete cascade,
  reactor_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (status_profile_id, reactor_id)
);

alter table public.status_reactions enable row level security;

-- Kazdy zalogowany moze czytac reakcje
create policy "status_reactions_select" on public.status_reactions
  for select to authenticated using (true);

-- Reagowac mozna tylko jako wlasny profil
create policy "status_reactions_insert" on public.status_reactions
  for insert to authenticated
  with check (reactor_id in (select id from public.profiles where user_id = auth.uid()));

create policy "status_reactions_update" on public.status_reactions
  for update to authenticated
  using (reactor_id in (select id from public.profiles where user_id = auth.uid()));

-- Usunac reakcje moze reagujacy lub wlasciciel statusu (reset przy nowym statusie)
create policy "status_reactions_delete" on public.status_reactions
  for delete to authenticated
  using (
    reactor_id in (select id from public.profiles where user_id = auth.uid())
    or status_profile_id in (select id from public.profiles where user_id = auth.uid())
  );
