import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icuToActivity, icuWellnessToDaily, madridLocalToUtc, kmSplits, disciplineFromIcu } from '../src/index.ts';

// Carrera sintética de 3,2 km a 5:00/km con FC subiendo de 130 a 170.
const N = 961; const t = [...Array(N)].map((_, i) => i);
const dist = t.map((s) => s * (1000 / 300));
const hr = t.map((s) => 130 + Math.round((40 * s) / N));
const cad = t.map(() => 86);                                   // por pierna (FIT)
const alt = t.map((s) => 20 + s / 100);
const latlng = { type: 'latlng', data: t.map((s) => 39.98 + s * 1e-5), data2: t.map((s) => -0.05 + s * 1e-5) };
const streams = [{ type: 'time', data: t }, { type: 'distance', data: dist }, { type: 'heartrate', data: hr }, { type: 'cadence', data: cad }, { type: 'altitude', data: alt }, { type: 'velocity_smooth', data: t.map(() => 1000 / 300) }, latlng];
const act = { id: 'i777', type: 'Run', name: 'Rodaje', start_date_local: '2026-11-07T18:05:00', elapsed_time: 960, moving_time: 955, distance: 3200, average_heartrate: 150, max_heartrate: 170, average_cadence: 86, total_elevation_gain: 9.6, calories: 240, average_stride: 1.16,
  icu_intervals: [{ type: 'WORK', start_time: 0, end_time: 480, distance: 1600, average_heartrate: 140 }, { type: 'WORK', start_time: 480, end_time: 960, distance: 1600, average_heartrate: 160 }] };

test('hora local de Madrid → UTC (invierno y verano)', () => {
  assert.equal(madridLocalToUtc('2026-11-07T18:05:00'), '2026-11-07T17:05:00.000Z');
  assert.equal(madridLocalToUtc('2026-07-01T08:00:00'), '2026-07-01T06:00:00.000Z');
});

test('carrera: sesión, splits por km, zonas, vueltas, ruta y series', () => {
  const a = icuToActivity(act, streams, { hrRest: 50, hrMax: 190 });
  assert.equal(a.session.discipline, 'running');
  assert.equal(a.session.startedAt, '2026-11-07T17:05:00.000Z');
  assert.equal(a.session.externalId, 'icu:i777');
  assert.equal(a.session.cadenceSpm, 172);                    // 86 por pierna → 172 pasos/min
  assert.equal(a.session.splits!.length, 3);
  assert.ok(Math.abs(a.session.splits![0].durationS - 300) < 1.5);
  assert.ok(a.session.splits![2].avgHr! > a.session.splits![0].avgHr!);
  assert.equal(a.zones!.seconds.length, 5);
  assert.ok(Math.abs(a.zones!.seconds.reduce((x, y) => x + y, 0) - 960) <= 2);
  assert.equal(a.laps.length, 2); assert.equal(a.laps[1].durationS, 480);
  assert.ok(a.route!.length > 100 && a.route!.length <= 500);
  assert.ok(a.series!.t.length <= 601 && a.series!.pace![10] === 300);
});

test('CrossFit sin GPS ni distancia: sin splits, con zonas', () => {
  const a = icuToActivity({ id: 'i8', type: 'WeightTraining', name: 'Entrenamiento funcional', start_date: '2026-11-06T17:00:00Z', elapsed_time: 3500, average_heartrate: 145 }, [{ type: 'time', data: t }, { type: 'heartrate', data: hr }], { hrRest: 50, hrMax: 190 });
  assert.equal(a.session.discipline, 'crossfit');
  assert.equal(a.session.splits!.length, 0);
  assert.equal(a.route, null);
  assert.ok(a.zones);
});

test('wellness: VFC (SDNN preferente), sueño y pulso', () => {
  const d = icuWellnessToDaily({ id: '2026-11-07', hrv: 41, hrvSDNN: 55, restingHR: 51, sleepSecs: 27000, steps: 9000, weight: 77.8 });
  assert.deepEqual(d, { date: '2026-11-07', hrvMs: 55, hrvMethod: 'sdnn', rhr: 51, sleepH: 7.5, steps: 9000, weightKg: 77.8, avgSleepingHr: undefined });
  assert.equal(disciplineFromIcu('TrailRun'), 'running');
  assert.equal(kmSplits([0, 1], [0, 500]).length, 0);
});
