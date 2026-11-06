// POST /ingest-session  { session: Session }  → alta con deduplicación + récords + adaptación del plan
import { handler, json, requireUser, userClient } from '../_shared/supabase.ts';
import { ingestSession } from '../_shared/ingest.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const { session, sessions } = await req.json();
  if (Array.isArray(sessions)) {            // importación por lotes (HealthKit histórico)
    const out: unknown[] = [];
    for (const s of sessions.slice(0, 200)) out.push(await ingestSession(sb, userId, s));
    return json({ results: out });
  }
  return json(await ingestSession(sb, userId, session));
}));
