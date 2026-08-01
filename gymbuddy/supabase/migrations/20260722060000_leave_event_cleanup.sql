-- Opuszczenie wydarzenia: gdy odchodzi ostatni uczestnik, wydarzenie znika cale
-- (bez tego zostaje "duch" sugerujacy, ze ktos nadal bierze udzial —
-- widoczny tez w chipie "X ekip sie wybiera" przy duzych eventach)

create or replace function public.leave_sports_event(p_event_id uuid, p_profile_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_remaining int;
begin
  -- Tylko wlasciciel profilu moze opuscic w swoim imieniu
  if not exists (select 1 from profiles where id = p_profile_id and user_id = auth.uid()) then
    return json_build_object('success', false, 'error', 'forbidden');
  end if;

  delete from event_attendees
  where event_id = p_event_id and profile_id = p_profile_id;

  select count(*) into v_remaining from event_attendees where event_id = p_event_id;

  if v_remaining = 0 then
    delete from sports_events where id = p_event_id;
    return json_build_object('success', true, 'event_deleted', true);
  end if;

  return json_build_object('success', true, 'event_deleted', false);
end;
$$;
