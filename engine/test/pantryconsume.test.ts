import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consume, nameMatches } from '../src/index.ts';

test('Descontar por nombre (productos escaneados) y por unidades sin peso', () => {
  const pantry = [
    { id: 'a', name: 'Arroz basmati Hacendado', foodId: 'off_1', location: 'despensa' as const, quantityG: 800 },
    { id: 'b', name: 'Atún claro al natural', location: 'despensa' as const, units: 6, unitGrams: 60, foodId: 'off_2' },
    { id: 'c', name: 'Puré de patatas copos', location: 'despensa' as const, units: 2 },
  ];
  const r = consume(pantry, [{ foodId: 'usda_rice', name: 'arroz blanco', grams: 150, role: 'carb' }, { foodId: 'usda_tuna', name: 'atún al natural', grams: 120, role: 'protein' }, { foodId: 'x', name: 'puré de patatas', grams: 60, role: 'carb' }, { foodId: 'y', name: 'salmón', grams: 100, role: 'protein' }]);
  assert.equal(r.pantry.find((p) => p.id === 'a')!.quantityG, 650);
  assert.equal(r.pantry.find((p) => p.id === 'b')!.units, 4);
  assert.equal(r.pantry.find((p) => p.id === 'c')!.units, 1);
  assert.deepEqual(r.missing, [{ name: 'salmón', grams: 100 }]);
  assert.equal(r.changes.length, 3);
  assert.ok(nameMatches('lentejas cocidas', 'Lentejas cocidas Hacendado'));
  assert.ok(!nameMatches('leche', 'Chocolate con leche'));
});
