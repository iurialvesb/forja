// Panel de objetivo: cuenta atrás, predicción frente a tu objetivo, progresión de la tirada larga, volumen y hitos.
// Media maratón (o cualquier carrera) y HYROX. Determinista: todo sale de tus entrenos registrados.

import type { Session } from './types.ts';
import { addDays, daysBetween, isoDate, mondayOf, weeklyRunKm } from './fitness.ts';
import { predictTime, trainingPaces } from './running.ts';
import { hyroxCompare, hyroxRunPace, hyroxSplits, type HyroxDivision, type HyroxSplitRecord, type HyroxStationSummary } from './hyrox.ts';

export interface GoalLite { id: string; name: string; type: string; date: string; distanceM?: number | null; targetTimeS?: number | null }
export interface PlannedLite { date: string; type: string; title: string; plannedKm?: number | null; key?: boolean; status?: string }
export interface Milestone { date: string; label: string; done: boolean }

export interface RaceOutlook {
  kind: 'race';
  daysLeft: number; weeksLeft: number;
  distanceM: number;
  targetS?: number; targetPace?: number;
  predictedS?: number; predictedPace?: number;
  verdict: string;
  weeks: { week: string; km: number }[];
  longestRun28dKm: number;
  longRunPlan: { week: string; km: number }[];
  nextKey: PlannedLite[];
  milestones: Milestone[];
  racePaceRuns: { date: string; km: number; pace: number }[];
}

const RACE_DIST: Record<string, number> = { half_marathon: 21097.5, marathon: 42195, '10k': 10000, '5k': 5000 };

export function raceOutlook(a: { goal: GoalLite; today: string; vdot?: number | null; sessions: Session[]; planned: PlannedLite[] }): RaceOutlook {
  const d = a.goal.distanceM ?? RACE_DIST[a.goal.type] ?? 21097.5;
  const daysLeft = daysBetween(a.today, a.goal.date);
  const targetS = a.goal.targetTimeS ?? undefined;
  const predictedS = a.vdot ? Math.round(predictTime(a.vdot, d)) : undefined;
  const pace = (s?: number) => (s ? Math.round(s / (d / 1000)) : undefined);
  const km = weeklyRunKm(a.sessions);
  const w0 = mondayOf(a.today);
  const weeks = Array.from({ length: 10 }, (_, i) => addDays(w0, -7 * (9 - i))).map((w) => ({ week: w, km: Math.round((km.get(w) ?? 0) * 10) / 10 }));
  const runs = a.sessions.filter((s) => s.discipline === 'running' && s.distanceM);
  const recent = runs.filter((s) => daysBetween(isoDate(s.startedAt), a.today) <= 28);
  const longest = Math.max(0, ...recent.map((s) => s.distanceM! / 1000));
  // Tirada larga: sube ~1,5 km por semana hasta el pico (≈ 90 % de la distancia en media, 32 km en maratón) 3 semanas antes; luego baja.
  const peak = d > 30000 ? 32 : Math.min(19, Math.round((d / 1000) * 0.9));
  const peakWeek = mondayOf(addDays(a.goal.date, -21));
  const longRunPlan: { week: string; km: number }[] = [];
  let cur = Math.max(longest, Math.min(10, peak * 0.6));
  for (let w = addDays(w0, 7); w < a.goal.date; w = addDays(w, 7)) {
    if (w <= peakWeek) cur = Math.min(peak, cur + 1.5);
    else cur = Math.max(peak * 0.55, cur * 0.75);
    longRunPlan.push({ week: w, km: Math.round(cur) });
  }
  let verdict = 'Registra una carrera rápida o un test para estimar tu marca.';
  if (predictedS && targetS) {
    const gap = Math.round(((predictedS - targetS) / (d / 1000)));
    verdict = gap <= 0 ? `Vas en línea: hoy correrías ~${Math.abs(gap)} s/km más rápido que tu objetivo.` : gap <= 8 ? `Muy cerca: te faltan ~${gap} s/km. Asumible con el bloque que queda.` : `Te faltan ~${gap} s/km. O ajustamos el objetivo o priorizamos umbral y tirada larga.`;
  } else if (predictedS) verdict = 'Aún no tienes tiempo objetivo: tu predicción actual es la referencia.';
  const tp = targetS ?? predictedS;
  const racePaceRuns = tp ? runs.filter((s) => s.durationS / (s.distanceM! / 1000) <= pace(tp)! + 5 && s.distanceM! >= 3000).slice(-6)
    .map((s) => ({ date: isoDate(s.startedAt), km: Math.round(s.distanceM! / 100) / 10, pace: Math.round(s.durationS / (s.distanceM! / 1000)) })) : [];
  const has = (pred: (s: Session) => boolean, from: string, to: string) => runs.some((s) => { const x = isoDate(s.startedAt); return x >= from && x <= to && pred(s); });
  const ms: Milestone[] = [
    { date: addDays(a.goal.date, -42), label: 'Test de 10 km (o carrera) para afinar el ritmo', done: has((s) => s.distanceM! >= 9500 && (!!s.isRace || !!s.isTimeTrial), addDays(a.goal.date, -56), addDays(a.goal.date, -28)) },
    { date: addDays(a.goal.date, -21), label: `Tirada larga de ${peak} km`, done: has((s) => s.distanceM! / 1000 >= peak - 0.5, addDays(a.goal.date, -35), a.goal.date) },
    { date: addDays(a.goal.date, -14), label: 'Ensayo general: 8–10 km a ritmo de carrera con el desayuno y geles del día', done: false },
    { date: addDays(a.goal.date, -10), label: 'Empieza la puesta a punto: menos volumen, mismo ritmo', done: a.today >= addDays(a.goal.date, -10) },
  ];
  return {
    kind: 'race', daysLeft, weeksLeft: Math.ceil(daysLeft / 7), distanceM: d, targetS, targetPace: pace(targetS), predictedS, predictedPace: pace(predictedS), verdict,
    weeks, longestRun28dKm: Math.round(longest * 10) / 10, longRunPlan,
    nextKey: a.planned.filter((p) => p.date >= a.today && (p.key || p.type === 'run_long') && p.status !== 'skipped').slice(0, 4), milestones: ms, racePaceRuns,
  };
}

export interface HyroxOutlook {
  kind: 'hyrox';
  daysLeft: number; weeksLeft: number;
  division: HyroxDivision;
  targetS?: number;
  runPaceTarget?: number;          // s/km objetivo en las carreras
  runPaceNow?: number;             // ritmo "comprometido" estimado con tu VDOT (umbral + 20 s)
  stations: HyroxStationSummary[];
  simulations: { date: string; totalS: number; sessionId: string; stations: number }[];
  hyroxSessions28d: number;
  nextKey: PlannedLite[];
  milestones: Milestone[];
  verdict: string;
}

export function hyroxOutlook(a: { goal: GoalLite; today: string; division?: HyroxDivision; vdot?: number | null; records: HyroxSplitRecord[]; sessions: Session[]; planned: PlannedLite[]; simulations: { date: string; totalS: number; sessionId: string; stations: number }[] }): HyroxOutlook {
  const division = a.division ?? 'open_men';
  const daysLeft = daysBetween(a.today, a.goal.date);
  const targetS = a.goal.targetTimeS ?? undefined;
  const runPaceTarget = targetS ? hyroxRunPace(targetS) : undefined;
  const runPaceNow = a.vdot ? Math.round(trainingPaces(a.vdot).threshold + 20) : undefined;
  const hyroxSessions28d = a.sessions.filter((s) => s.discipline === 'hyrox' && daysBetween(isoDate(s.startedAt), a.today) <= 28).length;
  const full = a.simulations.filter((s) => s.stations >= 8);
  const lastFull = full[full.length - 1];
  let verdict = 'Haz una simulación (aunque sea de 4 estaciones) para tener tus primeros parciales.';
  if (lastFull && targetS) {
    const gap = lastFull.totalS - targetS;
    verdict = gap <= 0 ? `Tu última simulación ya está por debajo del objetivo (${Math.round(-gap / 60)} min de margen).` : `Tu última simulación está a ${Math.round(gap / 60)} min del objetivo: mira abajo qué estaciones pierden más.`;
  } else if (runPaceNow && runPaceTarget) {
    const g = runPaceNow - runPaceTarget;
    verdict = g <= 0 ? 'Por carrera vas sobrado para tu objetivo: el margen está en las estaciones.' : `Para tu objetivo necesitas correr los km a ~${g} s/km más rápido que tu ritmo comprometido actual.`;
  }
  const ms: Milestone[] = [
    { date: addDays(a.goal.date, -56), label: 'Media simulación (4 km + 4 estaciones)', done: a.simulations.some((s) => s.stations >= 4 && s.date >= addDays(a.goal.date, -70)) },
    { date: addDays(a.goal.date, -28), label: 'Simulación completa con cargas de competición', done: full.some((s) => s.date >= addDays(a.goal.date, -42)) },
    { date: addDays(a.goal.date, -10), label: 'Puesta a punto: menos volumen, transiciones y ritmo', done: a.today >= addDays(a.goal.date, -10) },
  ];
  return {
    kind: 'hyrox', daysLeft, weeksLeft: Math.ceil(daysLeft / 7), division, targetS, runPaceTarget, runPaceNow,
    stations: hyroxCompare(a.records, targetS, division), simulations: a.simulations.slice(-6), hyroxSessions28d,
    nextKey: a.planned.filter((p) => p.date >= a.today && (p.type.startsWith('hyrox') || p.key) && p.status !== 'skipped').slice(0, 4), milestones: ms, verdict,
  };
}

export { hyroxSplits };
