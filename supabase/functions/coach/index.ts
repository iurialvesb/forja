// POST /coach { threadId?, message }  → respuesta del entrenador IA basada en TUS datos.
// El modelo no inventa cifras: consulta herramientas que ejecutan el motor determinista sobre tu historial.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { generate as claude, textOf, type Message, type Tool, type ContentBlock } from '../_shared/ai.ts';
import { loadContext, type AthleteContext } from '../_shared/context.ts';
import { adaptUpcoming, ensureWeeks, markMissed, rowToPlanned } from '../_shared/replan.ts';
import { computeWeek, supplementsToday, loadSettings } from '../_shared/nutrition.ts';
import {
  recommendLoad, predictions, fmtPace, fmtTime, weeklyRunKm, intensityDistribution, mondayOf, addDays, isoDate,
  internalLoad, regionalLoad, legIndex, legFatigueLevel, acwrStatus, resolveExercise, getExercise, phaseAt, isKeyRun, META, mealMacros,
} from '../_shared/engine/index.ts';

const TOOLS: Tool[] = [
  { name: 'estado_hoy', description: 'Recuperación de hoy (puntuación, motivos, molestias), fatiga de piernas, carga (CTL/ATL/TSB, ACWR) y sesiones planificadas para hoy.', input_schema: { type: 'object', properties: {} } },
  { name: 'plan', description: 'Sesiones planificadas entre dos fechas con su prescripción y motivo.', input_schema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' } }, required: ['desde', 'hasta'] } },
  { name: 'historial', description: 'Sesiones realizadas en los últimos N días (opcionalmente de una disciplina) con carga, fatiga de piernas y contenido.', input_schema: { type: 'object', properties: { dias: { type: 'integer' }, disciplina: { type: 'string' } }, required: ['dias'] } },
  { name: 'ejercicio', description: 'Historial, marcas reales y estimadas, 1RM de trabajo y cargas recomendadas para un ejercicio de fuerza.', input_schema: { type: 'object', properties: { nombre: { type: 'string' }, series: { type: 'integer' }, repeticiones: { type: 'integer' }, rir: { type: 'integer' } }, required: ['nombre'] } },
  { name: 'running', description: 'VDOT y en qué se basa, ritmos de entrenamiento, zonas de FC, predicciones, km semanales de las últimas 10 semanas y distribución de intensidad.', input_schema: { type: 'object', properties: {} } },
  { name: 'objetivos', description: 'Objetivos activos con fechas, prioridades y fases de la planificación.', input_schema: { type: 'object', properties: {} } },
  { name: 'ajustar_plan', description: 'Aplica un ajuste al plan pasando siempre por las reglas del motor. accion: "reevaluar" (recalcula próximos días con el estado actual), "no_realizada" (la sesión plannedId no se hará), "mover" (plannedId a fecha/franja; se rechaza si rompe reglas de carga), "regenerar_semanas".', input_schema: { type: 'object', properties: { accion: { type: 'string', enum: ['reevaluar', 'no_realizada', 'mover', 'regenerar_semanas'] }, plannedId: { type: 'string' }, fecha: { type: 'string' }, franja: { type: 'string', enum: ['am', 'pm'] } }, required: ['accion'] } },
  { name: 'nutricion', description: 'Objetivo de macros y kcal del día (según el entreno y el objetivo nutricional), comidas planificadas con sus macros, lo comido, avisos de lo que falta o sobra y balance semanal.', input_schema: { type: 'object', properties: { fecha: { type: 'string' } } } },
  { name: 'despensa', description: 'Lo que hay en casa por lugar (congelador, nevera, despensa), con cantidades y caducidades.', input_schema: { type: 'object', properties: {} } },
  { name: 'suplementos_hoy', description: 'Qué suplementos de los que tiene conviene tomar hoy y por qué, según lo comido en 7 días y el entreno de hoy.', input_schema: { type: 'object', properties: {} } },
  { name: 'calendario', description: 'Clases de CrossFit reservadas (WodBuster/calendario) y días u horas bloqueados por la agenda en las próximas 3 semanas.', input_schema: { type: 'object', properties: {} } },
  { name: 'recordar', description: 'Guarda un hecho duradero sobre el deportista que ha dicho explícitamente (preferencias, contexto, molestias recurrentes).', input_schema: { type: 'object', properties: { hecho: { type: 'string' }, categoria: { type: 'string', enum: ['preferencia', 'molestia', 'contexto', 'objetivo', 'general'] } }, required: ['hecho'] } },
];

function systemPrompt(ctx: AthleteContext): string {
  const phase = phaseAt(ctx.phases, ctx.today);
  return `Eres el entrenador personal y asesor nutricional de este deportista: experto en running, CrossFit, fuerza, halterofilia, entrenamiento híbrido, HYROX, recuperación, preparación física y nutrición deportiva.
Hoy es ${ctx.today} (Europa/Madrid). Fase actual: ${phase ? `${phase.kind} — ${phase.focus}` : 'sin fase'}.
Objetivos: ${ctx.goals.map((g) => `${g.name} (${g.date}, prioridad ${g.priority})`).join('; ') || 'ninguno'}.
Lo que sabes de él/ella: ${ctx.memory.map((m) => m.fact).join(' | ') || 'nada aún'}.

Cómo trabajas:
- Antes de responder sobre su entrenamiento, consulta las herramientas. Nunca inventes cifras, pesos, ritmos ni fechas: usa solo los datos que devuelvan.
- Justifica cada recomendación con sus datos reales (p. ej. "tu fatiga de piernas estimada es 280, por encima de 250", "tu 1RM de trabajo es 98 kg").
- Si faltan datos para decidir, dilo y explica qué registrar para tenerlos (test de 5 km, RPE, check-in).
- Los cambios de plan se hacen con la herramienta ajustar_plan; nunca prometas un cambio sin aplicarlo.
- Distingue fatiga normal, agujetas y posibles señales de lesión. No diagnosticas ni sustituyes a un médico o fisioterapeuta: ante dolor punzante, articular, que altera el movimiento, con inflamación, hormigueo o que dura más de una semana, recomienda valoración profesional y quita carga sobre la zona.
- Guarda con "recordar" solo hechos duraderos que el deportista te diga.
- Responde en español, claro y directo, pensado para leer en el móvil. Sin relleno.
- En nutrición: los macros los calcula el sistema con bases de datos de alimentos (USDA, Open Food Facts); no los estimes tú. Para suplementos no hagas recomendaciones médicas: si hay medicación o patologías, remite a su médico o dietista-nutricionista.
- No tienes acceso a datos descargados de Strava (sus condiciones lo prohíben para IA); trabajas con Apple Health, registros manuales y fotos.`;
}

function sessionLine(ctx: AthleteContext, s: any) {
  const il = internalLoad(s, ctx.profile); const leg = legIndex(regionalLoad(s, ctx.profile.weightKg ?? 75));
  const pace = s.distanceM && s.discipline === 'running' ? `, ${(s.distanceM / 1000).toFixed(1)} km a ${fmtPace(s.durationS / (s.distanceM / 1000))}` : '';
  const content = (s.blocks ?? []).map((b: any) => `${b.kind}${b.format ? `/${b.format}` : ''}: ${b.sets.slice(0, 8).map((x: any) => `${getExercise(x.exerciseId)?.name ?? x.exerciseId}${x.reps ? ` ${x.reps}` : ''}${x.loadKg ? `@${x.loadKg}kg` : ''}${x.distanceM ? ` ${x.distanceM}m` : ''}`).join(', ')}${b.rounds ? ` ×${b.rounds}` : ''}${b.resultText ? ` → ${b.resultText}` : ''}`).join(' | ');
  return { fecha: isoDate(s.startedAt), disciplina: s.discipline, titulo: s.title, minutos: Math.round(s.durationS / 60), rpe: s.rpe, fcMedia: s.avgHr, carga: Math.round(il.load), cargaFuente: il.source, fatigaPiernas: Math.round(leg), resumen: `${pace}${content ? ` ${content}` : ''}`.trim() };
}

async function runTool(sb: SupabaseClient, ctx: AthleteContext, name: string, input: any): Promise<unknown> {
  switch (name) {
    case 'estado_hoy': {
      const f = ctx.fitness[ctx.fitness.length - 1];
      const { data } = await sb.from('planned_sessions').select('*').eq('date', ctx.today);
      return { recuperacion: ctx.readiness, fatigaPiernas: { valor: Math.round(ctx.legFatigueNow), nivel: legFatigueLevel(ctx.legFatigueNow), umbrales: { moderada: 140, alta: 250 } },
        carga: f ? { ctl: Math.round(f.ctl), atl: Math.round(f.atl), tsb: Math.round(f.tsb), acwr: f.acwr && Number(f.acwr.toFixed(2)), estadoAcwr: acwrStatus(f.acwr) } : null,
        hoy: (data ?? []).map((r: any) => ({ id: r.id, titulo: r.title, tipo: r.type, franja: r.slot, estado: r.status, motivo: r.rationale, pasos: r.steps })) };
    }
    case 'plan': {
      const { data } = await sb.from('planned_sessions').select('*').gte('date', input.desde).lte('date', input.hasta).order('date');
      const { data: ch } = await sb.from('plan_changes').select('date, action, reason, created_at').gte('date', input.desde).lte('date', input.hasta).order('created_at', { ascending: false }).limit(20);
      return { sesiones: (data ?? []).map((r: any) => ({ id: r.id, fecha: r.date, franja: r.slot, tipo: r.type, titulo: r.title, objetivo: r.objective, intensidad: r.intensity, minutos: r.est_minutes, km: r.planned_km, estado: r.status, motivo: r.rationale, pasos: r.steps })), cambiosRecientes: ch };
    }
    case 'historial': {
      const from = addDays(ctx.today, -Math.min(180, input.dias ?? 14));
      return ctx.sessions.filter((s) => isoDate(s.startedAt) >= from && (!input.disciplina || s.discipline === input.disciplina)).map((s) => sessionLine(ctx, s));
    }
    case 'ejercicio': {
      const r = resolveExercise(input.nombre);
      if (!r) return { error: `No reconozco "${input.nombre}"` };
      const s = ctx.lifts[r.id];
      if (!s) return { ejercicio: getExercise(r.id)?.name, sinDatos: true, nota: 'No hay registros de este ejercicio todavía.' };
      const schemes = input.repeticiones ? [[input.series ?? 3, input.repeticiones, input.rir ?? 2]] : [[5, 5, 2], [4, 3, 1], [3, 8, 2]];
      return { ejercicio: getExercise(r.id)?.name, marcaReal1RM: s.bestActual1RM, mejorEstimacion: s.bestE1RM, rmDeTrabajo: s.workingE1RM, mejoresPorRepeticiones: s.repPRs, evolucion: s.history.slice(-12),
        recomendaciones: schemes.map(([sets, reps, rir]) => recommendLoad({ summary: s, sets, reps, rir, readiness: ctx.readiness.level })) };
    }
    case 'running': {
      const km = weeklyRunKm(ctx.sessions); const w0 = mondayOf(ctx.today);
      const weeks = Array.from({ length: 10 }, (_, i) => addDays(w0, -7 * (9 - i))).map((w) => ({ semana: w, km: Number((km.get(w) ?? 0).toFixed(1)) }));
      const runs28 = ctx.sessions.filter((s) => s.discipline === 'running' && isoDate(s.startedAt) >= addDays(ctx.today, -28));
      const p = ctx.paces;
      return { vdot: p ? Number(p.vdot.toFixed(1)) : null, basadoEn: ctx.vdotNote ?? 'Sin competición, test ni rodaje exigente reciente: no puedo calcular ritmos fiables.',
        ritmos: p ? { suave: `${fmtPace(p.easy[0])}–${fmtPace(p.easy[1])}`, maraton: fmtPace(p.marathon), media: fmtPace(p.halfMarathon), umbral: fmtPace(p.threshold), series: fmtPace(p.interval), repeticiones: fmtPace(p.repetition) } : null,
        predicciones: p ? predictions(p.vdot).map((x) => ({ distancia: x.key, tiempo: fmtTime(x.timeS) })) : null, notaPredicciones: 'Orientativas: asumen entrenamiento específico para cada distancia.',
        zonasFC: ctx.zones, kmSemanales: weeks, distribucionIntensidad28d: intensityDistribution(runs28) };
    }
    case 'objetivos': return { objetivos: ctx.goals, fases: ctx.phases };
    case 'ajustar_plan': {
      if (input.accion === 'reevaluar') return { cambios: await adaptUpcoming(sb, ctx, 'manual') };
      if (input.accion === 'regenerar_semanas') return { notas: await ensureWeeks(sb, ctx, true) };
      if (input.accion === 'no_realizada') return { cambio: await markMissed(sb, ctx, input.plannedId) };
      if (input.accion === 'mover') {
        const { data } = await sb.from('planned_sessions').select('*').gte('date', addDays(input.fecha, -1)).lte('date', addDays(input.fecha, 1));
        const { data: me } = await sb.from('planned_sessions').select('*').eq('id', input.plannedId).single();
        if (!me) return { error: 'Sesión no encontrada' };
        const p = rowToPlanned(me);
        const around = (data ?? []).map(rowToPlanned).filter((x) => x.id !== p.id && x.status !== 'skipped');
        const sameDay = around.filter((x) => x.date === input.fecha);
        const problems: string[] = [];
        if (sameDay.some((x) => x.slot === (input.franja ?? p.slot))) problems.push('ya hay una sesión en esa franja');
        if (sameDay.some((x) => META[x.type].legStress >= 2) && p.legStress >= 2) problems.push('juntaría dos sesiones duras de pierna el mismo día');
        if (isKeyRun(p.type) && around.some((x) => x.date !== input.fecha && isKeyRun(x.type))) problems.push('quedaría pegada a otra sesión clave de carrera');
        if (problems.length) return { rechazado: true, motivo: problems.join('; ') };
        await sb.from('planned_sessions').update({ date: input.fecha, slot: input.franja ?? p.slot, status: 'modified', locked: true }).eq('id', p.id);
        await sb.from('plan_changes').insert({ user_id: ctx.userId, planned_session_id: p.id, date: input.fecha, trigger: 'manual', action: 'move', reason: `Movida a petición tuya del ${p.date} al ${input.fecha}.`, before: { date: p.date, slot: p.slot }, after: { date: input.fecha, slot: input.franja ?? p.slot } });
        return { ok: true };
      }
      return { error: 'Acción desconocida' };
    }
    case 'nutricion': {
      const fecha = input.fecha ?? ctx.today;
      const w = await computeWeek(sb, ctx, mondayOf(fecha), false);
      const d = w.days.find((x) => x.date === fecha);
      return d ? { objetivo: w.settings.mode, dia: { fecha, carga: d.target.load, objetivoMacros: d.target.macros, porque: d.target.explanation, totalPrevisto: d.totals, comidoFueraDelMenu: d.eaten,
        comidas: d.meals.map((m) => ({ id: m.id, franja: m.slot, plato: m.title, estado: m.status, ingredientes: m.ingredients.map((i) => `${i.name} ${Math.round(i.grams)} g`), macros: mealMacros(m, w.foods) })), avisos: d.alerts }, balanceSemanal: w.balance } : { error: 'Fecha fuera de rango' };
    }
    case 'despensa': {
      const { data } = await sb.from('pantry_items').select('name, location, quantity_g, units, expires_on').order('location');
      return data ?? [];
    }
    case 'suplementos_hoy': { const st = await loadSettings(sb, ctx); return await supplementsToday(sb, ctx, st); }
    case 'calendario': return ctx.calendar ?? { nota: 'Calendario no conectado (Perfil → Calendario y WodBuster).' };
    case 'recordar': {
      await sb.from('coach_memory').insert({ user_id: ctx.userId, fact: input.hecho, category: input.categoria ?? 'general' });
      return { ok: true };
    }
  }
  return { error: `Herramienta desconocida ${name}` };
}

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const { threadId: tId, message } = await req.json();
  if (!message || typeof message !== 'string') throw new HttpError(400, 'Falta el mensaje');
  const { data: consent } = await sb.from('consents').select('kind').eq('kind', 'ai_processing').is('revoked_at', null).maybeSingle();
  if (!consent) throw new HttpError(403, 'Para usar el coach necesito tu permiso explícito para enviar tus datos de entrenamiento al servicio de IA (Ajustes → Privacidad e IA).');

  let threadId = tId;
  if (!threadId) {
    const { data } = await sb.from('coach_threads').insert({ user_id: userId, title: message.slice(0, 60) }).select('id').single();
    threadId = data!.id;
  }
  const { data: prev } = await sb.from('coach_messages').select('role, content').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(20);
  const history: Message[] = (prev ?? []).reverse().map((m: any) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.text ?? '' }));
  const { data: um } = await sb.from('coach_messages').insert({ user_id: userId, thread_id: threadId, role: 'user', content: { text: message } }).select('id').single();

  const ctx = await loadContext(sb, userId);
  const messages: Message[] = [...history, { role: 'user', content: message }];
  const toolLog: { name: string; input: unknown }[] = [];
  let finalText = '';
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) {
    // Modelo Pro mientras haya margen de tiempo; si la conversación se alarga, Flash (más rápido) para no cortar la respuesta.
    const r = await claude({ system: systemPrompt(ctx), messages, tools: TOOLS, maxTokens: 2000, smart: Date.now() - t0 < 40_000 });
    messages.push({ role: 'assistant', content: r.content });
    const uses = r.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    if (!uses.length || r.stop_reason !== 'tool_use') { finalText = textOf(r.content); break; }
    const results: ContentBlock[] = [];
    for (const u of uses) {
      toolLog.push({ name: u.name, input: u.input });
      try { results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(await runTool(sb, ctx, u.name, u.input)) }); }
      catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, content: String(e), is_error: true }); }
    }
    messages.push({ role: 'user', content: results });
  }
  if (!finalText) finalText = 'No he podido completar el análisis. Inténtalo de nuevo.';
  await sb.from('coach_messages').insert({ user_id: userId, thread_id: threadId, role: 'assistant', content: { text: finalText, tools: toolLog } });
  return json({ threadId, reply: finalText, tools: toolLog.map((t) => t.name), userMessageId: um?.id });
}));
