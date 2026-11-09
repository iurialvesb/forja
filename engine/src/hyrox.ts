// HYROX: estaciones oficiales por categoría, hoja de registro de una simulación (8 × 1 km + 8 estaciones, con tiempo
// parcial de cada tramo), reparto orientativo de un tiempo objetivo y comparativa de tus mejores parciales.

export type HyroxDivision = 'open_men' | 'open_women' | 'pro_men' | 'pro_women' | 'doubles_men' | 'doubles_women' | 'doubles_mixed';

export interface HyroxStation { key: string; exerciseId: string; name: string; unit: 'm' | 'reps'; amount: number; loadText?: string }

const LOADS: Record<string, Record<string, string | undefined>> = {
  sled_push: { open_men: '152 kg', open_women: '102 kg', pro_men: '202 kg', pro_women: '152 kg' },
  sled_pull: { open_men: '103 kg', open_women: '78 kg', pro_men: '153 kg', pro_women: '103 kg' },
  farmers_carry: { open_men: '2 × 24 kg', open_women: '2 × 16 kg', pro_men: '2 × 32 kg', pro_women: '2 × 24 kg' },
  sandbag_lunge: { open_men: '20 kg', open_women: '10 kg', pro_men: '30 kg', pro_women: '20 kg' },
  wall_balls: { open_men: '6 kg', open_women: '4 kg', pro_men: '9 kg', pro_women: '6 kg' },
};
const base = (d: HyroxDivision) => (d.startsWith('doubles_') ? (d === 'doubles_women' ? 'open_women' : 'open_men') : d);

/** Las 8 estaciones en orden oficial, con la carga de tu categoría. */
export function hyroxStations(division: HyroxDivision = 'open_men'): HyroxStation[] {
  const b = base(division);
  return [
    { key: 'ski', exerciseId: 'ski_erg', name: 'SkiErg', unit: 'm', amount: 1000 },
    { key: 'push', exerciseId: 'sled_push', name: 'Sled Push', unit: 'm', amount: 50, loadText: LOADS.sled_push[b] },
    { key: 'pull', exerciseId: 'sled_pull', name: 'Sled Pull', unit: 'm', amount: 50, loadText: LOADS.sled_pull[b] },
    { key: 'bbj', exerciseId: 'burpee_broad_jump', name: 'Burpee Broad Jumps', unit: 'm', amount: 80 },
    { key: 'row', exerciseId: 'row', name: 'Remo (ergómetro)', unit: 'm', amount: 1000 },
    { key: 'farmers', exerciseId: 'farmers_carry', name: 'Farmers Carry', unit: 'm', amount: 200, loadText: LOADS.farmers_carry[b] },
    { key: 'lunges', exerciseId: 'sandbag_lunge', name: 'Sandbag Lunges', unit: 'm', amount: 100, loadText: LOADS.sandbag_lunge[b] },
    { key: 'wb', exerciseId: 'wall_ball', name: 'Wall Balls', unit: 'reps', amount: 100, loadText: LOADS.wall_balls[b] },
  ];
}

/** Peso orientativo de cada tramo en el tiempo total (atleta Open de nivel medio, ~1:15–1:25). Suma 1. */
const SHARE: Record<string, number> = { run: 0.49 / 8, ski: 0.061, push: 0.045, pull: 0.058, bbj: 0.058, row: 0.062, farmers: 0.026, lunges: 0.058, wb: 0.07, roxzone: 0.071 };

export interface HyroxTarget { key: string; name: string; seconds: number }
/** Reparte un tiempo objetivo en parciales: 8 carreras, 8 estaciones y Roxzone (transiciones). */
export function hyroxSplits(targetS: number, division: HyroxDivision = 'open_men'): HyroxTarget[] {
  const out: HyroxTarget[] = [];
  const st = hyroxStations(division);
  for (let i = 0; i < 8; i++) {
    out.push({ key: `run${i + 1}`, name: `Carrera ${i + 1}`, seconds: Math.round(targetS * SHARE.run) });
    out.push({ key: st[i].key, name: st[i].name, seconds: Math.round(targetS * SHARE[st[i].key]) });
  }
  out.push({ key: 'roxzone', name: 'Roxzone (transiciones)', seconds: Math.round(targetS * SHARE.roxzone) });
  return out;
}

/** Ritmo de carrera por km que implica el objetivo. */
export const hyroxRunPace = (targetS: number) => Math.round(targetS * SHARE.run);

export interface HyroxSplitRecord { date: string; sessionId: string; key: string; exerciseId: string; label: string; splitS: number }
export interface HyroxStationSummary { key: string; name: string; target?: number; best?: { s: number; date: string }; last?: { s: number; date: string }; history: { date: string; s: number }[] }

/** Clave de tramo a partir de una serie guardada (ejercicio + etiqueta del grupo). */
export function hyroxKeyOf(exerciseId: string, label?: string | null): string | null {
  if (exerciseId === 'run') { const n = Number(label?.match(/(\d+)/)?.[1]); return n >= 1 && n <= 8 ? `run${n}` : 'run'; }
  const st = hyroxStations().find((s) => s.exerciseId === exerciseId);
  return st?.key ?? null;
}

/** Comparativa por estación: mejor y último parcial, frente al objetivo. Las carreras se resumen como «Carrera (media)». */
export function hyroxCompare(records: HyroxSplitRecord[], targetS?: number, division: HyroxDivision = 'open_men'): HyroxStationSummary[] {
  const targets = targetS ? hyroxSplits(targetS, division) : [];
  const rows: HyroxStationSummary[] = [];
  // Carrera: media de los km de cada simulación.
  const runBy = new Map<string, number[]>();
  for (const r of records) if (r.key.startsWith('run')) { const k = `${r.date}|${r.sessionId}`; runBy.set(k, [...(runBy.get(k) ?? []), r.splitS]); }
  const runHist = [...runBy.entries()].map(([k, v]) => ({ date: k.split('|')[0], s: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((a, b) => a.date.localeCompare(b.date));
  rows.push(summary('run', 'Carrera (media por km)', runHist, targetS ? Math.round(targetS * SHARE.run) : undefined));
  for (const st of hyroxStations(division)) {
    const hist = records.filter((r) => r.key === st.key).map((r) => ({ date: r.date, s: r.splitS })).sort((a, b) => a.date.localeCompare(b.date));
    rows.push(summary(st.key, st.name, hist, targets.find((t) => t.key === st.key)?.seconds));
  }
  return rows;
}
function summary(key: string, name: string, history: { date: string; s: number }[], target?: number): HyroxStationSummary {
  const best = history.reduce<{ s: number; date: string } | undefined>((a, h) => (!a || h.s < a.s ? { s: h.s, date: h.date } : a), undefined);
  const last = history.length ? history[history.length - 1] : undefined;
  return { key, name, target, best, last, history };
}
