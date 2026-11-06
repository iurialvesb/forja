// POST /meal-update { mealId, action: 'eaten'|'partial'|'skip'|'edit'|'swap'|'lock'|'unlock'|'reset', fraction?, ingredients?, recipeId? }
// Chequeo diario: cumplido, a medias, no comido o cambiado → se reajustan las comidas que quedan.
// Editar una comida del menú y reequilibrar el resto del día y de la semana.
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { loadContext } from '../_shared/context.ts';
import { computeWeek } from '../_shared/nutrition.ts';
import { loadFoods } from '../_shared/foods.ts';
import { macrosOf, addMacros, ZERO, roundMacros, mondayOf, scaleMeal } from '../_shared/engine/index.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const b = await req.json();
  const { data: meal } = await sb.from('planned_meals').select('*').eq('id', b.mealId).single();
  if (!meal) throw new HttpError(404, 'Comida no encontrada');
  const upd: Record<string, unknown> = {};
  switch (b.action) {
    case 'edit': upd.ingredients = b.ingredients; upd.status = 'edited'; if (b.title) upd.title = b.title; break;
    case 'swap': {
      const { data: r } = await sb.from('recipes').select('*').eq('id', b.recipeId).single();
      if (!r) throw new HttpError(404, 'Receta no encontrada');
      upd.recipe_id = r.id; upd.title = r.name; upd.ingredients = r.ingredients; upd.status = 'planned'; upd.from_batch = (r.tags ?? []).includes('batch');
      break;
    }
    case 'skip': upd.status = 'skipped'; break;
    case 'reset': upd.status = 'planned'; break;
    case 'lock': upd.locked = true; break;
    case 'unlock': upd.locked = false; break;
    case 'partial':
    case 'eaten': {
      upd.status = 'eaten';
      const fraction = b.action === 'partial' ? Math.max(0.05, Math.min(1.5, Number(b.fraction ?? 0.5))) : 1;
      if (b.action === 'partial') upd.eaten_fraction = fraction;
      const ings = scaleMeal({ ingredients: (b.ingredients ?? meal.ingredients) as any[] }, fraction).ingredients as { foodId: string; name: string; grams: number }[];
      upd.ingredients = ings;
      const foods = await loadFoods(sb, ings.map((i) => i.foodId));
      const items = ings.filter((i) => foods[i.foodId]).map((i) => ({ ...i, macros: roundMacros(macrosOf(foods[i.foodId], i.grams)) }));
      const t = items.reduce((a, i) => addMacros(a, i.macros), { ...ZERO });
      await sb.from('food_logs').insert({ user_id: userId, date: meal.date, slot: meal.slot, items, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber, vit_c_mg: t.vitCMg, magnesium_mg: t.magnesiumMg, source: 'menu', planned_meal_id: meal.id });
      break;
    }
    default: throw new HttpError(400, 'Acción desconocida');
  }
  await sb.from('planned_meals').update(upd).eq('id', meal.id);
  const ctx = await loadContext(sb, userId);
  const week = await computeWeek(sb, ctx, mondayOf(meal.date));
  const day = week.days.find((d) => d.date === meal.date)!;
  return json({ date: meal.date, target: day.target.macros, totals: day.totals, alerts: day.alerts, adjustments: day.adjustments, adherence: day.adherence, balance: week.balance });
}));
