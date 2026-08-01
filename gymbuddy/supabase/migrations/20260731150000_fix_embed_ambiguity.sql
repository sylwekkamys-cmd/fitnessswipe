-- Naprawa dla STARYCH buildow (30/14): ich zapytanie o czat grupowy osadza
-- 'profiles(...)' bez wskazania relacji. FK challenge_message_reactions.profile_id
-- -> profiles stworzyl druga sciezke challenge_messages<->profiles i PostgREST
-- odrzucal zapytanie (PGRST201) — pusty czat u testerow na buildach sklepowych.
-- Zdejmujemy ten FK (niejednoznacznosc znika, stare buildy dzialaja od reki),
-- a sprzatanie reakcji po usunieciu profilu przejmuje trigger.
alter table public.challenge_message_reactions
  drop constraint if exists challenge_message_reactions_profile_id_fkey;

create or replace function public.cleanup_reactions_on_profile_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.challenge_message_reactions where profile_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_challenge_reactions on public.profiles;
create trigger trg_cleanup_challenge_reactions
  before delete on public.profiles
  for each row execute function public.cleanup_reactions_on_profile_delete();
