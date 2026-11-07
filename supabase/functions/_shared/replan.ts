// Orquestación: generar semanas, adaptar tras cada sesión/check-in, guardar cambios y récords.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AthleteContext } from './context.ts';
import {
  planWeek, adaptPlan, handleMissed, phaseAt, weekVolumeFactor, mondayOf, addDays, internalLoad, regionalLoad, legIndex,
  estimate1RM, getExercise, fmtTime, STANDARD_DISTANCES,
  type PlannedSession, type PlanChange, type Session, reconcilePlan } from './engine/index.ts';

export type Trigger = 'session' | 'checkin' | 'goal_change' | 'missed' | 'manual' | 'weekly' | 'done' | 'undone';

export function rowToPlanned(r: any): PlannedSession & { dbId: string; locked: boolean } {
  return {
    dbId: r.id, locked: r.locked, id: r.id, date: r.date, slot: r.slot, type: r.type, discipline: r.discipline, title: r.title,
    objective: r.objective ?? '', intensity: r.intensity, estMinutes: r.est_minutes, legStress: r.leg_stress, key: r.key,
    steps: r.steps ?? [], rationale: r.rationale ?? '', status: r.status, plannedKm: r.planned_km != null ? Number(r.planned_km) : undefined,
    startLocal: r.start_local ?? undefined, fromCalendar: r.from_calendar ?? false,
  };
}

function plannedToRow(userId: string, weekStart: string, p: PlannedSession) {
  return {
    user_id: userId, engine_key: p.id, week_start: weekStart, date: p.date, slot: p.slot, type: p.type, discipline: p.discipline,
    title: p.title, objective: p.objective, intensity: p.intensity, est_minutes: p.estMinutes, leg_stress: p.legStress, key: p.key,
    planned_km: p.plannedKm ?? null, steps: p.steps, rationale: p.rationale, status: p.status ?? 'planned',
    start_local: p.startLocal ?? null, from_calendar: !!p.fromCalendar,
  };
}

async function savePhases(sb: SupabaseClient, ctx: AthleteContext) {
  await sb.from('phases').delete().eq('user_id', ctx.userId);
  if (ctx.phases.length) {
    const { error } = await sb.from('phases').insert(ctx.phases.map((p) => ({ user_id: ctx.userId, goal_id: p.goalId, kind: p.kind, start_date: p.start, end_date: p.end, focus: p.focus, secondary: p.secondary ?? null })));
    if (error) throw error;
  }
}

/** Genera (o regenera) las semanas. Conserva sesiones hechas, bloqueadas o ya pasadas. */
export async function ensureWeeks(sb: SupabaseClient, ctx: AthleteContext, force: boolean): Promise<string[]> {
  const notes: string[] = [];
  if (force) await savePhases(sb, ctx);
  const thisWeek = mondayOf(ctx.today);
  for (const ws of [thisWeek, addDays(thisWeek, 7)]) {
    const { data: existing, error } = await sb.from('planned_sessions').select('*').eq('week_start', ws);
    if (error) throw error;
    if (existing?.length && !force) continue;
    const prevKm = (await sb.from('planned_sessions').select('planned_km').eq('week_start', addDays(ws, -7))).data
      ?.reduce((a: number, r: any) => a + Number(r.planned_km ?? 0), 0);
    const week = planWeek({ weekStart: ws, profile: ctx.profile, goals: ctx.goals, phases: ctx.phases, history: ctx.sessions, paces: ctx.paces, zones: ctx.zones, lifts: ctx.lifts, readiness: ctx.readiness.level, previousWeekPlannedKm: prevKm || undefined, fixed: ctx.calendar?.fixed, overrides: ctx.calendar?.overrides });
    notes.push(...week.notes);
    const keep = (existing ?? []).filter((r: any) => r.status === 'done' || r.locked || r.date < ctx.today);
    const keepKeys = new Set(keep.map((r: any) => r.engine_key));
    const keptDays = new Set(keep.map((r: any) => `${r.date}-${r.slot}`));
    const fresh = week.sessions.filter((s) => s.date >= ctx.today && !keepKeys.has(s.id) && !keptDays.has(`${s.date}-${s.slot}`));
    const removable = (existing ?? []).filter((r: any) => !keep.includes(r)).map((r: any) => r.id);
    if (removable.length) await sb.from('planned_sessions').delete().in('id', removable);
    if (fresh.length) {
      const { error: e2 } = await sb.from('planned_sessions').upsert(fresh.map((s) => plannedToRow(ctx.userId, ws, s)), { onConflict: 'user_id,engine_key' });
      if (e2) throw e2;
    }
    if (force) await logChanges(sb, ctx.userId, 'goal_change', [{ plannedId: '', date: ws, action: 'note', reason: `Semana del ${ws} recalculada: ${week.phase.focus}. Volumen de carrera objetivo ${week.targetKm} km.`, data: {} }]);
  }
  return notes;
}

async function logChanges(sb: SupabaseClient, userId: string, trigger: Trigger, changes: PlanChange[]) {
  if (!changes.length) return;
  const rows = changes.map((c) => ({ user_id: userId, planned_session_id: /^[0-9a-f-]{36}$/.test(c.plannedId) ? c.plannedId : null, date: c.date, trigger, action: c.action, reason: c.reason, data: c.data, before: c.before ?? null, after: c.after ?? null }));
  const { error } = await sb.from('plan_changes').insert(rows);
  if (error) throw error;
}

/** Re-evalúa los próximos días tras una sesión o un check-in. */
/** Marca como hechas las sesiones del plan que ya has entrenado (mismo día y tipo) y deshace los "hechos" sin entreno. */
export async function reconcileDone(sb: SupabaseClient, ctx: AthleteContext): Promise<number> {
  const { data } = await sb.from('planned_sessions').select('id,date,discipline,status,completed_session_id,done_manually').gte('date', addDays(ctx.today, -28)).lte('date', ctx.today);
  const rows = (data ?? []).map((r: any) => ({ id: r.id, date: r.date, discipline: r.discipline, status: r.status, completedSessionId: r.completed_session_id, doneManually: r.done_manually }));
  const upd = reconcilePlan(rows, ctx.sessions, ctx.today);
  for (const u of upd) await sb.from('planned_sessions').update({ status: u.status, completed_session_id: u.sessionId }).eq('id', u.id);
  return upd.length;
}

export async function adaptUpcoming(sb: SupabaseClient, ctx: AthleteContext, trigger: Trigger, completedSessionId?: string): Promise<PlanChange[]> {
  await ensureWeeks(sb, ctx, false);
  await reconcileDone(sb, ctx).catch((e) => console.warn('reconcile', e));
  const { data, error } = await sb.from('planned_sessions').select('*').gte('date', addDays(ctx.today, -1)).lte('date', addDays(ctx.today, 8));
  if (error) throw error;
  const rows = (data ?? []).map(rowToPlanned);
  const locked = new Set(rows.filter((r) => r.locked).map((r) => r.id));
  const phase = phaseAt(ctx.phases, ctx.today) ?? ctx.phases[0];
  const wf = weekVolumeFactor(phase, mondayOf(ctx.today));
  const { plan, changes } = adaptPlan({
    now: new Date(), plan: rows.filter((r) => !locked.has(r.id)), history: ctx.sessions, profile: ctx.profile,
    readiness: ctx.readiness, acwr: ctx.fitness[ctx.fitness.length - 1]?.acwr ?? null,
    ctx: { phase, weekIndex: wf.weekIndex, deload: wf.deload, paces: ctx.paces, zones: ctx.zones, lifts: ctx.lifts, readiness: ctx.readiness.level, profile: ctx.profile },
  });
  for (const p of plan) {
    const orig = rows.find((r) => r.id === p.id)!;
    if (JSON.stringify(orig) === JSON.stringify(p)) continue;
    const upd: Record<string, unknown> = { date: p.date, slot: p.slot, type: p.type, discipline: p.discipline, title: p.title, objective: p.objective, intensity: p.intensity, est_minutes: p.estMinutes, leg_stress: p.legStress, key: p.key, steps: p.steps, planned_km: p.plannedKm ?? null, status: p.status };
    if (p.status === 'done' && completedSessionId) upd.completed_session_id = completedSessionId;
    const { error: e } = await sb.from('planned_sessions').update(upd).eq('id', p.id);
    if (e) throw e;
  }
  await logChanges(sb, ctx.userId, trigger, changes.filter((c) => c.action !== 'mark_done' || trigger === 'session'));
  return changes;
}

export async function markMissed(sb: SupabaseClient, ctx: AthleteContext, plannedId: string): Promise<PlanChange> {
  const { data } = await sb.from('planned_sessions').select('*').gte('date', addDays(ctx.today, -2)).lte('date', addDays(ctx.today, 7));
  const rows = (data ?? []).map(rowToPlanned);
  const { plan, change } = handleMissed(rows, plannedId, ctx.today);
  for (const p of plan) {
    const o = rows.find((r) => r.id === p.id)!;
    if (o.status !== p.status || o.type !== p.type) await sb.from('planned_sessions').update({ status: p.status, type: p.type, title: p.title, objective: p.objective, steps: p.steps, intensity: p.intensity, key: p.key, leg_stress: p.legStress, planned_km: p.plannedKm ?? null, est_minutes: p.estMinutes }).eq('id', p.id);
  }
  await logChanges(sb, ctx.userId, 'missed', [change]);
  return change;
}

/** Valores derivados de la sesión + récords nuevos (reales y estimados). */
export async function persistDerived(sb: SupabaseClient, ctx: AthleteContext, s: Session): Promise<string[]> {
  const il = internalLoad(s, ctx.profile);
  const rl = regionalLoad(s, ctx.profile.weightKg ?? 75);
  await sb.from('sessions').update({ internal_load: Math.round(il.load), load_source: il.source, leg_index: Math.round(legIndex(rl)), region_load: rl }).eq('id', s.id);
  const prs: string[] = [];
  const { data: existing } = await sb.from('personal_records').select('metric, value, kind');
  const best = new Map<string, number>();
  for (const r of existing ?? []) best.set(`${r.metric}|${r.kind}`, Math.max(best.get(`${r.metric}|${r.kind}`) ?? 0, Number(r.value)));
  const date = s.startedAt.slice(0, 10);
  const rows: any[] = [];
  const consider = (metric: string, kind: 'actual' | 'estimated', value: number, unit: string, detail: string, lowerIsBetter = false) => {
    const k = `${metric}|${kind}`; const prev = best.get(k);
    const better = prev == null || (lowerIsBetter ? value < prev : value > prev);
    if (!better) return;
    best.set(k, value);
    rows.push({ user_id: ctx.userId, metric, value, unit, kind, achieved_on: date, session_id: s.id, detail });
    prs.push(`${detail}${kind === 'estimated' ? ' (estimado)' : ''}`);
  };
  for (const b of s.blocks ?? []) for (const set of b.sets) {
    const ex = getExercise(set.exerciseId);
    if (!ex || set.isWarmup) continue;
    if (ex.prTracked === 'load' && set.loadKg && set.reps) {
      if (set.reps <= 10) consider(`${ex.id}:${set.reps}rm`, 'actual', set.loadKg, 'kg', `${ex.name} ${set.loadKg} kg × ${set.reps}`);
      const e1 = estimate1RM(set.loadKg, set.reps, { rir: set.rir, rpe: set.rpe, assumeRir: set.reps === 1 ? 0 : 1 });
      if (e1 && set.reps > 1) consider(`${ex.id}:1rm`, 'estimated', Math.round(e1 * 2) / 2, 'kg', `${ex.name} 1RM ≈ ${e1.toFixed(1)} kg`);
    }
    if (ex.prTracked === 'reps' && set.reps && (b.format === 'sets' || b.kind === 'skill' || b.kind === 'strength')) consider(`${ex.id}:max_reps`, 'actual', set.reps, 'reps', `${ex.name} ${set.reps} reps seguidas`);
  }
  if (s.discipline === 'running' && s.distanceM && (s.isRace || s.isTimeTrial)) {
    for (const d of STANDARD_DISTANCES) if (Math.abs(s.distanceM - d.m) / d.m <= 0.02) consider(`run:${d.key}`, 'actual', s.durationS, 's', `${d.key.toUpperCase()} en ${fmtTime(s.durationS)}`, true);
  }
  if (rows.length) await sb.from('personal_records').insert(rows);
  return prs;
}
