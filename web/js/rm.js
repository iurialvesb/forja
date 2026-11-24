// Tus RM: buscador de ejercicios y, por ejercicio, tu 1RM con los porcentajes (100 % → 30 %) y los kg para N repeticiones,
// para ver de un vistazo «esto al 70 %» en mitad de la clase. Datos: series registradas + RM añadidos a mano.
import * as api from './api.js';
import { get, invalidate, go, render } from './app.js';
import { html, raw, act, today, shortDate, lineChart, busy, toast } from './ui.js';
import { ic } from './icons.js';
import { EXERCISES, getExercise } from './engine/exercises.js';
import { estimate1RM, pctFor } from './engine/strength.js';
import { addRM } from './screens.js';

const LIFTS = EXERCISES.filter((e) => e.prTracked === 'load').sort((a, b) => a.name.localeCompare(b.name, 'es'));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** kg con coma, redondeado a 0,5 (lo que se puede cargar con discos de 0,25). */
const kg = (v) => (Math.round(v * 2) / 2).toLocaleString('es-ES', { maximumFractionDigits: 1 });
const fecha = (d) => `${shortDate(d)}${d.slice(0, 4) !== today().slice(0, 4) ? ` ${d.slice(0, 4)}` : ''}`;
let baseMode = 'ultimo';

async function load() {
  const [sets, recs] = await Promise.all([
    get('rm:sets', () => api.db.select('session_sets', { select: 'id,exercise_id,performed_on,reps,load_kg,status', exercise_id: 'not.is.null', load_kg: 'gt.0', status: 'neq.skipped', order: 'performed_on.desc', limit: 3000 }).catch(() => []), 300_000),
    get('records', () => api.db.select('personal_records', { order: 'achieved_on' })),
  ]);
  // Una entrada por día y ejercicio: la serie con mejor 1RM estimado (como en tu tabla de marcas)
  const by = {};
  const add = (e) => { const est = estimate1RM(e.kg, e.reps, { assumeRir: e.reps === 1 ? 0 : 1 }); if (!est || !getExercise(e.ex)) return;
    const k = `${e.ex}|${e.date}|${e.manual ? e.id : ''}`; const prev = by[k]; if (!prev || prev.e1 < est) by[k] = { ...e, e1: est }; };
  for (const s of sets) if (+s.reps >= 1 && +s.reps <= 12) add({ ex: s.exercise_id, date: s.performed_on, reps: +s.reps, kg: +s.load_kg });
  for (const r of recs) { const m = String(r.metric).match(/^(.+):(\d+)rm$/); if (m && r.kind === 'actual' && !r.session_id) add({ ex: m[1], date: r.achieved_on, reps: +m[2], kg: +r.value, manual: true, id: r.id }); }
  const per = {};
  for (const e of Object.values(by)) (per[e.ex] ??= []).push(e);
  for (const k of Object.keys(per)) per[k].sort((a, b) => b.date.localeCompare(a.date) || b.e1 - a.e1);
  return per;
}
const baseOf = (list) => { if (!list?.length) return null; const best = list.reduce((a, b) => (b.e1 > a.e1 ? b : a)); return { last: list[0], best }; };

export async function RM(params = []) {
  const per = await load();
  const id = params[0] && getExercise(params[0]) ? params[0] : null;
  return id ? detail(id, per[id] ?? []) : list(per);
}

function list(per) {
  const withData = LIFTS.filter((e) => per[e.id]).sort((a, b) => per[b.id][0].date.localeCompare(per[a.id][0].date));
  const without = LIFTS.filter((e) => !per[e.id]);
  const row = (e) => { const b = baseOf(per[e.id]); const q = norm([e.name, ...e.aliases].join(' '));
    return html`<a class="rmrow" href="#/rm/${e.id}" data-q="${q}"><span class="grow"><b>${e.name}</b>${b ? html`<small>${kg(b.last.kg)} kg × ${b.last.reps} · ${fecha(b.last.date)}</small>` : html`<small>Sin RM · añádelo</small>`}</span>
      ${b ? html`<span class="rmv">${kg(b.last.e1)}<small> kg</small></span>` : ''}${raw(ic('chevron', 16))}</a>`; };
  return {
    title: 'Tus RM', sub: 'Porcentajes de un vistazo',
    right: html`<button class="icon-btn primary" aria-label="Añadir RM" data-act="${act(() => addRM())}">${raw(ic('plus', 22))}</button>`,
    after: () => {
      const inp = document.getElementById('rmq'); if (!inp) return;
      const rows = [...document.querySelectorAll('.rmrow')], empty = document.getElementById('rmnone');
      const f = () => { const q = norm(inp.value); let n = 0; for (const r of rows) { const ok = !q || q.split(' ').every((w) => r.dataset.q.includes(w)); r.hidden = !ok || (!q && r.closest('#rmall')); if (!r.hidden) n++; }
        document.getElementById('rmall').hidden = !q; empty.hidden = n > 0; };
      inp.addEventListener('input', f);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = rows.find((r) => !r.hidden); if (first) location.hash = first.getAttribute('href'); } });
    },
    body: html`
      <div class="rmsearch">${raw(ic('search', 18))}<input id="rmq" type="search" placeholder="Buscar ejercicio: clean, sentadilla, jerk…" autocomplete="off" enterkeyhint="search" aria-label="Buscar ejercicio"></div>
      ${withData.length ? html`<div class="rmlist">${withData.map(row)}</div>` : html`<div class="card small muted">Aún no tienes RM. Toca «+» para añadir los que tengas de antes; los de tus entrenos aparecen solos.</div>`}
      <div id="rmall" class="rmlist" hidden>${without.map(row)}</div>
      <p id="rmnone" class="small muted" hidden>No encuentro ese ejercicio.</p>
      <p class="xs muted" style="margin-top:12px">El número es tu 1RM: el real si lo has hecho a 1 repetición, o el estimado con tu última serie pesada.</p>`,
  };
}

function detail(id, entries) {
  const ex = getExercise(id); const b = baseOf(entries);
  const add = html`<button class="block primary" data-act="${act(() => addRM(id))}">${raw(ic('plus', 17))} Añadir RM de ${ex.name}</button>`;
  if (!b) return { title: ex.name, sub: 'Tus RM', right: html`<button class="icon-btn" aria-label="Volver" data-act="${act(() => go('rm'))}">${raw(ic('back', 20))}</button>`,
    body: html`<div class="card small muted">Aún no hay series ni RM de ${ex.name}.</div>${add}` };
  const base = baseMode === 'mejor' ? b.best : b.last; const one = base.e1;
  const pcts = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30];
  const repsKg = [1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => [n, one * pctFor(n, 0)]);
  const hist = [...entries].sort((a, c) => a.date.localeCompare(c.date));
  return {
    title: ex.name, sub: 'Tus RM',
    right: html`<button class="icon-btn" aria-label="Volver a tus RM" data-act="${act(() => go('rm'))}">${raw(ic('back', 20))}</button>`,
    after: () => { const i = document.getElementById('rmpct'), o = document.getElementById('rmpcto'); if (!i) return;
      const f = () => { const p = +String(i.value).replace(',', '.'); o.textContent = p > 0 && p <= 120 ? `${kg((one * p) / 100)} kg` : '–'; }; i.addEventListener('input', f); f(); },
    body: html`
      <section class="rmhero">
        <div class="l">1RM ${base.reps === 1 ? 'real' : 'estimado'}</div>
        <div class="v">${kg(one)}<small> kg</small></div>
        <div class="s">${base.reps === 1 ? `levantado el ${fecha(base.date)}` : `de ${kg(base.kg)} kg × ${base.reps} · ${fecha(base.date)}`}</div>
        ${b.best !== b.last ? html`<div class="seg rmseg">${[['ultimo', 'Último'], ['mejor', 'Mejor']].map(([k, l]) => html`<button class="${baseMode === k ? 'on' : ''}" data-act="${act(() => { baseMode = k; render(); })}">${l} · ${kg((k === 'mejor' ? b.best : b.last).e1)} kg</button>`)}</div>` : ''}
      </section>
      <h2>Porcentajes</h2>
      <div class="rmgrid">${pcts.map((p) => html`<div class="rmcell ${p % 10 === 0 ? '' : 'odd'}"><span>${p} %</span><b>${kg((one * p) / 100)}</b></div>`)}</div>
      <div class="rmcustom"><label for="rmpct">Otro %</label><input id="rmpct" inputmode="decimal" placeholder="72,5" aria-describedby="rmpcto"><output id="rmpcto">–</output></div>
      <h2>Para N repeticiones</h2>
      <div class="rmgrid reps">${repsKg.map(([n, v]) => html`<div class="rmcell"><span>${n}RM</span><b>${kg(v)}</b></div>`)}</div>
      <p class="xs muted">Kg redondeados a 0,5. Las repeticiones son estimadas (Epley y Brzycki) a partir de tu 1RM.</p>
      ${hist.length >= 2 ? html`<h2>Tu evolución</h2><div class="card">${lineChart([{ name: '1RM', fmt: (v) => `${kg(v)} kg`, points: hist.map((e) => ({ x: shortDate(e.date), y: e.e1 })) }], { height: 130 })}</div>` : ''}
      <h2>Registros</h2>
      <div class="rmtable" role="table" aria-label="Registros de ${ex.name}">
        <div class="h" role="row"><span role="columnheader">Fecha</span><span role="columnheader">Reps</span><span role="columnheader">Peso</span><span role="columnheader">1RM</span><span></span></div>
        ${entries.slice(0, 30).map((e) => html`<div role="row" class="${e === base ? 'on' : ''}"><span role="cell">${fecha(e.date)}</span><span role="cell">${e.reps}</span><span role="cell">${kg(e.kg)} kg</span><span role="cell"><b>${kg(e.e1)}</b></span>
          <span role="cell">${e.manual ? html`<button class="icon-btn" aria-label="Borrar RM del ${fecha(e.date)}" data-act="${act((bt) => busy(bt, async () => { if (!confirm('¿Borrar este RM?')) return; await api.db.remove('personal_records', { id: `eq.${e.id}` }); invalidate('records', 'insights', 'rm:sets'); render(); toast('RM borrado'); }))}">${raw(ic('trash', 15))}</button>` : html`<span class="xs muted">entreno</span>`}</span></div>`)}
      </div>
      ${add}`,
  };
}
