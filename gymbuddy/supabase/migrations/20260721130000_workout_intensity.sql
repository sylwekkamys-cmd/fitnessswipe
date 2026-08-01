-- Intensywnosc treningu (lekki/solidny/do padu) w dzienniku
alter table workouts add column if not exists intensity text default '';
