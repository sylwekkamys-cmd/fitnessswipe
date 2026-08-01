-- Kroki na profilu (opcjonalne): uzytkownik sam decyduje przelacznikiem
-- show_steps, czy jego dzisiejsze kroki maja byc widoczne dla innych.
-- steps_today odswieza heartbeat aplikacji (tylko przy wlaczonym show_steps);
-- steps_date pozwala odsiac wczorajsze wartosci u ogladajacych.
alter table public.profiles add column if not exists show_steps boolean not null default false;
alter table public.profiles add column if not exists steps_today int;
alter table public.profiles add column if not exists steps_date date;
