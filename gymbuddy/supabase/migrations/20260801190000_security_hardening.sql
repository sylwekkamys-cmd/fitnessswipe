-- AUDYT BEZPIECZENSTWA (01.08) — domkniecie luk przed buildem 35.
-- Kazda poprawka zachowuje sygnatury funkcji (stare buildy dzialaja bez zmian);
-- dochodza tylko weryfikacje, ze wolajacy jest tym, za kogo sie podaje.

-- ============================================================================
-- 1. KRYTYCZNE: messages mialo polityke UPDATE using(true)/check(true) —
--    kazdy zalogowany mogl edytowac/kasowac DOWOLNA wiadomosc w calej apce.
--    Nowa polityka: tylko uczestnik matcha. Trigger ponizej pilnuje dodatkowo,
--    ze odbiorca zmienia wylacznie read_at, a nadawca tylko tresc/edycje/cofniecie.
-- ============================================================================
drop policy if exists "users can mark messages as read" on public.messages;

create policy messages_update_participants on public.messages
  for update using (
    exists (
      select 1 from matches m
      join profiles p on p.id in (m.profile_a_id, m.profile_b_id)
      where m.id = messages.match_id and p.user_id = auth.uid()
    )
  );

create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_sender boolean;
begin
  -- Serwis (cron/edge z kluczem service role) bez ograniczen
  if auth.uid() is null then
    return new;
  end if;

  select exists(
    select 1 from profiles p where p.id = old.sender_id and p.user_id = auth.uid()
  ) into v_is_sender;

  if v_is_sender then
    -- Nadawca: wolno zmieniac tylko tresc (edycja), edited_at i deleted_at (cofniecie)
    if (to_jsonb(new) - 'content' - 'edited_at' - 'deleted_at' - 'read_at')
       is distinct from
       (to_jsonb(old) - 'content' - 'edited_at' - 'deleted_at' - 'read_at') then
      raise exception 'message update: only content/edited_at/deleted_at allowed';
    end if;
  else
    -- Odbiorca: wylacznie potwierdzenie odczytu
    if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
      raise exception 'message update: receiver may only set read_at';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_message_update on public.messages;
create trigger trg_guard_message_update
  before update on public.messages
  for each row execute function public.guard_message_update();

-- ============================================================================
-- 2. KRYTYCZNE: delete_match_and_swipes bez weryfikacji wlasnosci —
--    kazdy mogl skasowac dowolny match (i polubienia) dowolnej pary.
-- ============================================================================
create or replace function public.delete_match_and_swipes(match_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  profile_a uuid;
  profile_b uuid;
begin
  select profile_a_id, profile_b_id into profile_a, profile_b
  from matches where id = match_id;

  if not exists (
    select 1 from profiles p
    where p.id in (profile_a, profile_b) and p.user_id = auth.uid()
  ) then
    raise exception 'not_your_match';
  end if;

  delete from swipes
  where (swiper_id = profile_a and swiped_id = profile_b)
     or (swiper_id = profile_b and swiped_id = profile_a);

  delete from matches where id = match_id;
end;
$$;

-- ============================================================================
-- 3. KRYTYCZNE: get_who_liked_me(my_id) przyjmowalo dowolne id —
--    kazdy mogl podejrzec, kto polubil DOWOLNY profil (obejscie premium
--    + wyciek prywatnosci). Teraz tylko wlasny profil.
-- ============================================================================
create or replace function public.get_who_liked_me(my_id uuid)
returns setof profiles
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from profiles where id = my_id and user_id = auth.uid()) then
    raise exception 'not_your_profile';
  end if;

  return query
  select p.* from profiles p
  inner join swipes s on s.swiper_id = p.id
  where s.swiped_id = my_id
    and s.direction = 'right'
    and not exists (
      select 1 from matches m
      where (m.profile_a_id = my_id and m.profile_b_id = p.id)
         or (m.profile_b_id = my_id and m.profile_a_id = p.id)
    )
    and not exists (
      select 1 from swipes s2
      where s2.swiper_id = my_id and s2.swiped_id = p.id and s2.direction = 'right'
    );
end;
$$;

-- ============================================================================
-- 4. add_trainer_review: p_reviewer_id bylo do podrobienia — mozna bylo
--    wystawic opinie W CZYIMS IMIENIU (jesli tamten mial zaproszenie).
-- ============================================================================
create or replace function public.add_trainer_review(p_trainer_id uuid, p_reviewer_id uuid, p_rating integer, p_comment text default ''::text)
returns json
language plpgsql
security definer
as $$
declare
  v_can_review boolean;
begin
  if not exists (select 1 from profiles where id = p_reviewer_id and user_id = auth.uid()) then
    return json_build_object('success', false, 'error', 'not_you');
  end if;
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

-- ============================================================================
-- 5. create_trainer_chat: brak weryfikacji — mozna bylo tworzyc czaty
--    miedzy dowolnymi dwoma osobami. Teraz wolajacy musi byc jedna z nich.
-- ============================================================================
create or replace function public.create_trainer_chat(p_trainer_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_match_id uuid;
begin
  if not exists (
    select 1 from profiles where id in (p_trainer_id, p_user_id) and user_id = auth.uid()
  ) then
    raise exception 'not_participant';
  end if;

  select m.id into v_match_id from matches m
  where (m.profile_a_id = p_user_id and m.profile_b_id = p_trainer_id)
     or (m.profile_a_id = p_trainer_id and m.profile_b_id = p_user_id)
  limit 1;

  if v_match_id is not null then return v_match_id; end if;

  insert into matches (profile_a_id, profile_b_id, is_trainer_chat)
  values (p_user_id, p_trainer_id, true)
  returning id into v_match_id;

  return v_match_id;
end;
$$;

-- ============================================================================
-- 6. increment_status_view / log_daily_activity: id widza/aktywnego bylo do
--    podrobienia (falszowanie wyswietlen i aktywnosci referral). Ciche
--    ignorowanie zamiast bledu — stare buildy nie zobaczą różnicy.
-- ============================================================================
create or replace function public.increment_status_view(p_profile_id uuid, p_viewer_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from profiles where id = p_viewer_id and user_id = auth.uid()) then
    return;
  end if;

  if p_profile_id != p_viewer_id then
    insert into status_views (status_profile_id, viewer_id)
    values (p_profile_id, p_viewer_id)
    on conflict (status_profile_id, viewer_id) do update set viewed_at = now();

    update training_status
    set view_count = (select count(*) from status_views sv where sv.status_profile_id = p_profile_id)
    where profile_id = p_profile_id
      and expires_at > now();
  end if;
end;
$$;

create or replace function public.log_daily_activity(p_profile_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from profiles where id = p_profile_id and user_id = auth.uid()) then
    return;
  end if;

  insert into referral_activity_log (profile_id, activity_date)
  values (p_profile_id, current_date)
  on conflict (profile_id, activity_date) do nothing;

  perform check_and_grant_referral_reward(p_profile_id);
end;
$$;

-- ============================================================================
-- 7. profile_views: zdublowana permisywna polityka INSERT (check=true)
--    pozwalala wpisywac wyswietlenia z DOWOLNYM viewer_id. Zostaje wlasciwa
--    polityka "Users can insert profile views" (viewer = wolajacy).
-- ============================================================================
drop policy if exists "Enable insert for authenticated users" on public.profile_views;

-- ============================================================================
-- 8. Rola anon nie ma czego szukac w RPC — wszystkie funkcje (poza podgladem
--    goscia) wymagaja zalogowania. Odcinamy tez domyslny grant PUBLIC,
--    zeby przyszle funkcje nie byly automatycznie otwarte.
-- ============================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.get_guest_preview(double precision, double precision) to anon;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
