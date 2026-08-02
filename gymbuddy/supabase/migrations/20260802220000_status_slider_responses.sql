-- Naklejka slidera na relacji: kazdy widz moze przeciagnac "buzie" 0-1,
-- autor widzi srednia. Jeden wpis na widza na relacje (upsert przy kolejnych
-- przeciagnieciach), kasowany kaskadowo razem z relacja.
create table if not exists status_slider_responses (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references training_status(id) on delete cascade,
  responder_id uuid not null references profiles(id) on delete cascade,
  value numeric not null check (value >= 0 and value <= 1),
  created_at timestamptz not null default now(),
  unique (status_id, responder_id)
);

alter table status_slider_responses enable row level security;

-- Widz widzi wlasna odpowiedz; autor relacji widzi wszystkie (do liczenia sredniej)
create policy "slider_responses_select" on status_slider_responses for select using (
  responder_id = auth.uid()
  or exists (select 1 from training_status ts where ts.id = status_id and ts.profile_id = auth.uid())
);

create policy "slider_responses_insert" on status_slider_responses for insert with check (responder_id = auth.uid());
create policy "slider_responses_update" on status_slider_responses for update using (responder_id = auth.uid());
