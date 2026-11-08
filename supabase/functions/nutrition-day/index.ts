// POST /nutrition-day { weekStart? } → objetivos por día, menú reequilibrado, avisos, suplementos de hoy, despensa por caducar.
import { handler, json, requireUser, userClient } from '../_shared/supabase.ts';
import { loadContext } from '../_shared/context.ts';
import { computeWeek, supplementsToday } from '../_shared/nutrition.ts';
import { expiringSoon, mondayOf, mealMacros } from '../_shared/engine/index.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json().catch(() => ({}));
  const ctx = await loadContext(sb, userId);
  const week = await computeWeek(sb, ctx, body.weekStart ?? mondayOf(ctx.today));
  const supp = await supplementsToday(sb, ctx, week.settings);
  const { data: pantry } = await sb.from('pantry_items').select('*');
  const soon = expiringSoon((pantry ?? []).map((p: any) => ({ id: p.id, name: p.name, location: p.location, quantityG: p.quantity_g ?? undefined, units: p.units ?? undefined, expiresOn: p.expires_on ?? undefined })), ctx.today, 3);
  const { data: batch } = await sb.from('batch_plans').select('*').eq('week_start', body.weekStart ?? mondayOf(ctx.today)).maybeSingle();
  return json({
    settings: { mode: week.settings.mode, mealSlots: week.settings.mealSlots, optionalSlots: week.settings.optionalSlots },
    days: week.days.map((d) => ({ date: d.date, target: d.target, totals: d.totals, eaten: d.eaten, alerts: d.alerts, adjustments: d.adjustments, adherence: d.adherence,
      meals: d.meals.map((m) => ({ ...m, macros: mealMacros(m, week.foods) })) })),
    balance: week.balance, supplements: supp, expiringSoon: soon, batchPlan: batch?.plan ?? null, shopping: batch?.shopping ?? [],
  });
}));
