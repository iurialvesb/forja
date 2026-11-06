// POST /parse-photo
//   { action: 'parse', importId }                          → lee la foto y devuelve lectura + preguntas
//   { action: 'confirm', importId, answers, startedAt, durationS? } → crea la sesión y adapta el plan
// La foto se sube antes desde la app a Storage: workout-photos/<userId>/<uuid>.jpg

import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { generate as claude, MODEL, PROVIDER_LABEL } from '../_shared/ai.ts';
import { collectQuestions, toSession, type ParsedWorkout } from '../_shared/engine/index.ts';
import { schema, SYSTEM } from '../_shared/workoutSchema.ts';
import { ingestSession } from '../_shared/ingest.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json();
  const { data: imp, error } = await sb.from('photo_imports').select('*').eq('id', body.importId).single();
  if (error || !imp) throw new HttpError(404, 'Importación no encontrada');

  if (body.action === 'parse') {
    const { data: consent } = await sb.from('consents').select('kind').eq('kind', 'ai_processing').is('revoked_at', null).maybeSingle();
    if (!consent) throw new HttpError(403, `Necesito tu permiso explícito para enviar la foto al servicio de IA (${PROVIDER_LABEL()}). Actívalo en Perfil → Privacidad e IA.`);
    await sb.from('photo_imports').update({ status: 'parsing' }).eq('id', imp.id);
    const { data: blob, error: dl } = await sb.storage.from('workout-photos').download(imp.storage_path);
    if (dl || !blob) throw new HttpError(400, 'No puedo descargar la foto');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mediaType = imp.storage_path.endsWith('.png') ? 'image/png' : imp.storage_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    try {
      const r = await claude({
        system: SYSTEM, maxTokens: 4000, temperature: 0,
        tools: [{ name: 'registrar_lectura', description: 'Registra la lectura estructurada del entrenamiento', input_schema: schema }],
        toolChoice: { type: 'tool', name: 'registrar_lectura' },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: encodeBase64(bytes) } },
          { type: 'text', text: 'Transcribe y estructura este entrenamiento.' },
        ] }],
      });
      const tu = r.content.find((b) => b.type === 'tool_use') as { input: ParsedWorkout } | undefined;
      if (!tu) throw new Error('El modelo no devolvió una lectura estructurada');
      const parsed = tu.input;
      parsed.uncertainties ??= [];
      const { data: prof } = await sb.from('profiles').select('sex').eq('id', userId).single();
      const questions = collectQuestions(parsed, { sex: prof?.sex ?? undefined });
      await sb.from('photo_imports').update({ status: 'needs_answers', parsed, questions, model: MODEL() }).eq('id', imp.id);
      return json({ parsed, questions });
    } catch (e) {
      await sb.from('photo_imports').update({ status: 'failed', error: String(e) }).eq('id', imp.id);
      throw e;
    }
  }

  if (body.action === 'confirm') {
    if (!imp.parsed) throw new HttpError(400, 'Primero hay que leer la foto');
    const parsed: ParsedWorkout = body.parsed ?? imp.parsed;   // la app permite corregir la lectura antes de confirmar
    const answers: Record<string, string> = body.answers ?? {};
    const pending = (imp.questions ?? []).filter((q: any) => q.id !== 'rpe' && !answers[q.id]);
    if (pending.length && !body.allowPending) return json({ needsAnswers: pending }, 422);
    const startedAt = body.startedAt ?? (parsed.date ? `${parsed.date}T18:00:00Z` : imp.created_at);
    const session = toSession(parsed, answers, { id: crypto.randomUUID(), startedAt, durationS: body.durationS });
    const result = await ingestSession(sb, userId, { ...session, source: 'photo', externalId: imp.id });
    await sb.from('photo_imports').update({ status: 'confirmed', answers, parsed, session_id: result.sessionId }).eq('id', imp.id);
    return json(result);
  }
  throw new HttpError(400, 'Acción desconocida');
}));
