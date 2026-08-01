-- Realne wyswietlenia relacji (statusu 24h): kto i kiedy obejrzal, jak na Instagramie.
-- Wczesniej view_count rosl przy kazdym otwarciu profilu — teraz liczy unikalne osoby,
-- ktore faktycznie otworzyly relacje (zdjecie statusu / podglad story na mapie).

create table if not exists status_views (
  status_profile_id uuid not null references profiles(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_profile_id, viewer_id)
);

alter table status_views enable row level security;

-- Wlasciciel relacji widzi liste swoich widzow
create policy "owner reads status views" on status_views for select
  using (exists (select 1 from profiles p where p.id = status_profile_id and p.user_id = auth.uid()));

-- Wlasciciel czysci widzow przy publikacji nowej relacji
create policy "owner deletes status views" on status_views for delete
  using (exists (select 1 from profiles p where p.id = status_profile_id and p.user_id = auth.uid()));

-- Nowe relacje startuja od zera wyswietlen
alter table training_status alter column view_count set default 0;

-- Widok liczy sie raz na osobe; licznik = liczba unikalnych widzow
create or replace function increment_status_view(p_profile_id uuid, p_viewer_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if p_profile_id != p_viewer_id then
    insert into status_views (status_profile_id, viewer_id)
    values (p_profile_id, p_viewer_id)
    on conflict (status_profile_id, viewer_id) do update set viewed_at = now();

    update training_status
    set view_count = (select count(*) from status_views sv where sv.status_profile_id = p_profile_id)
    where profile_id = p_profile_id
      and expires_at > now();
  end if;
end;
$$;
