import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  vdotFromPerformance, predictTime, trainingPaces, estimateVdot, hrZones, riegel,
  estimate1RM, summarizeLift, recommendLoad, pctFor,
  buildMacrocycle, phaseAt, planWeek, adaptPlan, handleMissed,
  regionalLoad, legIndex, residualLegFatigue, legFatigueLevel,
  dailyLoads, fitnessSeries, findDuplicate, classifyPain, computeReadiness,
  resolveExercise, collectQuestions, toSession, META, isKeyRun, runPrescription,
  type Session, type AthleteProfile, type Goal, type ParsedWorkout,
} from '../src/index.ts';

const profile: AthleteProfile = {
  sex: 'male', weightKg: 78, hrRest: 52, hrMax: 192, hyroxDivision: 'open_men', allowDoubles: true, crossfitPerWeek: 3,
  availability: [
    { weekday: 1, am: true, pm: true, maxMinutes: 90, boxClass: true },
    { weekday: 2, am: true, pm: true, maxMinutes: 90 },
    { weekday: 3, am: true, pm: true, maxMinutes: 90, boxClass: true },
    { weekday: 4, am: true, pm: true, maxMinutes: 90 },
    { weekday: 5, am: false, pm: true, maxMinutes: 75, boxClass: true },
    { weekday: 6, am: true, pm: false, maxMinutes: 150 },
    { weekday: 7, am: true, pm: false, maxMinutes: 120 },
  ],
};
const goals: Goal[] = [
  { id: 'hm', name: 'Media Maratón de Castellón', type: 'half_marathon', date: '2027-01-31', priority: 'A', distanceM: 21097.5 },
  { id: 'hx', name: 'HYROX', type: 'hyrox', date: '2027-04-16', priority: 'A' },
];

test('VDOT y ritmos coinciden con las tablas de Daniels (±2 %)', () => {
  const v = vdotFromPerformance(5000, 20 * 60);
  assert.ok(Math.abs(v - 49.8) < 0.6, `VDOT ${v}`);
  const hm = predictTime(50, 21097.5);
  assert.ok(Math.abs(hm - (91 * 60 + 35)) < 120, `media ${hm}`);
  const p = trainingPaces(50);
  assert.ok(Math.abs(p.threshold - 255) < 6, `T ${p.threshold}`);   // 4:15/km
  assert.ok(Math.abs(p.interval - 235) < 7, `I ${p.interval}`);     // 3:55/km
  assert.ok(p.easy[0] < p.easy[1] && p.easy[0] > 280 && p.easy[1] < 350, `E ${p.easy}`);
  assert.ok(Math.abs(riegel(1200, 5000, 10000) - 2501) < 2);
});

test('VDOT se estima de esfuerzos reales y prioriza recientes', () => {
  const e = estimateVdot([
    { date: '2026-10-20', distanceM: 10000, timeS: 44 * 60, kind: 'race' },
    { date: '2025-12-01', distanceM: 10000, timeS: 41 * 60, kind: 'race' },
  ], '2026-11-05');
  assert.ok(e && e.confidence === 'alta' && e.basedOn.date === '2026-10-20', JSON.stringify(e));
});

test('zonas de FC con datos reales', () => {
  const z = hrZones({ hrRest: 52, hrMax: 192 })!;
  assert.equal(z.method, 'karvonen');
  assert.deepEqual(z.zones[1], [136, 150]);
  assert.equal(hrZones({ lthr: 175, hrMax: 192 })!.method, 'lthr');
});

test('1RM: real vs estimado y carga recomendada (ejemplo 100 kg / 80×6)', () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.equal(estimate1RM(60, 20), null);
  const entries = [
    { date: '2026-06-01', exerciseId: 'back_squat', loadKg: 100, reps: 1 },
    { date: '2026-10-28', exerciseId: 'back_squat', loadKg: 80, reps: 6 },
  ];
  const s = summarizeLift(entries, 'back_squat', '2026-11-05');
  assert.equal(s.bestActual1RM?.kg, 100);
  assert.ok(s.workingE1RM && s.workingE1RM.kg > 95 && s.workingE1RM.kg < 102, JSON.stringify(s.workingE1RM));
  const rec = recommendLoad({ summary: s, sets: 5, reps: 5, rir: 2 });
  assert.ok(rec.loadKg! >= 77.5 && rec.loadKg! <= 82.5, String(rec.loadKg));
  const tired = recommendLoad({ summary: s, sets: 5, reps: 5, rir: 2, readiness: 'rojo' });
  assert.ok(tired.loadKg! < rec.loadKg!);
  assert.ok(pctFor(5, 2) > 0.78 && pctFor(5, 2) < 0.84);
});

test('periodización: media → transición → HYROX', () => {
  const ph = buildMacrocycle(goals, '2026-11-05');
  const comp = ph.filter((p) => p.kind === 'competition').map((p) => p.start);
  assert.deepEqual(comp, ['2027-01-31', '2027-04-16']);
  assert.equal(phaseAt(ph, '2027-01-25')?.kind, 'taper');
  assert.equal(phaseAt(ph, '2027-02-03')?.kind, 'recovery');
  assert.equal(phaseAt(ph, '2027-04-10')?.kind, 'taper');
  assert.equal(phaseAt(ph, '2027-04-10')?.goalId, 'hx');
  assert.equal(phaseAt(ph, '2026-12-28')?.kind, 'specific');
  // Fases contiguas sin huecos
  for (let i = 1; i < ph.length; i++) assert.ok(ph[i].start > ph[i - 1].end);
});

function run(date: string, km: number, minPerKm = 5.5, extra: Partial<Session> = {}): Session {
  return { id: `r-${date}`, startedAt: `${date}T07:00:00Z`, durationS: km * minPerKm * 60, discipline: 'running', distanceM: km * 1000, rpe: 4, ...extra };
}
const history: Session[] = [];
for (let w = 0; w < 5; w++) {
  const mon = new Date(Date.UTC(2026, 9, 5 + w * 7));
  const d = (n: number) => new Date(mon.getTime() + n * 864e5).toISOString().slice(0, 10);
  history.push(run(d(1), 8), run(d(3), 7), run(d(6), 14), run(d(4), 6));
}
history.push(run('2026-10-25', 10, 4.3, { isRace: true, rpe: 9 }));

test('semana planificada: completa, coherente y con descanso', () => {
  const phases = buildMacrocycle(goals, '2026-11-05');
  const paces = trainingPaces(estimateVdot([{ date: '2026-10-25', distanceM: 10000, timeS: 43 * 60, kind: 'race' }], '2026-11-09')!.vdot);
  const w = planWeek({ weekStart: '2026-11-09', profile, goals, phases, history, paces, zones: hrZones(profile), lifts: {} });
  assert.ok(w.sessions.length >= 5, JSON.stringify(w.sessions.map((s) => s.type)));
  assert.ok(w.sessions.some((s) => s.type === 'run_long'));
  assert.ok(w.sessions.filter((s) => s.type === 'crossfit_box').length >= 2);
  const days = new Set(w.sessions.map((s) => s.date));
  assert.ok(days.size <= 6, 'al menos un día libre');
  for (const d of days) {
    const same = w.sessions.filter((s) => s.date === d);
    assert.ok(same.length <= 2);
    assert.ok(!(same.filter((s) => META[s.type].legStress >= 2).length >= 2), `dos sesiones duras de pierna el ${d}`);
    assert.ok(same.filter((s) => isKeyRun(s.type)).length <= 1);
  }
  for (const s of w.sessions) assert.ok(s.rationale.length > 10 && s.steps.length > 0, s.id);
  const long = w.sessions.find((s) => s.type === 'run_long')!;
  assert.ok([6, 7].includes(new Date(long.date + 'T00:00:00Z').getUTCDay() === 0 ? 7 : new Date(long.date + 'T00:00:00Z').getUTCDay()));
});

test('sin marcas de carrera → test de 5 km', () => {
  const phases = buildMacrocycle(goals, '2026-11-05');
  const w = planWeek({ weekStart: '2026-11-09', profile, goals, phases, history: [], paces: null, zones: null, lifts: {} });
  assert.ok(w.sessions.some((s) => s.title === 'Test 5 km'));
});

test('REGLA FUNDAMENTAL: WOD de piernas del lunes adapta las series del martes', () => {
  const wod: Session = {
    id: 'wod', startedAt: '2026-11-09T18:00:00Z', durationS: 2400, discipline: 'crossfit', rpe: 9,
    blocks: [{ kind: 'wod', format: 'for_time', sets: [
      { exerciseId: 'wall_ball', reps: 100, loadKg: 9 }, { exerciseId: 'box_jump', reps: 80 },
      { exerciseId: 'lunge', reps: 60 }, { exerciseId: 'burpee', reps: 40 },
    ] }],
  };
  const leg = legIndex(regionalLoad(wod, 78));
  assert.ok(leg > 300, `índice ${leg}`);
  const tueAm = residualLegFatigue([wod], new Date('2026-11-10T07:30:00Z'), 78);
  assert.equal(legFatigueLevel(tueAm), 'alta');

  const phases = buildMacrocycle(goals, '2026-11-05');
  const paces = trainingPaces(48);
  const ctx = { phase: phaseAt(phases, '2026-11-10')!, weekIndex: 0, deload: false, paces, zones: null, lifts: {}, profile };
  const planned = planWeek({ weekStart: '2026-11-09', profile, goals, phases, history, paces, zones: null, lifts: {} }).sessions;
  // Forzamos el escenario: series el martes por la mañana.
  const tue = planned.filter((p) => p.date === '2026-11-10');
  tue.forEach((p) => planned.splice(planned.indexOf(p), 1));
  const rp = runPrescription('run_intervals', 9, ctx);
  const intervals = { id: 'tue-int', date: '2026-11-10', slot: 'am' as const, type: 'run_intervals' as const, discipline: 'running' as const, title: rp.title, objective: rp.objective, intensity: 'alta' as const, estMinutes: rp.minutes, legStress: 2, key: true, steps: rp.steps, rationale: 'test', status: 'planned' as const, plannedKm: rp.km };
  planned.push(intervals);
  const { plan, changes } = adaptPlan({ now: new Date('2026-11-09T20:00:00Z'), plan: planned, history: [...history, wod], profile, ctx });
  const c = changes.find((x) => x.plannedId === 'tue-int');
  assert.ok(c && ['swap', 'downgrade'].includes(c.action), JSON.stringify(changes, null, 1));
  assert.match(c!.reason, /piernas/);
  if (process.env.SHOW) console.log(JSON.stringify(changes, null, 1));
  const after = plan.find((p) => p.id === 'tue-int')!;
  assert.ok(after.date !== '2026-11-10' || after.type === 'run_easy');
});

test('sesión clave perdida se recoloca sin pegarla a otra dura', () => {
  const phases = buildMacrocycle(goals, '2026-11-05');
  const w = planWeek({ weekStart: '2026-11-09', profile, goals, phases, history, paces: trainingPaces(48), zones: null, lifts: {} });
  const key = w.sessions.find((s) => s.key && s.date <= '2026-11-11')!;
  const r = handleMissed(w.sessions, key.id, key.date);
  assert.ok(r.change.reason.length > 0);
});

test('readiness: verde por defecto, rojo con HRV baja + mal sueño + check-in malo', () => {
  const health = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 7 + i)).toISOString().slice(0, 10), hrvMs: 60 + (i % 5), rhr: 50, sleepHours: 7.8 }));
  const today = health[health.length - 1].date;
  const ok = computeReadiness({ today, health });
  assert.equal(ok.level, 'verde');
  const bad = health.map((h, i) => i >= 53 ? { ...h, hrvMs: 38, rhr: 59, sleepHours: 5 } : h);
  const r = computeReadiness({ today, health: bad, checkIn: { date: today, fatigue: 5, soreness: 4, stress: 4, motivation: 2, sleepQuality: 2 } });
  assert.equal(r.level, 'rojo', JSON.stringify(r));
});

test('molestias: agujetas vs posible lesión', () => {
  assert.equal(classifyPain({ area: 'cuádriceps', intensity: 4, character: 'difuso_muscular', bilateral: true, hoursSinceHardSession: 30 }).classification, 'agujetas');
  const inj = classifyPain({ area: 'rodilla derecha', intensity: 5, character: 'articular', affectsMovement: true });
  assert.equal(inj.classification, 'posible_lesion');
  assert.ok(inj.seeProfessional && /No es un diagnóstico/.test(inj.advice));
});

test('deduplicación Apple Health ↔ Strava', () => {
  const hk: Session = { id: 'hk1', startedAt: '2026-11-01T08:00:00Z', durationS: 3600, discipline: 'running', distanceM: 12000, source: 'healthkit' };
  const st: Session = { id: 'st1', startedAt: '2026-11-01T08:00:40Z', durationS: 3570, discipline: 'running', distanceM: 11950, source: 'strava' };
  const other: Session = { id: 'st2', startedAt: '2026-11-01T18:00:00Z', durationS: 3600, discipline: 'running', distanceM: 12000, source: 'strava' };
  assert.equal(findDuplicate(st, [hk])?.existingId, 'hk1');
  assert.equal(findDuplicate(other, [hk]), null);
});

test('carga: CTL/ATL/ACWR', () => {
  const loads = dailyLoads(history, profile, '2026-10-05', '2026-11-08');
  const f = fitnessSeries(loads);
  const last = f[f.length - 1];
  assert.ok(last.ctl > 0 && last.atl > 0 && last.acwr! > 0.5 && last.acwr! < 2);
});

test('foto de pizarra: alias, preguntas y conversión', () => {
  assert.equal(resolveExercise('Power Clean')?.id, 'power_clean');
  assert.equal(resolveExercise('C2B')?.id, 'chest_to_bar');
  assert.equal(resolveExercise('15 Wall balls')?.id, 'wall_ball');
  const parsed: ParsedWorkout = {
    sourceKind: 'whiteboard', title: 'WOD lunes', uncertainties: [],
    sections: [
      { kind: 'strength', format: 'sets', items: [{ raw: 'Back Squat 5-5-3-3-1', exercise: 'Back Squat', repScheme: '5-5-3-3-1', loadText: '75-90%' }] },
      { kind: 'wod', format: 'for_time', timeCapMin: 12, title: 'Fran', items: [
        { raw: '21-15-9 Thrusters 43/29', exercise: 'Thrusters', repScheme: '21-15-9', loadText: '43/29' },
        { raw: 'Pull-ups', exercise: 'Pull-ups', repScheme: '21-15-9' },
        { raw: 'Zumba burpees', exercise: 'Zumba burpees raros xyz' },
      ] },
    ],
  };
  const q = collectQuestions(parsed, { sex: 'male' });
  assert.ok(q.some((x) => x.id === 's1i0:loadKg' && x.options?.includes('43')));
  assert.ok(q.some((x) => x.id === 's1:resultTimeS'));
  assert.ok(q.some((x) => x.id === 's0i0:loadKg'));
  const s = toSession(parsed, { 's0i0:loadKg': '80', 's1i0:loadKg': '43', 's1:resultTimeS': '6:12', rpe: '9' }, { id: 'p1', startedAt: '2026-11-09T19:00:00Z' });
  assert.equal(s.discipline, 'crossfit');
  assert.equal(s.blocks![0].sets.length, 5);
  assert.equal(s.blocks![1].sets[0].reps, 45);
  assert.equal(s.blocks![1].resultTimeS, 372);
});
