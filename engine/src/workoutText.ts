// Intérprete determinista de entrenamientos de CrossFit escritos en texto (descripción del entreno, notas, WhatsApp del box).
// Entiende bloques (calentamiento, fuerza, WOD…), formatos (EMOM/E2MOM, AMRAP, For Time, rondas, Tabata, series),
// esquemas de repeticiones, cargas (kg, lb, %, "43/29"), calorías, distancias, descansos y erratas habituales.
// No usa IA: funciona sin conexión y sin consentimiento. Lo que no entiende lo convierte en preguntas.

import type { ParsedWorkout, ParsedSection, ParsedItem } from './photo.ts';
import type { BlockKind, BlockFormat } from './types.ts';
import { resolveExercise, normalizeName, getExercise } from './exercises.ts';

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const KIND_LABEL: Record<BlockKind, string> = { warmup: 'Calentamiento', strength: 'Fuerza', skill: 'Técnica', wod: 'WOD', accessory: 'Accesorios', cooldown: 'Vuelta a la calma', run: 'Carrera', station: 'Estación' };

const HEADERS: [string, BlockKind][] = [
  ['warm up', 'warmup'], ['warmup', 'warmup'], ['calentamiento', 'warmup'], ['activacion', 'warmup'], ['movilidad', 'warmup'],
  ['fuerza', 'strength'], ['strength', 'strength'], ['halterofilia', 'strength'], ['weightlifting', 'strength'], ['heavy', 'strength'],
  ['skill', 'skill'], ['tecnica', 'skill'], ['gimnasticos', 'skill'], ['gymnastics', 'skill'],
  ['wod', 'wod'], ['metcon', 'wod'], ['conditioning', 'wod'], ['workout', 'wod'], ['partner wod', 'wod'], ['team wod', 'wod'],
  ['accesorios', 'accessory'], ['accessory', 'accessory'], ['core', 'accessory'], ['finisher', 'accessory'], ['cash out', 'accessory'], ['buy in', 'wod'],
  ['cool down', 'cooldown'], ['vuelta a la calma', 'cooldown'], ['estiramientos', 'cooldown'],
];

function headerKind(line: string): BlockKind | null {
  const n = normalizeName(line).replace(/[:\-–]+$/, '').replace(/^(parte|part|bloque)\s+[a-z0-9]+\s*/, '').trim();
  if (!n || n.length > 24) return null;
  for (const [h, k] of HEADERS) if (n === h || n.startsWith(h + ' ')) return k;
  for (const [h, k] of HEADERS) if (h.length >= 4 && Math.abs(n.length - h.length) <= 2 && lev(n, h) <= (h.length >= 6 ? 2 : 1)) return k;   // "FERZA" → fuerza
  if (/^[a-z]\)?$/.test(n)) return null;
  return null;
}

interface Fmt { format: BlockFormat; durationMin?: number; intervalS?: number; rounds?: number; timeCapMin?: number; setsReps?: { sets: number; reps: number }; scheme?: string }

/** Detecta una línea de formato: "EMOM 24' (4R)", "E2MOM 12", "AMRAP 15 min", "5 RFT", "FOR TIME (TC 12')", "5x5", "TABATA". */
export function parseFormat(line: string): Fmt | null {
  const t = line.toUpperCase().replace(/[’´`]/g, "'").replace(/MINUTOS?|MINS?|MIN\b/g, "'");
  let m: RegExpMatchArray | null;
  const cap = t.match(/(?:TC|CAP|TIME ?CAP)\s*:?\s*(\d+)/);
  const rr = t.match(/\(\s*(\d+)\s*(?:R|RONDAS?|ROUNDS?|SETS?|VUELTAS?)\s*\)|[X×]\s*(\d+)\s*(?:R|RONDAS?|ROUNDS?)\b/);
  const roundsParen = rr ? Number(rr[1] ?? rr[2]) : undefined;
  if ((m = t.match(/\bE(\d+)?\s*MOM\s*(?:X\s*)?(\d+)?\s*'?/))) {
    const every = m[1] ? Number(m[1]) : 1;
    return { format: 'emom', intervalS: every * 60, durationMin: m[2] ? Number(m[2]) : undefined, rounds: roundsParen };
  }
  if ((m = t.match(/\bEVERY\s*(\d+)(?::(\d+))?\s*'?\s*(?:X|FOR)?\s*(\d+)?/)) || (m = t.match(/\bCADA\s*(\d+)(?::(\d+))?\s*'?\s*(?:X|DURANTE)?\s*(\d+)?/))) {
    const iv = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
    return { format: 'emom', intervalS: iv, durationMin: m[3] && Number(m[3]) > 6 ? Number(m[3]) : undefined, rounds: m[3] && Number(m[3]) <= 6 ? Number(m[3]) : roundsParen };
  }
  if ((m = t.match(/\bAMRAP\s*(\d+)?/))) return { format: 'amrap', durationMin: m[1] ? Number(m[1]) : undefined, timeCapMin: m[1] ? Number(m[1]) : undefined };
  if (/\bTABATA\b/.test(t)) return { format: 'tabata', durationMin: 4, rounds: 8 };
  if ((m = t.match(/\b(\d+)\s*(?:RFT|RONDAS?\s+(?:POR|FOR)\s+TIEMPO|ROUNDS?\s+FOR\s+TIME)\b/))) return { format: 'for_time', rounds: Number(m[1]), timeCapMin: cap ? Number(cap[1]) : undefined };
  if ((m = t.match(/^(\d+(?:\s*-\s*\d+){1,})\s*(?:FOR TIME|POR TIEMPO|REPS)?/)) && /FOR TIME|POR TIEMPO/.test(t)) return { format: 'for_time', scheme: m[1].replace(/\s/g, ''), timeCapMin: cap ? Number(cap[1]) : undefined };
  if (/\b(FOR TIME|POR TIEMPO|CHIPPER)\b/.test(t)) return { format: /CHIPPER/.test(t) ? 'chipper' : 'for_time', timeCapMin: cap ? Number(cap[1]) : undefined, rounds: roundsParen };
  if ((m = t.match(/\b(\d+)\s*(?:RONDAS?|ROUNDS?|VUELTAS?)\b/))) return { format: 'rounds', rounds: Number(m[1]) };
  if ((m = t.match(/^\s*(\d+)\s*[X×]\s*(\d+)\s*$/))) return { format: 'sets', setsReps: { sets: Number(m[1]), reps: Number(m[2]) } };
  return null;
}

const REST_RE = /^(rest|descanso|descansa|recupera|recovery|off)\b/i;

/** Extrae cargas de cualquier parte de la línea: "@ 50 kg", "50kg", "16KG", "43/29", "@75%", "2x22.5kg", "135 lb". */
function extractLoad(s: string): { rest: string; loadKg?: number; loadText?: string } {
  let rest = s; let loadKg: number | undefined; let loadText: string | undefined;
  const dual = rest.match(/@?\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(kg|lb|lbs)?\b/i);
  if (dual) { loadText = dual[0].replace('@', '').trim(); rest = rest.replace(dual[0], ' '); return { rest, loadKg, loadText }; }
  const pct = rest.match(/@?\s*(\d+(?:[.,]\d+)?(?:\s*-\s*\d+)?)\s*%/);
  if (pct) { loadText = pct[0].replace('@', '').trim(); rest = rest.replace(pct[0], ' '); return { rest, loadText }; }
  const pair = rest.match(/(\d)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|lb|lbs)\b/i);         // 2x22,5 kg (mancuernas)
  if (pair) { const per = Number(pair[2].replace(',', '.')); loadKg = (pair[3].toLowerCase().startsWith('lb') ? per * 0.4536 : per) * Number(pair[1]); rest = rest.replace(pair[0], ' '); return { rest, loadKg: Math.round(loadKg * 10) / 10, loadText: pair[0] }; }
  const one = rest.match(/@?\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|lb|lbs)\b/i);
  if (one) { const v = Number(one[1].replace(',', '.')); loadKg = one[2].toLowerCase().startsWith('lb') ? Math.round(v * 0.4536 * 10) / 10 : v; rest = rest.replace(one[0], ' '); return { rest, loadKg }; }
  const at = rest.match(/@\s*(\d+(?:[.,]\d+)?)\b/);                                       // "@ 50" sin unidad → kg (box español)
  if (at) { loadKg = Number(at[1].replace(',', '.')); rest = rest.replace(at[0], ' '); return { rest, loadKg, loadText: `${at[1]} (sin unidad)` }; }
  if (/\b(rx|heavy|pesado|moderado|ligero|light)\b/i.test(rest)) loadText = rest.match(/\b(rx|heavy|pesado|moderado|ligero|light)\b/i)![0];
  return { rest, loadKg, loadText };
}

/** Una línea de ejercicio: "16 CAL ROW", "20 DEAD LIFT 50kg", "400m run", "21-15-9 thrusters 43/29", "Max HSPU", "1' plank". */
export function parseItem(raw: string): ParsedItem | null {
  const line = raw.replace(/^[\s\-–•*·>]+/, '').replace(/^[a-z]\)\s*/i, '').trim();
  if (!line) return null;
  const l = extractLoad(line);
  let s = l.rest.replace(/\s+/g, ' ').trim();
  const item: ParsedItem = { raw: line, exercise: '' };
  if (l.loadKg != null) item.loadKg = l.loadKg;
  if (l.loadText && l.loadKg == null) item.loadText = l.loadText;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+(?:\s*-\s*\d+)+)\s+/))) { item.repScheme = m[1].replace(/\s/g, ''); s = s.slice(m[0].length); }
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*(cal|cals|calorias|kcal)\b\s*/i))) { item.calories = Number(m[1].replace(',', '.')); s = s.slice(m[0].length); }
  else if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*(km|m|mts|metros|meters)\b\s*/i))) { const v = Number(m[1].replace(',', '.')); item.distanceM = /km/i.test(m[2]) ? v * 1000 : v; s = s.slice(m[0].length); }
  else if ((m = s.match(/^(\d+)\s*(?:'|’|min)\s*/i))) { item.durationS = Number(m[1]) * 60; s = s.slice(m[0].length); }
  else if ((m = s.match(/^(\d+)\s*(?:"|”|s|seg|sec)\b\s*/i))) { item.durationS = Number(m[1]); s = s.slice(m[0].length); }
  else if ((m = s.match(/^(\d+)\s*(?:x\s*)?(?:reps?)?\s*/i)) && m[1]) { item.reps = Number(m[1]); s = s.slice(m[0].length); }
  else if ((m = s.match(/^(max|maximo|máximo)\s+/i))) { item.notes = 'máximas repeticiones'; s = s.slice(m[0].length); }
  // Calorías o metros escritos al final: "row 500m", "bike 15 cal"
  if (item.calories == null && (m = s.match(/\s(\d+(?:[.,]\d+)?)\s*(cal|cals)\b/i))) { item.calories = Number(m[1].replace(',', '.')); s = s.replace(m[0], ' '); }
  if (item.distanceM == null && (m = s.match(/\s(\d+(?:[.,]\d+)?)\s*(km|m)\b/i))) { const v = Number(m[1].replace(',', '.')); item.distanceM = /km/i.test(m[2]) ? v * 1000 : v; s = s.replace(m[0], ' '); }
  // Esquema o series escritos al final: "back squat 5-5-3-3-1", "deadlift 5x5"
  if (!item.repScheme && (m = s.match(/\s(\d+(?:\s*-\s*\d+)+)\s*$/))) { item.repScheme = m[1].replace(/\s/g, ''); item.reps = undefined; s = s.slice(0, m.index); }
  else if (!item.repScheme && (m = s.match(/\s(\d+)\s*[x×]\s*(\d+)\s*$/i))) { item.repScheme = Array(Number(m[1])).fill(m[2]).join('-'); item.reps = undefined; s = s.slice(0, m.index); }
  s = s.replace(/\s+/g, ' ').replace(/[.:;,]+$/, '').trim();
  const variants: string[] = [];
  if (/heels? (on|elevated)|talones (en|elevados)/i.test(s)) variants.push('talones elevados');
  if (/\bstrict\b|\bestrict[oa]s?\b/i.test(s)) variants.push('estricto');
  if (/\bkipping\b/i.test(s)) variants.push('kipping');
  if (/\b(db|dumbbells?|mancuernas?)\b/i.test(s)) variants.push('mancuerna');
  if (/\b(kb|kettlebells?)\b/i.test(s)) variants.push('kettlebell');
  if (/\bpause|pausa\b/i.test(s)) variants.push('con pausa');
  if (/over (the )?bar|sobre (la )?barra|facing/i.test(s)) variants.push('sobre la barra');
  if (variants.length) item.notes = [item.notes, variants.join(', ')].filter(Boolean).join('; ');
  item.exercise = s;
  return item;
}

const isNoise = (l: string) => /^(afternoon|morning|evening|lunch|night)\s+(workout|run|ride|weight training)$/i.test(l.trim()) || /^(entreno|entrenamiento)\s+de\s+(mañana|tarde|noche)$/i.test(l.trim());

/** Interpreta el texto completo. Devuelve la misma estructura que la lectura de fotos (para reutilizar preguntas y registro). */
export function parseWorkoutText(text: string): ParsedWorkout & { unparsed: string[] } {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out: ParsedWorkout & { unparsed: string[] } = { sourceKind: 'whiteboard', sections: [], uncertainties: [], unparsed: [] };
  let cur: (ParsedSection & { rests: number; fmt?: Fmt }) | null = null;
  const close = () => {
    if (!cur) return;
    finalize(cur, out);
    if (cur.items.length || cur.rests) out.sections.push(stripInternal(cur));
    cur = null;
  };
  lines.forEach((line, idx) => {
    if (idx === 0 && (isNoise(line) || (!headerKind(line) && !parseFormat(line) && !/\d/.test(line) && !resolveExercise(line)))) { out.title = line; return; }
    const hk = headerKind(line.split(/[:\-–]/)[0]);
    const fmtLine = parseFormat(line);
    if (hk) {
      close();
      cur = { kind: hk, items: [], rests: 0, title: KIND_LABEL[hk] };
      const tail = line.slice(line.split(/[:\-–]/)[0].length);
      const tf = parseFormat(tail); if (tf) cur.fmt = tf;
      return;
    }
    if (fmtLine && !/^[\-–•*·]/.test(line) && !(fmtLine.format === 'sets' && cur?.fmt)) {
      if (!cur || cur.fmt || cur.items.length) { const kind: BlockKind = cur?.kind ?? (fmtLine.format === 'sets' ? 'strength' : 'wod'); close(); cur = { kind, items: [], rests: 0 }; }
      cur!.fmt = fmtLine; cur!.title = cur!.title ?? line;
      // Formato y ejercicio en la misma línea: "5x5 back squat @80kg", "21-15-9 thrusters 43/29"
      const sameLine = line.replace(/^\s*\d+\s*[x×]\s*\d+\s*/i, '').trim();
      if (fmtLine.format === 'sets' && sameLine && sameLine !== line.trim()) { const it = parseItem(sameLine); if (it?.exercise) cur!.items.push(it); }
      return;
    }
    const setsLine = line.match(/^(\d+)\s*[x×]\s*(\d+)\s+(.+)$/i);
    if (setsLine && !/cal|m\b/i.test(setsLine[2])) {
      if (!cur) cur = { kind: 'strength', items: [], rests: 0 };
      const it = parseItem(setsLine[3]);
      if (it) { it.reps = Number(setsLine[2]); it.repScheme = Array(Number(setsLine[1])).fill(setsLine[2]).join('-'); cur.items.push(it); if (!cur.fmt) cur.fmt = { format: 'sets' }; }
      return;
    }
    const clean = line.replace(/^[\s\-–•*·>]+/, '').trim();
    if (REST_RE.test(clean)) { if (!cur) cur = { kind: 'wod', items: [], rests: 0 }; cur.rests++; return; }
    const it = parseItem(line);
    if (!it || !it.exercise) { out.unparsed.push(line); return; }
    if (!cur) cur = { kind: 'wod', items: [], rests: 0 };
    cur.items.push(it);
  });
  close();
  for (const s of out.sections) for (const it of s.items) if (!resolveExercise(it.exercise)) out.uncertainties.push({ field: `ejercicio:${it.raw}`, question: `No reconozco "${it.raw}". ¿Qué ejercicio es?` });
  for (const u of out.unparsed) out.uncertainties.push({ field: `linea:${u}`, question: `No entiendo la línea "${u}". ¿Qué significa?` });
  return out;
}

function finalize(sec: ParsedSection & { rests: number; fmt?: Fmt }, out: ParsedWorkout) {
  const f = sec.fmt;
  if (!f) { if (sec.kind === 'strength' && sec.items.some((i) => i.repScheme)) sec.format = 'sets'; return; }
  sec.format = f.format;
  if (f.timeCapMin) sec.timeCapMin = f.timeCapMin;
  if (f.format === 'emom') {
    sec.emomIntervalS = f.intervalS ?? 60;
    const slots = sec.items.length + sec.rests;                       // cada línea (incluidos descansos) ocupa un intervalo
    const totalIntervals = f.durationMin ? Math.round((f.durationMin * 60) / sec.emomIntervalS) : undefined;
    sec.durationMin = f.durationMin ?? (f.rounds && slots ? (f.rounds * slots * sec.emomIntervalS) / 60 : undefined);
    if (f.rounds) sec.rounds = f.rounds;
    else if (totalIntervals && slots) sec.rounds = Math.floor(totalIntervals / slots);
    if (f.rounds && totalIntervals && slots && f.rounds * slots !== totalIntervals) {
      out.uncertainties.push({ field: `emom:${sec.title}`, question: `${sec.title}: ${f.durationMin}' con ${slots} estaciones no da ${f.rounds} rondas exactas. ¿Cuántas rondas hiciste?` });
    }
    if (!sec.rounds) out.uncertainties.push({ field: `emom:${sec.title}`, question: `¿Cuánto duró el EMOM de ${sec.title ?? 'este bloque'} (minutos)?` });
    if (sec.rests) sec.notes = `${sec.rests} minuto(s) de descanso por ronda`;
  } else if (f.format === 'amrap') {
    sec.durationMin = f.durationMin;
  } else if (f.format === 'tabata') {
    sec.rounds = 8; sec.durationMin = 4 * Math.max(1, sec.items.length);
  } else if (f.format === 'for_time' || f.format === 'rounds' || f.format === 'chipper') {
    if (f.rounds) sec.rounds = f.rounds;
    if (f.scheme) for (const it of sec.items) if (!it.repScheme && it.reps == null && it.calories == null && it.distanceM == null) it.repScheme = f.scheme;
  } else if (f.format === 'sets' && f.setsReps) {
    for (const it of sec.items) if (!it.repScheme) { it.repScheme = Array(f.setsReps.sets).fill(String(f.setsReps.reps)).join('-'); it.reps = undefined; }
  }
  if (sec.kind === 'wod' && !sec.format) sec.format = 'for_time';
}

function stripInternal(s: ParsedSection & { rests: number; fmt?: Fmt }): ParsedSection {
  const { rests: _r, fmt: _f, ...rest } = s;
  void _r; void _f;
  return rest;
}

/** Volumen resultante (para mostrar al usuario lo que se ha entendido antes de guardar). */
export function describeParsed(p: ParsedWorkout): string[] {
  return p.sections.map((s) => {
    const mult = s.rounds ?? 1;
    const fmt = s.format === 'emom' ? `EMOM ${s.durationMin ?? '?'}' (${mult} rondas${s.emomIntervalS && s.emomIntervalS !== 60 ? `, cada ${s.emomIntervalS / 60}'` : ''})` : s.format === 'amrap' ? `AMRAP ${s.durationMin ?? '?'}'` : s.format === 'for_time' ? `For Time${s.rounds ? ` ${s.rounds} rondas` : ''}${s.timeCapMin ? ` (cap ${s.timeCapMin}')` : ''}` : s.format ?? '';
    const items = s.items.map((i) => {
      const total = i.repScheme ? i.repScheme.split('-').map(Number).reduce((a, b) => a + b, 0) : (i.reps ?? 0) * (s.format === 'emom' || s.format === 'rounds' || s.rounds ? mult : 1);
      const qty = i.calories != null ? `${i.calories * mult} cal` : i.distanceM != null ? `${i.distanceM * mult} m` : total ? `${total} reps` : i.durationS ? `${(i.durationS * mult) / 60}'` : '';
      const ex = resolveExercise(i.exercise); const nm = ex ? getExercise(ex.id)!.name : i.exercise;
      return `${nm}${i.notes ? ` (${i.notes})` : ''}${qty ? ` · ${qty}` : ''}${i.loadKg != null ? ` @ ${i.loadKg} kg` : i.loadText ? ` (${i.loadText})` : ''}`;
    });
    return `${s.title ?? KIND_LABEL[s.kind]} — ${fmt}: ${items.join('; ')}`;
  });
}
