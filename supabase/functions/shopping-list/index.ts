// POST /shopping-list
//  { action:'build', weekStart? }  → compra para la semana (por defecto la siguiente) = menú − (stock − lo que aún comes esta semana)
//  { action:'check', weekStart, foodId, checked }
//  { action:'bought', weekStart, foodIds? } → lo marcado pasa a tu despensa (carne/pescado: nevera lo de 2 días, resto congelador)
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { todayMadrid } from '../_shared/context.ts';
import { rowToMeal } from '../_shared/nutrition.ts';
import { loadFoods } from '../_shared/foods.ts';
import { projectedShoppingList, boughtToPantry, mondayOf, addDays, type PantryItem, type ShoppingItem } from '../_shared/engine/index.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json().catch(() => ({}));
  const today = todayMadrid();
  const weekStart: string = body.weekStart ?? addDays(mondayOf(today), 7);
  if (body.action === 'build' || !body.action) {
    const [{ data: pRows }, { data: rem }, { data: next }] = await Promise.all([
      sb.from('pantry_items').select('*'),
      sb.from('planned_meals').select('*').gte('date', today).lt('date', weekStart),
      sb.from('planned_meals').select('*').gte('date', weekStart).lte('date', addDays(weekStart, 6)),
    ]);
    if (!next?.length) return json({ weekStart, items: [], byAisle: {}, coveredByStock: [], note: 'Aún no hay menú para esa semana: genéralo primero en Batch.' });
    const pantry: PantryItem[] = (pRows ?? []).map((p: any) => ({ id: p.id, name: p.name, foodId: p.food_id ?? undefined, location: p.location, quantityG: p.quantity_g != null ? +p.quantity_g : undefined, units: p.units != null ? +p.units : undefined, unitGrams: p.unit_grams != null ? +p.unit_grams : undefined, expiresOn: p.expires_on ?? undefined }));
    const meals = (next ?? []).map(rowToMeal); const remaining = (rem ?? []).map(rowToMeal);
    const foods = await loadFoods(sb, meals.flatMap((m) => m.ingredients.map((i) => i.foodId)));
    const { data: st } = await sb.from('nutrition_settings').select('shopping_day').maybeSingle();
    const shoppingDate = addDays(weekStart, (st?.shopping_day ?? 6) - 8);   // sábado anterior por defecto
    const r = projectedShoppingList({ pantry, remainingThisWeek: remaining, meals, foods, shoppingDate: shoppingDate >= today ? shoppingDate : today });
    const { data: prev } = await sb.from('shopping_lists').select('checked').eq('week_start', weekStart).maybeSingle();
    await sb.from('shopping_lists').upsert({ user_id: userId, week_start: weekStart, shopping_date: shoppingDate, items: r.items, covered: r.coveredByStock, checked: prev?.checked ?? [], updated_at: new Date().toISOString() });
    return json({ weekStart, shoppingDate, ...r, checked: prev?.checked ?? [] });
  }
  const { data: list } = await sb.from('shopping_lists').select('*').eq('week_start', weekStart).maybeSingle();
  if (!list) throw new HttpError(404, 'Genera primero la lista');
  if (body.action === 'check') {
    const set = new Set<string>(list.checked ?? []);
    body.checked ? set.add(body.foodId) : set.delete(body.foodId);
    await sb.from('shopping_lists').update({ checked: [...set] }).eq('week_start', weekStart);
    return json({ checked: [...set] });
  }
  if (body.action === 'bought') {
    const ids: string[] = body.foodIds ?? list.checked ?? [];
    const items = (list.items as ShoppingItem[]).filter((i) => ids.includes(i.foodId));
    const rows = boughtToPantry(items, today).map((p) => ({ user_id: userId, name: p.name, food_id: p.foodId ?? null, location: p.location, quantity_g: p.quantityG ?? null }));
    if (rows.length) { const { error } = await sb.from('pantry_items').insert(rows); if (error) throw error; }
    await sb.from('shopping_lists').update({ items: (list.items as ShoppingItem[]).filter((i) => !ids.includes(i.foodId)), checked: [] }).eq('week_start', weekStart);
    return json({ addedToPantry: rows.length });
  }
  throw new HttpError(400, 'Acción desconocida');
}));
