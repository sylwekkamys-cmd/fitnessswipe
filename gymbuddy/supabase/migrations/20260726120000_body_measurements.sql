-- Pomiary sylwetki: manekin z dymkami + cele per partia + dzienniczek sesji.
-- Jedna wartosc na (profil, dzien, partia) — ponowny pomiar tego samego dnia nadpisuje.

create table if not exists body_measurements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  measured_on date not null default current_date,
  part text not null,
  value numeric(6,2) not null check (value > 0),
  created_at timestamptz not null default now(),
  unique (profile_id, measured_on, part)
);

create index if not exists body_measurements_profile_part_idx
  on body_measurements (profile_id, part, measured_on desc);

create table if not exists body_goals (
  profile_id uuid not null references profiles(id) on delete cascade,
  part text not null,
  target numeric(6,2) not null check (target > 0),
  created_at timestamptz not null default now(),
  primary key (profile_id, part)
);

alter table body_measurements enable row level security;
alter table body_goals enable row level security;

-- Dane sa prywatne: tylko wlasciciel profilu (pelny dostep)
create policy "owner all body_measurements" on body_measurements for all
  using (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy "owner all body_goals" on body_goals for all
  using (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()));
