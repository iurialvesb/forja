import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkoutText, buildLog, logToSession, amrapResult, addGroup, statusFor, regroup, logFromSaved, summarizeLog, parseClock } from '../src/index.ts';

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

test('EMOM: una fila por minuto, con los descansos como filas automáticas', () => {
  const d = buildLog(parseWorkoutText(EJEMPLO), { date: '2026-11-07', origin: 'text' });
  const [fuerza, wod] = d.blocks;
  assert.equal(fuerza.part, 'strength');
  assert.equal(fuerza.groups.length, 10);
  assert.equal(fuerza.groups[0].label, 'Min 1 · R1');
  assert.equal(fuerza.groups[0].rows[0].exercise, 'Front Squat');
  assert.equal(fuerza.groups[0].rows[0].target, 6);
  assert.equal(fuerza.groups[0].rows[0].targetKg, 50);
  assert.equal(fuerza.groups[1].rows[0].targetKg, 16);
  assert.equal(wod.groups.length, 24);
  assert.equal(wod.groups[0].rows[0].unit, 'cal');
  assert.ok(wod.groups[3].rows[0].rest && wod.groups[5].rows[0].rest);
  assert.equal(wod.groups[6].label, 'Min 7 · R2');
});

test('Guardar: lo realizado frente a lo prescrito, sin contar los descansos', () => {
  const d = buildLog(parseWorkoutText(EJEMPLO), { date: '2026-11-07', origin: 'text' });
  const f = d.blocks[0];
  for (const g of f.groups) for (const r of g.rows) r.status = 'done';
  f.groups[8].rows[0].done = 4; f.groups[8].rows[0].doneKg = 50;      // última ronda: 4 de 6
  f.groups[8].rows[0].status = statusFor(f.groups[8].rows[0]);
  const s = logToSession(d, { id: 'x', startedAt: '2026-11-07T17:00:00Z' });
  const sets = s.blocks![0].sets;
  assert.equal(sets.length, 10);
  assert.equal(sets[8].reps, 4); assert.equal(sets[8].targetReps, 6); assert.equal(sets[8].status, 'partial');
  const wodSets = s.blocks![1].sets;
  assert.equal(wodSets.length, 12);                                   // 4 rondas × 3 ejercicios (sin descansos)
  assert.ok(wodSets.every((x) => x.status === 'skipped'));            // no marcadas → no hechas
  assert.equal(wodSets[0].calories, undefined); assert.equal(wodSets[0].targetReps, 16);
});

test('AMRAP: rondas que se añaden y resultado calculado de las casillas', () => {
  const d = buildLog(parseWorkoutText('WOD\nAMRAP 12\n- 10 wall balls 9kg\n- 10 box jumps\n- 200m run'), { date: '2026-11-07', origin: 'text' });
  const b = d.blocks[0];
  assert.equal(b.addable, 'round');
  addGroup(b); addGroup(b);
  assert.equal(b.groups.length, 3);
  b.groups[0].rows.forEach((r) => (r.status = 'done'));
  b.groups[1].rows.forEach((r) => (r.status = 'done'));
  b.groups[2].rows[0].status = 'done';
  b.groups[2].rows[1].done = 4; b.groups[2].rows[1].status = 'partial';
  assert.deepEqual(amrapResult(b), { rounds: 2, reps: 14 });
  const s = logToSession(d, { id: 'x', startedAt: '2026-11-07T17:00:00Z' });
  assert.equal(s.blocks![0].resultRounds, 2); assert.equal(s.blocks![0].resultReps, 14);
});

test('Fuerza 5-5-3-3-1: una fila por serie y series que se añaden', () => {
  const d = buildLog(parseWorkoutText('Fuerza\nBack squat 5-5-3-3-1 @ 80kg'), { date: '2026-11-07', origin: 'text' });
  const b = d.blocks[0];
  assert.equal(b.groups.length, 5);
  assert.deepEqual(b.groups.map((g) => g.rows[0].target), [5, 5, 3, 3, 1]);
  assert.equal(b.addable, 'set');
  addGroup(b);
  assert.equal(b.groups[5].label, 'Serie 6');
  regroup(b);                                                          // al editar la estructura se conserva el esquema
  assert.equal(b.groups.length, 5);
});

test('21-15-9 For Time: un grupo por escalón; tiempo y time cap', () => {
  const d = buildLog(parseWorkoutText('WOD\n21-15-9 for time\nthrusters 43/29\npull ups'), { date: '2026-11-07', origin: 'text' });
  const b = d.blocks[0];
  assert.deepEqual(b.groups.map((g) => g.label), ['21 reps', '15 reps', '9 reps']);
  assert.equal(b.groups[1].rows[1].target, 15);
  assert.equal(b.groups[0].rows[0].targetText, '43/29');
  b.result.timeS = parseClock('8:42');
  let s = logToSession(d, { id: 'x', startedAt: '2026-11-07T17:00:00Z' });
  assert.equal(s.blocks![0].resultTimeS, 522);
  b.result.capped = true; b.result.reps = 80;
  s = logToSession(d, { id: 'x', startedAt: '2026-11-07T17:00:00Z' });
  assert.equal(s.blocks![0].resultTimeS, undefined); assert.equal(s.blocks![0].capped, true);
});

test('Reabrir una sesión guardada para editarla', () => {
  const d = buildLog(parseWorkoutText(EJEMPLO), { date: '2026-11-07', origin: 'text' });
  const s = logToSession(d, { id: 'x', startedAt: '2026-11-07T17:00:00Z' });
  const back = logFromSaved({ id: 'x', startedAt: s.startedAt, durationS: s.durationS }, s.blocks!.map((b) => ({ prescribed: JSON.parse(JSON.stringify(b.prescribed)) })));
  assert.equal(back!.blocks.length, 2);
  assert.equal(back!.linkSessionId, 'x');
  assert.equal(summarizeLog(back!).length, 2);
});
