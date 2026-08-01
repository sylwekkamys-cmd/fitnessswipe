-- Liga silowni: pelna tabela klubow w promieniu 25 km (rozszerzenie bitwy 1v1).
-- Ta sama mechanika punktow co bitwa: treningi czlonkow w tym tygodniu x10.
create or replace function public.get_gym_league(p_profile_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_gym text;
  v_lat double precision;
  v_lng double precision;
  v_rows json;
begin
  select gym_name, latitude, longitude into v_gym, v_lat, v_lng
  from profiles where id = p_profile_id;
  if v_gym is null or trim(v_gym) = '' then return '[]'::json; end if;

  with pts as (
    select lower(trim(p.gym_name)) as gym_key,
           min(p.gym_name) as gym_label,
           (count(distinct w.id) * 10)::int as points,
           count(distinct p.id)::int as members
    from profiles p
    left join workouts w on w.creator_id = p.id and w.workout_date >= date_trunc('week', current_date)::date
    where p.gym_name is not null and trim(p.gym_name) <> ''
    and coalesce(p.banned, false) = false
    and (
      v_lat is null or p.latitude is null
      or 6371 * acos(greatest(-1::double precision, least(1::double precision,
          cos(radians(v_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(v_lng))
          + sin(radians(v_lat)) * sin(radians(p.latitude))))) <= 25
    )
    group by 1
  )
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v_rows from (
    select gym_label as gym, points, members, (gym_key = lower(trim(v_gym))) as is_mine
    from pts
    order by points desc, members desc, gym_label asc
    limit 15
  ) t;

  return v_rows;
end;
$$;
