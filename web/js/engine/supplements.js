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
