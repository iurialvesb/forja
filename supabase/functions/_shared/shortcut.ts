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
  let total = 0, unit = false; const bare: number[] = [];
  for (const p0 of parts) {
    const p = p0.replace(/(\d),(\d)/g, '$1.$2').toLowerCase();
    // Atajos escribe la duración como «m:ss» (menos de 1 h), «h:mm:ss» (1 h o más) o solo segundos («30»)
    const hms = p.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (hms) { total += hms[3] != null ? +hms[1] * 60 + +hms[2] + +hms[3] / 60 : +hms[1] + +hms[2] / 60; unit = true; continue; }
    let m = 0, any = false;
    for (const [, n, u] of p.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hora|horas|hour|hours|m|min|mins|minuto|minutos|minute|minutes|s|sec|secs|seg|segundos|second|seconds)\b/g)) {
      any = true; m += /^h/.test(u) ? +n * 60 : /^s/.test(u) ? +n / 60 : +n;
    }
    if (any) { total += m; unit = true; } else { const n = Number(p.match(/-?\d+(?:\.\d+)?/)?.[0]); if (!Number.isNaN(n)) bare.push(n); }
  }
  // Números sueltos junto a «m:ss» son segundos (Atajos escribe 30 s como «30»)
  if (unit) total += bare.reduce((a, b) => a + b, 0) / 60;
  else total += bare.reduce((a, b) => a + b, 0);
  return unit ? Math.round(total * 10) / 10 : null;
}
const MONTHS: Record<string, number> = { jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dec: 11, dic: 11 };
/** Fecha tal como la escribe Atajos («24 Nov 2026 at 0:12», «Nov 24, 2026 at 12:12 AM», «24/11/2026, 0:12», ISO). Hora local del teléfono → ms «locales». */
export function shortcutDate(txt: string): number | null {
  const t = txt.trim(); if (!t) return null;
  const iso = Date.parse(t); if (/^\d{4}-\d{2}-\d{2}/.test(t) && !Number.isNaN(iso)) return iso;
  const tm = t.match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?/i);
  let y: number | undefined, mo: number | undefined, d: number | undefined;
  const mName = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/\b(jan|ene|feb|mar|apr|abr|may|jun|jul|aug|ago|sep|set|oct|nov|dec|dic)[a-z]*\.?/);
  if (mName) { mo = MONTHS[mName[1]]; const ds = t.replace(tm?.[0] ?? '', ' ').match(/\d+/g)?.map(Number) ?? []; y = ds.find((x) => x > 1900); d = ds.find((x) => x >= 1 && x <= 31); }
  else { const m = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) { d = +m[1]; mo = +m[2] - 1; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; } }
  if (y == null || mo == null || d == null || !tm) return null;
  let h = +tm[1]; const ap = tm[4]?.toLowerCase().replace(/[^ap]/g, '');
  if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0;
  return Date.UTC(y, mo, d, h, +tm[2], +(tm[3] ?? 0));
}
/**
 * Muestras de sueño sueltas (fase, inicio y duración de cada tramo, una por línea): se agrupan en noches (un hueco de más de 3 h
 * separa noches) y se suma solo la última. Así el Atajo puede buscar «en el último día» sin mezclar dos noches.
 */
export function stagesFromSamples(fases: unknown, inicios: unknown, duraciones: unknown): { deepMin?: number; remMin?: number; coreMin?: number; awakeMin?: number; bedtime?: number; wake?: number } | null {
  const L = (v: unknown) => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(/\n/)).map((x) => x.trim()).filter(Boolean);
  const f = L(fases), st = L(inicios), du = L(duraciones);
  if (!f.length || f.length !== st.length || f.length !== du.length) return null;
  const rows = f.map((x, i) => ({ k: x.toLowerCase(), s: shortcutDate(st[i]), m: durationsMin(du[i]) ?? (Number(du[i]) || 0) / 60 })).filter((r) => r.s != null) as { k: string; s: number; m: number }[];
  if (!rows.length) return null;
  rows.sort((a, b) => a.s - b.s);
  let start = 0, end = rows[0].s + rows[0].m * 60000;
  for (let i = 1; i < rows.length; i++) { if (rows[i].s - end > 3 * 3600_000) start = i; end = Math.max(end, rows[i].s + rows[i].m * 60000); }
  const night = rows.slice(start);
  const sumK = (re: RegExp) => { const v = night.filter((r) => re.test(r.k)).reduce((a, r) => a + r.m, 0); return v ? Math.round(v * 10) / 10 : undefined; };
  return { deepMin: sumK(/deep|profund/), remMin: sumK(/rem/), coreMin: sumK(/core|basic|básic|light|ligero|^asleep$|unspecified/), awakeMin: sumK(/awake|despiert/),
    bedtime: night[0].s, wake: Math.max(...night.map((r) => r.s + r.m * 60000)) };
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : undefined);
const sum = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) : undefined);
// Claves tal como las escribe la persona en Atajos: sin tildes, mayúsculas ni espacios sobrantes («básico » = «basico»)
const nk = (k: string) => k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '_');
const pick = (o: any, ...keys: string[]) => {
  if (!o || typeof o !== 'object') return undefined;
  const want = new Set(keys.map(nk));
  for (const [k, v] of Object.entries(o)) if (want.has(nk(k)) && v != null && v !== '') return v;
  return undefined;
};

/**
 * Tramos de cada fase como lista de minutos, en el orden en que los manda el Atajo (cronológico). Sirve para quitar la noche
 * anterior cuando Atajos la cuela en la búsqueda: sus primeros tramos suman exactamente lo que ya se guardó ayer.
 */
export function stageMinuteLists(p: any): Record<'deepMin' | 'remMin' | 'coreMin' | 'awakeMin', number[] | undefined> {
  const K = { deepMin: ['profundo', 'deep', 'profundo_min', 'deep_min'], remMin: ['rem', 'rem_min'], coreMin: ['basico', 'básico', 'core', 'basico_min', 'core_min'], awakeMin: ['despierto', 'depsierto', 'awake', 'despierto_min', 'awake_min'] } as const;
  const out: any = {};
  for (const [k, ks] of Object.entries(K)) {
    const v = pick(p, ...ks); if (v == null || typeof v !== 'string' || !v.includes(':')) { out[k] = undefined; continue; }
    out[k] = v.split(/\n/).map((x) => x.trim()).filter(Boolean).map((x) => durationsMin(x) ?? (Number(x) || 0) / 60);
  }
  return out;
}
/** Quita del principio de cada lista los tramos que suman lo guardado la noche anterior. Null si no encaja en todas las fases. */
export function stripPrevNight(lists: Record<string, number[] | undefined>, prev: Record<string, number | null | undefined>): Record<string, number> | null {
  const res: Record<string, number> = {}; let cut = false;
  for (const [k, arr] of Object.entries(lists)) {
    if (!arr) continue;
    const target = Number(prev[k] ?? 0); let acc = 0, i = 0;
    if (target > 0) { while (i < arr.length && acc < target - 0.3) acc += arr[i++]; if (Math.abs(acc - target) > 0.3) return null; cut = cut || i > 0; }
    res[k] = Math.round(arr.slice(i).reduce((a, b) => a + b, 0) * 10) / 10;
  }
  return cut ? res : null;
}

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
  // Forma recomendada: una sola búsqueda con fase, inicio y duración de cada tramo; Forja separa las noches
  const smp = stagesFromSamples(pick(p, 'fase', 'fases', 'value', 'valor', 'tipo'), pick(p, 'inicio', 'inicios', 'start', 'start_date'), pick(p, 'duracion', 'duración', 'duraciones', 'duration'));
  if (smp) Object.assign(withUnits, Object.fromEntries(Object.entries({ deepMin: smp.deepMin, remMin: smp.remMin, coreMin: smp.coreMin, awakeMin: smp.awakeMin }).filter(([, v]) => v != null)));
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
