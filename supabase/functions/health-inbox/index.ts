// POST /health-inbox  (lo llama tu Atajo de iOS; cabecera  x-forja-token: <tu token>)
// Guarda los datos tal cual en tu buzón. No lee ni escribe nada más con permisos de servidor.
import { adminClient, json, corsHeaders } from '../_shared/supabase.ts';
import { sha256Hex } from '../_shared/token.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const token = req.headers.get('x-forja-token') ?? new URL(req.url).searchParams.get('token');
  if (!token) return json({ error: 'Falta el token' }, 401);
  const admin = adminClient();
  const { data: t } = await admin.from('ingest_tokens').select('user_id').eq('token_hash', await sha256Hex(token)).maybeSingle();
  if (!t) return json({ error: 'Token no válido' }, 401);
  const raw = await req.text();
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { payload = { texto: raw }; }
  if (raw.length > 200_000) return json({ error: 'Demasiados datos' }, 413);
  await admin.from('health_inbox').insert({ user_id: t.user_id, payload });
  await admin.from('ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', t.user_id);
  return json({ ok: true, mensaje: 'Recibido. Se procesará cuando abras Forja.' });
});
