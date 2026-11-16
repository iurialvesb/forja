// Resumen para compartir (al estilo Strava): un PNG sin fondo para poner encima de tus fotos en Instagram.
// Se dibuja en un canvas transparente; eliges letras blancas o negras, el diseño y si sale el recorrido.
import * as api from './api.js';
import { html, raw, act, sheet, setSheet, toast, dur } from './ui.js';
import { ic } from './icons.js';

const W = 1080;
const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = '"Barlow", system-ui, sans-serif';
const OUTDOOR = ['running', 'walking', 'hiking', 'cycling', 'swimming', 'skiing'];
const NAMES = { running: 'Carrera', walking: 'Caminata', hiking: 'Ruta', cycling: 'Bici', swimming: 'Natación', crossfit: 'CrossFit', hyrox: 'HYROX', hybrid: 'Híbrido', strength: 'Fuerza', weightlifting: 'Halterofilia', mobility: 'Movilidad', yoga: 'Yoga', padel: 'Pádel', tennis: 'Tenis', skiing: 'Esquí', dance: 'Baile' };

const num = (x, d = 0) => (+x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const paceOf = (secPerKm) => { const t = Math.round(secPerKm); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** Las 3 cifras que mejor cuentan el entreno, según la disciplina. */
export function shareStats(s, blocks = []) {
  const out = [];
  const km = (+s.distance_m || 0) / 1000;
  if (km > 0.2 && OUTDOOR.includes(s.discipline)) {
    out.push({ l: 'Distancia', v: num(km, km >= 100 ? 0 : 2), u: 'km' });
    if (s.discipline === 'cycling') out.push({ l: 'Velocidad', v: num(km / (s.duration_s / 3600), 1), u: 'km/h' });
    else if (s.discipline === 'swimming') out.push({ l: 'Ritmo', v: paceOf(s.duration_s / (km * 10)), u: '/100 m' });
    else out.push({ l: 'Ritmo', v: paceOf(s.duration_s / km), u: '/km' });
    out.push({ l: 'Tiempo', v: dur(s.duration_s), u: '' });
    return out;
  }
  // Gimnasio, HYROX…: el resultado del WOD manda (tiempo, rondas o lo que pusiste).
  const wod = blocks.find((b) => b.result_time_s || b.result_rounds != null || b.result_text);
  if (wod) {
    const v = wod.result_time_s ? dur(wod.result_time_s)
      : wod.result_rounds != null ? `${wod.result_rounds}${wod.result_reps ? `+${wod.result_reps}` : ''}` : String(wod.result_text).slice(0, 12);
    out.push({ l: wod.kind === 'wod' || !wod.title ? 'WOD' : wod.title.slice(0, 16), v, u: wod.result_rounds != null && !wod.result_time_s ? 'rondas' : '' });
  }
  out.push({ l: 'Tiempo', v: dur(s.duration_s), u: '' });
  if (s.avg_hr) out.push({ l: 'FC media', v: String(s.avg_hr), u: 'ppm' });
  if (out.length < 3 && s.active_kcal) out.push({ l: 'Energía', v: num(s.active_kcal), u: 'kcal' });
  if (out.length < 3 && s.max_hr) out.push({ l: 'FC máx', v: String(s.max_hr), u: 'ppm' });
  if (out.length < 3 && km > 0.2) out.push({ l: 'Distancia', v: num(km, 2), u: 'km' });
  return out.slice(0, 3);
}

function setFont(ctx, weight, size, family, italic = false) { ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`; }

/** Recorrido normalizado a una caja (w × h), conservando proporción. */
function routePath(route, w, h) {
  const lat = route.map((p) => p[0]), lon = route.map((p) => p[1]);
  const k = Math.cos(((Math.min(...lat) + Math.max(...lat)) / 2) * Math.PI / 180);
  const x0 = Math.min(...lon) * k, x1 = Math.max(...lon) * k, y0 = Math.min(...lat), y1 = Math.max(...lat);
  const sc = Math.min(w / Math.max(1e-9, x1 - x0), h / Math.max(1e-9, y1 - y0));
  const ox = (w - (x1 - x0) * sc) / 2, oy = (h - (y1 - y0) * sc) / 2;
  return route.map(([a, b]) => [ox + (b * k - x0) * sc, h - oy - (a - y0) * sc]);
}

/** Dibuja el resumen. opts: { color: 'white'|'black', layout: 'stack'|'row', route: bool, title: bool } */
export function drawShare(canvas, s, stats, route, opts) {
  const ink = opts.color === 'black' ? '#0a0a0a' : '#ffffff';
  const soft = opts.color === 'black' ? 'rgba(10,10,10,.62)' : 'rgba(255,255,255,.78)';
  const showRoute = opts.route && route?.length > 1;
  const stack = opts.layout === 'stack';
  // Alto según el contenido: el PNG queda ajustado, sin aire de sobra.
  const routeH = showRoute ? (stack ? 300 : 360) : 0;
  const statH = stack ? 172 : 190;
  const H = 40 + (opts.title ? 92 : 0) + (showRoute ? routeH + 44 : 0) + (stack ? stats.length * statH : statH) + 96;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.textBaseline = 'alphabetic';
  // Sombra muy suave: legible sobre fotos con zonas claras/oscuras sin parecer un recuadro.
  ctx.shadowColor = opts.color === 'black' ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.28)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
  const cx = W / 2;
  let y = 40;
  ctx.textAlign = 'center';
  if (opts.title) {
    setFont(ctx, 600, 46, BODY); ctx.fillStyle = soft;
    const when = new Date(s.started_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    ctx.fillText(`${(s.title || NAMES[s.discipline] || 'Entreno').slice(0, 34)} · ${when}`, cx, y + 54); ctx.fillStyle = ink;
    y += 92;
  }
  if (showRoute) {
    const bw = stack ? 520 : 760, bh = routeH;
    const pts = routePath(route, bw, bh), ox = cx - bw / 2, oy = y + 22;
    ctx.lineWidth = 11; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(ox + px, oy + py) : ctx.moveTo(ox + px, oy + py))); ctx.stroke();
    const [ex, ey] = pts[pts.length - 1]; ctx.beginPath(); ctx.arc(ox + ex, oy + ey, 15, 0, Math.PI * 2); ctx.fill();
    y += routeH + 44;
  }
  const drawStat = (st, x, top, big, lbl) => {
    setFont(ctx, 600, lbl, BODY); ctx.fillStyle = soft; ctx.fillText(st.l, x, top + lbl); ctx.fillStyle = ink;
    setFont(ctx, 800, big, FONT, true);
    const vW = ctx.measureText(st.v).width;
    setFont(ctx, 600, big * 0.38, FONT, true); const uW = st.u ? ctx.measureText(' ' + st.u).width : 0;
    const left = x - (vW + uW) / 2, base = top + lbl + big * 0.9;
    ctx.textAlign = 'left';
    setFont(ctx, 800, big, FONT, true); ctx.fillText(st.v, left, base);
    if (st.u) { setFont(ctx, 600, big * 0.38, FONT, true); ctx.fillText(' ' + st.u, left + vW, base); }
    ctx.textAlign = 'center';
  };
  if (stack) stats.forEach((st, i) => drawStat(st, cx, y + i * statH, 118, 38));
  else {
    const colW = W / stats.length, big = stats.length >= 3 ? 104 : 128;
    stats.forEach((st, i) => {
      // Que la cifra quepa en su columna aunque sea larga (1:23:45).
      let b = big; setFont(ctx, 800, b, FONT, true); while (ctx.measureText(st.v + (st.u ? ' ' + st.u : '')).width > colW - 30 && b > 56) { b -= 4; setFont(ctx, 800, b, FONT, true); }
      drawStat(st, colW * i + colW / 2, y, b, 34);
    });
  }
  y += stack ? stats.length * statH : statH;
  // Firma pequeña: el rayo de Forja + nombre.
  ctx.fillStyle = soft; setFont(ctx, 800, 38, FONT, true);
  const word = 'FORJA', tw = ctx.measureText(word).width, bolt = 30, gx = cx - (tw + bolt + 10) / 2;
  ctx.beginPath(); const by = y + 40;
  ctx.moveTo(gx + 17, by - 4); ctx.lineTo(gx + 4, by + 20); ctx.lineTo(gx + 14, by + 20); ctx.lineTo(gx + 11, by + 36); ctx.lineTo(gx + 26, by + 12); ctx.lineTo(gx + 16, by + 12); ctx.lineTo(gx + 21, by - 4); ctx.closePath(); ctx.fill();
  ctx.textAlign = 'left'; ctx.fillText(word, gx + bolt + 10, by + 32);
  return canvas;
}

const toBlob = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/png'));

/** Hoja de compartir: vista previa sobre fondo de cuadros / oscuro / claro y botones de compartir, copiar y bajar. */
export async function openShare(s, blocks = []) {
  sheet('Compartir resumen', html`<div class="center"><span class="spinner"></span></div>`);
  await Promise.allSettled([document.fonts?.load(`italic 800 100px ${FONT}`), document.fonts?.load(`600 40px ${BODY}`)]);
  const streams = OUTDOOR.includes(s.discipline) ? await api.db.select('session_streams', { session_id: `eq.${s.id}`, select: 'route' }).then((r) => r[0]).catch(() => null) : null;
  const route = streams?.route ?? null;
  const stats = shareStats(s, blocks);
  const o = { color: 'white', layout: route?.length > 1 ? 'row' : 'stack', route: route?.length > 1, title: false, bg: 'checks' };
  const canvas = document.createElement('canvas');
  const seg = (key, opts) => html`<div class="seg">${opts.map(([v, l]) => html`<button type="button" class="${o[key] === v ? 'on' : ''}" data-act="${act(() => { o[key] = v; draw(); })}">${l}</button>`)}</div>`;
  const draw = () => {
    drawShare(canvas, s, stats, route, o);
    setSheet(html`
      <div class="share-prev" data-bg="${o.bg}"><img alt="Vista previa del resumen" src="${canvas.toDataURL('image/png')}"></div>
      <div class="share-bgs">${[['checks', 'Transparente'], ['dark', 'Foto oscura'], ['light', 'Foto clara']].map(([v, l]) => html`<button type="button" class="chip ${o.bg === v ? 'on' : ''}" data-act="${act(() => { o.bg = v; draw(); })}">${l}</button>`)}</div>
      <label>Letras</label>${seg('color', [['white', 'Blancas'], ['black', 'Negras']])}
      <label>Diseño</label>${seg('layout', [['stack', 'Vertical'], ['row', 'En línea']])}
      <div class="row" style="gap:8px;margin:2px 0 14px">
        ${route?.length > 1 ? html`<button type="button" class="chip ${o.route ? 'on' : ''}" data-act="${act(() => { o.route = !o.route; draw(); })}">Recorrido</button>` : ''}
        <button type="button" class="chip ${o.title ? 'on' : ''}" data-act="${act(() => { o.title = !o.title; draw(); })}">Título y fecha</button>
      </div>
      <button class="block primary" data-act="${act(shareIt)}">${raw(ic('share', 18))} Compartir PNG</button>
      <div class="grid2"><button data-act="${act(copyIt)}">${raw(ic('copy', 17))} Copiar</button><button data-act="${act(saveIt)}">${raw(ic('download', 17))} Descargar</button></div>
      <p class="xs muted">En Instagram: crea la historia con tu foto, pulsa el icono de pegatinas y pega, o añádelo desde la galería.</p>`);
  };
  const fname = () => `forja-${s.started_at.slice(0, 10)}-${s.discipline}.png`;
  async function shareIt() {
    const blob = await toBlob(canvas); const file = new File([blob], fname(), { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    saveIt();
  }
  async function copyIt() {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(canvas) })]); toast('Copiado: pégalo como pegatina en tu historia'); }
    catch { toast('Tu navegador no deja copiar imágenes: usa Compartir o Descargar'); }
  }
  async function saveIt() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(await toBlob(canvas)); a.download = fname();
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Resumen descargado');
  }
  draw();
}
