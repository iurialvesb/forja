// Generado por scripts/build-web-engine.mjs desde engine/src/foods.ts. No editar.
// Alimentos básicos de referencia (valores por 100 g en crudo, USDA SR Legacy, redondeados).
// Se usan como semilla y como respaldo; en producción cada alimento se resuelve contra USDA FoodData Central
// (genéricos) u Open Food Facts (código de barras) y se cachea en la tabla `foods`.

                                           

const F = (id        , name        , kcal        , protein        , carbs        , fat        , fiber        , vitCMg        , magnesiumMg        , unitGrams         )       =>
  ({ id, name, per100: { kcal, protein, carbs, fat, fiber, vitCMg, magnesiumMg }, unitGrams, source: 'reference' });

export const REFERENCE_FOODS         = [
  F('pechuga_pollo', 'Pechuga de pollo', 120, 22.5, 0, 2.6, 0, 0, 28),
  F('muslo_pollo', 'Muslo de pollo sin piel', 119, 19.7, 0, 3.9, 0, 0, 23),
  F('pavo_pechuga', 'Pechuga de pavo', 114, 23.7, 0.1, 1.5, 0, 0, 27),
  F('ternera_magra', 'Ternera magra', 137, 21.5, 0, 5.5, 0, 0, 21),
  F('carne_picada_5', 'Carne picada de vacuno 5 %', 137, 21.4, 0, 5, 0, 0, 21),
  F('salmon', 'Salmón', 208, 20.4, 0, 13.4, 0, 3.9, 27),
  F('merluza', 'Merluza', 86, 18.3, 0, 1.3, 0, 0, 32),
  F('atun_lata_natural', 'Atún al natural (lata)', 116, 25.5, 0, 0.8, 0, 0, 27),
  F('huevo', 'Huevo', 143, 12.6, 0.7, 9.5, 0, 0, 12, 60),
  F('claras', 'Claras de huevo', 52, 10.9, 0.7, 0.2, 0, 0, 11),
  F('yogur_griego_0', 'Yogur griego 0 %', 59, 10.2, 3.6, 0.4, 0, 0, 11, 125),
  F('queso_fresco_batido_0', 'Queso fresco batido 0 %', 46, 8, 3.5, 0.2, 0, 0, 10),
  F('leche_semi', 'Leche semidesnatada', 46, 3.3, 4.8, 1.6, 0, 0.2, 11),
  F('arroz_blanco', 'Arroz blanco (crudo)', 360, 6.6, 79.3, 0.6, 1, 0, 25),
  F('arroz_integral', 'Arroz integral (crudo)', 367, 7.5, 76.2, 3.2, 3.6, 0, 116),
  F('pasta', 'Pasta (cruda)', 371, 13, 74.7, 1.5, 3.2, 0, 53),
  F('avena', 'Copos de avena', 379, 13.2, 67.7, 6.5, 10.1, 0, 138),
  F('pan_integral', 'Pan integral', 252, 12.4, 42.7, 3.5, 6, 0, 76),
  F('patata', 'Patata', 77, 2, 17.5, 0.1, 2.2, 19.7, 23),
  F('boniato', 'Boniato', 86, 1.6, 20.1, 0.1, 3, 2.4, 25),
  F('quinoa', 'Quinoa (cruda)', 368, 14.1, 64.2, 6.1, 7, 0, 197),
  F('lentejas', 'Lentejas (secas)', 352, 24.6, 63.4, 1.1, 10.7, 4.5, 47),
  F('garbanzos_bote', 'Garbanzos cocidos (bote)', 139, 7, 22.5, 2, 6.5, 0.5, 29),
  F('platano', 'Plátano', 89, 1.1, 22.8, 0.3, 2.6, 8.7, 27, 120),
  F('manzana', 'Manzana', 52, 0.3, 13.8, 0.2, 2.4, 4.6, 5, 180),
  F('naranja', 'Naranja', 47, 0.9, 11.8, 0.1, 2.4, 53.2, 10, 150),
  F('kiwi', 'Kiwi', 61, 1.1, 14.7, 0.5, 3, 92.7, 17, 75),
  F('fresas', 'Fresas', 32, 0.7, 7.7, 0.3, 2, 58.8, 13),
  F('brocoli', 'Brócoli', 34, 2.8, 6.6, 0.4, 2.6, 89.2, 21),
  F('espinacas', 'Espinacas', 23, 2.9, 3.6, 0.4, 2.2, 28.1, 79),
  F('pimiento_rojo', 'Pimiento rojo', 31, 1, 6, 0.3, 2.1, 127.7, 12),
  F('tomate', 'Tomate', 18, 0.9, 3.9, 0.2, 1.2, 13.7, 11),
  F('calabacin', 'Calabacín', 17, 1.2, 3.1, 0.3, 1, 17.9, 18),
  F('cebolla', 'Cebolla', 40, 1.1, 9.3, 0.1, 1.7, 7.4, 10),
  F('aceite_oliva', 'Aceite de oliva virgen extra', 884, 0, 0, 100, 0, 0, 0),
  F('aguacate', 'Aguacate', 160, 2, 8.5, 14.7, 6.7, 10, 29),
  F('almendras', 'Almendras', 579, 21.2, 21.6, 49.9, 12.5, 0, 270),
  F('nueces', 'Nueces', 654, 15.2, 13.7, 65.2, 6.7, 1.3, 158),
  F('crema_cacahuete', 'Crema de cacahuete', 588, 25.1, 20, 50.4, 6, 0, 154),
  F('chocolate_85', 'Chocolate negro 85 %', 598, 7.8, 45.9, 42.6, 10.9, 0, 228),
  F('whey', 'Proteína whey (polvo)', 400, 80, 8, 6, 0, 0, 0),
];
