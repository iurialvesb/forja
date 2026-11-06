// GET /export-data → todos tus datos en JSON (copia de seguridad y portabilidad).
// La caché de Strava se excluye: no es tuya para exportar fuera de Strava y caduca a los 7 días.
import { handler, requireUser, userClient, corsHeaders } from '../_shared/supabase.ts';

const TABLES = ['profiles', 'body_metrics', 'physiology', 'availability', 'injuries', 'goals', 'phases', 'planned_sessions', 'plan_changes',
  'user_exercises', 'sessions', 'session_sources', 'session_blocks', 'session_sets', 'run_splits', 'personal_records', 'daily_health',
  'checkins', 'readiness_daily', 'photo_imports', 'coach_threads', 'coach_messages', 'coach_memory', 'consents',
  'calendar_settings', 'calendar_events', 'nutrition_settings', 'nutrition_goal_history', 'recipes', 'planned_meals', 'food_logs', 'day_targets',
  'pantry_items', 'batch_plans', 'supplements', 'supplement_logs', 'nutrition_alerts'];

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), userId, format: 'forja-export-v1' };
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select('*').range(from, from + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t] = rows;
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="forja-${new Date().toISOString().slice(0, 10)}.json"` } });
}));
