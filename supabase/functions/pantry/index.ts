// POST /pantry
//  { action:'parse', text?|photoPath? } → "tengo 1 kg de pollo en el congelador, arroz, 6 huevos…" → artículos estructurados por lugar
//  { action:'save', items:[{name, location, quantityG?, units?, expiresOn?, queryEn?}] } → resuelve alimentos y guarda
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { resolveFood } from '../_shared/foods.ts';
import { requireAIConsent, structured } from '../_shared/vision.ts';

const schema = { type: 'object', required: ['items'], properties: {
  items: { type: 'array', items: { type: 'object', required: ['name', 'location', 'queryEn'], properties: {
    name: { type: 'string', description: 'Nombre en español' }, queryEn: { type: 'string', description: 'Consulta USDA en inglés, en crudo (p. ej. "chicken breast raw")' },
    location: { type: 'string', enum: ['congelador', 'nevera', 'despensa'], description: 'Lo que diga el usuario; si no lo dice, el sitio habitual de ese alimento' },
    locationGuessed: { type: 'boolean' }, quantityG: { type: 'number' }, units: { type: 'number' }, unitGrams: { type: 'number' },
    expiresOn: { type: 'string', description: 'YYYY-MM-DD solo si se indica' },
  } } },
  questions: { type: 'array', items: { type: 'string' } },
} };

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json();
  if (body.action === 'parse') {
    await requireAIConsent(sb);
    const r = await structured<{ items: any[]; questions?: string[] }>(sb, {
      system: 'Organizas la despensa de un deportista. Convierte lo que cuenta (o lo que se ve en la foto de su nevera/despensa) en artículos con cantidad y lugar. No inventes productos; si una cantidad no se dice, déjala vacía. Responde en español.',
      text: body.text, photoPath: body.photoPath, tool: 'despensa', schema });
    return json(r);
  }
  if (body.action === 'save') {
    const rows: any[] = [];
    for (const it of body.items ?? []) {
      const f = await resolveFood(sb, it.name, it.queryEn);
      rows.push({ user_id: userId, name: it.name, food_id: f?.id ?? null, location: it.location, quantity_g: it.quantityG ?? null, units: it.units ?? null, unit_grams: it.unitGrams ?? f?.unitGrams ?? null, expires_on: it.expiresOn ?? null });
    }
    if (rows.length) { const { error } = await sb.from('pantry_items').insert(rows); if (error) throw error; }
    return json({ saved: rows.length, unresolved: rows.filter((r) => !r.food_id).map((r) => r.name) });
  }
  throw new HttpError(400, 'Acción desconocida');
}));
