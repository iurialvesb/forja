// POST /nutrition-log
//  { action:'parse', text?|photoPath?|barcode? } → alimentos detectados con gramos y macros de la base de datos
//  { action:'confirm', date, slot, items:[{foodId,name,grams}], source, plannedMealId?, deductPantry? } → guarda y reequilibra
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { resolveFood, loadFoods } from '../_shared/foods.ts';
import { requireAIConsent, structured } from '../_shared/vision.ts';
import { macrosOf, addMacros, ZERO, roundMacros, consume, type Macros } from '../_shared/engine/index.ts';
import { offSearch, cacheProduct, pool } from '../_shared/off.ts';

const schema = { type: 'object', required: ['items'], properties: {
  items: { type: 'array', items: { type: 'object', required: ['nameEs', 'queryEn', 'grams', 'gramsConfidence', 'cooked'], properties: {
    nameEs: { type: 'string', description: 'Nombre en español, simple (p. ej. "arroz blanco cocido")' },
    queryEn: { type: 'string', description: 'Consulta para USDA en inglés con estado (p. ej. "rice white cooked", "chicken breast raw")' },
    grams: { type: 'number', description: 'Gramos (o ml). Convierte unidades caseras: 1 huevo 60 g, 1 cucharada de aceite 10 g, 1 rebanada de pan 30 g' },
    gramsConfidence: { type: 'string', enum: ['dicho', 'estimado'], description: '"dicho" si el usuario lo indicó o se lee en el envase; "estimado" si lo deduces de una foto o una ración típica' },
    cooked: { type: 'boolean' }, barcode: { type: 'string' },
    brand: { type: 'string', description: 'Marca o sitio si lo dice (Hacendado, Consum, panadería…)' },
    packaged: { type: 'boolean', description: 'true si es un producto envasado de supermercado' },
  } } },
  questions: { type: 'array', items: { type: 'string' }, description: 'Preguntas si algo no se puede determinar (en español)' },
} };

const SYSTEM = `Eres dietista-nutricionista deportivo. Convierte lo que el usuario dice que ha comido (o la foto del plato o de una etiqueta) en una lista de alimentos con gramos.
- No inventes alimentos que no aparecen. Si no se distingue algo, pregúntalo en "questions".
- Si el usuario da cantidades, úsalas ("dicho"). Si no, estima raciones típicas españolas y márcalas "estimado".
- Indica si el peso es del alimento cocinado o crudo.
- Platos compuestos (lentejas estofadas, tortilla): descomponlos en ingredientes principales con sus gramos aproximados.`;

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json();
  if (body.action === 'parse') {
    if (body.barcode) {
      const f = await resolveFood(sb, '', undefined, body.barcode);
      if (!f) return json({ items: [], questions: ['No encuentro ese código en Open Food Facts. Escribe el producto o hazle una foto a la tabla nutricional.'] });
      const grams = f.unitGrams ?? 100;
      return json({ items: [{ foodId: f.id, name: f.name, grams, gramsConfidence: 'estimado', macros: roundMacros(macrosOf(f, grams)), source: f.source }], questions: ['¿Cuántos gramos has tomado?'] });
    }
    await requireAIConsent(sb);
    const r = await structured<{ items: any[]; questions?: string[] }>(sb, { system: SYSTEM, text: body.text ?? 'Identifica lo que hay en el plato.', photoPath: body.photoPath, tool: 'registrar_alimentos', schema, fast: true, lite: true });
    const items: Record<string, unknown>[] = [];
    const questions = [...(r.questions ?? [])];
    const found = await pool(r.items, 5, async (it: any) => {
      // Producto de supermercado con marca: primero el producto real (Open Food Facts); si no, base genérica.
      if ((it.brand || it.packaged) && !it.barcode) {
        const p = (await offSearch(it.nameEs, it.brand, 3, true).catch(() => []))[0];
        if (p?.food) { cacheProduct(p).catch(() => {}); return { it, f: p.food, imageUrl: p.imageUrl }; }
      }
      return { it, f: await resolveFood(sb, it.nameEs, it.queryEn, it.barcode, it.cooked).catch(() => null), imageUrl: undefined };
    });
    for (const { it, f, imageUrl } of found) {
      if (!f) { questions.push(`No encuentro "${it.nameEs}" en la base de datos de alimentos. ¿Puedes decirme la marca o escanear el código de barras?`); continue; }
      items.push({ foodId: f.id, name: it.nameEs, grams: Math.round(it.grams), gramsConfidence: it.gramsConfidence, macros: roundMacros(macrosOf(f, it.grams)), source: f.source, imageUrl });
    }
    return json({ items, questions });
  }
  if (body.action === 'confirm') {
    const items: { foodId: string; name: string; grams: number }[] = body.items ?? [];
    if (!items.length) throw new HttpError(400, 'No hay alimentos');
    const foods = await loadFoods(sb, items.map((i) => i.foodId));
    const withMacros = items.filter((i) => foods[i.foodId]).map((i) => ({ ...i, macros: roundMacros(macrosOf(foods[i.foodId], i.grams)) }));
    const tot: Macros = withMacros.reduce((a, i) => addMacros(a, i.macros), { ...ZERO });
    await sb.from('food_logs').insert({ user_id: userId, date: body.date, slot: body.slot ?? null, items: withMacros, kcal: tot.kcal, protein: tot.protein, carbs: tot.carbs, fat: tot.fat,
      fiber: tot.fiber, vit_c_mg: tot.vitCMg, magnesium_mg: tot.magnesiumMg, source: body.source ?? 'manual', planned_meal_id: body.plannedMealId ?? null, photo_path: body.photoPath ?? null });
    if (body.plannedMealId) await sb.from('planned_meals').update({ ...(body.title ? { title: body.title } : {}), status: 'eaten', ingredients: withMacros.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, role: 'other' })) }).eq('id', body.plannedMealId);
    let missing: { name: string; grams: number }[] = [];
    if (body.deductPantry) {
      const { data: pantry } = await sb.from('pantry_items').select('*');
      const before = (pantry ?? []).map((p: any) => ({ id: p.id, name: p.name, foodId: p.food_id ?? undefined, location: p.location, quantityG: p.quantity_g != null ? Number(p.quantity_g) : undefined, units: p.units != null ? Number(p.units) : undefined, unitGrams: p.unit_grams != null ? Number(p.unit_grams) : undefined, expiresOn: p.expires_on ?? undefined }));
      const r = consume(before, withMacros.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, role: 'other' as const })));
      missing = r.missing;
      for (const b of before) {
        const a = r.pantry.find((x) => x.id === b.id);
        if (!a) await sb.from('pantry_items').delete().eq('id', b.id);
        else if (a.quantityG !== b.quantityG || a.units !== b.units) await sb.from('pantry_items').update({ quantity_g: a.quantityG ?? null, units: a.units ?? null }).eq('id', b.id);
      }
    }
    // El reequilibrio del día lo recalcula la app al volver a pintar (nutrition-day): así guardar es inmediato.
    return json({ logged: roundMacros(tot), day: null, missingInPantry: missing });
  }
  throw new HttpError(400, 'Acción desconocida');
}));
