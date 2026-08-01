-- Bitwa silowni: rywal wybierany z silowni w promieniu 25 km od uzytkownika
-- (zamiast dopasowania po nazwie miasta — feedback testerow)

create or replace function public.get_gym_battle(p_profile_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_gym text;
  v_lat double precision;
  v_lng double precision;
  v_my record;
  v_rival record;
begin
  select gym_name, latitude, longitude into v_gym, v_lat, v_lng
  from profiles where id = p_profile_id;
  if v_gym is null or trim(v_gym) = '' then return null; end if;

  with pts as (
    select lower(trim(p.gym_name)) as gym_key,
           min(p.gym_name) as gym_label,
           (count(distinct w.id) * 10)::int as points,
           count(distinct p.id)::int as members
    from profiles p
    left join workouts w on w.creator_id = p.id and w.workout_date >= date_trunc('week', current_date)::date
    where p.gym_name is not null and trim(p.gym_name) <> ''
    and (
      v_lat is null or p.latitude is null
      or 6371 * acos(greatest(-1::double precision, least(1::double precision,
          cos(radians(v_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_lng))
          + sin(radians(v_lat)) * sin(radians(p.latitude))))) <= 25
    )
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
    and (
      v_lat is null or p.latitude is null
      or 6371 * acos(greatest(-1::double precision, least(1::double precision,
          cos(radians(v_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_lng))
          + sin(radians(v_lat)) * sin(radians(p.latitude))))) <= 25
    )
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
