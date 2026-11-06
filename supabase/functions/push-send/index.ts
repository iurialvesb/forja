// POST /push-send (cada hora desde pg_cron, cabecera x-cron-secret).
// Envía: (1) a las 8-9 h los suplementos del día; (2) los avisos de macros aún no enviados, 45 min antes de la comida afectada.
import webpush from 'npm:web-push@3';
import { adminClient, json, env } from '../_shared/supabase.ts';

const SLOT_HOUR: Record<string, number> = { desayuno: 8, media_manana: 11, pre_entreno: 17, comida: 14, merienda: 17, post_entreno: 20, cena: 21, recena: 22 };

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'no autorizado' }, 401);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:forja@example.invalid', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const admin = adminClient();
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(now));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
  const { data: subs } = await admin.from('push_subscriptions').select('*');
  let sent = 0;
  const byUser = new Map<string, any[]>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  for (const [userId, list] of byUser) {
    const msgs: { title: string; body: string; tag: string }[] = [];
    const { data: alerts } = await admin.from('nutrition_alerts').select('*').eq('user_id', userId).eq('date', today).is('pushed_at', null);
    for (const a of alerts ?? []) {
      const h = a.slot ? SLOT_HOUR[a.slot] ?? 13 : 13;
      if (hour >= h - 1 && hour <= h) { msgs.push({ title: 'Ajuste de macros', body: a.message, tag: `alert-${a.id}` }); await admin.from('nutrition_alerts').update({ pushed_at: now.toISOString() }).eq('id', a.id); }
    }
    if (hour === 8) {
      const { data: ps } = await admin.from('planned_sessions').select('title, start_local, slot').eq('user_id', userId).eq('date', today).neq('status', 'skipped');
      if (ps?.length) msgs.push({ title: 'Hoy toca', body: ps.map((p: any) => `${p.start_local ?? (p.slot === 'am' ? 'Mañana' : 'Tarde')}: ${p.title}`).join(' · '), tag: `plan-${today}` });
    }
    for (const m of msgs) for (const s of list) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m)); sent++; }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', s.id); }
    }
  }
  return json({ sent });
});
