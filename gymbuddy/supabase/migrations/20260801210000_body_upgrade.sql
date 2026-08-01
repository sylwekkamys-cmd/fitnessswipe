-- Rozbudowa karty pomiarow sylwetki:
--  1) zdjecia progresu — PRYWATNY bucket (w przeciwienstwie do profile-photos;
--     zdjecia sylwetki sa wrazliwe, dostep tylko przez signed URL wlasciciela)
--  2) symetria L/P — partie parzyste dostaja sufiksy _l/_r; stare wpisy
--     przenosimy na _r (pomiar pojedynczy traktujemy jak dominujaca prawa)
--  3) zgody na wglad trenera + rozszerzone polityki SELECT

-- ============================================================================
-- 1. Zdjecia progresu
-- ============================================================================
create table if not exists body_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  taken_on date not null default current_date,
  photo_path text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, taken_on)
);

alter table body_photos enable row level security;

create policy "owner all body_photos" on body_photos for all
  using (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from profiles p where p.id = profile_id and p.user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('body-photos', 'body-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sciezka pliku: <auth.uid()>/<nazwa> — pelna kontrola tylko dla wlasciciela
create policy "body_photos_insert_own" on storage.objects for insert
  with check (bucket_id = 'body-photos' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "body_photos_select_own" on storage.objects for select
  using (bucket_id = 'body-photos' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "body_photos_delete_own" on storage.objects for delete
  using (bucket_id = 'body-photos' and (auth.uid())::text = (storage.foldername(name))[1]);

-- ============================================================================
-- 2. Symetria L/P: istniejace pojedyncze pomiary partii parzystych -> _r
-- ============================================================================
update body_measurements set part = part || '_r'
  where part in ('biceps', 'forearm', 'thigh', 'calf');
update body_goals set part = part || '_r'
  where part in ('biceps', 'forearm', 'thigh', 'calf');

-- ============================================================================
-- 3. Zgody na wglad trenera w pomiary (bez zdjec — te zawsze prywatne)
-- ============================================================================
create table if not exists measurement_shares (
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  trainer_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_profile_id, trainer_profile_id)
);

alter table measurement_shares enable row level security;

create policy "owner manages measurement_shares" on measurement_shares for all
  using (exists (select 1 from profiles p where p.id = owner_profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from profiles p where p.id = owner_profile_id and p.user_id = auth.uid()));

create policy "trainer reads own measurement_shares" on measurement_shares for select
  using (exists (select 1 from profiles p where p.id = trainer_profile_id and p.user_id = auth.uid()));

-- Trener ze zgoda widzi POMIARY i CELE podopiecznego (odczyt)
create policy "trainer reads shared body_measurements" on body_measurements for select
  using (exists (
    select 1 from measurement_shares ms
    join profiles tp on tp.id = ms.trainer_profile_id
    where ms.owner_profile_id = body_measurements.profile_id
      and tp.user_id = auth.uid()
  ));

create policy "trainer reads shared body_goals" on body_goals for select
  using (exists (
    select 1 from measurement_shares ms
    join profiles tp on tp.id = ms.trainer_profile_id
    where ms.owner_profile_id = body_goals.profile_id
      and tp.user_id = auth.uid()
  ));
