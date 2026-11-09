// Resumen semanal (domingo): carga, cumplimiento del plan, nutrición, sueño/recuperación, récords y peso.
// Determinista; la IA solo lo redacta si está disponible.

import type { Session } from './types.ts';
import { isoDate } from './fitness.ts';

export interface WeeklyInput {
  weekStart: string; weekEnd: string;
  sessions: Session[];
  planned: { date: string; status: string; key?: boolean; title: string }[];
  nutritionDays?: { date: string; adherence?: number; kcal?: number; targetKcal?: number; protein?: number; targetProtein?: number }[];
  readiness?: { date: string; score: number }[];
  sleepH?: number[];
  prs?: string[];
  weights?: { date: string; kg: number }[];
  prevWeekKm?: number;
}
export interface WeeklySummary {
  weekStart: string;
  runKm: number; runKmPrev?: number; sessions: number; hours: number;
  planDone: number; planTotal: number; keyMissed: string[];
  nutritionScore?: number; proteinHitDays?: number; nutritionDays: number;
  readinessAvg?: number; sleepAvg?: number;
  prs: string[];
  weightDelta?: number;
  lines: string[];
}

export function weeklySummary(w: WeeklyInput): WeeklySummary {
  const inWeek = w.sessions.filter((s) => { const d = isoDate(s.startedAt); return d >= w.weekStart && d <= w.weekEnd; });
  const runKm = Math.round(inWeek.filter((s) => s.discipline === 'running').reduce((a, s) => a + (s.distanceM ?? 0), 0) / 100) / 10;
  const hours = Math.round(inWeek.reduce((a, s) => a + s.durationS, 0) / 360) / 10;
  const plan = w.planned.filter((p) => p.date >= w.weekStart && p.date <= w.weekEnd);
  const planDone = plan.filter((p) => p.status === 'done').length;
  const keyMissed = plan.filter((p) => p.key && p.status !== 'done').map((p) => p.title);
  const nd = (w.nutritionDays ?? []).filter((d) => d.adherence != null);
  const nutritionScore = nd.length ? Math.round(nd.reduce((a, d) => a + (d.adherence ?? 0), 0) / nd.length) : undefined;
  const proteinHitDays = (w.nutritionDays ?? []).filter((d) => d.protein != null && d.targetProtein && d.protein >= d.targetProtein * 0.9).length;
  const r = w.readiness ?? [];
  const readinessAvg = r.length ? Math.round(r.reduce((a, x) => a + x.score, 0) / r.length) : undefined;
  const sl = w.sleepH ?? [];
  const sleepAvg = sl.length ? Math.round((sl.reduce((a, x) => a + x, 0) / sl.length) * 10) / 10 : undefined;
  const ws = [...(w.weights ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const weightDelta = ws.length >= 2 ? Math.round((ws[ws.length - 1].kg - ws[0].kg) * 10) / 10 : undefined;
  const lines: string[] = [];
  lines.push(`${inWeek.length} entrenos · ${hours} h${runKm ? ` · ${runKm} km corriendo${w.prevWeekKm != null ? ` (${runKm >= w.prevWeekKm ? '+' : ''}${Math.round((runKm - w.prevWeekKm) * 10) / 10} km)` : ''}` : ''}.`);
  if (plan.length) lines.push(`Plan: ${planDone}/${plan.length} sesiones hechas${keyMissed.length ? `; te faltó la clave: ${keyMissed.join(', ')}` : ''}.`);
  if (nutritionScore != null) lines.push(`Nutrición: ${nutritionScore}/100 de cumplimiento${proteinHitDays ? `, proteína cumplida ${proteinHitDays} de ${w.nutritionDays!.length} días` : ''}.`);
  if (readinessAvg != null || sleepAvg != null) lines.push(`Recuperación media ${readinessAvg ?? '–'}/100${sleepAvg != null ? ` · sueño ${sleepAvg} h` : ''}.`);
  if (weightDelta != null) lines.push(`Peso: ${weightDelta > 0 ? '+' : ''}${weightDelta} kg en la semana.`);
  if (w.prs?.length) lines.push(`Récords: ${w.prs.join(' · ')}.`);
  return { weekStart: w.weekStart, runKm, runKmPrev: w.prevWeekKm, sessions: inWeek.length, hours, planDone, planTotal: plan.length, keyMissed, nutritionScore, proteinHitDays, nutritionDays: (w.nutritionDays ?? []).length, readinessAvg, sleepAvg, prs: w.prs ?? [], weightDelta, lines };
}
