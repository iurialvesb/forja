// Despensa (congelador / nevera / despensa), consumo, lista de la compra y batch cooking.

import type { PlannedMeal, Ingredient } from './meals.ts';
import { addDays, daysBetween } from './fitness.ts';

export type Location = 'congelador' | 'nevera' | 'despensa';

export interface PantryItem {
  id: string;
  name: string;
  foodId?: string;
  location: Location;
  quantityG?: number;       // gramos (o ml)
  units?: number;           // si se cuenta por unidades (huevos, latas)
  unitGrams?: number;
  expiresOn?: string;
  openedOn?: string;
}

export const gramsOf = (p: PantryItem) => p.quantityG ?? (p.units != null && p.unitGrams ? p.units * p.unitGrams : 0);

export function expiringSoon(items: PantryItem[], today: string, days = 4): PantryItem[] {
  return items.filter((i) => i.expiresOn && daysBetween(today, i.expiresOn) <= days).sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!));
}

/** Total por alimento necesario para un conjunto de comidas. */
export function requiredByFood(meals: Pick<PlannedMeal, 'ingredients'>[]): Map<string, { name: string; grams: number }> {
  const m = new Map<string, { name: string; grams: number }>();
  for (const meal of meals) for (const i of meal.ingredients) {
    const cur = m.get(i.foodId) ?? { name: i.name, grams: 0 };
    cur.grams += i.grams; m.set(i.foodId, cur);
  }
  return m;
}

export interface ShoppingLine { foodId: string; name: string; needG: number; haveG: number; buyG: number }

export function shoppingList(meals: Pick<PlannedMeal, 'ingredients'>[], pantry: PantryItem[]): ShoppingLine[] {
  const need = requiredByFood(meals);
  const out: ShoppingLine[] = [];
  for (const [foodId, n] of need) {
    const have = pantry.filter((p) => p.foodId === foodId).reduce((a, p) => a + gramsOf(p), 0);
    const buy = Math.max(0, n.grams - have);
    out.push({ foodId, name: n.name, needG: Math.round(n.grams), haveG: Math.round(have), buyG: Math.ceil(buy / 10) * 10 });
  }
  return out.filter((l) => l.buyG > 0).sort((a, b) => a.name.localeCompare(b.name));
}

const STOP = new Set(['de', 'del', 'con', 'sin', 'al', 'a', 'la', 'el', 'en', 'y', 'cocido', 'cocida', 'cocidos', 'cocidas', 'crudo', 'cruda', 'natural', 'hacendado', 'consum', 'mercadona', 'raw', 'cooked', 'extra', 'lata', 'latas', 'bote', 'paquete', 'fresco', 'fresca', 'entero', 'entera']);
const toks = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(es|s)$/, ''));
/** ¿El ingrediente de la receta es este producto de la despensa? (por nombre, cuando no coincide el alimento de la base de datos) */
export function nameMatches(ingredient: string, pantryName: string): boolean {
  const a = toks(ingredient), bl = toks(pantryName), b = new Set(bl);
  if (!a.length || !b.size) return false;
  if (a.length >= 2 && a.every((w) => b.has(w))) return true;      // "pechuga de pollo" ↔ "Pollo, pechuga fileteada"
  return a[0] === bl[0] && a.filter((w) => b.has(w)).length / a.length >= 0.5;   // misma palabra principal ("arroz blanco" ↔ "Arroz basmati")
}

export interface PantryChange { id: string; before: { quantityG?: number; units?: number }; after: { quantityG?: number; units?: number }; removed: boolean; row?: PantryItem }

/** Descuenta de la despensa (primero lo que caduca antes; luego nevera, despensa, congelador). Devuelve los cambios para poder deshacerlos. */
export function consume(pantry: PantryItem[], ingredients: Ingredient[]): { pantry: PantryItem[]; missing: { name: string; grams: number }[]; changes: PantryChange[]; used: { name: string; grams: number; from: string }[] } {
  const items = pantry.map((p) => ({ ...p }));
  const before = new Map(pantry.map((p) => [p.id, { ...p }]));
  const missing: { name: string; grams: number }[] = [];
  const used: { name: string; grams: number; from: string }[] = [];
  const locRank: Record<Location, number> = { nevera: 0, despensa: 1, congelador: 2 };
  for (const ing of ingredients) {
    let left = ing.grams;
    const byId = items.filter((p) => ing.foodId && p.foodId === ing.foodId && (gramsOf(p) > 0 || (p.units ?? 0) > 0));
    const cands = (byId.length ? byId : items.filter((p) => nameMatches(ing.name, p.name) && (gramsOf(p) > 0 || (p.units ?? 0) > 0)))
      .sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999') || locRank[a.location] - locRank[b.location]);
    for (const c of cands) {
      if (left <= 0) break;
      if (c.quantityG == null && c.units != null && !c.unitGrams) {           // unidades sin peso (sobres, latas): se gasta una
        c.units = Math.max(0, c.units - 1); used.push({ name: ing.name, grams: left, from: c.name }); left = 0; break;
      }
      const g = gramsOf(c); const take = Math.min(g, left);
      if (c.quantityG != null) c.quantityG = Math.round(g - take);
      else if (c.units != null && c.unitGrams) c.units = Math.max(0, Math.round(((g - take) / c.unitGrams) * 10) / 10);
      used.push({ name: ing.name, grams: Math.round(take), from: c.name });
      left -= take;
    }
    if (left > 1) missing.push({ name: ing.name, grams: Math.round(left) });
  }
  const remaining = items.filter((p) => gramsOf(p) > 0 || (p.units ?? 0) > 0);
  const changes: PantryChange[] = [];
  for (const p of items) {
    const b = before.get(p.id)!;
    if (b.quantityG === p.quantityG && b.units === p.units) continue;
    const removed = !remaining.includes(p);
    changes.push({ id: p.id, before: { quantityG: b.quantityG, units: b.units }, after: { quantityG: p.quantityG, units: p.units }, removed, row: removed ? b : undefined });
  }
  return { pantry: remaining, missing, changes, used };
}

// ---------------- Batch cooking ----------------

export interface RecipeStep { text: string; minutes: number; hands: 'activa' | 'pasiva'; equipment?: 'horno' | 'fuego' | 'olla' | 'microondas' | 'ninguno' }
export interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];      // para 1 ración base
  steps: RecipeStep[];
  fridgeDays: number;             // conservación en nevera una vez cocinado
  freezable: boolean;
  tags?: string[];
}

export interface BatchTask { start: number; end: number; recipe: string; text: string; hands: 'activa' | 'pasiva'; equipment?: string }
export interface Container { label: string; date: string; slot: string; recipe: string; contents: { name: string; grams: number }[]; storage: Location; note?: string }

export interface BatchPlan {
  cookDate: string;
  totalMinutes: number;
  tasks: BatchTask[];
  containers: Container[];
  totals: { recipe: string; ingredients: { name: string; grams: number }[] }[];
  warnings: string[];
}

/**
 * Plan de batch cooking: agrupa las comidas del menú que salen de recetas de batch, suma cantidades,
 * ordena las tareas (primero lo pasivo y largo, horno/olla en paralelo, manos libres para lo activo)
 * y reparte en táperes con conservación segura (nevera ≤ días de la receta; el resto al congelador).
 */
export function buildBatchPlan(cookDate: string, meals: PlannedMeal[], recipes: Record<string, Recipe>): BatchPlan {
  const byRecipe = new Map<string, PlannedMeal[]>();
  for (const m of meals) if (m.fromBatch && m.recipeId && recipes[m.recipeId] && m.date >= cookDate) {
    const l = byRecipe.get(m.recipeId) ?? []; l.push(m); byRecipe.set(m.recipeId, l);
  }
  const warnings: string[] = [];
  const totals = [...byRecipe.entries()].map(([rid, ms]) => {
    const req = requiredByFood(ms);
    return { recipe: recipes[rid].name, ingredients: [...req.values()].map((v) => ({ name: v.name, grams: Math.round(v.grams) })) };
  });

  // Planificación de tareas: una "mano" para lo activo; horno ×1, fuego ×3, olla ×1 para lo pasivo.
  const res = { horno: [0], fuego: [0, 0, 0], olla: [0], microondas: [0], ninguno: [0, 0, 0, 0] } as Record<string, number[]>;
  let hands = 0; const tasks: BatchTask[] = [];
  const steps = [...byRecipe.keys()].flatMap((rid) => recipes[rid].steps.map((s, i) => ({ rid, s, i })));
  // Pasivas largas primero (arranca el horno y el arroz), luego las activas.
  const pending = steps.sort((a, b) => (a.s.hands === 'pasiva' ? -1 : 1) - (b.s.hands === 'pasiva' ? -1 : 1) || b.s.minutes - a.s.minutes);
  const doneAt = new Map<string, number>();         // fin del paso previo de cada receta
  for (const { rid, s, i } of pending.sort((a, b) => a.i - b.i || (a.s.hands === 'pasiva' ? -1 : 1))) {
    const prevEnd = doneAt.get(rid) ?? 0;
    const eq = s.equipment ?? 'ninguno';
    const pool = res[eq] ?? res.ninguno;
    const slotIdx = pool.indexOf(Math.min(...pool));
    let start = Math.max(prevEnd, pool[slotIdx]);
    if (s.hands === 'activa') start = Math.max(start, hands);
    const prep = s.hands === 'pasiva' ? Math.min(5, s.minutes) : s.minutes;    // poner algo al horno ocupa las manos ~5 min
    hands = Math.max(hands, start + prep);
    const end = start + s.minutes;
    if (eq !== 'ninguno') pool[slotIdx] = end;
    tasks.push({ start, end, recipe: recipes[rid].name, text: s.text, hands: s.hands, equipment: eq === 'ninguno' ? undefined : eq });
    doneAt.set(rid, end);
  }
  tasks.sort((a, b) => a.start - b.start || a.end - b.end);
  const totalMinutes = Math.max(0, ...tasks.map((t) => t.end)) + 15;   // + enfriar y envasar

  const containers: Container[] = [];
  for (const [rid, ms] of byRecipe) {
    const r = recipes[rid];
    for (const m of ms.sort((a, b) => a.date.localeCompare(b.date))) {
      const d = daysBetween(cookDate, m.date);
      let storage: Location = 'nevera'; let note: string | undefined;
      if (d > r.fridgeDays) {
        if (r.freezable) { storage = 'congelador'; note = `Pásalo a la nevera la noche del ${addDays(m.date, -1)}.`; }
        else { note = `"${r.name}" no aguanta hasta el ${m.date} ni se congela bien: cocínalo a mitad de semana.`; warnings.push(note); }
      }
      containers.push({ label: `${m.date} · ${m.slot.replace('_', ' ')}`, date: m.date, slot: m.slot, recipe: r.name, contents: m.ingredients.map((i) => ({ name: i.name, grams: Math.round(i.grams) })), storage, note });
    }
  }
  return { cookDate, totalMinutes, tasks, containers, totals, warnings };
}

// ---------------- Cómo se gasta cada producto ----------------
// «Pack de 24 huevos» → se cuentan huevos (24 → 23…). «Caja con 3 latas de atún» → se cuentan latas.
// «Paquete de 500 g de pasta» → se gasta por gramos (500 → 420 g…). «2 bolsas de arroz de 1 kg» → 2.000 g, paquete de 1.000 g.
// «Caja de 10 sobres» → se cuentan sobres (el contenido, no la caja).

export type PantryMode = 'units' | 'weight';
export interface PantryNorm { mode: PantryMode; units?: number; packUnits?: number; unitGrams?: number; quantityG?: number; packageG?: number; unitLabel?: string; liquid: boolean }

const n0 = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Cosas que se cuentan por unidades (aunque vengan en caja o pack). Clave: palabra → etiqueta de la unidad. */
const COUNT: [RegExp, string][] = [
  [/huevo/, 'huevo'], [/\blatas?\b|atun|sardina|mejillon|berberecho|caballa en|bonito en|maiz dulce|esparragos/, 'lata'], [/yogur|skyr|kefir|petit|natillas?|flan|cuajada|actimel|danone/, 'yogur'],
  [/sobres?|bolsitas?|infusion|te verde|capsulas?|monodosis/, 'sobre'], [/\bbriks?\b|\bbrick/, 'brik'], [/botell[ai]n?/, 'botella'], [/\bbotes?\b|tarros?|frascos?/, 'bote'],
  [/barritas?/, 'barrita'], [/tortitas?/, 'tortita'], [/wraps?|tortillas? de (trigo|avena|maiz)|fajitas?/, 'wrap'], [/pan de hamburguesa|panecillos?|bollos?|croissants?|magdalenas?|muffins?/, 'unidad'],
  [/hamburguesas?|salchichas?|filetes?|pechugas? enteras?|lomos? de (salmon|merluza|bacalao)|pizza/, 'unidad'],
  [/\b(platanos?|manzanas?|naranjas?|kiwis?|aguacates?|limon(es)?|peras?|melocoton(es)?|mandarinas?|pimientos?|cebollas?|calabacin(es)?|berenjenas?|pepinos?|tomates?|patatas?|boniatos?|zanahorias?)\b/, 'unidad'],
];
/** Productos a granel que se gastan por peso aunque vengan en paquete. */
const BULK = /arroz|pasta|macarron|espagueti|fideo|tallarin|lentejas? (secas|pardina)|garbanzos? secos|alubias? secas|quinoa|cuscus|harina|avena|copos|cereales|muesli|granola|azucar|sal\b|frutos secos|nueces|almendras|cacahuetes|anacardos|pipas|chocolate|cacao|cafe molido|pan rallado|queso rallado|jamon|pavo|fiambre|lonchas|queso|carne picada|pollo|ternera|cerdo|salmon|merluza|gambas|espinacas|lechuga|canonigos|rucula|brotes|verdura congelada|guisantes|judias|brocoli|coliflor|champinones|fresas|arandanos|uvas|leche|bebida de|aceite|vinagre|caldo|nata|tomate frito|tomate triturado|salsa|miel|mermelada|crema de cacahuete|mantequilla|proteina|whey|creatina/;
const LIQUID = /leche|bebida de|aceite|vinagre|caldo|nata|zumo|agua|salsa de soja|kefir liquido/;

export function unitLabelOf(name: string): string | undefined { const s = n0(name); return COUNT.find(([re]) => re.test(s))?.[1]; }
export const isLiquid = (name: string) => LIQUID.test(n0(name));

/**
 * Decide cómo se lleva un producto y normaliza sus cantidades.
 * Entrada: lo que se sepa (unidades, pack, g por unidad, g totales, g del paquete).
 */
export function normalizePantry(a: { name: string; units?: number | null; packUnits?: number | null; unitGrams?: number | null; quantityG?: number | null; packageG?: number | null; unitLabel?: string | null; mode?: PantryMode | null }): PantryNorm {
  const s = n0(a.name);
  const liquid = LIQUID.test(s);
  const label = a.unitLabel ?? unitLabelOf(a.name);
  const units = a.units ?? undefined, pack = a.packUnits ?? undefined;
  // Elegido a mano: se respeta.
  let mode: PantryMode | undefined = a.mode ?? undefined;
  if (!mode) {
    const bulk = BULK.test(s) && !/\blatas?\b|sobres?|botes?|tarros?|briks?|yogur/.test(s);
    if ((pack && pack > 1) || (units && units > 1 && !bulk)) mode = 'units';
    else if (label && !bulk) mode = 'units';
    else if (a.quantityG != null || a.unitGrams != null || a.packageG != null || bulk) mode = 'weight';
    else mode = 'units';
  }
  if (mode === 'weight') {
    const pkg = a.packageG ?? (a.unitGrams && (!units || units <= 20) ? a.unitGrams : undefined);
    const q = a.quantityG ?? (units != null && pkg ? units * pkg : pkg);
    return { mode, quantityG: q != null ? Math.round(q) : undefined, packageG: pkg ? Math.round(pkg) : undefined, liquid };
  }
  return { mode, units: units ?? (pack ?? 1), packUnits: pack ?? (units && units > 1 ? units : undefined), unitGrams: a.unitGrams ?? undefined, unitLabel: label ?? 'unidad', liquid };
}

/** Plural sencillo para la etiqueta de unidad («3 latas», «1 huevo»). */
export const unitWord = (label = 'unidad', n = 2) => (n === 1 ? label : label.endsWith('n') ? `${label}es` : /[aeiou]$/.test(label) ? `${label}s` : `${label}es`);

/** Cantidades rápidas para «usar» según el producto (g o ml). */
export function usePresets(name: string): number[] {
  const s = n0(name);
  if (/arroz|pasta|macarron|espagueti|fideo|quinoa|cuscus/.test(s)) return [60, 80, 100, 150];
  if (/lenteja|garbanzo|alubia/.test(s)) return [60, 80, 100];
  if (/avena|copos|cereales|muesli|granola/.test(s)) return [30, 40, 60, 80];
  if (/aceite/.test(s)) return [5, 10, 15, 20];
  if (/leche|bebida de|zumo|caldo/.test(s)) return [100, 200, 250, 500];
  if (/frutos secos|nueces|almendras|cacahuetes|anacardos|chocolate/.test(s)) return [15, 25, 30, 50];
  if (/queso|jamon|pavo|fiambre/.test(s)) return [20, 30, 50, 75];
  if (/pollo|ternera|cerdo|salmon|merluza|carne|pescado/.test(s)) return [120, 150, 200, 250];
  if (/espinaca|lechuga|canonigos|rucula|brotes/.test(s)) return [30, 50, 75, 100];
  return [50, 100, 150, 200];
}
