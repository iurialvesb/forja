// Orquestación de nutrición: objetivos por día (según el plan de entrenamiento), menú, registros,
// reequilibrio y avisos. Todo el cálculo lo hace el motor; aquí solo se lee y se guarda.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AthleteContext } from './context.ts';
import { loadFoods } from './foods.ts';
import {
  dayTarget, rebalanceDay, weekBalance, adherence, recommendSupplements, weeklySupplementPlan, missingSupplements, addMacros, ZERO, mondayOf, addDays, daysBetween,
  type NutritionSettings, type PlannedMeal, type PlannedSession, type DayTarget, type Macros, type Alert, type FoodIndex, type MealSlot, type MealAdjustment,
} from './engine/index.ts';
import { rowToPlanned } from './replan.ts';

export async function loadSettings(sb: SupabaseClient, ctx: AthleteContext): Promise<NutritionSettings & { batchDay: number; dislikes: string[]; intolerances: string[]; maxSupplements?: number; compensate: boolean; optionalSlots: string[]; preferences?: string }> {
  const { data: s } = await sb.from('nutrition_settings').select('*').maybeSingle();
  const { data: p } = await sb.from('profiles').select('height_cm, birth_date').eq('id', ctx.userId).single();
  const age = p?.birth_date ? Math.floor(daysBetween(p.birth_date, ctx.today) / 365.25) : 30;
  return {
    mode: s?.mode ?? 'mantenimiento', rateKgPerWeek: s?.rate_kg_per_week ?? undefined, proteinGPerKg: s?.protein_g_per_kg ?? undefined, fatGPerKg: s?.fat_g_per_kg ?? undefined,
    activityFactor: s?.activity_factor != null ? Number(s.activity_factor) : 1.4, mealSlots: s?.meal_slots ?? ['media_manana', 'comida', 'cena'],
    heightCm: p?.height_cm != null ? Number(p.height_cm) : 175, ageYears: age, batchDay: s?.batch_day ?? 7, dislikes: s?.dislikes ?? [], intolerances: s?.intolerances ?? [],
    maxSupplements: s?.max_supplements_per_day ?? undefined, compensate: !!s?.compensate,
    optionalSlots: s?.optional_slots ?? (s ? [] : ['desayuno', 'merienda']), preferences: s?.preferences ?? undefined,
  };
}

export const rowToMeal = (r: any): PlannedMeal => ({ id: r.id, date: r.date, slot: r.slot, recipeId: r.recipe_id ?? undefined, title: r.title, ingredients: r.ingredients ?? [], status: r.status, locked: r.locked, fromBatch: r.from_batch });

export interface DayView { date: string; target: DayTarget; meals: PlannedMeal[]; totals: Macros; eaten: Macros; alerts: Alert[]; adjustments: MealAdjustment[]; adherence: { mealsDone: number; mealsTotal: number; score: number } }

/** Calcula la semana: objetivos según entreno, reequilibrio de comidas pendientes y avisos. Guarda los cambios. */
export async function computeWeek(sb: SupabaseClient, ctx: AthleteContext, weekStart = mondayOf(ctx.today), persist = true) {
  const st = await loadSettings(sb, ctx);
  const end = addDays(weekStart, 6);
  const [ps, meals, logs, sess] = await Promise.all([
    sb.from('planned_sessions').select('*').gte('date', weekStart).lte('date', end),
    sb.from('planned_meals').select('*').gte('date', weekStart).lte('date', end),
    sb.from('food_logs').select('*').gte('date', weekStart).lte('date', end),
    sb.from('sessions').select('started_at, active_kcal').is('deleted_at', null).gte('started_at', weekStart).lte('started_at', addDays(end, 1)),
  ]);
  const planned = (ps.data ?? []).map(rowToPlanned).filter((p) => p.status !== 'skipped');
  const mealRows = (meals.data ?? []).map(rowToMeal);
  const foods: FoodIndex = await loadFoods(sb, mealRows.flatMap((m) => m.ingredients.map((i) => i.foodId)));
  const { data: pantry } = await sb.from('pantry_items').select('food_id');
  const pantryIds = new Set<string>((pantry ?? []).map((x: any) => x.food_id).filter(Boolean));
  const days: DayView[] = [];
  let runningDelta = 0; let perDayAdjust: number | undefined;
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const sessions: PlannedSession[] = planned.filter((p) => p.date === date);
    const measured = date < ctx.today ? (sess.data ?? []).filter((s: any) => s.started_at.slice(0, 10) === date).reduce((a: number, s: any) => a + Number(s.active_kcal ?? 0), 0) : undefined;
    const race = ctx.goals.find((g) => g.date >= date && daysBetween(date, g.date) <= 2);
    if (date >= ctx.today && perDayAdjust === undefined) {
      // Compensación semanal opcional: reparte el exceso/defecto de los días pasados entre los que quedan (máx. ±250 kcal/día).
      const left = 7 - i;
      perDayAdjust = st.compensate && Math.abs(runningDelta) > 300 && left > 0 ? Math.max(-250, Math.min(250, -runningDelta / left)) : 0;
    }
    const target = dayTarget({ date, settings: st, profile: ctx.profile, sessions, measuredActiveKcal: measured || undefined, kcalAdjust: date >= ctx.today ? perDayAdjust : undefined,
      raceToday: race?.date === date, raceInDays: race ? daysBetween(date, race.date) : undefined, raceDistanceM: race ? (race.type === 'hyrox' ? 21000 : race.distanceM) : undefined });
    const unlinked = (logs.data ?? []).filter((l: any) => l.date === date && !l.planned_meal_id);
    const extra = unlinked.reduce((a: Macros, l: any) => addMacros(a, { kcal: +l.kcal, protein: +l.protein, carbs: +l.carbs, fat: +l.fat, fiber: +(l.fiber ?? 0), vitCMg: +(l.vit_c_mg ?? 0), magnesiumMg: +(l.magnesium_mg ?? 0) }), { ...ZERO });
    const dayMeals = mealRows.filter((m) => m.date === date);
    const trainingSlot = sessions.find((s) => s.intensity !== 'baja')?.slot;
    const r = date >= ctx.today
      ? rebalanceDay({ date, target, meals: dayMeals, foods, extraEaten: extra, trainingSlot, pantryFoodIds: pantryIds })
      : { meals: dayMeals, totals: addMacros(extra, (logs.data ?? []).filter((l: any) => l.date === date && l.planned_meal_id).reduce((a: Macros, l: any) => addMacros(a, { kcal: +l.kcal, protein: +l.protein, carbs: +l.carbs, fat: +l.fat }), { ...ZERO })), alerts: [] as Alert[], adjustments: [] as MealAdjustment[] };
    if (date < ctx.today && (logs.data ?? []).some((l: any) => l.date === date)) runningDelta += r.totals.kcal - target.macros.kcal;
    days.push({ date, target, meals: r.meals, totals: r.totals, eaten: extra, alerts: r.alerts, adjustments: r.adjustments, adherence: adherence({ meals: r.meals, totals: r.totals, target: target.macros }) });
  }
  const balance = weekBalance(days.map((d) => ({ date: d.date, target: d.target.macros, totals: d.totals, past: d.date < ctx.today })));
  if (persist) {
    await sb.from('day_targets').upsert(days.map((d) => ({ user_id: ctx.userId, date: d.date, kcal: d.target.macros.kcal, protein: d.target.macros.protein, carbs: d.target.macros.carbs, fat: d.target.macros.fat, fiber: d.target.macros.fiber, load: d.target.load, explanation: d.target.explanation, computed_at: new Date().toISOString() })));
    for (const d of days.filter((x) => x.date >= ctx.today)) for (const m of d.meals) {
      const orig = mealRows.find((o) => o.id === m.id);
      if (orig && JSON.stringify(orig.ingredients) !== JSON.stringify(m.ingredients)) await sb.from('planned_meals').update({ ingredients: m.ingredients }).eq('id', m.id);
    }
    const todays = days.filter((d) => d.date >= ctx.today).flatMap((d) => d.alerts);
    await sb.from('nutrition_alerts').delete().gte('date', ctx.today).eq('read', false);
    if (todays.length || balance.message) await sb.from('nutrition_alerts').insert([...todays, ...(balance.message ? [{ level: 'info', date: ctx.today, message: balance.message }] : [])].map((a: any) => ({ user_id: ctx.userId, date: a.date, slot: a.slot ?? null, level: a.level, message: a.message })));
  }
  return { settings: st, days, balance, foods };
}

/** Suplementos de hoy según lo comido en los últimos 7 días y el entrenamiento planificado. */
export async function supplementsToday(sb: SupabaseClient, ctx: AthleteContext, st: { maxSupplements?: number }) {
  const { data: sup0 } = await sb.from('supplements').select('*').eq('active', true);
  const sup = sup0 ?? [];
  const { data: pt } = await sb.from('day_targets').select('protein').eq('date', ctx.today).maybeSingle();
  const { data: pl } = await sb.from('food_logs').select('date, protein').gte('date', addDays(ctx.today, -7)).lt('date', ctx.today);
  const pDays = new Map<string, number>(); for (const l of pl ?? []) pDays.set(l.date, (pDays.get(l.date) ?? 0) + Number(l.protein));
  const pVals = [...pDays.values()].filter((x) => x > 40);
  const proteinAvgG = pVals.length >= 3 ? pVals.reduce((a, b) => a + b, 0) / pVals.length : undefined;
  const proteinTargetG = pt?.protein != null ? Number(pt.protein) : undefined;
  const missing = missingSupplements(sup.map((x: any) => x.kind), { proteinAvgG, proteinTargetG, date: ctx.today, longSessionsPerWeek: 1 });
  const { data: wk } = await sb.from('planned_sessions').select('*').gte('date', ctx.today).lte('date', addDays(ctx.today, 6)).neq('status', 'skipped');
  const available = sup.map((s: any) => ({ id: s.kind, name: s.name, doseText: s.dose_text, stock: s.stock ?? undefined }));
  const week = weeklySupplementPlan({ available, days: [...Array(7)].map((_, i) => addDays(ctx.today, i)).map((d) => ({ date: d, sessions: (wk ?? []).filter((x: any) => x.date === d).map(rowToPlanned) })), sex: ctx.profile.sex, maxPerDay: st.maxSupplements, proteinAvgG, proteinTargetG });
  if (!sup.length) return { recs: [], notes: ['Añade los suplementos que tienes en casa para que te diga cuál tomar cada día.'], week, missing };
  const { data: logs } = await sb.from('food_logs').select('date, kcal, protein, carbs, fat, vit_c_mg, magnesium_mg').gte('date', addDays(ctx.today, -7)).lt('date', ctx.today);
  const byDay = new Map<string, Macros & { micro: boolean }>();
  for (const l of logs ?? []) {
    const cur = byDay.get(l.date) ?? { ...ZERO, micro: false };
    byDay.set(l.date, { ...addMacros(cur, { kcal: +l.kcal, protein: +l.protein, carbs: +l.carbs, fat: +l.fat, vitCMg: +(l.vit_c_mg ?? 0), magnesiumMg: +(l.magnesium_mg ?? 0) }), micro: cur.micro || l.vit_c_mg != null });
  }
  const { data: today } = await sb.from('planned_sessions').select('*').eq('date', ctx.today);
  const sleep = ctx.health.slice(-5).map((h) => h.sleepHours).filter((x): x is number => x != null);
  const r = recommendSupplements({
    available,
    last7Days: [...byDay.values()], daysWithMicros: [...byDay.values()].filter((d) => d.micro && d.kcal > 1000).length,
    today: (today ?? []).map(rowToPlanned), sex: ctx.profile.sex, sleepHoursAvg: sleep.length ? sleep.reduce((a, b) => a + b, 0) / sleep.length : undefined,
    maxPerDay: st.maxSupplements, proteinAvgG, proteinTargetG, date: ctx.today,
  });
  return { recs: r.recs.map((x) => ({ ...x, supplementId: sup.find((s: any) => s.kind === x.id)?.id })), notes: r.notes, week, missing };
}

export type { MealSlot };
