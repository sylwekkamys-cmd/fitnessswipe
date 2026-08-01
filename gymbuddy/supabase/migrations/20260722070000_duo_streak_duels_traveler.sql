-- Trzy nowe mechaniki spolecznosciowe:
-- 1) wspolna passa par (duo streak) — tygodnie z rzedu ze wspolnym treningiem
-- 2) pojedynki 1v1 z zakladem (duels)
-- 3) tryb "jestem tu przejazdem" (traveler_until)

-- ===== 3. Tryb podroznika =====
alter table profiles add column if not exists traveler_until date;

-- ===== 1. Wspolna passa =====
-- Liczy tygodnie z rzedu (wstecz od biezacego lub poprzedniego tygodnia),
-- w ktorych para zalogowala wspolny trening w dzienniku
create or replace function public.get_duo_streaks(p_my uuid)
returns table(other_id uuid, weeks int)
language plpgsql
security definer
as $$
declare
  rec record;
  v_weeks int;
  v_week date;
begin
  for rec in
    select distinct case when w.creator_id = p_my then w.partner_id else w.creator_id end as other
    from workouts w
    where (w.creator_id = p_my and w.partner_id is not null)
       or (w.partner_id = p_my)
  loop
    if rec.other is null then continue; end if;
    v_weeks := 0;
    v_week := date_trunc('week', current_date)::date;
    -- biezacy tydzien moze byc jeszcze "w trakcie" — jesli pusty, zacznij od poprzedniego
    if not exists (
      select 1 from workouts w
      where ((w.creator_id = p_my and w.partner_id = rec.other) or (w.creator_id = rec.other and w.partner_id = p_my))
      and date_trunc('week', w.workout_date)::date = v_week
    ) then
      v_week := v_week - 7;
    end if;
    while exists (
      select 1 from workouts w
      where ((w.creator_id = p_my and w.partner_id = rec.other) or (w.creator_id = rec.other and w.partner_id = p_my))
      and date_trunc('week', w.workout_date)::date = v_week
    ) loop
      v_weeks := v_weeks + 1;
      v_week := v_week - 7;
    end loop;
    if v_weeks > 0 then
      other_id := rec.other;
      weeks := v_weeks;
      return next;
    end if;
  end loop;
end;
$$;

-- ===== 2. Pojedynki 1v1 =====
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  challenger_id uuid references profiles(id) on delete cascade,
  opponent_id uuid references profiles(id) on delete cascade,
  metric text not null check (metric in ('workouts', 'steps')),
  stake text default '',
  duration_days int not null default 7,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'finished', 'cancelled')),
  starts_at date,
  ends_at date,
  challenger_steps int default 0,
  opponent_steps int default 0,
  winner_id uuid,
  created_at timestamptz default now()
);

create unique index if not exists duels_one_open_per_match
  on duels (match_id) where status in ('pending', 'active');

alter table duels enable row level security;

drop policy if exists duels_select on duels;
create policy duels_select on duels for select to authenticated
  using (
    challenger_id in (select id from profiles where user_id = auth.uid())
    or opponent_id in (select id from profiles where user_id = auth.uid())
  );

-- Utworzenie pojedynku: wyzywajacy z sesji, przeciwnik = druga strona matcha
create or replace function public.create_duel(p_match_id uuid, p_metric text, p_stake text, p_days int)
returns json
language plpgsql
security definer
as $$
declare
  v_me uuid;
  v_other uuid;
  v_duel_id uuid;
begin
  select id into v_me from profiles where user_id = auth.uid();
  if v_me is null then return json_build_object('success', false, 'error', 'no_profile'); end if;

  select case when profile_a_id = v_me then profile_b_id else profile_a_id end into v_other
  from matches where id = p_match_id and (profile_a_id = v_me or profile_b_id = v_me);
  if v_other is null then return json_build_object('success', false, 'error', 'not_your_match'); end if;

  if p_metric not in ('workouts', 'steps') then return json_build_object('success', false, 'error', 'bad_metric'); end if;
  if p_days not in (3, 7, 14) then return json_build_object('success', false, 'error', 'bad_days'); end if;

  begin
    insert into duels (match_id, challenger_id, opponent_id, metric, stake, duration_days)
    values (p_match_id, v_me, v_other, p_metric, coalesce(p_stake, ''), p_days)
    returning id into v_duel_id;
  exception when unique_violation then
    return json_build_object('success', false, 'error', 'duel_exists');
  end;

  return json_build_object('success', true, 'duel_id', v_duel_id);
end;
$$;

-- Odpowiedz na wyzwanie (tylko przeciwnik)
create or replace function public.respond_duel(p_duel_id uuid, p_accept boolean)
returns json
language plpgsql
security definer
as $$
declare
  v_me uuid;
begin
  select id into v_me from profiles where user_id = auth.uid();
  update duels set
    status = case when p_accept then 'active' else 'declined' end,
    starts_at = case when p_accept then current_date else null end,
    ends_at = case when p_accept then current_date + duration_days - 1 else null end
  where id = p_duel_id and opponent_id = v_me and status = 'pending';
  if not found then return json_build_object('success', false, 'error', 'not_allowed'); end if;
  return json_build_object('success', true);
end;
$$;

-- Raport krokow (metric='steps'; kazdy raportuje swoje z Health Connect)
create or replace function public.report_duel_steps(p_duel_id uuid, p_steps int)
returns void
language plpgsql
security definer
as $$
declare
  v_me uuid;
begin
  select id into v_me from profiles where user_id = auth.uid();
  update duels set challenger_steps = greatest(challenger_steps, p_steps)
  where id = p_duel_id and challenger_id = v_me and status = 'active' and metric = 'steps';
  update duels set opponent_steps = greatest(opponent_steps, p_steps)
  where id = p_duel_id and opponent_id = v_me and status = 'active' and metric = 'steps';
end;
$$;

-- Pojedynek dla matcha + wyniki na zywo + leniwa finalizacja po terminie
create or replace function public.get_duel(p_match_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  d record;
  v_ch_score int;
  v_op_score int;
begin
  select * into d from duels
  where match_id = p_match_id and status in ('pending', 'active', 'finished')
  order by created_at desc limit 1;
  if d is null then return null; end if;

  if d.metric = 'workouts' and d.status in ('active', 'finished') then
    select count(*) into v_ch_score from workouts
    where creator_id = d.challenger_id and workout_date between d.starts_at and d.ends_at;
    select count(*) into v_op_score from workouts
    where creator_id = d.opponent_id and workout_date between d.starts_at and d.ends_at;
  else
    v_ch_score := d.challenger_steps;
    v_op_score := d.opponent_steps;
  end if;

  -- Po terminie: zamknij i wskaz zwyciezce (remis => winner_id null)
  if d.status = 'active' and current_date > d.ends_at then
    update duels set status = 'finished',
      winner_id = case when v_ch_score > v_op_score then d.challenger_id
                       when v_op_score > v_ch_score then d.opponent_id
                       else null end
    where id = d.id
    returning * into d;
  end if;

  return json_build_object(
    'id', d.id, 'match_id', d.match_id,
    'challenger_id', d.challenger_id, 'opponent_id', d.opponent_id,
    'metric', d.metric, 'stake', d.stake, 'duration_days', d.duration_days,
    'status', d.status, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
    'challenger_score', v_ch_score, 'opponent_score', v_op_score,
    'winner_id', d.winner_id
  );
end;
$$;
