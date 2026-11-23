import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkoutText, describeParsed, toSession, collectQuestions, regionalLoad, legIndex, volumeByExercise, liftsFromSessions, resolveExercise, buildBlock } from '../src/index.ts';

const EJEMPLO = `Afternoon Workout

FERZA
EMOM 10’
- 6 FRONT SQUATS @ 50 kg
- 15 HEELS ON PLATE 16KG GOBLET SQUATS

WOD
EMOM 24’ (4R)
- 16 CAL ROW 
- 20 DEAD LIFT 50kg
- 10 BURPEES OVER BAR
- REST.
- REST
- REST.`;

test('tu ejemplo de Strava: fuerza EMOM 10 (5 rondas) + WOD EMOM 24 (4 rondas, 3 minutos de descanso)', () => {
  const p = parseWorkoutText(EJEMPLO);
  assert.equal(p.title, 'Afternoon Workout');
  assert.equal(p.sections.length, 2);
  const [f, w] = p.sections;
  assert.equal(f.kind, 'strength'); assert.equal(f.format, 'emom'); assert.equal(f.durationMin, 10); assert.equal(f.rounds, 5);
  assert.deepEqual(f.items.map((i) => [i.reps, i.loadKg]), [[6, 50], [15, 16]]);
  assert.match(f.items[1].notes ?? '', /talones elevados/);
  assert.equal(w.kind, 'wod'); assert.equal(w.format, 'emom'); assert.equal(w.rounds, 4); assert.equal(w.durationMin, 24);
  assert.deepEqual(w.items.map((i) => [i.calories, i.reps, i.loadKg]), [[16, undefined, undefined], [undefined, 20, 50], [undefined, 10, undefined]]);
  assert.equal(p.uncertainties.length, 0, JSON.stringify(p.uncertainties));
  const d = describeParsed(p);
  assert.match(d[0], /30 reps @ 50 kg/); assert.match(d[1], /64 cal/); assert.match(d[1], /80 reps @ 50 kg/); assert.match(d[1], /40 reps/);

  const q = collectQuestions(p, { sex: 'male' });
  assert.deepEqual(q.map((x) => x.id), ['rpe']);   // todo se entiende: solo pregunta el esfuerzo (EMOM no tiene tiempo final)
  const s = toSession({ ...p, sourceKind: 'whiteboard' }, { rpe: '8' }, { id: 'x', startedAt: '2026-11-06T17:00:00Z', durationS: 3600 });
  const fs = s.blocks![0].sets.filter((x) => x.exerciseId === 'front_squat');
  assert.equal(fs.length, 5);                                           // 5 series registradas → progresión y e1RM
  assert.equal(s.blocks![1].rounds, 4);
  const vol = volumeByExercise(s);
  assert.equal(vol.deadlift.reps, 80); assert.equal(vol.deadlift.tonnageKg, 4000); assert.equal(vol.burpee_over_bar.reps, 40);
  assert.ok(legIndex(regionalLoad(s, 78)) > 150);
  assert.ok(liftsFromSessions([s]).some((l) => l.exerciseId === 'front_squat' && l.loadKg === 50 && l.reps === 6));
});

test('otros formatos habituales del box', () => {
  const p = parseWorkoutText(`WARM UP
3 rondas
- 10 air squats
- 200m run

STRENGTH
5x5 Back Squat @ 80kg

METCON: AMRAP 12'
- 9 thrusters 43/29
- 12 T2B
- 15 cal bike

Cash out
21-15-9 For Time (TC 8')
- Power Clean 60kg
- C2B`);
  const [wu, st, mc, co] = p.sections;
  assert.equal(wu.kind, 'warmup'); assert.equal(wu.rounds, 3); assert.equal(wu.items[1].distanceM, 200);
  assert.equal(st.kind, 'strength'); assert.equal(st.items[0].repScheme, '5-5-5-5-5'); assert.equal(st.items[0].loadKg, 80);
  assert.equal(mc.format, 'amrap'); assert.equal(mc.durationMin, 12); assert.equal(mc.items[0].loadText, '43/29'); assert.equal(mc.items[2].calories, 15);
  assert.equal(co.format, 'for_time'); assert.equal(co.timeCapMin, 8); assert.equal(co.items[0].repScheme, '21-15-9'); assert.equal(co.items[1].repScheme, '21-15-9');
  const q = collectQuestions(p, { sex: 'male' });
  assert.ok(q.some((x) => /43\/29/.test(x.question)));
  assert.ok(q.some((x) => /AMRAP|rondas/.test(x.question)));
});

test('E2MOM y líneas que no entiende → pregunta, nunca inventa', () => {
  const p = parseWorkoutText(`E2MOM 12'\n- 3 Snatch 60kg\n- quetzalcoatl flips`);
  assert.equal(p.sections[0].emomIntervalS, 120); assert.equal(p.sections[0].rounds, 3);
  assert.ok(p.uncertainties.some((u) => /quetzalcoatl/.test(u.question)));
});

test('rondas escritas una a una: push/split jerk, intervalos 2 ON / 1 OFF y peso distinto en la última ronda', () => {
  const r = (n: number, kg: number) => `RONDA ${n}:\n- 4 Push Jerk – ${kg} kg\n- 20 Rodillas al pecho\n- 4 Split Jerk – ${kg} kg\n- Rest`;
  const iv = (n: number, ex: string) => `RONDA ${n}:\n1. 200 m Run\n2. 7 Burpees Over Bar\n3. ${ex}${n < 4 ? '\n4. Rest – 1 min' : ''}`;
  const p = parseWorkoutText(`FUERZA – EMOM 16 MIN (4 RONDAS)\n\n${r(1, 40)}\n\n${r(2, 40)}\n\n${r(3, 40)}\n\n${r(4, 44)}\n\nWOD – 4 INTERVALOS (12 MIN)\nFormato: 2 minutos ON / 1 minuto OFF.\nCada intervalo comienza con 200 m de carrera y 7 Burpees Over Bar. Después, realizar máximas repeticiones del ejercicio asignado durante el tiempo restante.\n\n${iv(1, '4 Thrusters – 40 kg')}\n\n${iv(2, '8 Pull-ups – Peso corporal')}\n\n${iv(3, '10 Clean – 40 kg')}\n\n${iv(4, '12 Pull-ups – Peso corporal')}`);
  assert.equal(p.uncertainties.length, 0, JSON.stringify(p.uncertainties));
  const [f, w] = p.sections;
  assert.equal(f.format, 'emom'); assert.equal(f.rounds, 4); assert.equal(f.durationMin, 16);
  assert.deepEqual(f.items.map((i) => resolveExercise(i.exercise)?.id), ['push_jerk', 'knees_to_chest', 'split_jerk']);
  assert.deepEqual(f.items[0].loadsByRound, [40, 40, 40, 44]);
  assert.equal(w.format, 'intervals'); assert.equal(w.durationMin, 12); assert.equal(w.restS, 60);
  assert.equal(w.items.length, 12);
  assert.deepEqual(w.items.filter((i) => i.round === 2).map((i) => resolveExercise(i.exercise)?.id), ['run', 'burpee_over_bar', 'pull_up']);
  assert.match(w.notes ?? '', /máximas repeticiones/);
  const s = toSession({ ...p, sourceKind: 'whiteboard' }, {}, { id: 'x', startedAt: '2026-11-23T18:00:00Z', durationS: 3600 });
  const pj = s.blocks![0].sets.filter((x) => x.exerciseId === 'push_jerk');
  assert.deepEqual(pj.map((x) => x.loadKg), [40, 40, 40, 44]);
  assert.equal(s.blocks![0].sets.filter((x) => x.exerciseId === 'knees_to_chest').length, 4);
  assert.equal(s.blocks![1].sets.filter((x) => x.exerciseId === 'pull_up').reduce((a, x) => a + (x.reps ?? 0), 0), 20);
  const b = buildBlock(w);
  assert.deepEqual(b.groups.map((g) => g.label), ['Intervalo 1', 'Intervalo 2', 'Intervalo 3', 'Intervalo 4']);
  const e = buildBlock(f);
  assert.equal(e.groups.length, 16);
  assert.equal(e.groups[12].rows[0].targetKg, 44);
});

test('catálogo de CrossFit: variantes que antes se confundían', () => {
  const cases: [string, string][] = [['push jerk', 'push_jerk'], ['split jerk', 'split_jerk'], ['jerk', 'jerk'], ['power jerk', 'power_jerk'], ['hang power clean', 'hang_power_clean'],
    ['hang squat clean', 'hang_squat_clean'], ['S2OH', 'shoulder_to_overhead'], ['G2OH', 'ground_to_overhead'], ['clusters', 'cluster'], ['DB thrusters', 'db_thruster'],
    ['DB hang clean and jerk', 'db_clean_and_jerk'], ['KB clean', 'kb_clean'], ['Box step overs', 'box_step_over'], ['K2E', 'knees_to_elbow'], ['rodillas al pecho', 'knees_to_chest'],
    ['BBJO', 'burpee_box_jump_over'], ['burpee pull ups', 'burpee_pull_up'], ['strict HSPU', 'strict_hspu'], ['wall-facing HSPU', 'wall_facing_hspu'], ['sumo deadlift', 'sumo_deadlift'],
    ['D-ball over shoulder', 'dball_over_shoulder'], ['sandbag cleans', 'sandbag_clean'], ['overhead lunges', 'overhead_lunge'], ['V-ups', 'v_up'], ['hip extensions', 'back_extension'],
    ['ring rows', 'ring_row'], ['chin ups', 'chin_up'], ['snatch balance', 'snatch_balance'], ['pegboard', 'peg_board'], ['Turkish get up', 'turkish_get_up'], ['slam balls', 'slam_ball'],
    ['mountain climbers', 'mountain_climber'], ['bar facing burpees', 'bar_facing_burpee'], ['zancadas con salto', 'jumping_lunge'], ['dominadas', 'pull_up']];
  for (const [txt, id] of cases) assert.equal(resolveExercise(txt)?.id, id, txt);
});
