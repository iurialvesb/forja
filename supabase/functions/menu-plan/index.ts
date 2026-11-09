// POST /menu-plan { weekStart, cookDate?, slotsByDay?: { 'YYYY-MM-DD': MealSlot[] } }
//      /menu-plan { action:'cooked'|'uncooked', weekStart } → he hecho el batch: descuenta (o devuelve) todo lo cocinado de la despensa
//      /menu-plan { action:'describe', text, weekStart? } → "he cocinado lentejas para 4 comidas y arroz para las cenas…" → al menú de esos días
// Funcionalidad principal: con lo que tienes en casa diseña el batch cooking del domingo y el menú de la semana,
// ajusta cada ración a tus macros de ese día (según el entreno), genera la lista de la compra y el plan de cocina.
import { handler, json, requireUser, userClient } from '../_shared/supabase.ts';
import { loadContext } from '../_shared/context.ts';
import { computeWeek } from '../_shared/nutrition.ts';
import { resolveFood } from '../_shared/foods.ts';
import { pool } from '../_shared/off.ts';
import { deductPantry, restorePantry } from '../_shared/pantryOps.ts';
import { requireAIConsent, structured } from '../_shared/vision.ts';
import {
  distribute, fitPortions, projectedShoppingList, buildBatchPlan, expiringSoon, addDays, mondayOf,
  type PlannedMeal, type Recipe, type Ingredient, type FoodIndex, type MealSlot, type PantryItem,
} from '../_shared/engine/index.ts';

const ing = { type: 'object', required: ['nameEs', 'queryEn', 'grams', 'role'], properties: {
  nameEs: { type: 'string' }, queryEn: { type: 'string', description: 'Consulta USDA en inglés y en crudo ("chicken breast raw", "rice white raw")' },
  grams: { type: 'number', description: 'Gramos EN CRUDO por ración base' }, role: { type: 'string', enum: ['protein', 'carb', 'fat', 'veg', 'fruit', 'dairy', 'other'] },
  fixed: { type: 'boolean', description: 'true para especias/condimentos que no se escalan' } } };
const schema = { type: 'object', required: ['recipes', 'assignments'], properties: {
  recipes: { type: 'array', items: { type: 'object', required: ['key', 'name', 'batch', 'ingredients', 'steps', 'fridgeDays', 'freezable'], properties: {
    key: { type: 'string' }, name: { type: 'string' }, batch: { type: 'boolean', description: 'true si se cocina en el batch del domingo; false si se monta en el momento (desayunos, meriendas)' },
    ingredients: { type: 'array', items: ing },
    steps: { type: 'array', items: { type: 'object', required: ['text', 'minutes', 'hands'], properties: { text: { type: 'string' }, minutes: { type: 'number' }, hands: { type: 'string', enum: ['activa', 'pasiva'] }, equipment: { type: 'string', enum: ['horno', 'fuego', 'olla', 'microondas', 'ninguno'] } } } },
    fridgeDays: { type: 'integer', description: 'Días que aguanta en nevera una vez cocinado (seguro: 3-4)' }, freezable: { type: 'boolean' },
    usesExpiring: { type: 'array', items: { type: 'string' } } } } },
  assignments: { type: 'array', items: { type: 'object', required: ['date', 'slot', 'recipeKey'], properties: { date: { type: 'string' }, slot: { type: 'string' }, recipeKey: { type: 'string' } } } },
  notes: { type: 'array', items: { type: 'string' } },
} };

const SYSTEM = `Eres dietista-nutricionista deportivo y cocinero de batch cooking. Diseñas el menú semanal de un atleta híbrido (running, CrossFit, HYROX).
Reglas:
- Usa primero lo que hay en casa, y antes que nada lo que caduca pronto. Solo añade compras cuando haga falta para cubrir proteína o variedad.
- 3 a 5 recetas de batch (se cocinan el día de batch) que se repitan con variedad; desayunos y meriendas rápidas de montar (batch:false).
- Cada comida principal con una fuente de proteína clara. Días de entreno duro: más hidratos en las comidas cercanas al entreno. Día de descanso: más verdura.
- Respeta lo que no le gusta y sus intolerancias. Recetas españolas, sencillas, que aguanten bien en táper.
- Las cantidades son orientativas para 1 ración: el sistema las ajustará a sus macros exactos.
- Seguridad alimentaria: cocinado en nevera 3-4 días; si un plato se come más tarde, que sea congelable.
- Asigna una receta a CADA comida solicitada (fecha + franja).
- "media_manana" es el ALMUERZO a media mañana en el trabajo: rápido de preparar por la mañana y que se coma frío, sin calentar (wrap o bocadillo con proteína). No es batch.
- Si sus preferencias incluyen un postre habitual (p. ej. yogur con granola y plátano), inclúyelo como ingredientes de esa comida para que cuente en los macros.
- Respeta SIEMPRE sus preferencias escritas.`;

const ING = { type: 'object', required: ['nameEs', 'queryEn', 'grams', 'role'], properties: {
  nameEs: { type: 'string' }, queryEn: { type: 'string', description: 'USDA en inglés con estado ("lentils cooked", "rice white cooked")' },
  grams: { type: 'number', description: 'Gramos por ración' }, role: { type: 'string', enum: ['protein', 'carb', 'fat', 'veg', 'fruit', 'dairy', 'other'] } } };
// Compacto para que la IA responda rápido: cada plato una vez y luego qué día/franja lo comes.
const describeSchema = { type: 'object', required: ['dishes', 'meals'], properties: {
  dishes: { type: 'array', items: { type: 'object', required: ['name', 'ingredients'], properties: { name: { type: 'string' }, ingredients: { type: 'array', items: ING } } } },
  meals: { type: 'array', items: { type: 'object', required: ['date', 'slot', 'dish'], properties: {
    date: { type: 'string', description: 'YYYY-MM-DD' }, slot: { type: 'string', enum: ['desayuno', 'media_manana', 'comida', 'merienda', 'cena'] },
    dish: { type: 'number', description: 'Índice (desde 0) del plato en dishes' }, extra: { type: 'string', description: 'Solo si a ese plato se le añade algo ese día (p. ej. proteína a la plancha en la cena)' } } } },
  usedFromPantry: { type: 'array', description: 'Lo gastado de casa al cocinar, total y como lo guarda (seco/crudo)', items: { type: 'object', required: ['nameEs', 'grams'], properties: { nameEs: { type: 'string' }, grams: { type: 'number' } } } },
  questions: { type: 'array', items: { type: 'string' } },
} };

async function describeCooking(sb: any, userId: string, ctx: any, text: string, weekStart: string) {
  const { data: st } = await sb.from('nutrition_settings').select('preferences').maybeSingle();
  const days = [...Array(10)].map((_, i) => addDays(ctx.today, i)).map((d) => `${d} (${new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))})`);
  const r0 = await structured<{ dishes: any[]; meals: any[]; usedFromPantry?: { nameEs: string; grams: number }[]; questions?: string[] }>(sb, {
    system: `Eres dietista deportivo. El usuario cuenta lo que ha cocinado (batch cooking) y qué va a comer cada día. Conviértelo en comidas por día y franja.
- Usa las fechas reales de la lista (hoy es ${ctx.today}). "mañana", "el lunes", "de lunes a jueves" → fechas concretas.
- Cada plato UNA vez en dishes (ingredientes por ración) y en meals qué fecha y franja lo comes. Si reparte un guiso en N táperes, cada ración = total / N. Si no dice cantidades, raciones típicas españolas para un deportista.
- Gramos en el estado indicado en queryEn (normalmente cocinado).
- Él solo cocina en batch las comidas y la guarnición de las cenas; la ensalada se la hace el día antes. Si en la cena solo hay guarnición, crea un plato «guarnición + proteína a la plancha» con una proteína sencilla (pollo, huevos o pescado).
- No inventes platos que no menciona. Pregunta en "questions" lo que no quede claro.
- En usedFromPantry pon lo que ha gastado de casa (total, no por ración), tal como lo tiene guardado (en seco/crudo).
Preferencias: ${st?.preferences ?? 'sin indicar'}`,
    text: `Días: ${days.join(', ')}\n\nLo que cuenta:\n${text}`, tool: 'comidas_cocinadas', schema: describeSchema, maxTokens: 3500, fast: true });
  const r = { ...r0, meals: r0.meals.filter((m) => r0.dishes[m.dish]).map((m) => ({ date: m.date, slot: m.slot, title: m.extra ? `${r0.dishes[m.dish].name} + ${m.extra}` : r0.dishes[m.dish].name, ingredients: r0.dishes[m.dish].ingredients })) };
  const cache = new Map<string, any>();
  const names = [...new Map(r.meals.flatMap((m) => m.ingredients).map((i: any) => [i.nameEs.toLowerCase(), i])).values()];
  await pool(names, 5, async (i: any) => { cache.set(i.nameEs.toLowerCase(), await resolveFood(sb, i.nameEs, i.queryEn, undefined, /cooked|cocid|asad|plancha/i.test(i.queryEn)).catch(() => null)); });
  const unresolved: string[] = [];
  const rows = r.meals.map((m) => ({
    user_id: userId, date: m.date, slot: m.slot, title: m.title, status: 'planned', locked: true, from_batch: true, updated_at: new Date().toISOString(),
    ingredients: m.ingredients.flatMap((i: any) => { const f = cache.get(i.nameEs.toLowerCase()); if (!f) { unresolved.push(i.nameEs); return []; } return [{ foodId: f.id, name: i.nameEs, grams: Math.round(i.grams), role: i.role }]; }),
  }));
  if (rows.length) { const { error } = await sb.from('planned_meals').upsert(rows, { onConflict: 'user_id,date,slot' }); if (error) throw error; }
  // Lo cocinado sale de la despensa ya (las comidas del batch no se vuelven a descontar al comerlas).
  const used = r.usedFromPantry?.length ? r.usedFromPantry.map((u) => ({ foodId: '', name: u.nameEs, grams: u.grams, role: 'other' as const }))
    : rows.flatMap((x) => x.ingredients).map((i: any) => ({ ...i, foodId: '' }));
  const d = await deductPantry(sb, used);
  const weeks = [...new Set(rows.map((x) => mondayOf(x.date)))];
  for (const w of weeks.length ? weeks : [weekStart]) await computeWeek(sb, ctx, w, true);
  return { meals: rows.map((x) => ({ date: x.date, slot: x.slot, title: x.title })), questions: r.questions ?? [], unresolved: [...new Set(unresolved)], pantryUsed: d.used, pantryMissing: d.missing };
}

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  await requireAIConsent(sb);
  const body = await req.json().catch(() => ({}));
  const ctx = await loadContext(sb, userId);
  if (body.action === 'describe') return json(await describeCooking(sb, userId, ctx, String(body.text ?? ''), body.weekStart ?? mondayOf(ctx.today)));
  if (body.action === 'cooked' || body.action === 'uncooked') {
    const ws = body.weekStart ?? mondayOf(ctx.today);
    const { data: bp } = await sb.from('batch_plans').select('*').eq('week_start', ws).maybeSingle();
    if (!bp) return json({ error: 'No hay batch planificado esa semana' }, 404);
    if (body.action === 'uncooked') {
      await restorePantry(sb, bp.pantry_deduction);
      await sb.from('batch_plans').update({ cooked_at: null, pantry_deduction: null }).eq('id', bp.id);
      return json({ ok: true });
    }
    if (bp.cooked_at) return json({ ok: true, already: true });
    // Todo lo que se cocina en el batch: ingredientes de las comidas "batch" de esa semana (ya ajustados a tus raciones).
    const { data: ms } = await sb.from('planned_meals').select('ingredients, status').eq('from_batch', true).gte('date', ws).lte('date', addDays(ws, 6)).neq('status', 'skipped');
    const all = new Map<string, { foodId: string; name: string; grams: number; role: 'other' }>();
    for (const m of ms ?? []) for (const i of m.ingredients ?? []) { const k = i.foodId || i.name; const c = all.get(k) ?? { foodId: i.foodId, name: i.name, grams: 0, role: 'other' as const }; c.grams += Number(i.grams) || 0; all.set(k, c); }
    const d = await deductPantry(sb, [...all.values()]);
    await sb.from('batch_plans').update({ cooked_at: new Date().toISOString(), pantry_deduction: d.changes }).eq('id', bp.id);
    return json({ ok: true, used: d.used, missing: d.missing });
  }
  const weekStart = body.weekStart ?? mondayOf(addDays(ctx.today, 1));
  const week = await computeWeek(sb, ctx, weekStart, false);
  const st = week.settings;
  const cookDate = body.cookDate ?? addDays(weekStart, -1);   // domingo anterior
  const { data: prefRow } = await sb.from('nutrition_settings').select('preferences').maybeSingle();
  const prefs: string | null = prefRow?.preferences ?? null;
  const { data: pRows } = await sb.from('pantry_items').select('*');
  const pantry: PantryItem[] = (pRows ?? []).map((p: any) => ({ id: p.id, name: p.name, foodId: p.food_id ?? undefined, location: p.location, quantityG: p.quantity_g != null ? +p.quantity_g : undefined, units: p.units != null ? +p.units : undefined, unitGrams: p.unit_grams != null ? +p.unit_grams : undefined, expiresOn: p.expires_on ?? undefined }));
  const { data: existing } = await sb.from('planned_meals').select('*').gte('date', weekStart).lte('date', addDays(weekStart, 6));
  const keep = new Set((existing ?? []).filter((m: any) => m.locked || m.status === 'eaten').map((m: any) => `${m.date}|${m.slot}`));
  const slotsByDay: Record<string, MealSlot[]> = body.slotsByDay ?? {};
  const requests = week.days.flatMap((d) => (slotsByDay[d.date] ?? st.mealSlots).filter((s) => !keep.has(`${d.date}|${s}`)).map((slot) => ({ date: d.date, slot })));

  const brief = {
    diaDeBatch: cookDate,
    despensa: { congelador: pantry.filter((p) => p.location === 'congelador').map((p) => `${p.name} ${p.quantityG ? p.quantityG + ' g' : p.units ? p.units + ' ud' : ''}`),
      nevera: pantry.filter((p) => p.location === 'nevera').map((p) => `${p.name} ${p.quantityG ? p.quantityG + ' g' : p.units ? p.units + ' ud' : ''}${p.expiresOn ? ` (caduca ${p.expiresOn})` : ''}`),
      despensa: pantry.filter((p) => p.location === 'despensa').map((p) => p.name) },
    caducaPronto: expiringSoon(pantry, cookDate, 5).map((p) => `${p.name} (${p.expiresOn})`),
    dias: week.days.map((d) => ({ fecha: d.date, carga: d.target.load, kcal: d.target.macros.kcal, proteina: d.target.macros.protein, hidratos: d.target.macros.carbs, grasa: d.target.macros.fat })),
    comidasAPlanificar: requests, objetivo: st.mode, noLeGusta: st.dislikes, intolerancias: st.intolerances, preferencias: prefs ?? undefined,
  };
  const r = await structured<{ recipes: any[]; assignments: { date: string; slot: string; recipeKey: string }[]; notes?: string[] }>(sb, {
    system: SYSTEM, text: `Prepara el menú y el batch cooking con estos datos:\n${JSON.stringify(brief, null, 1)}`, tool: 'menu_semanal', schema, maxTokens: 8000 });

  // Resolver ingredientes contra la base de datos (macros reales, no estimados por la IA).
  const foods: FoodIndex = {}; const unresolved: string[] = [];
  const cache = new Map<string, string | null>();
  const recipes: Record<string, Recipe & { batch: boolean; dbId?: string }> = {};
  for (const rc of r.recipes) {
    const ingredients: Ingredient[] = [];
    for (const i of rc.ingredients) {
      const k = i.nameEs.toLowerCase();
      if (!cache.has(k)) { const f = await resolveFood(sb, i.nameEs, i.queryEn); if (f) foods[f.id] = f; cache.set(k, f?.id ?? null); }
      const id = cache.get(k);
      if (!id) { unresolved.push(i.nameEs); continue; }
      ingredients.push({ foodId: id, name: i.nameEs, grams: i.grams, role: i.role, fixed: i.fixed });
    }
    recipes[rc.key] = { id: rc.key, name: rc.name, ingredients, steps: rc.steps, fridgeDays: Math.min(4, rc.fridgeDays), freezable: rc.freezable, batch: rc.batch };
  }
  // Guardar recetas.
  for (const rc of Object.values(recipes)) {
    const { data } = await sb.from('recipes').insert({ user_id: userId, name: rc.name, ingredients: rc.ingredients, steps: rc.steps, fridge_days: rc.fridgeDays, freezable: rc.freezable, tags: rc.batch ? ['batch'] : ['rapida'] }).select('id').single();
    rc.dbId = data?.id;
  }
  // Ajustar cada comida a los macros de su franja ese día.
  const meals: PlannedMeal[] = [];
  for (const d of week.days) {
    const slots = (slotsByDay[d.date] ?? st.mealSlots) as MealSlot[];
    const { data: dayS } = await sb.from('planned_sessions').select('slot, intensity').eq('date', d.date).neq('status', 'skipped');
    const trainingSlot = (dayS ?? []).find((x: any) => x.intensity !== 'baja')?.slot as 'am' | 'pm' | undefined;
    const share = distribute(d.target.macros, slots, trainingSlot);
    for (const a of r.assignments.filter((x) => x.date === d.date && !keep.has(`${x.date}|${x.slot}`))) {
      const rc = recipes[a.recipeKey]; if (!rc || !share[a.slot as MealSlot]) continue;
      const fit = fitPortions(rc.ingredients, foods, share[a.slot as MealSlot]);
      meals.push({ id: crypto.randomUUID(), date: d.date, slot: a.slot as MealSlot, recipeId: rc.id, title: rc.name, ingredients: fit.ingredients, status: 'planned', fromBatch: rc.batch });
    }
  }
  await sb.from('planned_meals').delete().gte('date', weekStart).lte('date', addDays(weekStart, 6)).eq('locked', false).neq('status', 'eaten');
  if (meals.length) {
    const { error } = await sb.from('planned_meals').insert(meals.map((m) => ({ user_id: userId, date: m.date, slot: m.slot, recipe_id: recipes[m.recipeId!]?.dbId ?? null, title: m.title, ingredients: m.ingredients, status: 'planned', from_batch: !!m.fromBatch })));
    if (error) throw error;
  }
  const { data: rem } = await sb.from('planned_meals').select('*').gte('date', ctx.today).lt('date', weekStart);
  const proj = projectedShoppingList({ pantry, remainingThisWeek: (rem ?? []).map((m: any) => ({ ingredients: m.ingredients, date: m.date, status: m.status })), meals, foods, shoppingDate: cookDate < ctx.today ? ctx.today : cookDate });
  const shopping = proj.items;
  await sb.from('shopping_lists').upsert({ user_id: userId, week_start: weekStart, shopping_date: cookDate, items: proj.items, covered: proj.coveredByStock, checked: [], updated_at: new Date().toISOString() });
  const batch = buildBatchPlan(cookDate, meals, recipes);
  await sb.from('batch_plans').upsert({ user_id: userId, week_start: weekStart, cook_date: cookDate, plan: batch, shopping }, { onConflict: 'user_id,week_start' });
  await computeWeek(sb, ctx, weekStart, true);   // reequilibrio y avisos con el menú nuevo
  return json({ weekStart, cookDate, meals: meals.length, batch, shopping, unresolved: [...new Set(unresolved)], notes: r.notes ?? [] });
}));
