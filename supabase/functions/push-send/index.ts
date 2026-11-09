// POST /push-send (cada hora desde pg_cron, cabecera x-cron-secret).
// Envía: (1) a las 8 h el plan del día; (2) los avisos de macros, antes de la comida afectada; (3) a las 9 h lo que caduca en ≤ 2 días
// y los suplementos que se acaban; (4) el domingo a las 20 h, el resumen semanal (también si no tienes notificaciones activadas).
import webpush from 'npm:web-push@3';
import { adminClient, json, env } from '../_shared/supabase.ts';
import { buildWeeklyReport, reportWeek } from '../_shared/weekly.ts';

const SLOT_HOUR: Record<string, number> = { desayuno: 8, media_manana: 11, pre_entreno: 17, comida: 14, merienda: 17, post_entreno: 20, cena: 21, recena: 22 };

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'no autorizado' }, 401);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:forja@example.invalid', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const admin = adminClient();
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(now));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
  const { data: subs } = await admin.from('push_subscriptions').select('*');
  const dow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(now);
  const plus = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const weekly = new Map<string, string>();
  if (dow === 'Sun' && hour === 20) {
    const { data: users } = await admin.from('profiles').select('id');
    for (const u of users ?? []) { try { const r = await buildWeeklyReport(admin, u.id, reportWeek(now)); weekly.set(u.id, r.text); } catch (e) { console.warn('weekly', u.id, e); } }
  }
  let sent = 0;
  const byUser = new Map<string, any[]>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  for (const [userId, list] of byUser) {
    const msgs: { title: string; body: string; tag: string; url?: string }[] = [];
    const { data: alerts } = await admin.from('nutrition_alerts').select('*').eq('user_id', userId).eq('date', today).is('pushed_at', null);
    for (const a of alerts ?? []) {
      const h = a.slot ? SLOT_HOUR[a.slot] ?? 13 : 13;
      if (hour >= h - 1 && hour <= h) { msgs.push({ title: 'Ajuste de macros', body: a.message, tag: `alert-${a.id}` }); await admin.from('nutrition_alerts').update({ pushed_at: now.toISOString() }).eq('id', a.id); }
    }
    if (hour === 8) {
      const { data: ps } = await admin.from('planned_sessions').select('title, start_local, slot').eq('user_id', userId).eq('date', today).neq('status', 'skipped');
      if (ps?.length) msgs.push({ title: 'Hoy toca', body: ps.map((p: any) => `${p.start_local ?? (p.slot === 'am' ? 'Mañana' : 'Tarde')}: ${p.title}`).join(' · '), tag: `plan-${today}` });
    }
    if (hour === 9) {
      const { data: exp } = await admin.from('pantry_items').select('id,name,expires_on').eq('user_id', userId).not('expires_on', 'is', null).lte('expires_on', plus(2)).gte('expires_on', today)
        .or(`expiry_pushed_on.is.null,expiry_pushed_on.lt.${today}`);
      if (exp?.length) {
        msgs.push({ title: 'Caduca pronto', body: `${exp.map((x: any) => `${x.name} (${x.expires_on === today ? 'hoy' : x.expires_on === plus(1) ? 'mañana' : 'pasado'})`).join(', ')}. Abre la despensa y te propongo una receta.`, tag: `exp-${today}`, url: '#/nutricion/despensa' } as any);
        await admin.from('pantry_items').update({ expiry_pushed_on: today }).in('id', exp.map((x: any) => x.id));
      }
      const { data: low } = await admin.from('supplements').select('id,name,stock,low_pushed_on').eq('user_id', userId).eq('active', true).not('stock', 'is', null).lte('stock', 5);
      const lowNew = (low ?? []).filter((x: any) => !x.low_pushed_on || x.low_pushed_on < plus(-7));
      if (lowNew.length) {
        msgs.push({ title: 'Se acaban tus suplementos', body: lowNew.map((x: any) => `${x.name}: quedan ${x.stock}`).join(' · '), tag: `supp-${today}`, url: '#/nutricion/suplementos' } as any);
        await admin.from('supplements').update({ low_pushed_on: today }).in('id', lowNew.map((x: any) => x.id));
      }
    }
    if (weekly.has(userId)) msgs.push({ title: 'Tu resumen de la semana', body: weekly.get(userId)!.slice(0, 220), tag: `weekly-${today}`, url: '#/coach' } as any);
    for (const m of msgs) for (const s of list) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m)); sent++; }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', s.id); }
    }
  }
  return json({ sent });
});
