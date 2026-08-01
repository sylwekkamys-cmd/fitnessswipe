-- Strona internetowa trenera na wizytowce (obok Instagrama)

alter table trainer_profiles add column if not exists website text default '';

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
    select 1 from review_invites
    where trainer_id = p_trainer_id and user_id = p_viewer_id
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
    'website', coalesce(tp.website, ''),
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
