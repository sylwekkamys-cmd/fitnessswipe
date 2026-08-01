-- Odznaka zalozyciela: pierwsze 100 kont w aplikacji dostaje ja na zawsze.
-- Backfill dla istniejacych + trigger nadajacy ja nowym, dopoki nie ma 100 profili.
alter table profiles add column if not exists is_founder boolean not null default false;

update profiles set is_founder = true
where id in (select id from profiles order by created_at asc limit 100);

create or replace function public.grant_founder_badge()
returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from profiles) < 100 then
    new.is_founder := true;
  end if;
  return new;
end $$;

drop trigger if exists trg_founder_badge on profiles;
create trigger trg_founder_badge before insert on profiles
for each row execute function public.grant_founder_badge();
