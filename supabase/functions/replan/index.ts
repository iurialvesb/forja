// POST /replan { trigger: 'checkin'|'goal_change'|'missed'|'manual'|'weekly'|'done'|'undone', plannedId?, sessionId? }
// Recalcula fases y semanas, o adapta los próximos días. Devuelve el estado y los cambios con su motivo.
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { loadContext } from '../_shared/context.ts';
import { ensureWeeks, adaptUpcoming, markMissed, reconcileDone } from '../_shared/replan.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json().catch(() => ({}));
  const trigger = body.trigger ?? 'manual';
  const ctx = await loadContext(sb, userId);

  // Guardar el estado de recuperación del día (lo muestra el dashboard).
  const last = ctx.fitness[ctx.fitness.length - 1];
  await sb.from('readiness_daily').upsert({
    user_id: userId, date: ctx.today, score: ctx.readiness.score, level: ctx.readiness.level, reasons: ctx.readiness.reasons,
    pains: ctx.readiness.pains, data_quality: ctx.readiness.dataQuality, acwr: last?.acwr ?? null, ctl: last?.ctl ?? null,
    atl: last?.atl ?? null, tsb: last?.tsb ?? null, leg_fatigue: Math.round(ctx.legFatigueNow), computed_at: new Date().toISOString(),
  });

  let notes: string[] = []; let changes: unknown[] = [];
  switch (trigger) {
    case 'goal_change': case 'weekly': notes = await ensureWeeks(sb, ctx, true); break;
    case 'checkin': case 'manual': changes = await adaptUpcoming(sb, ctx, trigger); break;
    case 'done': {   // { plannedId, sessionId? } → la marcas tú como hecha (con o sin entreno registrado)
      if (!body.plannedId) throw new HttpError(400, 'Falta plannedId');
      await sb.from('planned_sessions').update({ status: 'done', completed_session_id: body.sessionId ?? null, done_manually: !body.sessionId }).eq('id', body.plannedId);
      break;
    }
    case 'undone':
      if (!body.plannedId) throw new HttpError(400, 'Falta plannedId');
      await sb.from('planned_sessions').update({ status: 'planned', completed_session_id: null, done_manually: false }).eq('id', body.plannedId);
      await reconcileDone(sb, ctx); break;
    case 'missed':
      if (!body.plannedId) throw new HttpError(400, 'Falta plannedId');
      changes = [await markMissed(sb, ctx, body.plannedId)]; break;
    default: throw new HttpError(400, `Trigger desconocido: ${trigger}`);
  }
  return json({ readiness: ctx.readiness, notes, changes, paces: ctx.paces, vdotNote: ctx.vdotNote, zones: ctx.zones, phases: ctx.phases });
}));
