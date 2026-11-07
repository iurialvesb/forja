// Generado por scripts/build-web-engine.mjs desde engine/src/photo.ts. No editar.
// Validación y normalización de lo que devuelve el modelo de visión al leer una pizarra o captura.
// Principio: nunca inventar. Todo dato ambiguo se convierte en una pregunta para el usuario.

                                                                                                      
import { resolveExercise } from './exercises.js';

                             
              
                   
                
                                                            
                  
                                                                          
                     
                    
                     
                 
 

                                
                  
                       
                 
                      
                  
                         
                       
                 
                      
                 
 

                                
                                                                                                    
                 
                
                            
                                                                                                                                                                                       
                                                                           
 

                                                                                                                  

const sumScheme = (s        ) => s.split(/[-/,·\s]+/).map(Number).filter((n) => !Number.isNaN(n) && n > 0);

export function collectQuestions(p               , profile                             )             {
  const q             = p.uncertainties.map((u, i) => ({ id: `u${i}:${u.field}`, question: u.question, options: u.options, kind: u.options ? 'choice' : 'text' }));
  p.sections.forEach((sec, si) => {
    sec.items.forEach((it, ii) => {
      const id = `s${si}i${ii}`;
      if (!resolveExercise(it.exercise)) q.push({ id: `${id}:exercise`, question: `No reconozco "${it.raw}". ¿Qué ejercicio es?`, kind: 'text' });
      if (it.loadText && it.loadKg == null) {
        if (/\d+\s*\/\s*\d+/.test(it.loadText)) {
          const [a, b] = it.loadText.match(/\d+(\.\d+)?/g) .map(Number);
          const suggested = profile.sex === 'female' ? b : profile.sex === 'male' ? a : undefined;
          q.push({ id: `${id}:loadKg`, question: `${it.exercise}: la pizarra pone ${it.loadText}. ¿Qué peso usaste (kg)?`, options: suggested ? [String(suggested), 'Otro'] : [String(a), String(b), 'Otro'], kind: 'number' });
        } else if (/%/.test(it.loadText)) {
          q.push({ id: `${id}:loadKg`, question: `${it.exercise} al ${it.loadText}: ¿qué peso usaste (kg)?`, kind: 'number' });
        } else q.push({ id: `${id}:loadKg`, question: `${it.exercise} ("${it.loadText}"): ¿con cuánto peso lo hiciste?`, kind: 'number' });
      }
    });
    if (sec.kind === 'wod') {
      if (sec.format === 'for_time') q.push({ id: `s${si}:resultTimeS`, question: `${sec.title ?? 'WOD'} (For Time): ¿en cuánto tiempo lo terminaste? (mm:ss, o "cap" si no acabaste)`, kind: 'text' });
      if (sec.format === 'amrap') q.push({ id: `s${si}:result`, question: `${sec.title ?? 'AMRAP'}: ¿cuántas rondas y repeticiones hiciste? (p. ej. "7+12")`, kind: 'text' });
    }
  });
  if (p.sourceKind === 'whiteboard') q.push({ id: 'rpe', question: '¿Qué esfuerzo te supuso la sesión completa (RPE 1-10)?', kind: 'number' });
  return q;
}

function parseTime(s        )                     {
  const m = s.trim().match(/^(\d+):(\d{1,2})$/); if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Convierte la lectura + las respuestas del usuario en una sesión registrable. */
export function toSession(p               , answers                        , base                                                       )          {
  const blocks                 = p.sections.map((sec, si) => {
    const sets             = [];
    let multiplier = sec.rounds;
    sec.items.forEach((it, ii) => {
      const id = `s${si}i${ii}`;
      const exName = answers[`${id}:exercise`] ?? it.exercise;
      const ex = resolveExercise(exName);
      const loadAns = answers[`${id}:loadKg`];
      const loadKg = loadAns && !Number.isNaN(Number(loadAns)) ? Number(loadAns) : it.loadKg;
      let reps = it.reps;
      if (it.repScheme) {
        const parts = sumScheme(it.repScheme);
        if (sec.kind === 'strength' || sec.format === 'sets') {
          for (const r of parts) sets.push({ exerciseId: ex?.id ?? `custom:${exName}`, reps: r, loadKg });
          return;
        }
        reps = parts.reduce((a, b) => a + b, 0);
        multiplier = 1;
      }
      const n = sec.kind === 'strength' && sec.rounds && reps ? sec.rounds : 1;
      for (let k = 0; k < n; k++) sets.push({ exerciseId: ex?.id ?? `custom:${exName}`, reps, loadKg, distanceM: it.distanceM, calories: it.calories, durationS: it.durationS });
      if (n > 1) multiplier = undefined;
    });
    if (sec.format === 'emom' && sec.durationMin && sec.emomIntervalS && !sec.rounds) {
      multiplier = Math.round((sec.durationMin * 60) / sec.emomIntervalS / Math.max(1, sec.items.length));
    }
    const block               = { kind: sec.kind, format: sec.format, rounds: multiplier, timeCapS: sec.timeCapMin ? sec.timeCapMin * 60 : undefined, sets };
    const t = answers[`s${si}:resultTimeS`]; if (t) { block.resultText = t; block.resultTimeS = parseTime(t); }
    const r = answers[`s${si}:result`];
    if (r) {
      const m = r.match(/(\d+)\s*\+\s*(\d+)/) ?? r.match(/(\d+)/);
      block.resultText = r; if (m) { block.resultRounds = Number(m[1]); block.resultReps = m[2] ? Number(m[2]) : 0; block.rounds = undefined; }
    }
    return block;
  });
  const hasRun = p.metrics?.distanceKm && (p.metrics.discipline ?? 'running') === 'running';
  const durationS = base.durationS ?? p.metrics?.durationS ??
    Math.max(1800, p.sections.reduce((a, s) => a + (s.timeCapMin ?? s.durationMin ?? 10) * 60, 0));
  return {
    id: base.id, startedAt: base.startedAt, durationS,
    discipline: p.metrics?.discipline ?? (hasRun ? 'running' : p.sourceKind === 'whiteboard' ? 'crossfit' : 'other'),
    title: p.title, rpe: answers.rpe ? Number(answers.rpe) : undefined,
    avgHr: p.metrics?.avgHr, maxHr: p.metrics?.maxHr,
    distanceM: p.metrics?.distanceKm ? p.metrics.distanceKm * 1000 : undefined,
    elevationGainM: p.metrics?.elevationGainM,
    blocks: blocks.some((b) => b.sets.length) ? blocks : undefined,
    source: 'photo',
  };
}
