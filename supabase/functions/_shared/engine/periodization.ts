// Periodización por objetivos con fecha: fases hacia atrás desde cada competición
// (general → desarrollo → específica → puesta a punto → competición → recuperación),
// encadenando objetivos sucesivos y comprimiendo fases cuando no hay tiempo.

import type { Goal, GoalType, Phase, PhaseKind } from './types.ts';
import { addDays, daysBetween } from './fitness.ts';

interface Template { taper: number; specific: number; development: number; recovery: number }

const TEMPLATES: Record<GoalType, Template> = {
  half_marathon: { taper: 14, specific: 35, development: 35, recovery: 7 },
  marathon: { taper: 21, specific: 42, development: 42, recovery: 14 },
  '10k': { taper: 10, specific: 28, development: 28, recovery: 4 },
  '5k': { taper: 8, specific: 28, development: 28, recovery: 3 },
  hyrox: { taper: 10, specific: 35, development: 28, recovery: 7 },
  crossfit_comp: { taper: 7, specific: 28, development: 28, recovery: 5 },
  strength: { taper: 7, specific: 28, development: 35, recovery: 5 },
  general: { taper: 0, specific: 0, development: 0, recovery: 0 },
};

const FOCUS: Record<GoalType, Partial<Record<PhaseKind, string>>> = {
  half_marathon: {
    general: 'Base aeróbica, técnica de carrera y fuerza general',
    development: 'Más volumen aeróbico, umbral y VO2max',
    specific: 'Ritmo de media maratón y tiradas largas específicas',
    taper: 'Bajar volumen 40-60 % manteniendo toques de intensidad',
    competition: 'Competición',
    recovery: 'Recuperación activa tras la media',
  },
  hyrox: {
    general: 'Fuerza general y base aeróbica',
    development: 'Fuerza-resistencia en estaciones y carrera bajo fatiga',
    specific: 'Simulaciones parciales, transiciones y ritmo de carrera HYROX',
    taper: 'Reducir volumen, mantener ritmo de estaciones y frescura',
    competition: 'Competición HYROX',
    recovery: 'Recuperación tras HYROX',
  },
  marathon: { general: 'Base aeróbica', development: 'Volumen y umbral', specific: 'Ritmo maratón y tiradas largas', taper: 'Puesta a punto', competition: 'Competición', recovery: 'Recuperación' },
  '10k': { general: 'Base aeróbica', development: 'Umbral y VO2max', specific: 'Ritmo 10K', taper: 'Puesta a punto', competition: 'Competición', recovery: 'Recuperación' },
  '5k': { general: 'Base aeróbica', development: 'VO2max y velocidad', specific: 'Ritmo 5K', taper: 'Puesta a punto', competition: 'Competición', recovery: 'Recuperación' },
  crossfit_comp: { general: 'Base y técnica', development: 'Fuerza y capacidad', specific: 'Simulación de eventos', taper: 'Puesta a punto', competition: 'Competición', recovery: 'Recuperación' },
  strength: { general: 'Hipertrofia y técnica', development: 'Fuerza', specific: 'Intensificación', taper: 'Peaking', competition: 'Test de máximos', recovery: 'Descarga' },
  general: {},
};

const secondaryFor = (g: Goal, next?: Goal): string | undefined => {
  if (g.type === 'half_marathon' && next?.type === 'hyrox') return 'Mantener CrossFit y fuerza para no perder base de HYROX';
  if (g.type === 'hyrox') return 'Mantener la base aeróbica y los ritmos de carrera';
  return undefined;
};

/** Construye las fases desde `today` hasta la última competición (+ fase base abierta). */
export function buildMacrocycle(goals: Goal[], today: string, horizonDays = 120): Phase[] {
  const upcoming = goals.filter((g) => g.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const phases: Phase[] = [];
  let cursor = today;
  upcoming.forEach((g, i) => {
    const t = { ...TEMPLATES[g.type] };
    if (g.priority !== 'A') { t.taper = Math.ceil(t.taper * 0.5); t.recovery = Math.min(t.recovery, 3); }
    const avail = daysBetween(cursor, g.date);       // días antes del evento disponibles
    let { taper, specific, development } = t;
    let general = avail - taper - specific - development;
    if (general < 0) {
      let deficit = -general; general = 0;
      const cut = (v: number, min: number) => { const c = Math.min(deficit, Math.max(0, v - min)); deficit -= c; return v - c; };
      development = cut(development, 0);
      specific = cut(specific, 14);
      taper = cut(taper, Math.min(7, t.taper));
      specific = cut(specific, 0);
      taper = cut(taper, 0);
    }
    if (general > 0 && general < 7 && development > 0) { development += general; general = 0; }
    const next = upcoming[i + 1];
    const focus = FOCUS[g.type];
    const push = (kind: PhaseKind, days: number) => {
      if (days <= 0) return;
      phases.push({ goalId: g.id, kind, start: cursor, end: addDays(cursor, days - 1), focus: focus[kind] ?? kind, secondary: kind === 'competition' || kind === 'recovery' ? undefined : secondaryFor(g, next) });
      cursor = addDays(cursor, days);
    };
    push('general', general);
    push('development', development);
    push('specific', specific);
    push('taper', taper);
    push('competition', 1);
    const rec = next ? Math.min(t.recovery, Math.max(0, daysBetween(cursor, next.date) - 7)) : t.recovery;
    push('recovery', rec);
  });
  const last = phases.length ? phases[phases.length - 1].end : addDays(today, -1);
  phases.push({ goalId: null, kind: 'base', start: addDays(last, 1), end: addDays(last, horizonDays), focus: 'Mantenimiento y base general hasta el próximo objetivo' });
  return phases;
}

export function phaseAt(phases: Phase[], date: string): Phase | undefined {
  return phases.find((p) => p.start <= date && date <= p.end);
}

/**
 * Factor de volumen semanal: ciclos 3:1 en desarrollo/específica (la 4.ª semana descarga ×0,7),
 * taper decreciente, recuperación ×0,5.
 */
export function weekVolumeFactor(phase: Phase, weekStart: string): { factor: number; deload: boolean; weekIndex: number } {
  const weekIndex = Math.max(0, Math.floor(daysBetween(phase.start, weekStart) / 7));
  switch (phase.kind) {
    case 'development':
    case 'specific':
    case 'general': {
      const deload = weekIndex % 4 === 3;
      return { factor: deload ? 0.7 : 1 + 0.06 * (weekIndex % 4), deload, weekIndex };
    }
    case 'taper': {
      const len = daysBetween(phase.start, phase.end) + 1;
      const frac = Math.min(1, (daysBetween(phase.start, weekStart) + 7) / len);
      return { factor: frac >= 1 ? 0.45 : 0.65, deload: false, weekIndex };
    }
    case 'recovery': return { factor: 0.5, deload: true, weekIndex };
    case 'competition': return { factor: 0.5, deload: false, weekIndex };
    default: return { factor: 0.9, deload: false, weekIndex };
  }
}
