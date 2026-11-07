// Generado por scripts/build-web-engine.mjs desde engine/src/planner.ts. No editar.
// Generador de la semana: decide qué sesiones tocan según fase y objetivos, y las coloca en tus
// huecos disponibles respetando reglas de compatibilidad (piernas, intensidad, dobles).

                                                                                                                
import { addDays, isoDate, weekday, weeklyRunKm, mondayOf } from './fitness.js';
import { phaseAt, weekVolumeFactor } from './periodization.js';
                                                           
                                                 
                                                     
                                                                
import {
  runPrescription, timeTrialPrescription, strengthPrescription, hyroxPrescription, mobilityPrescription,
  crossfitBoxPrescription, racePrescription,                          
} from './prescriptions.js';

                               
                                             
                          
                
                  
                     
                              
                        
                                     
                             
                                 
                                                                                  
                                           
 

                           
                    
               
              
                   
                  
                             
                  
 

                                                        

export const META                                                                                                                            = {
  run_easy: { discipline: 'running', key: false, legStress: 1, intensity: 'baja' },
  run_recovery: { discipline: 'running', key: false, legStress: 0, intensity: 'baja' },
  run_long: { discipline: 'running', key: true, legStress: 2, intensity: 'moderada' },
  run_intervals: { discipline: 'running', key: true, legStress: 2, intensity: 'alta' },
  run_vo2: { discipline: 'running', key: true, legStress: 2, intensity: 'alta' },
  run_threshold: { discipline: 'running', key: true, legStress: 2, intensity: 'alta' },
  run_tempo: { discipline: 'running', key: true, legStress: 2, intensity: 'alta' },
  run_race_pace: { discipline: 'running', key: true, legStress: 2, intensity: 'alta' },
  run_hills: { discipline: 'running', key: true, legStress: 2, intensity: 'alta' },
  crossfit_box: { discipline: 'crossfit', key: false, legStress: 2, intensity: 'alta' },
  strength_lower: { discipline: 'strength', key: false, legStress: 3, intensity: 'moderada' },
  strength_upper: { discipline: 'strength', key: false, legStress: 0, intensity: 'moderada' },
  strength_full: { discipline: 'strength', key: false, legStress: 2, intensity: 'moderada' },
  hyrox_stations: { discipline: 'hyrox', key: false, legStress: 2, intensity: 'moderada' },
  hyrox_compromised: { discipline: 'hyrox', key: true, legStress: 3, intensity: 'alta' },
  hyrox_simulation: { discipline: 'hyrox', key: true, legStress: 3, intensity: 'alta' },
  mobility: { discipline: 'mobility', key: false, legStress: 0, intensity: 'baja' },
  rest: { discipline: 'other', key: false, legStress: 0, intensity: 'baja' },
  race: { discipline: 'running', key: true, legStress: 3, intensity: 'alta' },
};

const RUN_KEYS                = ['run_intervals', 'run_vo2', 'run_threshold', 'run_tempo', 'run_race_pace', 'run_hills', 'run_long', 'hyrox_compromised', 'hyrox_simulation'];
export const isKeyRun = (t             ) => RUN_KEYS.includes(t);

function demandsFor(phase       , goal                  , cf        , weekIndex        )           {
  const d           = [];
  const add = (type             , priority        , n = 1) => { for (let i = 0; i < n; i++) d.push({ type, priority: priority - i * 0.1 }); };
  const runFocus = !goal || ['half_marathon', 'marathon', '10k', '5k'].includes(goal.type);
  if (phase.kind === 'competition' || phase.kind === 'recovery') {
    add('run_recovery', 5, 2); add('mobility', 4, 2); add('crossfit_box', 3, phase.kind === 'recovery' ? 1 : 0);
    return d;
  }
  if (runFocus) {
    switch (phase.kind) {
      case 'general': case 'base':
        add('run_long', 9); add('run_hills', 7); add('run_easy', 6, 2); add('crossfit_box', 8, Math.min(cf, 3)); add('mobility', 3); break;
      case 'development':
        add('run_long', 10); add('run_intervals', 9.5); add('run_threshold', 9); add('run_easy', 6); add('crossfit_box', 8, Math.min(cf, 3)); add('mobility', 3); break;
      case 'specific':
        add('run_long', 10); add('run_race_pace', 9.5); add(weekIndex % 2 ? 'run_intervals' : 'run_threshold', 9); add('run_easy', 6, 2); add('crossfit_box', 8, Math.min(cf, 2)); add('mobility', 3); break;
      case 'taper':
        add('run_race_pace', 9); add('run_easy', 8, 2); add('run_long', 7); add('crossfit_box', 6, 1); add('mobility', 5); break;
    }
  } else {
    switch (phase.kind) {
      case 'general':
        add('run_long', 8); add('run_intervals', 8.5); add('strength_full', 8); add('crossfit_box', 9, Math.min(cf, 3)); add('run_easy', 6); add('mobility', 3); break;
      case 'development':
        add('hyrox_compromised', 10); add('run_intervals', 9); add('run_long', 8.5); add('hyrox_stations', 8); add('crossfit_box', 8.8, Math.min(cf, 3)); add('run_easy', 5); add('mobility', 3); break;
      case 'specific':
        add(weekIndex % 2 === 0 ? 'hyrox_simulation' : 'hyrox_compromised', 10); add('run_threshold', 9); add('run_long', 8); add('hyrox_stations', 7.5); add('crossfit_box', 8.5, Math.min(cf, 2)); add('run_easy', 5); add('mobility', 3); break;
      case 'taper':
        add('hyrox_compromised', 9); add('run_easy', 8, 2); add('crossfit_box', 6, 1); add('mobility', 5); break;
    }
  }
  return d;
}

                                                                                         

function slotsFor(profile                , weekStart        , overrides                               = {})         {
  const out         = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const a = profile.availability.find((x) => x.weekday === weekday(date));
    const o = overrides[date] ?? {};
    const max = o.maxMinutes ?? a?.maxMinutes ?? 0;
    if (!a || max <= 0) continue;
    if (a.am && o.am !== false) out.push({ date, slot: 'am', maxMinutes: max, boxClass: false });
    if (a.pm && o.pm !== false) out.push({ date, slot: 'pm', maxMinutes: max, boxClass: !!a.boxClass });
  }
  return out;
}

const DOUBLE_OK = (a             , b             ) => {
  const light = (t             ) => t === 'run_easy' || t === 'run_recovery' || t === 'mobility' || t === 'strength_upper';
  return (light(a) || light(b)) && !(isKeyRun(a) && isKeyRun(b)) && !(META[a].legStress >= 2 && META[b].legStress >= 2);
};

export function planWeek(input              )           {
  const { weekStart, profile, goals, phases } = input;
  const phase = phaseAt(phases, addDays(weekStart, 3)) ?? phaseAt(phases, weekStart) ?? phaseAt(phases, addDays(weekStart, 6)) ?? phases.find((p) => p.end >= weekStart) ?? phases[phases.length - 1];
  const goal = goals.find((g) => g.id === phase.goalId);
  const { factor, deload, weekIndex } = weekVolumeFactor(phase, weekStart);
  const notes           = [];

  // Volumen objetivo de carrera a partir de TU histórico (media de las últimas 4 semanas).
  const km = weeklyRunKm(input.history);
  const last4 = [1, 2, 3, 4].map((i) => km.get(addDays(weekStart, -7 * i)) ?? 0);
  const chronic = last4.reduce((a, b) => a + b, 0) / 4;
  const prev = input.previousWeekPlannedKm ?? last4[0];
  const hyroxMode = goal?.type === 'hyrox';
  const floor = hyroxMode ? 18 : 20;
  let targetKm = Math.max(floor, chronic) * factor;
  if (!deload && prev > 0) targetKm = Math.min(targetKm, prev * 1.1 + 3);    // progresión ≤ ~10 %
  targetKm = Math.round(targetKm);
  if (chronic === 0) notes.push('No tengo historial de carrera de las últimas 4 semanas: empiezo con un volumen prudente y lo ajusto con lo que registres.');

  // Competición dentro de esta semana.
  const raceDay = goals.find((g) => g.date >= weekStart && g.date <= addDays(weekStart, 6));

  let demands = demandsFor(phase, goal, profile.crossfitPerWeek, weekIndex);
  const needsTest = !input.paces && phase.kind !== 'taper' && phase.kind !== 'competition' && !raceDay;
  if (needsTest) {
    const idx = demands.findIndex((d) => d.type === 'run_intervals' || d.type === 'run_hills' || d.type === 'run_threshold');
    if (idx >= 0) demands[idx] = { type: 'run_intervals', priority: 9.9 }; // se convertirá en test
    notes.push('Aún no tengo una marca de carrera reciente: esta semana incluyo un test de 5 km para calcular tus ritmos reales.');
  }
  if (raceDay) {
    demands = demands.filter((d) => d.type !== 'run_long' && d.type !== 'hyrox_simulation').slice(0, 4);
  }
  const slots = slotsFor(profile, weekStart, input.overrides);
  // Clases reservadas de verdad (calendario/WodBuster): son fijas y sustituyen a las de CrossFit tentativas.
  const fixedThisWeek = (input.fixed ?? []).filter((f) => f.date >= weekStart && f.date <= addDays(weekStart, 6));
  if (fixedThisWeek.length) {
    demands = demands.filter((d) => d.type !== 'crossfit_box');
    for (const f of fixedThisWeek) {
      if (!slots.some((s) => s.date === f.date && s.slot === f.slot)) slots.push({ date: f.date, slot: f.slot, maxMinutes: Math.max(60, f.minutes), boxClass: true });
    }
    for (const s of slots) s.boxClass = fixedThisWeek.some((f) => f.date === s.date && f.slot === s.slot);
  } else if (profile.crossfitPerWeek > 0 && input.fixed) {
    notes.push('Aún no tienes clases reservadas esta semana: coloco el CrossFit en tus días habituales. Cuando reserves en WodBuster, el plan se reorganiza solo.');
  }
  const hasBoxDays = slots.some((s) => s.boxClass);
  // Las clases del box son un recurso fijo: se colocan primero y el resto se organiza alrededor.
  demands.sort((a, b) => (hasBoxDays ? Number(b.type === 'crossfit_box') - Number(a.type === 'crossfit_box') : 0) || b.priority - a.priority);
  const placed                           = [];
  if (raceDay) {
    const s = slots.find((x) => x.date === raceDay.date) ?? { date: raceDay.date, slot: 'am'         , maxMinutes: 240, boxClass: false };
    placed.push({ d: { type: raceDay.type === 'hyrox' ? 'hyrox_simulation' : 'race', priority: 100 }, s });
  }

  const fixedBySlot = new Map(fixedThisWeek.map((f) => [`${f.date}-${f.slot}`, f]));
  for (const f of fixedThisWeek) {
    const s = slots.find((x) => x.date === f.date && x.slot === f.slot) ;
    if (raceDay && f.date >= addDays(raceDay.date, -1) && f.date <= raceDay.date) { notes.push(`Tienes reservada "${f.title}" el ${f.date}, junto a la competición: te recomiendo anularla.`); continue; }
    placed.push({ d: { type: 'crossfit_box', priority: 99 }, s });
  }
  const usedDates = () => new Set(placed.map((p) => p.s.date));
  const onDate = (date        ) => placed.filter((p) => p.s.date === date);

  for (const dmd of demands) {
    const m = META[dmd.type];
    let best                                    = null;
    for (const s of slots) {
      if (placed.some((p) => p.s.date === s.date && p.s.slot === s.slot)) continue;
      const same = onDate(s.date);
      if (same.length >= 2) continue;
      if (same.length === 1 && (!profile.allowDoubles || !DOUBLE_OK(same[0].d.type, dmd.type))) continue;
      if (raceDay && s.date >= addDays(raceDay.date, -1) && s.date <= raceDay.date && dmd.type !== 'run_recovery') continue;
      if (raceDay && s.date > raceDay.date && m.intensity === 'alta') continue;
      if (dmd.type === 'crossfit_box' && hasBoxDays && !s.boxClass) continue;
      const est = dmd.type === 'run_long' ? 100 : 60;
      if (s.maxMinutes < est * 0.8) continue;

      let score = 0;
      const prevDay = onDate(addDays(s.date, -1)).map((p) => p.d.type);
      const nextDay = onDate(addDays(s.date, 1)).map((p) => p.d.type);
      if (isKeyRun(dmd.type)) {
        if (prevDay.some((t) => META[t].legStress >= 2)) score -= 3;
        if (prevDay.some(isKeyRun) || nextDay.some(isKeyRun)) score -= 4;
        if (same.some((p) => META[p.d.type].legStress >= 2)) score -= 10;
        if (nextDay.some((t) => META[t].legStress >= 3)) score -= 1;
      }
      if (m.legStress >= 2 && nextDay.some(isKeyRun)) score -= 3;
      if (dmd.type === 'run_long') score += (weekday(s.date) >= 6 ? 6 : 0) + s.maxMinutes / 60;
      if (m.key) score += s.maxMinutes / 90;
      if (dmd.type === 'mobility' && same.length) score += 1;
      if (dmd.type === 'run_easy' && same.length && profile.allowDoubles) score -= 0.5;
      if (same.length === 0) score += 1;
      if (s.slot === 'pm' && dmd.type === 'crossfit_box') score += 1;
      if (s.slot === 'am' && (dmd.type === 'run_easy' || dmd.type === 'run_recovery')) score += 0.5;
      if (!best || score > best.score) best = { s, score };
    }
    if (best && best.score > -8) placed.push({ d: dmd, s: best.s });
  }

  // Garantizar al menos un día sin sesión de alta carga (descanso o solo movilidad).
  const daysUsed = usedDates();
  if (daysUsed.size >= 7) {
    const victim = [...placed].filter((p) => p.d.priority < 100).sort((a, b) => a.d.priority - b.d.priority)
      .find((p) => onDate(p.s.date).length === 1 && p.d.type !== 'mobility');
    if (victim) {
      placed.splice(placed.indexOf(victim), 1);
      notes.push(`He dejado el ${victim.s.date} como descanso: necesitas al menos un día sin carga.`);
    }
  }
  const missing = demands.filter((d) => !placed.some((p) => p.d === d));
  if (missing.length) notes.push(`Con tu disponibilidad no caben: ${missing.map((m) => m.type).join(', ')}. Si tienes más hueco, añádelo en el perfil.`);

  // Prescripción con volumen de carrera repartido.
  placed.sort((a, b) => (a.s.date + a.s.slot).localeCompare(b.s.date + b.s.slot));
  const ctx                      = {
    phase, weekIndex, deload: deload || !!raceDay, paces: input.paces, zones: input.zones, lifts: input.lifts,
    readiness: input.readiness, profile, goalType: goal?.type, raceTargetS: goal?.targetTimeS,
  };
  const longCap = hyroxMode ? 14 : phase.kind === 'taper' ? 12 : phase.kind === 'specific' ? 20 : phase.kind === 'development' ? 18 : 15;
  const runTypes = placed.filter((p) => META[p.d.type].discipline === 'running' && p.d.type !== 'race');
  const longKm = Math.min(longCap, Math.max(8, Math.round(targetKm * 0.32)));
  const keyKm = runTypes.filter((p) => p.d.type !== 'run_long' && p.d.type !== 'run_easy' && p.d.type !== 'run_recovery').length * 9;
  const easyN = runTypes.filter((p) => p.d.type === 'run_easy' || p.d.type === 'run_recovery').length;
  const hasLong = runTypes.some((p) => p.d.type === 'run_long');
  const easyKm = easyN ? Math.max(5, Math.round((targetKm - (hasLong ? longKm : 0) - keyKm) / easyN)) : 0;

  const sessions                   = placed.map(({ d, s }) => {
    const m = META[d.type];
    const next = onDate(addDays(s.date, 1)).find((p) => isKeyRun(p.d.type));
    const base = { id: `${s.date}-${s.slot}-${d.type}`, date: s.date, slot: s.slot, type: d.type, discipline: m.discipline, intensity: m.intensity, legStress: m.legStress, key: m.key, status: 'planned'          };
    const why = (extra        ) => `Fase: ${phase.focus}${goal ? ` (${goal.name})` : ''}. ${extra}${deload ? ' Semana de descarga (−30 % de volumen) para asimilar el trabajo.' : ''}`;
    if (d.type === 'race') {
      const r = racePrescription(ctx, goal?.distanceM ?? 21097.5, goal?.targetTimeS);
      return { ...base, ...r, estMinutes: r.minutes, rationale: 'Día de competición.' };
    }
    if (m.discipline === 'running') {
      const isTest = needsTest && d.type === 'run_intervals' && d.priority >= 9.9;
      const kmFor = d.type === 'run_long' ? longKm : d.type === 'run_easy' || d.type === 'run_recovery' ? easyKm : 9;
      const r = isTest ? timeTrialPrescription(ctx) : runPrescription(d.type, kmFor, ctx);
      const rationale = isTest ? 'Necesito una referencia real para calcular tus ritmos; sin ella usaría valores genéricos.'
        : why({
          run_long: 'La tirada larga es la sesión que más resistencia específica construye.',
          run_intervals: 'Las series a ritmo de VO2max suben tu techo aeróbico.',
          run_vo2: 'Las series a ritmo de VO2max suben tu techo aeróbico.',
          run_threshold: 'El trabajo de umbral es lo que más mejora el rendimiento en media maratón.',
          run_tempo: 'El tempo mejora el ritmo sostenible.',
          run_race_pace: 'Correr a ritmo objetivo enseña al cuerpo y a la cabeza la carrera.',
          run_hills: 'Las cuestas dan fuerza específica con poco impacto.',
          run_easy: 'El rodaje suave suma volumen aeróbico sin fatigar; el 75-80 % de tu carrera debe ser así.',
          run_recovery: 'Rodaje muy suave para recuperar.',
        }[d.type          ] ?? '');
      return { ...base, title: r.title, objective: r.objective, steps: r.steps, estMinutes: r.minutes, plannedKm: Math.round(r.km * 10) / 10, rationale };
    }
    if (d.type === 'crossfit_box') {
      const r = crossfitBoxPrescription(ctx, !!next, next ? META[next.d.type] && runLabel(next.d.type) : undefined);
      const f = fixedBySlot.get(`${s.date}-${s.slot}`);
      if (f) return { ...base, id: `${s.date}-${s.slot}-crossfit_box-${f.uid}`.slice(0, 120), ...r, title: f.title || r.title, estMinutes: f.minutes, startLocal: f.startLocal, fromCalendar: true, rationale: `Clase reservada en tu calendario a las ${f.startLocal}. ` + (hyroxMode ? 'El CrossFit aporta fuerza-resistencia útil para las estaciones.' : 'El resto de la semana se organiza alrededor de tus clases.') };
      if (input.fixed && fixedThisWeek.length === 0) r.title = 'CrossFit recomendado';
      return { ...base, ...r, estMinutes: r.minutes, rationale: why(hyroxMode ? 'El CrossFit aporta fuerza-resistencia útil para las estaciones.' : 'Mantienes CrossFit para no perder fuerza ni capacidad, controlando su impacto en la carrera.') };
    }
    if (d.type === 'strength_lower' || d.type === 'strength_upper' || d.type === 'strength_full') {
      const r = strengthPrescription(d.type, ctx);
      return { ...base, ...r, estMinutes: r.minutes, rationale: why('La fuerza mejora la economía de carrera y protege frente a lesiones.') };
    }
    if (d.type === 'hyrox_stations' || d.type === 'hyrox_compromised' || d.type === 'hyrox_simulation') {
      const r = hyroxPrescription(d.type, ctx);
      return { ...base, title: r.title, objective: r.objective, steps: r.steps, estMinutes: r.minutes, plannedKm: r.km, rationale: why(d.type === 'hyrox_compromised' ? 'En HYROX corres 8 km con las piernas cargadas: hay que entrenar exactamente eso.' : 'Eficiencia y ritmo en las estaciones.') };
    }
    const r = mobilityPrescription();
    return { ...base, ...r, estMinutes: r.minutes, rationale: 'Movilidad para mantener rango articular y acelerar la recuperación.' };
  });

  return { weekStart, phase, goal, targetKm, deload, sessions, notes };
}

export function runLabel(t             )         {
  return ({ run_intervals: 'series', run_vo2: 'series', run_threshold: 'umbral', run_tempo: 'tempo', run_race_pace: 'ritmo de carrera', run_hills: 'cuestas', run_long: 'tirada larga', hyrox_compromised: 'carrera comprometida', hyrox_simulation: 'simulación HYROX' }                          )[t] ?? 'una sesión clave';
}

export { mondayOf, isoDate };
