// Tu carrera: evolución de kilómetros, zonas de pulso, ritmos, eficiencia aeróbica y cadencia en el periodo elegido.
// Todo sale de tus sesiones de running (Apple Watch vía HealthFit/Intervals.icu o registradas a mano).
import * as api from './api.js';
import { get, go } from './app.js';
import { html, raw, act, today, addDays, monday, shortDate, pace, dur, barChart, lineChart, runSec } from './ui.js';
import { ic } from './icons.js';
import { sessionRow } from './screens.js';

const ZC = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];
const ZN = ['Z1 recuperación', 'Z2 aeróbico', 'Z3 tempo', 'Z4 umbral', 'Z5 VO₂máx'];
const es1 = (v, d = 1) => (+v).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const hm = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
const sum = (xs) => xs.reduce((a, b) => a + (+b || 0), 0);

/** «12 % más que las 12 semanas anteriores» — comparación en palabras. */
function delta(now, before, { fmt = (v) => `${Math.round(v)} %`, betterUp = true, pct = true, words = ['más', 'menos'] } = {}) {
  if (!before || now == null) return '';
  if (pct && (now / before > 3 || before / now > 3)) return html`<span class="cmp">antes: ${es1(before)}</span>`;
  const d = pct ? ((now - before) / before) * 100 : now - before;
  if (Math.abs(d) < (pct ? 3 : 1)) return html`<span class="cmp">igual que el periodo anterior</span>`;
  const good = betterUp ? d > 0 : d < 0;
  return html`<span class="cmp ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} ${d > 0 ? words[0] : words[1]} que el periodo anterior</span>`;
}

export async function RUNNING(params = []) {
  const weeks = [4, 12, 26, 52].includes(+params[0]) ? +params[0] : 12;
  const t = today(), from = addDays(monday(t), -7 * (weeks - 1)), prevFrom = addDays(from, -7 * weeks);
  const all = await get(`runs:${weeks}`, () => api.db.select('sessions', { deleted_at: 'is.null', discipline: 'eq.running', started_at: `gte.${prevFrom}`, order: 'started_at.desc' }).catch(() => []), 300_000);
  const runs = all.filter((s) => s.started_at.slice(0, 10) >= from && +s.distance_m > 0);
  const prev = all.filter((s) => s.started_at.slice(0, 10) < from && +s.distance_m > 0);
  const tot = (xs) => { const km = sum(xs.map((s) => s.distance_m)) / 1000, sec = sum(xs.map(runSec));
    const hrW = xs.filter((s) => s.avg_hr), hr = hrW.length ? sum(hrW.map((s) => s.avg_hr * s.duration_s)) / sum(hrW.map((s) => s.duration_s)) : null;
    return { km, sec, n: xs.length, pace: km ? sec / km : null, hr, elev: sum(xs.map((s) => s.elevation_gain_m)) }; };
  const T = tot(runs), P = tot(prev);
  const seg = html`<div class="seg">${[4, 12, 26, 52].map((n) => html`<button class="${weeks === n ? 'on' : ''}" data-act="${act(() => go(`carrera/${n}`))}">${n === 52 ? '1 año' : `${n} sem`}</button>`)}</div>`;
  const back = html`<button class="icon-btn" aria-label="Volver a Entrenos" data-act="${act(() => go('entrenos'))}">${raw(ic('back', 20))}</button>`;
  if (!runs.length) return { title: 'Tu carrera', sub: 'Evolución', right: back, body: html`${seg}<div class="card small muted">No hay carreras en este periodo. Llegan solas desde el Apple Watch o regístralas con «+».</div>` };

  // Semanas: km y minutos en cada zona
  const wk = [...Array(weeks)].map((_, i) => addDays(from, 7 * i));
  const inWeek = (w) => runs.filter((s) => s.started_at.slice(0, 10) >= w && s.started_at.slice(0, 10) < addDays(w, 7));
  const kmPts = wk.map((w) => ({ x: shortDate(w), label: weeks > 12 ? shortDate(w) : shortDate(w).split(' ')[0], value: Math.round(sum(inWeek(w).map((s) => s.distance_m)) / 100) / 10 }));
  const zoned = runs.filter((s) => Array.isArray(s.hr_zone_s) && sum(s.hr_zone_s) > 0);
  const zTot = [0, 1, 2, 3, 4].map((z) => sum(zoned.map((s) => s.hr_zone_s[z])));
  const zAll = sum(zTot);
  const easy = zAll ? (zTot[0] + zTot[1]) / zAll : null;
  const zPts = wk.map((w) => { const xs = inWeek(w).filter((s) => Array.isArray(s.hr_zone_s)); const z = [0, 1, 2, 3, 4].map((k) => sum(xs.map((s) => s.hr_zone_s[k])) / 60);
    return { x: shortDate(w), label: weeks > 12 ? shortDate(w) : shortDate(w).split(' ')[0], value: sum(z) / 60, segs: z.map((v, k) => ({ v: v / 60, color: ZC[k], name: ZN[k].split(' ')[0], fmt: (h) => hm(h * 3600) })) }; });
  // Ritmo y eficiencia por carrera (de más antigua a más reciente)
  const asc = [...runs].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const pacePts = asc.map((s) => ({ x: shortDate(s.started_at.slice(0, 10)), y: runSec(s) / (s.distance_m / 1000) }));
  // Eficiencia aeróbica: metros que avanzas por cada latido (sube = mismo esfuerzo, más rápido)
  const eff = asc.filter((s) => s.avg_hr > 0).map((s) => ({ x: shortDate(s.started_at.slice(0, 10)), y: s.distance_m / (s.avg_hr * (runSec(s) / 60)) }));
  const effTrend = eff.length >= 4 ? (() => { const h = Math.floor(eff.length / 2); const a = sum(eff.slice(0, h).map((p) => p.y)) / h, b = sum(eff.slice(h).map((p) => p.y)) / (eff.length - h); return (b - a) / a; })() : null;
  const cad = asc.filter((s) => +s.cadence_spm > 0).map((s) => ({ x: shortDate(s.started_at.slice(0, 10)), y: +s.cadence_spm }));
  const longest = runs.reduce((a, b) => (+b.distance_m > +a.distance_m ? b : a));
  const fastest = runs.filter((s) => +s.distance_m >= 5000).reduce((a, b) => (!a || runSec(b) / b.distance_m < runSec(a) / a.distance_m ? b : a), null);
  return {
    title: 'Tu carrera', sub: 'Evolución', right: back,
    body: html`
      ${seg}
      <section class="runkpis">
        <div><span class="l">Kilómetros</span><b>${es1(T.km)}</b>${P.n >= 2 ? delta(T.km, P.km) : ''}</div>
        <div><span class="l">Salidas</span><b>${T.n}</b><span class="cmp">${es1(T.km / T.n)} km de media</span></div>
        <div><span class="l">Ritmo medio</span><b>${T.pace ? pace(T.pace).replace('/km', '') : '–'}<small>/km</small></b>${P.n >= 2 && T.pace ? delta(T.pace, P.pace, { betterUp: false, pct: false, fmt: (v) => `${Math.round(v)} s/km`, words: ['más lento', 'más rápido'] }) : ''}</div>
        <div><span class="l">Tiempo</span><b>${hm(T.sec)}</b>${T.hr ? html`<span class="cmp">FC media ${Math.round(T.hr)} ppm</span>` : ''}</div>
        ${T.elev ? html`<div><span class="l">Desnivel +</span><b>${Math.round(T.elev)}<small> m</small></b></div>` : ''}
        <div><span class="l">Más larga</span><b>${es1(longest.distance_m / 1000)}<small> km</small></b><span class="cmp">${shortDate(longest.started_at.slice(0, 10))}</span></div>
      </section>

      <h2>Kilómetros por semana</h2>
      <div class="card">${barChart(kmPts, { name: 'Km', height: 140, fmt: (v) => `${es1(v)}`, label: (p) => p.label })}</div>

      <h2>Zonas de pulso</h2>
      ${zAll ? html`<div class="card">
        <div class="segbar tall" role="img" aria-label="${ZN.map((n, k) => `${n} ${Math.round((zTot[k] / zAll) * 100)} %`).join(', ')}">${raw(zTot.map((v, k) => (v ? `<i style="flex:${v} 0 0;background:${ZC[k]}"></i>` : '')).join(''))}</div>
        <div class="stages">${ZN.map((n, k) => html`<div class="row"><i style="background:${ZC[k]}"></i><span class="grow">${n}</span><b>${hm(zTot[k])}</b><span class="muted">${Math.round((zTot[k] / zAll) * 100)} %</span></div>`)}</div>
        <p class="small" style="margin:12px 0 0">${easy >= 0.75 ? `El ${Math.round(easy * 100)} % de tu tiempo es suave (Z1–Z2): bien repartido para una media maratón.` : `Solo el ${Math.round(easy * 100)} % de tu tiempo es suave (Z1–Z2). Para progresar sin cargarte, apunta a un 75–80 % suave y deja lo intenso para las series.`}</p>
      </div>
      <div class="card"><h3>Minutos en cada zona por semana</h3>${barChart(zPts, { name: 'Horas', height: 150, fmt: (h) => hm(h * 3600), label: (p) => p.label })}</div>`
      : html`<div class="card small muted">Tus carreras de este periodo no traen el tiempo por zonas. Llega cuando el Watch manda la frecuencia cardiaca completa.</div>`}

      <h2>Ritmo</h2>
      <div class="card">${pacePts.length >= 2 ? lineChart([{ name: 'Ritmo', fmt: pace, points: pacePts }], { invert: true, height: 140 }) : html`<p class="small muted">Con dos carreras verás la evolución.</p>`}
        ${fastest ? html`<p class="small" style="margin:8px 0 0">Tu ritmo más rápido en 5 km o más: <b>${pace(runSec(fastest) / (fastest.distance_m / 1000))}</b> (${es1(fastest.distance_m / 1000)} km, ${shortDate(fastest.started_at.slice(0, 10))}).</p>` : ''}</div>

      ${eff.length >= 3 ? html`<h2>Eficiencia aeróbica</h2>
      <div class="card">${lineChart([{ name: 'Metros por latido', fmt: (v) => `${es1(v, 2)} m`, points: eff }], { height: 130 })}
        <p class="small" style="margin:8px 0 0">Metros que avanzas por cada latido. ${effTrend == null ? '' : effTrend > 0.02 ? `Sube un ${Math.round(effTrend * 100)} %: corres más rápido con el mismo pulso.` : effTrend < -0.02 ? `Baja un ${Math.round(-effTrend * 100)} %: puede ser fatiga, calor o más carreras intensas.` : 'Estable.'}</p></div>` : ''}

      ${cad.length >= 3 ? html`<h2>Cadencia</h2><div class="card">${lineChart([{ name: 'Cadencia', fmt: (v) => `${Math.round(v)} ppm`, points: cad }], { height: 110 })}<p class="xs muted" style="margin:6px 0 0">Pasos por minuto. Entre 170 y 185 suele ser eficiente.</p></div>` : ''}

      <h2>Carreras</h2>
      ${runs.slice(0, 30).map((s) => html`<div class="runrow">${sessionRow(s)}<div class="runmeta"><span>${pace(runSec(s) / (s.distance_m / 1000))}</span>${s.avg_hr ? html`<span>${s.avg_hr} ppm</span>` : ''}${Array.isArray(s.hr_zone_s) && sum(s.hr_zone_s) ? html`<span class="segbar mini" role="img" aria-label="Zonas">${raw(s.hr_zone_s.map((v, k) => (v ? `<i style="flex:${v} 0 0;background:${ZC[k]}"></i>` : '')).join(''))}</span>` : ''}</div></div>`)}`,
  };
}
