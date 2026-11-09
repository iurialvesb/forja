// POST /weekly { action: 'latest' | 'build' | 'seen', weekStart? } → resumen semanal de tu entrenador.
import { handler, json, requireUser, userClient } from '../_shared/supabase.ts';
import { buildWeeklyReport, reportWeek } from '../_shared/weekly.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json().catch(() => ({}));
  const wk = body.weekStart ?? reportWeek();
  if (body.action === 'seen') { await sb.from('weekly_reports').update({ seen_at: new Date().toISOString() }).eq('week_start', wk); return json({ ok: true }); }
  if (body.action === 'build') return json({ weekStart: wk, ...(await buildWeeklyReport(sb, userId, wk, body.ai !== false)) });
  const { data } = await sb.from('weekly_reports').select('*').order('week_start', { ascending: false }).limit(8);
  return json({ current: wk, reports: data ?? [] });
}));
