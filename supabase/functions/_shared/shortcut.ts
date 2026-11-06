// Normaliza lo que envía un Atajo de iOS. Los Atajos convierten listas en texto con saltos de línea, usan coma decimal
// y nombres de campo en español; aquí se acepta todo eso sin inventar valores.
export interface ShortcutDay { date: string; hrvMs?: number; rhr?: number; sleepH?: number; steps?: number; activeKcal?: number; exerciseMin?: number; weightKg?: number }
export interface ShortcutWorkout { start: string; durationS: number; type: string; kcal?: number; avgHr?: number; maxHr?: number; distanceM?: number }

const nums = (v: unknown): number[] => {
  if (v == null) return [];
  if (typeof v === 'number') return [v];
  if (Array.isArray(v)) return v.flatMap(nums);
  return String(v).replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
};
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : undefined);
const sum = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) : undefined);
const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return undefined; };

export function parseShortcut(p: any, today: string): { day?: ShortcutDay; workouts: ShortcutWorkout[] } {
  const date = String(pick(p, 'fecha', 'date') ?? today).slice(0, 10);
  let sleepMin = sum(nums(pick(p, 'sueño_min', 'sueno_min', 'sleep_min')));
  if (sleepMin != null && sleepMin > 1440) sleepMin = sleepMin / 60; // el Atajo envió segundos
  let sleepH = sleepMin != null ? sleepMin / 60 : sum(nums(pick(p, 'sueño_h', 'sueno_h', 'sleep_h', 'sueño', 'sueno', 'sleep')));
  if (sleepH != null && sleepH > 24) sleepH = sleepH > 1440 ? sleepH / 3600 : sleepH / 60;    // segundos o minutos
  const day: ShortcutDay = {
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
