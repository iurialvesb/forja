// Normaliza lo que envía un Atajo de iOS. Los Atajos convierten listas en texto con saltos de línea, usan coma decimal
// y nombres de campo en español; aquí se acepta todo eso sin inventar valores.
export interface SleepStages { wristTempC?: number; asleepMin?: number; deepMin?: number; remMin?: number; coreMin?: number; awakeMin?: number; inBedMin?: number; bedtime?: string; wakeTime?: string }
export interface ShortcutDay { date: string; hrvMs?: number; rhr?: number; sleepH?: number; stages?: SleepStages; respiration?: number; spo2?: number; vo2max?: number; steps?: number; activeKcal?: number; exerciseMin?: number; weightKg?: number }
export interface ShortcutWorkout { start: string; durationS: number; type: string; kcal?: number; avgHr?: number; maxHr?: number; distanceM?: number }

const nums = (v: unknown): number[] => {
  if (v == null) return [];
  if (typeof v === 'number') return [v];
  if (Array.isArray(v)) return v.flatMap(nums);
  return String(v).replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
};
/**
 * Duraciones tal como las pasa Atajos: una lista (una por línea) de «1 hr 43 min», «46 min», «1:43:00», «2760 s» o números sueltos.
 * Devuelve minutos si alguna lleva unidad; si son números sueltos, null (los decide el llamante).
 */
export function durationsMin(v: unknown): number | null {
  if (v == null) return null;
  const parts = (Array.isArray(v) ? v.map(String) : String(v).split(/\n|;|(?<=[a-z])\s*,\s*/i)).map((x) => x.trim()).filter(Boolean);
  let total = 0, unit = false;
  for (const p0 of parts) {
    const p = p0.replace(/(\d),(\d)/g, '$1.$2').toLowerCase();
    const hms = p.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (hms) { total += hms[3] != null ? +hms[1] * 60 + +hms[2] + +hms[3] / 60 : +hms[1] * 60 + +hms[2]; unit = true; continue; }
    let m = 0, any = false;
    for (const [, n, u] of p.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hora|horas|hour|hours|m|min|mins|minuto|minutos|minute|minutes|s|sec|secs|seg|segundos|second|seconds)\b/g)) {
      any = true; m += /^h/.test(u) ? +n * 60 : /^s/.test(u) ? +n / 60 : +n;
    }
    if (any) { total += m; unit = true; } else { const n = Number(p.match(/-?\d+(?:\.\d+)?/)?.[0]); if (!Number.isNaN(n)) total += n; }
  }
  return unit ? Math.round(total * 10) / 10 : null;
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : undefined);
const sum = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) : undefined);
const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return undefined; };

export function parseShortcut(p: any, today: string): { day?: ShortcutDay; workouts: ShortcutWorkout[] } {
  const date = String(pick(p, 'fecha', 'date') ?? today).slice(0, 10);
  let sleepMin = sum(nums(pick(p, 'sueño_min', 'sueno_min', 'sleep_min')));
  if (sleepMin != null && sleepMin > 1440) sleepMin = sleepMin / 60; // el Atajo envió segundos
  let sleepH = sleepMin != null ? sleepMin / 60 : sum(nums(pick(p, 'sueño_h', 'sueno_h', 'sleep_h', 'sueño', 'sueno', 'sleep')));
  if (sleepH != null && sleepH > 24) sleepH = sleepH > 1440 ? sleepH / 3600 : sleepH / 60;    // segundos o minutos
  // Fases: «profundo_min», «rem_min», «basico_min»/«core_min», «despierto_min», «en_cama_min». Si alguna pasa de 1440 el Atajo mandó segundos (todas).
  const KEYS: Record<string, string[]> = {
    deepMin: ['profundo_min', 'profundo', 'sueño_profundo_min', 'sueno_profundo_min', 'deep_min', 'deep'],
    remMin: ['rem_min', 'rem', 'sueño_rem_min', 'sueno_rem_min'],
    coreMin: ['basico_min', 'básico_min', 'basico', 'básico', 'ligero_min', 'core_min', 'core', 'sueño_basico_min', 'sueno_basico_min'],
    awakeMin: ['despierto_min', 'despierto', 'depsierto', 'despiertos', 'awake_min', 'awake'],
    inBedMin: ['en_cama_min', 'in_bed_min'],
  };
  // Con unidades («1 hr 43 min») ya son minutos exactos; números sueltos se suman y luego se decide si eran segundos.
  const withUnits: Record<string, number> = {};
  const raw: Record<string, number | undefined> = {};
  for (const [k, ks] of Object.entries(KEYS)) {
    const v = pick(p, ...ks);
    const d = durationsMin(v);
    if (d != null) withUnits[k] = d; else raw[k] = sum(nums(v));
  }
  const secs = Object.values(raw).some((v) => v != null && v > 1440) || (sleepMin != null && sum(nums(pick(p, 'sueño_min', 'sueno_min', 'sleep_min')))! > 1440);
  const r1 = (v?: number) => (v == null ? undefined : Math.round((secs ? v / 60 : v) * 10) / 10);
  const ts = (v: unknown) => { const t = v != null ? Date.parse(String(v)) : NaN; return Number.isNaN(t) ? undefined : new Date(t).toISOString(); };
  const r2 = (k: string) => withUnits[k] ?? r1(raw[k]);
  const stages: SleepStages = { deepMin: r2('deepMin'), remMin: r2('remMin'), coreMin: r2('coreMin'), awakeMin: r2('awakeMin'), inBedMin: r2('inBedMin'),
    bedtime: ts(pick(p, 'acostarse', 'hora_acostarse', 'bedtime')), wakeTime: ts(pick(p, 'despertar', 'hora_despertar', 'wake_time')) };
  const stageSum = [stages.deepMin, stages.remMin, stages.coreMin].some((v) => v != null) ? (stages.deepMin ?? 0) + (stages.remMin ?? 0) + (stages.coreMin ?? 0) : undefined;
  if (stageSum != null) { stages.asleepMin = Math.round(stageSum * 10) / 10; if (sleepH == null) sleepH = stageSum / 60; }
  // Temperatura de muñeca: el Atajo da el valor absoluto (≈ 35 °C) y la app Salud muestra la desviación; se guarda lo que llegue
  // y Forja compara con tus noches anteriores.
  const wt = avg(nums(pick(p, 'temperatura', 'temperatura_muñeca', 'temperatura_muneca', 'wrist_temp')));
  if (wt != null && (Math.abs(wt) < 5 || (wt > 30 && wt < 42))) stages.wristTempC = Math.round(wt * 100) / 100;
  const hasStages = Object.values(stages).some((v) => v != null);
  const day: ShortcutDay = {
    stages: hasStages ? stages : undefined,
    respiration: (() => { const v = avg(nums(pick(p, 'respiracion', 'respiración', 'frecuencia_respiratoria', 'respiration'))); return v != null ? Math.round(v * 10) / 10 : undefined; })(),
    spo2: (() => { const v = avg(nums(pick(p, 'oxigeno', 'oxígeno', 'spo2', 'saturacion'))); return v == null ? undefined : Math.round((v <= 1 ? v * 100 : v) * 10) / 10; })(),
    vo2max: (() => { const v = nums(pick(p, 'vo2max', 'vo2_max', 'vo2')).pop(); return v != null ? Math.round(v * 10) / 10 : undefined; })(),
    date, hrvMs: avg(nums(pick(p, 'vfc', 'hrv', 'variabilidad'))), rhr: avg(nums(pick(p, 'fc_reposo', 'rhr', 'resting_hr'))),
    sleepH: sleepH != null ? Math.round(sleepH * 100) / 100 : undefined, steps: sum(nums(pick(p, 'pasos', 'steps'))),
    activeKcal: sum(nums(pick(p, 'kcal_activas', 'energia_activa', 'active_kcal'))), exerciseMin: sum(nums(pick(p, 'minutos_ejercicio', 'exercise_min'))),
    weightKg: nums(pick(p, 'peso', 'weight')).pop(),
  };
  const ws: ShortcutWorkout[] = [];
  const list = pick(p, 'entrenos', 'workouts');
  for (const w of Array.isArray(list) ? list : []) {
    const start = pick(w, 'inicio', 'start'); if (!start) continue;
    const end = pick(w, 'fin', 'end');
    const durMin = nums(pick(w, 'duracion_min', 'duration_min'))[0];
    const durationS = durMin ? durMin * 60 : end ? (Date.parse(end) - Date.parse(start)) / 1000 : 0;
    if (!(durationS > 0) || Number.isNaN(Date.parse(start))) continue;
    const distKm = nums(pick(w, 'distancia_km', 'distance_km'))[0];
    ws.push({ start: new Date(start).toISOString(), durationS, type: String(pick(w, 'tipo', 'type') ?? 'otro'), kcal: nums(pick(w, 'kcal'))[0], avgHr: nums(pick(w, 'fc_media', 'avg_hr'))[0], maxHr: nums(pick(w, 'fc_max', 'max_hr'))[0], distanceM: distKm ? distKm * 1000 : undefined });
  }
  const hasDay = Object.entries(day).some(([k, v]) => k !== 'date' && v != null);
  return { day: hasDay ? day : undefined, workouts: ws };
}

export function disciplineFromType(t: string): string {
  const n = t.toLowerCase();
  if (/carrera|correr|run/.test(n)) return 'running';
  if (/funcional|cross|hiit|intervalos/.test(n)) return 'crossfit';
  if (/fuerza|strength|pesas/.test(n)) return 'strength';
  if (/bici|cycl|ciclismo/.test(n)) return 'cycling';
  if (/nata|swim/.test(n)) return 'swimming';
  if (/camin|walk/.test(n)) return 'walking';
  if (/sender|hik/.test(n)) return 'hiking';
  if (/yoga/.test(n)) return 'yoga';
  if (/padel|pádel|tenis|tennis/.test(n)) return 'padel';
  return 'other';
}
