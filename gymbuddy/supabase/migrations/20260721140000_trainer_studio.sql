-- Studio trenera: statystyki wyswietlen wizytowki, skrzynka klientow, dashboard

-- Wyswietlenia wizytowki (1 wpis na widza dziennie)
create table if not exists trainer_card_views (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references profiles(id) on delete cascade,
  viewer_id uuid references profiles(id) on delete cascade,
  view_date date default current_date,
  unique(trainer_id, viewer_id, view_date)
);

alter table trainer_card_views enable row level security;

drop policy if exists trainer_card_views_insert on trainer_card_views;
create policy trainer_card_views_insert on trainer_card_views for insert to authenticated
  with check (viewer_id in (select id from profiles where user_id = auth.uid()));

drop policy if exists trainer_card_views_select on trainer_card_views;
create policy trainer_card_views_select on trainer_card_views for select to authenticated
  using (trainer_id in (select id from profiles where user_id = auth.uid()));

-- Rozmowy klient-trener oznaczone flaga (osobna skrzynka w Studio)
alter table matches add column if not exists is_trainer_chat boolean default false;

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

  insert into matches (profile_a_id, profile_b_id, is_trainer_chat)
  values (p_user_id, p_trainer_id, true)
  returning id into v_match_id;

  return v_match_id;
end;
$$;

-- Dashboard Studia: wyswietlenia (dziennie, 7 dni), trend, obserwujacy, zapytania
create or replace function public.get_trainer_stats(p_trainer_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_views_7d int;
  v_views_prev_7d int;
  v_daily json;
  v_followers int;
  v_new_followers_7d int;
  v_inquiries int;
begin
  select count(*) into v_views_7d from trainer_card_views
  where trainer_id = p_trainer_id and view_date >= current_date - 6;

  select count(*) into v_views_prev_7d from trainer_card_views
  where trainer_id = p_trainer_id and view_date >= current_date - 13 and view_date < current_date - 6;

  select coalesce(json_agg(json_build_object('day', d.day, 'views', coalesce(v.cnt, 0)) order by d.day), '[]'::json)
  into v_daily
  from (select generate_series(current_date - 6, current_date, '1 day')::date as day) d
  left join (
    select view_date, count(*)::int as cnt from trainer_card_views
    where trainer_id = p_trainer_id and view_date >= current_date - 6
    group by view_date
  ) v on v.view_date = d.day;

  select count(*) into v_followers from trainer_followers where trainer_id = p_trainer_id;
  select count(*) into v_new_followers_7d from trainer_followers
  where trainer_id = p_trainer_id and created_at >= now() - interval '7 days';

  select count(*) into v_inquiries from matches
  where is_trainer_chat = true
  and (profile_a_id = p_trainer_id or profile_b_id = p_trainer_id);

  return json_build_object(
    'views_7d', v_views_7d,
    'views_prev_7d', v_views_prev_7d,
    'daily', v_daily,
    'followers', v_followers,
    'new_followers_7d', v_new_followers_7d,
    'inquiries', v_inquiries
  );
end;
$$;
