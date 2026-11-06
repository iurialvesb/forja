// Regla fundamental: cada entrenamiento registrado (y cada check-in) re-evalúa los próximos días.
// Decisiones posibles por sesión: mantener, reducir, mover, sustituir por suave o por movilidad.
// Cada cambio queda registrado con su motivo y los datos que lo justifican.

import type { AthleteProfile, PlannedSession, Session, PrescriptionStep } from './types.ts';
import { residualLegFatigue, legFatigueLevel, LEG_FATIGUE } from './load.ts';
import { addDays, isoDate } from './fitness.ts';
import { META, isKeyRun, runLabel } from './planner.ts';
import { mobilityPrescription, runPrescription, type PrescriptionContext } from './prescriptions.ts';
import type { Readiness } from './readiness.ts';

export interface PlanChange {
  plannedId: string;
  date: string;
  action: 'reduce' | 'move' | 'swap' | 'downgrade' | 'replace_mobility' | 'note' | 'mark_done';
  reason: string;
  data: Record<string, number | string>;
  before?: Pick<PlannedSession, 'type' | 'title' | 'date' | 'slot'>;
  after?: Pick<PlannedSession, 'type' | 'title' | 'date' | 'slot'>;
}

export interface AdaptInput {
  now: Date;
  plan: PlannedSession[];                // sesiones planificadas (se modifican sobre una copia)
  history: Session[];                    // incluye la sesión recién registrada
  profile: AthleteProfile;
  readiness?: Readiness;                 // estado de hoy
  acwr?: number | null;
  ctx: PrescriptionContext;              // para represcribir sesiones degradadas
  horizonDays?: number;
}

const slotTime = (date: string, slot: 'am' | 'pm') => new Date(`${date}T${slot === 'am' ? '07:30' : '18:30'}:00`);

function summary(p: PlannedSession) { return { type: p.type, title: p.title, date: p.date, slot: p.slot }; }

function scaleRepeats(steps: PrescriptionStep[], f: number): PrescriptionStep[] {
  return steps.map((s) => s.kind === 'repeat' && s.repeat
    ? { ...s, repeat: Math.max(1, Math.round(s.repeat * f)), label: `${Math.max(1, Math.round(s.repeat * f))} repeticiones (reducido)` }
    : s.kind === 'work' && s.distanceM && !s.repeat ? { ...s, distanceM: Math.round(s.distanceM * f / 100) * 100 } : s);
}

/** Marca como hecha la sesión planificada que corresponde a una sesión registrada. */
export function matchPlanned(session: Session, plan: PlannedSession[]): PlannedSession | undefined {
  const d = isoDate(session.startedAt);
  const fam = (x: string) => (x === 'hybrid' || x === 'hyrox' ? 'hyrox' : x);
  return plan.find((p) => p.date === d && p.status === 'planned' && fam(p.discipline) === fam(session.discipline));
}

export function adaptPlan(input: AdaptInput): { plan: PlannedSession[]; changes: PlanChange[] } {
  const plan = input.plan.map((p) => ({ ...p, steps: [...p.steps] }));
  const changes: PlanChange[] = [];
  const bw = input.profile.weightKg ?? 75;
  const today = isoDate(input.now);
  const horizon = addDays(today, input.horizonDays ?? 4);

  const latest = [...input.history].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (latest) {
    const m = matchPlanned(latest, plan);
    if (m) { m.status = 'done'; changes.push({ plannedId: m.id, date: m.date, action: 'mark_done', reason: `Registrado: ${latest.title ?? latest.discipline}.`, data: {} }); }
  }

  const upcoming = plan.filter((p) => p.status === 'planned' && p.date >= today && p.date <= horizon)
    .sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));

  // 1) Estado de hoy (check-in + datos fisiológicos).
  const r = input.readiness;
  for (const p of upcoming.filter((x) => x.date === today)) {
    if (r?.level === 'rojo' && p.type !== 'mobility') {
      const mob = mobilityPrescription();
      changes.push({ plannedId: p.id, date: p.date, action: 'replace_mobility', before: summary(p), after: { type: 'mobility', title: mob.title, date: p.date, slot: p.slot },
        reason: `Tu recuperación hoy es baja (${r.score}/100: ${r.reasons.slice(0, 2).join('; ')}). Hoy toca recuperar; la sesión importante se recoloca si hay hueco.`, data: { readiness: r.score } });
      Object.assign(p, { type: 'mobility', discipline: 'mobility', title: mob.title, objective: mob.objective, steps: mob.steps, estMinutes: mob.minutes, intensity: 'baja', legStress: 0, key: false, status: 'modified' });
    } else if (r?.level === 'ambar' && isKeyRun(p.type)) {
      p.steps = scaleRepeats(p.steps, 0.75);
      p.status = 'modified';
      changes.push({ plannedId: p.id, date: p.date, action: 'reduce', before: summary(p), after: summary(p),
        reason: `Recuperación en ámbar (${r.score}/100). Mantengo ${runLabel(p.type)} pero con ~25 % menos de volumen y en la parte lenta del rango de ritmo.`, data: { readiness: r.score } });
    }
    for (const pain of r?.pains ?? []) if (pain.seeProfessional && META[p.type].legStress > 0 && p.status === 'planned') {
      changes.push({ plannedId: p.id, date: p.date, action: 'note', reason: pain.advice, data: { area: pain.area } });
    }
  }

  // 2) Fatiga residual de piernas proyectada a cada sesión.
  for (const p of upcoming) {
    if (p.status !== 'planned') continue;
    const at = slotTime(p.date, p.slot);
    const leg = residualLegFatigue(input.history, at, bw);
    const lvl = legFatigueLevel(leg);
    const data = { fatigaPiernas: Math.round(leg), umbralAlto: LEG_FATIGUE.high };
    const keyRun = isKeyRun(p.type);
    if (lvl === 'alta' && (keyRun || p.type === 'strength_lower')) {
      // Intento 1: intercambiar con un rodaje suave de los 2 días siguientes donde la fatiga ya sea aceptable.
      const candidates = plan.filter((q) => q.status === 'planned' && q.date > p.date && q.date <= addDays(p.date, 2) && (q.type === 'run_easy' || q.type === 'run_recovery' || q.type === 'mobility' || q.type === 'strength_upper'));
      const swap = candidates.find((q) => {
        const lq = residualLegFatigue(input.history, slotTime(q.date, q.slot), bw);
        const dayAfterQ = plan.filter((x) => x.date === addDays(q.date, 1) && x.status === 'planned');
        return lq < LEG_FATIGUE.high && !dayAfterQ.some((x) => isKeyRun(x.type) && x.id !== p.id) && !plan.some((x) => x.date === q.date && x.id !== q.id && META[x.type].legStress >= 2);
      });
      if (swap) {
        const before = summary(p), beforeQ = summary(swap);
        [p.date, swap.date] = [swap.date, p.date];
        [p.slot, swap.slot] = [swap.slot, p.slot];
        p.status = 'modified'; swap.status = 'modified';
        changes.push({ plannedId: p.id, date: before.date, action: 'swap', before, after: summary(p),
          reason: `Tus piernas llegan muy cargadas a ${runLabel(p.type)} del ${before.date} (fatiga estimada ${data.fatigaPiernas}, umbral ${LEG_FATIGUE.high}). Lo paso al ${p.date} y adelanto "${beforeQ.title}".`, data });
        continue;
      }
      // Intento 2: degradar a rodaje suave / tren superior.
      const before = summary(p);
      if (p.type === 'strength_lower') {
        Object.assign(p, { type: 'strength_upper', title: 'Fuerza tren superior', legStress: 0, status: 'modified' });
        changes.push({ plannedId: p.id, date: p.date, action: 'downgrade', before, after: summary(p), reason: `Fatiga de piernas alta (${data.fatigaPiernas}): cambio la fuerza de pierna por tren superior.`, data });
      } else {
        const km = Math.max(5, Math.round((p.plannedKm ?? 8) * 0.7));
        const rp = runPrescription('run_easy', km, input.ctx);
        Object.assign(p, { type: 'run_easy', discipline: 'running', title: rp.title, objective: rp.objective, steps: rp.steps, estMinutes: rp.minutes, plannedKm: rp.km, intensity: 'baja', legStress: 1, key: false, status: 'modified' });
        changes.push({ plannedId: p.id, date: p.date, action: 'downgrade', before, after: summary(p),
          reason: `Fatiga de piernas alta (${data.fatigaPiernas} sobre umbral ${LEG_FATIGUE.high}) y no hay hueco para moverla sin juntar dos sesiones duras. El ${p.date}: rodaje suave de ${km} km: hacer ${runLabel(before.type)} así sería entrenar mal y arriesgar lesión.`, data });
      }
    } else if (lvl === 'moderada' && keyRun) {
      const before = summary(p);
      p.steps = scaleRepeats(p.steps, 0.8);
      p.status = 'modified';
      changes.push({ plannedId: p.id, date: p.date, action: 'reduce', before, after: summary(p),
        reason: `Fatiga de piernas moderada (${data.fatigaPiernas}). Mantengo ${runLabel(p.type)} con ~20 % menos de volumen; si en el calentamiento las piernas no responden, conviértelo en rodaje suave.`, data });
    } else if (lvl !== 'baja' && p.type === 'crossfit_box') {
      changes.push({ plannedId: p.id, date: p.date, action: 'note', reason: `Llegas con fatiga de piernas ${lvl}: en el WOD escala sentadillas, saltos y zancadas.`, data });
    }
  }

  // 3) Carga aguda muy por encima de la crónica → recortar rodajes suaves.
  if (input.acwr != null && input.acwr > 1.5) {
    for (const p of upcoming.filter((x) => x.status === 'planned' && (x.type === 'run_easy' || x.type === 'crossfit_box'))) {
      if (p.type === 'run_easy') p.steps = scaleRepeats(p.steps, 0.75);
      p.status = 'modified';
      changes.push({ plannedId: p.id, date: p.date, action: 'reduce', reason: `Has subido la carga muy deprisa (ACWR ${input.acwr.toFixed(2)} > 1,5, zona asociada a más riesgo de lesión). Recorto ~25 % hasta que se estabilice.`, data: { acwr: Number(input.acwr.toFixed(2)) } });
    }
  }
  return { plan, changes };
}

/** Sesión no realizada: si es clave intenta recolocarla esta semana; si no, la descarta con motivo. */
export function handleMissed(plan: PlannedSession[], missedId: string, today: string): { plan: PlannedSession[]; change: PlanChange } {
  const out = plan.map((p) => ({ ...p }));
  const m = out.find((p) => p.id === missedId)!;
  m.status = 'skipped';
  const weekEnd = addDays(today, 7 - ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7) - 1);
  if (m.key) {
    const easy = out.find((p) => p.status === 'planned' && p.date > today && p.date <= weekEnd && (p.type === 'run_easy' || p.type === 'mobility') &&
      !out.some((x) => (x.date === addDays(p.date, -1) || x.date === addDays(p.date, 1)) && x.status !== 'skipped' && isKeyRun(x.type)));
    if (easy) {
      const before = { type: easy.type, title: easy.title, date: easy.date, slot: easy.slot };
      Object.assign(easy, { ...m, id: easy.id, date: easy.date, slot: easy.slot, status: 'modified' });
      return { plan: out, change: { plannedId: easy.id, date: easy.date, action: 'swap', before, after: { type: m.type, title: m.title, date: easy.date, slot: easy.slot }, reason: `No hiciste "${m.title}". Es una sesión clave, así que la recoloco el ${easy.date} en lugar de "${before.title}", sin pegarla a otra sesión dura.`, data: {} } };
    }
  }
  return { plan: out, change: { plannedId: m.id, date: m.date, action: 'note', reason: m.key ? `No hay hueco seguro esta semana para recuperar "${m.title}" sin acumular intensidad. Mejor perderla que forzar: seguimos con el plan.` : `"${m.title}" no se recupera: no es una sesión clave.`, data: {} } };
}
