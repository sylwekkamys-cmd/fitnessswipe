-- Licznik dopasowan w profilu = to samo, co widac na liscie dopasowan:
-- czaty klient-trener (is_trainer_chat) nie sa dopasowaniami

create or replace function public.get_profile_stats(profile_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_views bigint;
  v_likes bigint;
  v_matches bigint;
begin
  select count(*) into v_views
  from profile_views
  where viewed_id = profile_id;

  select count(*) into v_likes
  from swipes
  where swiped_id = profile_id
  and direction = 'right';

  select count(*) into v_matches
  from matches
  where (profile_a_id = profile_id or profile_b_id = profile_id)
  and coalesce(is_trainer_chat, false) = false;

  return json_build_object(
    'views', v_views,
    'likes', v_likes,
    'matches', v_matches
  );
end;
$$;
