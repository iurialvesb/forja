// Carga desde la base de datos todo lo que el motor necesita y lo convierte a tipos del motor.
// Importante: aquí NUNCA entran datos obtenidos de la API de Strava (su API Policy prohíbe
// usarlos en aplicaciones de IA). Las sesiones proceden de HealthKit, registro manual o fotos.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AthleteProfile, Goal, Session, DailyHealth, CheckIn, SessionBlock } from './engine/index.ts';
import {
  buildMacrocycle, estimateVdot, effortsFromSessions, trainingPaces, hrZones, liftsFromSessions, summarizeLift,
  dailyLoads, fitnessSeries, residualLegFatigue, computeReadiness, addDays, isoDate, EXERCISES,
  calendarConstraints, DEFAULT_RULES,
  type LiftSummary, type Readiness, type TrainingPaces, type HrZones, type Phase, type FitnessPoint, type FixedSession, type SlotOverride, type CalendarEvent,
} from './engine/index.ts';

export interface AthleteContext {
  userId: string;
  today: string;
  profile: AthleteProfile;
  goals: Goal[];
  phases: Phase[];
  sessions: Session[];
  health: DailyHealth[];
  checkIn?: CheckIn;
  paces: TrainingPaces | null;
  vdotNote?: string;
  zones: HrZones | null;
  lifts: Record<string, LiftSummary>;
  fitness: FitnessPoint[];
  readiness: Readiness;
  legFatigueNow: number;
  memory: { fact: string; category: string }[];
  calendar?: { fixed: FixedSession[]; overrides: Record<string, SlotOverride>; otherTraining: CalendarEvent[] };
}

export function todayMadrid(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// La app guarda las molestias con claves snake_case (encoder de Supabase); el motor usa camelCase.
function normalizePain(x: any) {
  return { area: x.area, intensity: x.intensity, character: x.character, bilateral: x.bilateral,
    affectsMovement: x.affectsMovement ?? x.affects_movement, swelling: x.swelling, numbness: x.numbness,
    daysOngoing: x.daysOngoing ?? x.days_ongoing, worsening: x.worsening, hoursSinceHardSession: x.hoursSinceHardSession ?? x.hours_since_hard_session };
}

export function rowToSession(r: any): Session {
  const blocks: SessionBlock[] = (r.session_blocks ?? [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((b: any) => ({
      kind: b.kind, format: b.format ?? undefined, timeCapS: b.time_cap_s ?? undefined, rounds: b.rounds ?? undefined,
      resultText: b.result_text ?? undefined, resultTimeS: b.result_time_s ?? undefined, resultRounds: b.result_rounds ?? undefined, resultReps: b.result_reps ?? undefined,
      sets: (r.session_sets ?? []).filter((s: any) => s.block_id === b.id && s.status !== 'skipped').sort((a: any, c: any) => a.position - c.position).map((s: any) => ({
        exerciseId: s.exercise_id ?? `custom:${s.custom_exercise_id}`, reps: s.reps ?? undefined, loadKg: s.load_kg != null ? Number(s.load_kg) : undefined,
        distanceM: s.distance_m != null ? Number(s.distance_m) : undefined, durationS: s.duration_s ?? undefined, calories: s.calories != null ? Number(s.calories) : undefined,
        rpe: s.rpe != null ? Number(s.rpe) : undefined, rir: s.rir ?? undefined, isWarmup: s.is_warmup,
      })),
    }));
  return {
    id: r.id, startedAt: r.started_at, durationS: r.duration_s, discipline: r.discipline, title: r.title ?? undefined,
    rpe: r.rpe != null ? Number(r.rpe) : undefined, avgHr: r.avg_hr ?? undefined, maxHr: r.max_hr ?? undefined,
    hrZoneSeconds: r.hr_zone_s ?? undefined, distanceM: r.distance_m != null ? Number(r.distance_m) : undefined,
    elevationGainM: r.elevation_gain_m != null ? Number(r.elevation_gain_m) : undefined, elevationLossM: r.elevation_loss_m != null ? Number(r.elevation_loss_m) : undefined,
    cadenceSpm: r.cadence_spm != null ? Number(r.cadence_spm) : undefined, isRace: r.is_race, isTimeTrial: r.is_time_trial,
    blocks: blocks.length ? blocks : undefined, source: r.primary_source,
  };
}

export async function loadContext(sb: SupabaseClient, userId: string, now = new Date()): Promise<AthleteContext> {
  const today = todayMadrid(now);
  const since = addDays(today, -180);
  const [prof, phys, avail, inj, goals, sess, health, checkin, mem, bm] = await Promise.all([
    sb.from('profiles').select('*').eq('id', userId).single(),
    sb.from('physiology').select('*').lte('effective_from', today).order('effective_from', { ascending: false }).limit(1),
    sb.from('availability').select('*'),
    sb.from('injuries').select('*').is('resolved_on', null),
    sb.from('goals').select('*').eq('status', 'active').order('date'),
    sb.from('sessions').select('*, session_blocks(*), session_sets(*)').is('deleted_at', null).neq('primary_source', 'strava').gte('started_at', since).order('started_at'),
    sb.from('daily_health').select('*').gte('date', addDays(today, -90)).order('date'),
    sb.from('checkins').select('*').eq('date', today).maybeSingle(),
    sb.from('coach_memory').select('fact, category').eq('active', true).order('created_at', { ascending: false }).limit(50),
    sb.from('body_metrics').select('weight_kg').not('weight_kg', 'is', null).order('date', { ascending: false }).limit(1),
  ]);
  for (const r of [prof, phys, avail, inj, goals, sess, health, mem, bm]) if (r.error) throw r.error;
  // Calendario (clases reservadas de WodBuster / Google / iCloud y agenda ocupada): próximas 3 semanas.
  const { data: calSet } = await sb.from('calendar_settings').select('*').maybeSingle();
  let calendar: AthleteContext['calendar'];
  if (calSet) {
    const { data: evs } = await sb.from('calendar_events').select('*').gte('start_at', addDays(today, -1)).lte('start_at', addDays(today, 22));
    const events: CalendarEvent[] = (evs ?? []).filter((e: any) => e.kind !== 'ignore').map((e: any) => ({ uid: e.uid, title: e.title, start: e.start_at, end: e.end_at, allDay: e.all_day, calendar: e.calendar ?? undefined }));
    calendar = calendarConstraints(events, addDays(today, -7), addDays(today, 21), {
      ...DEFAULT_RULES,
      crossfitKeywords: [...DEFAULT_RULES.crossfitKeywords, ...(calSet.crossfit_keywords ?? [])],
      crossfitCalendars: [...DEFAULT_RULES.crossfitCalendars, ...(calSet.crossfit_calendars ?? [])],
    });
  }
  const p = prof.data!;
  const ph = phys.data?.[0];
  const profile: AthleteProfile = {
    birthDate: p.birth_date ?? undefined, sex: p.sex ?? undefined, weightKg: bm.data?.[0]?.weight_kg ? Number(bm.data[0].weight_kg) : undefined,
    hrRest: ph?.hr_rest ?? undefined, hrMax: ph?.hr_max ?? undefined, lthr: ph?.lthr ?? undefined,
    hyroxDivision: p.hyrox_division ?? undefined, allowDoubles: p.allow_doubles, crossfitPerWeek: p.crossfit_per_week,
    availability: (avail.data ?? []).map((a: any) => ({ weekday: a.weekday, am: a.am, pm: a.pm, maxMinutes: a.max_minutes, boxClass: a.box_class })),
    activeInjuries: (inj.data ?? []).map((i: any) => ({ area: i.area, avoid: i.avoid_regions ?? [], note: i.notes ?? undefined })),
  };
  const goalList: Goal[] = (goals.data ?? []).map((g: any) => ({ id: g.id, name: g.name, type: g.type, date: g.date, priority: g.priority, targetTimeS: g.target_time_s ?? undefined, distanceM: g.distance_m != null ? Number(g.distance_m) : undefined }));
  const sessions = (sess.data ?? []).map(rowToSession);
  const dh: DailyHealth[] = (health.data ?? []).map((h: any) => ({ date: h.date, hrvMs: h.hrv_ms != null ? Number(h.hrv_ms) : undefined, hrvMethod: h.hrv_method ?? undefined, rhr: h.rhr ?? undefined, sleepHours: h.sleep_h != null ? Number(h.sleep_h) : undefined }));
  const ci: CheckIn | undefined = checkin.data ? { date: checkin.data.date, fatigue: checkin.data.fatigue, soreness: checkin.data.soreness, stress: checkin.data.stress, motivation: checkin.data.motivation, sleepQuality: checkin.data.sleep_quality, pains: (checkin.data.pains ?? []).map(normalizePain) } : undefined;

  const vd = estimateVdot(effortsFromSessions(sessions, profile.hrMax), today);
  const lifts: Record<string, LiftSummary> = {};
  const entries = liftsFromSessions(sessions);
  for (const e of EXERCISES.filter((x) => x.prTracked === 'load')) {
    const s = summarizeLift(entries, e.id, today);
    if (s.history.length || s.bestActual1RM) lifts[e.id] = s;
  }
  const fitness = fitnessSeries(dailyLoads(sessions, profile, since, today));
  const legFatigueNow = residualLegFatigue(sessions, now, profile.weightKg ?? 75);
  const readiness = computeReadiness({ today, health: dh, checkIn: ci, acwr: fitness[fitness.length - 1]?.acwr ?? null, legFatigue: legFatigueNow, sleepNeedHours: Number(p.sleep_need_h ?? 7.5) });

  return {
    userId, today, profile, goals: goalList, phases: buildMacrocycle(goalList, today), sessions, health: dh, checkIn: ci,
    paces: vd ? trainingPaces(vd.vdot) : null, vdotNote: vd?.note, zones: hrZones(profile), lifts, fitness, readiness, legFatigueNow,
    memory: mem.data ?? [], calendar,
  };
}

export { isoDate };
