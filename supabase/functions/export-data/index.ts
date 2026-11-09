// GET /export-data → todos tus datos en JSON (copia de seguridad y portabilidad).
// La caché de Strava se excluye: no es tuya para exportar fuera de Strava y caduca a los 7 días.
import { handler, requireUser, userClient, corsHeaders } from '../_shared/supabase.ts';

const TABLES = ['profiles', 'body_metrics', 'physiology', 'availability', 'injuries', 'goals', 'phases', 'planned_sessions', 'plan_changes',
  'user_exercises', 'sessions', 'session_sources', 'session_blocks', 'session_sets', 'run_splits', 'personal_records', 'daily_health',
  'checkins', 'readiness_daily', 'photo_imports', 'coach_threads', 'coach_messages', 'coach_memory', 'consents',
  'calendar_settings', 'calendar_events', 'nutrition_settings', 'nutrition_goal_history', 'recipes', 'planned_meals', 'food_logs', 'day_targets',
  'pantry_items', 'batch_plans', 'supplements', 'supplement_logs', 'nutrition_alerts', 'shopping_lists', 'workout_drafts', 'session_edits',
  'session_laps', 'session_streams', 'weekly_reports'];

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const fmt = new URL(req.url).searchParams.get('format') ?? (req.method === 'POST' ? (await req.clone().json().catch(() => ({}))).format : null);
  if (fmt === 'csv') {
    // Una fila por serie registrada (con su entreno): para abrir en Excel / Google Sheets.
    const { data: ss } = await sb.from('sessions').select('id,started_at,title,discipline,duration_s,distance_m,avg_hr,rpe,session_sets(position,exercise_id,set_label,reps,load_kg,distance_m,calories,duration_s,split_s,status)').is('deleted_at', null).order('started_at');
    const esc = (v: unknown) => { const x = v == null ? '' : String(v); return /[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const head = ['fecha', 'hora', 'entreno', 'disciplina', 'duracion_min', 'distancia_km', 'fc_media', 'rpe', 'tramo', 'ejercicio', 'reps', 'kg', 'metros', 'cal', 'seg', 'parcial_s', 'estado'];
    const lines = [head.join(';')];
    for (const s of ss ?? []) {
      const base = [s.started_at.slice(0, 10), s.started_at.slice(11, 16), s.title, s.discipline, Math.round(s.duration_s / 60), s.distance_m ? (s.distance_m / 1000).toFixed(2).replace('.', ',') : '', s.avg_hr, s.rpe];
      const sets = (s.session_sets ?? []).sort((a: any, b: any) => a.position - b.position);
      if (!sets.length) lines.push([...base, '', '', '', '', '', '', '', '', ''].map(esc).join(';'));
      for (const x of sets) lines.push([...base, x.set_label, x.exercise_id, x.reps, x.load_kg, x.distance_m, x.calories, x.duration_s, x.split_s, x.status].map(esc).join(';'));
    }
    return new Response('\ufeff' + lines.join('\n'), { headers: { ...corsHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="forja-entrenos-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const errors: string[] = [];
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), userId, format: 'forja-export-v1', errors };
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select('*').range(from, from + 999);
      if (error) { errors.push(`${t}: ${error.message}`); break; }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t] = rows;
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="forja-${new Date().toISOString().slice(0, 10)}.json"` } });
}));
