-- Cache wynikow Giphy: darmowy klucz ma limit 100 zapytan/h, wiec trendy
-- i frazy trzymamy wspolnie dla wszystkich uzytkownikow. Dostep wylacznie
-- przez edge function (service role) — RLS wlaczone bez zadnych polityk.
create table if not exists public.gif_cache (
  term text primary key,
  gifs jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.gif_cache enable row level security;
