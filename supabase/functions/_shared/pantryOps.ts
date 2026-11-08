// Descontar de la despensa lo que se cocina o se come (y deshacerlo).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { consume, type PantryItem, type PantryChange, type Ingredient } from './engine/index.ts';

const rowToItem = (p: any): PantryItem => ({ id: p.id, name: p.name, foodId: p.food_id ?? undefined, location: p.location, quantityG: p.quantity_g != null ? Number(p.quantity_g) : undefined, units: p.units != null ? Number(p.units) : undefined, unitGrams: p.unit_grams != null ? Number(p.unit_grams) : undefined, expiresOn: p.expires_on ?? undefined });

export async function deductPantry(sb: SupabaseClient, ingredients: Ingredient[]): Promise<{ changes: PantryChange[]; missing: { name: string; grams: number }[]; used: { name: string; grams: number; from: string }[]; rows: any[] }> {
  const { data } = await sb.from('pantry_items').select('*');
  const rows = data ?? [];
  const r = consume(rows.map(rowToItem), ingredients.filter((i) => i.grams > 0));
  for (const c of r.changes) {
    if (c.removed) await sb.from('pantry_items').delete().eq('id', c.id);
    else await sb.from('pantry_items').update({ quantity_g: c.after.quantityG ?? null, units: c.after.units ?? null, updated_at: new Date().toISOString() }).eq('id', c.id);
  }
  // Guardar la fila completa de lo que se ha acabado, para poder recuperarla al deshacer.
  const full = r.changes.map((c) => (c.removed ? { ...c, rowDb: rows.find((x: any) => x.id === c.id) } : c));
  return { changes: full as PantryChange[], missing: r.missing, used: r.used, rows };
}

export async function restorePantry(sb: SupabaseClient, changes: (PantryChange & { rowDb?: any })[] | null | undefined): Promise<void> {
  for (const c of changes ?? []) {
    if (c.removed && c.rowDb) { const { id: _i, ...rest } = c.rowDb; void _i; await sb.from('pantry_items').upsert({ id: c.id, ...rest }); }
    else {
      const { data: cur } = await sb.from('pantry_items').select('quantity_g, units').eq('id', c.id).maybeSingle();
      if (!cur) continue;
      const dq = (c.before.quantityG ?? 0) - (c.after.quantityG ?? 0), du = (c.before.units ?? 0) - (c.after.units ?? 0);
      await sb.from('pantry_items').update({ quantity_g: cur.quantity_g != null ? Number(cur.quantity_g) + dq : null, units: cur.units != null ? Number(cur.units) + du : null }).eq('id', c.id);
    }
  }
}
