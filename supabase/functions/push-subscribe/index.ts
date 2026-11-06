// POST /push-subscribe { subscription } | { unsubscribe: endpoint }
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const b = await req.json();
  if (b.unsubscribe) { await sb.from('push_subscriptions').delete().eq('endpoint', b.unsubscribe); return json({ ok: true }); }
  const s = b.subscription;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'Suscripción no válida');
  await sb.from('push_subscriptions').upsert({ user_id: userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }, { onConflict: 'endpoint' });
  return json({ ok: true });
}));
