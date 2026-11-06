import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectedShoppingList, boughtToPantry, aisleFor, rebalanceDay, dayTarget, adherence, scaleMeal, mealMacros, REFERENCE_FOODS, type PlannedMeal, type PantryItem, type FoodIndex } from '../src/index.ts';

const foods: FoodIndex = Object.fromEntries(REFERENCE_FOODS.map((f) => [f.id, f]));
const m = (date: string, slot: PlannedMeal['slot'], ing: [string, number, PlannedMeal['ingredients'][0]['role']][], status: PlannedMeal['status'] = 'planned'): PlannedMeal =>
  ({ id: `${date}-${slot}`, date, slot, title: slot, status, ingredients: ing.map(([foodId, grams, role]) => ({ foodId, name: foods[foodId].name, grams, role })) });

test('compra de la semana que viene = lo que comerás − (stock − lo que aún gastas esta semana), con caducidades', () => {
  const pantry: PantryItem[] = [
    { id: '1', name: 'Pechuga de pollo', foodId: 'pechuga_pollo', location: 'congelador', quantityG: 1000 },
    { id: '2', name: 'Arroz blanco', foodId: 'arroz_blanco', location: 'despensa', quantityG: 1000 },
    { id: '3', name: 'Yogur griego 0 %', foodId: 'yogur_griego_0', location: 'nevera', quantityG: 500, expiresOn: '2026-11-10' },
  ];
  const remaining = [m('2026-11-07', 'comida', [['pechuga_pollo', 400, 'protein'], ['arroz_blanco', 200, 'carb']]), m('2026-11-07', 'cena', [['pechuga_pollo', 999, 'protein']], 'eaten')];
  const next = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].flatMap((d) => [
    m(d, 'comida', [['pechuga_pollo', 200, 'protein'], ['arroz_blanco', 100, 'carb'], ['brocoli', 150, 'veg']]),
    m(d, 'merienda', [['yogur_griego_0', 200, 'dairy']]),
  ]);
  const r = projectedShoppingList({ pantry, remainingThisWeek: remaining, meals: next, foods, shoppingDate: '2026-11-08' });
  const by = Object.fromEntries(r.items.map((i) => [i.foodId, i]));
  assert.equal(by.pechuga_pollo.haveG, 600);              // 1000 − 400 que comes mañana (lo ya comido no cuenta)
  assert.equal(by.pechuga_pollo.buyG, 450);               // 1000 × 1,05 − 600 = 450
  assert.equal(by.arroz_blanco, undefined);               // 800 g en casa cubren 525
  assert.equal(by.yogur_griego_0.haveG, 500);             // caduca el 10, se usa desde el 9: cuenta
  assert.equal(by.brocoli.aisle, 'Frutería y verdulería');
  assert.match(by.pechuga_pollo.note ?? '', /congela/i);
  assert.ok(r.coveredByStock.some((c) => c.name === 'Arroz blanco (crudo)'));
  const caducado = projectedShoppingList({ pantry: [{ ...pantry[2], expiresOn: '2026-11-08' }], remainingThisWeek: [], meals: next, foods, shoppingDate: '2026-11-08' });
  assert.equal(caducado.items.find((i) => i.foodId === 'yogur_griego_0')!.haveG, 0);
  const bought = boughtToPantry(r.items, '2026-11-08');
  assert.deepEqual(bought.filter((p) => p.foodId === 'pechuga_pollo').map((p) => p.location), ['nevera', 'congelador']);
  assert.equal(bought.filter((p) => p.foodId === 'pechuga_pollo').reduce((a, p) => a + (p.quantityG ?? 0), 0), 450);
  assert.equal(aisleFor('Huevos camperos'), 'Lácteos y huevos');
});

test('chequeo del día: comí más en la comida → te dice qué bajar en la cena; comí la mitad → escala y reajusta', () => {
  const target = dayTarget({ date: '2026-11-10', settings: { mode: 'definicion', mealSlots: ['desayuno', 'comida', 'cena'], heightCm: 178, ageYears: 32 }, profile: { sex: 'male', weightKg: 78 }, sessions: [] });
  const base = [
    m('2026-11-10', 'desayuno', [['avena', 60, 'carb'], ['leche_semi', 250, 'dairy']], 'eaten'),
    m('2026-11-10', 'comida', [['pechuga_pollo', 300, 'protein'], ['arroz_blanco', 180, 'carb'], ['aceite_oliva', 25, 'fat']], 'edited'),
    m('2026-11-10', 'cena', [['salmon', 180, 'protein'], ['patata', 300, 'carb'], ['aceite_oliva', 15, 'fat'], ['brocoli', 150, 'veg']]),
  ];
  const r = rebalanceDay({ date: '2026-11-10', target, meals: base, foods });
  const adj = r.adjustments.find((a) => a.slot === 'cena');
  assert.ok(adj && adj.changes.some((c) => c.toG < c.fromG), JSON.stringify(r.adjustments));
  assert.match(adj!.text, /baja/);
  const half = scaleMeal(base[2], 0.5);
  assert.equal(half.ingredients[0].grams, 90);
  assert.ok(Math.abs(mealMacros(half, foods).kcal - mealMacros(base[2], foods).kcal / 2) < 5);
  const a = adherence({ meals: r.meals, totals: r.totals, target: target.macros });
  assert.ok(a.score > 0 && a.score <= 100 && a.mealsDone === 1);
});

test('compensación semanal suave, nunca en días duros', () => {
  const st = { mode: 'mantenimiento' as const, mealSlots: ['comida' as const], heightCm: 178, ageYears: 32 };
  const base = dayTarget({ date: 'x', settings: st, profile: { sex: 'male', weightKg: 78 }, sessions: [] });
  const comp = dayTarget({ date: 'x', settings: st, profile: { sex: 'male', weightKg: 78 }, sessions: [], kcalAdjust: -200 });
  assert.ok(Math.abs(base.macros.kcal - comp.macros.kcal - 200) < 3);
});
