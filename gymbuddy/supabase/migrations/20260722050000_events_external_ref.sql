-- "Zbieram ekipe": wydarzenie spolecznosci moze byc doczepione do duzego eventu
-- (Ticketmaster id w external_ref) — liczymy ekipy wybierajace sie na dany event
alter table sports_events add column if not exists external_ref text;
create index if not exists sports_events_external_ref_idx on sports_events (external_ref) where external_ref is not null;
