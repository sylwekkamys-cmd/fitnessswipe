-- Krotkie wideo w relacji 24h (jak Instagram/FB) - alternatywa dla zdjecia statusu.
-- Wzajemnie wykluczne ze status_photo_url (aplikacja czysci drugie pole przy zapisie).
alter table training_status add column if not exists video_url text;

-- Kontekst do zgloszen tresci (nie tylko "zglos osobe", ale "zglos ta relacje/wideo")
alter table reported_users add column if not exists content_ref text;
