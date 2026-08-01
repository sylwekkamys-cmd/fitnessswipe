-- "Kto Cie polubil": pokazuj tez osoby, ktore kiedys odrzucilem w lewo
-- (ich like wciaz jest aktywny — moge zmienic zdanie). Ukrywaj tylko tych,
-- ktorych juz polubilem (prawo) lub z ktorymi mam match.

create or replace function public.get_who_liked_me(my_id uuid)
returns setof profiles
language plpgsql
security definer
as $$
begin
  return query
  select p.* from profiles p
  inner join swipes s on s.swiper_id = p.id
  where s.swiped_id = my_id
  and s.direction = 'right'
  and not exists (
    select 1 from matches m
    where (m.profile_a_id = my_id and m.profile_b_id = p.id)
    or (m.profile_b_id = my_id and m.profile_a_id = p.id)
  )
  and not exists (
    select 1 from swipes s2
    where s2.swiper_id = my_id
    and s2.swiped_id = p.id
    and s2.direction = 'right'
  );
end;
$$;
