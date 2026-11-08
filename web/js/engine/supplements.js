// Generado por scripts/build-web-engine.mjs desde engine/src/supplements.ts. No editar.
// Recomendación diaria de suplementos según lo que has comido en los últimos 7 días y el entrenamiento de hoy.
// Orientativo: no sustituye a un médico o dietista-nutricionista (interacciones, patologías, medicación).

                                                 
                                             

                             
                                                                                                                       
               
                                                                                
                                                       
 

                                                                                                                           

// Referencias de ingesta para adultos (EFSA): vitamina C 110 mg/día hombre, 95 mg/día mujer; magnesio 350 / 300 mg/día.
const REF = { vitC: { male: 110, female: 95 }, mg: { male: 350, female: 300 } };

export function recommendSupplements(args   
                          
                                                                                                                  
                                                                                                
                          
                          
                         
                     
                            
                                                                      
                          
                
 )                                             {
  const sex = args.sex ?? 'male';
  const n = Math.max(1, args.last7Days.length);
  const vitC = args.last7Days.reduce((a, d) => a + (d.vitCMg ?? 0), 0) / n;
  const mg = args.last7Days.reduce((a, d) => a + (d.magnesiumMg ?? 0), 0) / n;
  const reliable = args.daysWithMicros >= 4;
  const tendonLoad = args.today.some((s) => ['run_intervals', 'run_vo2', 'run_hills', 'run_race_pace', 'run_threshold', 'crossfit_box', 'strength_lower', 'strength_full', 'hyrox_compromised', 'hyrox_simulation', 'hyrox_stations', 'race'].includes(s.type));
  const firstTraining = [...args.today].sort((a, b) => (a.startLocal ?? (a.slot === 'am' ? '08:00' : '18:00')).localeCompare(b.startLocal ?? (b.slot === 'am' ? '08:00' : '18:00')))[0];
  const trainingTime = firstTraining ? (firstTraining.startLocal ?? (firstTraining.slot === 'am' ? 'por la mañana' : 'por la tarde')) : undefined;
  const hard = args.today.reduce((a, s) => a + (s.intensity === 'alta' ? 1 : 0), 0);
  const recs                  = [];
  const notes           = [];
  if (!reliable) notes.push('Tengo pocos días con micronutrientes fiables registrados: las recomendaciones de vitamina C y magnesio son menos precisas.');

  for (const s of args.available) {
    const id = s.id;
    if (id === 'colageno') {
      recs.push(tendonLoad
        ? { id, name: s.name, take: true, priority: 3, when: trainingTime ? `30-60 min antes de entrenar (${trainingTime}), junto con algo de vitamina C` : '30-60 min antes de entrenar', reason: 'Hoy hay carga sobre tendones (saltos, carrera rápida o fuerza). Tomar 10-15 g de colágeno o gelatina con vitamina C antes del ejercicio se ha asociado a más síntesis de colágeno.' }
        : { id, name: s.name, take: false, priority: 0, reason: 'Hoy no hay carga relevante sobre tendones: puedes reservarlo para los días de saltos, series o fuerza.' });
    } else if (id === 'vitamina_c') {
      const low = reliable && vitC < REF.vitC[sex];
      const withCollagen = tendonLoad && args.available.some((x) => x.id === 'colageno');
      recs.push(low || withCollagen
        ? { id, name: s.name, take: true, priority: low ? 2.5 : 1.5, when: withCollagen ? 'con el colágeno, antes de entrenar' : 'con una comida', reason: low ? `Tu media de vitamina C de los últimos días es ~${Math.round(vitC)} mg/día, por debajo de la referencia (${REF.vitC[sex]} mg). Mejor aún: suma fruta (kiwi, naranja, fresas) o pimiento.` : 'Acompaña al colágeno (necesaria para formarlo). Dosis moderadas: megadosis diarias de forma continuada pueden atenuar algunas adaptaciones al entrenamiento.' }
        : { id, name: s.name, take: false, priority: 0, reason: reliable ? `Con la dieta ya llegas (~${Math.round(vitC)} mg/día).` : 'Sin datos suficientes ni colágeno hoy: no es necesaria.' });
    } else if (id === 'magnesio') {
      const low = reliable && mg < REF.mg[sex];
      const poorSleep = (args.sleepHoursAvg ?? 8) < 6.5;
      recs.push(low || hard >= 2 || poorSleep
        ? { id, name: s.name, take: true, priority: low ? 2.6 : 1.4, when: 'por la noche, con la cena', reason: low ? `Tu ingesta media de magnesio es ~${Math.round(mg)} mg/día, por debajo de la referencia (${REF.mg[sex]} mg). Frutos secos, legumbres, cacao puro, integrales y espinacas ayudan.` : hard >= 2 ? 'Día con mucha intensidad: el sudor aumenta las pérdidas; una dosis por la noche es razonable.' : 'Llevas varios días durmiendo poco; el magnesio por la noche puede ayudar a algunas personas.' }
        : { id, name: s.name, take: false, priority: 0, reason: `Con la dieta cubres la referencia (~${Math.round(mg)} mg/día).` });
    } else if (id === 'creatina') {
      recs.push({ id, name: s.name, take: true, priority: 2, when: 'a cualquier hora, todos los días', reason: 'La creatina funciona por saturación: 3-5 g diarios, sin necesidad de ciclos.' });
    } else if (id === 'aminoacidos') {
      const fastedAm = args.today.some((x) => x.slot === 'am' && x.intensity !== 'baja');
      const proteinLow = args.proteinAvgG != null && args.proteinTargetG != null && args.proteinAvgG < args.proteinTargetG * 0.85;
      recs.push(fastedAm || proteinLow
        ? { id, name: s.name, take: true, priority: 1.2, when: fastedAm ? 'antes o durante el entreno de la mañana si vas en ayunas' : 'entre comidas', reason: fastedAm ? 'Entrenas por la mañana, probablemente sin desayunar: unos aminoácidos esenciales (EAA) antes o durante limitan la degradación muscular.' : `Esta semana vas corto de proteína (~${Math.round(args.proteinAvgG )} g/día frente a ${Math.round(args.proteinTargetG )} g). Mejor aún: súmala con comida o un batido.` }
        : { id, name: s.name, take: false, priority: 0, reason: 'Si llegas a tu proteína diaria con la comida, los aminoácidos no aportan nada extra. Resérvalos para entrenos en ayunas.' });
    } else if (id === 'omega3') {
      recs.push({ id, name: s.name, take: true, priority: 1, when: 'con la comida o la cena (con grasa se absorbe mejor)', reason: 'Diario si comes pescado azul menos de 2 veces por semana. Si ese día comes salmón, sardinas o caballa, puedes saltarlo.' });
    } else if (id === 'vitamina_d') {
      const month = Number((args.date ?? new Date().toISOString()).slice(5, 7));
      const winter = month >= 10 || month <= 4;
      recs.push(winter
        ? { id, name: s.name, take: true, priority: 1.3, when: 'con la comida principal', reason: 'De octubre a abril se sintetiza poca vitamina D con el sol. Lo ideal es ajustar la dosis con una analítica.' }
        : { id, name: s.name, take: false, priority: 0, reason: 'En primavera-verano, con 15-20 min de sol al día suele bastar.' });
    } else if (id === 'electrolitos') {
      const long = args.today.some((x) => (x.estMinutes ?? 0) >= 75 || x.type === 'run_long' || x.type === 'race');
      recs.push(long
        ? { id, name: s.name, take: true, priority: 1.6, when: 'durante el entreno largo', reason: 'Sesión de más de 75 minutos: repón sodio con el agua (más si hace calor o sudas mucho).' }
        : { id, name: s.name, take: false, priority: 0, reason: 'Solo en sesiones largas (más de 75 min), con calor o si sudas mucho.' });
    } else if (id === 'proteina') {
      const short = args.proteinAvgG != null && args.proteinTargetG != null && args.proteinAvgG < args.proteinTargetG * 0.9;
      recs.push(short
        ? { id, name: s.name, take: true, priority: 1.8, when: 'después de entrenar o en el almuerzo', reason: `Vas corto de proteína (~${Math.round(args.proteinAvgG )} de ${Math.round(args.proteinTargetG )} g/día): un batido de 25-30 g lo resuelve.` }
        : { id, name: s.name, take: false, priority: 0, reason: 'Con la comida ya llegas a tu proteína: el batido es opcional.' });
    } else if (id === 'cafeina') {
      const key = args.today.some((x) => x.key || x.intensity === 'alta');
      recs.push(key
        ? { id, name: s.name, take: true, priority: 0.8, when: '30-60 min antes de la sesión clave (no después de las 16 h)', reason: '3 mg/kg mejoran el rendimiento en sesiones intensas. No la tomes tarde si te quita sueño.' }
        : { id, name: s.name, take: false, priority: 0, reason: 'Resérvala para sesiones clave o competición.' });
    } else {
      recs.push({ id, name: s.name, take: false, priority: 0.5, reason: 'Sin regla específica: sigue la pauta que te haya indicado tu profesional.' });
    }
  }
  // Límite diario: el usuario indica cuántos quiere tomar como máximo; se priorizan los de mayor impacto.
  const max = args.maxPerDay ?? Infinity;
  const yes = recs.filter((r) => r.take).sort((a, b) => b.priority - a.priority);
  yes.slice(max).forEach((r) => { r.take = false; r.reason = `Hoy prioritizo otros (máximo ${max} al día). ${r.reason}`; });
  for (const r of recs) {
    const st = args.available.find((s) => s.id === r.id)?.stock;
    if (st != null && st <= 5) notes.push(`Te quedan ${st} dosis de ${r.name}.`);
  }
  notes.push('Orientativo. Si tomas medicación o tienes alguna patología, consúltalo con tu médico o dietista-nutricionista.');
  return { recs: recs.sort((a, b) => Number(b.take) - Number(a.take) || b.priority - a.priority), notes };
}


/** Pauta de la semana: qué tomar cada día según el plan de entrenos (para verlo de un vistazo). */
export function weeklySupplementPlan(args                                                                                                                                                                               )                                                                          {
  return args.days.map((d) => ({
    date: d.date,
    take: recommendSupplements({ available: args.available, last7Days: [], daysWithMicros: 0, today: d.sessions, sex: args.sex, maxPerDay: args.maxPerDay, proteinAvgG: args.proteinAvgG, proteinTargetG: args.proteinTargetG, date: d.date })
      .recs.filter((r) => r.take).map((r) => ({ id: r.id, name: r.name, when: r.when })),
  }));
}

/** Suplementos con buena evidencia que no tienes y te podrían encajar (deportista híbrido). */
export function missingSupplements(have          , ctx                                                                                                )                                                                {
  const out                                                                = [];
  const has = new Set(have);
  const month = Number((ctx.date ?? new Date().toISOString()).slice(5, 7));
  if (!has.has('creatina')) out.push({ id: 'creatina', name: 'Creatina monohidrato', priority: 3, why: '3-5 g al día. La de más evidencia para fuerza, potencia y CrossFit; también ayuda en series repetidas.' });
  if (!has.has('vitamina_d') && (month >= 10 || month <= 4)) out.push({ id: 'vitamina_d', name: 'Vitamina D', priority: 2, why: 'En otoño-invierno es habitual tenerla baja. Mejor con una analítica para ajustar la dosis.' });
  if (!has.has('proteina') && ctx.proteinAvgG != null && ctx.proteinTargetG != null && ctx.proteinAvgG < ctx.proteinTargetG * 0.9) out.push({ id: 'proteina', name: 'Proteína en polvo (whey o vegetal)', priority: 2.2, why: `Vas corto de proteína (~${Math.round(ctx.proteinAvgG)} de ${Math.round(ctx.proteinTargetG)} g/día): un batido lo soluciona fácil.` });
  if (!has.has('electrolitos') && (ctx.longSessionsPerWeek ?? 1) >= 1) out.push({ id: 'electrolitos', name: 'Electrolitos (sales con sodio)', priority: 1.5, why: 'Para las tiradas largas de la media maratón y las simulaciones de HYROX (más de 75 min).' });
  if (!has.has('omega3')) out.push({ id: 'omega3', name: 'Omega-3 (EPA/DHA)', priority: 1, why: 'Solo si comes pescado azul menos de 2 veces por semana.' });
  if (!has.has('cafeina')) out.push({ id: 'cafeina', name: 'Cafeína (café vale)', priority: 0.8, why: 'Opcional para sesiones clave y competición (3 mg/kg, 30-60 min antes).' });
  return out.sort((a, b) => b.priority - a.priority);
}
