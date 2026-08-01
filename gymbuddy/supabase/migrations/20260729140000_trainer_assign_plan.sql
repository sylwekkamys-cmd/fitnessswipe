-- Trener moze przygotowac plan treningowy i udostepnic go wybranemu
-- podopiecznemu (osobie, z ktora ma czat trenerski). Plan jest KOPIOWANY na
-- konto podopiecznego (assigned_by/assigned_by_name pokazuja od kogo jest).
alter table workout_plans add column if not exists assigned_by uuid;
alter table workout_plans add column if not exists assigned_by_name text;

-- Insert planu dla podopiecznego: tylko gdy istnieje relacja czatu trenerskiego
drop policy if exists trainer_assign_plan on workout_plans;
create policy trainer_assign_plan on workout_plans for insert with check (
  assigned_by is not null
  and auth.uid() in (select user_id from profiles where id = assigned_by)
  and exists (
    select 1 from matches m
    where m.is_trainer_chat = true
    and ((m.profile_a_id = assigned_by and m.profile_b_id = workout_plans.profile_id)
      or (m.profile_b_id = assigned_by and m.profile_a_id = workout_plans.profile_id))
  )
);

-- Insert cwiczen do planu, ktory trener wlasnie przypisal
drop policy if exists trainer_assign_exercises on plan_exercises;
create policy trainer_assign_exercises on plan_exercises for insert with check (
  exists (
    select 1 from workout_plans wp
    join profiles pr on pr.id = wp.assigned_by
    where wp.id = plan_exercises.plan_id and pr.user_id = auth.uid()
  )
);
