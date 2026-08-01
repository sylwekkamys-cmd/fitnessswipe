-- Cache miejsc w poblizu (naklejka lokalizacji): wypelniany przez edge function
-- nearby-places (service role), klienci nie czytaja bezposrednio.
create table if not exists places_cache (
  cell text primary key,
  places jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table places_cache enable row level security;
