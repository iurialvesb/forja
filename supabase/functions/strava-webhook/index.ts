// Webhook de Strava (una suscripción por app). Desplegar con --no-verify-jwt: lo llama Strava, no la app.
// - Verificación GET (hub.challenge)
// - Actividad creada/actualizada → se guarda en caché (≤ 7 días) y se enlaza con la sesión de Apple Health
//   equivalente para no duplicar. NO se crea una sesión ni se envía nada al coach IA.
// - Desautorización del atleta → se borran tokens, caché y enlaces (obligatorio según las condiciones de Strava).
import { adminClient, env, json } from '../_shared/supabase.ts';
import { accessToken, stravaGet } from '../_shared/strava.ts';
import { findDuplicate, type Session } from '../_shared/engine/index.ts';

const SPORT: Record<string, Session['discipline']> = { Run: 'running', TrailRun: 'running', VirtualRun: 'running', Ride: 'cycling', VirtualRide: 'cycling', Swim: 'swimming', Walk: 'walking', Hike: 'hiking', WeightTraining: 'strength', Crossfit: 'crossfit', Workout: 'other', Yoga: 'yoga', AlpineSki: 'skiing', Tennis: 'tennis', Padel: 'padel' };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.verify_token') !== env('STRAVA_WEBHOOK_VERIFY_TOKEN')) return new Response('forbidden', { status: 403 });
    return json({ 'hub.challenge': url.searchParams.get('hub.challenge') });
  }
  const ev = await req.json();
  const admin = adminClient();
  const { data: conn } = await admin.from('strava_connections').select('user_id').eq('athlete_id', ev.owner_id).maybeSingle();
  if (!conn) return json({ ignored: true });
  const userId = conn.user_id;

  try {
    if (ev.object_type === 'athlete' && ev.updates?.authorized === 'false') {
      await admin.from('strava_tokens').delete().eq('user_id', userId);
      await admin.from('strava_cache').delete().eq('user_id', userId);
      await admin.from('session_sources').delete().eq('user_id', userId).eq('source', 'strava');
      await admin.from('strava_connections').delete().eq('user_id', userId);
      return json({ ok: true });
    }
    if (ev.object_type !== 'activity') return json({ ignored: true });
    if (ev.aspect_type === 'delete') {
      await admin.from('strava_cache').delete().eq('user_id', userId).eq('activity_id', ev.object_id);
      await admin.from('session_sources').delete().eq('user_id', userId).eq('source', 'strava').eq('external_id', String(ev.object_id));
      return json({ ok: true });
    }
    const token = await accessToken(admin, userId);
    const a = await stravaGet(token, `/activities/${ev.object_id}`);
    await admin.from('strava_cache').upsert({ user_id: userId, activity_id: a.id, payload: {
      name: a.name, sport_type: a.sport_type, start_date: a.start_date, elapsed_time: a.elapsed_time, moving_time: a.moving_time, distance: a.distance,
      total_elevation_gain: a.total_elevation_gain, average_speed: a.average_speed, average_heartrate: a.average_heartrate, max_heartrate: a.max_heartrate,
      average_cadence: a.average_cadence, pr_count: a.pr_count, best_efforts: a.best_efforts?.map((b: any) => ({ name: b.name, elapsed_time: b.elapsed_time, pr_rank: b.pr_rank })),
      segment_efforts: a.segment_efforts?.slice(0, 30).map((s: any) => ({ name: s.name, elapsed_time: s.elapsed_time, pr_rank: s.pr_rank })),
    }, fetched_at: new Date().toISOString() });
    // Enlace para deduplicar con la sesión de HealthKit (solo id y coincidencia temporal).
    const cand: Session = { id: 'strava', startedAt: a.start_date, durationS: a.elapsed_time, discipline: SPORT[a.sport_type] ?? 'other', distanceM: a.distance, source: 'strava' };
    const t = Date.parse(a.start_date);
    const { data: near } = await admin.from('sessions').select('id, started_at, duration_s, discipline, distance_m').eq('user_id', userId).is('deleted_at', null)
      .gte('started_at', new Date(t - 3 * 3.6e6).toISOString()).lte('started_at', new Date(t + 3 * 3.6e6).toISOString());
    const dup = findDuplicate(cand, (near ?? []).map((n: any) => ({ id: n.id, startedAt: n.started_at, durationS: n.duration_s, discipline: n.discipline, distanceM: n.distance_m != null ? Number(n.distance_m) : undefined })));
    if (dup) await admin.from('session_sources').upsert({ user_id: userId, session_id: dup.existingId, source: 'strava', external_id: String(a.id) }, { onConflict: 'user_id,source,external_id' });
    return json({ ok: true, linked: dup?.existingId ?? null });
  } catch (e) {
    console.error(e);
    return json({ ok: false }, 200); // Strava reintenta si no recibe 200 en 2 s; registramos y seguimos.
  }
});
