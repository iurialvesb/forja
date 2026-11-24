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
        // Solo lo que envía el Atajo: un campo que no llega no borra el que ya vino de Intervals.icu
        const vals: Record<string, unknown> = { hrv_ms: d.hrvMs, hrv_method: d.hrvMs ? 'sdnn' : undefined, rhr: d.rhr != null ? Math.round(d.rhr) : undefined, sleep_h: d.sleepH, steps: d.steps != null ? Math.round(d.steps) : undefined, active_kcal: d.activeKcal, exercise_min: d.exerciseMin != null ? Math.round(d.exerciseMin) : undefined, respiration: d.respiration, spo2: d.spo2, vo2max: d.vo2max };
        const set = Object.fromEntries(Object.entries(vals).filter(([, v]) => v != null));
        if (Object.keys(set).length) await sb.from('daily_health').upsert({ user_id: userId, date: d.date, ...set, source: 'healthkit', updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
        if (d.stages) {
          const st = d.stages;
          await sb.from('sleep_nights').upsert({ user_id: userId, date: d.date, asleep_min: st.asleepMin ?? null, deep_min: st.deepMin ?? null, rem_min: st.remMin ?? null, core_min: st.coreMin ?? null,
            awake_min: st.awakeMin ?? null, in_bed_min: st.inBedMin ?? null, wrist_temp_c: st.wristTempC ?? null, bedtime: st.bedtime ?? null, wake_time: st.wakeTime ?? null, source: 'healthkit', updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
        }
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
