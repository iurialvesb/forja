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
import { normalizePantry } from '../_shared/engine/index.ts';

const schema = { type: 'object', required: ['items'], properties: {
  items: { type: 'array', items: { type: 'object', required: ['name', 'location', 'queryEn'], properties: {
    name: { type: 'string', description: 'Producto en español, corto y genérico sin marca ("lentejas cocidas", "atún claro al natural", "macarrones integrales")' },
    brand: { type: 'string', description: 'Marca si se dice (Hacendado, Consum, Bonduelle, La Fallera…). Mercadona = Hacendado' },
    queryEn: { type: 'string', description: 'Consulta USDA en inglés ("lentils cooked", "tuna canned in water drained")' },
    location: { type: 'string', enum: ['congelador', 'nevera', 'despensa'], description: 'Lo que diga; si no, el sitio habitual (latas, pasta, arroz, harinas, briks sin abrir → despensa)' },
    mode: { type: 'string', enum: ['units', 'weight'], description: "units = se gasta de una en una (huevos, latas, sobres, yogures, briks, botes, wraps, piezas de fruta). weight = se gasta por gramos/ml (pasta, arroz, legumbre seca, harina, avena, cereales, frutos secos, queso, embutido, carne, pescado fresco, leche, aceite)" },
    units: { type: 'number', description: 'Solo si mode=units: cuántas unidades HAY DENTRO (caja con 3 latas → 3; pack de 24 huevos → 24; caja de 10 sobres → 10). Nunca cuentes la caja o el pack como 1' },
    unitLabel: { type: 'string', description: 'Solo si mode=units: la unidad que se gasta, en singular: huevo, lata, sobre, yogur, brik, bote, wrap, unidad' },
    packUnits: { type: 'number', description: 'Si mode=units y viene en pack, cuántas traía entero' },
    unitGrams: { type: 'number', description: 'Si mode=units: gramos de cada unidad (peso ESCURRIDO de una lata si lo dice)' },
    quantityG: { type: 'number', description: 'Si mode=weight: gramos (o ml) totales que hay (2 paquetes de 500 g → 1000; 1 kg de arroz → 1000; 6 briks de 1 l de leche → 6000)' },
    packageG: { type: 'number', description: 'Si mode=weight: gramos (o ml) de un paquete (500 para pasta de 500 g)' },
    expiresOn: { type: 'string', description: 'YYYY-MM-DD solo si se indica' },
  } } },
  questions: { type: 'array', items: { type: 'string' } },
} };

const SYSTEM = `Organizas la despensa de un deportista que compra en Mercadona (marca Hacendado) y Consum. El texto suele venir dictado por voz, con errores ("100 × 100" = 100 %, "Pedro, sano" = Pedro Luis o similar, "Bon Dere" = Bonduelle).
Convierte TODO lo que cuenta en artículos: uno por producto. Decide cómo se gasta: por unidades (cuenta lo de DENTRO del envase: la caja de 3 latas son 3 latas; el pack de 24 huevos, 24 huevos; la caja de 10 sobres, 10 sobres) o por peso (paquetes y bolsas de pasta, arroz, legumbre seca, harina, etc.: gramos totales y gramos de un paquete).
No inventes productos ni cantidades que no se dicen. Responde rápido y en español.`;

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json();
  if (body.action === 'parse') {
    await requireAIConsent(sb);
    const r = await structured<{ items: any[]; questions?: string[] }>(sb, { system: SYSTEM, text: body.text, photoPath: body.photoPath, tool: 'despensa', schema, maxTokens: 4000, fast: true, lite: true });
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
      const n = normalizePantry({ name: it.name, units: it.units, packUnits: it.packUnits, unitGrams: it.unitGrams ?? (it.mode === 'units' ? f?.unitGrams : undefined), quantityG: it.quantityG, packageG: it.packageG, unitLabel: it.unitLabel, mode: it.mode });
      return { user_id: userId, name: it.name, food_id: f?.id ?? null, location: it.location ?? 'despensa', mode: n.mode, quantity_g: n.quantityG ?? null, package_g: n.packageG ?? null,
        units: n.units ?? null, unit_grams: n.unitGrams ?? null, pack_units: n.packUnits ?? null, unit_label: n.unitLabel ?? null,
        expires_on: it.expiresOn ?? null, barcode: it.barcode ?? null, brand: it.brand ?? null, image_url: it.imageUrl ?? null };
    });
    if (rows.length) { const { error } = await sb.from('pantry_items').insert(rows); if (error) throw error; }
    return json({ saved: rows.length, unresolved: rows.filter((r) => !r.food_id).map((r) => r.name) });
  }
  if (body.action === 'normalize') {
    // Una vez: lo que se guardó antes (p. ej. «1 ud × 500 g» de pasta) pasa a llevarse por peso o por unidades.
    const { data } = await sb.from('pantry_items').select('*').is('mode', null);
    for (const r of data ?? []) {
      const n = normalizePantry({ name: r.name, units: r.units != null ? +r.units : null, packUnits: r.pack_units, unitGrams: r.unit_grams != null ? +r.unit_grams : null, quantityG: r.quantity_g != null ? +r.quantity_g : null });
      await sb.from('pantry_items').update({ mode: n.mode, quantity_g: n.mode === 'weight' ? n.quantityG ?? null : null, package_g: n.packageG ?? null, units: n.mode === 'units' ? n.units : null, pack_units: n.packUnits ?? null, unit_label: n.unitLabel ?? null }).eq('id', r.id);
    }
    return json({ normalized: (data ?? []).length });
  }
  throw new HttpError(400, 'Acción desconocida');
}));
