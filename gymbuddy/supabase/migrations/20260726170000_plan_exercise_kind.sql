-- Typ cwiczenia w planie: silowe (serie kg x powt.) lub cardio (minuty + kcal).
-- Dla cardio JSONB sets przechowuje [{"w": minuty, "r": kcal, "done": false}].
alter table plan_exercises add column if not exists kind text not null default 'strength';
