// POST  { action: 'start' }      (autenticado) → URL de autorización de Strava
// GET   ?code=&state=&scope=     (redirección de Strava) → guarda tokens y vuelve a la app (forja://strava)
// POST  { action: 'disconnect' } (autenticado) → revoca acceso y borra tokens y caché
import { handler, json, requireUser, userClient, adminClient, env, HttpError } from '../_shared/supabase.ts';
import { signState, verifyState, tokenRequest, accessToken } from '../_shared/strava.ts';

const CALLBACK = () => `${env('SUPABASE_URL')}/functions/v1/strava-auth`;
const APP_RETURN = () => Deno.env.get('APP_URL_SCHEME') ?? 'forja://strava';

Deno.serve(handler(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const userId = await verifyState(url.searchParams.get('state') ?? '');
    const code = url.searchParams.get('code');
    if (!userId || !code) return Response.redirect(`${APP_RETURN()}?ok=0&error=estado_invalido`, 302);
    const scope = url.searchParams.get('scope') ?? '';
    if (!scope.includes('activity:read')) return Response.redirect(`${APP_RETURN()}?ok=0&error=permiso_actividades`, 302);
    const t = await tokenRequest({ grant_type: 'authorization_code', code });
    const admin = adminClient();
    await admin.from('strava_tokens').upsert({ user_id: userId, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(t.expires_at * 1000).toISOString() });
    await admin.from('strava_connections').upsert({ user_id: userId, athlete_id: t.athlete.id, scopes: scope });
    await admin.from('consents').upsert({ user_id: userId, kind: 'strava', version: '2026-06', granted_at: new Date().toISOString(), revoked_at: null });
    return Response.redirect(`${APP_RETURN()}?ok=1`, 302);
  }

  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json();
  if (body.action === 'start') {
    const u = new URL('https://www.strava.com/oauth/mobile/authorize');
    u.search = new URLSearchParams({ client_id: env('STRAVA_CLIENT_ID'), redirect_uri: CALLBACK(), response_type: 'code', approval_prompt: 'auto', scope: 'read,activity:read_all,activity:write', state: await signState(userId) }).toString();
    return json({ url: u.toString() });
  }
  if (body.action === 'disconnect') {
    const admin = adminClient();
    try {
      const token = await accessToken(admin, userId);
      await fetch('https://www.strava.com/oauth/revoke', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: `access_token=${token}` });
    } catch (e) { console.warn('revoke', e); }
    await admin.from('strava_tokens').delete().eq('user_id', userId);
    await admin.from('strava_cache').delete().eq('user_id', userId);
    await admin.from('session_sources').delete().eq('user_id', userId).eq('source', 'strava');
    await admin.from('strava_connections').delete().eq('user_id', userId);
    await admin.from('consents').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).eq('kind', 'strava');
    return json({ ok: true });
  }
  throw new HttpError(400, 'Acción desconocida');
}));
