-- Preferencje powiadomien: matche/polubienia oraz wiadomosci
alter table public.profiles
  add column if not exists notif_matches boolean not null default true;
alter table public.profiles
  add column if not exists notif_messages boolean not null default true;
