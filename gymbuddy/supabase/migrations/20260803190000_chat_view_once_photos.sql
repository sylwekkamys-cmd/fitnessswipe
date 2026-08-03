-- Zdjecia jednorazowe w czacie (jak Snapchat/WhatsApp "widoczne raz"):
-- odbiorca otwiera raz, potem zdjecie znika na zawsze dla obu stron.
alter table public.messages add column if not exists view_once boolean not null default false;
alter table public.messages add column if not exists viewed_at timestamptz;

-- Rozszerzenie triggera pilnujacego kto co moze zmienic w wiadomosci:
-- odbiorca smie ustawic teraz TAKZE viewed_at (obok read_at), a viewed_at
-- jest niezmienny po ustawieniu (nie da sie "odpalic" zdjecia po raz drugi).
create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_sender boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.viewed_at is not null and new.viewed_at is distinct from old.viewed_at then
    raise exception 'message update: viewed_at is immutable once set';
  end if;

  select exists(
    select 1 from profiles p where p.id = old.sender_id and p.user_id = auth.uid()
  ) into v_is_sender;

  if v_is_sender then
    -- Nadawca: wolno zmieniac tylko tresc (edycja), edited_at i deleted_at (cofniecie)
    if (to_jsonb(new) - 'content' - 'edited_at' - 'deleted_at' - 'read_at' - 'viewed_at')
       is distinct from
       (to_jsonb(old) - 'content' - 'edited_at' - 'deleted_at' - 'read_at' - 'viewed_at') then
      raise exception 'message update: only content/edited_at/deleted_at allowed';
    end if;
  else
    -- Odbiorca: potwierdzenie odczytu ORAZ otwarcie zdjecia jednorazowego
    if (to_jsonb(new) - 'read_at' - 'viewed_at') is distinct from (to_jsonb(old) - 'read_at' - 'viewed_at') then
      raise exception 'message update: receiver may only set read_at/viewed_at';
    end if;
  end if;
  return new;
end $$;
