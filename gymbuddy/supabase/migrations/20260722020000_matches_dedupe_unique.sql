-- Porzadki w matchach:
-- 1) scal zduplikowane matche tej samej pary (przepnij wiadomosci/treningi, usun nadmiarowe)
-- 2) unikalny indeks pary — duplikaty niemozliwe na przyszlosc
-- 3) trigger matcha reaguje tez na UPDATE swipe'a (upsert lewo->prawo z wyswietlen profilu)

-- 1. Scal duplikaty: zostaw najstarszy wiersz pary
with ranked as (
  select id,
         least(profile_a_id, profile_b_id) as pa,
         greatest(profile_a_id, profile_b_id) as pb,
         row_number() over (partition by least(profile_a_id, profile_b_id), greatest(profile_a_id, profile_b_id) order by matched_at asc) as rn,
         first_value(id) over (partition by least(profile_a_id, profile_b_id), greatest(profile_a_id, profile_b_id) order by matched_at asc) as keep_id
  from matches
),
dups as (select id, keep_id from ranked where rn > 1)
update messages m set match_id = d.keep_id
from dups d where m.match_id = d.id;

with ranked as (
  select id,
         row_number() over (partition by least(profile_a_id, profile_b_id), greatest(profile_a_id, profile_b_id) order by matched_at asc) as rn,
         first_value(id) over (partition by least(profile_a_id, profile_b_id), greatest(profile_a_id, profile_b_id) order by matched_at asc) as keep_id
  from matches
),
dups as (select id, keep_id from ranked where rn > 1)
update workouts w set match_id = d.keep_id
from dups d where w.match_id = d.id;

with ranked as (
  select id,
         row_number() over (partition by least(profile_a_id, profile_b_id), greatest(profile_a_id, profile_b_id) order by matched_at asc) as rn
  from matches
)
delete from matches where id in (select id from ranked where rn > 1);

-- 2. Unikalnosc pary (niezaleznie od kolejnosci kolumn)
create unique index if not exists matches_pair_key
  on matches (least(profile_a_id, profile_b_id), greatest(profile_a_id, profile_b_id));

-- 3. Trigger takze na UPDATE (upsert kierunku swipe'a)
drop trigger if exists on_swipe_right on swipes;
create trigger on_swipe_right
  after insert or update of direction on swipes
  for each row execute function check_and_create_match();
