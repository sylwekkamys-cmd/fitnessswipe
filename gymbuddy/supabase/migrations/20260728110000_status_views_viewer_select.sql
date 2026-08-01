-- Pasek relacji: widz musi widziec WLASNE wpisy obejrzen (szary pierscien = obejrzana).
-- Dotychczasowa polityka pozwalala czytac tylko wlascicielowi relacji.
create policy "viewer reads own status views" on status_views for select
  using (exists (select 1 from profiles p where p.id = viewer_id and p.user_id = auth.uid()));
