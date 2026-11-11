import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePantry, unitWord } from '../src/index.ts';

test('Despensa: unidades frente a peso', () => {
  assert.deepEqual(normalizePantry({ name: 'Huevos camperos', units: 24 }), { mode: 'units', units: 24, packUnits: 24, unitGrams: undefined, unitLabel: 'huevo', liquid: false });
  assert.equal(normalizePantry({ name: 'Atún claro al natural', units: 3, unitGrams: 60 }).unitLabel, 'lata');
  const pasta = normalizePantry({ name: 'Macarrones integrales', units: 1, unitGrams: 500 });   // lo que dejaba el escáner: «1 ud × 500 g»
  assert.deepEqual([pasta.mode, pasta.quantityG, pasta.packageG], ['weight', 500, 500]);
  const arroz = normalizePantry({ name: 'Arroz redondo', units: 2, unitGrams: 1000 });
  assert.deepEqual([arroz.mode, arroz.quantityG, arroz.packageG], ['weight', 2000, 1000]);
  const sobres = normalizePantry({ name: 'Puré de patatas en sobres', units: 1, packUnits: 4, unitGrams: 125 });
  assert.deepEqual([sobres.mode, sobres.units, sobres.packUnits, sobres.unitLabel], ['units', 1, 4, 'sobre']);
  assert.equal(normalizePantry({ name: 'Leche semidesnatada', quantityG: 6000 }).liquid, true);
  assert.equal(normalizePantry({ name: 'Yogur natural', units: 6 }).unitLabel, 'yogur');
  assert.equal(unitWord('lata', 3), 'latas'); assert.equal(unitWord('huevo', 1), 'huevo'); assert.equal(unitWord('unidad', 2), 'unidades');
});
