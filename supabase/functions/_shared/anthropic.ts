// Cliente mínimo de la API de Claude (Messages API). La clave vive solo en el servidor.
import { env } from './supabase.ts';

export const MODEL = () => Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';

export interface Tool { name: string; description: string; input_schema: Record<string, unknown> }
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export interface Message { role: 'user' | 'assistant'; content: string | ContentBlock[] }

export async function claude(args: {
  system: string; messages: Message[]; tools?: Tool[]; toolChoice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  maxTokens?: number; temperature?: number;
}): Promise<{ content: ContentBlock[]; stop_reason: string; usage: any }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(), max_tokens: args.maxTokens ?? 2048, system: args.system, messages: args.messages,
      tools: args.tools, tool_choice: args.toolChoice, temperature: args.temperature,
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  return await res.json();
}

export function textOf(content: ContentBlock[]): string {
  return content.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text).join('\n').trim();
}
