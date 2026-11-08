// Proveedor de IA intercambiable. Por defecto Gemini (nivel gratuito de Google AI Studio).
// AI_PROVIDER=gemini (por defecto) | claude. Misma interfaz para todo el backend (mensajes, imágenes, herramientas).
// Aviso: en el nivel gratuito, Google puede usar el contenido enviado para mejorar sus productos.
import { claude as claudeCall, type ContentBlock, type Message, type Tool } from './anthropic.ts';
import { env } from './supabase.ts';

export type { ContentBlock, Message, Tool };
export const PROVIDER = () => (Deno.env.get('AI_PROVIDER') ?? 'gemini').toLowerCase();
export const MODEL = () => PROVIDER() === 'claude' ? (Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5') : (Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest');
export const PROVIDER_LABEL = () => PROVIDER() === 'claude' ? 'Anthropic (Claude)' : 'Google (Gemini)';

export interface GenArgs {
  system: string; messages: Message[]; tools?: Tool[]; toolChoice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  maxTokens?: number; temperature?: number; fast?: boolean;
}
export interface GenResult { content: ContentBlock[]; stop_reason: string; usage?: unknown }

/** JSON Schema → esquema OpenAPI que acepta Gemini (tipos en mayúsculas, sin additionalProperties). */
export function toGeminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties' || k === '$schema') continue;
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    else if (k === 'items') out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  if (out.type === 'OBJECT' && out.properties && !Object.keys(out.properties).length) delete out.properties;
  return out;
}

async function gemini(a: GenArgs): Promise<GenResult> {
  const idToName = new Map<string, string>();
  const contents = a.messages.map((m) => {
    const blocks: ContentBlock[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    const parts = blocks.map((b): any => {
      switch (b.type) {
        case 'text': return { text: b.text };
        case 'image': return { inline_data: { mime_type: b.source.media_type, data: b.source.data } };
        case 'tool_use': idToName.set(b.id, b.name); return { functionCall: { name: b.name, args: b.input ?? {} } };
        case 'tool_result': {
          let response: unknown; try { response = JSON.parse(b.content); } catch { response = { text: b.content }; }
          return { functionResponse: { name: idToName.get(b.tool_use_id) ?? 'herramienta', response: { result: response } } };
        }
      }
    });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const body: any = {
    systemInstruction: { parts: [{ text: a.system }] }, contents,
    generationConfig: { maxOutputTokens: a.maxTokens ?? 2048, temperature: a.temperature ?? 0.4 },
  };
  if (a.tools?.length) {
    body.tools = [{ functionDeclarations: a.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.input_schema) })) }];
    if (a.toolChoice?.type === 'tool' && a.toolChoice.name) body.toolConfig = { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [a.toolChoice.name] } };
    else if (a.toolChoice?.type === 'any') body.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
  }
  // Lecturas rápidas (fotos, texto): sin "razonamiento" previo, que en el nivel gratuito añade muchos segundos.
  if (a.fast) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  // Si el modelo está saturado (503) o sin cupo (429), se reintenta y luego se pasa a otro modelo gratuito.
  const models = [...new Set([MODEL(), 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])];
  let res: Response | undefined;
  let lastStatus = 0;
  outer: for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const think = body.generationConfig.thinkingConfig;
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') }, body: JSON.stringify(body) });
      if (res.status === 400 && body.generationConfig.thinkingConfig) {            // modelo que no admite desactivar el razonamiento
        const t = await res.clone().text();
        if (/thinking/i.test(t)) { delete body.generationConfig.thinkingConfig; attempt--; continue; }
      }
      if (res.status === 404) break;                                                 // ese modelo no existe en tu cuenta: siguiente
      if (res.status !== 429 && res.status !== 503 && res.status !== 500) break outer;
      lastStatus = res.status;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
    if (think) body.generationConfig.thinkingConfig = think;
  }
  if (!res!.ok) {
    const t = await res!.text();
    const st = res!.status || lastStatus;
    if (st === 429) throw new Error('Has llegado al límite gratuito de la IA de Google (por minuto o por día). Prueba en un rato.');
    if (st === 503 || st === 500) throw new Error('La IA de Google está saturada ahora mismo (lo he intentado con varios modelos). Prueba de nuevo en un minuto.');
    throw new Error(`La IA ha dado un error (${st}). ${t.slice(0, 160)}`);
  }
  const j = await res!.json();
  const parts: any[] = j.candidates?.[0]?.content?.parts ?? [];
  const content: ContentBlock[] = [];
  parts.forEach((p, i) => {
    if (p.text) content.push({ type: 'text', text: p.text });
    if (p.functionCall) content.push({ type: 'tool_use', id: `call_${i}_${crypto.randomUUID().slice(0, 8)}`, name: p.functionCall.name, input: p.functionCall.args ?? {} });
  });
  if (!content.length) {
    const reason = j.candidates?.[0]?.finishReason ?? j.promptFeedback?.blockReason ?? 'desconocido';
    throw new Error(`La IA no devolvió respuesta (${reason}).`);
  }
  return { content, stop_reason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn', usage: j.usageMetadata };
}

export async function generate(a: GenArgs): Promise<GenResult> {
  return PROVIDER() === 'claude' ? await claudeCall(a) : await gemini(a);
}

export function textOf(content: ContentBlock[]): string {
  return content.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text).join('\n').trim();
}
