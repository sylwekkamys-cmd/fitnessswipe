-- Cache duzych wydarzen z Ticketmaster (per region, odswiezany co 24h przez Edge Function)
create table if not exists big_events_cache (
  region_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
-- RLS wlaczony bez polityk: dostep tylko dla service role (Edge Function)
alter table big_events_cache enable row level security;
