-- Czat ekipy ("Ekipa na dzis"): wspolny watek uczestnikow ogloszenia,
-- do ustalania szczegolow spotkania. Zyje i znika razem ze squadem (cascade).
-- UWAGA na niejednoznacznosc embedow: getTodaySquads uzywa jawnego
-- 'profiles:creator_id', wiec nowa sciezka squads<->profiles przez ta tabele
-- niczego nie psuje (sprawdzone przed migracja).
create table if not exists public.squad_messages (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.squad_messages enable row level security;

-- Czytac i pisac moga wylacznie czlonkowie ekipy (tworca jest czlonkiem od utworzenia)
create policy squad_messages_select on public.squad_messages
  for select using (
    exists (
      select 1 from public.squad_members sm
      join public.profiles p on p.id = sm.profile_id
      where sm.squad_id = squad_messages.squad_id and p.user_id = auth.uid()
    )
  );

create policy squad_messages_insert on public.squad_messages
  for insert with check (
    exists (select 1 from public.profiles p where p.id = sender_id and p.user_id = auth.uid())
    and exists (
      select 1 from public.squad_members sm
      join public.profiles p on p.id = sm.profile_id
      where sm.squad_id = squad_messages.squad_id and p.user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.squad_messages;
