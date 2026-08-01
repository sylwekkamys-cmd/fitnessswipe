-- 8 nowych odznak: fotogeniczny, rozgadany, magnes na ludzi, bywalec,
-- gwiazda stories, trendsetter, ranny ptaszek, nocny marek
create or replace function public.check_and_award_badges(p_profile_id uuid)
 returns text[]
 language plpgsql
 security definer
as $function$
declare
  v_longest_streak int;
  v_total_swipes int;
  v_total_matches int;
  v_total_messages int;
  v_workout_sessions int;
  v_challenges_joined int;
  v_challenges_created int;
  v_events_created int;
  v_events_joined int;
  v_referrals_count int;
  v_is_verified boolean;
  v_referral_code text;
  v_photo_count int;
  v_reactions_received int;
  v_trend_challenges int;
  v_early_workouts int;
  v_late_workouts int;
  v_all_badges text[];
begin
  select longest_streak, is_verified, referral_code, coalesce(array_length(photo_urls, 1), 0)
  into v_longest_streak, v_is_verified, v_referral_code, v_photo_count
  from profiles where id = p_profile_id;

  select count(*) into v_total_swipes from swipes where swiper_id = p_profile_id;
  select count(*) into v_total_matches from matches where profile_a_id = p_profile_id or profile_b_id = p_profile_id;
  select count(*) into v_total_messages from messages where sender_id = p_profile_id;
  select count(*) into v_workout_sessions from workout_streaks where profile_id = p_profile_id;
  select count(*) into v_challenges_joined from challenge_participants where profile_id = p_profile_id;
  select count(*) into v_challenges_created from challenges where creator_id = p_profile_id;
  select count(*) into v_events_created from sports_events where creator_id = p_profile_id;
  select count(*) into v_events_joined from event_attendees where profile_id = p_profile_id;
  select count(*) into v_referrals_count from profiles where referred_by = v_referral_code and referral_reward_given = true;
  select count(*) into v_reactions_received from status_reactions where status_profile_id = p_profile_id;
  select count(*) into v_trend_challenges from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    where cp.profile_id = p_profile_id and c.goal_type in ('padel_sessions', 'pickleball_sessions', 'hyrox');
  select count(*) into v_early_workouts from workout_streaks
    where profile_id = p_profile_id and extract(hour from created_at at time zone 'Europe/Warsaw') < 8;
  select count(*) into v_late_workouts from workout_streaks
    where profile_id = p_profile_id and extract(hour from created_at at time zone 'Europe/Warsaw') >= 21;

  if v_longest_streak >= 7 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'streak_7') on conflict do nothing;
  end if;
  if v_longest_streak >= 30 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'streak_30') on conflict do nothing;
  end if;
  if v_longest_streak >= 100 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'streak_100') on conflict do nothing;
  end if;

  if v_total_swipes >= 100 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'swipes_100') on conflict do nothing;
  end if;
  if v_total_swipes >= 500 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'swipes_500') on conflict do nothing;
  end if;
  if v_total_swipes >= 1000 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'swipes_1000') on conflict do nothing;
  end if;

  if v_total_matches >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'first_match') on conflict do nothing;
  end if;
  if v_total_matches >= 10 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'matches_10') on conflict do nothing;
  end if;
  if v_total_matches >= 25 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'matches_25') on conflict do nothing;
  end if;

  if v_total_messages >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'first_message') on conflict do nothing;
  end if;
  if v_total_messages >= 100 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'messages_100') on conflict do nothing;
  end if;

  if v_workout_sessions >= 10 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'sessions_10') on conflict do nothing;
  end if;
  if v_workout_sessions >= 50 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'sessions_50') on conflict do nothing;
  end if;

  if v_challenges_joined >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'challenge_joined') on conflict do nothing;
  end if;
  if v_challenges_created >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'challenge_created') on conflict do nothing;
  end if;
  if v_trend_challenges >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'trendsetter') on conflict do nothing;
  end if;

  if v_events_created >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'event_created') on conflict do nothing;
  end if;
  if v_events_joined >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'event_joined') on conflict do nothing;
  end if;
  if v_events_joined >= 5 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'events_5') on conflict do nothing;
  end if;

  if v_referrals_count >= 1 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'referral_first') on conflict do nothing;
  end if;

  if v_is_verified then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'verified_profile') on conflict do nothing;
  end if;

  if v_photo_count >= 3 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'photogenic') on conflict do nothing;
  end if;

  if v_reactions_received >= 10 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'status_star') on conflict do nothing;
  end if;

  if v_early_workouts >= 5 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'early_bird') on conflict do nothing;
  end if;
  if v_late_workouts >= 5 then
    insert into profile_badges (profile_id, badge_code) values (p_profile_id, 'night_owl') on conflict do nothing;
  end if;

  select array_agg(badge_code) into v_all_badges from profile_badges where profile_id = p_profile_id;
  return coalesce(v_all_badges, '{}');
end;
$function$;
