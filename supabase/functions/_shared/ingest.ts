// Alta de sesiones desde cualquier fuente con deduplicación y adaptación del plan.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { findDuplicate, mergeSessions, mergeWatchIntoLog, isoDate, type Session } from './engine/index.ts';
import { loadContext, rowToSession } from './context.ts';
import { adaptUpcoming, persistDerived } from './replan.ts';
import { HttpError } from './supabase.ts';

export interface IngestResult { sessionId: string; merged: boolean; duplicateOf?: string; prs: string[]; changes: unknown[] }

export async function ingestSession(sb: SupabaseClient, userId: string, s: Session & { notes?: string; activeKcal?: number; strideM?: number; splits?: { kmIndex: number; durationS: number; avgHr?: number; cadence?: number; elevationDeltaM?: number }[] }, attachTo?: string, opts: { edit?: boolean } = {}): Promise<IngestResult> {
  if (!s.startedAt || !s.durationS || !s.discipline) throw new HttpError(400, 'Faltan startedAt, durationS o discipline');
  const source = s.source ?? 'manual';
  if (source === 'strava') throw new HttpError(400, 'Las actividades de Strava no se guardan como sesiones (API Policy de Strava). Usa Apple Health como fuente.');
  if (s.externalId) {
    const { data: link } = await sb.from('session_sources').select('session_id').eq('user_id', userId).eq('source', source).eq('external_id', s.externalId).maybeSingle();
    if (link) return { sessionId: link.session_id, merged: false, duplicateOf: link.session_id, prs: [], changes: [] };
  }
  // Candidatas: misma franja de ±6 h.
  const t = Date.parse(s.startedAt);
  const { data: near } = await sb.from('sessions').select('*, session_blocks(*), session_sets(*)').eq('user_id', userId).is('deleted_at', null)
    .gte('started_at', new Date(t - 6 * 3.6e6).toISOString()).lte('started_at', new Date(t + 6 * 3.6e6).toISOString());
  const nearS = (near ?? []).map(rowToSession);
  // Si el usuario elige la sesión del Watch a la que pertenece este WOD, se une a ella directamente.
  let forced: Session | undefined;
  if (attachTo) {
    forced = nearS.find((x) => x.id === attachTo);
    if (!forced) {
      const { data: row } = await sb.from('sessions').select('*, session_blocks(*), session_sets(*)').eq('id', attachTo).maybeSingle();
      if (!row) throw new HttpError(404, 'La sesión a la que quieres vincular no existe');
      forced = rowToSession(row);
    }
  }
  const dup = forced ? { existingId: forced.id, score: 1, reasons: ['vinculado por el usuario'] } : findDuplicate({ ...s, id: 'new' }, nearS);
  if (forced && !nearS.some((x) => x.id === forced.id)) nearS.push(forced);

  let sessionId: string; let merged = false;
  const base = (x: Session) => ({
    started_at: x.startedAt, duration_s: Math.round(x.durationS), discipline: x.discipline, title: x.title ?? null, rpe: x.rpe ?? null,
    avg_hr: x.avgHr ?? null, max_hr: x.maxHr ?? null, hr_zone_s: x.hrZoneSeconds ?? null, distance_m: x.distanceM ?? null,
    elevation_gain_m: x.elevationGainM ?? null, elevation_loss_m: x.elevationLossM ?? null, cadence_spm: x.cadenceSpm ?? null,
    is_race: !!x.isRace, is_time_trial: !!x.isTimeTrial,
  });
  if (dup) {
    const existing = nearS.find((x) => x.id === dup.existingId)!;
    // HealthKit aporta fisiología; la entrada manual/foto aporta estructura. Primaria = la que ya existía.
    const existingIsLog = existing.source === 'manual' || existing.source === 'photo';
    const m = source === 'healthkit' && existingIsLog ? mergeWatchIntoLog(existing, s)
      : source === 'healthkit' ? mergeSessions({ ...existing, avgHr: s.avgHr ?? existing.avgHr, maxHr: s.maxHr ?? existing.maxHr, hrZoneSeconds: s.hrZoneSeconds ?? existing.hrZoneSeconds }, s) : mergeSessions(existing, s);
    const { error } = await sb.from('sessions').update(base(m)).eq('id', existing.id);
    if (error) throw error;
    sessionId = existing.id; merged = true;
    if (s.blocks?.length) {
      if (existing.blocks?.length && attachTo) {
        const { data: prev } = await sb.from('session_sets').select('set_label,exercise_id,reps,load_kg,calories,distance_m,duration_s,status').eq('session_id', sessionId).order('position');
        await sb.from('session_edits').insert({ user_id: userId, session_id: sessionId, field: 'registro', old_value: prev ?? [], new_value: (s.blocks ?? []).flatMap((b) => b.sets.map((x) => ({ set_label: x.label ?? null, exercise_id: x.exerciseId, reps: x.reps ?? null, load_kg: x.loadKg ?? null, calories: x.calories ?? null, distance_m: x.distanceM ?? null, duration_s: x.durationS ?? null, status: x.status ?? 'done' }))) });
        await sb.from('session_blocks').delete().eq('session_id', sessionId);
      }   // el texto/foto sustituye a la estructura previa
      if (!existing.blocks?.length || attachTo) await writeBlocks(sb, userId, sessionId, s);
    }
    if (opts.edit && attachTo) {
      // Los tiempos del Apple Watch son exactos: al editar el WOD solo se cambian si los has movido más de un minuto.
      const moved = Math.abs(Date.parse(s.startedAt) - Date.parse(existing.startedAt)) > 60e3 || Math.abs(s.durationS - existing.durationS) > 60;
      await sb.from('sessions').update({ rpe: s.rpe ?? null, title: s.title ?? existing.title ?? null, discipline: s.discipline === 'other' ? existing.discipline : s.discipline, ...(moved ? { duration_s: Math.round(s.durationS), started_at: s.startedAt } : {}) }).eq('id', sessionId);
    }
    else if (s.title && (attachTo || !existing.title)) await sb.from('sessions').update({ title: s.title, rpe: s.rpe ?? existing.rpe ?? null, discipline: s.discipline === 'other' ? existing.discipline : s.discipline }).eq('id', sessionId);
  } else {
    const { data, error } = await sb.from('sessions').insert({ user_id: userId, ...base(s), primary_source: source, notes: s.notes ?? null, active_kcal: s.activeKcal ?? null, avg_stride_m: s.strideM ?? null }).select('id').single();
    if (error) throw error;
    sessionId = data.id;
    await writeBlocks(sb, userId, sessionId, s);
  }
  await sb.from('session_sources').upsert({ user_id: userId, session_id: sessionId, source, external_id: s.externalId ?? `${source}:${sessionId}` }, { onConflict: 'user_id,source,external_id' });
  if (s.splits?.length) await sb.from('run_splits').upsert(s.splits.map((x) => ({ session_id: sessionId, user_id: userId, km_index: x.kmIndex, duration_s: x.durationS, avg_hr: x.avgHr ?? null, cadence_spm: x.cadence ?? null, elevation_delta_m: x.elevationDeltaM ?? null })));

  const ctx = await loadContext(sb, userId);
  const saved = ctx.sessions.find((x) => x.id === sessionId) ?? { ...s, id: sessionId };
  const prs = await persistDerived(sb, ctx, saved);
  // Solo adapta si la sesión es reciente (una importación histórica no debe reescribir la semana).
  const recent = (Date.now() - Date.parse(s.startedAt)) < 3 * 864e5;
  const changes = recent ? await adaptUpcoming(sb, ctx, 'session', sessionId) : [];
  return { sessionId, merged, duplicateOf: dup?.existingId, prs, changes };
}

async function writeBlocks(sb: SupabaseClient, userId: string, sessionId: string, s: Session) {
  for (const [i, b] of (s.blocks ?? []).entries()) {
    const { data: blk, error } = await sb.from('session_blocks').insert({
      user_id: userId, session_id: sessionId, position: i, kind: b.kind, format: b.format ?? null, time_cap_s: b.timeCapS ?? null, rounds: b.rounds ?? null,
      result_text: b.resultText ?? null, result_time_s: b.resultTimeS ?? null, result_rounds: b.resultRounds ?? null, result_reps: b.resultReps ?? null,
      title: b.title ?? null, part: b.part ?? null, scaling: b.scaling ?? null, duration_min: b.durationMin ?? null, interval_s: b.intervalS ?? null,
      capped: !!b.capped, prescribed: b.prescribed ?? null, notes: b.notes ?? null,
    }).select('id').single();
    if (error) throw error;
    if (!b.sets.length) continue;
    const rows: Record<string, unknown>[] = [];
    for (const [j, x] of b.sets.entries()) {
      let exerciseId: string | null = x.exerciseId; let customId: string | null = null;
      if (x.exerciseId.startsWith('custom:')) {
        exerciseId = null;
        const name = x.exerciseId.slice(7);
        const { data: ue } = await sb.from('user_exercises').upsert({ user_id: userId, name }, { onConflict: 'user_id,name' }).select('id').single();
        customId = ue?.id ?? null;
      }
      rows.push({ user_id: userId, session_id: sessionId, block_id: blk.id, position: j, exercise_id: exerciseId, custom_exercise_id: customId, reps: x.reps ?? null, load_kg: x.loadKg ?? null, distance_m: x.distanceM ?? null, duration_s: x.durationS ?? null, calories: x.calories ?? null, rpe: x.rpe ?? null, rir: x.rir ?? null, is_warmup: !!x.isWarmup, performed_on: isoDate(s.startedAt),
        round_no: x.roundNo ?? null, set_label: x.label ?? null, unit: x.unit ?? null, target_reps: x.targetReps ?? null, target_load_kg: x.targetLoadKg ?? null,
        target_pct: x.targetPct ?? null, target_text: x.targetText ?? null, status: x.status ?? 'done', split_s: x.splitS ?? null, origin: x.origin ?? 'manual' });
    }
    const { error: e2 } = await sb.from('session_sets').insert(rows);
    if (e2) throw e2;
  }
}
