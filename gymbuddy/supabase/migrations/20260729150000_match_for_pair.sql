-- Deterministyczna detekcja matcha po swipe (popup "It's a match!").
-- SECURITY DEFINER: dziala niezaleznie od RLS na matches/swipes — klient dostaje
-- id matcha dla pary (bez czatow trenerskich) albo null.
create or replace function public.get_match_for_pair(p_a uuid, p_b uuid)
returns uuid
language sql
security definer
as $$
  select id from matches
  where ((profile_a_id = p_a and profile_b_id = p_b)
      or (profile_a_id = p_b and profile_b_id = p_a))
  and coalesce(is_trainer_chat, false) = false
  limit 1;
$$;
