-- Filtr kolorystyczny relacji (styl Instagram): identyfikator nakladki tintu
-- renderowanej nad zdjeciem/wideo u ogladajacych ('' = brak).
alter table training_status add column if not exists filter text not null default '';
