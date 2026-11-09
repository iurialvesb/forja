// Resumen semanal: calcula las cifras (motor) y, si la IA responde, las redacta como tu entrenador.
// Todas las consultas filtran por user_id: sirve igual con el cliente del usuario que con el de servicio (cron).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { weeklySummary, addDays, mondayOf, type WeeklySummary } from './engine/index.ts';
import { rowToSession, todayMadrid } from './context.ts';
import { generate, textOf } from './ai.ts';

/** Semana que se resume: la que termina hoy si es domingo; si no, la anterior completa. */
export function reportWeek(now = new Date()): string {
  const t = todayMadrid(now); const m = mondayOf(t);
  return addDays(t, 0) === addDays(m, 6) ? m : addDays(m, -7);
}

export async function buildWeeklyReport(sb: SupabaseClient, userId: string, weekStart: string, useAi = true): Promise<{ summary: WeeklySummary; text: string }> {
  const weekEnd = addDays(weekStart, 6);
  const from = `${addDays(weekStart, -8)}T00:00:00Z`, to = `${addDays(weekEnd, 1)}T23:59:59Z`;
  const [sess, plan, meals, ready, health, prs, bm, goals] = await Promise.all([
    sb.from('sessions').select('id,started_at,duration_s,discipline,distance_m,title').eq('user_id', userId).is('deleted_at', null).gte('started_at', from).lte('started_at', to),
    sb.from('planned_sessions').select('date,status,key,title').eq('user_id', userId).gte('date', weekStart).lte('date', weekEnd),
    sb.from('planned_meals').select('date,status').eq('user_id', userId).gte('date', weekStart).lte('date', weekEnd),
    sb.from('readiness_daily').select('date,score').eq('user_id', userId).gte('date', weekStart).lte('date', weekEnd),
    sb.from('daily_health').select('date,sleep_h').eq('user_id', userId).gte('date', weekStart).lte('date', weekEnd),
    sb.from('personal_records').select('detail,metric').eq('user_id', userId).eq('kind', 'actual').gte('achieved_on', weekStart).lte('achieved_on', weekEnd),
    sb.from('body_metrics').select('date,weight_kg').eq('user_id', userId).not('weight_kg', 'is', null).gte('date', weekStart).lte('date', weekEnd),
    sb.from('goals').select('name,date').eq('user_id', userId).eq('status', 'active').order('date').limit(2),
  ]);
  const sessions = (sess.data ?? []).map(rowToSession);
  const prevKm = sessions.filter((s) => s.discipline === 'running' && s.startedAt.slice(0, 10) < weekStart && s.startedAt.slice(0, 10) >= addDays(weekStart, -7)).reduce((a, s) => a + (s.distanceM ?? 0), 0) / 1000;
  const byDay = new Map<string, { n: number; eaten: number }>();
  for (const m of meals.data ?? []) { const x = byDay.get(m.date) ?? { n: 0, eaten: 0 }; x.n++; if (m.status === 'eaten' || m.status === 'edited') x.eaten++; byDay.set(m.date, x); }
  const today = todayMadrid();
  const summary = weeklySummary({
    weekStart, weekEnd, sessions, planned: plan.data ?? [], prevWeekKm: Math.round(prevKm * 10) / 10,
    nutritionDays: [...byDay.entries()].filter(([d]) => d <= today).map(([date, x]) => ({ date, adherence: Math.round((x.eaten / x.n) * 100) })),
    readiness: (ready.data ?? []).map((r: any) => ({ date: r.date, score: r.score })),
    sleepH: (health.data ?? []).map((h: any) => Number(h.sleep_h)).filter((x) => x > 0),
    prs: (prs.data ?? []).map((p: any) => p.detail ?? p.metric),
    weights: (bm.data ?? []).map((b: any) => ({ date: b.date, kg: Number(b.weight_kg) })),
  });
  let text = summary.lines.join('\n');
  if (useAi) {
    try {
      const g = (goals.data ?? []).map((x: any) => `${x.name} (${x.date})`).join(', ');
      const r = await generate({
        smart: true, maxTokens: 700, temperature: 0.5,
        system: 'Eres el entrenador personal de Iuri (running + CrossFit + nutrición). Escribe en español de España, cercano y directo, sin emojis. Máximo 6 frases: qué fue bien, qué falló y 2 prioridades concretas para la semana que empieza. No inventes datos: usa solo las cifras dadas.',
        messages: [{ role: 'user', content: `Objetivos: ${g || 'sin objetivos activos'}.\nSemana ${weekStart} a ${weekEnd}:\n${summary.lines.join('\n')}` }],
      });
      const t = textOf(r.content); if (t) text = t;
    } catch { /* sin IA: queda el resumen con cifras */ }
  }
  await sb.from('weekly_reports').upsert({ user_id: userId, week_start: weekStart, summary, text, created_at: new Date().toISOString() });
  return { summary, text };
}
