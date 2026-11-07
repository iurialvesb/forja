// POST /intervals-sync
//  Usuario (JWT):  { action:'connect', athleteId, apiKey }  → comprueba la clave, guarda la conexión y trae el historial
//                  { action:'pull' }                         → trae lo nuevo de Intervals.icu y lo procesa al momento
//                  { action:'process' }                      → procesa el siguiente lote del buzón (importación del historial)
//                  { action:'status' } | { action:'disconnect' }
//  pg_cron (x-cron-secret): { action:'pull' } → para cada usuario conectado, deja lo nuevo en el buzón y avisa al móvil.
import webpush from 'npm:web-push@3';
import { handler, json, requireUser, userClient, adminClient, env, HttpError } from '../_shared/supabase.ts';
import { icu, pullToInbox, processIcuInbox } from '../_shared/intervals.ts';
import { disciplineFromIcu } from '../_shared/engine/index.ts';
import { todayMadrid } from '../_shared/context.ts';

const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function describe(a: any): { title: string; body: string } {
  const disc = disciplineFromIcu(a.type);
  const min = Math.round((a.elapsed_time ?? a.moving_time ?? 0) / 60);
  const km = a.distance ? `${(a.distance / 1000).toFixed(2).replace('.', ',')} km · ` : '';
  const hr = a.average_heartrate ? ` · FC ${Math.round(a.average_heartrate)}` : '';
  if (disc === 'crossfit') return { title: `Entreno recibido: ${a.name ?? 'Funcional'}`, body: `${min} min${hr}. Toca para añadir el WOD (pega el texto o haz la foto).` };
  return { title: `Entreno recibido: ${a.name ?? 'Actividad'}`, body: `${km}${min} min${hr}. Ya está analizado en Forja.` };
}

Deno.serve(handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  // ---------- pg_cron ----------
  if (req.headers.get('x-cron-secret')) {
    if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'no autorizado' }, 401);
    const admin = adminClient();
    const { data: conns } = await admin.from('intervals_connections').select('*');
    let pushed = 0;
    const vapid = Deno.env.get('VAPID_PUBLIC_KEY');
    if (vapid) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:forja@example.invalid', vapid, env('VAPID_PRIVATE_KEY'));
    for (const c of conns ?? []) {
      try {
        const r = await pullToInbox(admin, c);
        const fresh = r.newActivities.filter((a) => Date.now() - Date.parse(a.start_date ?? `${a.start_date_local}Z`) < 2 * 864e5);
        if (!fresh.length || !vapid) continue;
        const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', c.user_id);
        for (const a of fresh) for (const s of subs ?? []) {
          const m = { ...describe(a), tag: `icu-${a.id}`, url: disciplineFromIcu(a.type) === 'crossfit' ? '#/entrenos/wod' : '#/entrenos' };
          try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m)); pushed++; }
          catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', s.id); }
        }
      } catch (e) {
        await admin.from('intervals_connections').update({ last_error: String((e as Error).message ?? e) }).eq('user_id', c.user_id);
      }
    }
    return json({ users: conns?.length ?? 0, pushed });
  }
  // ---------- usuario ----------
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const action = body.action ?? 'pull';
  if (action === 'connect') {
    const athleteId = String(body.athleteId ?? '').trim(); const apiKey = String(body.apiKey ?? '').trim();
    if (!athleteId || !apiKey) throw new HttpError(400, 'Pon tu ID de atleta y tu API key de Intervals.icu');
    const me = await icu({ api_key: apiKey }, `/athlete/${encodeURIComponent(athleteId)}`);
    const historyFrom = addDays(todayMadrid(new Date()), -(Number(body.historyDays) || 365));
    const { error } = await sb.from('intervals_connections').upsert({ user_id: userId, athlete_id: me?.id ?? athleteId, api_key: apiKey, history_from: historyFrom, last_pull_at: null, last_error: null });
    if (error) throw error;
    const { data: conn } = await sb.from('intervals_connections').select('*').single();
    const r = await pullToInbox(sb, conn, { oldest: historyFrom });
    const { count } = await sb.from('intervals_inbox').select('id', { count: 'exact', head: true }).eq('kind', 'activity').is('processed_at', null);
    return json({ ok: true, athlete: me?.name ?? null, found: r.newActivities.length, pending: count ?? 0, wellness: r.wellness });
  }
  const { data: conn } = await sb.from('intervals_connections').select('*').maybeSingle();
  if (action === 'status') {
    if (!conn) return json({ connected: false });
    const { count } = await sb.from('intervals_inbox').select('id', { count: 'exact', head: true }).eq('kind', 'activity').is('processed_at', null);
    const { count: total } = await sb.from('intervals_inbox').select('id', { count: 'exact', head: true }).eq('kind', 'activity');
    return json({ connected: true, athleteId: conn.athlete_id, lastPullAt: conn.last_pull_at, lastError: conn.last_error, pending: count ?? 0, total: total ?? 0 });
  }
  if (action === 'disconnect') {
    await sb.from('intervals_connections').delete().eq('user_id', userId);
    return json({ ok: true });
  }
  if (!conn) return json({ connected: false, activities: 0, days: 0, remaining: 0, prs: [], changes: [] });
  if (action === 'pull') {
    try { await pullToInbox(sb, conn); } catch (e) { await sb.from('intervals_connections').update({ last_error: String((e as Error).message ?? e) }).eq('user_id', userId); throw e; }
  }
  const r = await processIcuInbox(sb, userId, Math.min(20, Number(body.limit) || 12));
  return json({ connected: true, ...r });
}));
