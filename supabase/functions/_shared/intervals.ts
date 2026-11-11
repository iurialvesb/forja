// Intervals.icu: descarga de entrenos (vía HealthFit desde el Apple Watch) y salud diaria, y su paso a Forja.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { icuToActivity, icuWellnessToDaily, type IcuStream } from './engine/index.ts';
import { ingestSession } from './ingest.ts';
import { todayMadrid } from './context.ts';

const BASE = 'https://intervals.icu/api/v1';
export interface IcuConn { user_id: string; athlete_id: string; api_key: string; history_from?: string | null; last_pull_at?: string | null; wellness_backfill_at?: string | null }

export async function icu(conn: Pick<IcuConn, 'api_key'>, path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Basic ${btoa(`API_KEY:${conn.api_key}`)}`, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (r.status === 401 || r.status === 403) throw new Error('Intervals.icu rechaza la clave: revisa el ID de atleta y la API key');
  if (r.status === 429) throw new Error('Intervals.icu pide esperar un poco (límite de peticiones)');
  if (!r.ok) throw new Error(`Intervals.icu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Lista lo nuevo de Intervals.icu y lo deja en el buzón. Devuelve las actividades nuevas (para avisar). */
export async function pullToInbox(sb: SupabaseClient, conn: IcuConn, opts: { oldest?: string } = {}): Promise<{ newActivities: any[]; wellness: number }> {
  const today = todayMadrid(new Date());
  const lastDay = conn.last_pull_at ? todayMadrid(new Date(conn.last_pull_at)) : null;
  const oldest = opts.oldest ?? (lastDay ? addDays(lastDay, -3) : addDays(today, -30));
  const newest = addDays(today, 1);
  const acts: any[] = await icu(conn, `/athlete/${encodeURIComponent(conn.athlete_id)}/activities?oldest=${oldest}&newest=${newest}`);
  // Las actividades que Intervals.icu recibe de Strava llegan vacías (política de Strava): se ignoran.
  const usable = (acts ?? []).filter((a) => a?.id && String(a.source ?? '').toUpperCase() !== 'STRAVA' && !a._note);
  let newActivities: any[] = [];
  for (let i = 0; i < usable.length; i += 100) {
    const rows = usable.slice(i, i + 100).map((a) => ({ user_id: conn.user_id, kind: 'activity', external_id: String(a.id), payload: a }));
    const { data, error } = await sb.from('intervals_inbox').upsert(rows, { onConflict: 'user_id,kind,external_id', ignoreDuplicates: true }).select('payload');
    if (error) throw error;
    newActivities = newActivities.concat((data ?? []).map((r: any) => r.payload));
  }
  // Salud diaria de los últimos días (se reprocesa: el sueño y la VFC pueden completarse más tarde).
  // La primera vez (o tras activar la salud en HealthFit) se traen 120 días de sueño, VFC, pulso, pasos…
  const backfill = !conn.wellness_backfill_at;
  const wOldest = opts.oldest ?? (backfill ? addDays(today, -120) : addDays(today, -4));
  const well: any[] = await icu(conn, `/athlete/${encodeURIComponent(conn.athlete_id)}/wellness?oldest=${wOldest}&newest=${today}`).catch(() => []);
  const DATA = ['hrv', 'hrvSDNN', 'restingHR', 'sleepSecs', 'weight', 'steps', 'sleepScore', 'spO2', 'respiration', 'bodyFat', 'vo2max', 'avgSleepingHR', 'kcalConsumed'];
  const wrows = (well ?? []).filter((w) => w?.id && DATA.some((k) => w[k] != null))
    .map((w) => ({ user_id: conn.user_id, kind: 'wellness', external_id: String(w.id), payload: w, received_at: new Date().toISOString(), processed_at: null }));
  if (wrows.length) await sb.from('intervals_inbox').upsert(wrows, { onConflict: 'user_id,kind,external_id' });
  const anySleep = wrows.some((r) => r.payload.sleepSecs != null || r.payload.hrv != null || r.payload.hrvSDNN != null);
  await sb.from('intervals_connections').update({ last_pull_at: new Date().toISOString(), last_error: null, ...(backfill && anySleep ? { wellness_backfill_at: new Date().toISOString() } : {}) }).eq('user_id', conn.user_id);
  return { newActivities, wellness: wrows.length };
}

const STREAM_TYPES = 'time,heartrate,distance,velocity_smooth,cadence,altitude,fixed_altitude,latlng,watts';

/** Procesa el buzón con los permisos del usuario: crea sesiones (con splits, vueltas, zonas y series) y la salud diaria. */
export async function processIcuInbox(sb: SupabaseClient, userId: string, limit = 12): Promise<{ activities: number; days: number; remaining: number; prs: string[]; changes: unknown[]; sessions: string[] }> {
  const out = { activities: 0, days: 0, remaining: 0, prs: [] as string[], changes: [] as unknown[], sessions: [] as string[] };
  const { data: conn } = await sb.from('intervals_connections').select('*').eq('user_id', userId).maybeSingle();
  if (!conn) return out;
  // Salud diaria
  const { data: wl } = await sb.from('intervals_inbox').select('*').eq('user_id', userId).eq('kind', 'wellness').is('processed_at', null).limit(200);
  // En bloque: una escritura para todos los días (rápido aunque sean 120 días de historial).
  const rows: Record<string, unknown>[] = [], weights: Record<string, unknown>[] = [];
  const more: [string, string][] = [['sleepScore', 'sleep_score'], ['sleepQuality', 'sleep_quality'], ['spo2', 'spo2'], ['respiration', 'respiration'], ['bodyFat', 'body_fat'], ['vo2max', 'vo2max'], ['kcalConsumed', 'kcal_consumed']];
  for (const it of wl ?? []) {
    const d: any = icuWellnessToDaily(it.payload);
    const row: Record<string, unknown> = { user_id: userId, date: d.date, source: 'healthkit', updated_at: new Date().toISOString(),
      hrv_ms: d.hrvMs ?? null, hrv_method: d.hrvMethod ?? null, rhr: d.rhr ?? null, sleep_h: d.sleepH ?? null, steps: d.steps ?? null, avg_sleeping_hr: d.avgSleepingHr ?? null,
      extras: Object.keys(d.extras).length ? d.extras : null };
    for (const [k, col] of more) row[col] = d[k] ?? null;
    rows.push(row);
    if (d.weightKg) weights.push({ user_id: userId, date: d.date, weight_kg: d.weightKg, source: 'healthkit' });
  }
  if (rows.length) {
    // Un mismo día puede venir dos veces (se reprocesa): se queda la última versión.
    const byDate = new Map(rows.map((r) => [r.date as string, r]));
    await sb.from('daily_health').upsert([...byDate.values()], { onConflict: 'user_id,date' });
    if (weights.length) await sb.from('body_metrics').upsert([...new Map(weights.map((w) => [w.date as string, w])).values()], { onConflict: 'user_id,date,source' });
    await sb.from('intervals_inbox').update({ processed_at: new Date().toISOString(), result: { ok: true } }).in('id', (wl ?? []).map((x: any) => x.id));
    out.days = byDate.size;
  }
  // Entrenos (los más antiguos primero)
  const { data: prof } = await sb.from('physiology').select('hr_rest,hr_max,lthr').eq('user_id', userId).order('effective_from', { ascending: false }).limit(1).maybeSingle();
  const profile = { hrRest: prof?.hr_rest ?? undefined, hrMax: prof?.hr_max ?? undefined, lthr: prof?.lthr ?? undefined };
  const { data: items } = await sb.from('intervals_inbox').select('*').eq('user_id', userId).eq('kind', 'activity').is('processed_at', null).order('received_at').order('id').limit(limit);
  for (const it of items ?? []) {
    try {
      const id = it.external_id;
      const [detail, streams] = await Promise.all([
        icu(conn, `/activity/${encodeURIComponent(id)}?intervals=true`).catch(() => it.payload),
        icu(conn, `/activity/${encodeURIComponent(id)}/streams.json?types=${STREAM_TYPES}`).catch(() => [] as IcuStream[]),
      ]);
      const a = icuToActivity({ ...it.payload, ...detail }, Array.isArray(streams) ? streams : [], profile);
      if (!a.session.durationS) throw new Error('actividad sin duración');
      const recent = Date.now() - Date.parse(a.session.startedAt) < 3 * 864e5;
      const res = await ingestSession(sb, userId, { ...a.session, id: crypto.randomUUID() });
      const sid = res.sessionId;
      const x = a.extras;
      await sb.from('sessions').update({ moving_s: x.movingS ?? null, avg_speed_mps: x.avgSpeed ?? null, max_speed_mps: x.maxSpeed ?? null, avg_power: x.avgPower ?? null, device: x.device ?? null,
        ...(a.session.hrZoneSeconds ? { hr_zone_s: a.session.hrZoneSeconds } : {}), ...(a.session.activeKcal ? { active_kcal: a.session.activeKcal } : {}), ...(a.session.strideM ? { avg_stride_m: a.session.strideM } : {}) }).eq('id', sid);
      if (a.laps.length) {
        await sb.from('session_laps').delete().eq('session_id', sid);
        await sb.from('session_laps').insert(a.laps.map((l) => ({ session_id: sid, user_id: userId, idx: l.idx, kind: l.kind ?? null, start_s: l.startS, duration_s: l.durationS, moving_s: l.movingS ?? null, distance_m: l.distanceM ?? null, avg_hr: l.avgHr ?? null, max_hr: l.maxHr ?? null, avg_speed_mps: l.avgSpeed ?? null, avg_cadence: l.avgCadence ?? null, avg_power: l.avgPower ?? null, elev_gain_m: l.elevGain ?? null, elev_loss_m: l.elevLoss ?? null })));
      }
      if (a.series || a.route || a.zones) await sb.from('session_streams').upsert({ session_id: sid, user_id: userId, series: a.series, route: a.route, zones: a.zones, updated_at: new Date().toISOString() });
      await sb.from('intervals_inbox').update({ processed_at: new Date().toISOString(), result: { sessionId: sid, merged: res.merged } }).eq('id', it.id);
      out.activities++; out.sessions.push(sid);
      if (recent) { out.prs.push(...res.prs); out.changes.push(...res.changes); }
    } catch (e) {
      await sb.from('intervals_inbox').update({ processed_at: new Date().toISOString(), result: { error: String(e) } }).eq('id', it.id);
    }
  }
  const { count } = await sb.from('intervals_inbox').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'activity').is('processed_at', null);
  out.remaining = count ?? 0;
  return out;
}
