// Generado por scripts/build-web-engine.mjs desde engine/src/nutrition.ts. No editar.
// Nutrición ligada al entrenamiento: gasto diario (BMR Mifflin-St Jeor + actividad no deportiva +
// entrenamiento planificado o medido), objetivo (definir, mantener, ganar masa, recomposición, rendimiento),
// macros por día (los hidratos siguen a la carga) y reparto por comidas.

                                                                 

                                                                                                                                            
export const ZERO         = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, vitCMg: 0, magnesiumMg: 0 };

export function addMacros(a        , b        , k = 1)         {
  return { kcal: a.kcal + b.kcal * k, protein: a.protein + b.protein * k, carbs: a.carbs + b.carbs * k, fat: a.fat + b.fat * k,
    fiber: (a.fiber ?? 0) + (b.fiber ?? 0) * k, vitCMg: (a.vitCMg ?? 0) + (b.vitCMg ?? 0) * k, magnesiumMg: (a.magnesiumMg ?? 0) + (b.magnesiumMg ?? 0) * k };
}
export const subMacros = (a        , b        ) => addMacros(a, b, -1);
export const roundMacros = (m        )         => ({ kcal: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat), fiber: Math.round(m.fiber ?? 0), vitCMg: Math.round(m.vitCMg ?? 0), magnesiumMg: Math.round(m.magnesiumMg ?? 0) });

                       
             
               
                                                         
                                                                        
                                                               
                                                             
 

export const macrosOf = (f      , grams        )         => addMacros(ZERO, f.per100, grams / 100);

                                                                                                    
                                                                                                                                

                                    
                 
                                                                                                                                
                         
                     
                                                                                                  
                                                                  
                   
                   
 

                            
               
                 
                                                                                  
                       
               
                        
 

export function bmrMifflin(sex                               , kg        , cm        , age        )         {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'female' ? -161 : 5);
}

// MET netos aproximados (Compendium of Physical Activities) por tipo de sesión.
const MET                         = {
  run_easy: 9, run_recovery: 7.5, run_long: 9.5, run_intervals: 11, run_vo2: 11, run_threshold: 11, run_tempo: 10.5, run_race_pace: 10.5, run_hills: 10,
  crossfit_box: 8, strength_lower: 5.5, strength_upper: 5, strength_full: 6, hyrox_stations: 8, hyrox_compromised: 9.5, hyrox_simulation: 10,
  mobility: 2.5, rest: 0, race: 11,
};

/** kcal de entrenamiento (netas sobre reposo). Si hay kcal activas medidas por el Watch, se usan. */
export function trainingKcal(sessions                                               , kg        , measuredActiveKcal         )         {
  if (measuredActiveKcal != null && measuredActiveKcal > 0) return measuredActiveKcal;
  return sessions.reduce((a, s) => a + Math.max(0, (MET[s.type] ?? 6) - 1) * kg * (s.estMinutes / 60), 0);
}

function dayLoad(sessions                  , raceToday         , raceSoon         )                    {
  if (raceToday) return 'competicion';
  if (raceSoon) return 'precompeticion';
  if (!sessions.length || sessions.every((s) => s.type === 'mobility' || s.type === 'rest')) return 'descanso';
  const keys = sessions.filter((s) => s.key || s.intensity === 'alta').length;
  const minutes = sessions.reduce((a, s) => a + s.estMinutes, 0);
  if (keys >= 1 && (minutes >= 75 || sessions.length >= 2 || sessions.some((s) => s.type === 'run_long'))) return 'alta';
  if (keys >= 1 || minutes >= 60) return 'media';
  return 'baja';
}

const CARB_MIN                                    = { descanso: 2.5, baja: 3, media: 4, alta: 5.5, precompeticion: 7, competicion: 6 };

export function dayTarget(args   
                                                                                               
                                                                                                                            
                                                                                                            
 )            {
  const { settings: st, profile } = args;
  const kg = profile.weightKg ?? 75;
  const bmr = bmrMifflin(profile.sex, kg, st.heightCm, st.ageYears);
  const neat = bmr * ((st.activityFactor ?? 1.4) - 1);
  const train = trainingKcal(args.sessions, kg, args.measuredActiveKcal);
  const tdee = bmr + neat + train;
  // Carga de hidratos solo tiene sentido para esfuerzos largos (≥ ~90 min): media maratón o más, HYROX.
  const longRace = (args.raceDistanceM ?? 0) >= 21000;
  const raceSoon = longRace && args.raceInDays != null && args.raceInDays >= 1 && args.raceInDays <= 2;
  const load = dayLoad(args.sessions, !!args.raceToday, raceSoon);
  const why           = [];

  let adjust = 0;
  const rate = st.rateKgPerWeek ?? (st.mode === 'definicion' ? kg * 0.005 : st.mode === 'volumen' ? kg * 0.0025 : 0);
  if (st.mode === 'definicion') adjust = -Math.min(rate * 7700 / 7, tdee * 0.25);
  if (st.mode === 'volumen') adjust = Math.min(rate * 7700 / 7, tdee * 0.15);
  if (st.mode === 'recomposicion') adjust = -tdee * 0.08;
  if (load === 'precompeticion' || load === 'competicion') {
    if (adjust < 0) why.push('Cerca de la competición pauso el déficit: llegar con el depósito lleno importa más.');
    adjust = Math.max(0, adjust);
  }
  if (st.mode === 'definicion' && load === 'alta') adjust *= 0.6;   // menos déficit los días duros, más los suaves
  if (st.mode === 'definicion' && load === 'descanso') adjust *= 1.3;
  let kcal = tdee + adjust;
  if (args.kcalAdjust && load !== 'alta' && load !== 'precompeticion' && load !== 'competicion') {
    kcal += args.kcalAdjust;
    why.push(`${args.kcalAdjust < 0 ? 'Resto' : 'Sumo'} ${Math.abs(Math.round(args.kcalAdjust))} kcal para compensar lo que llevas de semana.`);
  }
  const floor = bmr * 1.1;
  if (kcal < floor) { why.push('He limitado el déficit para no bajar de tu metabolismo basal con margen.'); kcal = floor; }

  const protein = kg * (st.proteinGPerKg ?? (st.mode === 'definicion' || st.mode === 'recomposicion' ? 2.2 : st.mode === 'volumen' ? 1.8 : 2.0));
  let fat = kg * (st.fatGPerKg ?? (st.mode === 'definicion' ? 0.8 : 1.0));
  fat = Math.max(fat, (kcal * 0.2) / 9);
  let carbs = (kcal - protein * 4 - fat * 9) / 4;
  const minC = CARB_MIN[load] * kg;
  if (carbs < minC) {
    const fatFloor = Math.max(0.6 * kg, (kcal * 0.15) / 9);
    const take = Math.min(fat - fatFloor, ((minC - carbs) * 4) / 9);
    if (take > 0) { fat -= take; carbs += (take * 9) / 4; }
    if (carbs < minC && (load === 'alta' || load === 'precompeticion' || load === 'competicion')) {
      kcal += (minC - carbs) * 4; carbs = minC;
      why.push(`Día de carga ${load}: subo hidratos a ${CARB_MIN[load]} g/kg aunque recorte menos calorías; rendir y recuperar es prioritario.`);
    }
  }
  why.unshift(`Gasto estimado ${Math.round(tdee)} kcal (basal ${Math.round(bmr)} + actividad ${Math.round(neat)} + entrenamiento ${Math.round(train)}${args.measuredActiveKcal ? ' medido' : ' estimado'}).`);
  if (adjust) why.push(`${adjust < 0 ? 'Déficit' : 'Superávit'} de ${Math.abs(Math.round(adjust))} kcal para tu objetivo de ${st.mode}.`);
  why.push(`Proteína ${(protein / kg).toFixed(1)} g/kg · hidratos ${(carbs / kg).toFixed(1)} g/kg (día ${load}) · grasa ${(fat / kg).toFixed(1)} g/kg.`);
  if (load === 'precompeticion') why.push('Carga de hidratos previa a la competición: prioriza arroz, pasta, pan, patata y fruta; baja fibra y grasa.');
  return { date: args.date, macros: roundMacros({ kcal, protein, carbs, fat, fiber: Math.round(kcal / 1000 * 14) }), load, trainingKcal: Math.round(train), tdee: Math.round(tdee), explanation: why };
}

const BASE_SHARE                           = { desayuno: 0.25, media_manana: 0.1, comida: 0.33, merienda: 0.12, cena: 0.28, pre_entreno: 0.08, post_entreno: 0.12, recena: 0.06 };
const ORDER             = ['desayuno', 'media_manana', 'pre_entreno', 'comida', 'merienda', 'post_entreno', 'cena', 'recena'];
export const slotOrder = (s          ) => ORDER.indexOf(s);

/** Reparto del objetivo diario entre comidas: proteína equilibrada, hidratos cerca del entreno. */
export function distribute(target        , slots            , trainingSlot              )                           {
  const out = {}                            ;
  const sorted = [...slots].sort((a, b) => slotOrder(a) - slotOrder(b));
  const shareSum = sorted.reduce((a, s) => a + BASE_SHARE[s], 0);
  const nearTraining = (s          ) => s === 'pre_entreno' || s === 'post_entreno' ||
    (trainingSlot === 'am' && (s === 'desayuno' || s === 'media_manana')) || (trainingSlot === 'pm' && (s === 'merienda' || s === 'cena' || s === 'comida'));
  const carbW = sorted.map((s) => BASE_SHARE[s] * (trainingSlot && nearTraining(s) ? 1.4 : trainingSlot ? 0.8 : 1));
  const carbSum = carbW.reduce((a, b) => a + b, 0);
  const protW = sorted.map((s) => (s === 'pre_entreno' || s === 'recena' || s === 'media_manana' ? 0.5 : 1));
  const protSum = protW.reduce((a, b) => a + b, 0);
  const fatW = sorted.map((s) => BASE_SHARE[s] * (s === 'pre_entreno' || s === 'post_entreno' ? 0.4 : 1));
  const fatSum = fatW.reduce((a, b) => a + b, 0);
  sorted.forEach((s, i) => {
    const protein = target.protein * protW[i] / protSum;
    const carbs = target.carbs * carbW[i] / carbSum;
    const fat = target.fat * fatW[i] / fatSum;
    out[s] = roundMacros({ kcal: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat, fiber: (target.fiber ?? 0) * BASE_SHARE[s] / shareSum });
  });
  return out;
}
