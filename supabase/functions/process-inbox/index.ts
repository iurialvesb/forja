// POST /process-inbox → procesa lo que ha enviado tu Atajo de Apple Salud (con TUS permisos) y recalcula el día.
import { handler, json, requireUser, userClient } from '../_shared/supabase.ts';
import { parseShortcut, disciplineFromType } from '../_shared/shortcut.ts';
import { ingestSession } from '../_shared/ingest.ts';
import { todayMadrid } from '../_shared/context.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const { data: items } = await sb.from('health_inbox').select('*').is('processed_at', null).order('received_at').limit(50);
  let days = 0, workouts = 0; const prs: string[] = []; const changes: unknown[] = [];
  for (const it of items ?? []) {
    try {
      const r = parseShortcut(it.payload, todayMadrid(new Date(it.received_at)));
      if (r.day) {
        const d = r.day;
        await sb.from('daily_health').upsert({ user_id: userId, date: d.date, hrv_ms: d.hrvMs ?? null, hrv_method: d.hrvMs ? 'sdnn' : null, rhr: d.rhr != null ? Math.round(d.rhr) : null, sleep_h: d.sleepH ?? null, steps: d.steps != null ? Math.round(d.steps) : null, active_kcal: d.activeKcal ?? null, exercise_min: d.exerciseMin != null ? Math.round(d.exerciseMin) : null, source: 'healthkit', updated_at: new Date().toISOString() });
        if (d.weightKg) await sb.from('body_metrics').upsert({ user_id: userId, date: d.date, weight_kg: d.weightKg, source: 'healthkit' }, { onConflict: 'user_id,date,source' });
        days++;
      }
      for (const w of r.workouts) {
        const res = await ingestSession(sb, userId, { id: crypto.randomUUID(), startedAt: w.start, durationS: w.durationS, discipline: disciplineFromType(w.type) as any, title: w.type, avgHr: w.avgHr, maxHr: w.maxHr, distanceM: w.distanceM, activeKcal: w.kcal, source: 'healthkit', externalId: `atajo:${w.start}` });
        workouts++; prs.push(...res.prs); changes.push(...res.changes);
      }
      await sb.from('health_inbox').update({ processed_at: new Date().toISOString(), result: { days: r.day ? 1 : 0, workouts: r.workouts.length } }).eq('id', it.id);
    } catch (e) {
      await sb.from('health_inbox').update({ processed_at: new Date().toISOString(), result: { error: String(e) } }).eq('id', it.id);
    }
  }
  return json({ processed: items?.length ?? 0, days, workouts, prs, changes });
}));
