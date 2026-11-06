// GET/POST /insights → métricas calculadas por el motor para la pestaña Progreso (sin IA).
import { handler, json, requireUser, userClient } from '../_shared/supabase.ts';
import { loadContext } from '../_shared/context.ts';
import { predictions, weeklyRunKm, intensityDistribution, mondayOf, addDays, isoDate, recommendLoad, getExercise } from '../_shared/engine/index.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const ctx = await loadContext(sb, userId);
  const km = weeklyRunKm(ctx.sessions); const w0 = mondayOf(ctx.today);
  const weeks = Array.from({ length: 16 }, (_, i) => addDays(w0, -7 * (15 - i))).map((w) => ({ week: w, km: Math.round((km.get(w) ?? 0) * 10) / 10 }));
  const runs = ctx.sessions.filter((s) => s.discipline === 'running' && s.distanceM && s.distanceM >= 3000)
    .map((s) => ({ date: isoDate(s.startedAt), km: s.distanceM! / 1000, paceSecPerKm: s.durationS / (s.distanceM! / 1000), avgHr: s.avgHr ?? null }));
  const since28 = addDays(ctx.today, -28);
  return json({
    running: {
      vdot: ctx.paces?.vdot ?? null, vdotNote: ctx.vdotNote ?? null, paces: ctx.paces, zones: ctx.zones,
      predictions: ctx.paces ? predictions(ctx.paces.vdot) : [], weeks, runs,
      distribution28d: intensityDistribution(ctx.sessions.filter((s) => s.discipline === 'running' && isoDate(s.startedAt) >= since28)),
    },
    lifts: Object.values(ctx.lifts).map((l) => ({
      exerciseId: l.exerciseId, name: getExercise(l.exerciseId)?.name ?? l.exerciseId, bestActual1RM: l.bestActual1RM ?? null, bestE1RM: l.bestE1RM ?? null,
      workingE1RM: l.workingE1RM ?? null, history: l.history, repPRs: l.repPRs,
      suggestion: recommendLoad({ summary: l, sets: 5, reps: 5, rir: 2, readiness: ctx.readiness.level }),
    })),
    fitness: ctx.fitness.slice(-120).map((f) => ({ date: f.date, ctl: Math.round(f.ctl), atl: Math.round(f.atl), tsb: Math.round(f.tsb), acwr: f.acwr })),
    readiness: ctx.readiness, legFatigue: Math.round(ctx.legFatigueNow),
  });
}));
