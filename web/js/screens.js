// Pantallas: Inicio, Plan, Entrenos (historial, progreso, registrar) y Coach.
import * as api from './api.js';
import { get, invalidate, go, render } from './app.js';
import {
  html, raw, act, toast, sheet, setSheet, closeSheet, busy, today, addDays, monday, dayName, shortDate, timeOf, daysUntil, pace, dur, n0,
  icon, intensityTag, levelColor, ring, bar, barChart, lineChart, steps, resizeImage, phaseName, slotName, SLOTS, spark, dec, plural, sessionName, tbl,
} from './ui.js';
import { ic } from './icons.js';
import { EXERCISES, resolveExercise, getExercise } from './engine/exercises.js';
import { goalCard } from './goals.js';

import { activityExtras } from './activity.js';
import { startFromText, startFromPhoto, startManual, editSession, exerciseHistory, sessionEdits, draftBanner, addWodTo, joinWithWatch } from './logbook.js';

const uid = () => api.userId();
const q = (o) => o;

// ======================= INICIO =======================
export async function HOME() {
  const t = today(), mon = monday();
  const [readiness, week, goals, phases, sessions, nut, fresh, weekly, supLogs] = await Promise.all([
    get('readiness', async () => (await api.db.select('readiness_daily', { date: `eq.${t}` }))[0]),
    get(`planned:${mon}`, () => api.db.select('planned_sessions', { date: `gte.${mon}`, and: `(date.lte.${addDays(mon, 13)})`, order: 'date,slot' })),
    get('goals', () => api.db.select('goals', { status: 'eq.active', order: 'date' })),
    get('phases', () => api.db.select('phases', { order: 'start_date' })),
    get('sessions:42', () => api.db.select('sessions', { deleted_at: 'is.null', started_at: `gte.${addDays(t, -42)}`, order: 'started_at.desc' })),
    get(`nutweek:${mon}`, () => api.fn('nutrition-day', { weekStart: mon }).catch(() => null)),
    get('sessions:fresh', () => api.db.select('sessions', { select: 'id,started_at,duration_s,title,discipline,primary_source,session_blocks(id)', deleted_at: 'is.null', started_at: `gte.${addDays(t, -1)}T00:00:00Z`, discipline: 'in.(crossfit,hyrox)', order: 'started_at.desc' }).catch(() => [])),
    get('weekly', () => api.fn('weekly', {}).catch(() => null), 1_800_000),
    get(`suplog:${t}`, () => api.db.select('supplement_logs', { date: `eq.${t}` }).catch(() => [])),
  ]);
  const health = await get('health:120', () => api.db.select('daily_health', { date: `gte.${addDays(t, -120)}`, order: 'date' }).catch(() => []), 300_000);
  const todays = (week.filter((s) => s.date === t)).filter((x) => x.status !== 'skipped');
  const thisWeek = sessions.filter((s) => s.started_at.slice(0, 10) >= mon);
  const km = thisWeek.filter((s) => s.discipline === 'running').reduce((a, s) => a + (+s.distance_m || 0), 0) / 1000;
  const plannedKm = week.filter((s) => s.date <= addDays(mon, 6)).reduce((a, s) => a + (+s.planned_km || 0), 0);
  const nd = nut?.days?.find((d) => d.date === t);
  const changes = await get('changes', () => api.db.select('plan_changes', { order: 'created_at.desc', limit: 5 }));
  const last = changes.find((c) => c.action !== 'mark_done');
  const h = new Date().getHours();
  const noWod = fresh.filter((s) => s.primary_source === 'healthkit' && !(s.session_blocks || []).length);
  const rep = weekly?.reports?.find((r) => r.week_start === weekly.current && !r.seen_at);
  const H = healthSummary(health, t);
  const lvl = readiness?.level;
  const minByDay = [...Array(7)].map((_, i) => { const d = addDays(mon, i); return sessions.filter((s) => s.started_at.slice(0, 10) === d).reduce((a, s) => a + (+s.duration_s || 0), 0) / 60; });
  const w = (await get('body', () => api.db.select('body_metrics', { date: `gte.${addDays(t, -180)}`, order: 'date' }).catch(() => []), 300_000)).filter((x) => x.weight_kg != null);
  return {
    title: h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches',
    sub: dayName(t, true),
    right: html`<button class="icon-btn" aria-label="Perfil" data-act="${act(() => go('perfil'))}">${raw(ic('user', 20))}</button>`,
    body: html`
      <div class="hero" data-act="${act(checkIn)}">
        <div class="row" style="position:relative;z-index:1">
          ${ring((readiness?.score ?? 0) / 100, { verde: 'var(--color-brass)', ambar: 'var(--color-warn)', rojo: 'var(--color-error)' }[lvl] ?? 'var(--color-paper)', readiness ? readiness.score : '–', 104, 'de 100')}
          <div class="grow"><div class="status">${{ verde: 'Listo para entrenar', ambar: 'Con precaución', rojo: 'Prioriza recuperar' }[lvl] ?? 'Haz el check-in'}</div>
            <div class="small muted">${readiness?.reasons?.[0] ?? 'Toca para contarme cómo estás hoy.'}</div></div>
        </div>
        <div class="mini" role="link" tabindex="0" aria-label="Ver salud: sueño, VFC y pulso" style="cursor:pointer" data-act="${act(() => go('salud'))}">
          <div><div class="l">${raw(ic('moon', 13))} Sueño${notToday(H.sleep?.date, H.today)}</div><div class="v">${H.sleep ? html`<span data-count="${H.sleep.h}" data-fmt="sleep">${fmtSleep(H.sleep.h)}</span>` : '–'}</div></div>
          <div><div class="l">${raw(ic('pulse', 13))} VFC${notToday(H.hrv?.r?.date, H.today)}</div><div class="v">${H.hrv ? html`<span data-count="${Math.round(H.hrv.v)}">${Math.round(H.hrv.v)}</span>` : '–'}<small> ms</small></div></div>
          <div><div class="l">${raw(ic('heart', 13))} Reposo${notToday(H.rhr?.r?.date, H.today)}</div><div class="v">${H.rhr ? html`<span data-count="${H.rhr.v}">${H.rhr.v}</span>` : '–'}<small> ppm</small></div></div>
        </div>
        <a class="hero-more" href="#/salud">Ver sueño y salud por días ${raw(ic('chevron', 14))}</a>
      </div>
      ${noWod.map((s) => html`<div class="card tight row notice"><span class="bub" style="width:40px;height:40px;background:var(--accentSoft);color:var(--accent2)">${raw(ic('watch', 22))}</span><div class="grow"><b class="small">${sessionName(s)} · ${timeOf(s.started_at)}</b><div class="xs muted">Llegó del Apple Watch sin el WOD.</div></div><button class="sm primary" data-act="${act(() => addWodTo(s))}">Añadir WOD</button></div>`)}
      ${todayCard(t, todays, nd, nut, supLogs)}
      ${goals.length ? html`<h2>Objetivos</h2><div class="hscroll">${goals.map((g) => goalCard(g, phases, t))}</div>` : html`<div class="card muted small">Añade tu próxima competición en Perfil → Objetivos.</div>`}
      ${rep ? html`<details class="card report"><summary><span class="grow"><b>Tu semana</b> <span class="muted">· ${shortDate(rep.week_start)}</span><span class="line">${rep.text.split(/(?<=[.!?])\s/)[0]}</span></span>${raw(ic('chevron', 18))}</summary>
        <p class="small" style="white-space:pre-line;margin:10px 0 12px">${rep.text}</p>
        <button class="sm" data-act="${act(async () => { await api.fn('weekly', { action: 'seen', weekStart: rep.week_start }).catch(() => {}); invalidate('weekly'); render(); })}">Marcar como leído</button></details>` : ''}
      ${last ? html`<div class="card tight"><div class="xs muted">Último ajuste del plan</div><div class="small">${last.reason}</div></div>` : ''}
      <h2>Esta semana <a href="#/salud">Salud</a></h2>
      <div class="card glance" data-act="${act(() => go('salud'))}">
        <div><div class="l">Carrera</div><div class="v">${dec(km, 1)}<small> / ${Math.round(plannedKm)} km</small></div>${bar(km, Math.max(1, plannedKm))}</div>
        <div><div class="l">Entrenos</div><div class="v">${thisWeek.length}<small> · ${n0(minByDay.reduce((a, b) => a + b, 0))} min</small></div>${bar(thisWeek.length, Math.max(thisWeek.length, week.filter((x) => x.date <= addDays(mon, 6) && x.status !== 'skipped').length, 1))}</div>
        <div><div class="l">Pasos hoy</div><div class="v">${H.steps ? html`<span data-count="${Math.round(H.steps.v)}">${n0(H.steps.v)}</span>` : '–'}</div>${H.steps ? bar(H.steps.v, 8000, 'var(--green)') : ''}</div>
        <div><div class="l">Peso</div><div class="v">${w.length ? html`${dec(w[w.length - 1].weight_kg, 1)}<small> kg</small>` : '–'}</div><div class="xs muted">${w.length >= 2 ? (() => { const dlt = w[w.length - 1].weight_kg - w[Math.max(0, w.length - 8)].weight_kg; return `${dlt > 0 ? '+' : ''}${dec(dlt, 1)} kg en semanas`; })() : 'Apunta tu peso'}</div></div>
      </div>
      <h2>Última actividad <a href="#/entrenos">Todo</a></h2>
      ${sessions.slice(0, 2).map(sessionRow)}
      ${!sessions.length ? html`<div class="card muted small">Conecta el Apple Watch (Perfil → Apple Watch) o registra un entreno en Entrenos.</div>` : ''}`,
  };
}

/** «· dom» si el dato no es de hoy (el reloj aún no ha mandado el de anoche): que no parezca la última noche. */
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const notToday = (d, t) => (d && d !== t ? ` · ${DOW[new Date(`${d}T12:00:00`).getDay()]}` : '');
export const fmtSleep = (h) => (h == null ? '–' : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);
/** Últimos valores de salud (sueño de anoche, VFC, pulso en reposo, pasos) y sus series para los gráficos. */
function healthSummary(rows, t) {
  const by = Object.fromEntries(rows.map((r) => [r.date, r]));
  const lastWith = (k) => { for (let i = 0; i < 4; i++) { const r = by[addDays(t, -i)]; if (r?.[k] != null) return { r, v: +r[k] }; } return null; };
  const days = (n) => [...Array(n)].map((_, i) => by[addDays(t, -(n - 1 - i))]);
  const avg = (xs) => { const v = xs.filter((x) => x != null).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const sl = lastWith('sleep_h'), st = by[t]?.steps != null ? { v: +by[t].steps } : lastWith('steps');
  return {
    sleep: sl ? { h: sl.v, date: sl.r.date, score: sl.r.sleep_score, avg7: avg(days(7).map((r) => r?.sleep_h)) } : null,
    hrv: lastWith('hrv_ms'), rhr: lastWith('rhr'), today: t,
    steps: st ? { v: st.v, avg7: avg(days(7).map((r) => r?.steps)) } : null,
    sleepSeries: days(7).map((r) => r?.sleep_h ?? null), stepsSeries: days(7).map((r) => r?.steps ?? null),
  };
}

// ======================= SALUD =======================
// Día a día: eliges un día en la tira de arriba (o tocando una barra) y ves esa noche y ese día; debajo, la tendencia.
const STAGES = [['deep_min', 'Profundo', 'var(--seq-5)'], ['core_min', 'Básico', 'var(--seq-3)'], ['rem_min', 'REM', 'var(--seq-1)'], ['awake_min', 'Despierto', 'var(--series-2)']];
const hm = (m) => (m == null ? '–' : m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);
const num = (v) => (v == null || v === '' ? null : +v);
const asleepOf = (n) => (n && [n.deep_min, n.core_min, n.rem_min].some((v) => v != null) ? (+n.deep_min || 0) + (+n.core_min || 0) + (+n.rem_min || 0) : null);
const es1 = (v, d = 1) => (+v).toLocaleString('es-ES', { maximumFractionDigits: d });
/** «+4 sobre tu media» / «3 por debajo de tu media» — la comparación en palabras, nunca solo con color. */
function vsAvg(v, mean, fmtv, { betterUp = true, tol = 0, fmtMean = fmtv } = {}) {
  if (v == null || mean == null) return '';
  const d = v - mean; if (Math.abs(d) <= tol) return html`<span class="cmp">en tu media (${fmtMean(mean)})</span>`;
  const good = betterUp ? d > 0 : d < 0;
  return html`<span class="cmp ${good ? 'up' : 'down'}">${good ? '▲' : '▼'} ${fmtv(Math.abs(d))} ${d > 0 ? 'más' : 'menos'} que tu media (${fmtMean(mean)})</span>`;
}
function stagesFor(n, nights7) {
  if (!n || asleepOf(n) == null) return '';
  const av = (k) => { const v = nights7.map((x) => num(x[k])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const asleep = asleepOf(n); const parts = STAGES.filter(([k]) => num(n[k]) > 0);
  return html`
    <div class="segbar tall" role="img" aria-label="${parts.map(([k, l]) => `${l} ${hm(+n[k])}`).join(', ')}">${raw(parts.map(([k, , c]) => `<i style="flex:${+n[k]} 0 0;background:${c}"></i>`).join(''))}</div>
    <div class="stages">${STAGES.map(([k, l, c]) => html`<div class="row"><i style="background:${c}"></i><span class="grow">${l}</span><b>${hm(num(n[k]))}</b><span class="muted">${num(n[k]) != null && asleep && k !== 'awake_min' ? `${Math.round((+n[k] / asleep) * 100)} %` : ''}</span><span class="muted">media ${hm(av(k))}</span></div>`)}</div>`;
}
export async function HEALTH(params = []) {
  const t = today();
  const span = [7, 30, 90].includes(Number(params[0])) ? Number(params[0]) : 30;
  const [rows, sessions, nights] = await Promise.all([
    get('health:120', () => api.db.select('daily_health', { date: `gte.${addDays(t, -120)}`, order: 'date' }).catch(() => []), 300_000),
    get('sessions:42', () => api.db.select('sessions', { deleted_at: 'is.null', started_at: `gte.${addDays(t, -42)}`, order: 'started_at.desc' })),
    get('sleep:90', () => api.db.select('sleep_nights', { date: `gte.${addDays(t, -90)}`, order: 'date.desc' }).catch(() => []), 300_000),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.date, r]));
  const nb = Object.fromEntries(nights.map((n) => [n.date, n]));
  const hasDay = (d) => by[d] && ['sleep_h', 'hrv_ms', 'rhr', 'steps'].some((k) => by[d][k] != null) || nb[d];
  // Día elegido: el de la ruta, o el más reciente con datos (hoy si ya llegó la noche)
  const D = /^\d{4}-\d{2}-\d{2}$/.test(params[1] ?? '') ? params[1] : [0, 1, 2, 3].map((i) => addDays(t, -i)).find(hasDay) ?? t;
  const day = by[D] ?? {}, night = nb[D];
  const prev7 = [...Array(7)].map((_, i) => addDays(D, -(i + 1)));
  const mean = (k, src = by) => { const v = prev7.map((d) => num(src[d]?.[k])).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const sd7 = (k) => { const v = prev7.map((d) => num(by[d]?.[k])).filter((x) => x != null); const m = mean(k); return v.length > 2 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : 0; };
  const sleepH = num(day.sleep_h) ?? (asleepOf(night) != null ? asleepOf(night) / 60 : null);
  const sleepMean = (() => { const v = prev7.map((d) => num(by[d]?.sleep_h) ?? (asleepOf(nb[d]) != null ? asleepOf(nb[d]) / 60 : null)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })();
  const hrvM = mean('hrv_ms'), hrvS = sd7('hrv_ms');
  const go2 = (d, n = span) => `salud/${n}/${d}`;
  // Tira de días (14, de hoy hacia atrás): cada chip lleva una barrita con las horas de sueño
  const strip = [...Array(14)].map((_, i) => addDays(t, -i));   // más reciente a la izquierda
  const chip = (d) => { const h = num(by[d]?.sleep_h) ?? (asleepOf(nb[d]) != null ? asleepOf(nb[d]) / 60 : null); const wd = dayName(d).split(' ')[0].replace('.', '');
    return html`<a class="dchip ${d === D ? 'on' : ''} ${hasDay(d) ? '' : 'empty'}" href="#/${go2(d)}" aria-current="${d === D ? 'date' : 'false'}" aria-label="${dayName(d, true)}${h != null ? `, ${fmtSleep(h)} de sueño` : ''}">
      <span class="wd">${wd}</span><b>${d.slice(8).replace(/^0/, '')}</b><span class="mb"><i style="height:${h != null ? Math.min(100, (h / 10) * 100) : 0}%"></i></span><span class="hh">${h != null ? fmtSleep(h).replace(' ', '') : '–'}</span></a>`; };
  const dayActs = sessions.filter((s) => (s.started_at ?? '').slice(0, 10) === D);
  const metric = (label, icn, value, unit, cmp, extra = '') => html`<div class="dm"><div class="l">${raw(ic(icn, 14))} ${label}</div><div class="v">${value ?? '–'}${value != null && unit ? html`<small>${unit}</small>` : ''}</div>${cmp}${extra}</div>`;
  const metrics = [
    day.hrv_ms != null || hrvM != null ? metric('VFC', 'pulse', day.hrv_ms != null ? Math.round(+day.hrv_ms) : null, ' ms', vsAvg(num(day.hrv_ms), hrvM, (v) => `${Math.round(v)} ms`, { tol: 1, fmtMean: (v) => Math.round(v) }),
      day.hrv_ms != null && hrvM ? html`<span class="tag ${+day.hrv_ms < hrvM - hrvS ? 'amber' : 'green'}">${+day.hrv_ms < hrvM - hrvS ? 'Por debajo de tu rango' : 'En tu rango'}</span>` : '') : '',
    day.rhr != null || mean('rhr') != null ? metric('Pulso en reposo', 'heart', day.rhr != null ? +day.rhr : null, ' ppm', vsAvg(num(day.rhr), mean('rhr'), (v) => `${Math.round(v)} ppm`, { betterUp: false, tol: 1, fmtMean: (v) => Math.round(v) })) : '',
    day.steps != null || mean('steps') != null ? metric('Pasos', 'steps', day.steps != null ? n0(+day.steps) : null, '', vsAvg(num(day.steps), mean('steps'), (v) => n0(v), { tol: 300 })) : '',
    day.respiration != null ? metric('Respiración dormido', 'lungs', es1(day.respiration), ' rpm', vsAvg(num(day.respiration), mean('respiration'), (v) => `${es1(v)} rpm`, { betterUp: false, tol: 0.4, fmtMean: (v) => es1(v) })) : '',
    day.spo2 != null ? metric('Oxígeno en sangre', 'drop', es1(day.spo2), ' %', vsAvg(num(day.spo2), mean('spo2'), (v) => `${es1(v)} %`, { tol: 0.5, fmtMean: (v) => es1(v) })) : '',
    night?.wrist_temp_c != null ? (() => { const v = +night.wrist_temp_c; const abs = v > 20;
      const base = abs ? mean('wrist_temp_c', nb) : 0; const dev = base != null ? v - base : null;
      return metric('Temperatura muñeca', 'thermo', abs ? es1(v, 1) : `${v > 0 ? '+' : ''}${es1(v, 2)}`, ' °C',
        html`<span class="cmp">${dev == null ? 'Aún sin noches para comparar' : `${dev > 0 ? '+' : ''}${es1(dev, 2)} °C respecto a lo normal${Math.abs(dev) >= 0.5 ? ' · alta: atento a resfriado o fatiga' : ''}`}</span>`); })() : '',
    day.vo2max != null ? metric('VO₂máx', 'lungs', es1(day.vo2max), '', '') : '',
  ].join('');
  // Tendencia
  const days = [...Array(span)].map((_, i) => addDays(t, -(span - 1 - i)));
  const selI = days.indexOf(D);
  const lab = (d) => (span > 14 ? shortDate(d) : dayName(d).slice(0, 2));
  const anyStages = days.some((d) => asleepOf(nb[d]) != null);
  const sleepPts = days.map((d) => { const n = nb[d]; const h = num(by[d]?.sleep_h) ?? (asleepOf(n) != null ? asleepOf(n) / 60 : null);
    const segs = (src) => [...STAGES.slice(0, 3).map(([k, l, c]) => ({ v: src ? (num(src[k]) ?? 0) / 60 : 0, color: c, name: l, fmt: (v) => hm(v * 60) })), { v: src ? 0 : h ?? 0, color: 'var(--color-paper-3)', name: 'Sin fases', fmt: (v) => hm(v * 60) }];
    return anyStages ? { x: shortDate(d), label: lab(d), value: asleepOf(n) != null ? asleepOf(n) / 60 : h ?? 0, segs: segs(asleepOf(n) != null ? n : null) }
      : { x: shortDate(d), label: lab(d), value: h ?? 0, color: h != null && h < 6.5 ? 'var(--seq-1)' : undefined }; });
  const ser = (k) => days.map((d) => ({ x: shortDate(d), y: num(by[d]?.[k]), label: lab(d), value: num(by[d]?.[k]) ?? 0 }));
  const vals = (k) => days.map((d) => num(by[d]?.[k])).filter((x) => x != null);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sdv = (xs) => { const m = avg(xs); return xs.length > 2 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0; };
  const hv = vals('hrv_ms'), hmv = avg(hv), hsv = sdv(hv);
  const any = rows.some((r) => r.sleep_h != null || r.hrv_ms != null || r.steps != null);
  const hasStagesEver = nights.some((n) => asleepOf(n) != null);
  const others = sessions.filter((s) => (s.started_at ?? '').slice(0, 10) !== D).slice(0, 10);
  return {
    after: () => { const on = document.querySelector('.dstrip .dchip.on'); if (on && on.previousElementSibling) on.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); },
    title: 'Salud', sub: 'Día a día',
    right: html`<button class="icon-btn" aria-label="Cerrar" data-act="${act(() => go('inicio'))}">✕</button>`,
    body: html`
      ${!any ? html`<div class="card"><h3>Aún no llega tu salud del Watch</h3><p class="small muted">Los entrenos ya llegan; el sueño, la VFC, el pulso en reposo y los pasos se activan aparte en HealthFit:</p>
        <ol class="small"><li>Abre <b>HealthFit</b> → pestaña <b>Ajustes</b> → <b>Intervals.icu</b>.</li><li>Activa <b>Sincronizar datos de salud / Health metrics</b> (sueño, VFC, FC en reposo, peso, pasos).</li><li>Pulsa <b>Sincronizar ahora</b>. En unos minutos aparece aquí (traigo los últimos 120 días).</li></ol></div>` : ''}
      <nav class="dstrip" aria-label="Elige un día">${strip.map(chip)}</nav>
      <section class="card dcard">
        <div class="dhead">
          <button class="icon-btn" aria-label="Día anterior" data-act="${act(() => go(go2(addDays(D, -1))))}">${raw(ic('back', 18))}</button>
          <div class="grow"><h2 class="h3">${dayName(D, true)}</h2><span class="small muted">${D === t ? 'Hoy · ' : ''}noche del ${addDays(D, -1).slice(8).replace(/^0/, '')} al ${D.slice(8).replace(/^0/, '')}</span></div>
          <button class="icon-btn" aria-label="Día siguiente" ${D >= t ? 'disabled' : ''} data-act="${act(() => go(go2(addDays(D, 1))))}">${raw(ic('chevron', 18))}</button>
        </div>
        <div class="dsleep"><div class="l">${raw(ic('moon', 14))} Sueño</div>
          <div class="kpi">${sleepH != null ? fmtSleep(sleepH) : '–'}</div>
          ${vsAvg(sleepH, sleepMean, (v) => fmtSleep(v).replace(/^0h /, ''), { tol: 0.15 })}
          ${day.sleep_score != null ? html`<span class="tag">Nota ${day.sleep_score}</span>` : ''}
        </div>
        ${night && asleepOf(night) != null ? stagesFor(night, prev7.map((d) => nb[d]).filter(Boolean))
          : html`<p class="small muted" style="margin:8px 0 0">${hasStagesEver ? 'Esa noche no llegaron las fases (el Atajo no se ejecutó).' : 'Para ver profundo, REM y despertares, conecta el Atajo de Apple Salud.'}</p>
            ${hasStagesEver ? '' : html`<button class="sm ghost" style="margin-top:6px" data-act="${act(() => import('./profile.js').then((m) => m.health()))}">Configurar el Atajo</button>`}`}
        ${metrics ? html`<div class="dmetrics">${raw(metrics)}</div>` : ''}
        ${dayActs.length ? html`<div class="small" style="margin:14px 0 4px;color:var(--color-ink-2)">Entrenos de ese día</div>${dayActs.map(sessionRow)}` : ''}
      </section>
      <h2 style="margin-top:22px">Tendencia</h2>
      <div class="seg">${[7, 30, 90].map((n) => html`<button class="${span === n ? 'on' : ''}" data-act="${act(() => go(go2(D, n)))}">${n} días</button>`)}</div>
      <p class="xs muted" style="margin:6px 0 0">Toca una barra para ver ese día.</p>
      <div class="card">
        <div class="row"><h3 class="grow" style="margin:0">Sueño</h3><span class="small muted">media ${fmtSleep(avg(sleepPts.map((p) => p.value).filter((v) => v > 0)))}</span></div>
        ${anyStages ? '' : html`<div class="vlegend"><span><i style="background:var(--series-1);height:8px"></i>6,5 h o más</span><span><i style="background:var(--seq-1);height:8px"></i>Menos de 6,5 h</span><span><i style="background:var(--color-muted)"></i>Objetivo 8 h</span></div>`}
        ${barChart(sleepPts, { name: 'Sueño', height: 150, goal: 8, fmt: (v) => (v % 1 ? fmtSleep(v) : `${v} h`), label: (p) => p.label, hrefs: days.map((d) => go2(d)), selected: selI >= 0 ? selI : undefined })}
      </div>
      <div class="card">
        <div class="row"><h3 class="grow" style="margin:0">VFC</h3><span class="small muted">rango normal ${hmv ? `${Math.round(hmv - hsv)}–${Math.round(hmv + hsv)} ms` : '—'}</span></div>
        ${lineChart([{ points: ser('hrv_ms'), name: 'VFC', fmt: (v) => `${Math.round(v)} ms` }], { height: 130, band: hmv ? [hmv - hsv, hmv + hsv] : undefined })}
        <p class="xs muted" style="margin:4px 0 0">Franja verde: tu rango normal en este periodo.</p>
      </div>
      <div class="card">
        <div class="row"><h3 class="grow" style="margin:0">Pulso en reposo</h3><span class="small muted">media ${avg(vals('rhr')) ? Math.round(avg(vals('rhr'))) : '–'} ppm</span></div>
        ${lineChart([{ points: ser('rhr'), name: 'Reposo', fmt: (v) => `${Math.round(v)} ppm` }], { height: 110 })}
      </div>
      <div class="card">
        <div class="row"><h3 class="grow" style="margin:0">Pasos</h3><span class="small muted">media ${n0(avg(vals('steps')))}</span></div>
        ${barChart(ser('steps'), { name: 'Pasos', height: 120, goal: 8000, fmt: (v) => `${Math.round(v / 1000)}k`, label: (p) => p.label, hrefs: days.map((d) => go2(d)), selected: selI >= 0 ? selI : undefined })}
      </div>
      ${others.length ? html`<h2>Otras actividades recientes</h2>${others.map(sessionRow)}` : ''}
      <p class="xs muted center" style="padding:16px 0">Sueño total, VFC, pulso y pasos llegan del Apple Watch vía HealthFit e Intervals.icu; las fases y el resto, del Atajo de Apple Salud.</p>`,
  };
}

/** Tarjeta «Hoy»: entrenos, comidas y suplementos del día, cada uno con su check. */
function todayCard(t, todays, nd, nut, supLogs) {
  const taken = new Set((supLogs || []).map((l) => l.supplement_id));
  const meals = (nd?.meals ?? []).slice().sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const supps = (nut?.supplements?.recs ?? []).filter((r) => r.take && r.supplementId);
  const items = [
    ...todays.map((s) => ({ done: s.status === 'done' })),
    ...meals.map((m) => ({ done: m.status === 'eaten' || m.status === 'edited' })),
    ...supps.filter((r) => r.supplementId).map((r) => ({ done: taken.has(r.supplementId) })),
  ];
  const doneN = items.filter((x) => x.done).length;
  const ck = (on, fn, label) => html`<button class="ck ${on ? 'done' : 'pending'}" aria-label="${label}" data-act="${act(fn)}">${on ? '✓' : '○'}</button>`;
  const mealCk = (m) => async (b) => busy(b, async () => {
    const r = await api.fnQueued('meal-update', { mealId: m.id, action: m.status === 'eaten' ? 'reset' : 'eaten' });
    if (r.queued) toast('Sin conexión: se sincroniza al volver la cobertura'); invalidate('nutweek', 'pantry'); render();
  });
  const supCk = (r) => async (b) => busy(b, async () => {
    const mine = await get('supps', () => api.db.select('supplements', { active: 'eq.true' }));
    const sup = mine.find((x) => x.id === r.supplementId);
    if (taken.has(r.supplementId)) {
      await api.db.remove('supplement_logs', { date: `eq.${t}`, supplement_id: `eq.${r.supplementId}` });
      if (sup?.stock != null) await api.db.update('supplements', { stock: sup.stock + 1 }, { id: `eq.${sup.id}` });
    } else {
      await api.db.upsert('supplement_logs', [{ user_id: uid(), date: t, supplement_id: r.supplementId, taken: true }], 'user_id,date,supplement_id');
      if (sup?.stock > 0) await api.db.update('supplements', { stock: sup.stock - 1 }, { id: `eq.${sup.id}` });
    }
    invalidate('suplog', 'supps'); render();
  });
  return html`<div class="card">
    <div class="row"><h2 class="h3 grow">Hoy <small class="muted" style="font-weight:400">${dayName(t, true)}</small></h2>${items.length ? html`<span class="tag ${doneN === items.length ? 'green' : 'accent'}">${doneN}/${items.length}</span>` : ''}</div>
    ${items.length ? bar(doneN, items.length, 'var(--green)') : ''}
    <div class="xs muted" style="margin-top:8px">Entreno</div>
    ${todays.length ? todays.map((s) => { const st = planState(s); const rec = !s.from_calendar && !s.reserved && s.discipline === 'crossfit' && s.status !== 'done';
      return html`<div class="lrow ${s.status === 'done' ? 'done' : ''}">${ck(s.status === 'done', () => (s.status === 'done' ? plannedDetail(s) : markDone(s)), 'Hecho')}
        <div class="grow" data-act="${act(() => plannedDetail(s))}"><div class="small" style="font-weight:600">${cleanTitle(s.title)}</div><div class="xs muted">${[s.start_local ?? (s.slot === 'am' ? 'Mañana' : 'Tarde'), s.est_minutes ? `${s.est_minutes} min` : null, s.planned_km ? `${dec(s.planned_km, 1)} km` : null].filter(Boolean).join(' · ')}</div></div>
        ${rec ? html`<button class="sm" title="Ya la he reservado en WodBuster" data-act="${act(() => toggleReserved(s))}">${raw(ic('ticket', 17))} Reservé</button>` : st.tag}</div>`; })
      : html`<div class="small muted">Descanso. Camina, duerme bien y come suficiente.</div>`}
    ${nd ? html`<div class="row xs muted" style="margin-top:10px"><span class="grow">Comidas</span><span>${n0(nd.totals.kcal)} / ${n0(nd.target.macros.kcal)} kcal · P ${n0(nd.totals.protein)}/${n0(nd.target.macros.protein)} g</span></div>
      ${meals.length ? meals.map((m) => html`<div class="lrow ${m.status === 'eaten' ? 'done' : m.status === 'skipped' ? 'skipped' : ''}">${ck(m.status === 'eaten' || m.status === 'edited', mealCk(m), 'Comido')}
        <div class="grow" data-act="${act(() => go('nutricion/hoy'))}"><div class="small"><b style="color:var(--color-ink-2)">${slotName(m.slot)}</b> · ${m.title}</div></div></div>`) : html`<div class="small muted">Sin menú para hoy. <a href="#/nutricion/batch">Genéralo</a>.</div>`}
      ${nd.alerts?.[0] && !nd.adjustments?.length ? html`<div class="xs alert">${raw(ic('alert', 17))} ${nd.alerts[0].message}</div>` : ''}` : ''}
    ${supps.length ? html`<div class="xs muted" style="margin-top:10px">Suplementos</div>${supps.map((r) => html`<div class="lrow ${taken.has(r.supplementId) ? 'done' : ''}">${r.supplementId ? ck(taken.has(r.supplementId), supCk(r), 'Tomado') : html`<span class="ck">·</span>`}
      <div class="grow"><div class="small">${r.name}</div>${r.when ? html`<div class="xs muted">${r.when}</div>` : ''}</div></div>`)}` : ''}
  </div>`;
}

async function toggleReserved(s) {
  const on = !s.reserved;
  await api.db.update('planned_sessions', { reserved: on, locked: on }, { id: `eq.${s.id}` });
  invalidate('planned'); render();
  toast(on ? 'Marcada como reservada: el plan ya no la moverá' : 'Quitada la reserva');
}

const cleanTitle = (t) => String(t ?? '').replace(/\s*\(pendiente de reserva\)/i, ' recomendado');
/** Estado de una sesión del plan, en claro. */
function planState(s) {
  const past = s.date < today();
  if (s.status === 'done') return { tag: html`<span class="tag green">Hecha ✓</span>`, dim: false };
  if (s.status === 'skipped') return { tag: html`<span class="tag">No la hiciste</span>`, dim: true };
  if (past) return { tag: html`<span class="tag">No registrada</span>`, dim: true };
  if (s.from_calendar || s.reserved) return { tag: html`<span class="tag blue">Reservada</span>`, dim: false };
  // Pendiente: en CrossFit importa si tienes plaza; en lo demás el estado por defecto no necesita etiqueta.
  return { tag: s.discipline === 'crossfit' && !/recomendad/i.test(cleanTitle(s.title)) ? html`<span class="tag">Sin reservar</span>` : '', dim: false };
}
export const plannedCard = (s) => { const st = planState(s); return html`
  <div class="card row" data-act="${act(() => plannedDetail(s))}" style="${st.dim ? 'opacity:.55' : ''}">
    ${icon(s.discipline)}
    <div class="grow"><div style="font-weight:700">${cleanTitle(s.title)} ${s.status === 'modified' ? raw(ic('repeat', 17)) : ''}</div>
      <div class="small muted">${[s.start_local ?? (s.slot === 'am' ? 'Mañana' : 'Tarde'), s.est_minutes ? `${s.est_minutes} min` : null, s.planned_km ? `${dec(s.planned_km, 1)} km` : null].filter(Boolean).join(' · ')}</div>
      ${/pendiente de reserva|recomendado/i.test(s.title ?? '') && !s.from_calendar && !s.reserved && s.status !== 'done' ? html`<div class="xs muted">Aún no tienes clase reservada en WodBuster ese día: es la que te recomienda el plan.</div>` : s.objective ? html`<div class="small muted">${s.objective}</div>` : ''}
      <div class="row" style="gap:6px;margin-top:4px">${st.tag}${s.status !== 'done' ? intensityTag(s.intensity) : ''}</div></div>
  </div>`; };

async function markDone(s) {
  const day = s.date;
  const list = await api.db.select('sessions', { select: 'id,started_at,duration_s,title,discipline,distance_m', deleted_at: 'is.null', and: `(started_at.gte.${addDays(day, -1)}T22:00:00Z,started_at.lt.${day}T23:00:00Z)`, order: 'started_at' }).catch(() => []);
  const go2 = (sessionId) => busy(null, async () => { await api.fn('replan', { trigger: 'done', plannedId: s.id, sessionId }); closeSheet(); invalidate('planned', 'changes'); render(); toast('Marcada como hecha'); });
  sheet('¿Con qué entreno la hiciste?', html`${list.map((x) => html`<button class="block" data-act="${act(() => go2(x.id))}">${timeOf(x.started_at)} · ${sessionName(x)} · ${dur(x.duration_s)}${x.distance_m > 0 ? ` · ${dec(x.distance_m / 1000, 1)} km` : ''}</button>`)}
    <button class="block ${list.length ? 'ghost' : 'primary'}" data-act="${act(() => go2(null))}">La hice, pero no la tengo registrada</button>
    <p class="xs muted">Normalmente no hace falta: en cuanto llega un entreno de ese día y del mismo tipo (Apple Watch o registro), Forja la marca sola.</p>`);
}

function plannedDetail(s) {
  sheet(cleanTitle(s.title), html`
    <div class="row" style="gap:6px">${intensityTag(s.intensity)}${s.key ? html`<span class="tag accent">Sesión clave</span>` : ''}${s.from_calendar ? html`<span class="tag blue">Reservada</span>` : ''}</div>
    <p style="font-weight:600">${s.objective ?? ''}</p>
    <div class="stats"><div class="stat"><div class="l">Duración</div><div class="v">${s.est_minutes ?? '–'}<span class="u"> min</span></div></div>
      ${s.planned_km ? html`<div class="stat"><div class="l">Distancia</div><div class="v">${dec(s.planned_km, 1)}<span class="u"> km</span></div></div>` : ''}
      <div class="stat"><div class="l">Piernas</div><div class="v">${s.leg_stress ?? 0}<span class="u">/3</span></div></div></div>
    <div class="card tight"><div class="small" style="color:var(--color-ink-2);font-weight:700">${raw(ic('bulb', 17))} Por qué esta sesión</div><div class="small">${s.rationale ?? ''}</div></div>
    <h3>Sesión</h3>${steps(s.steps)}
    ${s.status === 'planned' || s.status === 'modified' ? html`<button class="block primary" data-act="${act(() => markDone(s))}">✓ La he hecho</button>` : ''}
    ${s.discipline === 'crossfit' && !s.from_calendar && s.status !== 'done' && s.date >= today() ? html`<button class="block" data-act="${act(async () => { await toggleReserved(s); closeSheet(); })}">${s.reserved ? 'Quitar «reservada»' : html`${raw(ic('ticket', 17))} Ya la he reservado en WodBuster`}</button>` : ''}
    ${s.status === 'done' ? html`<button class="block" data-act="${act((b) => busy(b, async () => { await api.fn('replan', { trigger: 'undone', plannedId: s.id }); closeSheet(); invalidate('planned'); render(); }))}">Desmarcar como hecha</button>` : ''}
    ${(s.status === 'planned' || s.status === 'modified') && s.date >= today() ? html`<button class="block danger" data-act="${act((b) => busy(b, async () => {
      const r = await api.fn('replan', { trigger: 'missed', plannedId: s.id }); closeSheet(); toast(r.changes?.[0]?.reason ?? 'Plan recolocado', 6000); invalidate('planned', 'changes'); render();
    }))}">No puedo hacerla</button>` : ''}`);
}

export const sessionRow = (s) => html`
  <div class="card tight row" data-act="${act(() => sessionDetail(s.id))}">
    ${icon(s.discipline)}
    <div class="grow"><div style="font-weight:600">${sessionName(s)}</div><div class="xs muted">${shortDate(s.started_at)} · ${timeOf(s.started_at)}</div></div>
    <div style="text-align:right">${s.distance_m > 0 ? html`<div style="font-weight:600">${dec(s.distance_m / 1000, 2)} km</div>` : ''}<div class="xs muted">${dur(s.duration_s)}</div></div>
  </div>`;

async function sessionDetail(id) {
  sheet('Entrenamiento', html`<div class="center"><span class="spinner"></span></div>`);
  const [s] = await api.db.select('sessions', { id: `eq.${id}`, select: '*,session_blocks(*),session_sets(*,user_exercises(name))' });
  const ex = await get('exercises', () => api.db.select('exercises', { select: 'id,name' }), 864e5);
  const name = Object.fromEntries(ex.map((e) => [e.id, e.name]));
  const blocks = (s.session_blocks || []).sort((a, b) => a.position - b.position);
  const watch = await activityExtras(s).catch(() => []);
  const GYM = ['crossfit', 'hybrid', 'hyrox', 'strength', 'weightlifting', 'gymnastics', 'calisthenics', 'other'];
  const hasLog = blocks.some((b) => b.prescribed);
  // Registro manual sin reloj: ¿hay un entreno del Apple Watch ese día al que unirlo?
  let watchMate = null;
  if (hasLog && !s.avg_hr && s.primary_source !== 'healthkit') {
    const day = s.started_at.slice(0, 10);
    const near = await api.db.select('sessions', { select: 'id,started_at,duration_s,title,avg_hr,session_blocks(id)', deleted_at: 'is.null', primary_source: 'eq.healthkit', and: `(started_at.gte.${addDays(day, -1)}T12:00:00Z,started_at.lt.${addDays(day, 1)}T12:00:00Z)`, order: 'started_at' }).catch(() => []);
    watchMate = near.find((w) => !(w.session_blocks || []).length && Math.abs(Date.parse(w.started_at) - Date.parse(s.started_at)) < 4 * 3.6e6) ?? null;
  }
  setSheet(html`
    <h3>${sessionName(s)}</h3><p class="small muted">${dayName(s.started_at.slice(0, 10), true)} · ${timeOf(s.started_at)} · ${({ healthkit: 'Apple Salud', manual: 'Registro manual', photo: 'Foto' })[s.primary_source] ?? s.primary_source}</p>
    <div class="stats"><div class="stat"><div class="l">Duración</div><div class="v">${dur(s.duration_s)}</div></div>
      ${s.distance_m > 0 ? html`<div class="stat"><div class="l">Distancia</div><div class="v">${(s.distance_m / 1000).toFixed(2).replace('.', ',')}<span class="u"> km</span></div></div>` : ''}
      ${s.avg_hr ? html`<div class="stat"><div class="l">FC media</div><div class="v">${s.avg_hr}</div></div>` : ''}
      ${s.rpe ? html`<div class="stat"><div class="l">RPE</div><div class="v">${s.rpe}</div></div>` : ''}</div>
    <button class="block share-btn" data-act="${act(async () => { const { openShare } = await import('./share.js'); openShare(s, blocks, name); })}">${raw(ic('image', 18))} Compartir resumen</button>
    ${s.discipline === 'running' && s.distance_m > 0 ? html`<p class="small">Ritmo medio: <b>${pace(s.duration_s / (s.distance_m / 1000))}</b></p>` : ''}
    ${s.internal_load ? html`<p class="small muted">Carga del entreno ${n0(s.internal_load)} · impacto en piernas ${n0(s.leg_index)}</p>` : ''}
    ${watch}
    ${blocks.map((b) => {
      const sets = (s.session_sets || []).filter((x) => x.block_id === b.id).sort((a, c) => a.position - c.position);
      const groups = []; for (const x of sets) { const k = x.set_label ?? ''; let g = groups.find((y) => y.k === k); if (!g) groups.push(g = { k, rows: [] }); g.rows.push(x); }
      const qty = (x) => [x.reps != null ? `${x.reps} reps` : '', x.calories != null ? `${+x.calories} cal` : '', x.distance_m != null ? `${+x.distance_m} m` : '', x.duration_s != null ? `${x.duration_s} s` : '', x.load_kg ? `${+x.load_kg} kg` : ''].filter(Boolean).join(' · ');
      const ico = { done: '✓', partial: '◐', skipped: '✕' };
      const col = (st) => (st === 'skipped' ? 'var(--red)' : st === 'partial' ? 'var(--amber)' : 'var(--green)');
      return html`<div class="card tight"><div class="row"><b class="grow">${b.title ?? ({ warmup: 'Calentamiento', strength: 'Fuerza', skill: 'Técnica', wod: 'WOD', accessory: 'Accesorios', cooldown: 'Vuelta a la calma' })[b.kind] ?? b.kind}</b>${b.scaling ? html`<span class="tag ${b.scaling === 'rx' ? 'green' : 'amber'}">${b.scaling === 'rx' ? 'RX' : 'Scaled'}</span> ` : ''}${b.format ? html`<span class="tag accent">${b.format.replace('_', ' ')}</span>` : ''}${b.rounds && !b.prescribed ? html` <span class="muted small">×${+b.rounds}</span>` : ''}</div>
      ${groups.map((g) => html`${g.k ? html`<div class="xs muted glabel" style="margin-top:6px">${g.k}</div>` : ''}${g.rows.map((x) => html`<div class="row small"><span style="width:18px;color:${col(x.status)}">${x.set_label ? ico[x.status] ?? '' : ''}</span><span class="grow" data-act="${act(() => exerciseHistory(x.exercise_id))}">${name[x.exercise_id] ?? x.user_exercises?.name ?? x.exercise_id ?? 'Ejercicio'}</span><span class="muted">${x.status === 'skipped' ? 'no hecho' : qty(x)}${x.status === 'partial' && x.target_reps != null ? ` (obj. ${+x.target_reps})` : ''}</span></div>`)}`)}
      ${b.result_text ? html`<div class="ok small">Resultado: ${b.result_text}</div>` : ''}</div>`;
    })}
    ${!hasLog && GYM.includes(s.discipline) ? html`<button class="block primary" data-act="${act(() => addWodTo(s))}">✎ Añadir el WOD (texto, foto o a mano)</button>` : ''}
    ${watchMate ? html`<button class="block primary" data-act="${act((b) => busy(b, async () => { await joinWithWatch(id, watchMate.id); closeSheet(); invalidate('sessions', 'planned', 'readiness', 'insights', 'exhist'); render(); toast('Unido al entreno del Apple Watch'); }))}">${raw(ic('watch', 18))} Unir con el Apple Watch (${timeOf(watchMate.started_at)} · ${Math.round(watchMate.duration_s / 60)} min${watchMate.avg_hr ? ` · ${watchMate.avg_hr} ppm` : ''})</button>` : ''}
    <div class="grid2">${hasLog ? html`<button data-act="${act(() => editSession(id))}">✎ Editar registro</button>` : ''}<button data-act="${act(async () => { const t = prompt('Nombre del entreno', s.title ?? ''); if (t == null || !t.trim()) return; await api.db.update('sessions', { title: t.trim() }, { id: `eq.${id}` }); invalidate('sessions'); render(); sessionDetail(id); })}">Renombrar</button><button data-act="${act(() => sessionEdits(id))}">Historial de cambios</button></div>
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
const madridDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
export async function PLAN() {
  const mon = addDays(monday(), 7 * planOffset); const t = today();
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  if (!planDay || !days.includes(planDay)) planDay = days.includes(t) ? t : days[0];
  const [ses, phases, done] = await Promise.all([
    get(`planned:${mon}`, () => api.db.select('planned_sessions', { date: `gte.${mon}`, and: `(date.lte.${addDays(mon, 13)})`, order: 'date,slot' })),
    get('phases', () => api.db.select('phases', { order: 'start_date' })),
    get(`done:${mon}`, () => api.db.select('sessions', { deleted_at: 'is.null', started_at: `gte.${mon}`, and: `(started_at.lt.${addDays(mon, 7)})`, order: 'started_at' })),
  ]);
  const DC = { running: 'var(--color-ink)', crossfit: 'var(--color-ink-2)', hyrox: 'var(--color-rule-2)', strength: 'var(--color-muted)', mobility: 'var(--color-success)' };
  const daySes = ses.filter((s) => s.date === planDay);
  return {
    title: 'Plan',
    body: html`
      <div class="chips">${phases.filter((p) => p.kind !== 'base').map((p) => html`<span class="chip phase ${p.start_date <= t && t <= p.end_date ? 'on' : ''}"><b>${phaseName(p.kind)}</b><small>${shortDate(p.start_date)} – ${shortDate(p.end_date)}</small></span>`)}</div>
      <div class="row"><button class="sm" data-act="${act(() => { planOffset--; render(); })}" aria-label="Anterior">${raw(ic('back', 20))}</button><b class="grow" style="text-align:center">Semana del ${shortDate(mon)}</b><button class="sm" data-act="${act(() => { planOffset++; render(); })}" aria-label="Siguiente">${raw(ic('chevron', 20))}</button></div>
      <div class="days">${days.map((d) => html`<button class="day ${d === planDay ? 'on' : ''} ${d === t ? 'today' : ''}" data-act="${act(() => { planDay = d; render(); })}"><div class="w">${dayName(d).split(' ')[0]}</div><div class="d">${d.slice(8)}</div><div class="dots">${ses.filter((s) => s.date === d && s.status !== 'skipped').map((s) => raw(`<i style="background:${DC[s.discipline] ?? 'var(--muted)'}"></i>`))}</div></button>`)}</div>
      ${(() => {
        const dayDone = done.filter((x) => madridDay(x.started_at) === planDay);
        const linked = new Map(daySes.filter((p) => p.status === 'done' && p.completed_session_id).map((p) => [p.completed_session_id, p]));
        const pending = daySes.filter((p) => p.status !== 'skipped' && !(p.status === 'done' && dayDone.some((x) => x.id === p.completed_session_id)));
        const restNote = daySes.some((p) => p.status === 'skipped') ? 'Descanso (no hiciste lo previsto; el plan ya se ha reajustado).' : 'Descanso';
        return html`${pending.length ? pending.map(plannedCard) : !dayDone.length ? html`<div class="card muted">${restNote}</div>` : ''}
          ${dayDone.length ? html`<h2>Realizado</h2>${dayDone.map((x) => html`${sessionRow(x)}${linked.get(x.id) ? html`<div class="xs" style="color:var(--green);margin:-6px 0 10px 6px">✓ Cumple el plan: ${cleanTitle(linked.get(x.id).title)}</div>` : ''}`)}` : ''}`;
      })()}
      <button class="block" data-act="${act((b) => busy(b, async () => { await api.fn('replan', { trigger: 'goal_change' }); invalidate('planned', 'phases', 'changes'); render(); toast('Semanas recalculadas'); }))}">Recalcular semanas</button>`,
  };
}

// ======================= ENTRENOS =======================
let wTab = 'historial';
export async function WORKOUTS(params = []) {
  const openWod = params[0] === 'wod';
  const right = html`<span class="row" style="gap:8px"><a class="icon-btn rmbtn" href="#/rm" aria-label="Tus RM y porcentajes">% RM</a><button class="icon-btn primary" aria-label="Registrar entreno" data-act="${act(addWorkoutMenu)}">${raw(ic('plus', 22))}</button></span>`;
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
      ${Object.keys(byWeek).sort().reverse().map((w) => html`<h2>Semana del ${shortDate(w)} <small>${plural(byWeek[w].length, 'sesión', 'sesiones')}</small></h2>${byWeek[w].map(sessionRow)}`)}
      ${!list.length ? html`<div class="card empty"><h3>Aún no hay entrenos</h3><p class="small muted">Llegan solos del Apple Watch. Para un WOD, pega la pizarra o hazle una foto.</p><button class="primary" data-act="${act(addWorkoutMenu)}">${raw(ic('plus', 17))} Registrar entreno</button></div>` : ''}`,
  };
}

function addWorkoutMenu() {
  const opt = (i, t, d, fn, primary) => html`<button class="block opt ${primary ? 'primary' : ''}" data-act="${act(fn)}">${raw(ic(i, 20))}<span class="grow"><b>${t}</b><small>${d}</small></span></button>`;
  sheet('Registrar entreno', html`${opt('clipboard', 'Pegar texto', 'Strava, notas, WhatsApp o la pizarra copiada', () => startFromText(), true)}
    ${opt('camera', 'Foto de la pizarra', 'O una captura de WodBuster', () => startFromPhoto())}
    ${opt('dumbbell', 'CrossFit a mano', 'Por bloques: fuerza, WOD, endurance', () => startManual())}
    ${opt('pen', 'Otra actividad', 'Carrera, pádel, natación…', manualWorkout)}
    ${opt('trophy', 'Un RM o marca', 'De meses anteriores o de otra app', () => addRM())}`);
}

/** Compatibilidad: otras pantallas abren el pegado de texto. */
export const pasteWorkout = (prefill = '') => startFromText(prefill);

// --- Manual ---
function manualWorkout() {
  const D = [['running', 'Running'], ['crossfit', 'CrossFit'], ['hyrox', 'HYROX'], ['strength', 'Fuerza'], ['weightlifting', 'Halterofilia'], ['calisthenics', 'Calistenia'], ['swimming', 'Natación'], ['cycling', 'Ciclismo'], ['dance', 'Baile urbano'], ['hiking', 'Senderismo'], ['walking', 'Caminata'], ['skiing', 'Esquí'], ['padel', 'Pádel'], ['tennis', 'Tenis'], ['yoga', 'Yoga'], ['mobility', 'Movilidad'], ['other', 'Otra']];
  sheet('Registro manual', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      const r = await api.fn('ingest-session', { session: { id: crypto.randomUUID(), startedAt: new Date(v.start).toISOString(), durationS: +v.minutes * 60, discipline: v.discipline, title: v.title || undefined, rpe: +v.rpe, distanceM: v.km ? +String(v.km).replace(',', '.') * 1000 : undefined, elevationGainM: v.elev ? +v.elev : undefined, isRace: !!v.race, isTimeTrial: !!v.test, source: 'manual', notes: v.notes || undefined } });
      closeSheet(); invalidate('sessions', 'planned', 'readiness', 'changes'); render();
      toast([r.merged ? 'Fusionado sin duplicar' : 'Guardado', ...r.prs.map((p) => `${p}`), ...r.changes.filter((c) => c.action !== 'mark_done').map((c) => c.reason)].join(' · '), 7000);
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

// --- RM a mano (de meses anteriores o de otra app) ---
const LIFTS = EXERCISES.filter((e) => e.prTracked === 'load').sort((a, b) => a.name.localeCompare(b.name, 'es'));
export function addRM(preset) {
  const kgOf = (v) => +String(v ?? '').replace(',', '.');
  sheet('Añadir RM', html`<form data-submit="${act((v, f) => busy(f.querySelector('button.primary'), async () => {
      const ex = getExercise(v.ex) ?? (() => { const r = resolveExercise(v.ex ?? ''); return r ? getExercise(r.id) : null; })();
      const kg = kgOf(v.kg), reps = Math.round(+v.reps || 1);
      if (!ex) return toast('Elige el ejercicio de la lista');
      if (!(kg > 0)) return toast('Escribe el peso en kg');
      if (!(reps >= 1 && reps <= 20)) return toast('Repeticiones entre 1 y 20');
      if (!v.date || v.date > today()) return toast('Pon la fecha en que lo hiciste');
      const k = String(kg).replace('.', ',');
      await api.db.insert('personal_records', [{ user_id: uid(), metric: `${ex.id}:${reps}rm`, value: kg, unit: 'kg', kind: 'actual', achieved_on: v.date, session_id: null,
        detail: `${ex.name} ${k} kg × ${reps}${v.note ? ` · ${String(v.note).slice(0, 60)}` : ''}` }]);
      closeSheet(); invalidate('records', 'insights', 'rm:sets'); render();
      toast(`${ex.name}: ${k} kg × ${reps} guardado. Ya cuenta para tus cargas.`);
    }))}">
    <label for="rm-ex">Ejercicio</label>
    <select id="rm-ex" name="ex" required>${LIFTS.map((e) => html`<option value="${e.id}" ${e.id === (preset ?? 'back_squat') ? 'selected' : ''}>${e.name}</option>`)}</select>
    <div class="grid2"><div><label for="rm-kg">Peso (kg)</label><input id="rm-kg" name="kg" inputmode="decimal" placeholder="100" required></div>
      <div><label for="rm-reps">Repeticiones</label><select id="rm-reps" name="reps">${[1, 2, 3, 4, 5, 6, 8, 10, 12, 15].map((n) => html`<option value="${n}">${n === 1 ? '1 (RM)' : `${n} (${n}RM)`}</option>`)}</select></div></div>
    <label for="rm-date">Fecha</label><input id="rm-date" type="date" name="date" value="${today()}" max="${today()}">
    <label for="rm-note">Nota (opcional)</label><input id="rm-note" name="note" placeholder="Competición, con cinturón…">
    <p class="xs muted">Cuenta como levantamiento real: Forja lo usa para tu 1RM y para calcular los pesos del plan. Si es de hace muchos meses, pesa menos que lo que levantes ahora.</p>
    <button class="block primary">Guardar RM</button></form>`);
}

// --- Progreso ---
async function progress() {
  const d = await get('insights', () => api.fn('insights', {}), 300_000);
  const r = d.running; const p = r.paces;
  const recs = await get('records', () => api.db.select('personal_records', { order: 'achieved_on' }));
  const latest = Object.values(recs.reduce((a, x) => { a[`${x.metric}|${x.kind}`] = x; return a; }, {}));
  const [bm, ns] = await Promise.all([
    get('body', () => api.db.select('body_metrics', { date: `gte.${addDays(today(), -180)}`, order: 'date' }).catch(() => []), 300_000),
    get('nutset', async () => (await api.db.select('nutrition_settings', { user_id: `eq.${uid()}` }).catch(() => []))[0], 300_000),
  ]);
  return html`
    ${bodyCard(bm, ns)}
    <div class="card"><div class="row"><h3 class="grow">Tus ritmos</h3>${r.vdot ? html`<span class="tag blue" title="Tu nivel de forma en carrera (VDOT)">Nivel ${dec(r.vdot, 1)}</span>` : ''}</div>
      ${p ? html`<div class="small">${[['Suave', `${pace(p.easy[0])}–${pace(p.easy[1])}`], ['Maratón', pace(p.marathon)], ['Media', pace(p.halfMarathon)], ['Umbral', pace(p.threshold)], ['Series', pace(p.interval)], ['Repeticiones', pace(p.repetition)]].map(([a, b]) => html`<div class="row"><span class="grow muted">${a}</span><b>${b}</b></div>`)}</div><p class="xs muted">${r.vdotNote}</p>`
        : html`<p class="small muted">Registra una competición o un test (márcalo como test) para calcular tus ritmos reales.</p>`}</div>
    ${r.predictions.length ? html`<div class="card"><h3>Predicciones orientativas</h3><div class="stats">${r.predictions.map((x) => html`<div class="stat"><div class="l">${({ '5k': '5K', '10k': '10K', '15k': '15K', half: 'Media', marathon: 'Maratón' })[x.key]}</div><div class="v" style="font-size:15px">${dur(x.timeS)}</div></div>`)}</div></div>` : ''}
    <div class="card"><h3>Km por semana</h3>${barChart(r.weeks.map((w) => ({ value: w.km, label: shortDate(w.week) })))}</div>
    ${r.runs.length >= 3 ? html`<div class="card"><h3>Evolución del ritmo</h3>${lineChart([{ fmt: pace, points: r.runs.slice(-30).map((x) => ({ x: shortDate(x.date), y: x.paceSecPerKm })) }], { invert: true })}</div>` : ''}
    <h2>Fuerza</h2>
    <a class="card rmlink" href="#/carrera"><span class="grow"><b>Tu evolución corriendo</b><small>Km, zonas de pulso, ritmo, eficiencia y cadencia</small></span>${raw(ic('chevron', 18))}</a>
    <a class="card rmlink" href="#/rm"><span class="grow"><b>Tus RM y porcentajes</b><small>Busca un ejercicio y mira el 50 %, 70 %… en kg</small></span>${raw(ic('chevron', 18))}</a>
    <div class="grid2"><button class="block" data-act="${act(() => addRM())}">${raw(ic('plus', 17))} Añadir RM</button><button class="block" data-act="${act(() => exerciseHistory())}">${raw(ic('activity', 17))} Historial por ejercicio</button></div>
    ${d.lifts.length ? d.lifts.map((l) => html`<div class="card"><h3>${l.name}</h3>
      <div class="stats"><div class="stat"><div class="l">1RM real</div><div class="v">${l.bestActual1RM ? l.bestActual1RM.kg : '–'}<span class="u"> kg</span></div></div>
        <div class="stat"><div class="l">Estimado</div><div class="v">${l.bestE1RM ? dec(l.bestE1RM.kg, 1) : '–'}</div></div>
        <div class="stat"><div class="l">De trabajo</div><div class="v" style="color:var(--color-ink-2)">${l.workingE1RM ? dec(l.workingE1RM.kg, 1) : '–'}</div></div></div>
      ${l.history.length >= 2 ? lineChart([{ points: l.history.map((h) => ({ x: shortDate(h.date), y: h.e1rm })) }], { height: 110 }) : ''}
      <button class="sm ghost" data-act="${act(() => addRM(l.exerciseId))}">${raw(ic('plus', 15))} RM de ${l.name}</button>
      <p class="xs muted">${l.suggestion.explanation}</p></div>`) : html`<div class="card muted small">Registra series con peso (o pega tus WODs) y verás aquí tu evolución y tu 1RM estimado.</div>`}
    <h2>Carga</h2>
    ${await loadCard()}
    <div class="card"><h3>Forma y fatiga</h3>${lineChart([{ name: 'Forma', points: d.fitness.map((f) => ({ x: shortDate(f.date), y: f.ctl })) }, { name: 'Fatiga', points: d.fitness.map((f) => ({ x: shortDate(f.date), y: f.atl })) }])}
      <p class="xs muted">Carga crónica de 42 días (tu forma) y aguda de 7 días (tu fatiga).</p></div>
    <h2>Récords</h2>
    ${latest.length ? latest.sort((a, b) => b.achieved_on.localeCompare(a.achieved_on)).map((x) => html`<div class="card tight row"><div class="grow"><b>${x.detail ?? x.metric}</b><div class="xs muted">${shortDate(x.achieved_on)}${x.achieved_on.slice(0, 4) !== today().slice(0, 4) ? ` ${x.achieved_on.slice(0, 4)}` : ''}${x.session_id ? '' : ' · añadido a mano'}</div></div><span class="tag ${x.kind === 'actual' ? 'green' : 'amber'}">${x.kind === 'actual' ? 'Real' : 'Estimado'}</span>
      ${x.session_id ? '' : html`<button class="icon-btn" aria-label="Borrar ${x.detail ?? x.metric}" data-act="${act((b) => busy(b, async () => { if (!confirm('¿Borrar este RM?')) return; await api.db.remove('personal_records', { id: `eq.${x.id}` }); invalidate('records', 'insights'); render(); }))}">${raw(ic('trash', 16))}</button>`}</div>`) : html`<div class="card muted small">Se guardan solos al registrar entrenamientos. Los de antes, añádelos con «Añadir RM».</div>`}`;
}

/** Carga de esta semana frente a tu media (ratio agudo:crónico) y fatiga de piernas, en palabras. */
async function loadCard() {
  const rd = await get('readiness', async () => (await api.db.select('readiness_daily', { date: `eq.${today()}` }))[0]);
  if (!rd || (rd.acwr == null && rd.leg_fatigue == null)) return '';
  const a = rd.acwr != null ? +rd.acwr : null, lf = rd.leg_fatigue != null ? +rd.leg_fatigue : null;
  const aTxt = a == null ? '' : a > 1.5 ? 'Subida brusca: riesgo de lesión' : a > 1.3 ? 'Subiendo rápido' : a < 0.8 ? 'Por debajo de lo habitual' : 'Equilibrada';
  return html`<div class="card">
    ${a != null ? html`<div class="row"><div class="grow"><div class="small" style="font-weight:650">Carga esta semana frente a tu media</div><div class="xs muted">${aTxt}. Lo sano: entre 0,8 y 1,3.</div></div><div class="kpi">${dec(a, 2)}</div></div>` : ''}
    ${lf != null ? html`<div class="row xs muted" style="margin-top:14px"><span class="grow">Fatiga de piernas · ${lf >= 250 ? 'alta' : lf >= 140 ? 'moderada' : 'baja'}</span><span>${Math.round(lf)} de 350</span></div>${bar(lf, 350, lf >= 250 ? 'var(--red)' : lf >= 140 ? 'var(--amber)' : 'var(--green)')}` : ''}
  </div>`;
}

/** Peso y cintura frente a tu objetivo nutricional (tendencia de 4 semanas). */
function bodyCard(rows, ns) {
  const f = (x, d = 1) => (+x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const byDay = {}; for (const r of rows) { const x = (byDay[r.date] ??= { date: r.date }); if (r.weight_kg != null) x.kg = +r.weight_kg; if (r.waist_cm != null) x.waist = +r.waist_cm; }
  const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  const w = days.filter((d) => d.kg != null), wa = days.filter((d) => d.waist != null);
  // Tendencia: pendiente por mínimos cuadrados de las 4 últimas semanas (kg/semana).
  const recent = w.filter((d) => d.date >= addDays(today(), -28));
  let slope = null;
  if (recent.length >= 3) { const xs = recent.map((d) => (Date.parse(d.date) - Date.parse(recent[0].date)) / 864e5), ys = recent.map((d) => d.kg); const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length; const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0); slope = den ? (xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den) * 7 : null; }
  const mode = ns?.mode; const rate = ns?.rate_kg_per_week != null ? +ns.rate_kg_per_week : mode === 'definicion' ? -0.4 : mode === 'volumen' ? 0.25 : 0;
  const verdict = slope == null ? 'Pésate 2-3 veces por semana (mismo momento, en ayunas) para ver la tendencia.'
    : mode === 'definicion' ? (slope <= -0.15 ? `Bajando ${f(Math.abs(slope), 2)} kg/semana: vas bien${slope < -0.8 ? ', aunque algo rápido: cuidado con el rendimiento' : ''}.` : 'Peso estable: si la cintura tampoco baja, te ajusto las calorías.')
    : mode === 'volumen' ? (slope >= 0.1 ? `Subiendo ${f(slope, 2)} kg/semana: en rango.` : 'No estás subiendo: conviene comer algo más.')
    : `Tendencia ${slope >= 0 ? '+' : ''}${f(slope, 2)} kg/semana.`;
  return html`<div class="card"><div class="row"><h2 class="h3 grow">Cuerpo</h2><button class="sm" data-act="${act(addBody)}">${raw(ic('plus', 17))} Peso / cintura</button></div>
    <div class="stats"><div class="stat"><div class="l">Peso</div><div class="v">${w.length ? f(w[w.length - 1].kg) : '–'}<span class="u"> kg</span></div></div>
      <div class="stat"><div class="l">Cintura</div><div class="v">${wa.length ? f(wa[wa.length - 1].waist) : '–'}<span class="u"> cm</span></div></div>
      <div class="stat"><div class="l">Tendencia</div><div class="v" style="font-size:16px">${slope == null ? '–' : `${slope >= 0 ? '+' : ''}${f(slope, 2)}`}<span class="u"> kg/sem</span></div><div class="xs muted">objetivo ${rate > 0 ? '+' : ''}${f(rate, 2)}</div></div></div>
    ${w.length >= 2 ? lineChart([{ fmt: (v) => f(v), points: w.map((d) => ({ x: shortDate(d.date), y: d.kg })) }], { height: 110 }) : ''}
    ${wa.length >= 2 ? html`<div class="xs muted">Cintura (cm)</div>${lineChart([{ fmt: (v) => f(v), points: wa.map((d) => ({ x: shortDate(d.date), y: d.waist })) }], { height: 90 })}` : ''}
    <p class="small">${verdict}</p></div>`;
}
function addBody() {
  sheet('Peso y cintura', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      const row = { user_id: uid(), date: v.date, source: 'manual', weight_kg: v.kg ? +String(v.kg).replace(',', '.') : null, waist_cm: v.waist ? +String(v.waist).replace(',', '.') : null };
      if (row.weight_kg == null && row.waist_cm == null) return toast('Escribe el peso o la cintura');
      await api.db.upsert('body_metrics', [row], 'user_id,date,source');
      closeSheet(); invalidate('body', 'insights', 'weekly'); render();
    }))}">
    <label>Fecha</label><input type="date" name="date" value="${today()}">
    <div class="grid2"><div><label>Peso (kg)</label><input name="kg" inputmode="decimal" placeholder="78,4"></div><div><label>Cintura (cm)</label><input name="waist" inputmode="decimal" placeholder="84"></div></div>
    <p class="xs muted">En ayunas, después del baño. La cintura, a la altura del ombligo, sin apretar.</p>
    <button class="block primary">Guardar</button></form>`);
}

// ======================= COACH =======================
let chat = [], threadId = null;
const SUGG = ['¿Qué entrenamiento me toca hoy?', '¿Puedo hacer series mañana después del WOD de hoy?', '¿Qué peso debería usar en back squat?', '¿Estoy progresando en running?', '¿Estoy entrenando demasiado?', 'Hoy no puedo entrenar, ¿qué hago?', '¿Qué me falta comer hoy?', '¿Qué suplemento tomo hoy?', '¿Qué debo mejorar para HYROX?'];
export async function COACH() {
  const consent = await get('consent', async () => (await api.db.select('consents', { kind: 'eq.ai_processing', revoked_at: 'is.null' })).length > 0, 300_000);
  if (!consent) return {
    title: 'Coach',
    body: html`<div class="card"><h3>Activar el entrenador IA</h3><p class="small">El coach envía a <b>Google Gemini</b> (tu cuenta de pago) los datos necesarios de tu perfil, entrenos, recuperación y nutrición para responderte. En las cuentas de pago Google no usa ese contenido para entrenar sus modelos. El plan, los cálculos y el registro funcionan sin IA.</p>
      <button class="primary block" data-act="${act((b) => busy(b, async () => { await api.db.upsert('consents', [{ user_id: uid(), kind: 'ai_processing', version: '2026-11-gemini', provider: 'gemini', granted_at: new Date().toISOString(), revoked_at: null }], 'user_id,kind,version'); invalidate('consent'); render(); }))}">Acepto y activo el coach</button></div>`,
  };
  const wk = await get('weekly', () => api.fn('weekly', {}).catch(() => null), 1_800_000);
  const reports = wk?.reports ?? [];
  const send = async (text) => {
    const t = text.trim(); if (!t) return;
    chat.push({ role: 'user', text: t }, { role: 'bot', text: '…' }); render();
    try {
      const r = await api.fn('coach', { threadId, message: t });
      threadId = r.threadId; chat[chat.length - 1] = { role: 'bot', text: r.reply };
      if (r.tools?.includes('ajustar_plan')) invalidate('planned', 'changes');
    } catch (e) { chat[chat.length - 1] = { role: 'bot', text: e.message, retry: t }; }
    render();
  };
  return {
    title: 'Coach',
    right: html`<button class="icon-btn" data-act="${act(() => { chat = []; threadId = null; render(); })}" aria-label="Nueva conversación">${raw(ic('plus', 20))}</button>`,
    body: html`<div style="padding-bottom:70px">
      ${!chat.length ? html`<p class="muted">Pregúntame lo que quieras. Respondo con tus datos reales.</p>${SUGG.map((s) => html`<button class="chip" style="margin:4px 4px 0 0" data-act="${act(() => send(s))}">${s}</button>`)}
        <h2>Resúmenes semanales</h2>
        ${reports.slice(0, 3).map((r) => html`<div class="card tight"><div class="small" style="color:var(--color-ink-2);font-weight:700">Semana del ${shortDate(r.week_start)}</div><p class="small" style="white-space:pre-line;margin:4px 0 0">${r.text}</p></div>`)}
        ${!reports.length ? html`<p class="xs muted">Cada domingo a las 20:00 te dejo aquí el resumen de la semana (y te aviso).</p>` : ''}
        <button class="block sm" data-act="${act((b) => busy(b, async () => { await api.fn('weekly', { action: 'build' }); invalidate('weekly'); render(); }))}">Hacer el resumen ${reports.some((r) => r.week_start === wk?.current) ? 'otra vez' : 'ahora'}</button>` : ''}
      ${chat.map((m, i) => html`<div class="bubble ${m.role === 'user' ? 'me' : 'bot'}">${m.text === '…' ? raw('<span class="spinner"></span>') : m.text}${m.retry ? html`<div><button class="sm" style="margin-top:8px" data-act="${act(() => { chat.splice(i - 1, 2); send(m.retry); })}">↻ Reintentar</button></div>` : ''}</div>`)}
      </div>
      <form class="chatbox" data-submit="${act((v, f) => { send(v.msg); f.reset(); })}"><textarea name="msg" placeholder="Escribe a tu entrenador…"></textarea><button class="primary">↑</button></form>`,
    after: () => window.scrollTo(0, document.body.scrollHeight),
  };
}

export { q };
