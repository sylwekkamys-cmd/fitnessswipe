-- Reakcje emoji na wiadomosci (styl Messengera): jedna reakcja na osobe na
-- wiadomosc, zmiana nadpisuje. Osobne tabele dla czatu 1:1 i czatu grupowego
-- wyzwan, bo maja rozne zasady dostepu (uczestnicy matcha vs uczestnicy wyzwania).

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

alter table public.message_reactions enable row level security;

-- Dostep ma kazdy uczestnik matcha, do ktorego nalezy wiadomosc
create policy message_reactions_select on public.message_reactions
  for select using (
    exists (
      select 1 from public.messages m
      join public.matches mt on mt.id = m.match_id
      join public.profiles p on p.id in (mt.profile_a_id, mt.profile_b_id)
      where m.id = message_id and p.user_id = auth.uid()
    )
  );

-- Reagowac mozna tylko we wlasnym imieniu i tylko w swoich rozmowach
create policy message_reactions_insert on public.message_reactions
  for insert with check (
    exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
    and exists (
      select 1 from public.messages m
      join public.matches mt on mt.id = m.match_id
      join public.profiles p on p.id in (mt.profile_a_id, mt.profile_b_id)
      where m.id = message_id and p.user_id = auth.uid()
    )
  );

create policy message_reactions_update on public.message_reactions
  for update using (
    exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

create policy message_reactions_delete on public.message_reactions
  for delete using (
    exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

create table if not exists public.challenge_message_reactions (
  message_id uuid not null references public.challenge_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

alter table public.challenge_message_reactions enable row level security;

create policy challenge_message_reactions_select on public.challenge_message_reactions
  for select using (
    exists (
      select 1 from public.challenge_messages cm
      join public.challenge_participants cp on cp.challenge_id = cm.challenge_id
      join public.profiles p on p.id = cp.profile_id
      where cm.id = message_id and p.user_id = auth.uid()
    )
  );

create policy challenge_message_reactions_insert on public.challenge_message_reactions
  for insert with check (
    exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
    and exists (
      select 1 from public.challenge_messages cm
      join public.challenge_participants cp on cp.challenge_id = cm.challenge_id
      join public.profiles p on p.id = cp.profile_id
      where cm.id = message_id and p.user_id = auth.uid()
    )
  );

create policy challenge_message_reactions_update on public.challenge_message_reactions
  for update using (
    exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

create policy challenge_message_reactions_delete on public.challenge_message_reactions
  for delete using (
    exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

-- Realtime: reakcje maja pojawiac sie u drugiej strony na zywo
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.challenge_message_reactions;
