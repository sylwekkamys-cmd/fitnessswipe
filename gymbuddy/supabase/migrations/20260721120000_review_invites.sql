-- Opinie tylko na zaproszenie trenera: po wspolnym treningu trener wysyla
-- prosbe o opinie i dopiero wtedy podopieczny moze ja wystawic.

create table if not exists review_invites (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references profiles(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(trainer_id, user_id)
);

alter table review_invites enable row level security;

drop policy if exists review_invites_select on review_invites;
create policy review_invites_select on review_invites for select to authenticated
  using (
    trainer_id in (select id from profiles where user_id = auth.uid())
    or user_id in (select id from profiles where user_id = auth.uid())
  );

-- Wysylanie zaproszenia: trener ustalany z sesji (auth.uid), nie z parametru —
-- nie da sie wyslac zaproszenia w czyims imieniu
create or replace function public.send_review_invite(p_user_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_trainer_id uuid;
begin
  select id into v_trainer_id
  from profiles
  where user_id = auth.uid() and is_trainer = true;

  if v_trainer_id is null then
    return json_build_object('success', false, 'error', 'not_a_trainer');
  end if;
  if v_trainer_id = p_user_id then
    return json_build_object('success', false, 'error', 'own_profile');
  end if;

  insert into review_invites (trainer_id, user_id)
  values (v_trainer_id, p_user_id)
  on conflict (trainer_id, user_id) do nothing;

  return json_build_object('success', true);
end;
$$;

-- Uprawnienie do opinii = istnieje zaproszenie od tego trenera
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
    select 1 from review_invites
    where trainer_id = p_trainer_id and user_id = p_reviewer_id
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
