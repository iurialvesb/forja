-- Temperatura de muñeca durante el sueño (°C: valor absoluto o desviación, según lo que mande el Atajo), del Atajo de Apple Salud.
alter table public.sleep_nights add column if not exists wrist_temp_c numeric(5,2);
