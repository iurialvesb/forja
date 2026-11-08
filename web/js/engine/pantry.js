// Generado por scripts/build-web-engine.mjs desde engine/src/pantry.ts. No editar.
// Despensa (congelador / nevera / despensa), consumo, lista de la compra y batch cooking.

                                                          
import { addDays, daysBetween } from './fitness.js';

                                                            

                             
             
               
                  
                     
                                            
                                                                        
                     
                     
                    
 

export const gramsOf = (p            ) => p.quantityG ?? (p.units != null && p.unitGrams ? p.units * p.unitGrams : 0);

export function expiringSoon(items              , today        , days = 4)               {
  return items.filter((i) => i.expiresOn && daysBetween(today, i.expiresOn) <= days).sort((a, b) => a.expiresOn .localeCompare(b.expiresOn ));
}

/** Total por alimento necesario para un conjunto de comidas. */
export function requiredByFood(meals                                    )                                               {
  const m = new Map                                         ();
  for (const meal of meals) for (const i of meal.ingredients) {
    const cur = m.get(i.foodId) ?? { name: i.name, grams: 0 };
    cur.grams += i.grams; m.set(i.foodId, cur);
  }
  return m;
}

                                                                                                          

export function shoppingList(meals                                    , pantry              )                 {
  const need = requiredByFood(meals);
  const out                 = [];
  for (const [foodId, n] of need) {
    const have = pantry.filter((p) => p.foodId === foodId).reduce((a, p) => a + gramsOf(p), 0);
    const buy = Math.max(0, n.grams - have);
    out.push({ foodId, name: n.name, needG: Math.round(n.grams), haveG: Math.round(have), buyG: Math.ceil(buy / 10) * 10 });
  }
  return out.filter((l) => l.buyG > 0).sort((a, b) => a.name.localeCompare(b.name));
}

const STOP = new Set(['de', 'del', 'con', 'sin', 'al', 'a', 'la', 'el', 'en', 'y', 'cocido', 'cocida', 'cocidos', 'cocidas', 'crudo', 'cruda', 'natural', 'hacendado', 'consum', 'mercadona', 'raw', 'cooked', 'extra', 'lata', 'latas', 'bote', 'paquete', 'fresco', 'fresca', 'entero', 'entera']);
const toks = (s        ) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(es|s)$/, ''));
/** ¿El ingrediente de la receta es este producto de la despensa? (por nombre, cuando no coincide el alimento de la base de datos) */
export function nameMatches(ingredient        , pantryName        )          {
  const a = toks(ingredient), bl = toks(pantryName), b = new Set(bl);
  if (!a.length || !b.size) return false;
  if (a.length >= 2 && a.every((w) => b.has(w))) return true;      // "pechuga de pollo" ↔ "Pollo, pechuga fileteada"
  return a[0] === bl[0] && a.filter((w) => b.has(w)).length / a.length >= 0.5;   // misma palabra principal ("arroz blanco" ↔ "Arroz basmati")
}

                                                                                                                                                                               

/** Descuenta de la despensa (primero lo que caduca antes; luego nevera, despensa, congelador). Devuelve los cambios para poder deshacerlos. */
export function consume(pantry              , ingredients              )                                                                                                                                                       {
  const items = pantry.map((p) => ({ ...p }));
  const before = new Map(pantry.map((p) => [p.id, { ...p }]));
  const missing                                    = [];
  const used                                                  = [];
  const locRank                           = { nevera: 0, despensa: 1, congelador: 2 };
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
  const changes                 = [];
  for (const p of items) {
    const b = before.get(p.id) ;
    if (b.quantityG === p.quantityG && b.units === p.units) continue;
    const removed = !remaining.includes(p);
    changes.push({ id: p.id, before: { quantityG: b.quantityG, units: b.units }, after: { quantityG: p.quantityG, units: p.units }, removed, row: removed ? b : undefined });
  }
  return { pantry: remaining, missing, changes, used };
}

// ---------------- Batch cooking ----------------

                                                                                                                                                            
                         
             
               
                                                       
                      
                                                                            
                     
                  
 

                                                                                                                                       
                                                                                                                                                                       

                            
                   
                       
                     
                          
                                                                               
                     
 

/**
 * Plan de batch cooking: agrupa las comidas del menú que salen de recetas de batch, suma cantidades,
 * ordena las tareas (primero lo pasivo y largo, horno/olla en paralelo, manos libres para lo activo)
 * y reparte en táperes con conservación segura (nevera ≤ días de la receta; el resto al congelador).
 */
export function buildBatchPlan(cookDate        , meals               , recipes                        )            {
  const byRecipe = new Map                       ();
  for (const m of meals) if (m.fromBatch && m.recipeId && recipes[m.recipeId] && m.date >= cookDate) {
    const l = byRecipe.get(m.recipeId) ?? []; l.push(m); byRecipe.set(m.recipeId, l);
  }
  const warnings           = [];
  const totals = [...byRecipe.entries()].map(([rid, ms]) => {
    const req = requiredByFood(ms);
    return { recipe: recipes[rid].name, ingredients: [...req.values()].map((v) => ({ name: v.name, grams: Math.round(v.grams) })) };
  });

  // Planificación de tareas: una "mano" para lo activo; horno ×1, fuego ×3, olla ×1 para lo pasivo.
  const res = { horno: [0], fuego: [0, 0, 0], olla: [0], microondas: [0], ninguno: [0, 0, 0, 0] }                            ;
  let hands = 0; const tasks              = [];
  const steps = [...byRecipe.keys()].flatMap((rid) => recipes[rid].steps.map((s, i) => ({ rid, s, i })));
  // Pasivas largas primero (arranca el horno y el arroz), luego las activas.
  const pending = steps.sort((a, b) => (a.s.hands === 'pasiva' ? -1 : 1) - (b.s.hands === 'pasiva' ? -1 : 1) || b.s.minutes - a.s.minutes);
  const doneAt = new Map                ();         // fin del paso previo de cada receta
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

  const containers              = [];
  for (const [rid, ms] of byRecipe) {
    const r = recipes[rid];
    for (const m of ms.sort((a, b) => a.date.localeCompare(b.date))) {
      const d = daysBetween(cookDate, m.date);
      let storage           = 'nevera'; let note                    ;
      if (d > r.fridgeDays) {
        if (r.freezable) { storage = 'congelador'; note = `Pásalo a la nevera la noche del ${addDays(m.date, -1)}.`; }
        else { note = `"${r.name}" no aguanta hasta el ${m.date} ni se congela bien: cocínalo a mitad de semana.`; warnings.push(note); }
      }
      containers.push({ label: `${m.date} · ${m.slot.replace('_', ' ')}`, date: m.date, slot: m.slot, recipe: r.name, contents: m.ingredients.map((i) => ({ name: i.name, grams: Math.round(i.grams) })), storage, note });
    }
  }
  return { cookDate, totalMinutes, tasks, containers, totals, warnings };
}
