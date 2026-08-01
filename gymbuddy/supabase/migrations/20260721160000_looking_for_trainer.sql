-- Sygnal "Szukam trenera": nie-trener wlacza w profilu,
-- trenerzy widza plakietke na jego karcie w talii (lead dla trenera)

alter table profiles add column if not exists looking_for_trainer boolean default false;

drop function if exists public.get_candidates_nearby(uuid, double precision, double precision, double precision, text, integer, integer, text, integer, integer);

create or replace function public.get_candidates_nearby(
  my_profile_id uuid, my_lat double precision, my_lng double precision,
  radius_km double precision default 50, gender_filter text default '',
  min_age integer default 0, max_age integer default 0,
  fitness_filter text default '', min_exp integer default 0, max_exp integer default 0
)
returns table(
  id uuid, user_id uuid, name text, bio text, goals text[], gym_name text, gym_place_id text,
  city text, schedule text[], is_premium boolean, daily_swipes_left integer, swipe_reset_date date,
  photo_urls text[], lang text, created_at timestamp with time zone, updated_at timestamp with time zone,
  gender text, age integer, country text, looking_for text, experience_years integer,
  fitness_level text, preferred_exercises text[], training_frequency text, push_token text,
  latitude double precision, longitude double precision, is_verified boolean, verification_photo text,
  is_invisible boolean, filter_gender_initialized boolean, experience_months integer, birth_date date,
  preferred_language text, current_streak integer, longest_streak integer, last_workout_date date,
  last_active_at timestamp with time zone, training_intensity text, session_length text,
  looking_for_spotter boolean, is_trainer boolean, trainer_verified boolean,
  looking_for_trainer boolean, distance_km double precision
)
language sql
as $function$
  select
    p.id, p.user_id, p.name, p.bio, p.goals, p.gym_name, p.gym_place_id, p.city,
    p.schedule, p.is_premium, p.daily_swipes_left, p.swipe_reset_date,
    p.photo_urls, p.lang, p.created_at, p.updated_at,
    p.gender, p.age, p.country, p.looking_for, p.experience_years,
    p.fitness_level, p.preferred_exercises, p.training_frequency, p.push_token,
    p.latitude, p.longitude, p.is_verified, p.verification_photo,
    p.is_invisible, p.filter_gender_initialized, p.experience_months, p.birth_date,
    p.preferred_language, p.current_streak, p.longest_streak, p.last_workout_date,
    p.last_active_at,
    p.training_intensity, p.session_length, p.looking_for_spotter,
    coalesce(p.is_trainer, false),
    coalesce(tp.cert_status = 'approved', false),
    coalesce(p.looking_for_trainer, false),
    case when my_lat != 0 and my_lng != 0 and p.latitude is not null and p.longitude is not null then
      round((6371 * acos(
        greatest(-1::double precision, least(1::double precision,
          cos(radians(my_lat)) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians(my_lng)) +
          sin(radians(my_lat)) * sin(radians(p.latitude))
        ))
      ))::numeric, 1)::double precision
    else null end as distance_km
  from profiles p
  left join trainer_profiles tp on tp.profile_id = p.id
  where p.id != my_profile_id
  and (coalesce(p.is_trainer, false) = false or coalesce(p.trainer_show_in_deck, true) = true)
  and p.id not in (
    select swiped_id from swipes where swiper_id = my_profile_id
  )
  and p.id not in (
    select blocked_id from blocked_users where blocker_id = my_profile_id
    union
    select blocker_id from blocked_users where blocked_id = my_profile_id
  )
  and (
    gender_filter = '' or gender_filter = 'any' or p.gender = gender_filter
  )
  and (min_age = 0 or p.age >= min_age)
  and (max_age = 0 or p.age <= max_age)
  and (fitness_filter = '' or p.fitness_level = fitness_filter)
  and (min_exp = 0 or p.experience_years >= min_exp)
  and (max_exp = 0 or p.experience_years <= max_exp)
  and (
    p.is_invisible is not true
    or exists (
      select 1 from swipes s
      where s.swiper_id = p.id and s.swiped_id = my_profile_id and s.direction = 'right'
    )
  )
  and (
    (my_lat = 0 or my_lng = 0)
    or (
      p.latitude is not null and p.longitude is not null
      and 6371 * acos(
        greatest(-1::double precision, least(1::double precision,
          cos(radians(my_lat)) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians(my_lng)) +
          sin(radians(my_lat)) * sin(radians(p.latitude))
        ))
      ) <= radius_km
    )
  )
  order by distance_km asc nulls last
  limit 50;
$function$;
