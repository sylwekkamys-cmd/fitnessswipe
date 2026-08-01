-- Wydarzenia dostaja zasieg widocznosci (jak wyzwania) - wczesniej byly widoczne globalnie
alter table public.sports_events
  add column if not exists radius_km integer not null default 100;

drop function if exists public.get_sports_events_nearby(double precision, double precision);

create or replace function public.get_sports_events_nearby(my_lat double precision, my_lng double precision)
 returns table(id uuid, creator_id uuid, title text, description text, sport_type text, event_date date, event_time text, venue_name text, latitude double precision, longitude double precision, max_participants integer, created_at timestamp with time zone, radius_km integer, attendee_count bigint, distance_km double precision)
 language sql
as $function$
  select
    e.id, e.creator_id, e.title, e.description, e.sport_type,
    e.event_date, e.event_time, e.venue_name,
    e.latitude, e.longitude, e.max_participants, e.created_at, e.radius_km,
    (select count(*) from event_attendees ea where ea.event_id = e.id) as attendee_count,
    case when my_lat != 0 and my_lng != 0 and e.latitude is not null and e.longitude is not null then
      round((6371 * acos(
        greatest(-1::double precision, least(1::double precision,
          cos(radians(my_lat)) * cos(radians(e.latitude)) *
          cos(radians(e.longitude) - radians(my_lng)) +
          sin(radians(my_lat)) * sin(radians(e.latitude))
        ))
      ))::numeric, 1)::double precision
    else null end as distance_km
  from sports_events e
  where e.event_date >= current_date
  and (
    my_lat = 0 or my_lng = 0
    or e.latitude is null or e.longitude is null
    or (
      6371 * acos(
        greatest(-1::double precision, least(1::double precision,
          cos(radians(my_lat)) * cos(radians(e.latitude)) *
          cos(radians(e.longitude) - radians(my_lng)) +
          sin(radians(my_lat)) * sin(radians(e.latitude))
        ))
      ) <= e.radius_km
    )
  )
  order by e.event_date asc, e.event_time asc;
$function$;
