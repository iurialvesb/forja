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

/** Descuenta de la despensa (primero lo que caduca antes; luego nevera, despensa, congelador). */
export function consume(pantry: PantryItem[], ingredients: Ingredient[]): { pantry: PantryItem[]; missing: { name: string; grams: number }[] } {
  const items = pantry.map((p) => ({ ...p }));
  const missing: { name: string; grams: number }[] = [];
  const locRank: Record<Location, number> = { nevera: 0, despensa: 1, congelador: 2 };
  for (const ing of ingredients) {
    let left = ing.grams;
    const cands = items.filter((p) => p.foodId === ing.foodId && gramsOf(p) > 0)
      .sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999') || locRank[a.location] - locRank[b.location]);
    for (const c of cands) {
      if (left <= 0) break;
      const g = gramsOf(c); const take = Math.min(g, left);
      if (c.quantityG != null) c.quantityG = g - take;
      else if (c.units != null && c.unitGrams) c.units = Math.max(0, Math.round(((g - take) / c.unitGrams) * 10) / 10);
      left -= take;
    }
    if (left > 1) missing.push({ name: ing.name, grams: Math.round(left) });
  }
  return { pantry: items.filter((p) => gramsOf(p) > 0 || (p.units ?? 0) > 0), missing };
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
