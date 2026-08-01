-- Planer treningowy: wlasne plany (checklista cwiczen + serie kg/powtorzenia).
-- Serie trzymamy jako JSONB na cwiczeniu: [{"w": 80, "r": 8, "done": false}, ...]
-- "done" zeruje sie przy zakonczeniu treningu — plan pamieta ostatnie ciezary.

create table if not exists workout_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  rest_seconds int not null default 90,
  created_at timestamptz not null default now()
);

create table if not exists plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references workout_plans(id) on delete cascade,
  name text not null,
  position int not null default 0,
  sets jsonb not null default '[]',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists plan_exercises_plan_idx on plan_exercises (plan_id, position);

alter table workout_plans enable row level security;
alter table plan_exercises enable row level security;

create policy "owner all workout_plans" on workout_plans for all
  using (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy "owner all plan_exercises" on plan_exercises for all
  using (exists (
    select 1 from workout_plans wp join profiles p on p.id = wp.profile_id
    where wp.id = plan_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from workout_plans wp join profiles p on p.id = wp.profile_id
    where wp.id = plan_id and p.user_id = auth.uid()
  ));
