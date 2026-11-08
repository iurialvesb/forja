-- Packs (caja de sobres, latas, docena de huecos): cuántas unidades traía el envase para ver las que quedan.
alter table public.pantry_items add column if not exists pack_units smallint;
