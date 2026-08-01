-- Profile trenerow: platny status trenera, wizytowka, katalog, obserwowanie, opinie
-- Model: kazdy moze wykupic konto trenera; odznake "Zweryfikowany trener" daje
-- zatwierdzony certyfikat (cert_status = 'approved', zatwierdzany recznie).

alter table profiles add column if not exists is_trainer boolean default false;
alter table profiles add column if not exists trainer_show_in_deck boolean default true;

-- Wizytowka trenera
create table if not exists trainer_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  specializations text[] default '{}',
  experience_years int default 0,
  description text default '',
  price_info text default '',
  certificate_url text,
  cert_status text default 'none' check (cert_status in ('none', 'pending', 'approved', 'rejected')),
  instagram text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table trainer_profiles enable row level security;

drop policy if exists trainer_profiles_select on trainer_profiles;
create policy trainer_profiles_select on trainer_profiles for select to authenticated using (true);

drop policy if exists trainer_profiles_insert on trainer_profiles;
create policy trainer_profiles_insert on trainer_profiles for insert to authenticated
  with check (profile_id in (select id from profiles where user_id = auth.uid()));

drop policy if exists trainer_profiles_update on trainer_profiles;
create policy trainer_profiles_update on trainer_profiles for update to authenticated
  using (profile_id in (select id from profiles where user_id = auth.uid()));

-- Opinie: tylko przez RPC (weryfikacja uprawnien), odczyt dla wszystkich
create table if not exists trainer_reviews (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references profiles(id) on delete cascade,
  reviewer_id uuid references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text default '',
  created_at timestamptz default now(),
  unique(trainer_id, reviewer_id)
);

alter table trainer_reviews enable row level security;

drop policy if exists trainer_reviews_select on trainer_reviews;
create policy trainer_reviews_select on trainer_reviews for select to authenticated using (true);

-- Obserwowanie trenera
create table if not exists trainer_followers (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references profiles(id) on delete cascade,
  follower_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(trainer_id, follower_id)
);

alter table trainer_followers enable row level security;

drop policy if exists trainer_followers_select on trainer_followers;
create policy trainer_followers_select on trainer_followers for select to authenticated using (true);

drop policy if exists trainer_followers_insert on trainer_followers;
create policy trainer_followers_insert on trainer_followers for insert to authenticated
  with check (follower_id in (select id from profiles where user_id = auth.uid()));

drop policy if exists trainer_followers_delete on trainer_followers;
create policy trainer_followers_delete on trainer_followers for delete to authenticated
  using (follower_id in (select id from profiles where user_id = auth.uid()));

-- Katalog trenerow (sortowanie: zweryfikowani, ocena, dystans)
create or replace function public.get_trainers(
  my_lat double precision default 0,
  my_lng double precision default 0,
  spec_filter text default ''
)
returns table(
  profile_id uuid,
  name text,
  photo_url text,
  city text,
  specializations text[],
  experience_years int,
  price_info text,
  trainer_verified boolean,
  rating numeric,
  reviews_count int,
  followers_count int,
  distance_km double precision
)
language sql
security definer
as $$
  select
    p.id,
    p.name,
    case when p.photo_urls is not null and array_length(p.photo_urls, 1) > 0 then p.photo_urls[1] else null end,
    p.city,
    tp.specializations,
    tp.experience_years,
    tp.price_info,
    tp.cert_status = 'approved',
    (select round(avg(r.rating)::numeric, 1) from trainer_reviews r where r.trainer_id = p.id),
    (select count(*)::int from trainer_reviews r where r.trainer_id = p.id),
    (select count(*)::int from trainer_followers f where f.trainer_id = p.id),
    case when my_lat != 0 and p.latitude is not null then
      round((6371 * acos(greatest(-1::double precision, least(1::double precision,
        cos(radians(my_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(my_lng))
        + sin(radians(my_lat)) * sin(radians(p.latitude))))))::numeric, 1)::double precision
    else null end
  from profiles p
  join trainer_profiles tp on tp.profile_id = p.id
  where p.is_trainer = true
  and (spec_filter = '' or spec_filter = any(tp.specializations))
  order by (tp.cert_status = 'approved') desc, 9 desc nulls last, 12 asc nulls last
  limit 100;
$$;

-- Pelna karta trenera + uprawnienie do opinii + status obserwowania
create or replace function public.get_trainer_card(p_trainer_id uuid, p_viewer_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
  v_can_review boolean;
  v_is_following boolean;
begin
  -- Opinia dozwolona po wspolnym matchu lub wspolnym wydarzeniu
  select exists(
    select 1 from matches m
    where (m.profile_a_id = p_viewer_id and m.profile_b_id = p_trainer_id)
       or (m.profile_a_id = p_trainer_id and m.profile_b_id = p_viewer_id)
  ) or exists(
    select 1 from event_attendees ea1
    join event_attendees ea2 on ea1.event_id = ea2.event_id
    where ea1.profile_id = p_viewer_id and ea2.profile_id = p_trainer_id
  ) into v_can_review;

  select exists(
    select 1 from trainer_followers where trainer_id = p_trainer_id and follower_id = p_viewer_id
  ) into v_is_following;

  select json_build_object(
    'profile_id', p.id,
    'name', p.name,
    'age', p.age,
    'city', p.city,
    'gym_name', p.gym_name,
    'photo_urls', p.photo_urls,
    'is_verified', p.is_verified,
    'specializations', tp.specializations,
    'experience_years', tp.experience_years,
    'description', tp.description,
    'price_info', tp.price_info,
    'instagram', tp.instagram,
    'trainer_verified', tp.cert_status = 'approved',
    'rating', (select round(avg(r.rating)::numeric, 1) from trainer_reviews r where r.trainer_id = p.id),
    'reviews_count', (select count(*) from trainer_reviews r where r.trainer_id = p.id),
    'followers_count', (select count(*) from trainer_followers f where f.trainer_id = p.id),
    'can_review', v_can_review,
    'is_following', v_is_following,
    'my_review', (select json_build_object('rating', r.rating, 'comment', r.comment)
                  from trainer_reviews r where r.trainer_id = p.id and r.reviewer_id = p_viewer_id),
    'reviews', coalesce((
      select json_agg(json_build_object(
        'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at,
        'reviewer_name', rp.name,
        'reviewer_photo', case when rp.photo_urls is not null and array_length(rp.photo_urls, 1) > 0 then rp.photo_urls[1] else null end
      ) order by r.created_at desc)
      from (select * from trainer_reviews where trainer_id = p.id order by created_at desc limit 20) r
      join profiles rp on rp.id = r.reviewer_id
    ), '[]'::json)
  ) into v_result
  from profiles p
  join trainer_profiles tp on tp.profile_id = p.id
  where p.id = p_trainer_id and p.is_trainer = true;

  return v_result;
end;
$$;

-- Dodanie/aktualizacja opinii — z weryfikacja uprawnienia
create or replace function public.add_trainer_review(
  p_trainer_id uuid,
  p_reviewer_id uuid,
  p_rating int,
  p_comment text default ''
)
returns json
language plpgsql
security definer
as $$
declare
  v_can_review boolean;
begin
  if p_trainer_id = p_reviewer_id then
    return json_build_object('success', false, 'error', 'own_profile');
  end if;
  if p_rating < 1 or p_rating > 5 then
    return json_build_object('success', false, 'error', 'bad_rating');
  end if;

  select exists(
    select 1 from matches m
    where (m.profile_a_id = p_reviewer_id and m.profile_b_id = p_trainer_id)
       or (m.profile_a_id = p_trainer_id and m.profile_b_id = p_reviewer_id)
  ) or exists(
    select 1 from event_attendees ea1
    join event_attendees ea2 on ea1.event_id = ea2.event_id
    where ea1.profile_id = p_reviewer_id and ea2.profile_id = p_trainer_id
  ) into v_can_review;

  if not v_can_review then
    return json_build_object('success', false, 'error', 'not_eligible');
  end if;

  insert into trainer_reviews (trainer_id, reviewer_id, rating, comment)
  values (p_trainer_id, p_reviewer_id, p_rating, coalesce(p_comment, ''))
  on conflict (trainer_id, reviewer_id)
  do update set rating = excluded.rating, comment = excluded.comment, created_at = now();

  return json_build_object('success', true);
end;
$$;

-- Kontakt z trenerem: tworzy match (jesli nie istnieje), zeby dzialal zwykly czat
create or replace function public.create_trainer_chat(p_trainer_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_match_id uuid;
begin
  select m.id into v_match_id from matches m
  where (m.profile_a_id = p_user_id and m.profile_b_id = p_trainer_id)
     or (m.profile_a_id = p_trainer_id and m.profile_b_id = p_user_id)
  limit 1;

  if v_match_id is not null then return v_match_id; end if;

  insert into matches (profile_a_id, profile_b_id)
  values (p_user_id, p_trainer_id)
  returning id into v_match_id;

  return v_match_id;
end;
$$;

-- Talia swipe: trenerzy z wylaczonym "pokazuj w talii" znikaja z kandydatow;
-- karta dostaje pola is_trainer / trainer_verified (odznaka "Trener")
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
  looking_for_spotter boolean, is_trainer boolean, trainer_verified boolean, distance_km double precision
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
