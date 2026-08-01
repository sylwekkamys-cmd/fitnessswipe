-- Ulepszenia czatu w stylu Messengera:
--  * reply_to_id — odpowiadanie na konkretna wiadomosc (cytat w dymku)
--  * deleted_at  — "cofnij wyslanie" (miekkie usuniecie, tresc czyszczona)
--  * last_seen_at w profiles — status online / ostatnia aktywnosc
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists last_seen_at timestamptz;
