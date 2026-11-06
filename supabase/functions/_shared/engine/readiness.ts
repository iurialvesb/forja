// Estado de recuperación diario: HRV (ln, media 7 d frente a línea base 60 d), FC en reposo,
// sueño, check-in subjetivo, ACWR y fatiga residual de piernas.
// Clasificación de molestias: fatiga normal / agujetas (DOMS) / posible señal de lesión.
// NO diagnostica. Ante señales de alarma recomienda valoración profesional.

import type { CheckIn, DailyHealth, PainReport } from './types.ts';
import { legFatigueLevel } from './load.ts';

export type ReadinessLevel = 'verde' | 'ambar' | 'rojo';

export interface ReadinessInput {
  today: string;
  health: DailyHealth[];          // histórico (idealmente ≥ 60 días)
  checkIn?: CheckIn;
  acwr?: number | null;
  legFatigue?: number;
  sleepNeedHours?: number;
}

export interface PainAssessment {
  area: string;
  classification: 'fatiga_normal' | 'agujetas' | 'posible_lesion';
  advice: string;
  seeProfessional: boolean;
}

export interface Readiness {
  score: number;                  // 0-100
  level: ReadinessLevel;
  reasons: string[];
  pains: PainAssessment[];
  dataQuality: 'buena' | 'parcial' | 'solo_subjetiva' | 'sin_datos';
  hrv?: { today: number; rolling7: number; baseline: number; sd: number; z: number };
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };

export function classifyPain(p: PainReport): PainAssessment {
  const redFlag = p.intensity >= 6 || !!p.swelling || !!p.numbness || !!p.affectsMovement ||
    p.character === 'punzante' || p.character === 'articular' ||
    (p.character === 'tendon' && p.intensity >= 4) ||
    (p.daysOngoing ?? 0) > 7 || !!p.worsening;
  if (redFlag) {
    return {
      area: p.area, classification: 'posible_lesion', seeProfessional: true,
      advice: `La molestia en ${p.area} tiene características que conviene que valore un fisioterapeuta o médico ` +
        `(${[p.intensity >= 6 && 'dolor ≥ 6/10', p.swelling && 'inflamación', p.numbness && 'hormigueo o pérdida de fuerza',
          p.affectsMovement && 'altera tu forma de moverte', p.character === 'punzante' && 'dolor punzante',
          p.character === 'articular' && 'dolor articular', p.character === 'tendon' && 'dolor en tendón',
          (p.daysOngoing ?? 0) > 7 && 'dura más de una semana', p.worsening && 'va a peor'].filter(Boolean).join(', ')}). ` +
        'Mientras tanto quito la carga sobre esa zona y no programo impacto ni intensidad que la provoque. No es un diagnóstico.',
    };
  }
  const domsLike = p.character === 'difuso_muscular' && p.intensity <= 5 &&
    (p.hoursSinceHardSession == null || (p.hoursSinceHardSession >= 12 && p.hoursSinceHardSession <= 96));
  if (domsLike) {
    return {
      area: p.area, classification: 'agujetas', seeProfessional: false,
      advice: `Compatible con agujetas en ${p.area}: dolor difuso, muscular y tras una sesión exigente. ` +
        'Suele mejorar al moverte y desaparecer en 2-4 días. Evito intensidad alta sobre esa zona hoy; el trabajo suave ayuda.',
    };
  }
  return {
    area: p.area, classification: 'fatiga_normal', seeProfessional: false,
    advice: `Molestia leve en ${p.area}. La vigilo: si sube de intensidad, se localiza en un punto o dura más de una semana, pide valoración profesional.`,
  };
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const reasons: string[] = [];
  let score = 70; // neutro
  let signals = 0;
  const hist = [...input.health].filter((h) => h.date <= input.today).sort((a, b) => a.date.localeCompare(b.date));
  const today = hist.find((h) => h.date === input.today);

  // HRV: comparar media móvil 7 d del ln(HRV) con la línea base de 60 d (Plews et al.).
  const hrvVals = hist.filter((h) => h.hrvMs && h.hrvMs > 0).map((h) => ({ d: h.date, v: Math.log(h.hrvMs!) }));
  let hrvOut: Readiness['hrv'];
  if (hrvVals.length >= 14) {
    const base = hrvVals.slice(-60).map((x) => x.v);
    const last7 = hrvVals.slice(-7).map((x) => x.v);
    const b = mean(base), s = Math.max(sd(base), 0.03), r7 = mean(last7);
    const z = (r7 - b) / s;
    hrvOut = { today: Math.exp(hrvVals[hrvVals.length - 1].v), rolling7: Math.exp(r7), baseline: Math.exp(b), sd: s, z };
    signals++;
    if (z < -1.5) { score -= 22; reasons.push(`HRV media de 7 días claramente por debajo de tu línea base (${hrvOut.rolling7.toFixed(0)} vs ${hrvOut.baseline.toFixed(0)} ms)`); }
    else if (z < -0.5) { score -= 10; reasons.push(`HRV algo por debajo de tu normal (${hrvOut.rolling7.toFixed(0)} vs ${hrvOut.baseline.toFixed(0)} ms)`); }
    else if (z > 0.5) { score += 6; reasons.push('HRV en tu rango alto'); }
  }

  // FC en reposo frente a media de 30 días.
  const rhr = hist.filter((h) => h.rhr).map((h) => h.rhr!);
  if (rhr.length >= 10 && today?.rhr) {
    const base = mean(rhr.slice(-30, -1).length ? rhr.slice(-30, -1) : rhr);
    const diff = today.rhr - base;
    signals++;
    if (diff >= 7) { score -= 18; reasons.push(`FC en reposo ${diff.toFixed(0)} lpm por encima de tu media`); }
    else if (diff >= 4) { score -= 8; reasons.push(`FC en reposo ligeramente elevada (+${diff.toFixed(0)} lpm)`); }
    else if (diff <= -3) score += 4;
  }

  // Sueño.
  const need = input.sleepNeedHours ?? 7.5;
  if (today?.sleepHours != null) {
    signals++;
    const debt = need - today.sleepHours;
    if (debt >= 2) { score -= 15; reasons.push(`Has dormido ${today.sleepHours.toFixed(1)} h, bastante menos de lo que necesitas`); }
    else if (debt >= 1) { score -= 7; reasons.push(`Sueño algo corto (${today.sleepHours.toFixed(1)} h)`); }
    else if (debt <= 0) score += 4;
  }

  // Check-in subjetivo (pesa mucho: la percepción es un buen predictor).
  const pains: PainAssessment[] = [];
  if (input.checkIn) {
    const c = input.checkIn;
    signals++;
    const subj = (c.fatigue - 3) * -6 + (c.soreness - 3) * -5 + (c.stress - 3) * -4 + (c.motivation - 3) * 3 + (c.sleepQuality - 3) * 3;
    score += subj;
    if (c.fatigue >= 4) reasons.push('Te notas cansado');
    if (c.soreness >= 4) reasons.push('Dolor muscular alto');
    if (c.stress >= 4) reasons.push('Estrés elevado');
    for (const p of c.pains ?? []) pains.push(classifyPain(p));
  }

  // Carga.
  if (input.acwr != null) {
    if (input.acwr > 1.5) { score -= 12; reasons.push(`Has subido la carga muy rápido (ACWR ${input.acwr.toFixed(2)})`); }
    else if (input.acwr > 1.3) { score -= 5; reasons.push(`Carga reciente por encima de lo habitual (ACWR ${input.acwr.toFixed(2)})`); }
  }
  if (input.legFatigue != null) {
    const lvl = legFatigueLevel(input.legFatigue);
    if (lvl === 'alta') { score -= 10; reasons.push('Fatiga de piernas alta por las últimas sesiones'); }
    else if (lvl === 'moderada') { score -= 4; reasons.push('Fatiga de piernas moderada'); }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let level: ReadinessLevel = score >= 65 ? 'verde' : score >= 45 ? 'ambar' : 'rojo';
  if (pains.some((p) => p.classification === 'posible_lesion') && level === 'verde') level = 'ambar';
  const objective = hrvOut ? 1 : 0;
  const dataQuality = signals === 0 ? 'sin_datos' : !input.checkIn && signals < 2 ? 'parcial'
    : input.checkIn && signals === 1 ? 'solo_subjetiva' : objective ? 'buena' : 'parcial';
  if (!reasons.length) reasons.push('Sin señales de fatiga relevantes');
  return { score, level, reasons, pains, dataQuality, hrv: hrvOut };
}
