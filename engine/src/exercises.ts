// Catálogo de ejercicios: alias (ES/EN/abreviaturas de pizarra), categoría, métrica y
// coeficientes de carga regional por unidad (rep, 10 m, caloría o km según `unit`).
// Los coeficientes son heurísticos y se calibran con los check-ins (ver docs/ARQUITECTURA.md §6.2).

import type { RegionLoad } from './types.ts';

export type ExerciseCategory = 'weightlifting' | 'strength' | 'gymnastics' | 'monostructural' | 'hyrox' | 'accessory' | 'plyometric';
export type ExerciseUnit = 'rep' | 'm10' | 'cal' | 'km' | 'second';

export interface Exercise {
  id: string;
  name: string;                       // nombre canónico mostrado
  category: ExerciseCategory;
  unit: ExerciseUnit;
  aliases: string[];
  coef: RegionLoad;                   // carga por unidad, sin peso externo
  loadSensitive?: boolean;            // la carga externa multiplica la fatiga
  prTracked?: 'load' | 'reps' | 'time' | 'distance';
}

const E = (id: string, name: string, category: ExerciseCategory, unit: ExerciseUnit, aliases: string[], coef: RegionLoad, extra: Partial<Exercise> = {}): Exercise =>
  ({ id, name, category, unit, aliases, coef, ...extra });

export const EXERCISES: Exercise[] = [
  // Halterofilia
  E('snatch', 'Snatch', 'weightlifting', 'rep', ['snatch', 'arrancada', 'squat snatch', 'sq snatch'], { quads: 1.2, posterior: 1.2, pull: 0.6, push: 0.4, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('power_snatch', 'Power Snatch', 'weightlifting', 'rep', ['power snatch', 'p snatch', 'ps'], { quads: 0.9, posterior: 1.1, pull: 0.6, push: 0.4, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('hang_snatch', 'Hang Snatch', 'weightlifting', 'rep', ['hang snatch', 'hang snatches'], { quads: 0.8, posterior: 1.0, pull: 0.6, push: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('clean', 'Clean', 'weightlifting', 'rep', ['clean', 'cargada'], { quads: 1.3, posterior: 1.3, pull: 0.6, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('squat_clean', 'Squat Clean', 'weightlifting', 'rep', ['squat clean', 'sq clean', 'full clean'], { quads: 1.4, posterior: 1.2, pull: 0.6, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('power_clean', 'Power Clean', 'weightlifting', 'rep', ['power clean', 'pc', 'p clean', 'cargada de potencia'], { quads: 0.9, posterior: 1.2, pull: 0.6, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('hang_clean', 'Hang Clean', 'weightlifting', 'rep', ['hang clean', 'hang cleans', 'cargada colgada'], { quads: 0.8, posterior: 1.0, pull: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('clean_and_jerk', 'Clean & Jerk', 'weightlifting', 'rep', ['clean and jerk', 'clean & jerk', 'c&j', 'cnj', 'dos tiempos'], { quads: 1.5, posterior: 1.3, push: 0.8, pull: 0.6, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('jerk', 'Jerk', 'weightlifting', 'rep', ['jerk', 'jerks', 'envión'], { quads: 0.6, push: 1.0, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('push_jerk', 'Push Jerk', 'weightlifting', 'rep', ['push jerk', 'push jerks', 'pj', 'jerk de empuje'], { quads: 0.6, push: 1.0, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('split_jerk', 'Split Jerk', 'weightlifting', 'rep', ['split jerk', 'split jerks', 'sj', 'jerk en tijera', 'jerk tijera', 'envion en tijera'], { quads: 0.7, posterior: 0.3, push: 1.0, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('power_jerk', 'Power Jerk', 'weightlifting', 'rep', ['power jerk', 'power jerks'], { quads: 0.6, push: 1.0, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('squat_jerk', 'Squat Jerk', 'weightlifting', 'rep', ['squat jerk', 'squat jerks'], { quads: 0.9, push: 1.0, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('behind_neck_jerk', 'Behind the Neck Jerk', 'weightlifting', 'rep', ['behind the neck jerk', 'behind neck jerk', 'btn jerk', 'jerk tras nuca'], { quads: 0.6, push: 1.0, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('shoulder_to_overhead', 'Shoulder to Overhead', 'weightlifting', 'rep', ['shoulder to overhead', 's2oh', 'stoh', 'sto', 'hombro a arriba', 'hombros arriba'], { quads: 0.5, push: 1.0, core: 0.4 }, { loadSensitive: true }),
  E('ground_to_overhead', 'Ground to Overhead', 'weightlifting', 'rep', ['ground to overhead', 'g2oh', 'gtoh', 'suelo a arriba', 'suelo arriba'], { quads: 1.0, posterior: 1.0, push: 0.6, pull: 0.4, core: 0.5 }, { loadSensitive: true }),
  E('clean_and_press', 'Clean & Press', 'weightlifting', 'rep', ['clean and press', 'clean & press', 'cargada y press'], { quads: 0.9, posterior: 1.0, push: 0.9, pull: 0.5 }, { loadSensitive: true }),
  E('hang_squat_clean', 'Hang Squat Clean', 'weightlifting', 'rep', ['hang squat clean', 'hang squat cleans', 'hsc', 'hang full clean'], { quads: 1.1, posterior: 0.9, pull: 0.6, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('hang_power_clean', 'Hang Power Clean', 'weightlifting', 'rep', ['hang power clean', 'hang power cleans', 'hpc', 'cargada colgada de potencia'], { quads: 0.7, posterior: 1.0, pull: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('hang_squat_snatch', 'Hang Squat Snatch', 'weightlifting', 'rep', ['hang squat snatch', 'hang squat snatches', 'hang full snatch'], { quads: 1.0, posterior: 0.9, pull: 0.6, push: 0.4, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('hang_power_snatch', 'Hang Power Snatch', 'weightlifting', 'rep', ['hang power snatch', 'hang power snatches', 'hps', 'hpsn'], { quads: 0.7, posterior: 1.0, pull: 0.6, push: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('muscle_clean', 'Muscle Clean', 'weightlifting', 'rep', ['muscle clean', 'muscle cleans'], { posterior: 0.8, pull: 0.8 }, { loadSensitive: true }),
  E('muscle_snatch', 'Muscle Snatch', 'weightlifting', 'rep', ['muscle snatch', 'muscle snatches'], { posterior: 0.7, pull: 0.8, push: 0.4 }, { loadSensitive: true }),
  E('clean_pull', 'Clean Pull', 'weightlifting', 'rep', ['clean pull', 'clean pulls', 'clean high pull', 'tirón de cargada'], { posterior: 1.2, quads: 0.6, pull: 0.5, grip: 0.5 }, { loadSensitive: true }),
  E('snatch_pull', 'Snatch Pull', 'weightlifting', 'rep', ['snatch pull', 'snatch pulls', 'snatch high pull', 'tirón de arrancada'], { posterior: 1.2, quads: 0.6, pull: 0.5, grip: 0.5 }, { loadSensitive: true }),
  E('snatch_balance', 'Snatch Balance', 'weightlifting', 'rep', ['snatch balance', 'snatch balances'], { quads: 1.0, push: 0.6, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('snatch_grip_deadlift', 'Snatch Grip Deadlift', 'weightlifting', 'rep', ['snatch grip deadlift', 'sgdl'], { posterior: 1.6, quads: 0.5, grip: 0.8 }, { loadSensitive: true }),
  E('cluster', 'Cluster', 'weightlifting', 'rep', ['cluster', 'clusters', 'squat clean thruster', 'squat clean thrusters'], { quads: 1.5, posterior: 1.1, push: 0.9, pull: 0.5, metabolic: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  // Fuerza
  E('back_squat', 'Back Squat', 'strength', 'rep', ['back squat', 'bs', 'sentadilla trasera', 'sentadilla'], { quads: 1.5, posterior: 1.0, core: 0.5 }, { loadSensitive: true, prTracked: 'load' }),
  E('front_squat', 'Front Squat', 'strength', 'rep', ['front squat', 'fs', 'sentadilla frontal'], { quads: 1.6, posterior: 0.7, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('overhead_squat', 'Overhead Squat', 'strength', 'rep', ['overhead squat', 'ohs'], { quads: 1.3, posterior: 0.6, push: 0.5, core: 0.7 }, { loadSensitive: true, prTracked: 'load' }),
  E('deadlift', 'Deadlift', 'strength', 'rep', ['deadlift', 'dead lift', 'dl', 'peso muerto', 'conventional deadlift'], { posterior: 1.8, quads: 0.6, grip: 0.8, core: 0.6 }, { loadSensitive: true, prTracked: 'load' }),
  E('goblet_squat', 'Goblet Squat', 'strength', 'rep', ['goblet squat', 'kb goblet squat', 'db goblet squat', 'heels elevated goblet squat', 'kb goblet squats', 'sentadilla goblet', 'sentadilla copa'], { quads: 1.0, posterior: 0.4, core: 0.3 }, { loadSensitive: true }),
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
  E('kb_swing', 'Kettlebell Swing', 'strength', 'rep', ['kb swing', 'kettlebell swing', 'kbs', 'american swing', 'russian swing', 'ktb swing', 'ktb swings', 'kb swings', 'kettlebell swings', 'swing', 'swings', 'swing ruso', 'swing americano', 'kettlebell'], { posterior: 0.6, grip: 0.3, metabolic: 0.3 }, { loadSensitive: true }),
  E('db_snatch', 'DB Snatch', 'weightlifting', 'rep', ['db snatch', 'dumbbell snatch'], { posterior: 0.6, quads: 0.4, push: 0.3, metabolic: 0.4 }, { loadSensitive: true }),
  E('devil_press', 'Devil Press', 'weightlifting', 'rep', ['devil press', 'devils press'], { posterior: 0.6, push: 0.5, quads: 0.4, metabolic: 0.8 }, { loadSensitive: true }),
  E('wall_ball', 'Wall Balls', 'strength', 'rep', ['wall ball', 'wall balls', 'wb', 'wall-ball', 'wallball', 'wallballs', 'wall bals', 'lanzamientos de balon'], { quads: 1.0, push: 0.5, metabolic: 0.6 }),
  // Gimnásticos
  E('pull_up', 'Pull-ups', 'gymnastics', 'rep', ['pull up', 'pull ups', 'pull-ups', 'dominadas', 'kipping pull ups', 'strict pull ups'], { pull: 1.0, grip: 0.5 }, { prTracked: 'reps' }),
  E('chest_to_bar', 'Chest to Bar', 'gymnastics', 'rep', ['chest to bar', 'c2b', 'ctb'], { pull: 1.1, grip: 0.5 }, { prTracked: 'reps' }),
  E('bar_muscle_up', 'Bar Muscle-up', 'gymnastics', 'rep', ['bar muscle up', 'bmu', 'bar mu'], { pull: 1.5, push: 0.8, grip: 0.6 }, { prTracked: 'reps' }),
  E('ring_muscle_up', 'Ring Muscle-up', 'gymnastics', 'rep', ['ring muscle up', 'rmu', 'muscle up', 'muscle ups', 'mu'], { pull: 1.6, push: 1.0, grip: 0.6 }, { prTracked: 'reps' }),
  E('toes_to_bar', 'Toes to Bar', 'gymnastics', 'rep', ['toes to bar', 't2b', 'ttb'], { core: 1.0, pull: 0.4, grip: 0.6 }, { prTracked: 'reps' }),
  E('hspu', 'Handstand Push-ups', 'gymnastics', 'rep', ['handstand push up', 'handstand push ups', 'hspu', 'kipping hspu', 'flexiones en pino'], { push: 1.4, core: 0.3 }, { prTracked: 'reps' }),
  E('handstand_walk', 'Handstand Walk', 'gymnastics', 'm10', ['handstand walk', 'hs walk', 'hsw'], { push: 0.8, core: 0.6 }, { prTracked: 'distance' }),
  E('double_under', 'Double Unders', 'gymnastics', 'rep', ['double under', 'double unders', 'du', 'dus', 'dobles', 'saltos dobles', 'dobles de comba', 'dobles comba'], { calves: 0.25, impact: 0.2, metabolic: 0.15 }, { prTracked: 'reps' }),
  E('single_under', 'Single Unders', 'gymnastics', 'rep', ['single unders', 'single under', 'su', 'saltos de comba', 'saltos simples', 'simples', 'comba', 'saltos a la comba', 'saltos de cuerda', 'jumping rope', 'jump rope'], { calves: 0.12, impact: 0.1 }),
  E('push_up', 'Push-ups', 'gymnastics', 'rep', ['push up', 'push ups', 'flexiones', 'hr push ups'], { push: 0.5 }),
  E('ring_dip', 'Ring Dips', 'gymnastics', 'rep', ['ring dip', 'ring dips', 'dips', 'fondos'], { push: 0.9 }),
  E('pistol', 'Pistols', 'gymnastics', 'rep', ['pistol', 'pistols', 'pistol squat'], { quads: 1.0, posterior: 0.4 }),
  E('air_squat', 'Air Squats', 'gymnastics', 'rep', ['air squat', 'air squats', 'sentadillas al aire'], { quads: 0.35, posterior: 0.15 }),
  E('sit_up', 'Sit-ups', 'gymnastics', 'rep', ['sit up', 'sit ups', 'abmat sit ups', 'abdominales'], { core: 0.4 }),
  E('rope_climb', 'Rope Climb', 'gymnastics', 'rep', ['rope climb', 'rope climbs', 'trepa', 'trepas', 'subida a la cuerda'], { pull: 1.5, grip: 1.2 }, { prTracked: 'reps' }),
  E('knees_to_chest', 'Knees to Chest', 'gymnastics', 'rep', ['knees to chest', 'k2c', 'ktc', 'rodillas al pecho', 'rodillas al pecho en barra', 'hanging knee raise', 'hanging knee raises', 'knee raises', 'elevaciones de rodillas', 'elevacion de rodillas'], { core: 0.6, pull: 0.2, grip: 0.4 }),
  E('knees_to_elbow', 'Knees to Elbows', 'gymnastics', 'rep', ['knees to elbow', 'knees to elbows', 'k2e', 'kte', 'rodillas a los codos', 'rodillas al codo'], { core: 0.8, pull: 0.3, grip: 0.5 }, { prTracked: 'reps' }),
  E('hanging_leg_raise', 'Hanging Leg Raises', 'gymnastics', 'rep', ['hanging leg raise', 'hanging leg raises', 'leg raise', 'leg raises', 'elevaciones de piernas', 'elevacion de piernas'], { core: 0.9, grip: 0.4 }),
  E('chin_up', 'Chin-ups', 'gymnastics', 'rep', ['chin up', 'chin ups', 'chin-ups', 'dominadas supinas', 'dominada supina'], { pull: 1.0, grip: 0.4 }, { prTracked: 'reps' }),
  E('jumping_pull_up', 'Jumping Pull-ups', 'gymnastics', 'rep', ['jumping pull up', 'jumping pull ups', 'dominadas con salto'], { pull: 0.5, grip: 0.3, quads: 0.2 }),
  E('ring_row', 'Ring Rows', 'gymnastics', 'rep', ['ring row', 'ring rows', 'remo en anillas', 'remo invertido', 'remo australiano'], { pull: 0.5, grip: 0.2 }),
  E('bar_dip', 'Bar Dips', 'gymnastics', 'rep', ['bar dip', 'bar dips', 'fondos en paralelas', 'paralelas'], { push: 0.8 }),
  E('box_dip', 'Box Dips', 'gymnastics', 'rep', ['box dip', 'box dips', 'bench dips', 'fondos en banco', 'fondos en cajón'], { push: 0.4 }),
  E('pike_push_up', 'Pike Push-ups', 'gymnastics', 'rep', ['pike push up', 'pike push ups', 'flexiones en pica', 'box pike push ups'], { push: 0.8 }),
  E('strict_hspu', 'Strict HSPU', 'gymnastics', 'rep', ['strict hspu', 'strict handstand push up', 'strict handstand push ups', 'hspu estricto', 'hspu estrictos'], { push: 1.5, core: 0.3 }, { prTracked: 'reps' }),
  E('deficit_hspu', 'Deficit HSPU', 'gymnastics', 'rep', ['deficit hspu', 'deficit handstand push ups', 'hspu con deficit'], { push: 1.6, core: 0.3 }, { prTracked: 'reps' }),
  E('wall_facing_hspu', 'Wall-facing HSPU', 'gymnastics', 'rep', ['wall facing hspu', 'wall-facing hspu', 'wall facing handstand push ups'], { push: 1.6, core: 0.5 }, { prTracked: 'reps' }),
  E('handstand_hold', 'Handstand Hold', 'gymnastics', 'second', ['handstand hold', 'hs hold', 'handstand', 'pino', 'vertical', 'aguantar el pino'], { push: 0.02, core: 0.01 }),
  E('l_sit', 'L-sit', 'gymnastics', 'second', ['l sit', 'l-sit', 'l sit hold', 'ring l sit', 'escuadra'], { core: 0.03, push: 0.01 }),
  E('strict_muscle_up', 'Strict Muscle-up', 'gymnastics', 'rep', ['strict muscle up', 'strict muscle ups', 'strict ring muscle up', 'muscle up estricto'], { pull: 1.8, push: 1.1, grip: 0.6 }, { prTracked: 'reps' }),
  E('peg_board', 'Pegboard', 'gymnastics', 'rep', ['pegboard', 'peg board', 'peg board ascent'], { pull: 2.0, grip: 1.0 }, { prTracked: 'reps' }),
  E('legless_rope_climb', 'Legless Rope Climb', 'gymnastics', 'rep', ['legless rope climb', 'legless rope climbs', 'legless', 'trepa sin piernas'], { pull: 1.9, grip: 1.3 }, { prTracked: 'reps' }),
  E('kip_swing', 'Kip Swings', 'gymnastics', 'rep', ['kip swing', 'kip swings', 'kipping swings', 'balanceos', 'balanceo en barra'], { core: 0.2, grip: 0.3 }),
  E('v_up', 'V-ups', 'gymnastics', 'rep', ['v up', 'v ups', 'v-ups', 'abdominales en v', 'navajas', 'tuck up', 'tuck ups'], { core: 0.5 }),
  E('russian_twist', 'Russian Twists', 'accessory', 'rep', ['russian twist', 'russian twists', 'giros rusos'], { core: 0.3 }),
  E('ab_wheel', 'Ab Wheel', 'accessory', 'rep', ['ab wheel', 'ab roller', 'rueda abdominal', 'rueda de abdominales'], { core: 0.6 }),
  E('dead_bug', 'Dead Bugs', 'accessory', 'rep', ['dead bug', 'dead bugs', 'bicho muerto'], { core: 0.2 }),
  E('bird_dog', 'Bird Dogs', 'accessory', 'rep', ['bird dog', 'bird dogs'], { core: 0.15, posterior: 0.05 }),
  E('superman', 'Superman', 'accessory', 'rep', ['superman', 'supermans', 'superman hold'], { posterior: 0.2 }),
  E('side_plank', 'Plancha lateral', 'accessory', 'second', ['side plank', 'plancha lateral', 'planchas laterales'], { core: 0.02 }),
  // Pliometría
  E('box_jump', 'Box Jumps', 'plyometric', 'rep', ['box jump', 'box jumps', 'bj', 'saltos al cajón', 'salto al cajón', 'saltos al cajon'], { quads: 0.8, calves: 0.7, posterior: 0.3, impact: 0.8 }),
  E('burpee', 'Burpees', 'plyometric', 'rep', ['burpee', 'burpees', 'burpee to target', 'burpees to target', 'burpee a objetivo'], { quads: 0.3, push: 0.3, impact: 0.4, metabolic: 0.8 }),
  E('broad_jump', 'Broad Jumps', 'plyometric', 'rep', ['broad jump', 'broad jumps'], { quads: 0.8, posterior: 0.5, impact: 0.9 }),
  E('box_jump_over', 'Box Jump Overs', 'plyometric', 'rep', ['box jump over', 'box jump overs', 'bjo', 'bjos', 'saltos por encima del cajón'], { quads: 0.8, calves: 0.7, posterior: 0.3, impact: 0.8, metabolic: 0.2 }),
  E('burpee_over_bar', 'Burpees Over Bar', 'plyometric', 'rep', ['burpee over bar', 'burpees over bar', 'burpee over the bar', 'burpees over the bar', 'bob', 'bobs', 'lateral burpee over bar', 'lateral burpees over bar', 'lbob', 'burpee sobre la barra', 'burpees sobre la barra'], { quads: 0.35, push: 0.3, impact: 0.45, metabolic: 0.9 }),
  E('bar_facing_burpee', 'Bar Facing Burpees', 'plyometric', 'rep', ['bar facing burpee', 'bar facing burpees', 'bfb', 'bfbs'], { quads: 0.35, push: 0.3, impact: 0.45, metabolic: 0.9 }),
  E('burpee_box_jump_over', 'Burpee Box Jump Overs', 'plyometric', 'rep', ['burpee box jump over', 'burpee box jump overs', 'burpee box jump', 'bbjo', 'bbjos'], { quads: 0.8, calves: 0.5, push: 0.3, impact: 0.9, metabolic: 1.0 }),
  E('burpee_pull_up', 'Burpee Pull-ups', 'plyometric', 'rep', ['burpee pull up', 'burpee pull ups', 'burpee pull-ups', 'burpee dominada', 'burpees con dominada'], { quads: 0.3, push: 0.3, pull: 0.8, grip: 0.4, impact: 0.4, metabolic: 1.0 }),
  E('tuck_jump', 'Tuck Jumps', 'plyometric', 'rep', ['tuck jump', 'tuck jumps', 'saltos con rodillas al pecho', 'saltos rodillas al pecho'], { quads: 0.5, calves: 0.5, impact: 0.7, metabolic: 0.4 }),
  E('squat_jump', 'Jump Squats', 'plyometric', 'rep', ['squat jump', 'squat jumps', 'jump squat', 'jump squats', 'sentadillas con salto', 'sentadilla con salto'], { quads: 0.6, calves: 0.4, impact: 0.6, metabolic: 0.4 }),
  E('jumping_lunge', 'Jumping Lunges', 'plyometric', 'rep', ['jumping lunge', 'jumping lunges', 'zancadas con salto', 'zancada con salto', 'split jumps'], { quads: 0.7, posterior: 0.4, impact: 0.6, metabolic: 0.4 }),
  E('jumping_jack', 'Jumping Jacks', 'plyometric', 'rep', ['jumping jack', 'jumping jacks', 'saltos de tijera', 'tijeras'], { calves: 0.1, impact: 0.1, metabolic: 0.15 }),
  E('lateral_hop', 'Lateral Hops', 'plyometric', 'rep', ['lateral hop', 'lateral hops', 'lateral jumps', 'saltos laterales'], { calves: 0.2, impact: 0.25, metabolic: 0.15 }),
  E('mountain_climber', 'Mountain Climbers', 'gymnastics', 'rep', ['mountain climber', 'mountain climbers', 'escaladores', 'escalador'], { core: 0.15, metabolic: 0.15 }),
  // Monoestructurales (unidad por km o cal)
  E('run', 'Carrera', 'monostructural', 'km', ['run', 'running', 'carrera', 'correr', 'km run', 'm run', 'sprint', 'sprints', 'corrida'], { quads: 6, calves: 10, posterior: 4, impact: 10, metabolic: 10 }),
  E('row', 'Remo (ergómetro)', 'monostructural', 'cal', ['row', 'rowing', 'remo', 'cal row', 'concept2'], { posterior: 0.15, quads: 0.12, pull: 0.12, metabolic: 0.35 }),
  E('ski_erg', 'SkiErg', 'monostructural', 'cal', ['ski', 'ski erg', 'skierg', 'cal ski'], { pull: 0.2, core: 0.12, metabolic: 0.35 }),
  E('bike_erg', 'Bike (Assault/Echo/BikeErg)', 'monostructural', 'cal', ['bike', 'assault bike', 'echo bike', 'bike erg', 'bikeerg', 'c2 bike', 'airbike', 'air bike', 'cal bike', 'ab', 'bici'], { quads: 0.18, metabolic: 0.4 }),
  // HYROX (unidad m10 = 10 metros)
  E('sled_push', 'Sled Push', 'hyrox', 'm10', ['sled push', 'empuje de trineo', 'trineo push'], { quads: 6, calves: 3, posterior: 2, metabolic: 3 }, { loadSensitive: true }),
  E('sled_pull', 'Sled Pull', 'hyrox', 'm10', ['sled pull', 'arrastre de trineo', 'trineo pull'], { pull: 4, posterior: 3, grip: 3, metabolic: 2.5 }, { loadSensitive: true }),
  E('burpee_broad_jump', 'Burpee Broad Jumps', 'hyrox', 'm10', ['burpee broad jump', 'burpee broad jumps', 'bbj'], { quads: 5, push: 2, impact: 4, metabolic: 4 }),
  E('farmers_carry', 'Farmers Carry', 'hyrox', 'm10', ['farmers carry', 'farmer carry', 'farmers walk', 'paseo del granjero'], { grip: 3, core: 1.5, posterior: 1 }, { loadSensitive: true }),
  E('sandbag_lunge', 'Sandbag Lunges', 'hyrox', 'm10', ['sandbag lunges', 'sandbag lunge', 'zancadas con saco'], { quads: 8, posterior: 6 }, { loadSensitive: true }),
  // Strongman y cargas
  E('sandbag_clean', 'Sandbag Cleans', 'strength', 'rep', ['sandbag clean', 'sandbag cleans', 'cargada de saco', 'cargadas de saco'], { posterior: 1.1, quads: 0.8, grip: 0.6, metabolic: 0.4 }, { loadSensitive: true }),
  E('sandbag_over_shoulder', 'Sandbag over Shoulder', 'strength', 'rep', ['sandbag over shoulder', 'sandbag to shoulder', 'sandbag over shoulders', 'saco al hombro', 'saco por encima del hombro'], { posterior: 1.2, quads: 0.8, grip: 0.6, metabolic: 0.5 }, { loadSensitive: true }),
  E('dball_over_shoulder', 'D-ball over Shoulder', 'strength', 'rep', ['d ball over shoulder', 'dball over shoulder', 'd ball', 'dball', 'atlas stone', 'atlas stones', 'piedra atlas', 'ball over shoulder'], { posterior: 1.2, quads: 0.8, grip: 0.5, metabolic: 0.5 }, { loadSensitive: true }),
  E('med_ball_clean', 'Med Ball Cleans', 'strength', 'rep', ['med ball clean', 'med ball cleans', 'medball clean', 'medicine ball clean', 'cargada con balon medicinal'], { posterior: 0.6, quads: 0.6, metabolic: 0.3 }),
  E('slam_ball', 'Slam Balls', 'strength', 'rep', ['slam ball', 'slam balls', 'ball slam', 'ball slams', 'med ball slam', 'med ball slams', 'lanzamientos al suelo'], { core: 0.4, posterior: 0.3, metabolic: 0.4 }),
  E('sled_drag', 'Sled Drag', 'hyrox', 'm10', ['sled drag', 'arrastre de trineo de espaldas', 'backward sled drag'], { quads: 3, posterior: 2, metabolic: 2 }, { loadSensitive: true }),
  E('yoke_carry', 'Yoke Carry', 'hyrox', 'm10', ['yoke', 'yoke carry', 'yoke walk'], { quads: 2, core: 2, posterior: 2 }, { loadSensitive: true }),
  E('overhead_carry', 'Overhead Carry', 'hyrox', 'm10', ['overhead carry', 'overhead walk', 'oh carry', 'paseo overhead'], { push: 1.5, core: 1.5 }, { loadSensitive: true }),
  E('front_rack_carry', 'Front Rack Carry', 'hyrox', 'm10', ['front rack carry', 'front rack walk', 'paseo en rack'], { core: 1.8, quads: 1 }, { loadSensitive: true }),
  E('sandbag_carry', 'Sandbag Carry', 'hyrox', 'm10', ['sandbag carry', 'bear hug carry', 'paseo con saco'], { core: 1.8, posterior: 1.2, grip: 1 }, { loadSensitive: true }),
  E('suitcase_carry', 'Suitcase Carry', 'hyrox', 'm10', ['suitcase carry', 'paseo maleta'], { core: 1.5, grip: 2 }, { loadSensitive: true }),
  E('bear_crawl', 'Bear Crawl', 'gymnastics', 'm10', ['bear crawl', 'bear crawls', 'paso de oso', 'gateo de oso'], { push: 0.6, core: 0.6, quads: 0.3 }),
  E('battle_rope', 'Battle Ropes', 'monostructural', 'second', ['battle rope', 'battle ropes', 'cuerdas de batida', 'cuerdas'], { pull: 0.02, core: 0.01, metabolic: 0.04 }),
  E('swim', 'Natación', 'monostructural', 'km', ['swim', 'swimming', 'natacion', 'nadar'], { pull: 6, push: 3, metabolic: 12 }),
  // Mancuerna y kettlebell
  E('db_thruster', 'DB Thrusters', 'strength', 'rep', ['db thruster', 'db thrusters', 'dumbbell thruster', 'dumbbell thrusters', 'thruster con mancuernas', 'thrusters con mancuernas'], { quads: 1.1, push: 0.9, metabolic: 0.6 }, { loadSensitive: true }),
  E('db_clean', 'DB Cleans', 'weightlifting', 'rep', ['db clean', 'db cleans', 'db hang clean', 'db hang cleans', 'dumbbell clean', 'dumbbell hang clean', 'cargada con mancuerna', 'cargadas con mancuernas'], { posterior: 0.7, quads: 0.5, pull: 0.3 }, { loadSensitive: true }),
  E('db_clean_and_jerk', 'DB Clean & Jerk', 'weightlifting', 'rep', ['db clean and jerk', 'db clean & jerk', 'db hang clean and jerk', 'dumbbell clean and jerk', 'dumbbell hang clean and jerk', 'dhcj', 'db c&j'], { posterior: 0.7, quads: 0.6, push: 0.6, metabolic: 0.5 }, { loadSensitive: true }),
  E('db_push_press', 'DB Push Press', 'strength', 'rep', ['db push press', 'dumbbell push press', 'push press con mancuernas'], { push: 1.0, quads: 0.3 }, { loadSensitive: true }),
  E('db_shoulder_to_overhead', 'DB Shoulder to Overhead', 'strength', 'rep', ['db shoulder to overhead', 'db s2oh', 'db stoh', 'dumbbell shoulder to overhead'], { push: 1.0, quads: 0.3, core: 0.3 }, { loadSensitive: true }),
  E('db_strict_press', 'DB Strict Press', 'strength', 'rep', ['db strict press', 'db shoulder press', 'dumbbell press', 'press con mancuernas', 'press militar con mancuernas'], { push: 1.0, core: 0.3 }, { loadSensitive: true }),
  E('db_bench_press', 'DB Bench Press', 'strength', 'rep', ['db bench press', 'db bench', 'dumbbell bench press', 'press banca con mancuernas', 'press banca mancuernas'], { push: 1.2 }, { loadSensitive: true }),
  E('db_row', 'DB Row', 'strength', 'rep', ['db row', 'db rows', 'dumbbell row', 'one arm row', 'remo con mancuerna', 'remo mancuerna'], { pull: 0.9, posterior: 0.2 }, { loadSensitive: true }),
  E('db_deadlift', 'DB Deadlift', 'strength', 'rep', ['db deadlift', 'db deadlifts', 'dumbbell deadlift', 'peso muerto con mancuernas'], { posterior: 1.0, quads: 0.4, grip: 0.4 }, { loadSensitive: true }),
  E('box_step_over', 'Box Step Overs', 'strength', 'rep', ['box step over', 'box step overs', 'db box step over', 'db box step overs', 'step over', 'step overs', 'pasos por encima del cajón'], { quads: 0.8, posterior: 0.5 }, { loadSensitive: true }),
  E('kb_clean', 'KB Cleans', 'weightlifting', 'rep', ['kb clean', 'kb cleans', 'kettlebell clean', 'kettlebell cleans', 'ktb clean'], { posterior: 0.6, pull: 0.2, grip: 0.3 }, { loadSensitive: true }),
  E('kb_snatch', 'KB Snatch', 'weightlifting', 'rep', ['kb snatch', 'kb snatches', 'kettlebell snatch', 'ktb snatch'], { posterior: 0.6, push: 0.3, grip: 0.3, metabolic: 0.4 }, { loadSensitive: true }),
  E('turkish_get_up', 'Turkish Get-up', 'strength', 'rep', ['turkish get up', 'turkish get ups', 'tgu', 'levantada turca', 'levantadas turcas'], { core: 1.0, push: 0.6, quads: 0.4 }, { loadSensitive: true }),
  // Fuerza: variantes
  E('sumo_deadlift', 'Sumo Deadlift', 'strength', 'rep', ['sumo deadlift', 'sumo dl', 'peso muerto sumo'], { posterior: 1.6, quads: 0.9, grip: 0.8 }, { loadSensitive: true, prTracked: 'load' }),
  E('single_leg_rdl', 'Single-leg RDL', 'strength', 'rep', ['single leg rdl', 'single leg deadlift', 'sl rdl', 'peso muerto a una pierna', 'peso muerto unilateral'], { posterior: 0.9, grip: 0.3 }, { loadSensitive: true }),
  E('good_morning', 'Good Mornings', 'strength', 'rep', ['good morning', 'good mornings'], { posterior: 1.0 }, { loadSensitive: true }),
  E('box_squat', 'Box Squat', 'strength', 'rep', ['box squat', 'box squats', 'sentadilla al cajón'], { quads: 1.3, posterior: 1.0, core: 0.4 }, { loadSensitive: true, prTracked: 'load' }),
  E('zercher_squat', 'Zercher Squat', 'strength', 'rep', ['zercher squat', 'zercher'], { quads: 1.4, posterior: 0.8, core: 0.8 }, { loadSensitive: true }),
  E('overhead_lunge', 'Overhead Lunges', 'strength', 'rep', ['overhead lunge', 'overhead lunges', 'oh lunge', 'oh lunges', 'ohl', 'zancadas overhead', 'zancada overhead'], { quads: 1.2, posterior: 0.9, push: 0.4, core: 0.5 }, { loadSensitive: true }),
  E('cossack_squat', 'Cossack Squats', 'strength', 'rep', ['cossack squat', 'cossack squats', 'sentadilla cosaca'], { quads: 0.6, posterior: 0.3 }),
  E('incline_bench_press', 'Incline Bench Press', 'strength', 'rep', ['incline bench press', 'incline bench', 'press inclinado', 'press banca inclinado'], { push: 1.3 }, { loadSensitive: true, prTracked: 'load' }),
  E('back_extension', 'Back Extensions', 'accessory', 'rep', ['back extension', 'back extensions', 'hip extension', 'hip extensions', 'ghd hip extension', 'ghd back extension', 'hiperextensiones', 'extensiones lumbares'], { posterior: 0.4 }),
  E('glute_bridge', 'Glute Bridges', 'accessory', 'rep', ['glute bridge', 'glute bridges', 'puente de gluteo', 'puentes de gluteo'], { posterior: 0.3 }, { loadSensitive: true }),
  E('bicep_curl', 'Bicep Curls', 'accessory', 'rep', ['bicep curl', 'bicep curls', 'biceps curl', 'curl', 'curls', 'curl de biceps', 'curl biceps'], { pull: 0.3 }, { loadSensitive: true }),
  E('tricep_extension', 'Tricep Extensions', 'accessory', 'rep', ['tricep extension', 'tricep extensions', 'triceps extension', 'skull crusher', 'skull crushers', 'extension de triceps', 'press frances'], { push: 0.3 }, { loadSensitive: true }),
  E('lateral_raise', 'Lateral Raises', 'accessory', 'rep', ['lateral raise', 'lateral raises', 'elevaciones laterales', 'pajaros'], { push: 0.2 }, { loadSensitive: true }),
  E('face_pull', 'Face Pulls', 'accessory', 'rep', ['face pull', 'face pulls'], { pull: 0.2 }),
  E('band_pull_apart', 'Band Pull-aparts', 'accessory', 'rep', ['band pull apart', 'band pull aparts', 'pull apart', 'pull aparts'], { pull: 0.1 }),
  // Movilidad / accesorio
  E('plank', 'Plancha', 'accessory', 'second', ['plank', 'plancha', 'plancha frontal'], { core: 0.02 }),
  E('wall_sit', 'Wall Sit', 'accessory', 'second', ['wall sit', 'wall sits', 'sentadilla isometrica', 'sentadilla en pared', 'sentadilla isometrica en pared', 'silla', 'isometrica en pared'], { quads: 0.03 }),
  E('hollow_hold', 'Hollow Hold', 'accessory', 'second', ['hollow hold', 'hollow', 'hollow body', 'hollow rock', 'hollow rocks'], { core: 0.03 }),
  E('wall_walk', 'Wall Walks', 'gymnastics', 'rep', ['wall walk', 'wall walks'], { push: 0.9, core: 0.5 }),
  E('shuttle_run', 'Shuttle Run', 'monostructural', 'm10', ['shuttle run', 'shuttle'], { quads: 0.12, calves: 0.12, impact: 0.12, metabolic: 0.15 }),
  E('ghd_sit_up', 'GHD Sit-ups', 'accessory', 'rep', ['ghd', 'ghd sit up', 'ghd sit ups'], { core: 0.9 }),
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return byId.get(id);
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const aliasIndex: [string, string][] = EXERCISES.flatMap((e) =>
  [e.name, ...e.aliases].map((a) => [normalizeName(a), e.id] as [string, string]));
// Alias más largos primero para que "power clean" gane a "clean".
aliasIndex.sort((a, b) => b[0].length - a[0].length);

const deplural = (w: string, suffix: 's' | 'es') => (w.length > 3 && w.endsWith(suffix) && !w.endsWith('ss') ? w.slice(0, -suffix.length) : w);

/** Resuelve un nombre libre (pizarra, captura, texto de Strava) a un ejercicio del catálogo. Tolera plurales. */
export function resolveExercise(raw: string): { id: string; confidence: 'exact' | 'partial' } | null {
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
