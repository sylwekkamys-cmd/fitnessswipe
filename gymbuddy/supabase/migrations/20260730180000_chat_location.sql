-- Udostepnianie lokalizacji w czacie: wspolrzedne + etykieta (nazwa silowni
-- albo "moja pozycja"); dymek renderuje mini-mapke, tap otwiera natywne mapy
alter table public.messages add column if not exists location_lat double precision;
alter table public.messages add column if not exists location_lng double precision;
alter table public.messages add column if not exists location_name text;
