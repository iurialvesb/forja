// Strava: OAuth, refresco de tokens y lectura de actividades.
// Limitaciones reales (API Policy, junio 2026): app en "Single Player Mode" (1 atleta) basta para uso personal;
// requiere suscripción de Strava del desarrollador; caché máx. 7 días; prohibido usar los datos en IA.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { env } from './supabase.ts';

export const STRAVA_API = () => Deno.env.get('STRAVA_API_BASE') ?? 'https://www.strava.com/api/v3';

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('STRAVA_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]!));
}
export async function signState(userId: string): Promise<string> {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${await hmac(payload)}`;
}
export async function verifyState(state: string): Promise<string | null> {
  const [uid, ts, sig] = state.split('.');
  if (!uid || !ts || !sig) return null;
  if (Date.now() - Number(ts) > 15 * 60_000) return null;
  return (await hmac(`${uid}.${ts}`)) === sig ? uid : null;
}

export async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), ...params }),
  });
  if (!res.ok) throw new Error(`Strava token ${res.status}: ${await res.text()}`);
  return await res.json();
}

/** Devuelve un access token válido (refresca si caduca en < 5 min). Usa cliente de servicio. */
export async function accessToken(admin: SupabaseClient, userId: string): Promise<string> {
  const { data: t, error } = await admin.from('strava_tokens').select('*').eq('user_id', userId).single();
  if (error || !t) throw new Error('Strava no conectado');
  if (Date.parse(t.expires_at) - Date.now() > 5 * 60_000) return t.access_token;
  const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  await admin.from('strava_tokens').update({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: new Date(r.expires_at * 1000).toISOString() }).eq('user_id', userId);
  return r.access_token;
}

export async function stravaGet(token: string, path: string) {
  const res = await fetch(`${STRAVA_API()}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new Error('Límite de peticiones de Strava alcanzado; se reintentará');
  if (!res.ok) throw new Error(`Strava ${res.status}: ${await res.text()}`);
  return await res.json();
}

/**
 * Escribe la descripción del entreno en la actividad de Strava vinculada (permiso activity:write).
 * Es contenido del usuario que se ENVÍA a Strava; no se lee ni se procesa nada de su API.
 */
export async function pushDescription(sb: SupabaseClient, userId: string, sessionId: string, text: string): Promise<string> {
  const { data: link } = await sb.from('session_sources').select('external_id').eq('session_id', sessionId).eq('source', 'strava').maybeSingle();
  if (!link) return 'No hay actividad de Strava vinculada a esta sesión todavía.';
  const { adminClient } = await import('./supabase.ts');
  const token = await accessToken(adminClient(), userId);
  const res = await fetch(`${STRAVA_API()}/activities/${link.external_id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ description: text.slice(0, 2000) }) });
  if (!res.ok) throw new Error(`Strava ${res.status}`);
  return 'Descripción actualizada en Strava.';
}
