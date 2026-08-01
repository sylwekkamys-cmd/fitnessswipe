-- Organizator ogloszenia moze usuwac uczestnikow (ochrona przed spamem).
-- Dotychczas kazdy mogl usunac tylko wlasny zapis.
drop policy if exists squad_members_kick on squad_members;
create policy squad_members_kick on squad_members for delete using (
  auth.uid() in (
    select p.user_id from profiles p
    join squads s on s.creator_id = p.id
    where s.id = squad_id
  )
);
