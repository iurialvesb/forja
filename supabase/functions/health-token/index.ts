// POST /health-token → crea (o rota) tu token personal para el Atajo de Apple Salud. Se muestra una sola vez.
import { handler, json, requireUser, userClient, adminClient, env } from '../_shared/supabase.ts';
import { randomToken, sha256Hex } from '../_shared/token.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const token = randomToken();
  await adminClient().from('ingest_tokens').upsert({ user_id: userId, token_hash: await sha256Hex(token), created_at: new Date().toISOString() });
  return json({ token, url: `${env('SUPABASE_URL')}/functions/v1/health-inbox` });
}));
