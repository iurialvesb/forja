import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayTarget, distribute, fitPortions, rebalanceDay, weekBalance, mealMacros, shoppingList, consume, buildBatchPlan, expiringSoon,
  recommendSupplements, REFERENCE_FOODS, parseIcs, calendarConstraints, classifyEvent, madridToUtc, planWeek, buildMacrocycle, trainingPaces,
  type PlannedSession, type NutritionSettings, type PlannedMeal, type Recipe, type PantryItem, type FoodIndex, type AthleteProfile, type Goal,
} from '../src/index.ts';

const foods: FoodIndex = Object.fromEntries(REFERENCE_FOODS.map((f) => [f.id, f]));
const settings: NutritionSettings = { mode: 'definicion', mealSlots: ['desayuno', 'comida', 'merienda', 'cena'], heightCm: 178, ageYears: 32 };
const profile = { sex: 'male' as const, weightKg: 78 };
const ps = (type: PlannedSession['type'], estMinutes: number, extra: Partial<PlannedSession> = {}): PlannedSession =>
  ({ id: type, date: '2026-11-10', slot: 'pm', type, discipline: 'running', title: type, objective: '', intensity: 'alta', estMinutes, legStress: 2, key: true, steps: [], rationale: '', ...extra });

test('objetivos diarios: más hidratos los días duros, proteína alta en definición, déficit con suelo', () => {
  const rest = dayTarget({ date: '2026-11-08', settings, profile, sessions: [] });
  const hard = dayTarget({ date: '2026-11-10', settings, profile, sessions: [ps('run_intervals', 60), ps('crossfit_box', 60)] });
  assert.equal(rest.load, 'descanso');
  assert.equal(hard.load, 'alta');
  assert.ok(hard.macros.carbs > rest.macros.carbs + 100, `${hard.macros.carbs} vs ${rest.macros.carbs}`);
  assert.ok(Math.abs(rest.macros.protein - 78 * 2.2) < 2);
  assert.ok(rest.macros.kcal < rest.tdee && rest.macros.kcal > 1600, JSON.stringify(rest));
  const kcalFromMacros = hard.macros.protein * 4 + hard.macros.carbs * 4 + hard.macros.fat * 9;
  assert.ok(Math.abs(kcalFromMacros - hard.macros.kcal) < 15);
  const vol = dayTarget({ date: '2026-11-08', settings: { ...settings, mode: 'volumen' }, profile, sessions: [] });
  assert.ok(vol.macros.kcal > rest.tdee);
});

test('carga de hidratos antes de la media maratón aunque estés definiendo', () => {
  const pre = dayTarget({ date: '2027-01-30', settings, profile, sessions: [], raceInDays: 1, raceDistanceM: 21097.5 });
  assert.equal(pre.load, 'precompeticion');
  assert.ok(pre.macros.carbs >= 7 * 78 - 2, String(pre.macros.carbs));
});

test('reparto por comidas suma el total y carga hidratos cerca del entreno', () => {
  const t = { kcal: 2600, protein: 170, carbs: 300, fat: 70 };
  const d = distribute(t, ['desayuno', 'comida', 'merienda', 'cena'], 'pm');
  const sum = (k: 'protein' | 'carbs' | 'fat') => Object.values(d).reduce((a, m) => a + m[k], 0);
  assert.ok(Math.abs(sum('protein') - 170) <= 2 && Math.abs(sum('carbs') - 300) <= 2 && Math.abs(sum('fat') - 70) <= 2);
  assert.ok(d.merienda.carbs / d.merienda.kcal > d.desayuno.carbs / d.desayuno.kcal);
});

test('ajuste de raciones a un objetivo', () => {
  const r = fitPortions([
    { foodId: 'pechuga_pollo', name: 'Pollo', grams: 150, role: 'protein' },
    { foodId: 'arroz_blanco', name: 'Arroz', grams: 80, role: 'carb' },
    { foodId: 'aceite_oliva', name: 'AOVE', grams: 10, role: 'fat' },
    { foodId: 'brocoli', name: 'Brócoli', grams: 150, role: 'veg' },
  ], foods, { kcal: 750, protein: 55, carbs: 90, fat: 18 });
  assert.ok(Math.abs(r.error.protein) <= 5 && Math.abs(r.error.carbs) <= 8 && Math.abs(r.error.fat) <= 4, JSON.stringify(r));
});

const meal = (id: string, slot: PlannedMeal['slot'], ing: [string, number, PlannedMeal['ingredients'][0]['role']][], extra: Partial<PlannedMeal> = {}): PlannedMeal =>
  ({ id, date: '2026-11-10', slot, title: id, status: 'planned', ingredients: ing.map(([foodId, grams, role]) => ({ foodId, name: foods[foodId].name, grams, role })), ...extra });

test('reequilibrio: si la comida fue más grande, la cena se reduce y se avisa si sobra', () => {
  const target = dayTarget({ date: '2026-11-10', settings, profile, sessions: [ps('run_easy', 45)] });
  const meals = [
    meal('des', 'desayuno', [['avena', 60, 'carb'], ['leche_semi', 250, 'dairy'], ['platano', 120, 'fruit']]),
    meal('com', 'comida', [['pechuga_pollo', 250, 'protein'], ['arroz_blanco', 200, 'carb'], ['aceite_oliva', 25, 'fat']], { status: 'edited' }),
    meal('mer', 'merienda', [['yogur_griego_0', 250, 'dairy'], ['nueces', 20, 'fat']]),
    meal('cen', 'cena', [['salmon', 150, 'protein'], ['patata', 200, 'carb'], ['brocoli', 150, 'veg']]),
  ];
  const before = mealMacros(meals[3], foods);
  const r = rebalanceDay({ date: '2026-11-10', target, meals, foods });
  const after = mealMacros(r.meals.find((m) => m.id === 'cen')!, foods);
  assert.ok(after.kcal < before.kcal, `${after.kcal} < ${before.kcal}`);
  assert.equal(r.meals.find((m) => m.id === 'com')!.ingredients[1].grams, 200);   // lo editado no se toca
  const lowP = rebalanceDay({ date: '2026-11-10', target, foods, meals: [meal('x', 'comida', [['arroz_blanco', 150, 'carb']], { status: 'eaten' })] });
  assert.ok(lowP.alerts.some((a) => /proteína/.test(a.message)), JSON.stringify(lowP.alerts));
  const wb = weekBalance([{ date: 'a', target: target.macros, totals: { ...target.macros, kcal: target.macros.kcal + 600 }, past: true }, { date: 'b', target: target.macros, totals: target.macros, past: false }]);
  assert.ok(wb.message && wb.deltaKcal === 600);
});

test('despensa: consumo por caducidad, lista de la compra y caducados pronto', () => {
  const pantry: PantryItem[] = [
    { id: '1', name: 'Pollo', foodId: 'pechuga_pollo', location: 'congelador', quantityG: 1000 },
    { id: '2', name: 'Pollo', foodId: 'pechuga_pollo', location: 'nevera', quantityG: 400, expiresOn: '2026-11-09' },
    { id: '3', name: 'Arroz', foodId: 'arroz_blanco', location: 'despensa', quantityG: 300 },
  ];
  const c = consume(pantry, [{ foodId: 'pechuga_pollo', name: 'Pollo', grams: 500, role: 'protein' }]);
  assert.equal(c.pantry.find((p) => p.id === '2'), undefined);
  assert.equal(c.pantry.find((p) => p.id === '1')!.quantityG, 900);
  const sl = shoppingList([{ ingredients: [{ foodId: 'arroz_blanco', name: 'Arroz', grams: 700, role: 'carb' }, { foodId: 'brocoli', name: 'Brócoli', grams: 300, role: 'veg' }] }], pantry);
  assert.deepEqual(sl.map((l) => [l.name, l.buyG]), [['Arroz', 400], ['Brócoli', 300]]);
  assert.equal(expiringSoon(pantry, '2026-11-07')[0].id, '2');
});

test('batch cooking: tareas en paralelo, táperes y congelación de los días lejanos', () => {
  const recipes: Record<string, Recipe> = {
    pollo_horno: { id: 'pollo_horno', name: 'Pollo al horno con boniato', freezable: true, fridgeDays: 3, ingredients: [],
      steps: [{ text: 'Cortar pollo y boniato', minutes: 10, hands: 'activa' }, { text: 'Hornear 35 min a 200 °C', minutes: 35, hands: 'pasiva', equipment: 'horno' }] },
    arroz: { id: 'arroz', name: 'Arroz', freezable: true, fridgeDays: 4, ingredients: [], steps: [{ text: 'Cocer arroz 18 min', minutes: 18, hands: 'pasiva', equipment: 'fuego' }] },
    ensalada: { id: 'ensalada', name: 'Ensalada de lentejas', freezable: false, fridgeDays: 3, ingredients: [], steps: [{ text: 'Mezclar', minutes: 8, hands: 'activa' }] },
  };
  const ms: PlannedMeal[] = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].flatMap((d, i) => [
    { ...meal(`c${i}`, 'comida', [['pechuga_pollo', 180, 'protein'], ['boniato', 200, 'carb']]), date: d, recipeId: 'pollo_horno', fromBatch: true },
    { ...meal(`e${i}`, 'cena', [['lentejas', 70, 'carb']]), date: d, recipeId: 'ensalada', fromBatch: true },
  ]);
  const plan = buildBatchPlan('2026-11-08', ms, recipes);
  assert.equal(plan.containers.length, 10);
  assert.equal(plan.totals.find((t) => t.recipe.startsWith('Pollo'))!.ingredients[0].grams, 900);
  assert.equal(plan.containers.find((c) => c.date === '2026-11-13' && c.recipe.startsWith('Pollo'))!.storage, 'congelador');
  assert.ok(plan.warnings.some((w) => /Ensalada/.test(w)));
  assert.ok(plan.totalMinutes < 10 + 35 + 8 + 30, String(plan.totalMinutes));
});

test('suplementos: colágeno + vitamina C los días de carga, magnesio si falta en la dieta, límite diario', () => {
  const available = [{ id: 'vitamina_c', name: 'Vitamina C', doseText: '500 mg' }, { id: 'magnesio', name: 'Magnesio', doseText: '300 mg', stock: 4 }, { id: 'colageno', name: 'Colágeno', doseText: '15 g' }];
  const lowMg = Array.from({ length: 7 }, () => ({ kcal: 2400, protein: 160, carbs: 260, fat: 80, vitCMg: 150, magnesiumMg: 220 }));
  const r = recommendSupplements({ available, last7Days: lowMg, daysWithMicros: 7, today: [ps('run_intervals', 60, { startLocal: '19:00' })] });
  const by = Object.fromEntries(r.recs.map((x) => [x.id, x]));
  assert.ok(by.colageno.take && /19:00/.test(by.colageno.when!));
  assert.ok(by.magnesio.take && /220/.test(by.magnesio.reason));
  assert.ok(by.vitamina_c.take);
  assert.ok(r.notes.some((n) => /4 dosis/.test(n)));
  const rest = recommendSupplements({ available, last7Days: lowMg.map((d) => ({ ...d, magnesiumMg: 400 })), daysWithMicros: 7, today: [], maxPerDay: 1 });
  assert.equal(rest.recs.filter((x) => x.take).length, 0);
  const limited = recommendSupplements({ available, last7Days: lowMg, daysWithMicros: 7, today: [ps('crossfit_box', 60)], maxPerDay: 2 });
  assert.equal(limited.recs.filter((x) => x.take).length, 2);
});

const ICS = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:wb-1\r\nSUMMARY:CrossFit - Box Castelló\r\nDTSTART;TZID=Europe/Madrid:20261110T190000\r\nDTEND;TZID=Europe/Madrid:20261110T200000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:wb-2\r\nSUMMARY:WOD\r\nDTSTART:20261112T070000Z\r\nDTEND:20261112T080000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:Feria Cevisama\r\nDTSTART;VALUE=DATE:20261113\r\nDTEND;VALUE=DATE:20261114\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:y\r\nSUMMARY:Reunión clientes\r\n  zona norte\r\nDTSTART;TZID=Europe/Madrid:20261111T150000\r\nDTEND;TZID=Europe/Madrid:20261111T213000\r\nEND:VEVENT\r\nEND:VCALENDAR`;

test('calendario: ICS de WodBuster → clases fijas; eventos ocupados bloquean franjas', () => {
  assert.equal(madridToUtc(2026, 11, 10, 19, 0), '2026-11-10T18:00:00.000Z');
  assert.equal(madridToUtc(2026, 7, 10, 19, 0), '2026-07-10T17:00:00.000Z');
  const ev = parseIcs(ICS, 'WodBuster');
  assert.equal(ev.length, 4);
  assert.equal(ev[3].title, 'Reunión clientes zona norte');
  assert.equal(classifyEvent({ ...ev[3], calendar: 'Trabajo' }), 'busy');
  const c = calendarConstraints(ev.map((e) => (e.uid === 'y' || e.uid === 'x' ? { ...e, calendar: 'Trabajo' } : e)), '2026-11-09', '2026-11-15');
  assert.deepEqual(c.fixed.map((f) => [f.date, f.slot, f.startLocal]), [['2026-11-10', 'pm', '19:00'], ['2026-11-12', 'am', '08:00']]);
  assert.equal(c.overrides['2026-11-13'].maxMinutes, 0);
  assert.equal(c.overrides['2026-11-11'].pm, false);
});

test('planificador usa las clases reservadas y respeta los días bloqueados', () => {
  const prof: AthleteProfile = { sex: 'male', weightKg: 78, allowDoubles: true, crossfitPerWeek: 3,
    availability: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ weekday: d, am: true, pm: true, maxMinutes: d >= 6 ? 150 : 90, boxClass: [1, 3, 5].includes(d) })) };
  const goals: Goal[] = [{ id: 'hm', name: 'Media', type: 'half_marathon', date: '2027-01-31', priority: 'A', distanceM: 21097.5 }];
  const c = calendarConstraints(parseIcs(ICS, 'WodBuster').map((e) => (e.uid === 'y' || e.uid === 'x' ? { ...e, calendar: 'Trabajo' } : e)), '2026-11-09', '2026-11-15');
  const w = planWeek({ weekStart: '2026-11-09', profile: prof, goals, phases: buildMacrocycle(goals, '2026-11-05'), history: [], paces: trainingPaces(48), zones: null, lifts: {}, fixed: c.fixed, overrides: c.overrides });
  const cf = w.sessions.filter((s) => s.type === 'crossfit_box');
  assert.deepEqual(cf.map((s) => [s.date, s.startLocal]), [['2026-11-10', '19:00'], ['2026-11-12', '08:00']]);
  assert.ok(!w.sessions.some((s) => s.date === '2026-11-13'), 'día de feria sin sesiones');
  assert.ok(!w.sessions.some((s) => s.date === '2026-11-11' && s.slot === 'pm'));
  assert.ok(!w.sessions.some((s) => s.date === '2026-11-13' || (s.date === '2026-11-11' && s.key && s.date === '2026-11-10')));
});
