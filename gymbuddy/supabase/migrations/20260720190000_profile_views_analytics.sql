-- Analityka wyswietlen profilu: licznik powrotow, dzienne liczniki (wykres 7 dni),
-- rozszerzony RPC i codzienny digest push o 18:00 UTC.

-- 1. Licznik powtornych odwiedzin
alter table public.profile_views
  add column if not exists view_count integer not null default 1;

-- 2. Dzienne liczniki wyswietlen (do wykresu i trendu)
create table if not exists public.profile_view_daily (
  viewed_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (viewed_id, day)
);

alter table public.profile_view_daily enable row level security;

create policy "profile_view_daily_select_own" on public.profile_view_daily
  for select to authenticated
  using (viewed_id in (select id from public.profiles where user_id = auth.uid()));

-- 3. Trigger: kazda wizyta (insert lub ponowny upsert) bumpuje licznik i dzienna statystyke
create or replace function public.bump_profile_view()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  if (TG_OP = 'UPDATE') then
    new.view_count := coalesce(old.view_count, 1) + 1;
    new.viewed_at := now();
  end if;
  insert into public.profile_view_daily (viewed_id, day, count)
  values (new.viewed_id, current_date, 1)
  on conflict (viewed_id, day) do update set count = public.profile_view_daily.count + 1;
  return new;
end;
$$;

drop trigger if exists trg_bump_profile_view on public.profile_views;
create trigger trg_bump_profile_view
  before insert or update on public.profile_views
  for each row execute function public.bump_profile_view();

-- 4. Rozszerzony RPC: licznik powrotow + dane do wspolnych cech i odleglosci
drop function if exists public.get_profile_viewers(uuid);

create or replace function public.get_profile_viewers(my_id uuid)
 returns table(
   id uuid, name text, photo_urls text[], viewed_at timestamp with time zone,
   view_count integer, age integer, is_verified boolean, gym_name text,
   fitness_level text, goals text[], schedule text[],
   latitude double precision, longitude double precision
 )
 language sql
as $function$
  select p.id, p.name, p.photo_urls, pv.viewed_at,
         pv.view_count, p.age, p.is_verified, p.gym_name,
         p.fitness_level, p.goals, p.schedule,
         p.latitude, p.longitude
  from profile_views pv
  join profiles p on p.id = pv.viewer_id
  where pv.viewed_id = my_id
  order by pv.viewed_at desc
  limit 50;
$function$;

-- 5. Codzienny digest push (18:00 UTC) przez edge function daily-digest
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('daily-view-digest')
where exists (select 1 from cron.job where jobname = 'daily-view-digest');

select cron.schedule(
  'daily-view-digest',
  '0 18 * * *',
  $$
  select net.http_post(
    url := 'https://gubsxnpopckryvtrwvfa.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'd0abc0d91b06e736611451e5c4626dcdea34c538909bb00d'),
    body := '{}'::jsonb
  );
  $$
);
