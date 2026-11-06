// Running: VDOT (fórmulas de Daniels-Gilbert) a partir de tus mejores esfuerzos reales,
// ritmos de entrenamiento, zonas de FC (umbral medido o Karvonen con tus FC reales),
// predicciones orientativas (VDOT y Riegel) y análisis de distribución de intensidad.

import type { Session, Pace } from './types.ts';
import { daysBetween, isoDate } from './fitness.ts';

const vo2 = (vMetersPerMin: number) => -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2;
const pctMax = (tMin: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);

export function vdotFromPerformance(distanceM: number, timeS: number): number {
  const t = timeS / 60;
  return vo2(distanceM / t) / pctMax(t);
}

/** Velocidad (m/min) para un VO2 dado: resuelve la cuadrática. */
function velocityForVo2(v: number): number {
  const a = 0.000104, b = 0.182258, c = -4.6 - v;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Tiempo de carrera previsto para una distancia con un VDOT dado (bisección). */
export function predictTime(vdot: number, distanceM: number): number {
  let lo = distanceM / 400 * 60, hi = distanceM / 50 * 60; // entre 24 km/h y 3 km/h
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromPerformance(distanceM, mid) > vdot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const riegel = (t1S: number, d1M: number, d2M: number, k = 1.06) => t1S * Math.pow(d2M / d1M, k);

export function secPerKm(distanceM: number, timeS: number) { return timeS / (distanceM / 1000); }

export function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`;
}

export function fmtTime(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export interface TrainingPaces {
  vdot: number;
  easy: [number, number];       // s/km rango
  marathon: number;
  threshold: number;
  interval: number;
  repetition: number;
  halfMarathon: number;
  tenK: number;
}

export function trainingPaces(vdot: number): TrainingPaces {
  const paceAtFraction = (f: number) => 60000 / velocityForVo2(vdot * f);    // s/km
  const racePace = (d: number) => predictTime(vdot, d) / (d / 1000);
  return {
    vdot,
    easy: [paceAtFraction(0.70), paceAtFraction(0.62)],
    marathon: racePace(42195),
    threshold: racePace(vdotThresholdDistance(vdot)),
    interval: racePace(intervalDistance(vdot)),
    repetition: racePace(1609),
    halfMarathon: racePace(21097.5),
    tenK: racePace(10000),
  };
}

/** Distancia que se cubre en ~60 min (ritmo umbral) para el VDOT dado. */
function vdotThresholdDistance(vdot: number): number {
  let lo = 5000, hi = 25000;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (predictTime(vdot, mid) < 3600) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** Distancia de ~11 min (aprox. vVO2max). */
function intervalDistance(vdot: number): number {
  let lo = 1500, hi = 6000;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (predictTime(vdot, mid) < 660) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export interface Effort { date: string; distanceM: number; timeS: number; kind: 'race' | 'time_trial' | 'hard_effort'; sessionId?: string }

/** Esfuerzos válidos para estimar VDOT: competiciones, test, o rodajes duros (FC ≥ 88 % FCmax ≥ 20 min). */
export function effortsFromSessions(sessions: Session[], hrMax?: number): Effort[] {
  const out: Effort[] = [];
  for (const s of sessions) {
    if (s.discipline !== 'running' || !s.distanceM || s.distanceM < 1500) continue;
    const date = isoDate(s.startedAt);
    if (s.isRace) out.push({ date, distanceM: s.distanceM, timeS: s.durationS, kind: 'race', sessionId: s.id });
    else if (s.isTimeTrial) out.push({ date, distanceM: s.distanceM, timeS: s.durationS, kind: 'time_trial', sessionId: s.id });
    else if (hrMax && s.avgHr && s.avgHr >= 0.88 * hrMax && s.durationS >= 1200) out.push({ date, distanceM: s.distanceM, timeS: s.durationS, kind: 'hard_effort', sessionId: s.id });
  }
  return out;
}

export interface VdotEstimate { vdot: number; basedOn: Effort; confidence: 'alta' | 'media' | 'baja'; note: string }

/** Mejor VDOT reciente, ponderando recencia y tipo de esfuerzo. */
export function estimateVdot(efforts: Effort[], today: string): VdotEstimate | null {
  let best: { v: number; e: Effort; w: number } | null = null;
  for (const e of efforts) {
    const age = daysBetween(e.date, today);
    if (age < 0 || age > 365) continue;
    const kindFactor = e.kind === 'hard_effort' ? 0.97 : 1;        // un rodaje duro no es un máximo
    const recency = age <= 56 ? 1 : age <= 120 ? 0.97 : age <= 240 ? 0.93 : 0.9; // desentrenamiento orientativo
    const v = vdotFromPerformance(e.distanceM, e.timeS) * kindFactor * recency;
    if (!best || v > best.v) best = { v, e, w: recency };
  }
  if (!best) return null;
  const confidence = best.e.kind !== 'hard_effort' && daysBetween(best.e.date, today) <= 56 ? 'alta' : best.e.kind === 'hard_effort' ? 'baja' : 'media';
  return {
    vdot: best.v, basedOn: best.e, confidence,
    note: `Basado en ${(best.e.distanceM / 1000).toFixed(2)} km en ${fmtTime(best.e.timeS)} (${best.e.kind === 'race' ? 'competición' : best.e.kind === 'time_trial' ? 'test' : 'rodaje exigente'}, ${best.e.date}).`,
  };
}

export interface HrZones { method: 'lthr' | 'karvonen'; zones: [number, number][] }

/** Zonas de FC desde TUS datos: umbral láctico medido si existe; si no, Karvonen con reposo y máxima reales. */
export function hrZones(p: { hrRest?: number; hrMax?: number; lthr?: number }): HrZones | null {
  if (p.lthr) {
    const l = p.lthr;
    return { method: 'lthr', zones: [[0, Math.round(l * 0.85)], [Math.round(l * 0.85), Math.round(l * 0.89)], [Math.round(l * 0.9), Math.round(l * 0.94)], [Math.round(l * 0.95), Math.round(l * 0.99)], [Math.round(l), p.hrMax ?? Math.round(l * 1.08)]] };
  }
  if (p.hrRest && p.hrMax) {
    const r = p.hrMax - p.hrRest;
    const z = (f: number) => Math.round(p.hrRest! + r * f);
    return { method: 'karvonen', zones: [[z(0.5), z(0.6)], [z(0.6), z(0.7)], [z(0.7), z(0.8)], [z(0.8), z(0.9)], [z(0.9), p.hrMax]] };
  }
  return null;
}

/** Distribución de intensidad (baja Z1-2 / media Z3 / alta Z4-5) a partir de segundos por zona. */
export function intensityDistribution(sessions: Session[]): { low: number; mid: number; high: number; totalS: number } {
  let low = 0, mid = 0, high = 0;
  for (const s of sessions) {
    const z = s.hrZoneSeconds;
    if (!z || z.length < 5) continue;
    low += z[0] + z[1]; mid += z[2]; high += z[3] + z[4];
  }
  const t = low + mid + high;
  return t ? { low: low / t, mid: mid / t, high: high / t, totalS: t } : { low: 0, mid: 0, high: 0, totalS: 0 };
}

export function pace(sec: number, label: string): Pace { return { secPerKm: Math.round(sec), label }; }

export const STANDARD_DISTANCES = [
  { key: '5k', m: 5000 }, { key: '10k', m: 10000 }, { key: '15k', m: 15000 },
  { key: 'half', m: 21097.5 }, { key: 'marathon', m: 42195 },
] as const;

export function predictions(vdot: number) {
  return STANDARD_DISTANCES.map((d) => ({ key: d.key, distanceM: d.m, timeS: predictTime(vdot, d.m) }));
}
