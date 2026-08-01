-- Katalog trenerow: twardy filtr promienia. Dotad funkcja zwracala do 100
-- trenerow z calej bazy i tylko sortowala po odleglosci — profil trenera byl
-- widoczny setki km od niego. Teraz: trenerzy spoza promienia odpadaja,
-- zbanowani tez (tego rowniez brakowalo). Stare buildy wolaja funkcje bez
-- radius_km — dostana domyslne 100 km.
-- Zmiana sygnatury => najpierw DROP (inaczej niejednoznaczne przeciazenie).
drop function if exists public.get_trainers(double precision, double precision, text);

create or replace function public.get_trainers(
  my_lat double precision default 0,
  my_lng double precision default 0,
  spec_filter text default '',
  radius_km double precision default 100
)
returns table(
  profile_id uuid,
  name text,
  photo_url text,
  city text,
  specializations text[],
  experience_years int,
  price_info text,
  trainer_verified boolean,
  rating numeric,
  reviews_count int,
  followers_count int,
  distance_km double precision
)
language sql
security definer
as $$
  select
    p.id,
    p.name,
    case when p.photo_urls is not null and array_length(p.photo_urls, 1) > 0 then p.photo_urls[1] else null end,
    p.city,
    coalesce(tp.specializations, '{}'::text[]),
    coalesce(tp.experience_years, 0),
    coalesce(tp.price_info, ''),
    coalesce(tp.cert_status = 'approved', false),
    (select round(avg(r.rating)::numeric, 1) from trainer_reviews r where r.trainer_id = p.id),
    (select count(*)::int from trainer_reviews r where r.trainer_id = p.id),
    (select count(*)::int from trainer_followers f where f.trainer_id = p.id),
    case when my_lat != 0 and p.latitude is not null then
      round((6371 * acos(greatest(-1::double precision, least(1::double precision,
        cos(radians(my_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(my_lng))
        + sin(radians(my_lat)) * sin(radians(p.latitude))))))::numeric, 1)::double precision
    else null end
  from profiles p
  left join trainer_profiles tp on tp.profile_id = p.id
  where p.is_trainer = true
  and coalesce(p.banned, false) = false
  and (spec_filter = '' or spec_filter = any(coalesce(tp.specializations, '{}'::text[])))
  and (
    -- bez lokalizacji ogladajacego nie da sie filtrowac (fallback: pokaz wszystkich);
    -- trener bez wspolrzednych odpada, bo nie sposob potwierdzic, ze jest w promieniu
    my_lat = 0
    or (
      p.latitude is not null
      and 6371 * acos(greatest(-1::double precision, least(1::double precision,
        cos(radians(my_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(my_lng))
        + sin(radians(my_lat)) * sin(radians(p.latitude))))) <= radius_km
    )
  )
  order by (coalesce(tp.cert_status, '') = 'approved') desc, 9 desc nulls last, 12 asc nulls last
  limit 100;
$$;
