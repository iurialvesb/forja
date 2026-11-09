// POST /pantry
//  { action:'parse', text?|photoPath? }      → lista dictada ("dos sobres de puré Hacendado, 6 latas de atún de 60 g…") → artículos con cantidad, marca y lugar
//  { action:'match', items:[{name, brand?}] } → producto real de Open Food Facts para cada artículo (foto, marca, formato, macros)
//  { action:'search', q, brand? }             → candidatos para elegir a mano
//  { action:'barcode', code }                 → producto por código de barras (escáner)
//  { action:'recipe', ids? }                  → receta rápida con lo que caduca antes (o con los artículos elegidos)
//  { action:'save', items:[{name, location, quantityG?, units?, unitGrams?, expiresOn?, queryEn?, barcode?, brand?, imageUrl?}] }
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { resolveFood } from '../_shared/foods.ts';
import { requireAIConsent, structured } from '../_shared/vision.ts';
import { offByCode, offSearch, cacheProduct, pool } from '../_shared/off.ts';

const schema = { type: 'object', required: ['items'], properties: {
  items: { type: 'array', items: { type: 'object', required: ['name', 'location', 'queryEn'], properties: {
    name: { type: 'string', description: 'Producto en español, corto y genérico sin marca ("lentejas cocidas", "atún claro al natural", "macarrones integrales")' },
    brand: { type: 'string', description: 'Marca si se dice (Hacendado, Consum, Bonduelle, La Fallera…). Mercadona = Hacendado' },
    queryEn: { type: 'string', description: 'Consulta USDA en inglés ("lentils cooked", "tuna canned in water drained")' },
    location: { type: 'string', enum: ['congelador', 'nevera', 'despensa'], description: 'Lo que diga; si no, el sitio habitual (latas, pasta, arroz, harinas, briks sin abrir → despensa)' },
    units: { type: 'number', description: 'Nº de unidades que quedan (latas, sobres, huevos, yogures, briks)' },
    packUnits: { type: 'number', description: 'Si es un pack (caja de 4 sobres, docena de huevos), cuántas unidades traía entero' },
    unitGrams: { type: 'number', description: 'Gramos por unidad (peso ESCURRIDO si lo dice)' },
    quantityG: { type: 'number', description: 'Gramos totales solo si se dice un peso total sin unidades (1 kg de arroz → 1000)' },
    expiresOn: { type: 'string', description: 'YYYY-MM-DD solo si se indica' },
  } } },
  questions: { type: 'array', items: { type: 'string' } },
} };

const SYSTEM = `Organizas la despensa de un deportista que compra en Mercadona (marca Hacendado) y Consum. El texto suele venir dictado por voz, con errores ("100 × 100" = 100 %, "Pedro, sano" = Pedro Luis o similar, "Bon Dere" = Bonduelle).
Convierte TODO lo que cuenta en artículos: uno por producto, con nº de unidades y gramos por unidad (escurridos si lo dice) o gramos totales.
No inventes productos ni cantidades que no se dicen. Responde rápido y en español.`;

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json();
  if (body.action === 'parse') {
    await requireAIConsent(sb);
    const r = await structured<{ items: any[]; questions?: string[] }>(sb, { system: SYSTEM, text: body.text, photoPath: body.photoPath, tool: 'despensa', schema, maxTokens: 4000, fast: true });
    return json(r);
  }
  if (body.action === 'recipe') {
    await requireAIConsent(sb);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
    const soon = new Date(Date.parse(`${today}T12:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10);
    let q = sb.from('pantry_items').select('id,name,quantity_g,units,unit_grams,expires_on,location');
    q = body.ids?.length ? q.in('id', body.ids) : q.not('expires_on', 'is', null).lte('expires_on', soon);
    const { data: items } = await q;
    const { data: rest } = await sb.from('pantry_items').select('name').limit(80);
    const { data: set } = await sb.from('nutrition_settings').select('mode,preferences').maybeSingle();
    if (!items?.length) return json({ recipe: null, note: 'No hay nada que caduque en los próximos 3 días.' });
    const r = await structured<any>(sb, {
      system: 'Eres un cocinero práctico para un deportista (running + CrossFit) que hace batch cooking. Propón UNA receta sencilla (≤ 30 min) que gaste lo que caduca, usando sobre todo lo que ya tiene en casa. Español de España. Cantidades en gramos para 1 ración salvo que tenga sentido hacer 2-3 raciones para el batch.',
      text: `Caduca pronto: ${items.map((i: any) => `${i.name}${i.quantity_g ? ` (${i.quantity_g} g)` : i.units ? ` (${i.units} ud)` : ''}, caduca ${i.expires_on ?? '—'}`).join('; ')}.\nTambién tiene: ${(rest ?? []).map((x: any) => x.name).join(', ')}.\nObjetivo nutricional: ${set?.mode ?? 'mantenimiento'}. Preferencias: ${JSON.stringify(set?.preferences ?? {})}.`,
      tool: 'receta', maxTokens: 1500, fast: true,
      schema: { type: 'object', required: ['title', 'servings', 'ingredients', 'steps'], properties: {
        title: { type: 'string' }, servings: { type: 'number' }, minutes: { type: 'number' },
        ingredients: { type: 'array', items: { type: 'object', required: ['name', 'grams'], properties: { name: { type: 'string' }, grams: { type: 'number' }, fromPantry: { type: 'boolean' } } } },
        steps: { type: 'array', items: { type: 'string' } }, tip: { type: 'string', description: 'Cómo guardarlo o encajarlo en el menú (comida, cena, táper)' },
      } },
    });
    return json({ recipe: r, uses: items.map((i: any) => i.name) });
  }
  if (body.action === 'match') {
    const items: { name: string; brand?: string }[] = (body.items ?? []).slice(0, 40);
    const res = await pool(items, 5, async (it) => {
      const c = await offSearch(it.name, it.brand, 4).catch(() => []);
      const best = c[0];
      if (best) cacheProduct(best).catch(() => {});
      return { best: best ?? null, alternatives: c.slice(1) };
    });
    return json({ matches: res });
  }
  if (body.action === 'search') {
    const c = await offSearch(String(body.q ?? ''), body.brand, 8);
    for (const p of c) cacheProduct(p).catch(() => {});
    return json({ products: c });
  }
  if (body.action === 'barcode') {
    const p = await offByCode(String(body.code ?? '').replace(/\D/g, ''));
    if (!p) return json({ product: null, message: 'Ese código no está en Open Food Facts. Escribe el producto y lo busco por nombre.' });
    await cacheProduct(p);
    return json({ product: p });
  }
  if (body.action === 'save') {
    const rows = await pool(body.items ?? [], 6, async (it: any) => {
      const f = it.barcode ? (await resolveFood(sb, it.name, undefined, it.barcode)) : await resolveFood(sb, it.name, it.queryEn).catch(() => null);
      return { user_id: userId, name: it.name, food_id: f?.id ?? null, location: it.location ?? 'despensa', quantity_g: it.quantityG ?? null, units: it.units ?? null, unit_grams: it.unitGrams ?? f?.unitGrams ?? null,
        expires_on: it.expiresOn ?? null, barcode: it.barcode ?? null, brand: it.brand ?? null, image_url: it.imageUrl ?? null, pack_units: it.packUnits ?? (it.units > 1 ? it.units : null) };
    });
    if (rows.length) { const { error } = await sb.from('pantry_items').insert(rows); if (error) throw error; }
    return json({ saved: rows.length, unresolved: rows.filter((r) => !r.food_id).map((r) => r.name) });
  }
  throw new HttpError(400, 'Acción desconocida');
}));
