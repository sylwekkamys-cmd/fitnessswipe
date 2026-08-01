-- Rekordy silowe na profilu (opcjonalne): [{ key, label?, value, unit }]
-- Wypelniane w rejestracji (krok "Twoje rekordy") lub w edycji profilu,
-- prezentowane jako kafle-trofea na profilu publicznym.
alter table profiles add column if not exists gym_records jsonb;
