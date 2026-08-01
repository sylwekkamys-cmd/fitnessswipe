-- Motyw rozmowy (styl Messengera): wspolny dla obu stron, zapisany na matchu.
-- Dotad matches mialo tylko polityke SELECT — dokladamy UPDATE dla uczestnikow
-- (potrzebne do zmiany motywu).
alter table public.matches add column if not exists chat_theme text;

create policy matches_update_own on public.matches
  for update using (
    auth.uid() = (select user_id from public.profiles where id = matches.profile_a_id)
    or auth.uid() = (select user_id from public.profiles where id = matches.profile_b_id)
  );
