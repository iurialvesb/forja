// Comidas: ajuste de raciones a un objetivo de macros, menú semanal editable y reequilibrio
// automático del resto del día/semana cuando cambias o registras algo.

import { addMacros, macrosOf, roundMacros, subMacros, ZERO, distribute, slotOrder, type Food, type Macros, type MealSlot, type DayTarget } from './nutrition.ts';

export interface Ingredient {
  foodId: string;
  name: string;
  grams: number;
  role: 'protein' | 'carb' | 'fat' | 'veg' | 'fruit' | 'dairy' | 'other';
  minGrams?: number;
  maxGrams?: number;
  fixed?: boolean;                // no se escala (especias, salsa)
}

export interface PlannedMeal {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId?: string;
  title: string;
  ingredients: Ingredient[];
  status: 'planned' | 'eaten' | 'edited' | 'skipped';
  locked?: boolean;               // el usuario la fijó: no se reescala
  fromBatch?: boolean;
}

export type FoodIndex = Record<string, Food>;

export function mealMacros(m: Pick<PlannedMeal, 'ingredients'>, foods: FoodIndex): Macros {
  return m.ingredients.reduce((acc, i) => (foods[i.foodId] ? addMacros(acc, macrosOf(foods[i.foodId], i.grams)) : acc), { ...ZERO });
}

const W = { protein: 1.0, carbs: 0.6, fat: 1.2, kcal: 0.004 };
function loss(m: Macros, t: Macros) {
  return W.protein * (m.protein - t.protein) ** 2 + W.carbs * (m.carbs - t.carbs) ** 2 + W.fat * (m.fat - t.fat) ** 2 + W.kcal * (m.kcal - t.kcal) ** 2;
}

const DEFAULT_BOUNDS: Record<Ingredient['role'], [number, number]> = {
  protein: [60, 350], carb: [20, 400], fat: [0, 40], veg: [60, 400], fruit: [50, 300], dairy: [50, 400], other: [0, 200],
};

/** Ajusta los gramos de cada ingrediente para acercarse al objetivo (descenso por coordenadas con límites). */
export function fitPortions(ingredients: Ingredient[], foods: FoodIndex, target: Macros, step = 5): { ingredients: Ingredient[]; macros: Macros; error: Macros } {
  const ing = ingredients.map((i) => ({ ...i }));
  // Proteína e hidratos son las palancas principales; verdura, fruta, lácteos y grasa solo se mueven dentro de un margen
  // razonable respecto a la receta (nadie quiere 400 g de espinacas para cuadrar hidratos).
  const REL: Partial<Record<Ingredient['role'], [number, number]>> = { veg: [0.75, 1.4], fruit: [0.6, 1.6], dairy: [0.5, 2], fat: [0, 2], other: [0.7, 1.3] };
  const bounds = ing.map((i) => {
    const [lo, hi] = DEFAULT_BOUNDS[i.role];
    const rel = REL[i.role];
    const lo2 = rel ? Math.max(i.role === 'fat' ? 0 : 5, i.grams * rel[0]) : Math.min(lo, i.grams);
    const hi2 = rel ? Math.min(hi, Math.max(i.grams * rel[1], i.role === 'fat' ? 10 : 0)) : Math.max(hi, i.grams);
    return [i.minGrams ?? lo2, i.maxGrams ?? hi2] as [number, number];
  });
  const total = () => ing.reduce((a, i) => (foods[i.foodId] ? addMacros(a, macrosOf(foods[i.foodId], i.grams)) : a), { ...ZERO });
  let cur = loss(total(), target);
  for (let iter = 0; iter < 60; iter++) {
    let improved = false;
    for (let k = 0; k < ing.length; k++) {
      if (ing[k].fixed || !foods[ing[k].foodId]) continue;
      for (const delta of [step * 8, step * 2, step, -step, -step * 2, -step * 8]) {
        const g = Math.min(bounds[k][1], Math.max(bounds[k][0], ing[k].grams + delta));
        if (g === ing[k].grams) continue;
        const prev = ing[k].grams; ing[k].grams = g;
        const l = loss(total(), target);
        if (l < cur - 1e-6) { cur = l; improved = true; } else ing[k].grams = prev;
      }
    }
    if (!improved) break;
  }
  ing.forEach((i) => { const f = foods[i.foodId]; if (f?.unitGrams && f.unitGrams >= 30) i.grams = Math.max(f.unitGrams, Math.round(i.grams / f.unitGrams) * f.unitGrams); });
  const m = roundMacros(total());
  return { ingredients: ing, macros: m, error: roundMacros(subMacros(m, target)) };
}

export interface Alert { level: 'info' | 'aviso'; date: string; slot?: MealSlot; message: string }

/** Alimento con el que completar: proteína magra (proteína/kcal); hidratos y grasa, los más densos por 100 g. */
function densest(foods: FoodIndex, key: 'protein' | 'carbs' | 'fat', available?: Set<string>): Food | undefined {
  const pool = Object.values(foods).filter((f) => (!available || available.has(f.id)) && f.per100[key] > 0);
  const score = (f: Food) => key === 'protein' ? f.per100.protein / Math.max(40, f.per100.kcal) : f.per100[key];
  return pool.filter((f) => key !== 'protein' || f.per100.protein >= 8).sort((a, b) => score(b) - score(a))[0];
}
const suggestGrams = (need: number, per100: number) => Math.min(150, Math.max(10, Math.round((need / per100) * 100 / 5) * 5));

/**
 * Reequilibra un día: lo comido o editado manda; el resto de comidas se reescalan para cerrar el objetivo.
 * Devuelve las comidas ajustadas y avisos de lo que falta o sobra (con sugerencia concreta si se puede).
 */
export interface MealAdjustment { mealId: string; slot: MealSlot; title: string; changes: { name: string; fromG: number; toG: number }[]; text: string }

export function rebalanceDay(args: { date: string; target: DayTarget; meals: PlannedMeal[]; foods: FoodIndex; extraEaten?: Macros; trainingSlot?: 'am' | 'pm'; pantryFoodIds?: Set<string> }): { meals: PlannedMeal[]; totals: Macros; alerts: Alert[]; adjustments: MealAdjustment[] } {
  const { foods } = args;
  const meals = args.meals.map((m) => ({ ...m, ingredients: m.ingredients.map((i) => ({ ...i })) }));
  const fixedMeals = meals.filter((m) => m.status === 'eaten' || m.status === 'edited' || m.locked || m.status === 'skipped');
  const flexible = meals.filter((m) => !fixedMeals.includes(m)).sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot));
  let consumed = fixedMeals.filter((m) => m.status !== 'skipped').reduce((a, m) => addMacros(a, mealMacros(m, foods)), { ...ZERO });
  if (args.extraEaten) consumed = addMacros(consumed, args.extraEaten);
  const remaining = subMacros(args.target.macros, consumed);
  const alerts: Alert[] = [];
  if (flexible.length) {
    const share = distribute({ ...remaining, protein: Math.max(0, remaining.protein), carbs: Math.max(0, remaining.carbs), fat: Math.max(0, remaining.fat) }, flexible.map((m) => m.slot), args.trainingSlot);
    for (const m of flexible) {
      const r = fitPortions(m.ingredients, foods, share[m.slot]);
      m.ingredients = r.ingredients;
    }
  }
  // Qué ha cambiado en cada comida pendiente (lo que ve el usuario como "añade / quita").
  const adjustments: MealAdjustment[] = [];
  for (const m of flexible) {
    const orig = args.meals.find((o) => o.id === m.id)!;
    const changes = m.ingredients.map((i, k) => ({ name: i.name, fromG: Math.round(orig.ingredients[k]?.grams ?? 0), toG: Math.round(i.grams) }))
      .filter((c) => Math.abs(c.toG - c.fromG) >= Math.max(10, c.fromG * 0.15));
    if (changes.length) adjustments.push({ mealId: m.id, slot: m.slot, title: m.title, changes,
      text: `${m.slot.replace('_', ' ')}: ` + changes.map((c) => `${c.toG > c.fromG ? 'sube' : 'baja'} ${c.name.toLowerCase()} de ${c.fromG} a ${c.toG} g`).join(', ') });
  }
  const totals = roundMacros(meals.filter((m) => m.status !== 'skipped').reduce((a, m) => addMacros(a, mealMacros(m, foods)), args.extraEaten ? { ...args.extraEaten } : { ...ZERO }));
  const t = args.target.macros;
  const dP = totals.protein - t.protein, dK = totals.kcal - t.kcal, dC = totals.carbs - t.carbs, dF = totals.fat - t.fat;
  const lastFlexible = flexible[flexible.length - 1];
  if (dP < -12) {
    const f = densest(foods, 'protein', args.pantryFoodIds);
    alerts.push({ level: 'aviso', date: args.date, slot: lastFlexible?.slot, message: `Te faltan ${Math.round(-dP)} g de proteína hoy.` + (f ? ` Añade ~${suggestGrams(-dP, f.per100.protein)} g de ${f.name}${lastFlexible ? ` en la ${lastFlexible.slot.replace('_', ' ')}` : ''}.` : '') });
  }
  if (dK > 150) alerts.push({ level: 'aviso', date: args.date, message: `Vas ${Math.round(dK)} kcal por encima del objetivo${dF > 10 ? ` (sobre todo grasa: +${Math.round(dF)} g)` : dC > 25 ? ` (sobre todo hidratos: +${Math.round(dC)} g)` : ''}. ${flexible.length ? 'Ya he reducido las comidas que quedan; ' : ''}no compenses saltándote comidas, ajusta mañana si hace falta.` });
  if (dK < -200 && args.target.load !== 'descanso') {
    const f = densest(foods, 'carbs', args.pantryFoodIds);
    alerts.push({ level: 'aviso', date: args.date, message: `Te quedarías ${Math.round(-dK)} kcal por debajo en un día de carga ${args.target.load}.` + (f && dC < -20 ? ` Suma ~${suggestGrams(-dC, f.per100.carbs)} g de ${f.name.toLowerCase()}.` : '') });
  }
  return { meals, totals, alerts, adjustments };
}

/** Cumplimiento del día: comidas hechas según lo previsto y cercanía a kcal y proteína. */
export function adherence(day: { meals: PlannedMeal[]; totals: Macros; target: Macros }): { mealsDone: number; mealsTotal: number; score: number } {
  const total = day.meals.length;
  const done = day.meals.filter((m) => m.status === 'eaten').length;
  const kErr = Math.min(1, Math.abs(day.totals.kcal - day.target.kcal) / Math.max(1, day.target.kcal));
  const pErr = Math.min(1, Math.abs(day.totals.protein - day.target.protein) / Math.max(1, day.target.protein));
  const score = Math.round(100 * (0.4 * (total ? done / total : 0) + 0.3 * (1 - kErr) + 0.3 * (1 - pErr)));
  return { mealsDone: done, mealsTotal: total, score };
}

/** Escala una comida por la fracción realmente comida (½, ¾…). */
export function scaleMeal<T extends Pick<PlannedMeal, 'ingredients'>>(m: T, fraction: number): T {
  return { ...m, ingredients: m.ingredients.map((i) => ({ ...i, grams: Math.round(i.grams * fraction) })) };
}

/** Balance semanal: qué días van por encima/debajo para avisar y compensar en los siguientes. */
export function weekBalance(days: { date: string; target: Macros; totals: Macros; past: boolean }[]): { deltaKcal: number; deltaProtein: number; message?: string } {
  const past = days.filter((d) => d.past);
  const deltaKcal = past.reduce((a, d) => a + d.totals.kcal - d.target.kcal, 0);
  const deltaProtein = past.reduce((a, d) => a + d.totals.protein - d.target.protein, 0);
  const left = days.filter((d) => !d.past).length;
  let message: string | undefined;
  if (Math.abs(deltaKcal) > 400 && left) {
    const perDay = Math.round(Math.min(250, Math.abs(deltaKcal) / left));
    message = deltaKcal > 0 ? `Llevas ${Math.round(deltaKcal)} kcal de más esta semana. Si quieres compensar, puedo bajar ${perDay} kcal/día los ${left} días que quedan (sin tocar los días de entreno duro).`
      : `Llevas ${Math.round(-deltaKcal)} kcal de menos esta semana: no hace falta recuperarlas de golpe; asegura sobre todo los días de entreno.`;
  }
  return { deltaKcal: Math.round(deltaKcal), deltaProtein: Math.round(deltaProtein), message };
}
