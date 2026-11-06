// Resolución de alimentos: caché propia → USDA FoodData Central (genéricos, CC0) → Open Food Facts (código de barras, ODbL).
// Los macros SIEMPRE se calculan con estas bases de datos, no los inventa la IA.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Food, FoodIndex } from './engine/index.ts';
import { adminClient } from './supabase.ts';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function rowToFood(r: any): Food {
  return { id: r.id, name: r.name, unitGrams: r.unit_grams != null ? Number(r.unit_grams) : undefined, source: r.source, sourceRef: r.source_ref ?? undefined,
    per100: { kcal: Number(r.kcal), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat), fiber: r.fiber != null ? Number(r.fiber) : 0, vitCMg: r.vit_c_mg != null ? Number(r.vit_c_mg) : 0, magnesiumMg: r.magnesium_mg != null ? Number(r.magnesium_mg) : 0 } };
}

export async function loadFoods(sb: SupabaseClient, ids: string[]): Promise<FoodIndex> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await sb.from('foods').select('*').in('id', uniq);
  return Object.fromEntries((data ?? []).map((r: any) => [r.id, rowToFood(r)]));
}

async function saveGlobal(f: Food, terms: string[]) {
  const p = f.per100;
  await adminClient().from('foods').upsert({ id: f.id, owner: null, name: f.name, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber ?? null, vit_c_mg: p.vitCMg ?? null, magnesium_mg: p.magnesiumMg ?? null, unit_grams: f.unitGrams ?? null, source: f.source, source_ref: f.sourceRef ?? null, search_terms: terms }, { onConflict: 'id' });
}

// Identificadores de nutrientes de FoodData Central.
const NUT = { kcal: [1008, 2047, 2048], protein: [1003], carbs: [1005], fat: [1004], fiber: [1079], vitC: [1162], mg: [1090] };

async function usdaSearch(queryEn: string): Promise<Food | null> {
  const key = Deno.env.get('USDA_API_KEY');
  if (!key) return null;
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: queryEn, dataType: ['Foundation', 'SR Legacy'], pageSize: 5 }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const f = j.foods?.[0];
  if (!f) return null;
  const get = (ids: number[]) => { for (const id of ids) { const n = f.foodNutrients?.find((x: any) => x.nutrientId === id); if (n) return Number(n.value); } return undefined; };
  const kcal = get(NUT.kcal), protein = get(NUT.protein), carbs = get(NUT.carbs), fat = get(NUT.fat);
  if (kcal == null || protein == null || carbs == null || fat == null) return null;
  return { id: `usda_${f.fdcId}`, name: f.description, source: 'usda', sourceRef: String(f.fdcId),
    per100: { kcal, protein, carbs, fat, fiber: get(NUT.fiber) ?? 0, vitCMg: get(NUT.vitC) ?? 0, magnesiumMg: get(NUT.mg) ?? 0 } };
}

export async function offBarcode(code: string): Promise<Food | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,serving_quantity`, { headers: { 'User-Agent': 'Forja/0.1 (app personal de entrenamiento)' } });
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status !== 1 || !j.product?.nutriments) return null;     // OFF responde 200 aunque no exista
  const n = j.product.nutriments;
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : undefined);
  if (kcal == null || n.proteins_100g == null || n.carbohydrates_100g == null || n.fat_100g == null) return null;
  return { id: `off_${code}`, name: j.product.product_name || `Producto ${code}`, source: 'off', sourceRef: code,
    unitGrams: j.product.serving_quantity ? Number(j.product.serving_quantity) : undefined,
    per100: { kcal: Number(kcal), protein: Number(n.proteins_100g), carbs: Number(n.carbohydrates_100g), fat: Number(n.fat_100g), fiber: Number(n.fiber_100g ?? 0),
      vitCMg: n['vitamin-c_100g'] != null ? Number(n['vitamin-c_100g']) * 1000 : 0, magnesiumMg: n['magnesium_100g'] != null ? Number(n['magnesium_100g']) * 1000 : 0 } };
}

/**
 * Busca un alimento por su nombre en español (caché) o por la consulta en inglés para USDA.
 * Devuelve null si no se encuentra: entonces se pregunta al usuario en vez de inventar.
 */
export async function resolveFood(sb: SupabaseClient, nameEs: string, queryEn?: string, barcode?: string, cooked = false): Promise<Food | null> {
  if (barcode) {
    const { data } = await sb.from('foods').select('*').eq('id', `off_${barcode}`).maybeSingle();
    if (data) return rowToFood(data);
    const f = await offBarcode(barcode);
    if (f) await saveGlobal(f, [norm(f.name), barcode]);
    return f;
  }
  const n = norm(nameEs);
  const { data: exact } = await sb.from('foods').select('*').contains('search_terms', [n]).limit(1);
  if (exact?.length) return rowToFood(exact[0]);
  const words = n.split(' ').filter((w) => w.length > 3);
  // Los alimentos de referencia están en crudo: si la cantidad es de alimento cocinado, no se reutilizan por coincidencia parcial.
  if (words.length && !cooked) {
    const { data: partial } = await sb.from('foods').select('*').contains('search_terms', words.slice(0, 2)).limit(1);
    if (partial?.length) return rowToFood(partial[0]);
  }
  if (queryEn) {
    const f = await usdaSearch(queryEn);
    if (f) {
      const named = { ...f, name: nameEs.charAt(0).toUpperCase() + nameEs.slice(1) };
      await saveGlobal(named, [n, norm(queryEn), ...n.split(' ')]);
      return named;
    }
  }
  return null;
}
