-- Nowe preferencje treningowe: asekuracja (spotter), intensywnosc, dlugosc sesji
alter table public.profiles
  add column if not exists looking_for_spotter boolean not null default false;
alter table public.profiles
  add column if not exists training_intensity text not null default '';
alter table public.profiles
  add column if not exists session_length text not null default '';
