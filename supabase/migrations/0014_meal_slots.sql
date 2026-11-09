-- Comidas del deportista: almuerzo, comida y cena todos los días; desayuno y merienda solo algunos días.
insert into public.nutrition_settings (user_id) select id from auth.users on conflict (user_id) do nothing;
update public.nutrition_settings set
  meal_slots = '{media_manana,comida,cena}',
  optional_slots = '{desayuno,merienda}',
  preferences = coalesce(preferences, 'Hago tres comidas: almuerzo a media mañana en el trabajo, comida y cena. El almuerzo tiene que ser rápido de preparar por la mañana y fácil de comer frío en el trabajo, sin calentar: wrap o bocadillo (un bol de yogur con fruta solo de vez en cuando, porque ya tomo yogur de postre). Después de cenar, y muchas veces después de comer, me gusta acabar con algo dulce: yogur con un poco de granola y un plátano; a veces solo una pieza de fruta. Cocino en batch solo las comidas y la guarnición de las cenas; la ensalada me la preparo el día antes. Desayuno y merienda solo algunos días, sobre todo al volver de correr por la mañana.')
where not ('media_manana' = any(meal_slots)) or optional_slots = '{}';
