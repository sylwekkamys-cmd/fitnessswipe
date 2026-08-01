-- Tryb goscia: zanonimizowany podglad okolicy (dostepny dla anon, przed rejestracja)
-- + rankingi lokalne per silownia (leaderboard tydzien/miesiac + bitwa silowni)

create or replace function public.get_guest_preview(my_lat double precision default 0, my_lng double precision default 0)
returns json
language plpgsql
security definer
as $$
declare
  v_people json;
  v_people_count int;
  v_events_count int;
  v_challenges_count int;
begin
  -- Zanonimizowane mini-karty: inicjal, wiek, glowny cel — bez nazwisk i zdjec
  select coalesce(json_agg(x), '[]'::json) into v_people
  from (
    select left(coalesce(p.name, '?'), 1) as initial,
           p.age,
           coalesce(p.goals[1], p.fitness_level, '') as goal,
           case when my_lat <> 0 and p.latitude is not null then
             round((6371 * acos(least(1.0,
               cos(radians(my_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(my_lng))
               + sin(radians(my_lat)) * sin(radians(p.latitude)))))::numeric)
           else null end as dist_km
    from profiles p
    where p.photo_urls is not null and array_length(p.photo_urls, 1) > 0
    order by dist_km nulls last, p.created_at desc
    limit 10
  ) x
  where x.dist_km is null or x.dist_km <= 50;

  select count(*) into v_people_count
  from profiles p
  where p.photo_urls is not null and array_length(p.photo_urls, 1) > 0
  and (my_lat = 0 or p.latitude is null or
    6371 * acos(least(1.0,
      cos(radians(my_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(my_lng))
      + sin(radians(my_lat)) * sin(radians(p.latitude)))) <= 50);

  select count(*) into v_events_count
  from sports_events
  where event_date >= current_date and event_date < current_date + 7;

  select count(*) into v_challenges_count
  from challenges
  where end_date >= current_date;

  return json_build_object(
    'people', v_people,
    'people_count', v_people_count,
    'events_week', v_events_count,
    'challenges_active', v_challenges_count
  );
end;
$$;

grant execute on function public.get_guest_preview(double precision, double precision) to anon, authenticated;

-- Leaderboard mojej silowni: punkty = treningi*10 + streak*2 + aktywne wyzwania*5
create or replace function public.get_gym_leaderboard(p_profile_id uuid, p_period text default 'week')
returns table(
  profile_id uuid,
  name text,
  photo_url text,
  workouts_count integer,
  streak integer,
  challenges_count integer,
  points integer,
  is_me boolean
)
language plpgsql
security definer
as $$
declare
  v_gym text;
  v_since date;
begin
  select gym_name into v_gym from profiles where id = p_profile_id;
  if v_gym is null or trim(v_gym) = '' then return; end if;

  v_since := case when p_period = 'month'
    then date_trunc('month', current_date)::date
    else date_trunc('week', current_date)::date end;

  return query
  select p.id,
         p.name,
         case when p.photo_urls is not null and array_length(p.photo_urls, 1) > 0 then p.photo_urls[1] else null end,
         count(distinct w.id)::int,
         coalesce(p.current_streak, 0),
         count(distinct cp.id)::int,
         (count(distinct w.id) * 10 + coalesce(p.current_streak, 0) * 2 + count(distinct cp.id) * 5)::int,
         p.id = p_profile_id
  from profiles p
  left join workouts w on w.creator_id = p.id and w.workout_date >= v_since
  left join challenge_participants cp on cp.profile_id = p.id
    and exists (select 1 from challenges c where c.id = cp.challenge_id and c.end_date >= current_date)
  where lower(trim(p.gym_name)) = lower(trim(v_gym))
  group by p.id
  order by 7 desc, 4 desc
  limit 50;
end;
$$;

-- Bitwa silowni: moja silownia vs najaktywniejsza inna silownia w miescie (ten tydzien)
create or replace function public.get_gym_battle(p_profile_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_gym text;
  v_city text;
  v_my record;
  v_rival record;
begin
  select gym_name, city into v_gym, v_city from profiles where id = p_profile_id;
  if v_gym is null or trim(v_gym) = '' then return null; end if;

  with pts as (
    select lower(trim(p.gym_name)) as gym_key,
           min(p.gym_name) as gym_label,
           (count(distinct w.id) * 10)::int as points,
           count(distinct p.id)::int as members
    from profiles p
    left join workouts w on w.creator_id = p.id and w.workout_date >= date_trunc('week', current_date)::date
    where p.gym_name is not null and trim(p.gym_name) <> ''
    and lower(coalesce(p.city, '')) = lower(coalesce(v_city, ''))
    group by 1
  )
  select gym_label, points, members into v_my
  from pts where gym_key = lower(trim(v_gym));

  with pts as (
    select lower(trim(p.gym_name)) as gym_key,
           min(p.gym_name) as gym_label,
           (count(distinct w.id) * 10)::int as points,
           count(distinct p.id)::int as members
    from profiles p
    left join workouts w on w.creator_id = p.id and w.workout_date >= date_trunc('week', current_date)::date
    where p.gym_name is not null and trim(p.gym_name) <> ''
    and lower(coalesce(p.city, '')) = lower(coalesce(v_city, ''))
    group by 1
  )
  select gym_label, points, members into v_rival
  from pts where gym_key <> lower(trim(v_gym))
  order by points desc limit 1;

  if v_my is null then return null; end if;

  return json_build_object(
    'my_gym', v_my.gym_label, 'my_points', v_my.points, 'my_members', v_my.members,
    'rival_gym', v_rival.gym_label, 'rival_points', coalesce(v_rival.points, 0), 'rival_members', coalesce(v_rival.members, 0)
  );
end;
$$;
