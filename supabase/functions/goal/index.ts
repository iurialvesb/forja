// POST /goal { goalId } → panel del objetivo: media maratón (o cualquier carrera) o HYROX. Sin IA.
import { handler, json, requireUser, userClient, HttpError } from '../_shared/supabase.ts';
import { loadContext } from '../_shared/context.ts';
import { raceOutlook, hyroxOutlook, hyroxKeyOf, hyroxSplits, addDays, type HyroxDivision } from '../_shared/engine/index.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const { goalId } = await req.json().catch(() => ({}));
  const { data: g } = await sb.from('goals').select('*').eq('id', goalId).maybeSingle();
  if (!g) throw new HttpError(404, 'Objetivo no encontrado');
  const ctx = await loadContext(sb, userId);
  const { data: pl } = await sb.from('planned_sessions').select('date,type,title,planned_km,key,status').gte('date', ctx.today).lte('date', g.date).order('date');
  const planned = (pl ?? []).map((p: any) => ({ date: p.date, type: p.type, title: p.title, plannedKm: p.planned_km, key: p.key, status: p.status }));
  const goal = { id: g.id, name: g.name, type: g.type, date: g.date, distanceM: g.distance_m != null ? Number(g.distance_m) : null, targetTimeS: g.target_time_s };
  const vdot = ctx.paces?.vdot ?? null;
  if (g.type !== 'hyrox') return json({ goal, outlook: raceOutlook({ goal, today: ctx.today, vdot, sessions: ctx.sessions, planned }) });

  // HYROX: parciales registrados (columna split_s) de los últimos 9 meses.
  const { data: sets } = await sb.from('session_sets').select('session_id,exercise_id,set_label,split_s,performed_on,block_id').not('split_s', 'is', null).gte('performed_on', addDays(ctx.today, -270)).limit(3000);
  const records = (sets ?? []).map((s: any) => ({ s, key: hyroxKeyOf(s.exercise_id ?? '', s.set_label) })).filter((x) => x.key && x.s.split_s > 0)
    .map(({ s, key }) => ({ date: s.performed_on, sessionId: s.session_id, key: key!, exerciseId: s.exercise_id, label: s.set_label ?? '', splitS: s.split_s }));
  const byBlock = new Map<string, { date: string; sessionId: string; totalS: number; stations: number }>();
  for (const r of sets ?? []) {
    if (!(r.split_s > 0)) continue;
    const k = r.block_id; const x = byBlock.get(k) ?? { date: r.performed_on, sessionId: r.session_id, totalS: 0, stations: 0 };
    x.totalS += r.split_s; if (r.exercise_id !== 'run') x.stations++; byBlock.set(k, x);
  }
  const simulations = [...byBlock.values()].filter((x) => x.stations >= 2).sort((a, b) => a.date.localeCompare(b.date));
  const division = (ctx.profile as any).hyroxDivision ?? (await sb.from('profiles').select('hyrox_division').eq('id', userId).single()).data?.hyrox_division ?? 'open_men';
  const outlook = hyroxOutlook({ goal, today: ctx.today, division: division as HyroxDivision, vdot, records, sessions: ctx.sessions, planned, simulations });
  return json({ goal, outlook, splits: goal.targetTimeS ? hyroxSplits(goal.targetTimeS, division as HyroxDivision) : [] });
}));
