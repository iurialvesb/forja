// Prescripción detallada de cada tipo de sesión: pasos, ritmos, cargas, descansos y técnica.

import type { AthleteProfile, PlannedSession, PrescriptionStep, SessionType, Phase } from './types.ts';
import type { TrainingPaces, HrZones } from './running.ts';
import { fmtPace, pace } from './running.ts';
import type { LiftSummary } from './strength.ts';
import { recommendLoad } from './strength.ts';
import type { ReadinessLevel } from './readiness.ts';

export interface PrescriptionContext {
  phase: Phase;
  weekIndex: number;
  deload: boolean;
  paces: TrainingPaces | null;
  zones: HrZones | null;
  lifts: Record<string, LiftSummary>;
  readiness?: ReadinessLevel;
  profile: AthleteProfile;
  goalType?: string;
  raceTargetS?: number;
}

const WARMUP_MIN = 15, COOLDOWN_MIN = 10;

function easyStep(ctx: PrescriptionContext, label: string, opts: { durationS?: number; distanceM?: number }): PrescriptionStep {
  const s: PrescriptionStep = { kind: 'work', label, ...opts };
  if (ctx.paces) { s.paceRange = [Math.round(ctx.paces.easy[0]), Math.round(ctx.paces.easy[1])]; s.pace = pace((ctx.paces.easy[0] + ctx.paces.easy[1]) / 2, 'Suave'); }
  if (ctx.zones) s.hrRange = [ctx.zones.zones[1][0], ctx.zones.zones[1][1]];
  if (!ctx.paces && !ctx.zones) s.cue = 'RPE 3-4: puedes mantener una conversación.';
  return s;
}

function warmup(ctx: PrescriptionContext, strides = true): PrescriptionStep {
  return { ...easyStep(ctx, 'Calentamiento', { durationS: WARMUP_MIN * 60 }), kind: 'warmup', cue: strides ? 'Trote suave + 5 min de técnica (skipping, talones) + 4 progresiones de 80 m.' : 'Trote suave y movilidad dinámica.' };
}
function cooldown(ctx: PrescriptionContext): PrescriptionStep {
  return { ...easyStep(ctx, 'Vuelta a la calma', { durationS: COOLDOWN_MIN * 60 }), kind: 'cooldown', cue: 'Trote muy suave y 5 min de estiramientos de gemelo, cuádriceps y cadera.' };
}

function paceOr(ctx: PrescriptionContext, key: 'threshold' | 'interval' | 'repetition' | 'halfMarathon' | 'marathon' | 'tenK', label: string, fallbackCue: string): Partial<PrescriptionStep> {
  if (ctx.paces) return { pace: pace(ctx.paces[key], label) };
  return { cue: fallbackCue };
}

const pick = <T>(arr: T[], i: number) => arr[i % arr.length];

export interface RunPrescription { steps: PrescriptionStep[]; km: number; minutes: number; title: string; objective: string }

function minutesFor(km: number, secPerKm: number | undefined) { return Math.round((km * (secPerKm ?? 360)) / 60); }

export function runPrescription(type: SessionType, km: number, ctx: PrescriptionContext): RunPrescription {
  const p = ctx.paces;
  const easyPace = p ? (p.easy[0] + p.easy[1]) / 2 : undefined;
  const wIdx = ctx.weekIndex;
  const vol = ctx.deload ? 0.75 : 1;
  switch (type) {
    case 'run_easy':
    case 'run_recovery': {
      const d = Math.max(4, km);
      return {
        title: type === 'run_easy' ? `Rodaje suave ${d.toFixed(0)} km` : `Recuperación activa ${d.toFixed(0)} km`,
        objective: type === 'run_easy' ? 'Sumar volumen aeróbico con poca fatiga' : 'Activar y recuperar sin generar carga',
        steps: [easyStep(ctx, 'Rodaje continuo', { distanceM: d * 1000 }), ...(type === 'run_easy' && !ctx.deload ? [{ kind: 'note' as const, label: 'Al final: 4-6 progresiones de 20 s', cue: 'Relajado, buena postura, no es un sprint.' }] : [])],
        km: d, minutes: minutesFor(d, type === 'run_recovery' && easyPace ? easyPace + 20 : easyPace),
      };
    }
    case 'run_long': {
      const d = Math.max(8, km);
      const specific = ctx.phase.kind === 'specific' && (ctx.goalType === 'half_marathon' || ctx.goalType === 'marathon');
      const hmKm = specific ? Math.min(8, Math.round(d * (0.2 + 0.05 * (wIdx % 3)))) : 0;
      const steps: PrescriptionStep[] = [easyStep(ctx, 'Tirada continua', { distanceM: (d - hmKm) * 1000 })];
      if (hmKm) steps.push({ kind: 'work', label: `Últimos ${hmKm} km a ritmo de media`, distanceM: hmKm * 1000, ...paceOr(ctx, 'halfMarathon', 'Ritmo de media', 'RPE 7: exigente pero sostenible.') });
      steps.push({ kind: 'note', label: 'Hidratación', cue: d >= 16 ? 'Lleva agua y prueba el gel o la bebida que usarás el día de la carrera.' : 'Bebe antes y después.' });
      return { title: `Tirada larga ${d.toFixed(0)} km`, objective: hmKm ? 'Resistencia aeróbica y ritmo de competición con fatiga' : 'Resistencia aeróbica y economía de carrera', steps, km: d, minutes: minutesFor(d - hmKm, easyPace) + minutesFor(hmKm, p?.halfMarathon) };
    }
    case 'run_intervals':
    case 'run_vo2': {
      const sets = pick([
        { n: 5, d: 1000, r: 150 }, { n: 6, d: 800, r: 120 }, { n: 4, d: 1200, r: 180 }, { n: 5, d: 1000, r: 150 },
      ], wIdx);
      const n = Math.max(3, Math.round(sets.n * vol));
      const work = (n * sets.d) / 1000;
      return {
        title: `Series ${n}×${sets.d} m`, objective: 'Mejorar VO2max y tolerancia a ritmos rápidos',
        steps: [warmup(ctx), { kind: 'repeat', label: `${n} repeticiones`, repeat: n, steps: [
          { kind: 'work', label: `${sets.d} m`, distanceM: sets.d, ...paceOr(ctx, 'interval', 'Ritmo I', 'RPE 8-9: muy exigente, sostenible ~10-12 min en total.') },
          { kind: 'recovery', label: 'Trote suave', durationS: sets.r },
        ] }, cooldown(ctx)],
        km: work + 4.5, minutes: WARMUP_MIN + COOLDOWN_MIN + Math.round((work * (p?.interval ?? 270)) / 60 + (n * sets.r) / 60),
      };
    }
    case 'run_threshold':
    case 'run_tempo': {
      const s = pick([{ n: 3, min: 10, r: 120 }, { n: 2, min: 15, r: 180 }, { n: 4, min: 8, r: 90 }, { n: 1, min: 20, r: 0 }], wIdx);
      const n = Math.max(1, Math.round(s.n * vol));
      const workMin = n * s.min;
      const workKm = p ? (workMin * 60) / p.threshold : workMin / 4.8;
      return {
        title: n > 1 ? `Umbral ${n}×${s.min}'` : `Tempo ${s.min}'`, objective: 'Subir el umbral: correr más rápido sin acumular lactato',
        steps: [warmup(ctx), { kind: 'repeat', label: `${n} bloques`, repeat: n, steps: [
          { kind: 'work', label: `${s.min} min`, durationS: s.min * 60, ...paceOr(ctx, 'threshold', 'Umbral', 'RPE 7: "cómodamente duro", frases cortas.'), ...(ctx.zones ? { hrRange: [ctx.zones.zones[3][0], ctx.zones.zones[3][1]] as [number, number] } : {}) },
          ...(s.r ? [{ kind: 'recovery' as const, label: 'Trote suave', durationS: s.r }] : []),
        ] }, cooldown(ctx)],
        km: workKm + 4.5, minutes: WARMUP_MIN + COOLDOWN_MIN + workMin + Math.round((n * s.r) / 60),
      };
    }
    case 'run_race_pace': {
      const s = ctx.phase.kind === 'taper'
        ? (ctx.deload ? { n: 3, km: 1, r: 120 } : { n: 2, km: 3, r: 180 })
        : pick([{ n: 3, km: 3, r: 180 }, { n: 2, km: 5, r: 240 }, { n: 1, km: 8, r: 0 }, { n: 2, km: 4, r: 180 }], wIdx);
      const n = ctx.phase.kind === 'taper' ? s.n : Math.max(1, Math.round(s.n * vol));
      const key = ctx.goalType === '10k' ? 'tenK' : ctx.goalType === 'marathon' ? 'marathon' : 'halfMarathon';
      return {
        title: `Ritmo de carrera ${n > 1 ? `${n}×` : ''}${s.km} km`, objective: 'Automatizar el ritmo objetivo de competición',
        steps: [warmup(ctx), { kind: 'repeat', label: `${n} bloques`, repeat: n, steps: [
          { kind: 'work', label: `${s.km} km`, distanceM: s.km * 1000, ...paceOr(ctx, key, 'Ritmo objetivo', 'RPE 7: el ritmo que mantendrías en la carrera.') },
          ...(s.r ? [{ kind: 'recovery' as const, label: 'Trote suave', durationS: s.r }] : []),
        ] }, cooldown(ctx)],
        km: n * s.km + 4.5, minutes: WARMUP_MIN + COOLDOWN_MIN + minutesFor(n * s.km, p?.halfMarathon) + Math.round((n * s.r) / 60),
      };
    }
    case 'run_hills': {
      const n = Math.round((8 + (wIdx % 3)) * vol);
      return {
        title: `Cuestas ${n}×45"`, objective: 'Fuerza específica de carrera y potencia con poco impacto',
        steps: [warmup(ctx), { kind: 'repeat', label: `${n} subidas`, repeat: n, steps: [
          { kind: 'work', label: 'Subida 45 s (6-8 % de pendiente)', durationS: 45, cue: 'RPE 8: brazos activos, zancada corta, pisada bajo la cadera.' },
          { kind: 'recovery', label: 'Bajada trotando', durationS: 90 },
        ] }, cooldown(ctx)],
        km: 8, minutes: WARMUP_MIN + COOLDOWN_MIN + Math.round(n * 2.25),
      };
    }
    default:
      return { title: 'Carrera', objective: '', steps: [], km, minutes: minutesFor(km, easyPace) };
  }
}

/** Test de 5 km para calibrar ritmos cuando no hay datos de rendimiento. */
export function timeTrialPrescription(ctx: PrescriptionContext): RunPrescription {
  return {
    title: 'Test 5 km', objective: 'Medir tu nivel actual para calcular ritmos con tus datos reales',
    steps: [warmup(ctx), { kind: 'work', label: '5 km al máximo sostenible', distanceM: 5000, cue: 'Empieza controlado el primer km y acelera. Marca la actividad como "test" al registrarla.' }, cooldown(ctx)],
    km: 9.5, minutes: 55,
  };
}

// ---------- Fuerza ----------

interface StrengthItem { exerciseId: string; name: string; sets: number; reps: number; rir: number; restS: number; cue: string; fixedLoad?: string }

const LOWER: StrengthItem[] = [
  { exerciseId: 'back_squat', name: 'Back Squat', sets: 4, reps: 5, rir: 2, restS: 150, cue: 'Bracing antes de bajar, rodillas en línea con los pies.' },
  { exerciseId: 'romanian_deadlift', name: 'Peso muerto rumano', sets: 3, reps: 8, rir: 2, restS: 120, cue: 'Cadera atrás, barra pegada a las piernas, espalda neutra.' },
  { exerciseId: 'bulgarian_split_squat', name: 'Sentadilla búlgara', sets: 3, reps: 8, rir: 2, restS: 90, cue: 'Por pierna. Torso ligeramente inclinado.' },
  { exerciseId: 'plank', name: 'Plancha', sets: 3, reps: 1, rir: 2, restS: 45, cue: '40 s, glúteos activos.', fixedLoad: '40 s' },
];
const UPPER: StrengthItem[] = [
  { exerciseId: 'strict_press', name: 'Strict Press', sets: 4, reps: 5, rir: 2, restS: 120, cue: 'Glúteos y abdomen apretados, la cabeza "atraviesa" al final.' },
  { exerciseId: 'pull_up', name: 'Dominadas estrictas', sets: 4, reps: 6, rir: 2, restS: 120, cue: 'Escápulas abajo antes de tirar.', fixedLoad: 'peso corporal' },
  { exerciseId: 'bench_press', name: 'Press banca', sets: 3, reps: 6, rir: 2, restS: 120, cue: 'Escápulas retraídas, pies firmes.' },
  { exerciseId: 'row_barbell', name: 'Remo con barra', sets: 3, reps: 8, rir: 2, restS: 90, cue: 'Torso estable, tira hacia el ombligo.' },
];
const FULL_HYROX: StrengthItem[] = [
  { exerciseId: 'deadlift', name: 'Peso muerto', sets: 4, reps: 5, rir: 2, restS: 150, cue: 'Tensión antes de despegar la barra.' },
  { exerciseId: 'front_squat', name: 'Front Squat', sets: 3, reps: 6, rir: 2, restS: 120, cue: 'Codos altos, torso vertical.' },
  { exerciseId: 'lunge', name: 'Zancadas con carga', sets: 3, reps: 12, rir: 2, restS: 90, cue: '12 por pierna, pasos largos y rodilla trasera cerca del suelo.' },
  { exerciseId: 'farmers_carry', name: 'Farmers carry', sets: 4, reps: 1, rir: 2, restS: 60, cue: '50 m con carga de competición o +20 %.', fixedLoad: 'carga HYROX' },
];

export function strengthPrescription(kind: 'strength_lower' | 'strength_upper' | 'strength_full', ctx: PrescriptionContext): { steps: PrescriptionStep[]; minutes: number; title: string; objective: string } {
  const list = kind === 'strength_lower' ? LOWER : kind === 'strength_upper' ? UPPER : FULL_HYROX;
  const steps: PrescriptionStep[] = [{ kind: 'warmup', label: 'Calentamiento', durationS: 600, cue: '5 min de remo o bici suave + movilidad de cadera, tobillo y hombro + series de aproximación.' }];
  for (const it of list) {
    const sets = ctx.deload ? Math.max(2, it.sets - 1) : it.sets;
    const summary = ctx.lifts[it.exerciseId];
    let loadKg: number | undefined; let estimate = false; let cue = it.cue;
    if (!it.fixedLoad) {
      const rec = summary ? recommendLoad({ summary, sets, reps: it.reps, rir: it.rir, readiness: ctx.readiness }) : null;
      if (rec?.loadKg) { loadKg = rec.loadKg; estimate = true; cue = `${it.cue} ${rec.explanation}`; }
      else cue = `${it.cue} Sin marcas previas: elige un peso que te deje ${it.rir + 1}-${it.rir + 2} repeticiones en reserva y regístralo.`;
    }
    steps.push({ kind: 'exercise', label: it.name, exerciseId: it.exerciseId, sets, reps: it.reps, rir: it.rir, restS: it.restS, loadKg, loadIsEstimate: estimate, cue: it.fixedLoad ? `${cue} (${it.fixedLoad})` : cue });
  }
  steps.push({ kind: 'cooldown', label: 'Vuelta a la calma', durationS: 300, cue: 'Respiración y estiramientos suaves.' });
  const title = kind === 'strength_lower' ? 'Fuerza tren inferior' : kind === 'strength_upper' ? 'Fuerza tren superior' : 'Fuerza HYROX';
  return { steps, minutes: kind === 'strength_upper' ? 55 : 60, title, objective: kind === 'strength_upper' ? 'Fuerza de empuje y tracción sin fatigar las piernas' : 'Fuerza máxima y resistencia muscular de piernas y cadena posterior' };
}

// ---------- HYROX ----------

export const HYROX_WEIGHTS = {
  open_men: { sledPush: 152, sledPull: 103, farmers: '2×24 kg', sandbag: 20, wallBall: '6 kg' },
  open_women: { sledPush: 102, sledPull: 78, farmers: '2×16 kg', sandbag: 10, wallBall: '4 kg' },
  pro_men: { sledPush: 202, sledPull: 153, farmers: '2×32 kg', sandbag: 30, wallBall: '9 kg' },
  pro_women: { sledPush: 152, sledPull: 103, farmers: '2×24 kg', sandbag: 20, wallBall: '6 kg' },
} as const;
// Pesos de referencia (incluyen el trineo). Verifica con el reglamento oficial de tu temporada y categoría.

const STATIONS = (w: (typeof HYROX_WEIGHTS)[keyof typeof HYROX_WEIGHTS]) => [
  { id: 'ski_erg', label: 'SkiErg 1000 m', distanceM: 1000, cue: 'Tirón largo con cadera, no solo brazos.' },
  { id: 'sled_push', label: `Sled Push 50 m (${w.sledPush} kg)`, distanceM: 50, cue: 'Brazos extendidos, pasos cortos y continuos.' },
  { id: 'sled_pull', label: `Sled Pull 50 m (${w.sledPull} kg)`, distanceM: 50, cue: 'Mano sobre mano, recoge la cuerda caminando hacia atrás.' },
  { id: 'burpee_broad_jump', label: 'Burpee Broad Jumps 80 m', distanceM: 80, cue: 'Ritmo constante, aterriza suave.' },
  { id: 'row', label: 'Remo 1000 m', distanceM: 1000, cue: 'Piernas-cadera-brazos, 24-28 paladas/min.' },
  { id: 'farmers_carry', label: `Farmers Carry 200 m (${w.farmers})`, distanceM: 200, cue: 'Hombros abajo, pasos rápidos.' },
  { id: 'sandbag_lunge', label: `Sandbag Lunges 100 m (${w.sandbag} kg)`, distanceM: 100, cue: 'Rodilla trasera toca el suelo, saco en los hombros.' },
  { id: 'wall_ball', label: `Wall Balls 100 reps (${w.wallBall})`, distanceM: 0, cue: 'Series fijas (p. ej. 25-25-25-25) con descansos breves.' },
];

export function hyroxPrescription(type: 'hyrox_stations' | 'hyrox_compromised' | 'hyrox_simulation', ctx: PrescriptionContext): { steps: PrescriptionStep[]; minutes: number; title: string; objective: string; km: number } {
  const w = HYROX_WEIGHTS[ctx.profile.hyroxDivision ?? 'open_men'];
  const st = STATIONS(w);
  const racePace = ctx.paces ? ctx.paces.tenK + 20 : undefined;
  const runStep = (m: number): PrescriptionStep => ({ kind: 'work', label: `Carrera ${m} m`, distanceM: m, ...(racePace ? { pace: pace(racePace, 'Ritmo HYROX') } : { cue: 'RPE 7: el ritmo que mantendrías en competición.' }) });
  const roxzone: PrescriptionStep = { kind: 'note', label: 'Transición', cue: 'Practica la transición: entra en la estación sin parar y sal corriendo sin pausa.' };
  const half = ctx.deload ? 0.5 : 1;
  if (type === 'hyrox_simulation') {
    const order = ctx.weekIndex % 2 === 0 ? st.slice(0, 4) : st.slice(4);
    const steps: PrescriptionStep[] = [warmup(ctx, false)];
    for (const s of order) steps.push(runStep(1000), { kind: 'station', label: s.label, exerciseId: s.id, distanceM: s.distanceM || undefined, reps: s.id === 'wall_ball' ? 100 : undefined, cue: s.cue }, roxzone);
    steps.push(cooldown(ctx));
    return { title: `Media simulación HYROX (${ctx.weekIndex % 2 === 0 ? 'estaciones 1-4' : 'estaciones 5-8'})`, objective: 'Ensayar ritmo, transiciones y estrategia con pesos de competición', steps, minutes: 75, km: 6 };
  }
  if (type === 'hyrox_compromised') {
    const pairs = [[st[1], st[7]], [st[3], st[6]], [st[2], st[5]], [st[0], st[4]]][ctx.weekIndex % 4];
    const rounds = Math.max(2, Math.round(4 * half));
    return {
      title: `Carrera comprometida ${rounds} rondas`, objective: 'Correr bien con las piernas cargadas (lo que decide un HYROX)',
      steps: [warmup(ctx, false), { kind: 'repeat', label: `${rounds} rondas`, repeat: rounds, steps: [
        runStep(1000), { kind: 'station', label: pairs[0].label.replace(/\d+ (m|reps)/, (m) => m), exerciseId: pairs[0].id, cue: `${pairs[0].cue} Mitad de la distancia de competición.` },
        runStep(500), { kind: 'station', label: pairs[1].label, exerciseId: pairs[1].id, cue: `${pairs[1].cue} Mitad de la distancia de competición.` },
        { kind: 'recovery', label: 'Descanso', durationS: 120 },
      ] }, cooldown(ctx)],
      minutes: 60 + rounds * 2, km: rounds * 1.5 + 4,
    };
  }
  return {
    title: 'Técnica y fuerza-resistencia en estaciones', objective: 'Eficiencia en estaciones con menos carga de carrera',
    steps: [{ kind: 'warmup', label: 'Calentamiento', durationS: 600, cue: 'Remo/Ski suave y movilidad.' },
      { kind: 'repeat', label: '3 rondas', repeat: Math.max(2, Math.round(3 * half)), steps: [
        { kind: 'station', label: `Sled Push 4×12,5 m (${w.sledPush} kg)`, exerciseId: 'sled_push', distanceM: 50, cue: st[1].cue },
        { kind: 'station', label: 'SkiErg 500 m', exerciseId: 'ski_erg', distanceM: 500, cue: st[0].cue },
        { kind: 'station', label: `Wall Balls 30 (${w.wallBall})`, exerciseId: 'wall_ball', reps: 30, cue: st[7].cue },
        { kind: 'station', label: `Sandbag Lunges 25 m (${w.sandbag} kg)`, exerciseId: 'sandbag_lunge', distanceM: 25, cue: st[6].cue },
        { kind: 'recovery', label: 'Descanso', durationS: 120 },
      ] }, { kind: 'cooldown', label: 'Vuelta a la calma', durationS: 300 }],
    minutes: 55, km: 0,
  };
}

export function mobilityPrescription(): { steps: PrescriptionStep[]; minutes: number; title: string; objective: string } {
  return {
    title: 'Movilidad y recuperación', objective: 'Recuperar rango de movimiento y bajar la fatiga',
    steps: [
      { kind: 'exercise', label: 'Movilidad de tobillo en pared', sets: 2, reps: 10, cue: 'Por pierna, rodilla hacia la pared sin levantar el talón.' },
      { kind: 'exercise', label: 'Estiramiento 90/90 de cadera', sets: 2, reps: 1, cue: '60 s por lado.' },
      { kind: 'exercise', label: 'Couch stretch (flexor de cadera)', sets: 2, reps: 1, cue: '60 s por lado.' },
      { kind: 'exercise', label: 'Rotaciones torácicas en cuadrupedia', sets: 2, reps: 8, cue: 'Por lado.' },
      { kind: 'exercise', label: 'Foam roller: gemelos, cuádriceps, glúteo', sets: 1, reps: 1, cue: '5 min en total.' },
    ],
    minutes: 25,
  };
}

export function crossfitBoxPrescription(ctx: PrescriptionContext, nextDayKeyRun: boolean, nextDayLabel?: string): { steps: PrescriptionStep[]; minutes: number; title: string; objective: string } {
  const cues: string[] = [];
  if (nextDayKeyRun) cues.push(`Mañana tienes ${nextDayLabel ?? 'una sesión clave de carrera'}: si el WOD es muy de piernas (sentadillas, saltos, zancadas, wall balls), reduce ~30 % la carga o el volumen de pierna y prioriza técnica.`);
  if (ctx.phase.kind === 'taper') cues.push('Semana de puesta a punto: trabaja al 70-80 %, sin buscar marcas.');
  if (ctx.phase.kind === 'recovery') cues.push('Semana de recuperación: escala todo a intensidad moderada.');
  if (ctx.readiness === 'ambar') cues.push('Tu recuperación está en ámbar: limita la intensidad a RPE 7.');
  if (ctx.deload) cues.push('Semana de descarga: menos carga externa, técnica limpia.');
  cues.push('Cuando termines, haz una foto a la pizarra: la leo, la registro y ajusto el resto de la semana.');
  return {
    title: 'CrossFit en el box', objective: ctx.goalType === 'hyrox' ? 'Fuerza-resistencia y capacidad metabólica para HYROX' : 'Mantener fuerza, potencia y capacidad general',
    steps: [{ kind: 'note', label: 'Clase del box', cue: cues.join(' ') }], minutes: 60,
  };
}

export function racePrescription(ctx: PrescriptionContext, distanceM: number, targetS?: number): { steps: PrescriptionStep[]; minutes: number; title: string; objective: string } {
  const goalPace = targetS ? targetS / (distanceM / 1000) : ctx.paces ? (distanceM > 15000 ? ctx.paces.halfMarathon : ctx.paces.tenK) : undefined;
  const steps: PrescriptionStep[] = [
    { kind: 'warmup', label: 'Calentamiento', durationS: 600, cue: '8-10 min de trote muy suave y 3 progresiones cortas.' },
  ];
  if (goalPace) {
    steps.push(
      { kind: 'work', label: 'Km 1-5', distanceM: 5000, pace: pace(goalPace + 4, 'Conservador'), cue: 'No te dejes llevar por la salida.' },
      { kind: 'work', label: `Km 5-${Math.round(distanceM / 1000) - 3}`, distanceM: distanceM - 8000, pace: pace(goalPace, 'Ritmo objetivo') },
      { kind: 'work', label: 'Últimos 3 km', distanceM: 3000, pace: pace(goalPace - 4, 'Cierre'), cue: 'Si vas bien, aprieta.' },
    );
  } else steps.push({ kind: 'work', label: 'Carrera', distanceM, cue: 'Primer tercio conservador, segundo constante, último tercio a sensaciones.' });
  return { title: 'Competición', objective: 'Dar tu mejor versión', steps, minutes: Math.round(((goalPace ?? 330) * distanceM) / 1000 / 60) + 10 };
}

export const describePace = (s?: PrescriptionStep) => (s?.pace ? fmtPace(s.pace.secPerKm) : '');
export type { PlannedSession };
