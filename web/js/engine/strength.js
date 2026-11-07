// Generado por scripts/build-web-engine.mjs desde engine/src/strength.ts. No editar.
// Fuerza: estimación de 1RM (Epley/Brzycki, con RIR), distinción marca real vs. estimada,
// récords por ejercicio y recomendación de cargas de trabajo según objetivo y fatiga.

                                          
import { isoDate, daysBetween } from './fitness.js';
import { getExercise } from './exercises.js';

                                                                                                                         

/** Repeticiones "efectivas" hasta el fallo: reps + RIR (RIR desde RPE si solo hay RPE). */
function effectiveReps(reps        , rir         , rpe         , assumeRir = 0)         {
  const r = rir ?? (rpe != null ? Math.max(0, 10 - rpe) : assumeRir);
  return reps + r;
}

/** e1RM. Devuelve null si la serie no es fiable para estimar (> 12 reps efectivas). */
export function estimate1RM(loadKg        , reps        , opts                                                     = {})                {
  if (reps <= 0 || loadKg <= 0) return null;
  const r = effectiveReps(reps, opts.rir, opts.rpe, opts.assumeRir ?? 0);
  if (r <= 1) return loadKg;
  if (r > 12) return null;
  const epley = loadKg * (1 + r / 30);
  const brzycki = loadKg * 36 / (37 - r);
  return (epley + brzycki) / 2;
}

/** Fracción del 1RM para hacer `reps` dejando `rir` en reserva (inversa coherente con estimate1RM). */
export function pctFor(reps        , rir        )         {
  const r = reps + rir;
  if (r <= 1) return 1;
  const epley = 1 / (1 + r / 30);
  const brzycki = (37 - r) / 36;
  return (epley + brzycki) / 2;
}

export function roundToPlates(kg        , step = 2.5)         {
  return Math.round(kg / step) * step;
}

export function liftsFromSessions(sessions           )              {
  const out              = [];
  for (const s of sessions) for (const b of s.blocks ?? []) for (const set of b.sets) {
    const ex = getExercise(set.exerciseId);
    if (!ex || ex.prTracked !== 'load' || !set.loadKg || !set.reps || set.isWarmup) continue;
    out.push({ date: isoDate(s.startedAt), exerciseId: set.exerciseId, loadKg: set.loadKg, reps: set.reps, rir: set.rir, rpe: set.rpe });
  }
  return out;
}

                              
                     
                                                                                      
                                                                             
                                                                                              
                                                                                       
                                                                                          
 

export function summarizeLift(entries             , exerciseId        , today        )              {
  const e = entries.filter((x) => x.exerciseId === exerciseId).sort((a, b) => a.date.localeCompare(b.date));
  const out              = { exerciseId, repPRs: {}, history: [] };
  const byDay = new Map                ();
  for (const x of e) {
    if (x.reps === 1 && (out.bestActual1RM?.kg ?? 0) < x.loadKg) out.bestActual1RM = { kg: x.loadKg, date: x.date };
    const pr = out.repPRs[x.reps];
    if (!pr || pr.kg < x.loadKg) out.repPRs[x.reps] = { kg: x.loadKg, date: x.date };
    // Sin RIR/RPE registrado asumimos RIR 1 en series de trabajo: estimación conservadora.
    const est = estimate1RM(x.loadKg, x.reps, { rir: x.rir, rpe: x.rpe, assumeRir: x.reps === 1 ? 0 : 1 });
    if (est == null) continue;
    if ((out.bestE1RM?.kg ?? 0) < est) out.bestE1RM = { kg: est, date: x.date, from: `${x.loadKg} kg × ${x.reps}` };
    byDay.set(x.date, Math.max(byDay.get(x.date) ?? 0, est));
  }
  out.history = [...byDay.entries()].map(([date, e1rm]) => ({ date, e1rm }));
  // e1RM de trabajo: mejor de las últimas 6 semanas; si no hay, la mejor histórica con desentrenamiento.
  const recent = out.history.filter((h) => daysBetween(h.date, today) <= 42);
  if (recent.length) {
    const best = Math.max(...recent.map((h) => h.e1rm));
    const actual = out.bestActual1RM && daysBetween(out.bestActual1RM.date, today) <= 42 ? out.bestActual1RM.kg : 0;
    out.workingE1RM = { kg: Math.max(best, actual), basis: 'mejor estimación de las últimas 6 semanas' };
  } else {
    const ref = Math.max(out.bestE1RM?.kg ?? 0, out.bestActual1RM?.kg ?? 0);
    const refDate = (out.bestActual1RM && out.bestActual1RM.kg >= (out.bestE1RM?.kg ?? 0) ? out.bestActual1RM.date : out.bestE1RM?.date) ?? today;
    if (ref > 0) {
      const months = daysBetween(refDate, today) / 30;
      const factor = Math.max(0.85, 1 - 0.02 * Math.max(0, months - 1.5));
      out.workingE1RM = { kg: ref * factor, basis: `marca de hace ${Math.round(months)} meses ajustada por desentrenamiento (×${factor.toFixed(2)})` };
    }
  }
  return out;
}

                                     
                     
                                          
                        
                          
                      
 

/**
 * Carga recomendada. `readiness` modula: verde 1.0, ámbar 0.95, rojo 0.9.
 * Progresión: si la última sesión equivalente se completó con ≥1 rep de margen extra, +2,5 kg.
 */
export function recommendLoad(args   
                                                                
                                         
                                                           
                
 )                     {
  const { summary, sets, reps, rir } = args;
  const w = summary.workingE1RM;
  if (!w) {
    return { exerciseId: summary.exerciseId, sets, reps, rir, loadKg: null, pctOf1RM: null,
      explanation: `Aún no tengo marcas de este ejercicio. Elige un peso con el que te queden ~${rir + 1} repeticiones en reserva y regístralo: con eso calibro las próximas sesiones.` };
  }
  const mod = args.readiness === 'rojo' ? 0.9 : args.readiness === 'ambar' ? 0.95 : 1;
  const pct = pctFor(reps, rir) * mod;
  let kg = roundToPlates(w.kg * pct, args.step ?? 2.5);
  let extra = '';
  if (args.lastSameScheme && args.lastSameScheme.achievedRir >= rir + 1 && mod === 1) {
    const prog = roundToPlates(args.lastSameScheme.loadKg + 2.5, args.step ?? 2.5);
    if (prog > kg) { kg = prog; extra = ` La última vez con este esquema te sobraron repeticiones, así que subo a ${prog} kg.`; }
  }
  const est = summary.bestActual1RM && Math.abs(summary.bestActual1RM.kg - w.kg) < 0.5 ? 'marca real' : 'estimación';
  return {
    exerciseId: summary.exerciseId, sets, reps, rir, loadKg: kg, pctOf1RM: pct,
    explanation: `1RM de trabajo ${w.kg.toFixed(1)} kg (${est}; ${w.basis}). ${sets}×${reps} dejando ${rir} en reserva ≈ ${(pct * 100).toFixed(0)} %` +
      (mod < 1 ? ` (reducido por tu estado de recuperación)` : '') + ` → ${kg} kg.` + extra,
  };
}
