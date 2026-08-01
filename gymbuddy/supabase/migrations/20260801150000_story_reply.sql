-- Odpowiedz na relacje trafia do czatu 1:1 jako zwykla wiadomosc z flaga
-- story_reply (dymek dostaje etykiete "Odpowiedz na relacje" i miniature zdjecia
-- relacji w image_url). Zadnych nowych tabel — jedzie po istniejacym czacie.
alter table public.messages add column if not exists story_reply boolean not null default false;
