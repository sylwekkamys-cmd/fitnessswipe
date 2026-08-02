-- Kroki z zegarka/telefonu przy zapisie treningu (Health Connect / Apple Health).
-- Opcjonalne pole — stare buildy nadal zapisuja treningi bez tej kolumny.
alter table public.workouts add column if not exists steps integer;
