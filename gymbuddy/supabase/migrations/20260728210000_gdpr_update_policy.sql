-- Zgody RODO zapisujemy upsertem (onConflict user_id) — przy ponownym przejsciu
-- przez ekran zgod (np. konto zalozone wczesniej bez ukonczonego profilu) upsert
-- wchodzi w sciezke UPDATE, a tabela miala tylko polityki INSERT/SELECT/DELETE.
drop policy if exists gdpr_update on gdpr_consents;
create policy gdpr_update on gdpr_consents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
