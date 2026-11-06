import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkoutText, describeParsed, toSession, collectQuestions, regionalLoad, legIndex, volumeByExercise, liftsFromSessions } from '../src/index.ts';

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
  assert.equal(vol.deadlift.reps, 80); assert.equal(vol.deadlift.tonnageKg, 4000); assert.equal(vol.burpee.reps, 40);
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
  const p = parseWorkoutText(`E2MOM 12'\n- 3 Snatch 60kg\n- quetzalcoatl swings`);
  assert.equal(p.sections[0].emomIntervalS, 120); assert.equal(p.sections[0].rounds, 3);
  assert.ok(p.uncertainties.some((u) => /quetzalcoatl/.test(u.question)));
});
