-- Wiele relacji naraz (jak IG/FB): zdejmujemy UNIQUE(profile_id) z training_status.
-- Tabela ma wlasne id (PK) od zawsze; limit 3 aktywnych pilnuje aplikacja.
-- Reakcje i wyswietlenia zostaja per-profil (status_reactions/status_views
-- kluczowane status_profile_id) — dotycza calego zestawu relacji uzytkownika.
alter table public.training_status drop constraint if exists training_status_profile_id_key;
create index if not exists training_status_profile_idx on public.training_status(profile_id, expires_at);
