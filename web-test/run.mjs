// Prueba la web app en Chrome (viewport de iPhone) con un backend simulado generado con el motor real.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as E from '../engine/src/index.ts';

const ROOT = path.resolve('web'); const OUT = path.resolve('web-test/shots'); mkdirSync(OUT, { recursive: true });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const mon = E.mondayOf(today);
const profile = { sex: 'male', weightKg: 78, hrRest: 52, hrMax: 192, allowDoubles: true, crossfitPerWeek: 3, hyroxDivision: 'open_men',
  availability: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ weekday: d, am: d >= 6, pm: d <= 5, maxMinutes: d >= 6 ? 120 : 75, boxClass: [1, 3, 5].includes(d) })) };
const goals = [{ id: 'g1', name: 'Media Maratón de Castellón', type: 'half_marathon', date: '2027-01-31', priority: 'A', distanceM: 21097.5, target_time_s: 5400 }, { id: 'g2', name: 'HYROX', type: 'hyrox', date: '2027-04-16', priority: 'A', target_time_s: 4800 }];
const phases = E.buildMacrocycle(goals, today);
const paces = E.trainingPaces(47);
const plan = [0, 7].flatMap((o) => E.planWeek({ weekStart: E.addDays(mon, o), profile, goals, phases, history: [], paces, zones: E.hrZones(profile), lifts: {} }).sessions);
const plannedRows = plan.map((p, i) => ({ id: `ps${i}`, date: p.date, slot: p.slot, type: p.type, discipline: p.discipline, title: p.title, objective: p.objective, intensity: p.intensity, est_minutes: p.estMinutes, leg_stress: p.legStress, key: p.key, planned_km: p.plannedKm ?? null, steps: p.steps, rationale: p.rationale, status: 'planned', start_local: p.startLocal ?? null }));
const foods = Object.fromEntries(E.REFERENCE_FOODS.map((f) => [f.id, f]));
const st = { mode: 'definicion', mealSlots: ['desayuno', 'comida', 'merienda', 'cena'], heightCm: 178, ageYears: 32 };
const mk = (date, slot, title, ing, status = 'planned') => ({ id: `${date}-${slot}`, date, slot, title, status, fromBatch: slot === 'comida' || slot === 'cena', ingredients: ing.map(([foodId, grams, role]) => ({ foodId, name: foods[foodId].name, grams, role })) });
const days = [...Array(7)].map((_, i) => {
  const date = E.addDays(mon, i);
  const target = E.dayTarget({ date, settings: st, profile, sessions: plan.filter((p) => p.date === date) });
  const meals = [mk(date, 'desayuno', 'Avena con plátano y yogur', [['avena', 70, 'carb'], ['yogur_griego_0', 200, 'dairy'], ['platano', 120, 'fruit']], date < today ? 'eaten' : date === today ? 'eaten' : 'planned'),
    mk(date, 'comida', 'Pollo al horno con boniato', [['pechuga_pollo', 180, 'protein'], ['boniato', 250, 'carb'], ['aceite_oliva', 10, 'fat'], ['brocoli', 150, 'veg']]),
    mk(date, 'merienda', 'Skyr con nueces', [['queso_fresco_batido_0', 250, 'dairy'], ['nueces', 20, 'fat']]),
    mk(date, 'cena', 'Salmón con patata y espinacas', [['salmon', 160, 'protein'], ['patata', 250, 'carb'], ['espinacas', 120, 'veg']])];
  const r = E.rebalanceDay({ date, target, meals, foods });
  return { date, target, totals: r.totals, eaten: E.ZERO, alerts: r.alerts, adjustments: r.adjustments, adherence: E.adherence({ meals: r.meals, totals: r.totals, target: target.macros }), meals: r.meals.map((m) => ({ ...m, macros: E.mealMacros(m, foods) })) };
});
const pantry = [{ id: 'p1', name: 'Pechuga de pollo', foodId: 'pechuga_pollo', location: 'congelador', quantityG: 600 }, { id: 'p2', name: 'Arroz blanco', foodId: 'arroz_blanco', location: 'despensa', quantityG: 1000 }, { id: 'p3', name: 'Yogur griego 0 %', foodId: 'yogur_griego_0', location: 'nevera', quantityG: 500, expiresOn: E.addDays(today, 2) }];
const shopping = E.projectedShoppingList({ pantry, remainingThisWeek: [], meals: days.flatMap((d) => d.meals), foods, shoppingDate: today });
const batch = E.buildBatchPlan(E.addDays(mon, -1), days.flatMap((d) => d.meals).map((m) => ({ ...m, recipeId: m.slot === 'comida' ? 'r1' : m.slot === 'cena' ? 'r2' : undefined })), {
  r1: { id: 'r1', name: 'Pollo al horno con boniato', ingredients: [], fridgeDays: 3, freezable: true, steps: [{ text: 'Cortar pollo y boniato', minutes: 10, hands: 'activa' }, { text: 'Hornear 35 min a 200 °C', minutes: 35, hands: 'pasiva', equipment: 'horno' }] },
  r2: { id: 'r2', name: 'Salmón con patata', ingredients: [], fridgeDays: 2, freezable: true, steps: [{ text: 'Cocer patata', minutes: 20, hands: 'pasiva', equipment: 'fuego' }, { text: 'Salmón a la plancha', minutes: 8, hands: 'activa', equipment: 'fuego' }] } });
const supp = E.recommendSupplements({ available: [{ id: 'colageno', name: 'Colágeno', doseText: '15 g' }, { id: 'vitamina_c', name: 'Vitamina C', doseText: '500 mg' }, { id: 'magnesio', name: 'Magnesio', doseText: '300 mg', stock: 4 }], last7Days: Array(7).fill({ kcal: 2300, protein: 170, carbs: 240, fat: 70, vitCMg: 140, magnesiumMg: 250 }), daysWithMicros: 7, today: plan.filter((p) => p.date === today) });
const sessions = [{ id: 's1', started_at: `${E.addDays(today, -1)}T17:02:00Z`, duration_s: 3540, discipline: 'crossfit', title: 'Afternoon Workout', distance_m: null, avg_hr: 148, rpe: 8, primary_source: 'healthkit', internal_load: 472, leg_index: 310 },
  { id: 's2', started_at: `${E.addDays(today, -2)}T07:00:00Z`, duration_s: 2900, discipline: 'running', title: 'Carrera', distance_m: 9100, avg_hr: 151, primary_source: 'healthkit' }];

const parseText = (() => { const p = E.parseWorkoutText(`Afternoon Workout\n\nFERZA\nEMOM 10’\n- 6 FRONT SQUATS @ 50 kg\n- 15 HEELS ON PLATE 16KG GOBLET SQUATS\n\nWOD\nEMOM 24’ (4R)\n- 16 CAL ROW\n- 20 DEAD LIFT 50kg\n- 10 BURPEES OVER BAR\n- REST.\n- REST\n- REST.`); return { parsed: p, summary: E.describeParsed(p), questions: E.collectQuestions(p, { sex: 'male' }), engine: 'motor', candidates: [{ id: 's1', startedAt: sessions[0].started_at, minutes: 59, title: 'Entrenamiento funcional', avgHr: 148, source: 'healthkit' }] }; })();

const REST = {
  profiles: [{ id: 'u1', display_name: 'Iuri', birth_date: '1994-05-01', sex: 'male', height_cm: 178, allow_doubles: true, crossfit_per_week: 3, hyrox_division: 'open_men', sleep_need_h: 7.5 }],
  readiness_daily: [{ date: today, score: 71, level: 'verde', reasons: ['Fatiga de piernas moderada', 'HRV en tu rango alto'], acwr: 1.08, leg_fatigue: 165 }],
  planned_sessions: plannedRows, goals: goals.map((g) => ({ ...g, distance_m: g.distanceM })), phases: phases.map((p, i) => ({ id: `ph${i}`, goal_id: p.goalId, kind: p.kind, start_date: p.start, end_date: p.end, focus: p.focus })),
  sessions, plan_changes: [{ id: 'c1', action: 'downgrade', reason: 'Fatiga de piernas alta (310 sobre umbral 250): el martes cambio las series por un rodaje suave de 7 km.', created_at: new Date().toISOString() }],
  pantry_items: [...pantry.map((p) => ({ id: p.id, name: p.name, food_id: p.foodId, location: p.location, quantity_g: p.quantityG, expires_on: p.expiresOn ?? null })), { id: 'pk1', name: 'Puré de patatas copos', brand: 'Hacendado', food_id: 'x', location: 'despensa', units: 2, pack_units: 4, unit_grams: 115 }, { id: 'pk2', name: 'Yogur natural', brand: 'Hacendado', food_id: 'x', location: 'despensa', units: 5, pack_units: 6, unit_grams: 125, expires_on: E.addDays(today, 1) }],
  supplements: [{ id: 'sp1', kind: 'colageno', name: 'Colágeno', dose_text: '15 g', stock: 20 }, { id: 'sp2', kind: 'magnesio', name: 'Magnesio', dose_text: '300 mg', stock: 4 }],
  consents: [{ kind: 'ai_processing' }], recipes: [{ id: 'r1', name: 'Pollo al horno con boniato', tags: ['batch'] }],
  personal_records: [{ id: 'pr1', metric: 'front_squat:6rm', value: 50, unit: 'kg', kind: 'actual', achieved_on: E.addDays(today, -1), detail: 'Front Squat 50 kg × 6' }],
};
const FN = {
  'nutrition-day': { settings: { mode: 'definicion', mealSlots: st.mealSlots, optionalSlots: ['desayuno', 'merienda'] }, days, balance: E.weekBalance(days.map((d) => ({ date: d.date, target: d.target.macros, totals: d.totals, past: d.date < today }))), supplements: { recs: supp.recs.map((r) => ({ ...r, supplementId: r.id === 'colageno' ? 'sp1' : r.id === 'magnesio' ? 'sp2' : undefined })), notes: supp.notes, week: E.weeklySupplementPlan({ available: [{ id: 'creatina', name: 'Creatina', doseText: '5 g' }, { id: 'colageno', name: 'Colágeno', doseText: '10 g' }, { id: 'vitamina_c', name: 'Vitamina C', doseText: '500 mg' }, { id: 'aminoacidos', name: 'Aminoácidos', doseText: '10 g' }], days: [...Array(7)].map((_, i) => ({ date: E.addDays(today, i), sessions: plannedRows.filter((x) => x.date === E.addDays(today, i)).map((x) => ({ ...x, estMinutes: x.est_minutes })) })) }), missing: E.missingSupplements(['colageno', 'vitamina_c'], { date: today }) }, expiringSoon: [], batchPlan: batch, shopping: shopping.items },
  'shopping-list': { weekStart: mon, ...shopping, checked: [], addedToPantry: 4 },
  insights: { running: { vdot: 47, vdotNote: 'Basado en 10 km en 45:10 (competición).', paces, zones: E.hrZones(profile), predictions: E.predictions(47), weeks: [...Array(12)].map((_, i) => ({ week: E.addDays(mon, -7 * (11 - i)), km: [18, 22, 25, 19, 27, 30, 21, 31, 33, 24, 35, 26][i] })), runs: [...Array(12)].map((_, i) => ({ date: E.addDays(today, -7 * (12 - i)), km: 8, paceSecPerKm: 330 - i * 2 })), distribution28d: { low: 0.74, mid: 0.12, high: 0.14, totalS: 40000 } },
    lifts: [{ exerciseId: 'back_squat', name: 'Back Squat', bestActual1RM: { kg: 100, date: '2026-06-01' }, bestE1RM: { kg: 101.3, date: '2026-10-28' }, workingE1RM: { kg: 99.5, basis: 'mejor estimación de las últimas 6 semanas' }, history: [{ date: '2026-09-01', e1rm: 92 }, { date: '2026-10-01', e1rm: 96 }, { date: '2026-10-28', e1rm: 99.5 }], suggestion: { loadKg: 80, explanation: '1RM de trabajo 99,5 kg. 5×5 dejando 2 en reserva ≈ 81 % → 80 kg.' } }],
    fitness: [...Array(60)].map((_, i) => ({ date: E.addDays(today, i - 60), ctl: 40 + i * 0.3, atl: 45 + 10 * Math.sin(i / 4), tsb: 0, acwr: 1 + 0.2 * Math.sin(i / 5) })) },
  'parse-workout-text': parseText,
  pantry: { items: [{ name: 'puré de patatas', brand: 'Hacendado', location: 'despensa', units: 2, queryEn: 'mashed potato flakes' }, { name: 'atún claro al natural', brand: 'Hacendado', location: 'despensa', units: 6, unitGrams: 60, queryEn: 'tuna canned water' }, { name: 'arroz', brand: 'La Fallera', location: 'despensa', quantityG: 1000, queryEn: 'rice white raw' }],
    matches: [{ best: { code: '8480000123', name: 'Copos de puré de patata', brand: 'Hacendado', packageG: 230 }, alternatives: [{ code: '8480000999', name: 'Puré de patatas con leche', brand: 'Hacendado' }] }, { best: { code: '8480000456', name: 'Atún claro al natural pack 6', brand: 'Hacendado' }, alternatives: [] }, { best: null, alternatives: [] }], saved: 3, unresolved: [] },
  coach: { threadId: 't1', reply: 'Mañana tienes series 5×1000 m. Tu fatiga de piernas estimada tras el WOD de hoy es 260 (umbral 250), así que te propongo cambiarlas por un rodaje suave de 7 km a 5:20–5:45/km y mover las series al jueves.', tools: ['estado_hoy', 'plan'] },
};

{ // Paneles de objetivo y resumen semanal (motor real)
  const sess = sessions.map((x) => ({ id: x.id, startedAt: x.started_at, durationS: x.duration_s, discipline: x.discipline, distanceM: x.distance_m != null ? +x.distance_m : undefined }));
  const pl = plannedRows.map((p) => ({ date: p.date, type: p.type, title: p.title, plannedKm: p.planned_km, key: p.key, status: p.status }));
  const recs = [1, 2, 3, 4].flatMap((k) => [{ date: E.addDays(today, -10), sessionId: 'hx', key: `run${k}`, exerciseId: 'run', label: `Carrera ${k}`, splitS: 290 + k * 6 }, { date: E.addDays(today, -10), sessionId: 'hx', key: E.hyroxStations()[k - 1].key, exerciseId: E.hyroxStations()[k - 1].exerciseId, label: `Estación ${k}`, splitS: [300, 210, 290, 330][k - 1] }]);
  FN.goal = (b) => { const g = goals.find((x) => x.id === b.goalId) ?? goals[0]; const goal = { id: g.id, name: g.name, type: g.type, date: g.date, distanceM: g.distanceM, targetTimeS: g.target_time_s };
    return g.type === 'hyrox' ? { goal, outlook: E.hyroxOutlook({ goal, today, vdot: 47, records: recs, sessions: sess, planned: pl, simulations: [{ date: E.addDays(today, -40), totalS: 2700, sessionId: 'a', stations: 4 }, { date: E.addDays(today, -10), totalS: 2560, sessionId: 'hx', stations: 4 }] }), splits: E.hyroxSplits(4800) }
      : { goal, outlook: E.raceOutlook({ goal, today, vdot: 47, sessions: sess, planned: pl }) }; };
  const lastMon = E.addDays(mon, -7);
  FN.weekly = { current: lastMon, reports: [{ week_start: lastMon, text: 'Buena semana: 4 entrenos y 31 km. Te faltó la tirada larga del domingo. Prioridades: tirada de 16 km y proteína en la cena.', seen_at: null, summary: {} }] };
  REST.body_metrics = [...Array(10)].map((_, i) => ({ date: E.addDays(today, -3 * (9 - i)), weight_kg: 80 - i * 0.15, waist_cm: i % 3 === 0 ? 86 - i * 0.2 : null, source: 'manual' }));
  REST.nutrition_settings = [{ user_id: 'u1', mode: 'definicion', rate_kg_per_week: -0.4 }];
  FN.pantry.recipe = { title: 'Tortilla de patata y espinacas', servings: 2, minutes: 20, ingredients: [{ name: 'Huevos', grams: 240, fromPantry: true }, { name: 'Espinacas', grams: 120, fromPantry: true }, { name: 'Patata', grams: 300, fromPantry: true }], steps: ['Cuece la patata en el micro 6 min.', 'Saltea las espinacas.', 'Cuaja con el huevo batido.'], tip: 'Media para la cena y media para el almuerzo de mañana.' };
  FN.pantry.uses = ['Espinacas', 'Huevos'];
}
REST.foods = E.REFERENCE_FOODS.map((f) => ({ id: f.id, name: f.name, kcal: f.per100.kcal, protein: f.per100.protein, carbs: f.per100.carbs, fat: f.per100.fat, unit_grams: f.unitGrams ?? null, source: f.source, brand: null, search_terms: [] }));
FN['nutrition-log'] = (b) => (b.action === 'confirm' ? { logged: { kcal: 512 }, day: null, missingInPantry: [] } : { items: [{ foodId: 'off_1', name: 'Coca de tomate', grams: 150, gramsConfidence: 'estimado', macros: { kcal: 400, protein: 9, carbs: 60, fat: 14 } }], questions: [] });
REST.daily_health = [...Array(40)].map((_, i) => { const d = E.addDays(today, -(39 - i)); const k = Math.sin(i / 3);
  return { date: d, sleep_h: +(7.1 + k * 0.8 - (i % 9 === 0 ? 1.3 : 0)).toFixed(2), sleep_score: Math.round(78 + k * 9), hrv_ms: Math.round(52 + k * 7 + (i % 5) - 2), rhr: Math.round(50 - k * 2), steps: Math.round(9000 + k * 3500 + (i % 4) * 600), avg_sleeping_hr: 49, vo2max: 51.2, spo2: 96.5, respiration: 14.2 }; });
const posted = [];
REST.planned_sessions.push({ id: 'pcf', date: E.addDays(today, -1), slot: 'pm', type: 'crossfit_box', discipline: 'crossfit', title: 'CrossFit (pendiente de reserva)', objective: 'Mantener fuerza', intensity: 'alta', est_minutes: 60, status: 'done', completed_session_id: 's1', steps: [] },
  { id: 'pcf2', date: E.addDays(today, -1), slot: 'am', type: 'run_easy', discipline: 'running', title: 'Rodaje suave', objective: 'Aeróbico', intensity: 'baja', est_minutes: 40, status: 'planned', steps: [] },
  { id: 'pcf3', date: today, slot: 'pm', type: 'crossfit_box', discipline: 'crossfit', title: 'CrossFit (pendiente de reserva)', objective: 'Mantener fuerza', intensity: 'alta', est_minutes: 60, status: 'planned', steps: [] });
// Carrera del Apple Watch recibida de Intervals.icu (sintética), procesada con el motor real.
{ const N = 2900; const t = [...Array(N)].map((_, i) => i); const v = t.map((i) => 1000 / (318 - 10 * Math.sin(i / 400)));
  let d = 0; const dist = t.map((i) => (d += v[i]));
  const st = [{ type: 'time', data: t }, { type: 'distance', data: dist }, { type: 'velocity_smooth', data: v }, { type: 'heartrate', data: t.map((i) => 138 + Math.round(22 * i / N) + Math.round(3 * Math.sin(i / 60))) }, { type: 'cadence', data: t.map(() => 85 + Math.round(Math.random() * 2)) }, { type: 'altitude', data: t.map((i) => 15 + 8 * Math.sin(i / 500)) }, { type: 'latlng', data: t.map((i) => 39.98 + 0.01 * Math.sin(i / 460)), data2: t.map((i) => -0.04 + 0.012 * Math.cos(i / 460)) }];
  const a = E.icuToActivity({ id: 'i9', type: 'Run', name: 'Carrera', start_date: `${E.addDays(today, -2)}T07:00:00Z`, elapsed_time: 2900, moving_time: 2880, distance: Math.round(d), average_heartrate: 151, max_heartrate: 168, average_cadence: 86, total_elevation_gain: 42, total_elevation_loss: 41, calories: 610, average_stride: 1.12, average_speed: 3.16, max_speed: 3.9,
    icu_intervals: [0, 1, 2].map((k) => ({ type: 'WORK', start_time: k * 966, end_time: (k + 1) * 966, distance: 3030, average_heartrate: 145 + k * 6, average_speed: 3.14 })) }, st, { hrRest: 52, hrMax: 192 });
  Object.assign(sessions[1], { moving_s: 2880, cadence_spm: a.session.cadenceSpm, avg_stride_m: 1.12, elevation_gain_m: 42, elevation_loss_m: 41, max_hr: 168, active_kcal: 610, max_speed_mps: 3.9, distance_m: a.session.distanceM });
  REST.session_streams = [{ session_id: 's2', series: a.series, route: a.route, zones: a.zones }];
  REST.run_splits = a.session.splits.map((x) => ({ km_index: x.kmIndex, duration_s: x.durationS, avg_hr: x.avgHr, cadence_spm: x.cadence, elevation_delta_m: x.elevationDeltaM }));
  REST.session_laps = a.laps.map((l) => ({ idx: l.idx, duration_s: l.durationS, distance_m: l.distanceM, avg_hr: l.avgHr, avg_speed_mps: l.avgSpeed }));
  REST.intervals_connections = [{ athlete_id: 'i123456', last_pull_at: new Date().toISOString(), last_error: null }];
  FN['intervals-sync'] = { connected: true, athleteId: 'i123456', lastPullAt: new Date().toISOString(), lastError: null, pending: 0, total: 214, activities: 1, days: 1, remaining: 0, prs: [], changes: [] };
}
REST.session_sets = [...Array(6)].flatMap((_, w) => [1, 2, 3, 4, 5].map((k) => ({ exercise_id: 'front_squat', performed_on: E.addDays(today, -7 * w), reps: k === 5 && w === 0 ? 4 : 6, load_kg: 45 + (5 - w), status: k === 5 && w === 0 ? 'partial' : 'done', set_label: `Min ${k * 2 - 1} · R${k}`, target_reps: 6, session_id: 's1' })));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.route('http://forja.test/**', (route) => {
  let p = new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html';
  if (p === 'js/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.FORJA_CONFIG={SUPABASE_URL:"https://mock.supabase.co",SUPABASE_ANON_KEY:"anon"}' });
  const f = path.join(ROOT, p);
  if (!existsSync(f)) return route.fulfill({ status: 404, body: 'no' });
  const ct = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : p.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html';
  route.fulfill({ contentType: ct, body: readFileSync(f) });
});
await page.route('https://mock.supabase.co/**', (route) => {
  const u = new URL(route.request().url());
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'rest') { const t = parts[2]; let rows = REST[t] ?? [];
    const dq = u.searchParams.get('discipline'); if (dq?.startsWith('in.(') && route.request().method() === 'GET') { const set = dq.slice(4, -1).split(','); rows = rows.filter((r) => set.includes(r.discipline)); } const idq = u.searchParams.get('id'); if (idq?.startsWith('eq.') && route.request().method() === 'GET') rows = rows.filter((r) => r.id === idq.slice(3)); return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) }); }
  if (parts[0] === 'functions' && parts[2] === 'ingest-session') { posted.push(JSON.parse(route.request().postData())); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessionId: 's9', merged: true, prs: ['Front Squat 50 kg × 6'], changes: [] }) }); }
  if (parts[0] === 'functions') { const f = FN[parts[2]]; const b = (() => { try { return JSON.parse(route.request().postData() || '{}'); } catch { return {}; } })(); return route.fulfill({ contentType: f === undefined && parts[2] === 'export-data' ? 'text/csv' : 'application/json', body: JSON.stringify(typeof f === 'function' ? f(b) : f ?? { ok: true, changes: [], processed: 0 }) }); }
  if (parts[0] === 'auth') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_in: 3600, user: { id: 'u1', email: 'iuri@example.com' } }) });
  route.fulfill({ contentType: 'application/json', body: '{}' });
});
// Pantalla de acceso
await page.goto('http://forja.test/index.html');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/00-login.png` });
await page.evaluate(() => localStorage.setItem('forja.session', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'iuri@example.com' } })));
await page.reload(); await page.waitForTimeout(800); if (errors.length) console.log('ERR', errors);
const shot = async (hash, name, fn) => { await page.evaluate(() => { const s = document.getElementById('sheet'); if (!s.hidden) { s.hidden = true; s.innerHTML = ''; } }); await page.goto(`http://forja.test/index.html${hash}`); await page.waitForTimeout(700); if (fn) { await fn(); await page.waitForTimeout(600); } await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }); };
await shot('#/inicio', '01-inicio');
await shot('#/plan', '02-plan');
await shot('#/plan', '02b-plan-ayer', async () => { if (new Date(today + 'T12:00:00Z').getUTCDay() === 1) { await page.getByRole('button', { name: '‹' }).click(); await page.waitForTimeout(500); } const n = new Date(Date.parse(today + 'T12:00:00Z') - 864e5).getUTCDate(); await page.locator('.day', { hasText: String(n).padStart(2, '0') }).first().click(); });
await shot('#/plan', '03-sesion', async () => { if (new Date(today + 'T12:00:00Z').getUTCDay() === 1) { await page.getByRole('button', { name: '›' }).click(); await page.waitForTimeout(500); } await page.locator('.day').first().click(); await page.waitForTimeout(400); await page.locator('#view .card.row').first().click(); });
await shot('#/entrenos', '04-entrenos');
const reopen = async () => { await page.goto('http://forja.test/index.html#/inicio'); await page.waitForTimeout(300); await page.goto('http://forja.test/index.html#/entrenos'); await page.waitForTimeout(700); };
const WOD = `Afternoon Workout\n\nFERZA\nEMOM 10’\n- 6 FRONT SQUATS @ 50 kg\n- 15 HEELS ON PLATE 16KG GOBLET SQUATS\n\nWOD\nEMOM 24’ (4R)\n- 16 CAL ROW\n- 20 DEAD LIFT 50kg\n- 10 BURPEES OVER BAR\n- REST.\n- REST\n- REST.\n\nAMRAP 8\n- 10 wall balls 9kg\n- 10 box jumps`;
await shot('#/entrenos', '05-pegar-wod', async () => { await page.getByText('Pegar entreno (Strava').click(); await page.waitForTimeout(300); await page.fill('#wtext', WOD); await page.waitForTimeout(400); });
await shot('#/entrenos', '05b-registro', async () => {
  await page.getByText('Pegar entreno (Strava').click(); await page.waitForTimeout(300); await page.fill('#wtext', WOD);
  const t0 = Date.now(); await page.getByRole('button', { name: 'Registrar', exact: true }).click(); await page.waitForSelector('#logger'); console.log(`Hoja de registro en ${Date.now() - t0} ms`);
  const cks = page.locator('#logger .ck:not(:has-text("·"))');
  for (let i = 0; i < 9; i++) await cks.nth(i).click();
  const inp = page.locator('#logger input[data-lf="done"]').nth(8); await inp.fill('4');
});
await shot('#/entrenos', '05c-amrap', async () => {
  await reopen(); await page.getByRole('button', { name: 'Seguir' }).click(); await page.waitForSelector('#logger');
  await page.getByRole('button', { name: '+ Ronda' }).click(); await page.getByRole('button', { name: '+ Ronda' }).click();
  await page.locator('#logger button:has-text("Marcar todo como hecho")').nth(2).click();
  await page.locator('#logger input[data-lf="done"]').last().fill('3');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#logger .card')].pop(); b.scrollIntoView(); });
});
await shot('#/entrenos', '05d-estructura', async () => { await reopen(); await page.getByRole('button', { name: 'Seguir' }).click(); await page.waitForSelector('#logger'); await page.getByRole('button', { name: '✎ Estructura' }).first().click(); });
await (async () => {
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button', { name: 'Guardar entreno' }).click(); await page.waitForTimeout(800);
  const b = posted[0]; const s0 = b?.session;
  const ok = s0 && s0.blocks.length === 3 && s0.blocks[0].sets.length === 10 && s0.blocks[0].sets[8].status === 'partial' && s0.blocks[0].sets[8].reps === 4 && s0.blocks[2].resultRounds === 2 && s0.blocks[2].resultReps === 13 && b.attachTo === 's1';
  if (!ok) errors.push(`registro guardado incorrecto: ${JSON.stringify({ attachTo: b?.attachTo, blocks: s0?.blocks?.map((x) => [x.title, x.sets.length, x.resultText]) , s8: s0?.blocks?.[0]?.sets?.[8] })}`);
  else console.log(`Guardado OK: ${s0.blocks.map((x) => `${x.title} ${x.sets.length} series ${x.resultText ?? ''}`).join(' | ')}`);
  const left = await page.evaluate(() => localStorage.getItem('forja:draft'));
  if (left) errors.push('el borrador no se borró tras guardar');
})();
await shot('#/entrenos', '05e-historial-ejercicio', async () => { await page.getByRole('button', { name: 'Progreso' }).click(); await page.waitForTimeout(500); await page.getByText('Historial por ejercicio').click(); });
await shot('#/entrenos', '05f-carrera-watch', async () => { await reopen(); await page.getByRole('button', { name: 'Historial', exact: true }).click(); await page.waitForTimeout(400); await page.locator('#view .card.row').filter({ hasText: 'Carrera' }).first().click(); await page.waitForTimeout(800); });
await page.evaluate(() => { const p = document.querySelector('#sheet .panel'); if (p) p.scrollTop = 900; }); await page.screenshot({ path: `${OUT}/05g-carrera-watch-2.png` });
await page.evaluate(() => { const p = document.querySelector('#sheet .panel'); if (p) p.scrollTop = 2200; }); await page.screenshot({ path: `${OUT}/05h-carrera-watch-3.png` });
await shot('#/entrenos', '05i-anadir-wod', async () => { await reopen(); await page.getByRole('button', { name: 'Historial', exact: true }).click(); await page.waitForTimeout(400); await page.locator('#view .card.row').filter({ hasText: 'Afternoon Workout' }).first().click(); await page.waitForTimeout(800); await page.evaluate(() => { const p = document.querySelector('#sheet .panel'); if (p) p.scrollTop = 9999; }); });
await (async () => {
  posted.length = 0;
  await page.getByRole('button', { name: /Añadir el WOD/ }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Pegar texto/ }).click(); await page.waitForTimeout(300);
  await page.fill('#wtext', 'WOD\n4 rounds\n20 hang clean 30kg\n50 single unders');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click(); await page.waitForSelector('#logger');
  await page.screenshot({ path: `${OUT}/05j-wod-unido.png` });
  await page.getByRole('button', { name: 'Guardar entreno' }).click(); await page.waitForTimeout(800);
  const b = posted[0];
  if (b?.attachTo !== 's1' || b?.edit) errors.push(`añadir WOD al Apple Watch: ${JSON.stringify({ attachTo: b?.attachTo, edit: b?.edit })}`);
  else console.log(`WOD unido a la sesión del Watch: ${b.session.title} · ${b.session.blocks[0].sets.length} series`);
})();
await shot('#/entrenos', '06-progreso', () => page.getByRole('button', { name: 'Progreso' }).click());
await shot('#/nutricion', '07-nutricion-hoy');
await shot('#/nutricion', '08-compra', () => page.getByRole('button', { name: 'Compra', exact: true }).click());
await shot('#/nutricion', '09-batch', () => page.getByRole('button', { name: 'Batch', exact: true }).click());
await shot('#/nutricion', '10-despensa', () => page.getByRole('button', { name: 'Despensa', exact: true }).click());
const patches = [];
page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().includes('pantry_items')) patches.push(r.postData()); });
await shot('#/nutricion', '10a-despensa-arrastrar', async () => {
  await page.getByRole('button', { name: 'Despensa', exact: true }).click(); await page.waitForTimeout(500);
  const h = page.locator('.pitem[data-pid="pk2"] .drag'); const b = await h.boundingBox();
  await h.scrollIntoViewIfNeeded(); const b2 = await h.boundingBox();
  await page.mouse.move(b2.x + 5, b2.y + 5); await page.mouse.down(); await page.mouse.move(60, 60, { steps: 6 });
  for (let k = 0; k < 40; k++) { const t = await page.locator('.ploc[data-loc="nevera"] h2').boundingBox(); if (t.y > 150) break; await page.waitForTimeout(100); }
  const t = await page.locator('.ploc[data-loc="nevera"] h2').boundingBox();
  await page.mouse.move(t.x + 40, t.y + 30, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(500);
  console.log('patches', patches, await page.evaluate(() => [document.querySelectorAll('.pitem').length, !!document.querySelector('.drag-ghost')]));
  if (!patches.some((x) => x.includes('nevera'))) errors.push('arrastrar a nevera no ha actualizado el producto');
  else console.log('Arrastrar entre lugares OK');
});
await shot('#/nutricion', '10b-despensa-anadir', async () => { await page.getByRole('button', { name: 'Despensa', exact: true }).click(); await page.waitForTimeout(400); await page.getByRole('button', { name: '＋ Añadir' }).click(); await page.fill('#ptext', 'dos sobres de puré Hacendado, seis latas de atún de 60 g, un kilo de arroz La Fallera'); await page.getByRole('button', { name: 'Organizar' }).click(); await page.waitForTimeout(900); });
await shot('#/nutricion', '11-suplementos', () => page.getByRole('button', { name: 'Suplementos', exact: true }).click());
await shot('#/coach', '12-coach', async () => { await page.getByText('¿Puedo hacer series mañana').click(); });
await shot('#/perfil', '13-perfil');
await shot('#/perfil', '14b-watch', () => page.getByText('Apple Watch automático').click());
await shot('#/perfil', '14-atajo', () => page.getByText('Apple Salud (Atajo)').click());
await shot('#/inicio', '15-checkin', () => page.locator('#view .card.row').first().click());
await shot('#/nutricion', '16-editar-comida', async () => { await page.getByRole('button', { name: 'Hoy', exact: true }).click(); await page.waitForTimeout(500); await page.getByRole('button', { name: '✎ Cambiar' }).first().click(); });
await shot('#/salud', '25-salud');
await page.evaluate(() => window.scrollTo(0, 900)); await page.screenshot({ path: `${OUT}/25b-salud-abajo.png` });
await shot('#/objetivo/g1', '17-objetivo-media');
await shot('#/objetivo/g2', '18-objetivo-hyrox');
await page.evaluate(() => window.scrollTo(0, 700)); await page.screenshot({ path: `${OUT}/18b-objetivo-hyrox-estaciones.png` });
await shot('#/objetivo/g2', '19-hyrox-registro', async () => { await page.getByRole('button', { name: 'Simulación completa' }).click(); await page.waitForSelector('#logger'); await page.locator('input[data-lf="split"]').first().fill('4:55'); await page.locator('input[data-lf="split"]').nth(1).fill('5:10'); });
await page.evaluate(() => { const p = document.querySelector('#sheet .panel'); if (p) p.scrollTop = 1500; }); await page.screenshot({ path: `${OUT}/19b-hyrox-registro-2.png` });
{ const sum = await page.locator('[id^="hx-"]').first().innerText(); if (!/10:05/.test(sum)) console.log('✗ suma HYROX', sum); else console.log('Suma de parciales HYROX OK:', sum); }
await page.getByRole('button', { name: '⏱' }).first().click(); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/20-temporizador.png` });
// Cronómetro por tramos: 16 «Siguiente tramo» de 5:00 → la suma de parciales debe dar 1:20:00.
await page.evaluate(() => { const o = performance.now.bind(performance); let add = 0; performance.now = () => o() + add; window.__adv = (s) => { add += s * 1000; }; });
await page.locator('#timer [data-t="go"]').click(); await page.evaluate(() => window.__adv(10)); await page.waitForTimeout(150);
for (let k = 0; k < 16; k++) { await page.evaluate(() => window.__adv(300)); await page.waitForTimeout(60); if (k === 2) await page.screenshot({ path: `${OUT}/20b-temporizador-tramos.png` }); await page.locator('#timer [data-t="lap"]').click(); }
await page.waitForTimeout(300);
{ const sum = await page.locator('[id^="hx-"]').first().innerText(); console.log(/1:20:0\d/.test(sum) ? `Tramos del cronómetro OK: ${sum}` : `✗ tramos del cronómetro: ${sum}`); }
await page.evaluate(() => { localStorage.removeItem('forja:draft'); });
await shot('#/nutricion/despensa', '21-despensa-receta', async () => { await page.getByText('Proponme una receta').click(); await page.waitForTimeout(500); });
await shot('#/coach', '22-coach-resumen');
await shot('#/inicio', '23-inicio-abajo', async () => { await page.evaluate(() => window.scrollTo(0, 900)); });
{ // Registrar comida: interpretación instantánea en el móvil
  await page.goto('http://forja.test/index.html#/inicio'); await page.waitForTimeout(200); await page.goto('http://forja.test/index.html#/nutricion/hoy'); await page.waitForTimeout(700);
  await page.getByText('He comido algo').click(); await page.waitForTimeout(400);
  let calls = 0; page.on('request', (r) => { if (r.url().includes('/functions/v1/nutrition-log')) calls++; });
  const t0 = Date.now();
  await page.locator('#ltext').pressSequentially('wrap de avena de hacendado, canonigos, un huevo revuelto y medio aguacate como almuerzo', { delay: 5 });
  await page.waitForFunction(() => document.querySelectorAll('#lres .row').length >= 4, null, { timeout: 3000 }).catch(() => {});
  const n = await page.locator('#lres .row').count(); const slot = await page.locator('#lslot').inputValue();
  const focused = await page.evaluate(() => document.activeElement?.id);
  console.log(n === 4 && slot === 'media_manana' && calls === 0 && focused === 'ltext' ? `Comida al instante OK (${Date.now() - t0} ms, sin servidor, teclado sin cerrarse)` : `✗ comida instantánea: ${n} alimentos, comida ${slot}, ${calls} llamadas, foco ${focused}`);
  await page.screenshot({ path: `${OUT}/24-comida-instantanea.png` });
  await page.locator('#ltext').pressSequentially(', una coca de tomate', { delay: 5 }); await page.waitForTimeout(1600);
  const n2 = await page.locator('#lres .row').count(); console.log(n2 === 5 && calls === 1 ? 'Lo desconocido se busca aparte OK' : `✗ búsqueda aparte: ${n2} alimentos, ${calls} llamadas`);
  await page.screenshot({ path: `${OUT}/24b-comida-busqueda.png` });
}
// ---------- Recorrido automático: pulsa TODOS los botones de cada pantalla (y los de las hojas que abren) ----------
if (process.env.MONKEY) {
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Prueba' : undefined).catch(() => {}));
  const screens = [['#/inicio'], ['#/salud'], ['#/objetivo/g1'], ['#/objetivo/g2'], ['#/plan'], ['#/entrenos'], ['#/entrenos', 'Historial'], ['#/entrenos', 'Progreso'], ['#/nutricion', 'Hoy'], ['#/nutricion', 'Menú'], ['#/nutricion', 'Compra'], ['#/nutricion', 'Batch'], ['#/nutricion', 'Despensa'], ['#/nutricion', 'Suplementos'], ['#/coach'], ['#/perfil']];
  let clicks = 0; const seen = new Set();
  const go = async (route, tab) => {
    await page.evaluate(() => { const sh = document.getElementById('sheet'); if (sh) sh.hidden = true; document.querySelectorAll('.scan-ov').forEach((x) => x.remove()); });
    await page.goto(`http://forja.test/index.html${route === '#/inicio' ? '#/plan' : '#/inicio'}`); await page.waitForTimeout(150);
    await page.goto(`http://forja.test/index.html${route}`); await page.waitForTimeout(450);
    if (tab) { await page.getByRole('button', { name: tab, exact: true }).first().click().catch(() => {}); await page.waitForTimeout(350); }
  };
  for (const [route, tab] of screens) {
    await go(route, tab);
    const n = await page.locator('#view [data-act]').count();
    for (let i = 0; i < n; i++) {
      await go(route, tab);
      const el = page.locator('#view [data-act]').nth(i);
      const label = ((await el.innerText().catch(() => '')) || '').trim().slice(0, 40).replace(/\s+/g, ' ');
      const key = `${route}${tab ?? ''}:${label}`; if (seen.has(key) || /^(Plan|Inicio|Entrenos|Nutrición|Coach)$/.test(label)) continue; seen.add(key);
      const before = errors.length;
      await el.click({ timeout: 2000 }).catch(() => {}); clicks++; await page.waitForTimeout(350);
      // un nivel dentro de la hoja que se abra
      const sheetOpen = await page.evaluate(() => !document.getElementById('sheet')?.hidden);
      if (sheetOpen) {
        const m = await page.locator('#sheet [data-act]').count();
        for (let j = 0; j < Math.min(m, 14); j++) {
          const b = page.locator('#sheet [data-act]').nth(j);
          const lb = ((await b.innerText().catch(() => '')) || '').trim().slice(0, 30);
          if (/Eliminar|Desconectar|Descartar|Borrar|Cerrar sesi/i.test(lb)) continue;
          await b.click({ timeout: 1500 }).catch(() => {}); clicks++; await page.waitForTimeout(250);
          if (await page.evaluate(() => document.getElementById('sheet')?.hidden)) break;
        }
      }
      for (const e of errors.slice(before)) console.log(`  ✗ ${key} → ${e}`);
      const bad = await page.evaluate(() => { const t = document.body.innerText; const m = t.match(/.{0,40}\b(undefined|NaN|\[object Object\]|Invalid Date)\b.{0,30}/); return m ? m[0].replace(/\s+/g, ' ') : null; });
      if (bad && !seen.has('txt:' + bad)) { seen.add('txt:' + bad); console.log(`  ⚠ texto raro tras ${key}: «${bad}»`); }
    }
  }
  console.log(`Recorrido: ${clicks} pulsaciones en ${screens.length} pantallas`);
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'Sin errores de JavaScript');
