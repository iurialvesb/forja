// Generado por scripts/build-web-engine.mjs desde engine/src/exercises.ts. No editar.
// Catálogo de ejercicios: alias (ES/EN/abreviaturas de pizarra), categoría, métrica y
// coeficientes de carga regional por unidad (rep, 10 m, caloría o km según `unit`).
// Los coeficientes son heurísticos y se calibran con los check-ins (ver docs/ARQUITECTURA.md §6.2).

                                             

                                                                                                                                     
                                                                   

                           
             
                                                                 
                             
                     
                    
                                                                           
                                                                              
                                                    
 

const E = (id        , name        , category                  , unit              , aliases          , coef            , extra                    = {})           =>
  ({ id, name, category, unit, aliases, coef, ...extra });

export const EXERCISES             = [
  // Halterofilia
  E('snatch', 'Snatch', 'weightlifting', 'rep', ['snatch', 'arrancada', 'squat snatch', 'sq snatch'], { quads: 1.2, posterior: 1.2, pull: 0.6, push: 0.4, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('power_snatch', 'Power Snatch', 'weightlifting', 'rep', ['power snatch', 'p snatch', 'ps'], { quads: 0.9, posterior: 1.1, pull: 0.6, push: 0.4, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('hang_snatch', 'Hang Snatch', 'weightlifting', 'rep', ['hang snatch', 'hang power snatch', 'hps'], { quads: 0.8, posterior: 1.0, pull: 0.6, push: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('clean', 'Clean', 'weightlifting', 'rep', ['clean', 'cargada'], { quads: 1.3, posterior: 1.3, pull: 0.6, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('squat_clean', 'Squat Clean', 'weightlifting', 'rep', ['squat clean', 'sq clean', 'full clean'], { quads: 1.4, posterior: 1.2, pull: 0.6, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('power_clean', 'Power Clean', 'weightlifting', 'rep', ['power clean', 'pc', 'p clean', 'cargada de potencia'], { quads: 0.9, posterior: 1.2, pull: 0.6, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('hang_clean', 'Hang Clean', 'weightlifting', 'rep', ['hang clean', 'hang power clean', 'hpc'], { quads: 0.8, posterior: 1.0, pull: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('clean_and_jerk', 'Clean & Jerk', 'weightlifting', 'rep', ['clean and jerk', 'clean & jerk', 'c&j', 'cnj', 'dos tiempos'], { quads: 1.5, posterior: 1.3, push: 0.8, pull: 0.6, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('jerk', 'Jerk', 'weightlifting', 'rep', ['jerk', 'split jerk', 'push jerk', 'envión'], { quads: 0.6, push: 1.0, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  // Fuerza
  E('back_squat', 'Back Squat', 'strength', 'rep', ['back squat', 'bs', 'sentadilla trasera', 'sentadilla'], { quads: 1.5, posterior: 1.0, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('front_squat', 'Front Squat', 'strength', 'rep', ['front squat', 'fs', 'sentadilla frontal'], { quads: 1.6, posterior: 0.7, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('overhead_squat', 'Overhead Squat', 'strength', 'rep', ['overhead squat', 'ohs'], { quads: 1.3, posterior: 0.6, push: 0.5, core: 0.7 }, { loadSensitive: true, prTracked: 'load' }),
  E('deadlift', 'Deadlift', 'strength', 'rep', ['deadlift', 'dead lift', 'dl', 'peso muerto', 'conventional deadlift'], { posterior: 1.8, quads: 0.6, grip: 0.8, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('goblet_squat', 'Goblet Squat', 'strength', 'rep', ['goblet squat', 'kb goblet squat', 'db goblet squat', 'heels elevated goblet squat', 'sentadilla goblet', 'sentadilla copa'], { quads: 1.0, posterior: 0.4, core: 0.3 }, { loadSensitive: true }),
  E('sumo_deadlift_high_pull', 'Sumo Deadlift High Pull', 'strength', 'rep', ['sumo deadlift high pull', 'sdhp'], { posterior: 0.8, pull: 0.6, quads: 0.3 }, { loadSensitive: true }),
  E('romanian_deadlift', 'Romanian Deadlift', 'strength', 'rep', ['rdl', 'romanian deadlift', 'peso muerto rumano'], { posterior: 1.5, grip: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('bench_press', 'Bench Press', 'strength', 'rep', ['bench press', 'bench', 'press banca', 'banca'], { push: 1.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('strict_press', 'Strict Press', 'strength', 'rep', ['strict press', 'shoulder press', 'press militar', 'press estricto', 'sp'], { push: 1.2, core: 0.3 }, { loadSensitive: true, prTracked: 'load' }),
  E('push_press', 'Push Press', 'strength', 'rep', ['push press', 'pp'], { push: 1.2, quads: 0.4, core: 0.3 }, { loadSensitive: true, prTracked: 'load' }),
  E('thruster', 'Thruster', 'strength', 'rep', ['thruster', 'thrusters'], { quads: 1.2, push: 1.0, metabolic: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('lunge', 'Lunges', 'strength', 'rep', ['lunge', 'lunges', 'zancadas', 'walking lunges', 'front rack lunges', 'db lunges'], { quads: 1.2, posterior: 1.0 }, { loadSensitive: true }),
  E('bulgarian_split_squat', 'Bulgarian Split Squat', 'strength', 'rep', ['bulgarian split squat', 'bss', 'sentadilla búlgara'], { quads: 1.3, posterior: 0.9 }, { loadSensitive: true }),
  E('step_up', 'Step-ups', 'strength', 'rep', ['step up', 'step ups', 'box step up'], { quads: 0.8, posterior: 0.5 }, { loadSensitive: true }),
  E('hip_thrust', 'Hip Thrust', 'strength', 'rep', ['hip thrust'], { posterior: 1.0 }, { loadSensitive: true, prTracked: 'load' }),
  E('row_barbell', 'Remo con barra', 'strength', 'rep', ['bent over row', 'barbell row', 'remo con barra', 'pendlay row'], { pull: 1.1, posterior: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('kb_swing', 'Kettlebell Swing', 'strength', 'rep', ['kb swing', 'kettlebell swing', 'kbs', 'american swing', 'russian swing'], { posterior: 0.6, grip: 0.3, metabolic: 0.3 }, { loadSensitive: true }),
  E('db_snatch', 'DB Snatch', 'weightlifting', 'rep', ['db snatch', 'dumbbell snatch'], { posterior: 0.6, quads: 0.4, push: 0.3, metabolic: 0.4 }, { loadSensitive: true }),
  E('devil_press', 'Devil Press', 'weightlifting', 'rep', ['devil press', 'devils press'], { posterior: 0.6, push: 0.5, quads: 0.4, metabolic: 0.8 }, { loadSensitive: true }),
  E('wall_ball', 'Wall Balls', 'strength', 'rep', ['wall ball', 'wall balls', 'wb', 'wall-ball', 'wallball'], { quads: 1.0, push: 0.5, metabolic: 0.6 }),
  // Gimnásticos
  E('pull_up', 'Pull-ups', 'gymnastics', 'rep', ['pull up', 'pull ups', 'pull-ups', 'dominadas', 'kipping pull ups', 'strict pull ups'], { pull: 1.0, grip: 0.5 }, { prTracked: 'reps' }),
  E('chest_to_bar', 'Chest to Bar', 'gymnastics', 'rep', ['chest to bar', 'c2b', 'ctb'], { pull: 1.1, grip: 0.5 }, { prTracked: 'reps' }),
  E('bar_muscle_up', 'Bar Muscle-up', 'gymnastics', 'rep', ['bar muscle up', 'bmu', 'bar mu'], { pull: 1.5, push: 0.8, grip: 0.6 }, { prTracked: 'reps' }),
  E('ring_muscle_up', 'Ring Muscle-up', 'gymnastics', 'rep', ['ring muscle up', 'rmu', 'muscle up', 'muscle ups', 'mu'], { pull: 1.6, push: 1.0, grip: 0.6 }, { prTracked: 'reps' }),
  E('toes_to_bar', 'Toes to Bar', 'gymnastics', 'rep', ['toes to bar', 't2b', 'ttb'], { core: 1.0, pull: 0.4, grip: 0.6 }, { prTracked: 'reps' }),
  E('hspu', 'Handstand Push-ups', 'gymnastics', 'rep', ['handstand push up', 'handstand push ups', 'hspu', 'strict hspu', 'kipping hspu'], { push: 1.4, core: 0.3 }, { prTracked: 'reps' }),
  E('handstand_walk', 'Handstand Walk', 'gymnastics', 'm10', ['handstand walk', 'hs walk', 'hsw'], { push: 0.8, core: 0.6 }, { prTracked: 'distance' }),
  E('double_under', 'Double Unders', 'gymnastics', 'rep', ['double under', 'double unders', 'du', 'dus', 'dobles'], { calves: 0.25, impact: 0.2, metabolic: 0.15 }, { prTracked: 'reps' }),
  E('single_under', 'Single Unders', 'gymnastics', 'rep', ['single unders', 'su', 'saltos de comba'], { calves: 0.12, impact: 0.1 }),
  E('push_up', 'Push-ups', 'gymnastics', 'rep', ['push up', 'push ups', 'flexiones', 'hr push ups'], { push: 0.5 }),
  E('ring_dip', 'Ring Dips', 'gymnastics', 'rep', ['ring dip', 'ring dips', 'dips', 'fondos'], { push: 0.9 }),
  E('pistol', 'Pistols', 'gymnastics', 'rep', ['pistol', 'pistols', 'pistol squat'], { quads: 1.0, posterior: 0.4 }),
  E('air_squat', 'Air Squats', 'gymnastics', 'rep', ['air squat', 'air squats', 'sentadillas al aire'], { quads: 0.35, posterior: 0.15 }),
  E('sit_up', 'Sit-ups', 'gymnastics', 'rep', ['sit up', 'sit ups', 'abmat sit ups', 'abdominales'], { core: 0.4 }),
  E('rope_climb', 'Rope Climb', 'gymnastics', 'rep', ['rope climb', 'rope climbs', 'trepa', 'legless rope climb'], { pull: 1.5, grip: 1.2 }, { prTracked: 'reps' }),
  // Pliometría
  E('box_jump', 'Box Jumps', 'plyometric', 'rep', ['box jump', 'box jumps', 'bj', 'box jump overs', 'bjo', 'saltos al cajón'], { quads: 0.8, calves: 0.7, posterior: 0.3, impact: 0.8 }),
  E('burpee', 'Burpees', 'plyometric', 'rep', ['burpee', 'burpees', 'bar facing burpees', 'burpee over bar', 'bob', 'bfb', 'lateral burpee over bar', 'burpee box jump over', 'bbjo'], { quads: 0.3, push: 0.3, impact: 0.4, metabolic: 0.8 }),
  E('broad_jump', 'Broad Jumps', 'plyometric', 'rep', ['broad jump', 'broad jumps'], { quads: 0.8, posterior: 0.5, impact: 0.9 }),
  // Monoestructurales (unidad por km o cal)
  E('run', 'Carrera', 'monostructural', 'km', ['run', 'running', 'carrera', 'correr', 'km run', 'm run'], { quads: 6, calves: 10, posterior: 4, impact: 10, metabolic: 10 }),
  E('row', 'Remo (ergómetro)', 'monostructural', 'cal', ['row', 'rowing', 'remo', 'cal row', 'concept2'], { posterior: 0.15, quads: 0.12, pull: 0.12, metabolic: 0.35 }),
  E('ski_erg', 'SkiErg', 'monostructural', 'cal', ['ski', 'ski erg', 'skierg', 'cal ski'], { pull: 0.2, core: 0.12, metabolic: 0.35 }),
  E('bike_erg', 'Bike (Assault/Echo/BikeErg)', 'monostructural', 'cal', ['bike', 'assault bike', 'echo bike', 'bike erg', 'cal bike', 'ab'], { quads: 0.18, metabolic: 0.4 }),
  // HYROX (unidad m10 = 10 metros)
  E('sled_push', 'Sled Push', 'hyrox', 'm10', ['sled push', 'empuje de trineo', 'trineo push'], { quads: 6, calves: 3, posterior: 2, metabolic: 3 }, { loadSensitive: true }),
  E('sled_pull', 'Sled Pull', 'hyrox', 'm10', ['sled pull', 'arrastre de trineo', 'trineo pull'], { pull: 4, posterior: 3, grip: 3, metabolic: 2.5 }, { loadSensitive: true }),
  E('burpee_broad_jump', 'Burpee Broad Jumps', 'hyrox', 'm10', ['burpee broad jump', 'burpee broad jumps', 'bbj'], { quads: 5, push: 2, impact: 4, metabolic: 4 }),
  E('farmers_carry', 'Farmers Carry', 'hyrox', 'm10', ['farmers carry', 'farmer carry', 'farmers walk', 'paseo del granjero'], { grip: 3, core: 1.5, posterior: 1 }, { loadSensitive: true }),
  E('sandbag_lunge', 'Sandbag Lunges', 'hyrox', 'm10', ['sandbag lunges', 'sandbag lunge', 'zancadas con saco'], { quads: 8, posterior: 6 }, { loadSensitive: true }),
  // Movilidad / accesorio
  E('plank', 'Plancha', 'accessory', 'second', ['plank', 'plancha'], { core: 0.02 }),
  E('wall_walk', 'Wall Walks', 'gymnastics', 'rep', ['wall walk', 'wall walks'], { push: 0.9, core: 0.5 }),
  E('shuttle_run', 'Shuttle Run', 'monostructural', 'm10', ['shuttle run', 'shuttle'], { quads: 0.12, calves: 0.12, impact: 0.12, metabolic: 0.15 }),
  E('ghd_sit_up', 'GHD Sit-ups', 'accessory', 'rep', ['ghd', 'ghd sit up', 'ghd sit ups'], { core: 0.9 }),
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id        )                       {
  return byId.get(id);
}

export function normalizeName(s        )         {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const aliasIndex                     = EXERCISES.flatMap((e) =>
  [e.name, ...e.aliases].map((a) => [normalizeName(a), e.id]                    ));
// Alias más largos primero para que "power clean" gane a "clean".
aliasIndex.sort((a, b) => b[0].length - a[0].length);

const deplural = (w        , suffix            ) => (w.length > 3 && w.endsWith(suffix) && !w.endsWith('ss') ? w.slice(0, -suffix.length) : w);

/** Resuelve un nombre libre (pizarra, captura, texto de Strava) a un ejercicio del catálogo. Tolera plurales. */
export function resolveExercise(raw        )                                                         {
  const n = normalizeName(raw).replace(/^\d+\s*(x\s*)?/, '').trim();
  if (!n) return null;
  const variants = [...new Set([n, n.split(' ').map((w) => deplural(w, 's')).join(' '), n.split(' ').map((w) => deplural(w, 'es')).join(' ')])];
  for (const v of variants) for (const [alias, id] of aliasIndex) if (alias === v) return { id, confidence: 'exact' };
  for (const [alias, id] of aliasIndex) {
    if (alias.length < 3) continue;
    const re = new RegExp(`(^|\\s)${alias.replace(/[&]/g, '\\&')}(\\s|$)`);
    if (variants.some((v) => re.test(v))) return { id, confidence: 'partial' };
  }
  return null;
}
