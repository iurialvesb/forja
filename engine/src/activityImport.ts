// Conversión de una actividad de Intervals.icu (llegada desde el Apple Watch vía HealthFit) a una sesión de Forja:
// datos generales, splits por km, vueltas, segundos por zona de FC y series temporales reducidas para las gráficas.
// Puro y determinista (sin red): la función del servidor descarga los datos y llama aquí.

import type { Session, Discipline } from './types.ts';
import { hrZones } from './running.ts';

export interface IcuStream { type: string; data: (number | null)[]; data2?: (number | null)[] }
export interface ImportedSplit { kmIndex: number; durationS: number; avgHr?: number; cadence?: number; elevationDeltaM?: number }
export interface ImportedLap { idx: number; kind?: string; startS: number; durationS: number; movingS?: number; distanceM?: number; avgHr?: number; maxHr?: number; avgSpeed?: number; avgCadence?: number; avgPower?: number; elevGain?: number; elevLoss?: number }
export interface ImportedSeries { t: number[]; hr?: (number | null)[]; pace?: (number | null)[]; alt?: (number | null)[]; cad?: (number | null)[]; w?: (number | null)[]; d?: (number | null)[] }
export interface ImportedActivity {
  session: Session & { activeKcal?: number; strideM?: number; notes?: string; splits?: ImportedSplit[] };
  extras: { movingS?: number; avgSpeed?: number; maxSpeed?: number; avgPower?: number; device?: string };
  laps: ImportedLap[];
  series: ImportedSeries | null;
  route: [number, number][] | null;
  zones: { method: string; bounds: [number, number][]; seconds: number[] } | null;
}

const TYPE_MAP: Record<string, Discipline> = {
  Run: 'running', TrailRun: 'running', VirtualRun: 'running', Treadmill: 'running',
  Ride: 'cycling', VirtualRide: 'cycling', GravelRide: 'cycling', MountainBikeRide: 'cycling', EBikeRide: 'cycling',
  Swim: 'swimming', OpenWaterSwim: 'swimming',
  Walk: 'walking', Hike: 'hiking',
  WeightTraining: 'crossfit', Crossfit: 'crossfit', HighIntensityIntervalTraining: 'crossfit', Workout: 'crossfit', CrossTraining: 'crossfit',
  Rowing: 'other', Elliptical: 'other', StairStepper: 'other',
  Yoga: 'yoga', Pilates: 'mobility', Dance: 'dance', Tennis: 'tennis', Padel: 'padel', Pickleball: 'padel',
  AlpineSki: 'skiing', NordicSki: 'skiing', BackcountrySki: 'skiing', Snowboard: 'skiing',
};
export function disciplineFromIcu(type?: string): Discipline {
  if (!type) return 'other';
  return TYPE_MAP[type] ?? (/run/i.test(type) ? 'running' : /ride|bike|cycl/i.test(type) ? 'cycling' : /swim/i.test(type) ? 'swimming' : 'other');
}

/** Los nombres genéricos de Apple ("Cross Training", "Entrenamiento funcional"…) pasan a "CrossFit". */
export function titleFor(d: Discipline, name?: string): string | undefined {
  if (d === 'crossfit' && (!name || /cross ?training|functional|funcional|hiit|high intensity|intervalos de alta|strength training|entrenamiento|workout|fuerza|weight/i.test(name))) return 'CrossFit';
  return name ?? undefined;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const round = (v: number | undefined, d = 0) => (v == null ? undefined : Math.round(v * 10 ** d) / 10 ** d);

/** "2026-11-07T18:05:12" (hora local de Madrid, sin zona) → ISO UTC. */
export function madridLocalToUtc(local: string): string {
  const guess = new Date(`${local.slice(0, 19)}Z`);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
  const asMadrid = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(guess.getTime() - (asMadrid - guess.getTime())).toISOString();
}

function stream(streams: IcuStream[], ...types: string[]): IcuStream | undefined {
  return streams.find((s) => types.includes(s.type) && Array.isArray(s.data) && s.data.some((x) => x != null));
}

function mean(xs: (number | null | undefined)[]): number | undefined {
  let s = 0, n = 0; for (const x of xs) if (x != null && Number.isFinite(x)) { s += x; n++; }
  return n ? s / n : undefined;
}

/** Splits por kilómetro a partir de las series de tiempo y distancia. */
export function kmSplits(t: number[], dist: (number | null)[], hr?: (number | null)[], cad?: (number | null)[], alt?: (number | null)[]): ImportedSplit[] {
  const out: ImportedSplit[] = [];
  let km = 1, startI = 0, startT = t[0] ?? 0, prevD = 0, prevT = startT;
  for (let i = 0; i < t.length; i++) {
    const d = dist[i]; if (d == null) continue;
    while (d >= km * 1000) {
      const frac = d > prevD ? (km * 1000 - prevD) / (d - prevD) : 0;        // interpolación dentro del intervalo
      const at = prevT + (t[i] - prevT) * frac;
      const sl = (xs?: (number | null)[]) => xs?.slice(startI, i + 1);
      const a0 = alt?.[startI], a1 = alt?.[i];
      out.push({ kmIndex: km, durationS: Math.round((at - startT) * 10) / 10, avgHr: round(mean(sl(hr) ?? [])), cadence: round(mean(sl(cad) ?? []), 1), elevationDeltaM: a0 != null && a1 != null ? round(a1 - a0, 1) : undefined });
      km++; startI = i; startT = at;
    }
    prevD = d; prevT = t[i];
  }
  return out;
}

/** Segundos en cada zona de FC (con las zonas del atleta). */
export function zoneSeconds(t: number[], hr: (number | null)[], bounds: [number, number][]): number[] {
  const secs = bounds.map(() => 0);
  for (let i = 1; i < t.length; i++) {
    const h = hr[i]; if (h == null) continue;
    const dt = Math.min(t[i] - t[i - 1], 10);                             // pausas: no cuentan
    let z = bounds.findIndex(([, hi]) => h < hi); if (z < 0) z = bounds.length - 1;
    if (h < bounds[0][0]) z = 0;
    secs[z] += dt;
  }
  return secs.map((s) => Math.round(s));
}

/** Reduce una serie a como mucho n puntos (media por tramo) para guardarla y dibujarla. */
function downsample(t: number[], cols: Record<string, (number | null)[] | undefined>, n = 600): ImportedSeries {
  const step = Math.max(1, Math.ceil(t.length / n));
  const out: ImportedSeries = { t: [] };
  for (const k of Object.keys(cols)) if (cols[k]) (out as any)[k] = [];
  for (let i = 0; i < t.length; i += step) {
    out.t.push(Math.round(t[i]));
    for (const [k, xs] of Object.entries(cols)) if (xs) (out as any)[k].push(round(mean(xs.slice(i, i + step)), k === 'pace' ? 0 : 1) ?? null);
  }
  return out;
}

export function icuToActivity(act: any, streams: IcuStream[], profile: { hrRest?: number; hrMax?: number; lthr?: number } = {}): ImportedActivity {
  const discipline = disciplineFromIcu(act.type);
  const startedAt = act.start_date ? new Date(act.start_date).toISOString() : madridLocalToUtc(act.start_date_local);
  const durationS = num(act.elapsed_time) ?? num(act.moving_time) ?? 0;
  const tS = stream(streams, 'time');
  const t = (tS?.data ?? []).map((x, i) => (x == null ? i : x)) as number[];
  const hr = stream(streams, 'heartrate', 'heart_rate')?.data;
  const dist = stream(streams, 'distance')?.data;
  const vel = stream(streams, 'velocity_smooth', 'velocity')?.data;
  const alt = stream(streams, 'fixed_altitude', 'altitude')?.data;
  const w = stream(streams, 'watts', 'power')?.data;
  let cad = stream(streams, 'cadence')?.data;
  // Los archivos FIT guardan la cadencia de carrera por pierna: si parece la mitad, se duplica (pasos por minuto).
  const avgCadRaw = num(act.average_cadence) ?? mean(cad ?? []);
  const doubleCad = discipline === 'running' && avgCadRaw != null && avgCadRaw < 120;
  if (doubleCad && cad) cad = cad.map((x) => (x == null ? null : x * 2));
  const ll = stream(streams, 'latlng');
  const route: [number, number][] | null = ll && ll.data2 ? (() => {
    const pts: [number, number][] = [];
    const step = Math.max(1, Math.ceil(ll.data.length / 500));
    for (let i = 0; i < ll.data.length; i += step) { const a = ll.data[i], b = ll.data2![i]; if (a != null && b != null && (a !== 0 || b !== 0)) pts.push([round(a, 5)!, round(b, 5)!]); }
    return pts.length > 1 ? pts : null;
  })() : null;

  const z = hrZones(profile);
  let zones: ImportedActivity['zones'] = null;
  if (z && hr && t.length > 1) zones = { method: z.method, bounds: z.zones as [number, number][], seconds: zoneSeconds(t, hr, z.zones as [number, number][]) };
  else if (Array.isArray(act.icu_hr_zone_times) && act.icu_hr_zone_times.length) {
    const s = act.icu_hr_zone_times.map((x: any) => (typeof x === 'number' ? x : x?.secs ?? 0));
    const five = s.length > 5 ? [...s.slice(0, 4), s.slice(4).reduce((a: number, b: number) => a + b, 0)] : s;
    zones = { method: 'intervals', bounds: [], seconds: five };
  }

  const splits = discipline === 'running' || discipline === 'walking' || discipline === 'hiking' ? (dist && t.length ? kmSplits(t, dist, hr, cad, alt) : []) : [];
  const pace = vel ? vel.map((v) => (v != null && v > 0.5 ? 1000 / v : null)) : undefined;
  const series = t.length > 1 ? downsample(t, { hr, pace: discipline === 'running' || discipline === 'walking' || discipline === 'hiking' ? pace : undefined, alt, cad, w, d: dist }) : null;

  const rawLaps: any[] = Array.isArray(act.icu_intervals) && act.icu_intervals.length ? act.icu_intervals : Array.isArray(act.laps) ? act.laps : [];
  const laps: ImportedLap[] = rawLaps.map((l, i) => {
    const startS = num(l.start_time) ?? (l.start_index != null && t[l.start_index] != null ? t[l.start_index] : 0);
    const endS = num(l.end_time) ?? (l.end_index != null && t[l.end_index] != null ? t[l.end_index] : undefined);
    return {
      idx: i, kind: l.type ?? undefined, startS: Math.round(startS ?? 0),
      durationS: Math.round(num(l.elapsed_time) ?? (endS != null ? endS - startS : num(l.moving_time) ?? 0)),
      movingS: round(num(l.moving_time)), distanceM: round(num(l.distance), 1), avgHr: round(num(l.average_heartrate)), maxHr: round(num(l.max_heartrate)),
      avgSpeed: round(num(l.average_speed), 3), avgCadence: round(num(l.average_cadence) != null && doubleCad ? num(l.average_cadence)! * 2 : num(l.average_cadence), 1),
      avgPower: round(num(l.average_watts) ?? num(l.icu_average_watts)), elevGain: round(num(l.total_elevation_gain), 1), elevLoss: round(num(l.total_elevation_loss), 1),
    };
  }).filter((l) => l.durationS > 0);

  const cadence = avgCadRaw != null ? round(doubleCad ? avgCadRaw * 2 : avgCadRaw, 1) : undefined;
  const session: ImportedActivity['session'] = {
    id: `icu-${act.id}`, startedAt, durationS: Math.round(durationS), discipline, title: titleFor(discipline, act.name),
    avgHr: round(num(act.average_heartrate) ?? mean(hr ?? [])), maxHr: round(num(act.max_heartrate) ?? (hr ? Math.max(...(hr.filter((x) => x != null) as number[])) : undefined)),
    hrZoneSeconds: zones?.seconds.length === 5 ? zones.seconds : undefined,
    distanceM: round(num(act.distance), 1) || undefined, elevationGainM: round(num(act.total_elevation_gain), 1), elevationLossM: round(num(act.total_elevation_loss), 1),
    cadenceSpm: discipline === 'running' ? cadence : undefined, isRace: !!act.race,
    activeKcal: num(act.calories), strideM: round(num(act.average_stride), 2),
    source: 'healthkit', externalId: `icu:${act.id}`, splits,
  };
  return {
    session,
    extras: { movingS: round(num(act.moving_time)), avgSpeed: round(num(act.average_speed), 3), maxSpeed: round(num(act.max_speed), 3), avgPower: round(num(act.icu_average_watts) ?? num(act.average_watts)), device: act.device_name ?? undefined },
    laps, series, route, zones,
  };
}

/** Wellness de Intervals.icu → datos diarios de Forja (solo lo que viene relleno). */
export interface DailyWellness { date: string; hrvMs?: number; hrvMethod?: 'sdnn' | 'rmssd'; rhr?: number; sleepH?: number; steps?: number; weightKg?: number; avgSleepingHr?: number;
  sleepScore?: number; sleepQuality?: number; spo2?: number; respiration?: number; bodyFat?: number; vo2max?: number; kcalConsumed?: number; extras: Record<string, unknown> }
/** Día de salud de Intervals.icu (lo que HealthFit sube del Apple Watch) → fila de daily_health. Lo que no tiene columna va a extras. */
export function icuWellnessToDaily(w: any): DailyWellness {
  const sdnn = num(w.hrvSDNN), rmssd = num(w.hrv);
  const KNOWN = new Set(['id', 'hrv', 'hrvSDNN', 'restingHR', 'sleepSecs', 'steps', 'weight', 'avgSleepingHR', 'sleepScore', 'sleepQuality', 'spO2', 'respiration', 'bodyFat', 'vo2max', 'kcalConsumed', 'updated', 'ctl', 'atl', 'rampRate', 'ctlLoad', 'atlLoad', 'sportInfo']);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w ?? {})) if (!KNOWN.has(k) && v != null && v !== '' && typeof v !== 'object') extras[k] = v;
  return {
    date: String(w.id).slice(0, 10),
    // Apple Watch mide SDNN: si viene, se usa ese (coherente con el Atajo); si no, RMSSD.
    hrvMs: sdnn ?? rmssd, hrvMethod: sdnn != null ? 'sdnn' : rmssd != null ? 'rmssd' : undefined,
    rhr: round(num(w.restingHR)), sleepH: num(w.sleepSecs) != null ? round(num(w.sleepSecs)! / 3600, 2) : undefined,
    steps: round(num(w.steps)), weightKg: num(w.weight), avgSleepingHr: round(num(w.avgSleepingHR)),
    sleepScore: round(num(w.sleepScore)), sleepQuality: round(num(w.sleepQuality)), spo2: round(num(w.spO2), 1), respiration: round(num(w.respiration), 1),
    bodyFat: round(num(w.bodyFat), 1), vo2max: round(num(w.vo2max), 1), kcalConsumed: round(num(w.kcalConsumed)), extras,
  };
}
