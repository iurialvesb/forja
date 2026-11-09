// Pantalla de objetivo: Media Maratón (o cualquier carrera) y HYROX.
import * as api from './api.js';
import { get, go, invalidate, render } from './app.js';
import { html, act, sheet, closeSheet, busy, toast, dayName, shortDate, pace, dur, barChart, lineChart, bar, daysUntil } from './ui.js';
import { startHyrox } from './logbook.js';

const clockH = (s) => (s == null ? '–' : dur(s));

export async function GOAL(params = []) {
  const goals = await get('goals', () => api.db.select('goals', { status: 'eq.active', order: 'date' }));
  const g = goals.find((x) => x.id === params[0]) ?? goals[0];
  if (!g) return { title: 'Objetivo', body: html`<div class="card muted">No tienes objetivos activos. Añádelos en Perfil → Objetivos.</div>` };
  const r = await get(`goal:${g.id}`, () => api.fn('goal', { goalId: g.id }), 300_000);
  const o = r.outlook;
  const tabs = goals.length > 1 ? html`<div class="chips">${goals.map((x) => html`<button class="chip ${x.id === g.id ? 'on' : ''}" data-act="${act(() => go(`objetivo/${x.id}`))}">${x.name}</button>`)}</div>` : '';
  const head = html`<div class="card center"><div class="small muted">${dayName(g.date, true)}</div>
    <div style="font-size:52px;font-weight:800;line-height:1.1">${o.daysLeft}</div><div class="muted">días · ${o.weeksLeft} semanas</div>
    <button class="sm ghost" data-act="${act(() => editTarget(g, o))}">🎯 ${g.target_time_s ? `Objetivo ${clockH(g.target_time_s)}` : 'Poner tiempo objetivo'}</button></div>
    <div class="card tight"><div class="small" style="color:var(--accent);font-weight:700">Cómo vas</div><div>${o.verdict}</div></div>`;
  const body = o.kind === 'race' ? race(g, o) : hyrox(g, o, r.splits);
  return { title: g.name, right: html`<button class="icon-btn" data-act="${act(() => go('inicio'))}">✕</button>`, body: html`${tabs}${head}${body}${milestones(o)}${nextKey(o)}` };
}

function race(g, o) {
  return html`
    <div class="stats card">
      <div class="stat"><div class="l">Predicción hoy</div><div class="v">${clockH(o.predictedS)}</div><div class="xs muted">${o.predictedPace ? pace(o.predictedPace) : 'sin datos'}</div></div>
      <div class="stat"><div class="l">Objetivo</div><div class="v" style="color:var(--accent)">${clockH(o.targetS)}</div><div class="xs muted">${o.targetPace ? pace(o.targetPace) : '—'}</div></div>
      <div class="stat"><div class="l">Tirada larga (28 d)</div><div class="v">${o.longestRun28dKm}<span class="u"> km</span></div></div>
    </div>
    <div class="card"><h3>Kilómetros por semana</h3>${barChart(o.weeks.map((w) => ({ label: shortDate(w.week), value: w.km })), { color: 'var(--blue)', height: 120 })}</div>
    ${o.longRunPlan.length ? html`<div class="card"><h3>Progresión de la tirada larga</h3>${barChart(o.longRunPlan.map((w) => ({ label: shortDate(w.week), value: w.km })), { color: 'var(--accent)', height: 110 })}
      <p class="xs muted">Sube ~1,5 km por semana hasta el pico 3 semanas antes; después baja para llegar fresco.</p></div>` : ''}
    ${o.racePaceRuns.length ? html`<div class="card tight"><h3>Rodajes a ritmo de carrera</h3>${o.racePaceRuns.map((x) => html`<div class="row small"><span class="grow">${dayName(x.date)}</span><span>${x.km} km</span><b style="margin-left:10px">${pace(x.pace)}</b></div>`)}</div>` : ''}`;
}

function hyrox(g, o, splits) {
  const rows = o.stations.map((s) => {
    const cur = s.best?.s;
    const diff = cur != null && s.target ? cur - s.target : null;
    return html`<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <div class="grow"><div class="small" style="font-weight:600">${s.name}</div><div class="xs muted">${s.last ? `último ${dur(s.last.s)} · ${shortDate(s.last.date)}` : 'sin registros'}</div></div>
      <div style="text-align:right;min-width:70px"><div style="font-weight:700">${cur != null ? dur(cur) : '–'}</div><div class="xs muted">obj. ${s.target ? dur(s.target) : '–'}</div></div>
      <div style="width:56px;text-align:right" class="small ${diff == null ? 'muted' : diff <= 0 ? 'ok' : 'bad'}">${diff == null ? '' : `${diff > 0 ? '+' : '−'}${dur(Math.abs(diff))}`}</div></div>`;
  });
  const sims = o.simulations;
  return html`
    <div class="stats card">
      <div class="stat"><div class="l">Ritmo km objetivo</div><div class="v" style="color:var(--accent)">${o.runPaceTarget ? pace(o.runPaceTarget) : '–'}</div></div>
      <div class="stat"><div class="l">Tu ritmo comprometido</div><div class="v">${o.runPaceNow ? pace(o.runPaceNow) : '–'}</div></div>
      <div class="stat"><div class="l">Sesiones HYROX 28 d</div><div class="v">${o.hyroxSessions28d}</div></div>
    </div>
    <div class="card tight"><div class="row"><h3 class="grow">Estaciones</h3><span class="xs muted">${divisionName(o.division)}</span></div>
      <div class="xs muted">Mejor parcial frente al reparto de tu objetivo.</div>${rows}
      <div class="grid2" style="margin-top:8px"><button class="sm primary" data-act="${act(() => startHyrox(8))}">Simulación completa</button><button class="sm" data-act="${act(() => startHyrox(4))}">Media (4 estaciones)</button></div>
      <p class="xs muted">Apunta el tiempo de cada tramo (m:ss); con ⏱ cronometras la simulación entera.</p></div>
    ${sims.length >= 2 ? html`<div class="card"><h3>Simulaciones</h3>${lineChart([{ color: 'var(--accent)', points: sims.map((s) => ({ x: shortDate(s.date), y: Math.round(s.totalS / 60) })) }], { height: 120, invert: true })}<p class="xs muted">Minutos totales: más arriba = más rápido.</p></div>` : ''}
    ${splits?.length ? html`<details class="card tight"><summary class="small">Reparto completo del objetivo (${clockH(g.target_time_s)})</summary>${splits.map((s) => html`<div class="row small"><span class="grow">${s.name}</span><b>${dur(s.seconds)}</b></div>`)}</details>` : ''}`;
}

const divisionName = (d) => ({ open_men: 'Open hombres', open_women: 'Open mujeres', pro_men: 'Pro hombres', pro_women: 'Pro mujeres', doubles_men: 'Dobles hombres', doubles_women: 'Dobles mujeres', doubles_mixed: 'Dobles mixto' })[d] ?? d;

function milestones(o) {
  return html`<h2>Hitos</h2><div class="card tight">${o.milestones.map((m) => html`<div class="row" style="padding:6px 0"><span>${m.done ? '✅' : daysUntil(m.date) < 0 ? '⚠️' : '○'}</span><div class="grow small">${m.label}</div><span class="xs muted">${shortDate(m.date)}</span></div>`)}</div>`;
}
function nextKey(o) {
  if (!o.nextKey.length) return '';
  return html`<h2>Próximas sesiones clave</h2>${o.nextKey.map((p) => html`<div class="card tight row" data-act="${act(() => go('plan'))}"><div class="grow"><b class="small">${p.title}</b><div class="xs muted">${dayName(p.date)}${p.plannedKm ? ` · ${(+p.plannedKm).toFixed(1)} km` : ''}</div></div>›</div>`)}`;
}

function editTarget(g, o) {
  const isHyrox = o.kind === 'hyrox';
  sheet('Tiempo objetivo', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      const p = v.t.trim().split(':').map(Number); const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 3600 + p[1] * 60 : NaN;
      if (!s) return toast('Escribe h:mm (p. ej. 1:35)');
      await api.db.update('goals', { target_time_s: s }, { id: `eq.${g.id}` });
      if (isHyrox && v.div) await api.db.update('profiles', { hyrox_division: v.div }, { id: `eq.${api.userId()}` });
      closeSheet(); invalidate('goals', `goal:${g.id}`, 'profile'); render();
    }))}">
    <label>Tiempo (h:mm o h:mm:ss)</label><input name="t" inputmode="numeric" value="${g.target_time_s ? dur(g.target_time_s) : isHyrox ? '1:20' : '1:35'}">
    ${isHyrox ? html`<label>Categoría</label><select name="div">${['open_men', 'open_women', 'pro_men', 'pro_women', 'doubles_men', 'doubles_women', 'doubles_mixed'].map((d) => html`<option value="${d}" ${o.division === d ? 'selected' : ''}>${divisionName(d)}</option>`)}</select>` : ''}
    <button class="primary block">Guardar</button></form>
    ${o.predictedS ? html`<p class="xs muted">Hoy tu predicción es ${dur(o.predictedS)}. Un objetivo razonable a ${o.weeksLeft} semanas suele estar un 2–4 % por debajo.</p>` : ''}`);
}

export const goalCard = (g, phases, today) => {
  const ph = phases.find((p) => p.goal_id === g.id && p.start_date <= today && today <= p.end_date);
  const first = phases.find((p) => p.goal_id === g.id);
  const total = first ? Math.max(1, daysUntil(g.date) - daysUntil(first.start_date)) : 1;
  const done = first ? -daysUntil(first.start_date) : 0;
  return html`<div class="card" data-act="${act(() => go(`objetivo/${g.id}`))}"><div class="row"><h3 class="grow">${g.name}</h3><span class="tag accent">${daysUntil(g.date)} días</span><span class="muted" style="margin-left:6px">›</span></div>
    <p class="small muted">${ph ? `${ph.focus}` : 'Preparación pendiente'}${g.target_time_s ? ` · objetivo ${dur(g.target_time_s)}` : ''}</p>${bar(Math.max(0, done), total)}</div>`;
};
