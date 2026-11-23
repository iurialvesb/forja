-- Calabaza (butternut) como alimento de referencia (USDA SR Legacy, por 100 g en crudo).
insert into public.foods (id, name, kcal, protein, carbs, fat, fiber, vit_c_mg, magnesium_mg, unit_grams, source, search_terms) values
  ('calabaza', 'Calabaza', 45, 1, 11.7, 0.1, 2, 21, 34, null, 'reference', array['calabaza', 'calabaza', 'calabaza cacahuete', 'calabaza violin', 'butternut']::text[])
on conflict (id) do nothing;
