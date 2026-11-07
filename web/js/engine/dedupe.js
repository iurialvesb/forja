// Generado por scripts/build-web-engine.mjs desde engine/src/dedupe.ts. No editar.
// Detección de duplicados entre fuentes (Apple Health, Strava, manual, foto).
// Una misma actividad grabada en el Apple Watch suele llegar a HealthKit y a Strava.

                                          

const family = (d        ) => (['running'].includes(d) ? 'run' : ['cycling'].includes(d) ? 'bike' : ['walking', 'hiking'].includes(d) ? 'walk' : ['crossfit', 'hybrid', 'hyrox', 'strength', 'weightlifting', 'gymnastics', 'calisthenics'].includes(d) ? 'gym' : d);

const sourceOf = (x         ) => (x.source === 'healthkit' ? 'watch' : x.source === 'manual' || x.source === 'photo' ? 'log' : 'other');
const madridDay = (ms        ) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(ms));

                                                                                        

export function findDuplicate(candidate         , existing           )                        {
  const cs = Date.parse(candidate.startedAt), ce = cs + candidate.durationS * 1000;
  let best                        = null;
  for (const e of existing) {
    if (e.id === candidate.id) continue;
    if (candidate.externalId && e.externalId === candidate.externalId && e.source === candidate.source) return { existingId: e.id, score: 1, reasons: ['mismo identificador externo'] };
    if (family(e.discipline) !== family(candidate.discipline)) continue;
    const es = Date.parse(e.startedAt), ee = es + e.durationS * 1000;
    // CrossFit/fuerza registrado a mano (hora aproximada) frente al entreno del Apple Watch del mismo día: es el mismo.
    const manualVsWatch = family(e.discipline) === 'gym' && new Set([sourceOf(e), sourceOf(candidate)]).size === 2 && [sourceOf(e), sourceOf(candidate)].includes('watch')
      && madridDay(es) === madridDay(cs) && Math.abs(cs - es) <= 3 * 3.6e6
      && (sourceOf(candidate) === 'watch' ? e.avgHr == null : !e.blocks?.length);     // ese registro aún no tiene su pareja
    if (manualVsWatch) {
      const sc = 0.75 + 0.2 * Math.max(0, 1 - Math.abs(cs - es) / (3 * 3.6e6));
      if (!best || sc > best.score) best = { existingId: e.id, score: sc, reasons: ['registro manual y Apple Watch del mismo día'] };
      continue;
    }
    const overlap = Math.max(0, Math.min(ce, ee) - Math.max(cs, es));
    const shorter = Math.min(ce - cs, ee - es);
    if (shorter <= 0) continue;
    const ov = overlap / shorter;
    const startDiff = Math.abs(cs - es) / 1000;
    if (ov < 0.8 && startDiff > 180) continue;
    const reasons = [`solapamiento ${(ov * 100).toFixed(0)} %`, `inicio a ${Math.round(startDiff)} s`];
    let score = 0.5 * ov + 0.3 * Math.max(0, 1 - startDiff / 600);
    const dr = Math.min(candidate.durationS, e.durationS) / Math.max(candidate.durationS, e.durationS);
    score += 0.1 * dr;
    if (candidate.distanceM && e.distanceM) {
      const r = Math.min(candidate.distanceM, e.distanceM) / Math.max(candidate.distanceM, e.distanceM);
      if (r < 0.9) continue;
      score += 0.1 * r; reasons.push(`distancia ${(r * 100).toFixed(0)} % coincidente`);
    } else score += 0.05;
    if (score >= 0.7 && (!best || score > best.score)) best = { existingId: e.id, score, reasons };
  }
  return best;
}

/** El Apple Watch manda en tiempos y fisiología; el registro manual o la foto aportan nombre, RPE y estructura. */
export function mergeWatchIntoLog(log         , watch         )          {
  return {
    ...watch, id: log.id, source: log.source,
    title: log.title ?? watch.title, rpe: log.rpe ?? watch.rpe, discipline: log.discipline,
    blocks: log.blocks?.length ? log.blocks : watch.blocks,
  };
}

/** Política de fusión: HealthKit aporta FC/zonas; Strava aporta nombre y desnivel; la entrada manual o foto aporta estructura. */
export function mergeSessions(primary         , other         )          {
  return {
    ...primary,
    title: primary.title ?? other.title,
    avgHr: primary.avgHr ?? other.avgHr,
    maxHr: primary.maxHr ?? other.maxHr,
    hrZoneSeconds: primary.hrZoneSeconds ?? other.hrZoneSeconds,
    distanceM: primary.distanceM ?? other.distanceM,
    elevationGainM: primary.elevationGainM ?? other.elevationGainM,
    elevationLossM: primary.elevationLossM ?? other.elevationLossM,
    cadenceSpm: primary.cadenceSpm ?? other.cadenceSpm,
    blocks: primary.blocks?.length ? primary.blocks : other.blocks,
    rpe: primary.rpe ?? other.rpe,
  };
}
