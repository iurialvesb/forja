// Generado por scripts/build-web-engine.mjs desde engine/src/load.ts. No editar.
// Carga de entrenamiento: interna (sRPE de Foster, con estimación por FC si no hay RPE)
// y carga muscular regional (externa) a partir de ejercicios, repeticiones, pesos y distancias.

                                                                                                
import { getExercise } from './exercises.js';

/** RPE por defecto cuando no hay RPE ni FC (se marca como estimación de baja confianza). */
const DEFAULT_RPE                             = {
  running: 5, crossfit: 7, hybrid: 7, hyrox: 7.5, strength: 6.5, weightlifting: 6.5, gymnastics: 6,
  calisthenics: 6, swimming: 5, cycling: 5, hiking: 4, walking: 2, skiing: 5, padel: 5.5, tennis: 5.5,
  yoga: 2, mobility: 1.5, dance: 5, other: 5,
};

                                                                                             

/** RPE estimada desde %FC de reserva media (interpolación lineal por tramos). */
export function rpeFromHr(avgHr        , hrRest        , hrMax        )         {
  const hrr = (avgHr - hrRest) / Math.max(1, hrMax - hrRest);
  const pts                     = [[0.4, 1.5], [0.5, 2], [0.6, 3], [0.7, 4.5], [0.8, 6.5], [0.88, 8], [0.95, 9.5], [1, 10]];
  if (hrr <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (hrr <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
      return y0 + ((hrr - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 10;
}

/** Carga interna en unidades arbitrarias (UA) = RPE × minutos. */
export function internalLoad(s         , p                                          )               {
  const min = s.durationS / 60;
  if (s.rpe != null) return { load: s.rpe * min, rpe: s.rpe, source: 'rpe' };
  if (s.avgHr && p.hrRest && p.hrMax) {
    const rpe = rpeFromHr(s.avgHr, p.hrRest, p.hrMax);
    return { load: rpe * min, rpe, source: 'hr' };
  }
  const rpe = DEFAULT_RPE[s.discipline] ?? 5;
  return { load: rpe * min, rpe, source: 'default' };
}

function add(target            , coef            , k        ) {
  for (const [r, v] of Object.entries(coef)) {
    const key = r                    ;
    target[key] = (target[key] ?? 0) + (v          ) * k;
  }
}

function blockMultiplier(b              )         {
  if (b.rounds != null) return b.rounds;
  if (b.resultRounds != null) return b.resultRounds + (b.resultReps ? 0.5 : 0);
  return 1;
}

/** Carga muscular regional de una sesión. */
export function regionalLoad(s         , bodyWeightKg = 75)             {
  const out             = {};
  if (s.blocks?.length) {
    for (const b of s.blocks) {
      const mult = blockMultiplier(b);
      for (const set of b.sets) {
        if (set.isWarmup) continue;
        const ex = getExercise(set.exerciseId);
        if (!ex) continue;
        let units = 0;
        switch (ex.unit) {
          case 'rep': units = set.reps ?? 0; break;
          case 'm10': units = (set.distanceM ?? 0) / 10; break;
          case 'cal': units = set.calories ?? ((set.distanceM ?? 0) / 15); break; // ~15 m por caloría en remo
          case 'km': units = (set.distanceM ?? 0) / 1000; break;
          case 'second': units = set.durationS ?? 0; break;
        }
        let k = units * mult;
        if (ex.loadSensitive && set.loadKg) k *= Math.min(2.5, 1 + set.loadKg / bodyWeightKg);
        add(out, ex.coef, k);
      }
    }
  }
  // Sesiones de carrera (o con distancia y sin bloques): carga por km, modulada por intensidad y desnivel.
  const isRunLike = s.discipline === 'running' || (!s.blocks?.length && s.distanceM && (s.discipline === 'hiking' || s.discipline === 'walking'));
  if (isRunLike && s.distanceM) {
    const km = s.distanceM / 1000;
    const base = s.discipline === 'running' ? 1 : 0.45;
    const intensity = s.rpe != null ? (s.rpe >= 8 ? 1.4 : s.rpe >= 6.5 ? 1.2 : 1) : 1;
    add(out, { quads: 3, calves: 6, posterior: 2, impact: 6, metabolic: 6 }, km * base * intensity);
    if (s.elevationLossM) add(out, { quads: 0.05, impact: 0.03 }, s.elevationLossM * base);   // excéntrico en bajadas
    if (s.elevationGainM) add(out, { calves: 0.03, posterior: 0.03 }, s.elevationGainM * base);
  }
  return out;
}

/** Índice único de fatiga de piernas (lo que más condiciona la carrera). */
export function legIndex(r            )         {
  return (r.quads ?? 0) + 0.8 * (r.posterior ?? 0) + 0.8 * (r.calves ?? 0) + 0.6 * (r.impact ?? 0);
}

export const LEG_FATIGUE = { moderate: 140, high: 250 }         ;
export const LEG_HALF_LIFE_H = 36;

/** Fatiga residual de piernas en `at` sumando sesiones previas con decaimiento exponencial. */
export function residualLegFatigue(sessions           , at      , bodyWeightKg = 75)         {
  let total = 0;
  for (const s of sessions) {
    const end = new Date(s.startedAt).getTime() + s.durationS * 1000;
    const h = (at.getTime() - end) / 3.6e6;
    if (h < 0 || h > 24 * 7) continue;
    total += legIndex(regionalLoad(s, bodyWeightKg)) * Math.pow(0.5, h / LEG_HALF_LIFE_H);
  }
  return total;
}

export function legFatigueLevel(v        )                               {
  return v >= LEG_FATIGUE.high ? 'alta' : v >= LEG_FATIGUE.moderate ? 'moderada' : 'baja';
}

/** Volumen total de repeticiones/distancia por ejercicio (para análisis de volumen CrossFit). */
export function volumeByExercise(s         )                                                                         {
  const out                                                                         = {};
  for (const b of s.blocks ?? []) {
    const mult = blockMultiplier(b);
    for (const set of b.sets) {
      if (set.isWarmup) continue;
      const o = (out[set.exerciseId] ??= { reps: 0, distanceM: 0, tonnageKg: 0 });
      o.reps += (set.reps ?? 0) * mult;
      o.distanceM += (set.distanceM ?? 0) * mult;
      o.tonnageKg += (set.reps ?? 0) * (set.loadKg ?? 0) * mult;
    }
  }
  return out;
}
