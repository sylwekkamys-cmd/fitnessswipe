-- Czat grupowy wyzwan: wiadomosci nie dochodzily na zywo, bo challenge_messages
-- nigdy nie trafilo do publikacji realtime (messages z czatu 1:1 tam jest,
-- stad roznica w dzialaniu). Subskrypcja postgres_changes bez publikacji
-- po prostu milczy — uczestnicy widzieli wiadomosci dopiero po ponownym
-- otwarciu czatu.
alter publication supabase_realtime add table public.challenge_messages;
