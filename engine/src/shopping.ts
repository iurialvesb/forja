// Lista de la compra proyectada: tu stock (congelador, nevera, despensa) MENOS lo que aún vas a gastar esta semana,
// frente a lo que comerás la semana siguiente. Tiene en cuenta caducidades y agrupa por secciones del súper.

import type { PlannedMeal } from './meals.ts';
import { consume, gramsOf, requiredByFood, type PantryItem, type Location } from './pantry.ts';
import type { FoodIndex } from './meals.ts';

export type Aisle = 'Carnicería' | 'Pescadería' | 'Frutería y verdulería' | 'Lácteos y huevos' | 'Panadería' | 'Despensa' | 'Congelados' | 'Suplementos' | 'Otros';

const AISLE_WORDS: [RegExp, Aisle][] = [
  [/pollo|pavo|ternera|cerdo|lomo|vacuno|carne|jamon|chorizo|hamburguesa|solomillo|conejo/, 'Carnicería'],
  [/salmon|merluza|atun fresco|bacalao|dorada|lubina|gamba|langostino|sepia|calamar|pescado|mejillon/, 'Pescadería'],
  [/huevo|clara|leche|yogur|queso|kefir|skyr|nata|mantequilla|requeson/, 'Lácteos y huevos'],
  [/pan\b|pan |tortita|tortilla de trigo|wrap|baguette/, 'Panadería'],
  [/whey|proteina en polvo|creatina|colageno/, 'Suplementos'],
  [/congelad|helado/, 'Congelados'],
  [/platano|manzana|naranja|kiwi|fresa|pera|uva|mandarina|piña|mango|arandano|frutos rojos|brocoli|espinaca|pimiento|tomate|calabacin|cebolla|ajo|zanahoria|lechuga|pepino|berenjena|champi|patata|boniato|aguacate|limon|calabaza|judia verde|esparrago|fruta|verdura/, 'Frutería y verdulería'],
  [/arroz|pasta|avena|quinoa|lenteja|garbanzo|alubia|harina|aceite|atun|lata|conserva|almendra|nuez|nueces|cacahuete|chocolate|especia|sal\b|tomate triturado|caldo|miel|cafe|cereal/, 'Despensa'],
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function aisleFor(name: string): Aisle {
  const n = norm(name);
  for (const [re, a] of AISLE_WORDS) if (re.test(n)) return a;
  return 'Otros';
}

/** Dónde se guarda al comprarlo (carne/pescado a la nevera si se usa en ≤ 2 días; si no, al congelador). */
export function storageFor(aisle: Aisle, daysUntilUse: number): Location {
  if (aisle === 'Carnicería' || aisle === 'Pescadería') return daysUntilUse <= 2 ? 'nevera' : 'congelador';
  if (aisle === 'Congelados') return 'congelador';
  if (aisle === 'Frutería y verdulería' || aisle === 'Lácteos y huevos') return 'nevera';
  return 'despensa';
}

export interface ShoppingItem {
  foodId: string; name: string; aisle: Aisle;
  needG: number; haveG: number; buyG: number;
  buyUnits?: number;                // si se compra por unidades (huevos, yogures)
  firstNeeded: string;              // primera fecha en que se usa
  schedule: { date: string; grams: number }[];   // gramos necesarios por día
  note?: string;
}

export function projectedShoppingList(args: {
  pantry: PantryItem[];
  remainingThisWeek: Pick<PlannedMeal, 'ingredients' | 'date' | 'status'>[];   // lo que aún se va a gastar del stock
  meals: Pick<PlannedMeal, 'ingredients' | 'date' | 'status'>[];               // semana para la que se compra
  foods?: FoodIndex;
  shoppingDate: string;
  marginPct?: number;                                                         // margen por mermas (5 %)
}): { items: ShoppingItem[]; byAisle: Record<string, ShoppingItem[]>; coveredByStock: { name: string; grams: number }[] } {
  const live = (m: { status: string }) => m.status !== 'skipped' && m.status !== 'eaten';
  const after = consume(args.pantry, args.remainingThisWeek.filter(live).flatMap((m) => m.ingredients)).pantry;
  const target = args.meals.filter(live);
  const need = requiredByFood(target);
  const firstUse = new Map<string, string>();
  for (const m of [...target].sort((a, b) => a.date.localeCompare(b.date))) for (const i of m.ingredients) if (!firstUse.has(i.foodId)) firstUse.set(i.foodId, m.date);
  const margin = 1 + (args.marginPct ?? 0.05);
  const items: ShoppingItem[] = []; const covered: { name: string; grams: number }[] = [];
  for (const [foodId, n] of need) {
    const first = firstUse.get(foodId)!;
    // Lo que caduca antes de usarse no cuenta como stock.
    const have = after.filter((p) => p.foodId === foodId && (!p.expiresOn || p.expiresOn >= first)).reduce((a, p) => a + gramsOf(p), 0);
    const needG = n.grams * margin;
    const missing = needG - have;
    if (missing <= Math.max(5, needG * 0.03)) { covered.push({ name: n.name, grams: Math.round(n.grams) }); continue; }
    const unit = args.foods?.[foodId]?.unitGrams;
    const aisle = aisleFor(n.name);
    const buyG = missing > 200 ? Math.ceil(missing / 50) * 50 : Math.ceil(missing / 10) * 10;
    const sched = new Map<string, number>();
    for (const m of target) for (const i of m.ingredients) if (i.foodId === foodId) sched.set(m.date, (sched.get(m.date) ?? 0) + i.grams);
    const schedule = [...sched.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, grams]) => ({ date, grams: Math.round(grams) }));
    const item: ShoppingItem = { foodId, name: n.name, aisle, needG: Math.round(n.grams), haveG: Math.round(have), buyG, firstNeeded: first, schedule };
    if (unit && unit >= 30) item.buyUnits = Math.ceil(missing / unit);
    const lastUse = [...target].filter((m) => m.ingredients.some((i) => i.foodId === foodId)).map((m) => m.date).sort().pop()!;
    if ((aisle === 'Pescadería' || aisle === 'Carnicería') && daysBetweenIso(args.shoppingDate, lastUse) > 3) item.note = 'Congela las raciones de la segunda mitad de la semana o cómpralas a mitad de semana.';
    if (aisle === 'Frutería y verdulería' && daysBetweenIso(args.shoppingDate, lastUse) > 5) item.note = 'Para el final de la semana, mejor una segunda compra pequeña o versión congelada.';
    items.push(item);
  }
  items.sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
  const byAisle: Record<string, ShoppingItem[]> = {};
  for (const i of items) (byAisle[i.aisle] ??= []).push(i);
  return { items, byAisle, coveredByStock: covered };
}

function daysBetweenIso(a: string, b: string) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }

/** Convierte lo comprado en artículos de despensa. Carne y pescado: lo de los 2 próximos días a la nevera, el resto al congelador. */
export function boughtToPantry(items: ShoppingItem[], shoppingDate: string): Omit<PantryItem, 'id'>[] {
  return items.flatMap((i) => {
    if (i.aisle !== 'Carnicería' && i.aisle !== 'Pescadería') return [{ name: i.name, foodId: i.foodId, location: storageFor(i.aisle, daysBetweenIso(shoppingDate, i.firstNeeded)), quantityG: i.buyG }];
    const soon = i.schedule.filter((s) => daysBetweenIso(shoppingDate, s.date) <= 2).reduce((a, s) => a + s.grams, 0);
    const total = i.schedule.reduce((a, s) => a + s.grams, 0) || 1;
    const fridge = Math.min(i.buyG, Math.round((i.buyG * soon) / total / 10) * 10);
    const out: Omit<PantryItem, 'id'>[] = [];
    if (fridge > 0) out.push({ name: i.name, foodId: i.foodId, location: 'nevera', quantityG: fridge });
    if (i.buyG - fridge > 0) out.push({ name: i.name, foodId: i.foodId, location: 'congelador', quantityG: i.buyG - fridge });
    return out;
  });
}
