-- Alimentos de diario para el registro instantáneo de comidas (engine/src/foods.ts).
insert into public.foods (id, name, kcal, protein, carbs, fat, fiber, vit_c_mg, magnesium_mg, unit_grams, source, search_terms) values
  ('canonigos', 'Canónigos', 21, 2, 3.6, 0.4, 1.5, 38, 13, null, 'reference', array['canonigos']::text[]),
  ('lechuga', 'Lechuga', 15, 1.4, 2.9, 0.2, 1.3, 9, 13, null, 'reference', array['lechuga']::text[]),
  ('rucula', 'Rúcula', 25, 2.6, 3.7, 0.7, 1.6, 15, 47, null, 'reference', array['rucula']::text[]),
  ('tortilla_trigo', 'Tortilla de trigo (wrap)', 312, 8.3, 51.6, 8, 3.5, 0, 22, 40, 'reference', array['tortilla', 'de', 'trigo', 'wrap', 'tortilla de trigo (wrap)']::text[]),
  ('wrap_avena_hacendado', 'Wrap de avena Hacendado', 287, 15, 40, 6, 5, 0, 60, 40, 'estimate', array['wrap', 'de', 'avena', 'hacendado', 'wrap de avena hacendado']::text[]),
  ('pan_blanco', 'Pan blanco', 265, 9, 49, 3.2, 2.7, 0, 25, 30, 'reference', array['pan', 'blanco', 'pan blanco']::text[]),
  ('arroz_blanco_cocido', 'Arroz blanco cocido', 130, 2.7, 28.2, 0.3, 0.4, 0, 12, null, 'reference', array['arroz', 'blanco', 'cocido', 'arroz blanco cocido']::text[]),
  ('pasta_cocida', 'Pasta cocida', 158, 5.8, 30.9, 0.9, 1.8, 0, 18, null, 'reference', array['pasta', 'cocida', 'pasta cocida']::text[]),
  ('jamon_serrano', 'Jamón serrano', 241, 31, 0, 13, 0, 0, 20, 15, 'reference', array['jamon', 'serrano', 'jamon serrano']::text[]),
  ('pavo_fiambre', 'Fiambre de pavo', 104, 17, 4, 2, 0, 0, 20, 15, 'reference', array['fiambre', 'de', 'pavo', 'fiambre de pavo']::text[]),
  ('queso_curado', 'Queso curado', 390, 25, 1, 32, 0, 0, 30, 25, 'reference', array['queso', 'curado', 'queso curado']::text[]),
  ('leche_entera', 'Leche entera', 61, 3.2, 4.8, 3.3, 0, 0, 10, null, 'reference', array['leche', 'entera', 'leche entera']::text[]),
  ('cafe', 'Café solo', 2, 0.1, 0, 0, 0, 0, 3, null, 'reference', array['cafe', 'solo', 'cafe solo']::text[]),
  ('miel', 'Miel', 304, 0.3, 82, 0, 0.2, 0.5, 2, null, 'reference', array['miel']::text[]),
  ('granola', 'Granola', 471, 10, 64, 20, 7, 1, 100, null, 'reference', array['granola']::text[]),
  ('atun_lata_aceite', 'Atún en aceite (lata, escurrido)', 198, 29, 0, 8, 0, 0, 31, null, 'reference', array['atun', 'en', 'aceite', 'lata', 'escurrido', 'atun en aceite (lata, escurrido)']::text[]),
  ('pera', 'Pera', 57, 0.4, 15, 0.1, 3.1, 4, 7, null, 'reference', array['pera']::text[]),
  ('pepino', 'Pepino', 15, 0.7, 3.6, 0.1, 0.5, 3, 13, null, 'reference', array['pepino']::text[]),
  ('zanahoria', 'Zanahoria', 41, 0.9, 9.6, 0.2, 2.8, 6, 12, null, 'reference', array['zanahoria']::text[]),
  ('champinones', 'Champiñones', 22, 3.1, 3.3, 0.3, 1, 2, 9, null, 'reference', array['champinones']::text[])
on conflict (id) do nothing;
