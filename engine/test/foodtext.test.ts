import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFoodText, matchFood, REFERENCE_FOODS } from '../src/index.ts';

const cat = REFERENCE_FOODS.map((f) => ({ id: f.id, name: f.name, source: f.source }));
const ids = (t: string) => { const r = parseFoodText(t); return { slot: r.slot, items: r.items.map((i) => [matchFood(i.name, cat, i.brand, i.cooked)?.id ?? null, i.grams]) }; };

test('Comida dictada → alimentos y gramos al instante, sin IA', () => {
  assert.deepEqual(ids('wrap de avena de hacendado, canonigos, un huevo revuelto y medio aguacate como almuerzo'),
    { slot: 'media_manana', items: [['wrap_avena_hacendado', 40], ['canonigos', 40], ['huevo', 60], ['aguacate', 70]] });
  assert.deepEqual(ids('200 g de pollo, 80 g de arroz, una cucharada de aceite y una manzana').items,
    [['pechuga_pollo', 200], ['arroz_blanco', 80], ['aceite_oliva', 10], ['manzana', 180]]);
  assert.deepEqual(ids('dos tostadas de pan con tomate y un café con leche').items, [['pan_integral', 60], ['tomate', 30], ['cafe', 100], ['leche_semi', 100]]);
  assert.deepEqual(ids('una lata de atún de 80 g con 150 g de arroz cocido').items, [['atun_lata_natural', 80], ['arroz_blanco_cocido', 150]]);
  assert.equal(ids('una coca de llanda').items[0][0], null);   // lo desconocido no se inventa: va al servidor
});
