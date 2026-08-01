-- Karta trenera dziala takze zanim trener zapisze wizytowke
-- (left join na trainer_profiles + bezpieczne domyslne wartosci)

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
    'specializations', coalesce(tp.specializations, '{}'::text[]),
    'experience_years', coalesce(tp.experience_years, 0),
    'description', coalesce(tp.description, ''),
    'price_info', coalesce(tp.price_info, ''),
    'instagram', coalesce(tp.instagram, ''),
    'trainer_verified', coalesce(tp.cert_status = 'approved', false),
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
  left join trainer_profiles tp on tp.profile_id = p.id
  where p.id = p_trainer_id and p.is_trainer = true;

  return v_result;
end;
$$;

-- Katalog rowniez z left join — trener bez zapisanej wizytowki tez jest widoczny
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
    coalesce(tp.specializations, '{}'::text[]),
    coalesce(tp.experience_years, 0),
    coalesce(tp.price_info, ''),
    coalesce(tp.cert_status = 'approved', false),
    (select round(avg(r.rating)::numeric, 1) from trainer_reviews r where r.trainer_id = p.id),
    (select count(*)::int from trainer_reviews r where r.trainer_id = p.id),
    (select count(*)::int from trainer_followers f where f.trainer_id = p.id),
    case when my_lat != 0 and p.latitude is not null then
      round((6371 * acos(greatest(-1::double precision, least(1::double precision,
        cos(radians(my_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(my_lng))
        + sin(radians(my_lat)) * sin(radians(p.latitude))))))::numeric, 1)::double precision
    else null end
  from profiles p
  left join trainer_profiles tp on tp.profile_id = p.id
  where p.is_trainer = true
  and (spec_filter = '' or spec_filter = any(coalesce(tp.specializations, '{}'::text[])))
  order by (coalesce(tp.cert_status, '') = 'approved') desc, 9 desc nulls last, 12 asc nulls last
  limit 100;
$$;
