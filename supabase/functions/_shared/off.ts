// Open Food Facts (ODbL; imágenes CC BY-SA): productos reales de supermercado (Hacendado/Mercadona, Consum…)
// por código de barras o por nombre, con foto, marca, formato y tabla nutricional.
import type { Food } from './engine/index.ts';
import { adminClient } from './supabase.ts';

const UA = { 'User-Agent': 'Forja/0.2 (app personal de entrenamiento y nutricion)' };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export interface OffProduct { code: string; name: string; brand?: string; quantity?: string; packageG?: number; imageUrl?: string; food: Food | null }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === 'string').join(', ') : v && typeof v === 'object' ? (Object.values(v as Record<string, unknown>).find((x) => typeof x === 'string') as string | undefined) : undefined);

function grams(q?: string): number | undefined {
  if (!q) return undefined;
  const m = q.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|l|cl|ml)\b/i);
  if (!m) return undefined;
  const n = Number(m[1]); const u = m[2].toLowerCase();
  return Math.round(u === 'kg' || u === 'l' ? n * 1000 : u === 'cl' ? n * 10 : n);
}

export function toProduct(p: any): OffProduct | null {
  const code = String(p.code ?? p._id ?? '');
  if (!code) return null;
  const name = str(p.product_name_es) || str(p.product_name) || str(p.generic_name_es) || str(p.generic_name) || '';
  const brand = str(p.brands)?.split(',')[0]?.trim();
  const n = p.nutriments ?? {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : undefined);
  const food: Food | null = kcal != null && n.proteins_100g != null && n.carbohydrates_100g != null && n.fat_100g != null ? {
    id: `off_${code}`, name: [name, brand].filter(Boolean).join(' · ') || `Producto ${code}`, source: 'off', sourceRef: code,
    unitGrams: p.serving_quantity ? Number(p.serving_quantity) : undefined,
    per100: { kcal: Number(kcal), protein: Number(n.proteins_100g), carbs: Number(n.carbohydrates_100g), fat: Number(n.fat_100g), fiber: Number(n.fiber_100g ?? 0),
      vitCMg: n['vitamin-c_100g'] != null ? Number(n['vitamin-c_100g']) * 1000 : 0, magnesiumMg: n['magnesium_100g'] != null ? Number(n['magnesium_100g']) * 1000 : 0 },
  } : null;
  const quantity = str(p.quantity);
  return { code, name: name || `Producto ${code}`, brand, quantity, packageG: grams(quantity), imageUrl: str(p.image_front_small_url) || str(p.image_small_url) || str(p.image_front_url) || undefined, food };
}

const FIELDS = 'code,product_name,product_name_es,generic_name,generic_name_es,brands,quantity,serving_quantity,image_front_small_url,image_small_url,nutriments';

export async function offByCode(code: string): Promise<OffProduct | null> {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { headers: UA });
  if (!r.ok) return null;
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return toProduct({ ...j.product, code });
}

/** Búsqueda por texto: primero el buscador nuevo (rápido), si falla el clásico. Prioriza la marca pedida y productos de España. */
export async function offSearch(q: string, brand?: string, size = 6): Promise<OffProduct[]> {
  const query = [q, brand].filter(Boolean).join(' ');
  let hits: any[] = [];
  try {
    const ctl = AbortSignal.timeout(6000);
    const r = await fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&langs=es&page_size=${size * 2}&fields=${FIELDS},countries_tags`, { headers: UA, signal: ctl });
    if (r.ok) hits = (await r.json()).hits ?? [];
  } catch { /* siguiente */ }
  if (!hits.length) {
    try {
      const r = await fetch(`https://es.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${size * 2}&fields=${FIELDS}`, { headers: UA, signal: AbortSignal.timeout(8000) });
      if (r.ok) hits = (await r.json()).products ?? [];
    } catch { /* sin resultados */ }
  }
  const b = brand ? norm(brand) : '';
  const words = norm(q).split(' ').filter((w) => w.length > 2);
  const scored = hits.map(toProduct).filter((p): p is OffProduct => !!p).map((p) => {
    const n = norm(`${p.name} ${p.brand ?? ''}`);
    let s = words.filter((w) => n.includes(w)).length / Math.max(1, words.length);
    if (b && norm(p.brand ?? '').includes(b)) s += 1;
    if (p.food) s += 0.3; if (p.imageUrl) s += 0.2;
    return { p, s };
  }).sort((a, z) => z.s - a.s);
  return scored.slice(0, size).map((x) => x.p);
}

/** Guarda el producto como alimento global (caché) para no volver a buscarlo. */
export async function cacheProduct(p: OffProduct): Promise<void> {
  if (!p.food) return;
  const f = p.food; const n = f.per100;
  await adminClient().from('foods').upsert({ id: f.id, owner: null, name: f.name, kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat, fiber: n.fiber ?? null, vit_c_mg: n.vitCMg ?? null, magnesium_mg: n.magnesiumMg ?? null,
    unit_grams: f.unitGrams ?? null, source: 'off', source_ref: p.code, brand: p.brand ?? null, image_url: p.imageUrl ?? null, package_g: p.packageG ?? null,
    search_terms: [norm(p.name), norm(f.name), p.code, ...(p.brand ? [norm(`${p.name} ${p.brand}`)] : [])] }, { onConflict: 'id' });
}

/** Ejecuta en paralelo con un límite (para no saturar las APIs). */
export async function pool<T, R>(xs: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all([...Array(Math.min(n, xs.length))].map(async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k], k); } }));
  return out;
}
