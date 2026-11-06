// Modelo de forma/fatiga a partir de cargas diarias:
// CTL/ATL/TSB (Banister/Coggan, EWMA 42 y 7 días), ACWR con EWMA (Williams et al., 7/28),
// monotonía y strain (Foster).

import type { AthleteProfile, Session } from './types.ts';
import { internalLoad } from './load.ts';

export const isoDate = (d: Date | string): string => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

/** ISO weekday 1 (lunes) - 7 (domingo). */
export function weekday(date: string): number {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - weekday(date));
}

export interface DailyLoadPoint { date: string; load: number }

/** Serie diaria continua (incluye ceros) de carga interna entre `from` y `to`. */
export function dailyLoads(sessions: Session[], profile: Pick<AthleteProfile, 'hrRest' | 'hrMax'>, from: string, to: string): DailyLoadPoint[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const d = isoDate(s.startedAt);
    map.set(d, (map.get(d) ?? 0) + internalLoad(s, profile).load);
  }
  const out: DailyLoadPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, load: map.get(d) ?? 0 });
  return out;
}

export interface FitnessPoint {
  date: string; load: number;
  ctl: number; atl: number; tsb: number;
  acwr: number | null;
}

export function fitnessSeries(loads: DailyLoadPoint[], init = { ctl: 0, atl: 0 }): FitnessPoint[] {
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  const lA = 2 / (7 + 1), lC = 2 / (28 + 1);
  let ctl = init.ctl, atl = init.atl, ewA = init.atl, ewC = init.ctl;
  return loads.map((p, i) => {
    const tsb = ctl - atl;                      // forma de "hoy por la mañana"
    ctl += (p.load - ctl) * kC;
    atl += (p.load - atl) * kA;
    ewA = p.load * lA + (1 - lA) * ewA;
    ewC = p.load * lC + (1 - lC) * ewC;
    return { date: p.date, load: p.load, ctl, atl, tsb, acwr: i >= 21 && ewC > 0 ? ewA / ewC : null };
  });
}

export function monotonyStrain(last7: number[]): { monotony: number | null; strain: number } {
  const sum = last7.reduce((a, b) => a + b, 0);
  const mean = sum / last7.length;
  const sd = Math.sqrt(last7.reduce((a, b) => a + (b - mean) ** 2, 0) / last7.length);
  const monotony = sd > 0 ? mean / sd : null;
  return { monotony, strain: monotony ? sum * monotony : sum };
}

export function acwrStatus(acwr: number | null): 'insuficientes_datos' | 'baja' | 'optima' | 'elevada' | 'riesgo' {
  if (acwr == null) return 'insuficientes_datos';
  if (acwr < 0.8) return 'baja';
  if (acwr <= 1.3) return 'optima';
  if (acwr <= 1.5) return 'elevada';
  return 'riesgo';
}

/** Kilómetros de carrera por semana (lunes-domingo). */
export function weeklyRunKm(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (s.discipline !== 'running' || !s.distanceM) continue;
    const w = mondayOf(isoDate(s.startedAt));
    m.set(w, (m.get(w) ?? 0) + s.distanceM / 1000);
  }
  return m;
}
