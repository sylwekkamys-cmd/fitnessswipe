-- Ekipa na dzis: jednodniowe ogloszenia "szukam ludzi" (padel, pilka itd.).
-- Znikaja o polnocy (expires_at = lokalna polnoc tworcy). Tworca jest
-- automatycznie uczestnikiem (wpis w squad_members przy utworzeniu).
create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  time_text text not null,
  venue text not null default '',
  latitude double precision,
  longitude double precision,
  spots_total int not null default 4,
  note text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table squads enable row level security;
drop policy if exists squads_select on squads;
create policy squads_select on squads for select using (true);
drop policy if exists squads_insert on squads;
create policy squads_insert on squads for insert
  with check (auth.uid() in (select user_id from profiles where id = creator_id));
drop policy if exists squads_delete on squads;
create policy squads_delete on squads for delete
  using (auth.uid() in (select user_id from profiles where id = creator_id));

create table if not exists squad_members (
  squad_id uuid not null references squads(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (squad_id, profile_id)
);
alter table squad_members enable row level security;
drop policy if exists squad_members_select on squad_members;
create policy squad_members_select on squad_members for select using (true);
drop policy if exists squad_members_insert on squad_members;
create policy squad_members_insert on squad_members for insert
  with check (auth.uid() in (select user_id from profiles where id = profile_id));
drop policy if exists squad_members_delete on squad_members;
create policy squad_members_delete on squad_members for delete
  using (auth.uid() in (select user_id from profiles where id = profile_id));
