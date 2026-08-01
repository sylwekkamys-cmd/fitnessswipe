-- Program polecen: nagroda dla OBU stron + realny warunek aktywnosci
-- (7 roznych dni aktywnosci w ciagu pierwszych 14 dni, zamiast 7/7)

create or replace function public.check_and_grant_referral_reward(p_profile_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_referred_by text;
  v_referrer_id uuid;
  v_already_rewarded boolean;
  v_active_days int;
  v_registration_date date;
  v_referrer_is_paid_premium boolean;
  v_referred_is_paid_premium boolean;
begin
  select referred_by, referral_reward_given, created_at::date
  into v_referred_by, v_already_rewarded, v_registration_date
  from profiles where id = p_profile_id;

  if v_referred_by is null or v_already_rewarded then
    return false;
  end if;

  -- 7 roznych dni aktywnosci w ciagu pierwszych 14 dni od rejestracji
  select count(distinct activity_date) into v_active_days
  from referral_activity_log
  where profile_id = p_profile_id
  and activity_date >= v_registration_date
  and activity_date < v_registration_date + interval '14 days';

  if v_active_days < 7 then
    return false;
  end if;

  select id into v_referrer_id from profiles where referral_code = v_referred_by;

  if v_referrer_id is null then
    return false;
  end if;

  -- Nagroda dla polecajacego (nie nadpisuj zrodla platnej subskrypcji)
  select (is_premium and premium_source = 'subscription')
  into v_referrer_is_paid_premium
  from profiles where id = v_referrer_id;

  update profiles
  set is_premium = true,
      premium_expires_at = greatest(coalesce(premium_expires_at, now()), now()) + interval '7 days',
      premium_source = case when v_referrer_is_paid_premium then premium_source else 'referral_bonus' end
  where id = v_referrer_id;

  -- Nagroda dla zaproszonego — "oboje dostajecie 7 dni"
  select (is_premium and premium_source = 'subscription')
  into v_referred_is_paid_premium
  from profiles where id = p_profile_id;

  update profiles
  set is_premium = true,
      premium_expires_at = greatest(coalesce(premium_expires_at, now()), now()) + interval '7 days',
      premium_source = case when v_referred_is_paid_premium then premium_source else 'referral_bonus' end,
      referral_reward_given = true
  where id = p_profile_id;

  return true;
end;
$$;
