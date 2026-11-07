// Tipos de dominio compartidos por el motor, las Edge Functions y (vía JSON) la app iOS.
// Solo sintaxis "borrable" de TypeScript: el mismo código corre en Node (tests) y Deno (Supabase).

export type Discipline =
  | 'running' | 'crossfit' | 'hybrid' | 'hyrox' | 'strength' | 'weightlifting'
  | 'gymnastics' | 'calisthenics' | 'swimming' | 'cycling' | 'hiking' | 'walking'
  | 'skiing' | 'padel' | 'tennis' | 'yoga' | 'mobility' | 'dance' | 'other';

export type Region = 'quads' | 'posterior' | 'calves' | 'push' | 'pull' | 'core' | 'grip';
export type RegionLoad = Partial<Record<Region | 'impact' | 'metabolic', number>>;

export type BlockKind = 'warmup' | 'strength' | 'skill' | 'wod' | 'accessory' | 'cooldown' | 'run' | 'station';
export type BlockFormat =
  | 'emom' | 'amrap' | 'for_time' | 'rounds' | 'intervals' | 'sets' | 'tabata' | 'chipper' | 'steady';

export interface SetEntry {
  exerciseId: string;          // id del catálogo (exercises.ts) o 'custom:<nombre>'
  reps?: number;
  loadKg?: number;
  distanceM?: number;
  durationS?: number;
  calories?: number;
  rpe?: number;                // 1-10
  rir?: number;                // repeticiones en reserva
  isWarmup?: boolean;
  // Registro desglosado (fase 1 CrossFit)
  roundNo?: number;            // ronda, serie o minuto
  label?: string;              // "Serie 2", "Ronda 3", "Min 5"
  unit?: 'reps' | 'cal' | 'm' | 's';
  targetReps?: number;         // objetivo en la unidad de la fila
  targetLoadKg?: number;
  targetPct?: number;
  targetText?: string;
  status?: 'done' | 'partial' | 'skipped';
  splitS?: number;
  origin?: 'manual' | 'ai' | 'text' | 'healthkit';
}

export interface SessionBlock {
  kind: BlockKind;
  format?: BlockFormat;
  timeCapS?: number;
  rounds?: number;
  sets: SetEntry[];
  resultText?: string;         // "12:34", "8 rondas + 5", etc.
  resultTimeS?: number;
  resultRounds?: number;
  resultReps?: number;
  part?: 'strength' | 'wod' | 'endurance' | 'other';
  scaling?: 'rx' | 'scaled';
  title?: string;
  durationMin?: number;
  intervalS?: number;
  capped?: boolean;
  prescribed?: unknown;        // plantilla completa del registro (para reabrir y editar)
  notes?: string;
}

export interface Session {
  id: string;
  startedAt: string;           // ISO
  durationS: number;
  discipline: Discipline;
  title?: string;
  rpe?: number;                // RPE de sesión (Foster) 1-10
  avgHr?: number;
  maxHr?: number;
  hrZoneSeconds?: number[];    // 5 zonas
  distanceM?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  cadenceSpm?: number;
  blocks?: SessionBlock[];
  isRace?: boolean;
  isTimeTrial?: boolean;
  source?: 'manual' | 'healthkit' | 'strava' | 'photo';
  externalId?: string;
}

export interface DayAvailability {
  weekday: number;             // 1 = lunes ... 7 = domingo (ISO)
  am: boolean;
  pm: boolean;
  maxMinutes: number;          // tiempo máximo disponible ese día
  boxClass?: boolean;          // hay clase de CrossFit en el box
}

export interface AthleteProfile {
  birthDate?: string;
  sex?: 'male' | 'female';
  weightKg?: number;
  hrRest?: number;
  hrMax?: number;
  lthr?: number;               // FC umbral láctico medida
  hyroxDivision?: 'open_men' | 'open_women' | 'pro_men' | 'pro_women';
  availability: DayAvailability[];
  allowDoubles: boolean;
  crossfitPerWeek: number;     // sesiones de box que quiere mantener
  activeInjuries?: { area: string; avoid: Region[]; note?: string }[];
}

export type GoalType = 'half_marathon' | 'marathon' | '10k' | '5k' | 'hyrox' | 'crossfit_comp' | 'strength' | 'general';

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  date: string;                // YYYY-MM-DD
  priority: 'A' | 'B' | 'C';
  targetTimeS?: number;
  distanceM?: number;
}

export type PhaseKind = 'general' | 'development' | 'specific' | 'taper' | 'competition' | 'recovery' | 'base';

export interface Phase {
  goalId: string | null;
  kind: PhaseKind;
  start: string;               // YYYY-MM-DD inclusive
  end: string;                 // YYYY-MM-DD inclusive
  focus: string;
  secondary?: string;
}

export type SessionType =
  | 'run_easy' | 'run_long' | 'run_intervals' | 'run_tempo' | 'run_threshold' | 'run_hills'
  | 'run_vo2' | 'run_recovery' | 'run_race_pace' | 'crossfit_box' | 'strength_lower'
  | 'strength_upper' | 'strength_full' | 'hyrox_stations' | 'hyrox_compromised' | 'hyrox_simulation'
  | 'mobility' | 'rest' | 'race';

export interface Pace { secPerKm: number; label: string }

export interface PrescriptionStep {
  kind: 'warmup' | 'work' | 'recovery' | 'repeat' | 'cooldown' | 'exercise' | 'note' | 'station';
  label: string;
  durationS?: number;
  distanceM?: number;
  pace?: Pace;
  paceRange?: [number, number];
  hrRange?: [number, number];
  repeat?: number;
  steps?: PrescriptionStep[];
  exerciseId?: string;
  sets?: number;
  reps?: number;
  loadKg?: number;
  loadIsEstimate?: boolean;
  rir?: number;
  restS?: number;
  cue?: string;
}

export interface PlannedSession {
  id: string;
  date: string;                // YYYY-MM-DD
  slot: 'am' | 'pm';
  type: SessionType;
  discipline: Discipline;
  title: string;
  objective: string;
  intensity: 'baja' | 'moderada' | 'alta';
  estMinutes: number;
  legStress: number;           // 0-3 estimado
  key: boolean;
  steps: PrescriptionStep[];
  rationale: string;           // por qué se recomienda
  status?: 'planned' | 'done' | 'skipped' | 'modified';
  plannedKm?: number;
  startLocal?: string;         // hora fija (p. ej. clase reservada en WodBuster)
  fromCalendar?: boolean;
}

export interface DailyHealth {
  date: string;
  hrvMs?: number;              // SDNN de Apple (o RMSSD si se dispone)
  hrvMethod?: 'sdnn' | 'rmssd';
  rhr?: number;
  sleepHours?: number;
  sleepEfficiency?: number;    // 0-1
}

export interface CheckIn {
  date: string;
  fatigue: number;             // 1 (fresco) - 5 (agotado)
  soreness: number;            // 1 - 5
  stress: number;              // 1 - 5
  motivation: number;          // 1 (nula) - 5 (alta)
  sleepQuality: number;        // 1 - 5
  pains?: PainReport[];
}

export interface PainReport {
  area: string;                // "rodilla izquierda", "gemelo", ...
  intensity: number;           // 0-10
  character: 'difuso_muscular' | 'punzante' | 'articular' | 'tendon' | 'otro';
  bilateral?: boolean;
  affectsMovement?: boolean;   // cojeo, cambia la técnica
  swelling?: boolean;
  numbness?: boolean;          // hormigueo, pérdida de fuerza
  daysOngoing?: number;
  worsening?: boolean;
  hoursSinceHardSession?: number;
}
