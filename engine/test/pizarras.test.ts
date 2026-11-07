import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkoutText, buildLog, stationPrefix, resolveExercise } from '../src/index.ts';

// Texto real copiado del box (con "EМОМ" escrito con М y О cirílicas).
const T = `FUERZA / TÉCNICA
EМОМ 15'
1: 3 FRONT SQUAT (75 kg)
2. 1' WALL SIT
3: REST

WOD
10*9*8*7*6*5*4*3*2*1*
• WALL BALLS - 7kg
• KTB SWING - 16 kg
• GOBLET SQUAT - 16 kg
* 50 Saltos simples`;

test('EMOM 15 con estaciones numeradas y descanso → 5 rondas de 3 minutos', () => {
  const p = parseWorkoutText(T);
  assert.equal(p.unparsed.length, 0, JSON.stringify(p.unparsed));
  const [f, w] = p.sections;
  assert.equal(f.kind, 'strength'); assert.equal(f.format, 'emom'); assert.equal(f.rounds, 5); assert.equal(f.durationMin, 15);
  assert.equal(f.items[0].reps, 3); assert.equal(f.items[0].loadKg, 75);
  assert.equal(f.items[1].durationS, 60);
  const d = buildLog(p, { date: '2026-11-07', origin: 'text' });
  const fb = d.blocks[0];
  assert.equal(fb.groups.length, 15);
  assert.deepEqual(fb.groups.slice(0, 3).map((g) => g.rows[0].exercise), ['Front Squat', 'Wall Sit', 'Descanso']);
  assert.equal(fb.groups[3].label, 'Min 4 · R2');
  assert.equal(p.uncertainties.filter((u) => u.field.startsWith('ejercicio')).length, 0, JSON.stringify(p.uncertainties));
  void w;
});

test('Escalera 10*9*…*1* con un ejercicio fijo marcado con * en cada escalón', () => {
  const p = parseWorkoutText(T);
  const w = p.sections[1];
  assert.equal(w.kind, 'wod'); assert.equal(w.format, 'for_time');
  assert.deepEqual(w.items.map((i) => i.repScheme ?? i.reps), ['10-9-8-7-6-5-4-3-2-1', '10-9-8-7-6-5-4-3-2-1', '10-9-8-7-6-5-4-3-2-1', 50]);
  assert.deepEqual(w.items.map((i) => i.loadKg), [7, 16, 16, undefined]);
  const b = buildLog(p, { date: '2026-11-07', origin: 'text' }).blocks[1];
  assert.equal(b.groups.length, 10);
  assert.equal(b.groups[0].label, '10 reps');
  assert.deepEqual(b.groups[3].rows.map((r) => [r.exercise, r.target]), [['Wall Balls', 7], ['Kettlebell Swing', 7], ['Goblet Squat', 7], ['Single Unders', 50]]);
});

test('Otras escaleras y prefijos', () => {
  for (const sch of ['21-15-9', '21/15/9', '5, 4, 3, 2, 1', '21 - 15 - 9 reps']) {
    const p = parseWorkoutText(`WOD\n${sch}\nThrusters 43/29\nPull ups`);
    assert.equal(p.sections[0].format, 'for_time', sch);
    assert.ok(p.sections[0].items[0].repScheme, sch);
  }
  assert.equal(stationPrefix('Min 3 - 10 burpees')?.rest, '10 burpees');
  assert.equal(stationPrefix('400 m run'), null);
  assert.equal(stationPrefix('1-1-1-1-1 deadlift'), null);
  // "10. burpees" sin numeración previa son 10 burpees, no la estación 10
  const p = parseWorkoutText('WOD\nAMRAP 10\n10. burpees');
  assert.equal(p.sections[0].items[0].reps, 10);
  assert.equal(resolveExercise(p.sections[0].items[0].exercise)?.id, 'burpee');
});

test('Batería de pizarras: todo se entiende y sale el número de casillas correcto', () => {
  const cases: [string, number[]][] = [
    [`AMRAP 12':\n- 5 pull ups\n- 10 push ups\n- 15 air squats`, [1]],
    [`For time:\n50-40-30-20-10\nDouble unders\nSit ups`, [5]],
    [`5 RFT\n400m run\n21 KBS 24/16\n12 pull ups`, [5]],
    [`Every 2' x 5\n5 power cleans @ 70%`, [5]],
    [`Fuerza\nBack squat 5x5 @ 80%`, [5]],
    [`3 rondas:\n20 cal bike\n15 burpees`, [3]],
    [`EMOM 12\nMin 1: 12 cal row\nMin 2: 10 burpees\nMin 3: 30'' plank`, [12]],
    [`WOD\nBuy in: 1000m row\nAMRAP 10\n10 thrusters 40kg\n10 T2B\nCash out: 50 DU`, [1, 1, 1]],
    [`Deadlift 5-5-5-3-3-3`, [6]],
    [`Metcon\n12' AMRAP\n6 DB snatch 22,5kg\n12 lunges\n200 m run`, [1]],
    [`EMOM 10'\nA) 8 hang power clean 50kg\nB) 12 burpees`, [10]],
    [`Fuerza\nPress militar\n4x6 @ 40kg`, [4]],
  ];
  for (const [txt, groups] of cases) {
    const p = parseWorkoutText(txt);
    assert.equal(p.unparsed.length, 0, `${txt}: ${p.unparsed}`);
    assert.equal(p.uncertainties.filter((u) => u.field.startsWith('ejercicio')).length, 0, `${txt}: ${JSON.stringify(p.uncertainties)}`);
    assert.deepEqual(buildLog(p, { date: '2026-11-07', origin: 'text' }).blocks.map((b) => b.groups.length), groups, txt);
  }
  const plank = parseWorkoutText(`EMOM 12\nMin 1: 12 cal row\nMin 2: 10 burpees\nMin 3: 30'' plank`).sections[0].items[2];
  assert.equal(plank.durationS, 30);
});
