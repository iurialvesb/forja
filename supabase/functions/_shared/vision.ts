// Utilidades para enviar texto o una foto (Storage) a Claude con salida estructurada.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { generate as claude, type ContentBlock } from './ai.ts';
import { HttpError } from './supabase.ts';

export async function requireAIConsent(sb: SupabaseClient) {
  const { data } = await sb.from('consents').select('kind').eq('kind', 'ai_processing').is('revoked_at', null).maybeSingle();
  if (!data) throw new HttpError(403, 'Necesito tu permiso explícito para usar el servicio de IA (Perfil → Privacidad e IA).');
}

export async function structured<T>(sb: SupabaseClient, args: { system: string; text?: string; photoPath?: string; tool: string; schema: Record<string, unknown>; maxTokens?: number }): Promise<T> {
  const content: ContentBlock[] = [];
  if (args.photoPath) {
    const { data: blob, error } = await sb.storage.from('workout-photos').download(args.photoPath);
    if (error || !blob) throw new HttpError(400, 'No puedo descargar la foto');
    const mt = args.photoPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    content.push({ type: 'image', source: { type: 'base64', media_type: mt, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) } });
  }
  content.push({ type: 'text', text: args.text ?? 'Analiza la imagen.' });
  const r = await claude({ system: args.system, maxTokens: args.maxTokens ?? 3000, temperature: 0, messages: [{ role: 'user', content }],
    tools: [{ name: args.tool, description: 'Devuelve el resultado estructurado', input_schema: args.schema }], toolChoice: { type: 'tool', name: args.tool } });
  const tu = r.content.find((b) => b.type === 'tool_use') as { input: T } | undefined;
  if (!tu) throw new Error('La IA no devolvió un resultado estructurado');
  return tu.input;
}
