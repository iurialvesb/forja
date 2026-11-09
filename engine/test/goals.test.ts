import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hyroxBlock, hyroxSplits, hyroxStations, logToSession, raceOutlook, hyroxOutlook, hyroxKeyOf, weeklySummary, statusFor } from '../src/index.ts';

test('HYROX: estaciones, reparto del objetivo y hoja de simulación con parciales', () => {
  assert.equal(hyroxStations('open_men').length, 8);
  assert.equal(hyroxStations('open_women')[1].loadText, '102 kg');
  const sp = hyroxSplits(80 * 60);
  const total = sp.reduce((a, s) => a + s.seconds, 0);
  assert.ok(Math.abs(total - 4800) < 30, `suma ${total}`);
  const b = hyroxBlock('open_men');
  assert.equal(b.groups.length, 16);
  b.groups.forEach((g, i) => { g.rows[0].splitS = i % 2 === 0 ? 290 : 300; g.rows[0].status = 'done'; });
  const s = logToSession({ id: 'd', date: '2026-12-01', origin: 'manual', blocks: [b] }, { id: 's1', startedAt: '2026-12-01T17:00:00Z' });
  assert.equal(s.discipline, 'hyrox');
  assert.equal(s.blocks![0].resultTimeS, 8 * 290 + 8 * 300);
  const run3 = s.blocks![0].sets.filter((x) => x.exerciseId === 'run')[2];
  assert.equal(run3.splitS, 290);
  assert.equal(hyroxKeyOf('run', run3.label), 'run3');
  assert.equal(hyroxKeyOf('wall_ball', 'Estación 8'), 'wb');
  assert.equal(statusFor(b.groups[0].rows[0]), 'done');
});

test('Panel de media maratón: predicción vs objetivo, tirada larga e hitos', () => {
  const sessions = [12, 14, 16].map((km, i) => ({ id: `r${i}`, startedAt: `2026-11-0${i + 2}T08:00:00Z`, durationS: km * 300, discipline: 'running' as const, distanceM: km * 1000 }));
  const o = raceOutlook({ goal: { id: 'g', name: 'Media Castellón', type: 'half_marathon', date: '2027-01-31', targetTimeS: 5400 }, today: '2026-11-09', vdot: 47, sessions, planned: [{ date: '2026-11-15', type: 'run_long', title: 'Tirada larga', plannedKm: 15 }] });
  assert.equal(o.daysLeft, 83);
  assert.equal(o.longestRun28dKm, 16);
  assert.ok(o.predictedS! > 5400 && o.predictedS! < 6300);
  assert.equal(Math.max(...o.longRunPlan.map((x) => x.km)), 19);
  assert.equal(o.nextKey.length, 1);
  assert.ok(o.verdict.length > 10);
});

test('Panel HYROX: compara estaciones con el objetivo', () => {
  const records = [{ date: '2026-11-01', sessionId: 's', key: 'run1', exerciseId: 'run', label: 'Carrera 1', splitS: 300 }, { date: '2026-11-01', sessionId: 's', key: 'run2', exerciseId: 'run', label: 'Carrera 2', splitS: 320 }, { date: '2026-11-01', sessionId: 's', key: 'wb', exerciseId: 'wall_ball', label: 'Estación 8', splitS: 400 }];
  const o = hyroxOutlook({ goal: { id: 'h', name: 'HYROX', type: 'hyrox', date: '2027-04-16', targetTimeS: 80 * 60 }, today: '2026-11-09', vdot: 47, records, sessions: [], planned: [], simulations: [] });
  assert.equal(o.stations[0].last!.s, 310);
  assert.ok(o.stations.find((s) => s.key === 'wb')!.target! > 0);
  assert.ok(o.runPaceTarget! > 250 && o.runPaceTarget! < 320);
});

test('Resumen semanal', () => {
  const w = weeklySummary({ weekStart: '2026-11-02', weekEnd: '2026-11-08', sessions: [{ id: 'a', startedAt: '2026-11-03T08:00:00Z', durationS: 3600, discipline: 'running', distanceM: 12000 }, { id: 'b', startedAt: '2026-11-04T18:00:00Z', durationS: 3600, discipline: 'crossfit' }],
    planned: [{ date: '2026-11-03', status: 'done', key: true, title: 'Series' }, { date: '2026-11-06', status: 'planned', key: true, title: 'Tirada larga' }], prevWeekKm: 10, weights: [{ date: '2026-11-02', kg: 80 }, { date: '2026-11-08', kg: 79.4 }] });
  assert.equal(w.runKm, 12);
  assert.deepEqual(w.keyMissed, ['Tirada larga']);
  assert.equal(w.weightDelta, -0.6);
  assert.ok(w.lines[0].includes('+2 km'));
});
