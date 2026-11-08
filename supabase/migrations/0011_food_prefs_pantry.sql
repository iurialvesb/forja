-- Preferencias de comida, huecos opcionales y despensa con productos reales (código de barras, marca y foto).
alter table public.nutrition_settings
  add column if not exists optional_slots text[] not null default '{}',
  add column if not exists preferences text;

alter table public.pantry_items
  add column if not exists barcode text,
  add column if not exists brand text,
  add column if not exists image_url text;

alter table public.foods
  add column if not exists brand text,
  add column if not exists image_url text,
  add column if not exists package_g numeric;

-- Lo que ha contado el deportista (app personal de un solo usuario): almuerzo, comida y cena fijos; desayuno y merienda
-- opcionales (días de correr por la mañana); postre habitual de yogur con granola y plátano.
update public.nutrition_settings set
  meal_slots = '{media_manana,comida,cena}',
  optional_slots = '{desayuno,merienda}',
  preferences = 'Hago tres comidas: almuerzo a media mañana en el trabajo, comida y cena. El almuerzo tiene que ser rápido de preparar por la mañana y fácil de comer frío en el trabajo, sin calentar: wrap o bocadillo (un bol de yogur con fruta solo de vez en cuando, porque ya tomo yogur de postre). Después de cenar, y muchas veces después de comer, me gusta acabar con algo dulce: yogur con un poco de granola y un plátano; a veces solo una pieza de fruta. Cocino en batch solo las comidas y la guarnición de las cenas; la ensalada me la preparo el día antes. Desayuno solo algunos días, sobre todo al volver de correr por la mañana.'
where preferences is null;
