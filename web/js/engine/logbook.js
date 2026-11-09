// Generado por scripts/build-web-engine.mjs desde engine/src/logbook.ts. No editar.
// Registro desglosado de un entreno de CrossFit: convierte la lectura (texto o foto) en una hoja de registro con una
// fila por serie, ronda o minuto, donde el atleta marca lo que hizo de verdad (reps y peso realizados frente a los prescritos).
// Determinista y sin dependencias: se usa igual en el navegador (registro instantáneo) y en el servidor.

                                                                           
                                                                                                      
import { resolveExercise, getExercise } from './exercises.js';
import { hyroxStations,                    } from './hyrox.js';

                                                 
                                                                   
                                                                 

                         
             
                                                                                                   
                
                                                                   
                    
                     
                                                          
                                                      
                  
                    
                                                                                          
                 
                                                                    
 
                                                                       
                                                                                                                                                                                                   
                           
             
                
                  
                       
                
                           
                  
                       
                     
                    
                                           
                                                                                
                     
                                  
                                                                                              
                 
                                                                                            
 
                           
             
                 
                                              
                                               
                       
               
                                
                                   
                      
                    
                     
                     
 

let seq = 0;
const nid = (p        ) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

const KIND_TITLE                            = { warmup: 'Calentamiento', strength: 'Fuerza', skill: 'Técnica', wod: 'WOD', accessory: 'Accesorios', cooldown: 'Vuelta a la calma', run: 'Carrera', station: 'Estación' };

export function partOf(kind           , items               = [])          {
  if (kind === 'strength' || kind === 'skill') return 'strength';
  if (kind === 'wod' || kind === 'accessory' || kind === 'station') return 'wod';
  if (kind === 'run') return 'endurance';
  if (items.length && items.every((i) => i.distanceM != null || i.durationS != null) && kind !== 'warmup' && kind !== 'cooldown') return 'endurance';
  return 'other';
}

/** Nombre de catálogo si se reconoce; si no, el texto tal cual. */
export function displayName(raw        )         {
  const r = resolveExercise(raw);
  return r ? getExercise(r.id) .name : raw;
}

const schemeOf = (s         ) => (s ? s.split(/[-/,·\s]+/).map(Number).filter((n) => n > 0) : []);

function rowFromItem(it            )                 {
  const unit          = it.calories != null ? 'cal' : it.distanceM != null ? 'm' : it.durationS != null && it.reps == null ? 's' : 'reps';
  const target = unit === 'cal' ? it.calories : unit === 'm' ? it.distanceM : unit === 's' ? it.durationS : it.reps;
  const pct = it.loadText?.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return {
    exercise: displayName(it.exercise), unit, target,
    targetKg: it.loadKg, targetPct: pct ? Number(pct[1].replace(',', '.')) : undefined,
    targetText: it.loadText && !pct ? it.loadText : undefined, notes: it.notes,
    scheme: schemeOf(it.repScheme).length > 1 ? schemeOf(it.repScheme) : undefined,
  };
}

export function rowFromTemplate(t                , overrideTarget         )         {
  const target = overrideTarget ?? t.target;
  return { id: nid('r'), exercise: t.exercise, unit: t.unit, target, targetKg: t.targetKg, targetPct: t.targetPct, targetText: t.targetText, rest: t.rest, notes: t.notes,
    done: t.rest ? undefined : target, doneKg: t.targetKg, status: t.rest ? 'done' : 'pending' };
}

/** Construye la hoja de registro de un bloque. */
export function buildBlock(sec                                    )           {
  const tpl = sec.items.map(rowFromItem);
  const part = partOf(sec.kind, sec.items);
  const b           = {
    id: nid('b'), part, kind: sec.kind, format: sec.format, title: sec.title ?? KIND_TITLE[sec.kind], scaling: 'rx',
    rounds: sec.rounds, durationMin: sec.durationMin, intervalS: sec.emomIntervalS, timeCapS: sec.timeCapMin ? sec.timeCapMin * 60 : undefined,
    template: tpl, groups: [], addable: null, result: {}, notes: sec.notes,
  };
  // Descansos de EMOM ("- REST" en la pizarra): el motor de texto los cuenta en notes ("N minuto(s) de descanso por ronda").
  const restN = Number(sec.notes?.match(/(\d+) minuto\(s\) de descanso/)?.[1] ?? 0);
  if (sec.format === 'emom') {
    for (let k = 0; k < restN; k++) b.template.push({ exercise: 'Descanso', unit: 's', target: sec.emomIntervalS ?? 60, rest: true });
    b.notes = undefined;
  }
  regroup(b);
  return b;
}

/** (Re)genera las filas a partir de la plantilla y el formato. Se usa al construir y al editar la estructura. */
export function regroup(b          ) {
  const t = b.template;
  const iv = b.intervalS ?? 60;
  b.groups = []; b.addable = null;
  if (!t.length) return b;
  const schemes = t.map((x) => x.scheme ?? []);
  if (b.format === 'emom') {
    const slots = t.length;
    const rounds = b.durationMin ? Math.max(1, Math.floor((b.durationMin * 60) / iv / slots)) : b.rounds ?? 1;   // la duración manda
    b.rounds = rounds;
    let minute = 0;
    for (let r = 0; r < rounds; r++) for (const row of t) {
      const a = minute + 1, z = minute + iv / 60;
      b.groups.push({ id: nid('g'), label: `${z > a ? `Min ${a}–${z}` : `Min ${a}`} · R${r + 1}`, rows: [rowFromTemplate(row)] });
      minute += iv / 60;
    }
    return b;
  }
  if (b.format === 'amrap') {
    const n = Math.max(1, b.groups.length || 1);
    for (let r = 0; r < n; r++) b.groups.push({ id: nid('g'), label: `Ronda ${r + 1}`, rows: t.map((x) => rowFromTemplate(x)) });
    b.addable = 'round';
    return b;
  }
  // Fuerza por series: cada ejercicio con su esquema 5-5-3-3-1 → una fila por serie.
  const strengthLike = b.part === 'strength' && (b.format === 'sets' || !b.format || schemes.some((s) => s.length > 1));
  if (strengthLike) {
    const nSets = Math.max(1, ...schemes.map((s) => s.length), b.rounds ?? 1);
    for (let k = 0; k < nSets; k++) {
      const rows = t.map((x, i) => (schemes[i]?.length ? (k < schemes[i].length ? rowFromTemplate(x, schemes[i][k]) : null) : rowFromTemplate(x))).filter((r)              => !!r);
      b.groups.push({ id: nid('g'), label: `Serie ${k + 1}`, rows });
    }
    b.addable = 'set';
    return b;
  }
  // 21-15-9 For Time: un grupo por escalón.
  const common = schemes.find((s) => s.length > 1);
  if (common) {
    b.scheme = common;
    common.forEach((reps, k) => {
      const rows = t.map((x, i) => rowFromTemplate(x, schemes[i]?.length ? schemes[i][k] ?? x.target : x.target));
      b.groups.push({ id: nid('g'), label: `${reps} reps`, rows });
    });
    return b;
  }
  if (b.format === 'tabata') {
    for (let r = 0; r < 8; r++) b.groups.push({ id: nid('g'), label: `Intervalo ${r + 1}`, rows: t.map((x) => ({ ...rowFromTemplate(x), done: undefined })) });
    return b;
  }
  const rounds = b.rounds && b.rounds > 1 ? b.rounds : 1;
  for (let r = 0; r < rounds; r++) b.groups.push({ id: nid('g'), label: rounds > 1 ? `Ronda ${r + 1}` : 'Trabajo', rows: t.map((x) => rowFromTemplate(x)) });
  return b;
}

/** Añade una ronda (AMRAP) o una serie (fuerza) copiando la última. */
export function addGroup(b          )           {
  const last = b.groups[b.groups.length - 1];
  const rows = last ? last.rows.map((r) => ({ ...r, id: nid('r'), status: r.rest ? 'done'          : 'pending'         , done: r.rest ? undefined : r.target })) : b.template.map((x) => rowFromTemplate(x));
  const g           = { id: nid('g'), label: `${b.addable === 'set' ? 'Serie' : 'Ronda'} ${b.groups.length + 1}`, rows };
  b.groups.push(g);
  return g;
}

/** Estado de una fila según lo realizado frente a lo prescrito. */
export function statusFor(r        )            {
  if (r.rest) return 'done';
  if (r.status === 'pending' || r.status === 'skipped') return r.status;
  if (r.done == null || r.done === 0) return r.status === 'done' ? 'skipped' : r.status;
  if (r.target != null && r.done < r.target) return 'partial';
  return 'done';
}

/** Resultado del AMRAP calculado de las casillas: rondas completas + repeticiones de la ronda incompleta. */
export function amrapResult(b          )                                   {
  let rounds = 0, reps = 0;
  for (const g of b.groups) {
    const work = g.rows.filter((r) => !r.rest);
    const full = work.length > 0 && work.every((r) => r.status === 'done');
    if (full) { rounds++; continue; }
    reps += work.filter((r) => r.status === 'done' || r.status === 'partial').reduce((a, r) => a + (r.unit === 'reps' || r.unit === 'cal' ? r.done ?? 0 : 0), 0);
  }
  return { rounds, reps };
}

export const fmtClock = (s         ) => (s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
export function parseClock(s        )                     {
  const t = s.trim();
  let m = t.match(/^(\d+):(\d{1,2}):(\d{1,2})$/); if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = t.match(/^(\d+):(\d{1,2})$/); if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:'|min)?$/); if (m) return Math.round(Number(m[1].replace(',', '.')) * 60);
  return undefined;
}

/** Lectura (texto o IA) → borrador de registro. */
export function buildLog(p               , base                                                                                      )           {
  return {
    id: nid('d'), title: p.title, date: base.date, origin: base.origin, sourceText: base.sourceText, importId: base.importId,
    blocks: p.sections.filter((s) => s.items.length).map(buildBlock),
    durationMin: Math.max(30, Math.round(p.sections.reduce((a, s) => a + (s.timeCapMin ?? s.durationMin ?? 8), 0) + 10)),
  };
}

/** Borrador vacío para registro manual. */
export function emptyLog(date        )           {
  return { id: nid('d'), date, origin: 'manual', blocks: [], durationMin: 60 };
}

export function newBlock(part         )           {
  const kind            = part === 'strength' ? 'strength' : part === 'endurance' ? 'run' : part === 'wod' ? 'wod' : 'warmup';
  const format                          = part === 'strength' ? 'sets' : part === 'wod' ? 'for_time' : undefined;
  const b           = { id: nid('b'), part, kind, format, title: KIND_TITLE[kind], scaling: 'rx', template: [], groups: [], addable: null, result: {} };
  return b;
}

/** Simulación HYROX: 8 × (1 km de carrera + estación), cada tramo con su tiempo parcial. `stations` = cuántas (media sim = 4). */
export function hyroxBlock(division                = 'open_men', stations = 8, runM = 1000)           {
  const st = hyroxStations(division).slice(0, Math.max(1, Math.min(8, stations)));
  const b           = { id: nid('b'), part: 'wod', kind: 'station', format: 'for_time', title: stations >= 8 ? 'Simulación HYROX' : `HYROX ${stations} estaciones`, scaling: 'rx',
    template: [], groups: [], addable: null, result: {}, hyrox: division };
  st.forEach((s, i) => {
    const run         = { id: nid('r'), exercise: 'Carrera', unit: 'm', target: runM, done: runM, status: 'pending' };
    const sta         = { id: nid('r'), exercise: s.name, unit: s.unit, target: s.amount, done: s.amount, targetText: s.loadText, status: 'pending' };
    b.groups.push({ id: nid('g'), label: `Carrera ${i + 1}`, rows: [run] }, { id: nid('g'), label: `Estación ${i + 1} · ${s.name}`, rows: [sta] });
    b.template.push({ exercise: 'Carrera', unit: 'm', target: runM }, { exercise: s.name, unit: s.unit, target: s.amount, targetText: s.loadText });
  });
  return b;
}
/** Suma de parciales de un bloque HYROX (sin Roxzone si no la apuntas). */
export const hyroxTotal = (b          ) => b.groups.reduce((a, g) => a + g.rows.reduce((x, r) => x + (r.splitS ?? 0), 0), 0);

const DISC_BY_PART                              = { strength: 'crossfit', wod: 'crossfit', endurance: 'crossfit', other: 'crossfit' };

/** Borrador → sesión registrable. Lo realizado va en reps/peso; lo prescrito, en los campos target*. */
export function logToSession(d          , base                                                                                )          {
  const blocks                 = d.blocks.map((b) => {
    const sets             = [];
    b.groups.forEach((g, gi) => g.rows.forEach((r) => {
      if (r.rest) return;
      const st = statusFor(r);
      const status                     = st === 'pending' ? 'skipped' : st;
      const ex = resolveExercise(r.exercise);
      const done = status === 'skipped' ? undefined : r.done;
      const set           = {
        exerciseId: ex?.id ?? `custom:${r.exercise}`,
        loadKg: status === 'skipped' ? undefined : r.doneKg,
        roundNo: gi + 1, label: g.label, unit: r.unit, targetReps: r.target, targetLoadKg: r.targetKg, targetPct: r.targetPct, targetText: r.targetText,
        status, origin: d.origin === 'manual' ? 'manual' : d.origin, splitS: r.splitS,
      };
      if (r.unit === 'reps') set.reps = done; else if (r.unit === 'cal') set.calories = done; else if (r.unit === 'm') set.distanceM = done; else set.durationS = done;
      sets.push(set);
    }));
    const blk               = {
      kind: b.kind, format: b.format, rounds: b.format === 'amrap' ? undefined : b.rounds, timeCapS: b.timeCapS, sets,
      part: b.part, scaling: b.scaling, title: b.title, durationMin: b.durationMin, intervalS: b.intervalS, capped: !!b.result.capped,
      prescribed: b, notes: b.notes,
    };
    if (b.hyrox && b.result.timeS == null && hyroxTotal(b) > 0) b.result.timeS = hyroxTotal(b);
    if (b.format === 'amrap') {
      const r = amrapResult(b);
      blk.resultRounds = r.rounds; blk.resultReps = r.reps; blk.resultText = `${r.rounds} rondas + ${r.reps} reps`;
    } else if (b.result.timeS != null || b.result.capped) {
      blk.resultTimeS = b.result.capped ? undefined : b.result.timeS;
      blk.resultText = b.result.capped ? `Time cap${b.result.reps ? ` (${b.result.reps} reps)` : ''}` : fmtClock(b.result.timeS);
      if (b.result.capped && b.result.reps) blk.resultReps = b.result.reps;
    }
    if (b.result.text && !blk.resultText) blk.resultText = b.result.text;
    return blk;
  });
  return {
    id: base.id, startedAt: base.startedAt, durationS: base.durationS ?? (d.durationMin ?? 60) * 60,
    discipline: base.discipline ?? (d.blocks.some((b) => b.hyrox) ? 'hyrox' : DISC_BY_PART[d.blocks[0]?.part ?? 'wod']), title: d.title, rpe: d.rpe,
    blocks: blocks.some((b) => b.sets.length) ? blocks : undefined,
    source: d.origin === 'ai' ? 'photo' : 'manual',
  };
}

/** Reabre una sesión guardada para editarla (usa la plantilla guardada y vuelca lo realizado). */
export function logFromSaved(session                                                                                    , blocks                            )                  {
  const bs = blocks.map((b) => b.prescribed                        ).filter((b)                => !!b && Array.isArray(b.groups));
  if (!bs.length) return null;
  return { id: nid('d'), title: session.title, date: session.startedAt.slice(0, 10), durationMin: Math.round(session.durationS / 60), rpe: session.rpe, linkSessionId: session.id, origin: 'manual', blocks: structuredClone(bs) };
}

/** Resumen corto de lo registrado (para el aviso final y la vista previa). */
export function summarizeLog(d          )           {
  return d.blocks.map((b) => {
    const rows = b.groups.flatMap((g) => g.rows.filter((r) => !r.rest));
    const done = rows.filter((r) => statusFor(r) === 'done').length;
    const res = b.format === 'amrap' ? (() => { const r = amrapResult(b); return ` · ${r.rounds}+${r.reps}`; })() : b.result.capped ? ' · cap' : b.result.timeS ? ` · ${fmtClock(b.result.timeS)}` : '';
    return `${b.title}${b.scaling === 'scaled' ? ' (Scaled)' : ''}: ${done}/${rows.length} hechas${res}`;
  });
}
