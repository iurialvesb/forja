// Detalle del Apple Watch en un entreno: zonas, splits por km, gráficas de FC/ritmo/altitud, vueltas y recorrido.
import * as api from './api.js';
import { html, raw, pace, dur, lineChart } from './ui.js';

const ZC = ['#5c9eff', '#33d687', '#ffbd33', '#ff8a3d', '#ff545c'];
const mmss = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function zonesBar(z) {
  const tot = z.seconds.reduce((a, b) => a + b, 0); if (!tot) return '';
  return html`<div class="card tight"><b>Zonas de FC</b>
    <div style="display:flex;height:12px;border-radius:99px;overflow:hidden;margin:8px 0">${z.seconds.map((s, i) => raw(`<i style="width:${(s / tot) * 100}%;background:${ZC[i]}"></i>`))}</div>
    ${z.seconds.map((s, i) => html`<div class="row small"><span style="width:12px;height:12px;border-radius:4px;background:${ZC[i]};display:inline-block"></span><span class="grow">Z${i + 1}${z.bounds?.[i] ? html` <span class="muted xs">${z.bounds[i][0]}–${z.bounds[i][1]} ppm</span>` : ''}</span><b>${dur(s)}</b><span class="muted" style="width:44px;text-align:right">${Math.round((s / tot) * 100)}%</span></div>`)}</div>`;
}

function routeSvg(route) {
  if (!route || route.length < 2) return '';
  const lat = route.map((p) => p[0]), lon = route.map((p) => p[1]);
  const k = Math.cos(((Math.min(...lat) + Math.max(...lat)) / 2) * Math.PI / 180);
  const x0 = Math.min(...lon) * k, x1 = Math.max(...lon) * k, y0 = Math.min(...lat), y1 = Math.max(...lat);
  const W = 320, H = 200, pad = 10, sc = Math.min((W - 2 * pad) / Math.max(1e-9, x1 - x0), (H - 2 * pad) / Math.max(1e-9, y1 - y0));
  const pts = route.map(([a, b]) => `${(pad + (b * k - x0) * sc).toFixed(1)},${(H - pad - (a - y0) * sc).toFixed(1)}`);
  const [sx, sy] = pts[0].split(','), [ex, ey] = pts[pts.length - 1].split(',');
  return html`<div class="card tight"><b>Recorrido</b>${raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="margin-top:6px"><polyline fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/><circle cx="${sx}" cy="${sy}" r="5" fill="var(--green)"/><circle cx="${ex}" cy="${ey}" r="5" fill="var(--red)"/></svg>`)}</div>`;
}

export async function activityExtras(s) {
  const [streams, splits, laps] = await Promise.all([
    api.db.select('session_streams', { session_id: `eq.${s.id}` }).then((r) => r[0]).catch(() => null),
    s.distance_m > 0 ? api.db.select('run_splits', { session_id: `eq.${s.id}`, order: 'km_index' }).catch(() => []) : [],
    api.db.select('session_laps', { session_id: `eq.${s.id}`, order: 'idx' }).catch(() => []),
  ]);
  const out = [];
  const extra = [s.moving_s ? ['En movimiento', dur(s.moving_s)] : null, s.cadence_spm ? ['Cadencia', `${Math.round(s.cadence_spm)} ppm`] : null, s.avg_stride_m ? ['Zancada', `${(+s.avg_stride_m).toFixed(2)} m`] : null,
    s.elevation_gain_m ? ['Desnivel', `+${Math.round(s.elevation_gain_m)} / −${Math.round(s.elevation_loss_m ?? 0)} m`] : null, s.max_hr ? ['FC máx.', `${s.max_hr} ppm`] : null, s.avg_power ? ['Potencia', `${Math.round(s.avg_power)} W`] : null,
    s.active_kcal ? ['Calorías', `${Math.round(s.active_kcal)} kcal`] : null, s.max_speed_mps && s.discipline === 'running' ? ['Ritmo máx.', pace(1000 / s.max_speed_mps)] : null].filter(Boolean);
  if (extra.length) out.push(html`<div class="card tight">${extra.map(([a, b]) => html`<div class="row small"><span class="grow muted">${a}</span><b>${b}</b></div>`)}</div>`);
  if (streams?.zones?.seconds?.length) out.push(zonesBar(streams.zones));
  const se = streams?.series;
  if (se?.t?.length > 2) {
    const lbl = (i) => mmss(se.t[i]);
    if (se.hr) out.push(html`<div class="card tight"><b>Frecuencia cardíaca</b>${lineChart([{ color: 'var(--red)', points: se.hr.map((y, i) => ({ x: lbl(i), y })) }], { height: 120 })}</div>`);
    if (se.pace) { const cap = (y) => (y == null || y > 900 ? null : y); out.push(html`<div class="card tight"><b>Ritmo</b>${lineChart([{ color: 'var(--blue)', fmt: pace, points: se.pace.map((y, i) => ({ x: lbl(i), y: cap(y) })) }], { height: 120, invert: true })}</div>`); }
    if (se.alt && se.alt.some((x) => x != null)) out.push(html`<div class="card tight"><b>Altitud</b>${lineChart([{ color: 'var(--green)', points: se.alt.map((y, i) => ({ x: lbl(i), y })) }], { height: 90 })}</div>`);
    if (se.cad && s.discipline === 'running') out.push(html`<div class="card tight"><b>Cadencia</b>${lineChart([{ color: 'var(--purple)', points: se.cad.map((y, i) => ({ x: lbl(i), y })) }], { height: 90 })}</div>`);
    if (se.w && se.w.some((x) => x)) out.push(html`<div class="card tight"><b>Potencia</b>${lineChart([{ color: 'var(--amber)', points: se.w.map((y, i) => ({ x: lbl(i), y })) }], { height: 90 })}</div>`);
  }
  if (splits.length) {
    const best = Math.min(...splits.map((x) => +x.duration_s));
    out.push(html`<div class="card tight"><b>Splits por km</b>
      <div class="row xs muted" style="margin-top:6px"><span style="width:32px">km</span><span class="grow">Ritmo</span><span style="width:54px;text-align:right">FC</span><span style="width:54px;text-align:right">Cad.</span><span style="width:54px;text-align:right">Desn.</span></div>
      ${splits.map((x) => html`<div class="row small"><span style="width:32px">${x.km_index}</span><span class="grow"><b style="color:${+x.duration_s === best ? 'var(--green)' : 'inherit'}">${pace(+x.duration_s)}</b></span><span style="width:54px;text-align:right">${x.avg_hr ?? '–'}</span><span style="width:54px;text-align:right">${x.cadence_spm ? Math.round(x.cadence_spm) : '–'}</span><span style="width:54px;text-align:right">${x.elevation_delta_m != null ? `${x.elevation_delta_m > 0 ? '+' : ''}${Math.round(x.elevation_delta_m)}` : '–'}</span></div>`)}</div>`);
  }
  if (laps.length > 1) {
    out.push(html`<div class="card tight"><b>Vueltas / intervalos</b>
      ${laps.map((l) => html`<div class="row small"><span style="width:28px" class="muted">${l.idx + 1}</span><span class="grow">${dur(l.duration_s)}${l.distance_m ? ` · ${(l.distance_m / 1000).toFixed(2)} km` : ''}${l.avg_speed_mps && s.discipline === 'running' ? ` · ${pace(1000 / l.avg_speed_mps)}` : ''}</span><span class="muted">${l.avg_hr ? `${l.avg_hr} ppm` : ''}</span></div>`)}</div>`);
  }
  if (streams?.route) out.push(routeSvg(streams.route));
  return out;
}
