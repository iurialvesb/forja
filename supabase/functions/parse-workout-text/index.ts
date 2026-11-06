// POST /parse-workout-text
//  { action:'parse', text, date? } → interpretación (motor determinista; IA solo si hace falta y hay permiso),
//                                    resumen del volumen, preguntas y sesiones del Apple Watch de ese día para vincular.
//  { action:'confirm', parsed, answers, startedAt?, durationS?, linkSessionId?, pushToStrava? }
// El texto lo pega o comparte el usuario (p. ej. copiado de la descripción de Strava): no se lee de la API de Strava.
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { parseWorkoutText, describeParsed, collectQuestions, toSession, type ParsedWorkout } from '../_shared/engine/index.ts';
import { generate as claude } from '../_shared/ai.ts';
import { schema, SYSTEM } from '../_shared/workoutSchema.ts';
import { ingestSession } from '../_shared/ingest.ts';
import { todayMadrid } from '../_shared/context.ts';
import { pushDescription } from '../_shared/strava.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json();
  if (body.action === 'parse') {
    const text: string = (body.text ?? '').trim();
    if (!text) throw new HttpError(400, 'Pega el texto del entreno');
    let parsed: ParsedWorkout & { unparsed?: string[] } = parseWorkoutText(text);
    let engine: 'motor' | 'motor+ia' = 'motor';
    const doubtful = parsed.uncertainties.length > 0 || !parsed.sections.length;
    if (doubtful) {
      const { data: consent } = await sb.from('consents').select('kind').eq('kind', 'ai_processing').is('revoked_at', null).maybeSingle();
      if (consent) {
        const r = await claude({ system: SYSTEM, maxTokens: 4000, temperature: 0, tools: [{ name: 'registrar_lectura', description: 'Registra la lectura estructurada del entrenamiento', input_schema: schema }],
          toolChoice: { type: 'tool', name: 'registrar_lectura' },
          messages: [{ role: 'user', content: `Estructura este entrenamiento escrito por el atleta. Mi intérprete automático lo leyó así (corrige solo lo que esté mal o falte):\n${JSON.stringify(parsed.sections)}\n\nTexto original:\n${text}` }] });
        const tu = r.content.find((b) => b.type === 'tool_use') as { input: ParsedWorkout } | undefined;
        if (tu?.input?.sections?.length) { parsed = { ...tu.input, title: tu.input.title ?? parsed.title, uncertainties: tu.input.uncertainties ?? [] }; engine = 'motor+ia'; }
      }
    }
    const { data: prof } = await sb.from('profiles').select('sex').eq('id', userId).single();
    const date = body.date ?? todayMadrid();
    const { data: sameDay } = await sb.from('sessions').select('id, started_at, duration_s, discipline, title, avg_hr, primary_source').is('deleted_at', null)
      .gte('started_at', `${date}T00:00:00Z`).lte('started_at', `${date}T23:59:59Z`).order('started_at');
    const candidates = (sameDay ?? []).filter((s: any) => s.discipline !== 'running' && s.discipline !== 'walking');
    return json({ parsed, summary: describeParsed(parsed), questions: collectQuestions(parsed, { sex: prof?.sex ?? undefined }), engine,
      candidates: candidates.map((s: any) => ({ id: s.id, startedAt: s.started_at, minutes: Math.round(s.duration_s / 60), title: s.title, avgHr: s.avg_hr, source: s.primary_source })) });
  }
  if (body.action === 'confirm') {
    const parsed: ParsedWorkout = body.parsed;
    if (!parsed?.sections) throw new HttpError(400, 'Falta la interpretación');
    let startedAt = body.startedAt; let durationS = body.durationS;
    if (body.linkSessionId) {
      const { data: s } = await sb.from('sessions').select('started_at, duration_s').eq('id', body.linkSessionId).single();
      if (s) { startedAt = s.started_at; durationS = s.duration_s; }
    }
    const session = toSession(parsed, body.answers ?? {}, { id: crypto.randomUUID(), startedAt: startedAt ?? new Date().toISOString(), durationS });
    const result = await ingestSession(sb, userId, { ...session, source: 'manual', externalId: `text:${crypto.randomUUID()}` }, body.linkSessionId);
    let strava: string | undefined;
    if (body.pushToStrava && body.text) strava = await pushDescription(sb, userId, result.sessionId, String(body.text)).catch((e) => `No se pudo actualizar Strava: ${(e as Error).message}`);
    return json({ ...result, strava });
  }
  throw new HttpError(400, 'Acción desconocida');
}));
