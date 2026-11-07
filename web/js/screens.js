// Pantallas: Inicio, Plan, Entrenos (historial, progreso, registrar) y Coach.
import * as api from './api.js';
import { get, invalidate, go, render } from './app.js';
import {
  html, raw, act, toast, sheet, setSheet, closeSheet, busy, today, addDays, monday, dayName, shortDate, timeOf, daysUntil, pace, dur, n0,
  icon, intensityTag, levelColor, ring, bar, barChart, lineChart, steps, resizeImage, phaseName, slotName,
} from './ui.js';

import { activityExtras } from './activity.js';
import { startFromText, startFromPhoto, startManual, editSession, exerciseHistory, sessionEdits, draftBanner } from './logbook.js';

const uid = () => api.userId();
const q = (o) => o;

// ======================= INICIO =======================
export async function HOME() {
  const t = today(), mon = monday();
  const [readiness, week, goals, phases, sessions, nut] = await Promise.all([
    get('readiness', async () => (await api.db.select('readiness_daily', { date: `eq.${t}` }))[0]),
    get(`planned:${mon}`, () => api.db.select('planned_sessions', { date: `gte.${mon}`, and: `(date.lte.${addDays(mon, 13)})`, order: 'date,slot' })),
    get('goals', () => api.db.select('goals', { status: 'eq.active', order: 'date' })),
    get('phases', () => api.db.select('phases', { order: 'start_date' })),
    get('sessions:42', () => api.db.select('sessions', { deleted_at: 'is.null', started_at: `gte.${addDays(t, -42)}`, order: 'started_at.desc' })),
    get(`nutweek:${mon}`, () => api.fn('nutrition-day', { weekStart: mon }).catch(() => null)),
  ]);
  const todays = week.filter((s) => s.date === t);
  const thisWeek = sessions.filter((s) => s.started_at.slice(0, 10) >= mon);
  const km = thisWeek.filter((s) => s.discipline === 'running').reduce((a, s) => a + (+s.distance_m || 0), 0) / 1000;
  const plannedKm = week.filter((s) => s.date <= addDays(mon, 6)).reduce((a, s) => a + (+s.planned_km || 0), 0);
  const nd = nut?.days?.find((d) => d.date === t);
  const changes = await get('changes', () => api.db.select('plan_changes', { order: 'created_at.desc', limit: 5 }));
  const last = changes.find((c) => c.action !== 'mark_done');
  const h = new Date().getHours();
  return {
    title: h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches',
    right: html`<button class="icon-btn" data-act="${act(() => go('perfil'))}">👤</button>`,
    body: html`
      <div class="card row" data-act="${act(checkIn)}">
        ${ring((readiness?.score ?? 0) / 100, levelColor(readiness?.level), readiness ? readiness.score : '–')}
        <div class="grow"><div class="small muted">Recuperación</div>
          <div style="font-size:20px;font-weight:700;color:${levelColor(readiness?.level)}">${{ verde: 'Listo para entrenar', ambar: 'Con precaución', rojo: 'Prioriza recuperar' }[readiness?.level] ?? 'Haz el check-in'}</div>
          <div class="small muted">${readiness?.reasons?.[0] ?? 'Toca para contarme cómo estás hoy.'}</div></div>
      </div>
      <h2>Hoy <small>${dayName(t, true)}</small></h2>
      ${todays.length ? todays.map(plannedCard) : html`<div class="card muted">${week.length ? 'Descanso. Camina, duerme bien y come suficiente.' : 'Aún no hay plan: completa tu perfil y objetivos.'}</div>`}
      <div class="card">
        <div class="row"><h3 class="grow">Nutrición de hoy</h3>${nd ? html`<span class="tag accent">día ${nd.target.load}</span>` : ''}</div>
        ${nd ? html`<div class="stats">
            <div class="stat"><div class="l">kcal</div><div class="v">${n0(nd.totals.kcal)}<span class="u"> / ${n0(nd.target.macros.kcal)}</span></div></div>
            <div class="stat"><div class="l">Proteína</div><div class="v" style="color:var(--red)">${n0(nd.totals.protein)}<span class="u"> / ${n0(nd.target.macros.protein)} g</span></div></div>
            <div class="stat"><div class="l">Hidratos</div><div class="v" style="color:var(--blue)">${n0(nd.totals.carbs)}<span class="u"> / ${n0(nd.target.macros.carbs)} g</span></div></div></div>
            ${nd.alerts[0] ? html`<p class="alert">⚠️ ${nd.alerts[0].message}</p>` : ''}
            ${nut.supplements?.recs?.filter((r) => r.take).length ? html`<p class="small">💊 Hoy: ${nut.supplements.recs.filter((r) => r.take).map((r) => r.name).join(' · ')}</p>` : ''}`
          : html`<p class="muted small">Elige tu objetivo en Nutrición y genera tu menú.</p>`}
        <button class="sm" data-act="${act(() => go('nutricion'))}">Abrir nutrición</button>
      </div>
      <div class="card">
        <h3>Carga semanal</h3>
        <div class="stats">
          <div class="stat"><div class="l">Carrera</div><div class="v" style="color:var(--blue)">${km.toFixed(1)}<span class="u"> / ${Math.round(plannedKm)} km</span></div></div>
          <div class="stat"><div class="l">Sesiones</div><div class="v">${thisWeek.length}</div></div>
          <div class="stat"><div class="l">ACWR</div><div class="v">${readiness?.acwr != null ? (+readiness.acwr).toFixed(2) : '–'}</div></div>
        </div>
        ${readiness?.leg_fatigue != null ? html`<div class="small muted" style="margin-top:10px">Fatiga de piernas</div>${bar(+readiness.leg_fatigue, 350, +readiness.leg_fatigue >= 250 ? 'var(--red)' : +readiness.leg_fatigue >= 140 ? 'var(--amber)' : 'var(--green)')}` : ''}
      </div>
      <h2>Objetivos</h2>
      ${goals.length ? goals.map((g) => {
        const ph = phases.find((p) => p.goal_id === g.id && p.start_date <= t && t <= p.end_date);
        const first = phases.find((p) => p.goal_id === g.id);
        const total = first ? Math.max(1, daysUntil(g.date) - daysUntil(first.start_date)) : 1;
        const done = first ? -daysUntil(first.start_date) : 0;
        return html`<div class="card"><div class="row"><h3 class="grow">${g.name}</h3><span class="tag accent">${daysUntil(g.date)} días</span></div>
          <p class="small muted">${ph ? `${phaseName(ph.kind)} · ${ph.focus}` : 'Preparación pendiente'}</p>${bar(Math.max(0, done), total)}</div>`;
      }) : html`<div class="card muted">Añade tu próxima competición en Perfil → Objetivos.</div>`}
      ${last ? html`<div class="card"><div class="small" style="color:var(--accent);font-weight:700">✨ Tu entrenador</div><p>${last.reason}</p></div>` : ''}
      <h2>Última actividad</h2>
      ${sessions.slice(0, 3).map(sessionRow)}
      ${!sessions.length ? html`<div class="card muted small">Conecta Apple Salud con el Atajo (Perfil → Apple Salud) o registra un entreno en Entrenos.</div>` : ''}`,
  };
}

export const plannedCard = (s) => html`
  <div class="card row" data-act="${act(() => plannedDetail(s))}" style="${s.status === 'skipped' ? 'opacity:.45' : ''}">
    ${icon(s.discipline)}
    <div class="grow"><div style="font-weight:700">${s.title} ${s.status === 'modified' ? '🔄' : ''}${s.status === 'done' ? ' ✅' : ''}</div>
      <div class="small muted">${[s.start_local ?? (s.slot === 'am' ? 'Mañana' : 'Tarde'), s.est_minutes ? `${s.est_minutes} min` : null, s.planned_km ? `${(+s.planned_km).toFixed(1)} km` : null].filter(Boolean).join(' · ')}</div>
      ${s.objective ? html`<div class="small muted">${s.objective}</div>` : ''}</div>
    ${intensityTag(s.intensity)}
  </div>`;

function plannedDetail(s) {
  sheet(s.title, html`
    <div class="row" style="gap:6px">${intensityTag(s.intensity)}${s.key ? html`<span class="tag accent">Sesión clave</span>` : ''}${s.from_calendar ? html`<span class="tag blue">Reservada</span>` : ''}</div>
    <p style="font-weight:600">${s.objective ?? ''}</p>
    <div class="stats"><div class="stat"><div class="l">Duración</div><div class="v">${s.est_minutes ?? '–'}<span class="u"> min</span></div></div>
      ${s.planned_km ? html`<div class="stat"><div class="l">Distancia</div><div class="v">${(+s.planned_km).toFixed(1)}<span class="u"> km</span></div></div>` : ''}
      <div class="stat"><div class="l">Piernas</div><div class="v">${s.leg_stress ?? 0}<span class="u">/3</span></div></div></div>
    <div class="card tight"><div class="small" style="color:var(--accent);font-weight:700">💡 Por qué esta sesión</div><div class="small">${s.rationale ?? ''}</div></div>
    <h3>Sesión</h3>${steps(s.steps)}
    ${s.status === 'planned' || s.status === 'modified' ? html`<button class="block danger" data-act="${act((b) => busy(b, async () => {
      const r = await api.fn('replan', { trigger: 'missed', plannedId: s.id }); closeSheet(); toast(r.changes?.[0]?.reason ?? 'Plan recolocado', 6000); invalidate('planned', 'changes'); render();
    }))}">No puedo hacerla</button>` : ''}`);
}

export const sessionRow = (s) => html`
  <div class="card tight row" data-act="${act(() => sessionDetail(s.id))}">
    ${icon(s.discipline)}
    <div class="grow"><div style="font-weight:600">${s.title ?? s.discipline}</div><div class="xs muted">${shortDate(s.started_at)} · ${timeOf(s.started_at)}</div></div>
    <div style="text-align:right">${s.distance_m > 0 ? html`<div style="font-weight:600">${(s.distance_m / 1000).toFixed(2)} km</div>` : ''}<div class="xs muted">${dur(s.duration_s)}</div></div>
  </div>`;

async function sessionDetail(id) {
  sheet('Entrenamiento', html`<div class="center"><span class="spinner"></span></div>`);
  const [s] = await api.db.select('sessions', { id: `eq.${id}`, select: '*,session_blocks(*),session_sets(*)' });
  const ex = await get('exercises', () => api.db.select('exercises', { select: 'id,name' }), 864e5);
  const name = Object.fromEntries(ex.map((e) => [e.id, e.name]));
  const blocks = (s.session_blocks || []).sort((a, b) => a.position - b.position);
  const watch = await activityExtras(s).catch(() => []);
  setSheet(html`
    <h3>${s.title ?? s.discipline}</h3><p class="small muted">${dayName(s.started_at.slice(0, 10), true)} · ${timeOf(s.started_at)} · ${({ healthkit: 'Apple Salud', manual: 'Registro manual', photo: 'Foto' })[s.primary_source] ?? s.primary_source}</p>
    <div class="stats"><div class="stat"><div class="l">Duración</div><div class="v">${dur(s.duration_s)}</div></div>
      ${s.distance_m > 0 ? html`<div class="stat"><div class="l">Distancia</div><div class="v">${(s.distance_m / 1000).toFixed(2)}<span class="u"> km</span></div></div>` : ''}
      ${s.avg_hr ? html`<div class="stat"><div class="l">FC media</div><div class="v" style="color:var(--red)">${s.avg_hr}</div></div>` : ''}
      ${s.rpe ? html`<div class="stat"><div class="l">RPE</div><div class="v">${s.rpe}</div></div>` : ''}</div>
    ${s.discipline === 'running' && s.distance_m > 0 ? html`<p class="small">Ritmo medio: <b>${pace(s.duration_s / (s.distance_m / 1000))}</b></p>` : ''}
    ${s.internal_load ? html`<p class="small muted">Carga ${n0(s.internal_load)} UA · fatiga de piernas ${n0(s.leg_index)}</p>` : ''}
    ${watch}
    ${blocks.map((b) => {
      const sets = (s.session_sets || []).filter((x) => x.block_id === b.id).sort((a, c) => a.position - c.position);
      const groups = []; for (const x of sets) { const k = x.set_label ?? ''; let g = groups.find((y) => y.k === k); if (!g) groups.push(g = { k, rows: [] }); g.rows.push(x); }
      const qty = (x) => [x.reps != null ? `${x.reps} reps` : '', x.calories != null ? `${+x.calories} cal` : '', x.distance_m != null ? `${+x.distance_m} m` : '', x.duration_s != null ? `${x.duration_s} s` : '', x.load_kg ? `${+x.load_kg} kg` : ''].filter(Boolean).join(' · ');
      const ico = { done: '✓', partial: '◐', skipped: '✕' };
      const col = (st) => (st === 'skipped' ? 'var(--red)' : st === 'partial' ? 'var(--amber)' : 'var(--green)');
      return html`<div class="card tight"><div class="row"><b class="grow">${b.title ?? ({ warmup: 'Calentamiento', strength: 'Fuerza', skill: 'Técnica', wod: 'WOD', accessory: 'Accesorios', cooldown: 'Vuelta a la calma' })[b.kind] ?? b.kind}</b>${b.scaling ? html`<span class="tag ${b.scaling === 'rx' ? 'green' : 'amber'}">${b.scaling === 'rx' ? 'RX' : 'Scaled'}</span> ` : ''}${b.format ? html`<span class="tag accent">${b.format.replace('_', ' ')}</span>` : ''}${b.rounds && !b.prescribed ? html` <span class="muted small">×${+b.rounds}</span>` : ''}</div>
      ${groups.map((g) => html`${g.k ? html`<div class="xs muted glabel" style="margin-top:6px">${g.k}</div>` : ''}${g.rows.map((x) => html`<div class="row small"><span style="width:18px;color:${col(x.status)}">${x.set_label ? ico[x.status] ?? '' : ''}</span><span class="grow" data-act="${act(() => exerciseHistory(x.exercise_id))}">${name[x.exercise_id] ?? x.exercise_id ?? 'Ejercicio'}</span><span class="muted">${x.status === 'skipped' ? 'no hecho' : qty(x)}${x.status === 'partial' && x.target_reps != null ? ` (obj. ${+x.target_reps})` : ''}</span></div>`)}`)}
      ${b.result_text ? html`<div class="ok small">Resultado: ${b.result_text}</div>` : ''}</div>`;
    })}
    <div class="grid2">${blocks.some((b) => b.prescribed) ? html`<button data-act="${act(() => editSession(id))}">✎ Editar registro</button>` : ''}<button data-act="${act(() => sessionEdits(id))}">Historial de cambios</button></div>
    <button class="block danger" data-act="${act((btn) => busy(btn, async () => { await api.db.update('sessions', { deleted_at: new Date().toISOString() }, { id: `eq.${id}` }); closeSheet(); invalidate('sessions'); render(); toast('Entreno eliminado'); }))}">Eliminar</button>`);
}

// ---------- Check-in ----------
export async function checkIn() {
  const t = today();
  const prev = (await api.db.select('checkins', { date: `eq.${t}` }))[0] ?? { fatigue: 3, soreness: 2, stress: 2, motivation: 4, sleep_quality: 3, pains: [] };
  const scale = (key, title, labels) => html`<label>${title}</label><div class="seg">${[1, 2, 3, 4, 5].map((v) => html`<button type="button" class="${prev[key] === v ? 'on' : ''}" data-act="${act((b) => { prev[key] = v; b.parentElement.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); })}">${labels[v - 1]}</button>`)}</div>`;
  const pains = prev.pains || [];
  const painForm = () => html`${pains.map((p, i) => html`<div class="card tight"><b>${p.area}</b> · ${p.intensity}/10 · ${p.character.replace('_', ' ')} <button class="sm ghost" data-act="${act(() => { pains.splice(i, 1); redraw(); })}">Quitar</button></div>`)}
    <details><summary>Añadir molestia</summary><form data-submit="${act((v, f) => { pains.push({ area: v.area, intensity: +v.intensity, character: v.character, bilateral: !!v.bilateral, affectsMovement: !!v.affects, swelling: !!v.swelling, numbness: !!v.numb, daysOngoing: +v.days, worsening: !!v.worse }); redraw(); })}">
      <label>Zona</label><input name="area" required placeholder="rodilla izquierda, gemelo…">
      <label>Intensidad (0-10)</label><input name="intensity" type="number" min="0" max="10" value="3">
      <label>Tipo</label><select name="character"><option value="difuso_muscular">Muscular difuso</option><option value="punzante">Punzante</option><option value="articular">Articular</option><option value="tendon">Tendón</option><option value="otro">Otro</option></select>
      <label>Desde hace (días)</label><input name="days" type="number" min="0" value="1">
      <label class="check"><input type="checkbox" name="bilateral"> En ambos lados</label>
      <label class="check"><input type="checkbox" name="affects"> Cambia mi forma de moverme / cojeo</label>
      <label class="check"><input type="checkbox" name="swelling"> Inflamación</label>
      <label class="check"><input type="checkbox" name="numb"> Hormigueo o pérdida de fuerza</label>
      <label class="check"><input type="checkbox" name="worse"> Va a peor</label>
      <button class="block">Añadir</button></form></details>`;
  const body = () => html`
    ${scale('fatigue', 'Fatiga', ['Fresco', 'Bien', 'Normal', 'Cansado', 'Agotado'])}
    ${scale('soreness', 'Dolor muscular', ['Nada', 'Leve', 'Medio', 'Alto', 'Mucho'])}
    ${scale('stress', 'Estrés', ['Nada', 'Poco', 'Normal', 'Alto', 'Mucho'])}
    ${scale('motivation', 'Motivación', ['Nula', 'Baja', 'Normal', 'Alta', 'Máx.'])}
    ${scale('sleep_quality', 'Calidad del sueño', ['Muy mala', 'Mala', 'Normal', 'Buena', 'Muy buena'])}
    <h3 style="margin-top:16px">Molestias</h3>${painForm()}
    <button class="primary block" data-act="${act((b) => busy(b, async () => {
      await api.db.upsert('checkins', [{ user_id: uid(), date: t, fatigue: prev.fatigue, soreness: prev.soreness, stress: prev.stress, motivation: prev.motivation, sleep_quality: prev.sleep_quality, pains }], 'user_id,date');
      const r = await api.fn('replan', { trigger: 'checkin' });
      closeSheet(); invalidate('readiness', 'planned', 'changes'); render();
      const pro = r.readiness?.pains?.find((p) => p.seeProfessional);
      toast(pro ? pro.advice : `Recuperación: ${r.readiness?.score ?? '–'}/100`, pro ? 9000 : 3500);
    }))}">Guardar</button>
    <p class="xs muted">Forja no diagnostica lesiones. Si una molestia es punzante, articular, inflama o no mejora en una semana, consulta con un fisioterapeuta o médico.</p>`;
  const redraw = () => setSheet(body());
  sheet('¿Cómo estás hoy?', body());
}

// ======================= PLAN =======================
let planOffset = 0, planDay = null;
export async function PLAN() {
  const mon = addDays(monday(), 7 * planOffset); const t = today();
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  if (!planDay || !days.includes(planDay)) planDay = days.includes(t) ? t : days[0];
  const [ses, phases, done] = await Promise.all([
    get(`planned:${mon}`, () => api.db.select('planned_sessions', { date: `gte.${mon}`, and: `(date.lte.${addDays(mon, 13)})`, order: 'date,slot' })),
    get('phases', () => api.db.select('phases', { order: 'start_date' })),
    get(`done:${mon}`, () => api.db.select('sessions', { deleted_at: 'is.null', started_at: `gte.${mon}`, and: `(started_at.lt.${addDays(mon, 7)})`, order: 'started_at' })),
  ]);
  const DC = { running: 'var(--blue)', crossfit: 'var(--accent)', hyrox: 'var(--purple)', strength: 'var(--amber)', mobility: 'var(--green)' };
  const daySes = ses.filter((s) => s.date === planDay);
  return {
    title: 'Plan',
    body: html`
      <div class="chips">${phases.filter((p) => p.kind !== 'base').map((p) => html`<span class="chip ${p.start_date <= t && t <= p.end_date ? 'on' : ''}">${phaseName(p.kind)} · ${shortDate(p.start_date)}–${shortDate(p.end_date)}</span>`)}</div>
      <div class="row"><button class="sm" data-act="${act(() => { planOffset--; render(); })}">‹</button><b class="grow" style="text-align:center">Semana del ${shortDate(mon)}</b><button class="sm" data-act="${act(() => { planOffset++; render(); })}">›</button></div>
      <div class="days">${days.map((d) => html`<button class="day ${d === planDay ? 'on' : ''} ${d === t ? 'today' : ''}" data-act="${act(() => { planDay = d; render(); })}"><div class="w">${dayName(d).split(' ')[0]}</div><div class="d">${d.slice(8)}</div><div class="dots">${ses.filter((s) => s.date === d).map((s) => raw(`<i style="background:${DC[s.discipline] ?? 'var(--muted)'}"></i>`))}</div></button>`)}</div>
      ${daySes.length ? daySes.map(plannedCard) : html`<div class="card muted">Descanso</div>`}
      ${done.filter((s) => s.started_at.slice(0, 10) === planDay).length ? html`<h2>Realizado</h2>${done.filter((s) => s.started_at.slice(0, 10) === planDay).map(sessionRow)}` : ''}
      <button class="block" data-act="${act((b) => busy(b, async () => { await api.fn('replan', { trigger: 'goal_change' }); invalidate('planned', 'phases', 'changes'); render(); toast('Semanas recalculadas'); }))}">Recalcular semanas</button>`,
  };
}

// ======================= ENTRENOS =======================
let wTab = 'historial';
export async function WORKOUTS(params = []) {
  const openWod = params[0] === 'wod';
  const right = html`<button class="icon-btn" data-act="${act(addWorkoutMenu)}">＋</button>`;
  const seg = html`<div class="seg"><button class="${wTab === 'historial' ? 'on' : ''}" data-act="${act(() => { wTab = 'historial'; render(); })}">Historial</button><button class="${wTab === 'progreso' ? 'on' : ''}" data-act="${act(() => { wTab = 'progreso'; render(); })}">Progreso</button></div>`;
  if (wTab === 'progreso') return { title: 'Entrenos', right, body: html`${seg}${await progress()}` };
  const list = await get('sessions:365', () => api.db.select('sessions', { deleted_at: 'is.null', started_at: `gte.${addDays(today(), -365)}`, order: 'started_at.desc', limit: 300 }));
  const byWeek = {};
  for (const s of list) (byWeek[monday(s.started_at.slice(0, 10))] ??= []).push(s);
  return {
    title: 'Entrenos', right,
    after: openWod ? () => { history.replaceState(null, '', '#/entrenos'); startFromText(); } : undefined,
    body: html`${seg}
      ${await draftBanner()}
      <button class="primary block" data-act="${act(() => startFromText())}">📋 Pegar entreno (Strava, notas, WhatsApp)</button>
      <div class="grid2"><button data-act="${act(startFromPhoto)}">📷 Foto de pizarra</button><button data-act="${act(manualMenu)}">✍️ Manual</button></div>
      ${Object.keys(byWeek).sort().reverse().map((w) => html`<h2>Semana del ${shortDate(w)} <small>${byWeek[w].length} sesiones</small></h2>${byWeek[w].map(sessionRow)}`)}
      ${!list.length ? html`<div class="card muted">Aún no hay entrenamientos.</div>` : ''}`,
  };
}

function addWorkoutMenu() {
  sheet('Registrar entreno', html`<button class="block primary" data-act="${act(() => startFromText())}">📋 Pegar texto</button><button class="block" data-act="${act(startFromPhoto)}">📷 Foto de pizarra o captura</button><button class="block" data-act="${act(startManual)}">🏋️ CrossFit por bloques (fuerza, WOD…)</button><button class="block" data-act="${act(manualWorkout)}">✍️ Otra actividad</button>`);
}
function manualMenu() {
  sheet('Registro manual', html`<button class="block primary" data-act="${act(startManual)}">🏋️ CrossFit por bloques (fuerza, WOD, endurance)</button><button class="block" data-act="${act(manualWorkout)}">✍️ Otra actividad (carrera, pádel, natación…)</button>`);
}

/** Compatibilidad: otras pantallas abren el pegado de texto. */
export const pasteWorkout = (prefill = '') => startFromText(prefill);

// --- Manual ---
function manualWorkout() {
  const D = [['running', 'Running'], ['crossfit', 'CrossFit'], ['hyrox', 'HYROX'], ['strength', 'Fuerza'], ['weightlifting', 'Halterofilia'], ['calisthenics', 'Calistenia'], ['swimming', 'Natación'], ['cycling', 'Ciclismo'], ['dance', 'Baile urbano'], ['hiking', 'Senderismo'], ['walking', 'Caminata'], ['skiing', 'Esquí'], ['padel', 'Pádel'], ['tennis', 'Tenis'], ['yoga', 'Yoga'], ['mobility', 'Movilidad'], ['other', 'Otra']];
  sheet('Registro manual', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      const r = await api.fn('ingest-session', { session: { id: crypto.randomUUID(), startedAt: new Date(v.start).toISOString(), durationS: +v.minutes * 60, discipline: v.discipline, title: v.title || undefined, rpe: +v.rpe, distanceM: v.km ? +String(v.km).replace(',', '.') * 1000 : undefined, elevationGainM: v.elev ? +v.elev : undefined, isRace: !!v.race, isTimeTrial: !!v.test, source: 'manual', notes: v.notes || undefined } });
      closeSheet(); invalidate('sessions', 'planned', 'readiness', 'changes'); render();
      toast([r.merged ? 'Fusionado sin duplicar' : 'Guardado', ...r.prs.map((p) => `🏆 ${p}`), ...r.changes.filter((c) => c.action !== 'mark_done').map((c) => c.reason)].join(' · '), 7000);
    }))}">
    <label>Disciplina</label><select name="discipline">${D.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
    <label>Título (opcional)</label><input name="title">
    <label>Inicio</label><input name="start" type="datetime-local" value="${new Date(Date.now() - 3600e3 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16)}">
    <div class="grid2"><div><label>Minutos</label><input name="minutes" type="number" value="60"></div><div><label>RPE (1-10)</label><input name="rpe" type="number" min="1" max="10" value="7"></div></div>
    <div class="grid2"><div><label>Km (si aplica)</label><input name="km" inputmode="decimal"></div><div><label>Desnivel + (m)</label><input name="elev" type="number"></div></div>
    <label class="check"><input type="checkbox" name="race"> Competición</label><label class="check"><input type="checkbox" name="test"> Test / contrarreloj</label>
    <label>Notas</label><textarea name="notes" placeholder="Para CrossFit es mejor «Pegar entreno»: registra ejercicios y pesos."></textarea>
    <button class="primary block">Guardar</button></form>`);
}

// --- Progreso ---
async function progress() {
  const d = await get('insights', () => api.fn('insights', {}), 300_000);
  const r = d.running; const p = r.paces;
  const recs = await get('records', () => api.db.select('personal_records', { order: 'achieved_on' }));
  const latest = Object.values(recs.reduce((a, x) => { a[`${x.metric}|${x.kind}`] = x; return a; }, {}));
  return html`
    <div class="card"><div class="row"><h3 class="grow">Tus ritmos</h3>${r.vdot ? html`<span class="tag blue">VDOT ${r.vdot.toFixed(1)}</span>` : ''}</div>
      ${p ? html`<div class="small">${[['Suave', `${pace(p.easy[0])}–${pace(p.easy[1])}`], ['Maratón', pace(p.marathon)], ['Media', pace(p.halfMarathon)], ['Umbral', pace(p.threshold)], ['Series', pace(p.interval)], ['Repeticiones', pace(p.repetition)]].map(([a, b]) => html`<div class="row"><span class="grow muted">${a}</span><b>${b}</b></div>`)}</div><p class="xs muted">${r.vdotNote}</p>`
        : html`<p class="small muted">Registra una competición o un test (márcalo como test) para calcular tus ritmos reales.</p>`}</div>
    ${r.predictions.length ? html`<div class="card"><h3>Predicciones orientativas</h3><div class="stats">${r.predictions.map((x) => html`<div class="stat"><div class="l">${({ '5k': '5K', '10k': '10K', '15k': '15K', half: 'Media', marathon: 'Maratón' })[x.key]}</div><div class="v" style="font-size:15px">${dur(x.timeS)}</div></div>`)}</div></div>` : ''}
    <div class="card"><h3>Km por semana</h3>${barChart(r.weeks.map((w) => ({ value: w.km, label: shortDate(w.week) })))}</div>
    ${r.runs.length >= 3 ? html`<div class="card"><h3>Evolución del ritmo</h3>${lineChart([{ color: 'var(--blue)', fmt: pace, points: r.runs.slice(-30).map((x) => ({ x: shortDate(x.date), y: x.paceSecPerKm })) }], { invert: true })}</div>` : ''}
    <h2>Fuerza</h2>
    <button class="block" data-act="${act(() => exerciseHistory())}">📈 Historial por ejercicio (pesos y repeticiones)</button>
    ${d.lifts.length ? d.lifts.map((l) => html`<div class="card"><h3>${l.name}</h3>
      <div class="stats"><div class="stat"><div class="l">1RM real</div><div class="v">${l.bestActual1RM ? l.bestActual1RM.kg : '–'}<span class="u"> kg</span></div></div>
        <div class="stat"><div class="l">Estimado</div><div class="v" style="color:var(--amber)">${l.bestE1RM ? l.bestE1RM.kg.toFixed(1) : '–'}</div></div>
        <div class="stat"><div class="l">De trabajo</div><div class="v" style="color:var(--accent)">${l.workingE1RM ? l.workingE1RM.kg.toFixed(1) : '–'}</div></div></div>
      ${l.history.length >= 2 ? lineChart([{ color: 'var(--amber)', points: l.history.map((h) => ({ x: shortDate(h.date), y: h.e1rm })) }], { height: 110 }) : ''}
      <p class="xs muted">${l.suggestion.explanation}</p></div>`) : html`<div class="card muted small">Registra series con peso (o pega tus WODs) y verás aquí tu evolución y tu 1RM estimado.</div>`}
    <h2>Carga</h2>
    <div class="card"><h3>Forma (azul) y fatiga (rojo)</h3>${lineChart([{ color: 'var(--blue)', points: d.fitness.map((f) => ({ x: shortDate(f.date), y: f.ctl })) }, { color: 'var(--red)', points: d.fitness.map((f) => ({ x: shortDate(f.date), y: f.atl })) }])}
      <p class="xs muted">Carga crónica de 42 días (tu forma) y aguda de 7 días (tu fatiga).</p></div>
    <h2>Récords</h2>
    ${latest.length ? latest.map((x) => html`<div class="card tight row"><div class="grow"><b>${x.detail ?? x.metric}</b><div class="xs muted">${shortDate(x.achieved_on)}</div></div><span class="tag ${x.kind === 'actual' ? 'green' : 'amber'}">${x.kind === 'actual' ? 'Real' : 'Estimado'}</span></div>`) : html`<div class="card muted small">Se guardan solos al registrar entrenamientos.</div>`}`;
}

// ======================= COACH =======================
let chat = [], threadId = null;
const SUGG = ['¿Qué entrenamiento me toca hoy?', '¿Puedo hacer series mañana después del WOD de hoy?', '¿Qué peso debería usar en back squat?', '¿Estoy progresando en running?', '¿Estoy entrenando demasiado?', 'Hoy no puedo entrenar, ¿qué hago?', '¿Qué me falta comer hoy?', '¿Qué suplemento tomo hoy?', '¿Qué debo mejorar para HYROX?'];
export async function COACH() {
  const consent = await get('consent', async () => (await api.db.select('consents', { kind: 'eq.ai_processing', revoked_at: 'is.null' })).length > 0, 300_000);
  if (!consent) return {
    title: 'Coach',
    body: html`<div class="card"><h3>Activar el entrenador IA</h3><p class="small">El coach envía a <b>Google Gemini</b> (nivel gratuito) los datos necesarios de tu perfil, entrenos, recuperación y nutrición para responderte. En el nivel gratuito, <b>Google puede usar ese contenido para mejorar sus productos</b> y revisores humanos podrían leerlo. El plan, los cálculos y el registro funcionan sin IA.</p>
      <button class="primary block" data-act="${act((b) => busy(b, async () => { await api.db.upsert('consents', [{ user_id: uid(), kind: 'ai_processing', version: '2026-11-gemini', provider: 'gemini', granted_at: new Date().toISOString(), revoked_at: null }], 'user_id,kind,version'); invalidate('consent'); render(); }))}">Acepto y activo el coach</button></div>`,
  };
  const send = async (text) => {
    const t = text.trim(); if (!t) return;
    chat.push({ role: 'user', text: t }, { role: 'bot', text: '…' }); render();
    try {
      const r = await api.fn('coach', { threadId, message: t });
      threadId = r.threadId; chat[chat.length - 1] = { role: 'bot', text: r.reply };
      if (r.tools?.includes('ajustar_plan')) invalidate('planned', 'changes');
    } catch (e) { chat[chat.length - 1] = { role: 'bot', text: `⚠️ ${e.message}` }; }
    render();
  };
  return {
    title: 'Coach',
    right: html`<button class="icon-btn" data-act="${act(() => { chat = []; threadId = null; render(); })}">🆕</button>`,
    body: html`<div style="padding-bottom:70px">
      ${!chat.length ? html`<p class="muted">Pregúntame lo que quieras. Respondo con tus datos reales.</p>${SUGG.map((s) => html`<button class="chip" style="margin:4px 4px 0 0" data-act="${act(() => send(s))}">${s}</button>`)}` : ''}
      ${chat.map((m) => html`<div class="bubble ${m.role === 'user' ? 'me' : 'bot'}">${m.text === '…' ? raw('<span class="spinner"></span>') : m.text}</div>`)}
      </div>
      <form class="chatbox" data-submit="${act((v, f) => { send(v.msg); f.reset(); })}"><textarea name="msg" placeholder="Escribe a tu entrenador…"></textarea><button class="primary">↑</button></form>`,
    after: () => window.scrollTo(0, document.body.scrollHeight),
  };
}

export { q };
