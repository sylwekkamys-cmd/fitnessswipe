-- Czat: zdjecia, wiadomosci glosowe i edycja
--  * image_url       — zdjecie w dymku (upload do profile-photos)
--  * audio_url       — glosowka (m4a) + audio_duration w sekundach
--  * edited_at       — znacznik "(edytowano)" przy zmienionej tresci
alter table public.messages add column if not exists image_url text;
alter table public.messages add column if not exists audio_url text;
alter table public.messages add column if not exists audio_duration int;
alter table public.messages add column if not exists edited_at timestamptz;
