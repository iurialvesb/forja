import { ic } from './icons.js';
// Utilidades de interfaz: plantillas seguras, acciones, hojas modales, avisos, formato y gráficos SVG.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const flat = (v) => (v == null || v === false ? '' : Array.isArray(v) ? v.map(flat).join('') : v instanceof Raw ? v.s : esc(v));
/** Plantilla: escapa todo salvo lo que venga de html``/raw(). */
export const html = (strings, ...vals) => raw(strings.reduce((a, s, i) => a + s + (i < vals.length ? flat(vals[i]) : ''), ''));

// Registro de acciones (se limpia en cada render de pantalla completa).
let handlers = new Map(); let seq = 0;
export const act = (fn) => { const k = `a${++seq}`; handlers.set(k, fn); return k; };
export const resetActs = () => { handlers = new Map(); };
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const h = handlers.get(el.dataset.act); if (!h) return;
  e.preventDefault(); h(el, e);
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el) handlers.get(el.dataset.change)?.(el, e); });
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]'); if (!f) return;
  e.preventDefault(); handlers.get(f.dataset.submit)?.(Object.fromEntries(new FormData(f)), f, e);
});

// Aviso (al estilo Sonner): sube desde abajo con una transición (interrumpible), se pausa si la app está en segundo
// plano y se descarta deslizándolo hacia abajo, por donde entró.
export function toast(msg, ms = 3200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.transform = ''; t.hidden = false;
  requestAnimationFrame(() => t.setAttribute('data-on', ''));
  clearTimeout(toast.t);
  const hide = () => { t.removeAttribute('data-on'); clearTimeout(toast.h); toast.h = setTimeout(() => { if (!t.hasAttribute('data-on')) t.hidden = true; }, 420); };
  const arm = (left) => { clearTimeout(toast.t); toast.t = setTimeout(() => (document.hidden ? arm(1500) : hide()), left); };
  arm(ms);
  if (!t.dataset.swipe) {
    t.dataset.swipe = '1'; let y0 = null, t0 = 0, dy = 0;
    t.addEventListener('pointerdown', (e) => { y0 = e.clientY; t0 = performance.now(); dy = 0; t.setPointerCapture(e.pointerId); t.style.transition = 'none'; });
    t.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = e.clientY - y0; t.style.transform = `translate(-50%, ${dy > 0 ? dy : dy * 0.2}px)`; });
    t.addEventListener('pointerup', () => { if (y0 == null) return; const v = dy / Math.max(1, performance.now() - t0); y0 = null; t.style.transition = ''; t.style.transform = '';
      if (dy > 40 || v > 0.11) { clearTimeout(toast.t); hide(); } });
  }
}

// Hoja inferior (al estilo Vaul): entra con la curva del cajón de iOS y se cierra tocando fuera, con «Cerrar» o
// arrastrándola hacia abajo. Mientras el dedo está abajo la hoja ES el dedo (1:1, sin animación); al soltar decide la
// distancia o la velocidad. Si se abre otra hoja mientras una se cierra, se reutiliza sin parpadeo.
let sheetClose = null, closing = 0;
export function sheet(title, body, onClose) {
  const el = document.getElementById('sheet');
  clearTimeout(closing);
  const wasOpen = !el.hidden && el.dataset.state === 'open';
  el.innerHTML = html`<div class="panel"><div class="grab" aria-hidden="true"></div><div class="head"><h3>${title}</h3><button class="ghost" data-act="${act(closeSheet)}">Cerrar</button></div><div id="sheet-body">${body}</div></div>`.s;
  el.hidden = false; sheetClose = onClose ?? null;
  if (wasOpen) el.dataset.state = 'open';
  else { el.dataset.state = 'closed'; void el.offsetHeight; requestAnimationFrame(() => { el.dataset.state = 'open'; }); }
  el.onclick = (e) => { if (e.target === el) closeSheet(); };
  dragToClose(el);
}
export function setSheet(body) { const b = document.getElementById('sheet-body'); if (b) b.innerHTML = flat(body); }
export function closeSheet() {
  const el = document.getElementById('sheet');
  if (el.hidden) return;
  el.onchange = null; const c = sheetClose; sheetClose = null;
  el.dataset.state = 'closing';
  const panel = el.querySelector('.panel'); if (panel) { panel.classList.remove('dragging'); panel.style.transform = ''; }
  clearTimeout(closing);
  closing = setTimeout(() => { el.hidden = true; el.innerHTML = ''; el.dataset.state = 'closed'; }, 290);
  c?.();
}
function dragToClose(el) {
  const panel = el.querySelector('.panel'); if (!panel) return;
  let y0 = null, x0 = 0, t0 = 0, dy = 0, live = false;
  const start = (x, y, fromHandle) => { y0 = y; x0 = x; t0 = performance.now(); dy = 0; live = fromHandle; };
  const move = (x, y, e) => {
    if (y0 == null) return;
    const d = y - y0;
    if (!live) { if (panel.scrollTop <= 0 && d > 8 && Math.abs(x - x0) < d) { live = true; y0 = y; } else return; }
    e?.cancelable && e.preventDefault();
    dy = y - y0;
    panel.classList.add('dragging');
    panel.style.transform = `translateY(${dy > 0 ? dy : -Math.sqrt(-dy) * 2}px)`;           // hacia arriba, con resistencia
    el.style.backgroundColor = `color-mix(in oklab, var(--color-ink) ${Math.round(55 * Math.max(0, 1 - dy / panel.offsetHeight))}%, transparent)`;
  };
  const end = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0); y0 = null;
    if (!live) return;
    live = false; panel.classList.remove('dragging'); el.style.backgroundColor = '';
    if (dy > panel.offsetHeight * 0.3 || v > 0.5) { panel.style.transform = 'translateY(100%)'; closeSheet(); }
    else panel.style.transform = '';
  };
  const handle = (t) => !!t.closest?.('.grab, .head') && !t.closest('button');
  panel.addEventListener('touchstart', (e) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY, handle(e.target)); }, { passive: true });
  panel.addEventListener('touchmove', (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
  panel.addEventListener('touchend', end); panel.addEventListener('touchcancel', end);
  panel.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && handle(e.target)) { start(e.clientX, e.clientY, true); panel.setPointerCapture(e.pointerId); } });
  panel.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') move(e.clientX, e.clientY, e); });
  panel.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') end(); });
}

/** Cuenta de 0 al valor (una vez, al llegar a Inicio). data-count = valor, data-dec = decimales, data-fmt = 'sleep'. */
export function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = +el.dataset.count, dec = +(el.dataset.dec ?? 0), fmtK = el.dataset.fmt; if (!Number.isFinite(to)) continue;
    const f = (v) => (fmtK === 'sleep' ? `${Math.floor(v)}h ${String(Math.round((v % 1) * 60)).padStart(2, '0')}` : v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
    const t0 = performance.now(), D = 700;
    const step = (now) => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 4); el.textContent = f(to * e); if (k < 1) requestAnimationFrame(step); };
    el.textContent = f(0); requestAnimationFrame(step);
  }
  for (const arc of root.querySelectorAll('.ring .arc')) { const fin = arc.getAttribute('stroke-dasharray'); arc.style.transition = 'none'; arc.setAttribute('stroke-dasharray', `0 999`); void arc.getBoundingClientRect(); requestAnimationFrame(() => { arc.style.transition = ''; arc.setAttribute('stroke-dasharray', fin); }); }
}

export async function busy(btn, fn) {
  const label = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  try { return await fn(); } catch (e) { toast(e.message || String(e), 5000); throw e; } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
}

// ---------- Fechas (Europa/Madrid) ----------
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
export const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const monday = (d = today()) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return addDays(d, w === 0 ? -6 : 1 - w); };
const fmt = (o) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...o });
export const dayName = (d, long = false) => fmt({ weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : undefined }).format(new Date(d + 'T12:00:00Z'));
export const shortDate = (d) => fmt({ day: 'numeric', month: 'short' }).format(new Date(d.length > 10 ? d : d + 'T12:00:00Z'));
export const timeOf = (iso) => fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const daysUntil = (d) => Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(today() + 'T12:00:00Z')) / 864e5);
/** Tiempo que cuenta para el ritmo: en movimiento (sin pausas) si el reloj lo da. */
export const runSec = (s) => +(s.moving_s || s.duration_s);
export const pace = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}/km`; };
export const dur = (s) => { const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
export const n0 = (x) => (x == null || Number.isNaN(+x) ? '–' : Math.round(+x).toLocaleString('es-ES'));

// ---------- Componentes ----------
export const DISC = {
  running: ['run', 'var(--blue)'], crossfit: ['dumbbell', 'var(--accent2)'], hyrox: ['sled', 'var(--purple)'], hybrid: ['sled', 'var(--purple)'], strength: ['dumbbell', 'var(--amber)'],
  weightlifting: ['dumbbell', 'var(--amber)'], mobility: ['yoga', 'var(--green)'], yoga: ['yoga', 'var(--green)'], cycling: ['bike', 'var(--blue)'], swimming: ['swim', 'var(--blue)'],
  walking: ['walk', 'var(--green)'], hiking: ['mountain', 'var(--green)'], padel: ['zap', 'var(--green)'], tennis: ['zap', 'var(--green)'], skiing: ['mountain', 'var(--blue)'], dance: ['activity', 'var(--purple)'], other: ['activity', 'var(--muted)'],
};
export const icon = (d) => { const [i, c] = DISC[d] || DISC.other; return html`<div class="ico" style="background:color-mix(in srgb, ${c} 16%, transparent);color:${c}">${raw(ic(i, 21))}</div>`; };
// Intensidad: es información, no una alerta → etiqueta neutra con puntos de nivel (rojo se reserva para problemas).
export const intensityTag = (i) => (i ? html`<span class="tag int"><span class="lvl" data-l="${i === 'alta' ? 3 : i === 'moderada' ? 2 : 1}" aria-hidden="true"><i></i><i></i><i></i></span>Intensidad ${i}</span>` : '');
/** Número con coma decimal (es-ES). */
export const dec = (x, d = 1) => (x == null || Number.isNaN(+x) ? '–' : (+x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const DISC_NAME = { running: 'Carrera', walking: 'Caminata', hiking: 'Senderismo', cycling: 'Bici', swimming: 'Natación', crossfit: 'CrossFit', hyrox: 'HYROX', hybrid: 'Híbrido', strength: 'Fuerza', weightlifting: 'Halterofilia', mobility: 'Movilidad', yoga: 'Yoga', padel: 'Pádel', tennis: 'Tenis', skiing: 'Esquí', dance: 'Baile', calisthenics: 'Calistenia', other: 'Entreno' };
export const discName = (d) => DISC_NAME[d] ?? 'Entreno';
/** Nombre legible de una sesión: los títulos genéricos en inglés del Watch («Afternoon Workout») pasan a «CrossFit de tarde». */
export function sessionName(s) {
  const t = String(s?.title ?? '').trim();
  if (t && !/^(early\s+)?(morning|afternoon|evening|night|lunch|midday)\s+(workout|run|ride|walk|swim|hike|session|training|strength|crossfit)$/i.test(t) && !/^(workout|run|outdoor run|indoor run|functional strength training|traditional strength training|high intensity interval training|cross training)$/i.test(t)) return t;
  const h = +new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: 'Europe/Madrid' }).format(new Date(s.started_at));
  return `${discName(s.discipline)} ${h < 12 ? 'de mañana' : h < 15 ? 'de mediodía' : h < 21 ? 'de tarde' : 'de noche'}`;
}
export const levelColor = (l) => (l === 'verde' ? 'var(--green)' : l === 'ambar' ? 'var(--amber)' : l === 'rojo' ? 'var(--red)' : 'var(--muted)');

let gid = 0;
export function ring(value, color, label, size = 92, sub = '') {
  const r = 40, c = 2 * Math.PI * r, v = Math.max(0.02, Math.min(1, value || 0));
  return raw(`<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${esc(`${label} ${sub}`.trim())}" style="width:${size}px;height:${size}px">
    <circle class="trk" cx="50" cy="50" r="${r}" fill="none" stroke-width="8"/>
    <circle class="arc" cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="butt" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 50 50)"/>
    <text class="lbl" x="50" y="${sub ? 55 : 60}" text-anchor="middle" style="font-size:${String(label).length > 3 ? 24 : 32}px">${esc(label)}</text>${sub ? `<text class="sub" x="50" y="70" text-anchor="middle">${esc(sub)}</text>` : ''}</svg>`);
}
export const bar = (value, max, color) => raw(`<div class="bar"><i style="width:${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%${color ? `;background:${color}` : ''}"></i></div>`);

/** Barras con degradado. points: [{label, value, color?}]. goal: línea de referencia. */
// ---------- Gráficos (skill dataviz): marcas finas, un eje, leyenda si hay ≥ 2 series, capa de hover y tabla de datos ----------
// Paleta categórica validada (validate_palette.js, superficie #f7f9fb: CVD ΔE ≥ 9,5, normal ≥ 22, contraste ≥ 3:1): --series-1..3.
const nice = (v) => { if (v <= 0) return 1; const e = 10 ** Math.floor(Math.log10(v)); const m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };
export const tbl = (head, rows) => `<details class="dtable"><summary>Ver datos</summary><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
const tipData = (o) => esc(JSON.stringify(o));

/**
 * Barras (o barras apiladas si cada punto trae segs: [{ v, color, name }]): rejilla recesiva, extremo redondeado arriba,
 * 2 px de separación entre tramos. hrefs: ruta por barra; tocarla abre ese día.
 */
export function barChart(points, { color = 'var(--series-1)', height = 140, label = (p) => p.label, goal, fmt = (v) => Math.round(v), name = 'Valor', hrefs, selected } = {}) {
  if (!points.length) return raw('<p class="muted small">Sin datos todavía.</p>');
  const W = 320, H = height, L = 30, R = 4, T = 14, B = 18;
  const top = nice(Math.max(1, goal ?? 0, ...points.map((p) => p.value || 0)) * 1.05);
  const slot = (W - L - R) / points.length, bw = Math.min(22, Math.max(3, slot - 2));
  const Y = (v) => H - B - ((H - B - T) * v) / top;
  const r4 = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return h <= 0 ? '' : `M${x},${H - B}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${H - B}Z`; };
  const every = Math.ceil(points.length / 7), last = points.length - 1;
  const stack = (p, x) => { let base = H - B; const segs = p.segs.filter((sg) => sg.v > 0);
    return segs.map((sg, k) => { const h = ((H - B - T) * sg.v) / top, y = base - h, last1 = k === segs.length - 1, b0 = base; base = y;
      if (!last1) return `<path d="M${x},${b0}V${y + 2}H${x + bw}V${b0}Z" fill="${sg.color}"/>`;
      const r = Math.min(4, bw / 2, h); return `<path d="M${x},${b0}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${b0}Z" fill="${sg.color}"/>`; }).join(''); };
  const bars = points.map((p, i) => { const v = p.value || 0, x = L + i * slot + (slot - bw) / 2, y = Y(v);
    const sel = selected != null && i === selected ? `<rect x="${L + i * slot}" y="${T - 4}" width="${slot}" height="${H - B - T + 4}" rx="3" fill="var(--color-ink)" opacity="0.07"/>` : '';
    return `${sel}${p.segs ? stack(p, x) : `<path d="${r4(x, y, bw, H - B - y)}" fill="${p.color ?? color}" opacity="${p.dim ? 0.45 : 1}"/>`}${i % every === 0 || i === last ? `<text x="${L + i * slot + slot / 2}" y="${H - 4}" text-anchor="middle">${esc(label(p))}</text>` : ''}`; }).join('');
  const lastV = points[last].value || 0, lx = L + last * slot + slot / 2;
  const grid = `<line class="grid" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="grid" x1="${L}" x2="${W - R}" y1="${Y(top)}" y2="${Y(top)}"/><text x="${L - 4}" y="${Y(top) + 3}" text-anchor="end">${esc(fmt(top))}</text><text x="${L - 4}" y="${H - B + 3}" text-anchor="end">0</text>`;
  const g = goal ? `<line class="ref" x1="${L}" x2="${W - R}" y1="${Y(goal)}" y2="${Y(goal)}"/><text x="${L - 4}" y="${Y(goal) + 3}" text-anchor="end">${esc(fmt(goal))}</text>` : '';
  const vy = goal && Math.abs(Y(lastV) - 4 - Y(goal)) < 12 ? Math.min(Y(lastV), Y(goal)) - 6 : Y(lastV) - 4;
  const val = lastV ? `<text class="val" x="${lx}" y="${vy}" text-anchor="middle">${esc(fmt(lastV))}</text>` : '';
  const desc = `Gráfico de barras: ${points.length} valores, último ${fmt(lastV)}, máximo ${fmt(Math.max(...points.map((p) => p.value || 0)))}`;
  const segNames = points.find((p) => p.segs)?.segs.map((sg) => sg.name);
  const tips = points.map((p) => [p.x ?? label(p), p.value == null || (!p.value && p.segs) ? '–' : fmt(p.value), ...(segNames ? p.segs.map((sg) => (sg.v ? (sg.fmt ?? fmt)(sg.v) : '–')) : [])]);
  const extra = segNames ? { names: [name, ...segNames], cols: ['transparent', ...points.find((p) => p.segs).segs.map((sg) => sg.color)] } : {};
  const legend = segNames ? `<div class="vlegend">${points.find((p) => p.segs).segs.map((sg) => `<span><i style="background:${sg.color};height:8px"></i>${esc(sg.name)}</span>`).join('')}</div>` : '';
  return raw(`<figure class="viz${hrefs ? ' pick' : ''}" data-kind="bar" data-tip="${tipData({ L, R, W, n: points.length, rows: tips, name, ...extra, hrefs })}">${legend}
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(desc)}" tabindex="0">${grid}${g}${bars}${val}<rect class="hl" x="0" y="${T - 4}" width="0" height="${H - B - T + 4}"/></svg>
    <div class="vtip" hidden></div>${tbl(['Periodo', name, ...(segNames ?? [])], tips)}</figure>`);
}
export function lineChart(series, { height = 150, invert = false, band } = {}) {
  const all = series.flatMap((s) => s.points.map((p) => p.y)).filter((y) => y != null && !Number.isNaN(y));
  if (all.length < 2) return raw('<p class="muted small">Sin datos suficientes.</p>');
  const multi = series.length > 1, W = 320, H = height, L = 30, R = multi ? 40 : 34, T = 10, B = 18;
  let min = Math.min(...all), max = Math.max(...all); if (band) { min = Math.min(min, band[0]); max = Math.max(max, band[1]); } if (min === max) { min -= 1; max += 1; }
  const span = max - min; min -= span * 0.08; max += span * 0.08;
  const n = Math.max(...series.map((s) => s.points.length));
  const X = (i) => L + ((W - L - R) * i) / Math.max(1, n - 1);
  const Y = (y) => { const t = (y - min) / (max - min); return T + (H - B - T) * (invert ? t : 1 - t); };
  const col = (s, k) => s.color ?? `var(--series-${k + 1})`;
  const f0 = series[0].fmt ?? ((v) => Math.round(v));
  const paths = [], ends = [];
  series.forEach((s, k) => {
    const pts = s.points.map((p, i) => (p.y == null ? null : [X(i), Y(p.y), p.y])).filter(Boolean);
    if (!pts.length) return;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    if (!multi && !band) paths.push(`<path d="${d}L${pts[pts.length - 1][0]},${H - B}L${pts[0][0]},${H - B}Z" fill="${col(s, k)}" opacity="0.1"/>`);
    paths.push(`<path d="${d}" fill="none" stroke="${col(s, k)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    const e = pts[pts.length - 1]; ends.push({ x: e[0], y: e[1], v: (s.fmt ?? f0)(e[2]), c: col(s, k) });
  });
  // Etiquetas al final de cada línea; si chocan, se apartan lo justo (sin despegarse de su punto).
  const lab = [...ends].sort((a, b) => a.y - b.y); for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 12) lab[i].ly = (lab[i - 1].ly ?? lab[i - 1].y) + 12;
  const dots = ends.map((e) => `<circle cx="${e.x}" cy="${e.y}" r="4" fill="${e.c}" stroke="var(--color-paper)" stroke-width="2"/><text class="val" x="${e.x + 7}" y="${(e.ly ?? e.y) + 3}">${esc(e.v)}</text>`).join('');
  const bandEl = band ? `<rect x="${L}" width="${W - L - R}" y="${Math.min(Y(band[0]), Y(band[1]))}" height="${Math.abs(Y(band[0]) - Y(band[1]))}" fill="var(--color-success)" opacity="0.1"/>` : '';
  const xs = series[0].points.map((p) => p.x ?? ''); const first = xs[0], last = xs[xs.length - 1];
  const topV = invert ? min : max, botV = invert ? max : min;
  const grid = `<line class="grid" x1="${L}" x2="${W - R}" y1="${T}" y2="${T}"/><line class="grid" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><text x="${L - 4}" y="${T + 3}" text-anchor="end">${esc(f0(topV))}</text><text x="${L - 4}" y="${H - B + 3}" text-anchor="end">${esc(f0(botV))}</text>`;
  const s0 = series[0].points.filter((p) => p.y != null);
  const desc = `Gráfico de evolución${first ? ` del ${first} al ${last}` : ''}: ${series.map((s, k) => { const q = s.points.filter((p) => p.y != null); return `${s.name ?? (multi ? `serie ${k + 1}` : '')} de ${(s.fmt ?? f0)(q[0]?.y)} a ${(s.fmt ?? f0)(q[q.length - 1]?.y)}`; }).join('; ')}`;
  const rows = xs.map((x, i) => [x, ...series.map((s) => (s.points[i]?.y == null ? '–' : (s.fmt ?? f0)(s.points[i].y)))]);
  const names = series.map((s, k) => s.name ?? (multi ? `Serie ${k + 1}` : 'Valor'));
  const legend = multi ? `<div class="vlegend">${series.map((s, k) => `<span><i style="background:${col(s, k)}"></i>${esc(names[k])}</span>`).join('')}</div>` : '';
  const ys = series.map((s) => s.points.map((p) => (p.y == null ? null : +Y(p.y).toFixed(1))));
  return raw(`<figure class="viz" data-kind="line" data-tip="${tipData({ L, R, W, n, rows, names, cols: series.map(col), ys })}">${legend}
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(desc)}" tabindex="0">${bandEl}${grid}${paths.join('')}<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>${series.map((s, k) => `<circle class="xp" r="4" fill="${col(s, k)}" stroke="var(--color-paper)" stroke-width="2" visibility="hidden"/>`).join('')}${dots}<text x="${L}" y="${H - 4}">${esc(first)}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${esc(last)}</text></svg>
    <div class="vtip" hidden></div>${tbl(['Fecha', ...names], rows)}</figure>`);
}

/** Capa de hover/foco para todos los gráficos: cruz que busca la X en líneas, la barra entera en barras; flechas con el teclado. */
function vizAt(fig, i) {
  const d = JSON.parse(fig.dataset.tip); i = Math.max(0, Math.min(d.n - 1, i)); fig._i = i;
  const svg = fig.querySelector('svg'), tip = fig.querySelector('.vtip'), r = d.rows[i];
  const slot = (d.W - d.L - d.R) / d.n, x = d.kind === 'bar' || fig.dataset.kind === 'bar' ? d.L + i * slot : d.L + ((d.W - d.L - d.R) * i) / Math.max(1, d.n - 1);
  if (fig.dataset.kind === 'bar') { const hl = svg.querySelector('.hl'); hl.setAttribute('x', x); hl.setAttribute('width', slot); }
  else {
    const xh = svg.querySelector('.xh'); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
    svg.querySelectorAll('.xp').forEach((c, k) => { const y = d.ys[k][i]; if (y == null) return c.setAttribute('visibility', 'hidden'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('visibility', 'visible'); });
  }
  tip.replaceChildren();
  const head = document.createElement('div'); head.className = 'vt-h'; head.textContent = r[0]; tip.append(head);
  r.slice(1).forEach((v, k) => { const row = document.createElement('div'); row.className = 'vt-r';
    if (d.cols) { const key = document.createElement('i'); key.style.background = d.cols[k]; row.append(key); }
    const b = document.createElement('b'); b.textContent = v; row.append(b);
    if (d.names && d.names.length > 1) { const s = document.createElement('span'); s.textContent = d.names[k]; row.append(s); }
    tip.append(row); });
  tip.hidden = false;
  const px = (x / d.W) * svg.getBoundingClientRect().width, tw = tip.offsetWidth, fw = fig.clientWidth;
  tip.style.left = `${Math.max(0, Math.min(fw - tw, px - tw / 2))}px`;
}
function vizOff(fig) { const tip = fig.querySelector('.vtip'); if (tip) tip.hidden = true; fig.querySelectorAll('.xh, .xp').forEach((e) => e.setAttribute('visibility', 'hidden')); const hl = fig.querySelector('.hl'); if (hl) hl.setAttribute('width', 0); }
function vizIndex(fig, clientX) {
  const d = JSON.parse(fig.dataset.tip), box = fig.querySelector('svg').getBoundingClientRect(), x = ((clientX - box.left) / box.width) * d.W;
  return fig.dataset.kind === 'bar' ? Math.floor((x - d.L) / ((d.W - d.L - d.R) / d.n)) : Math.round(((x - d.L) / (d.W - d.L - d.R)) * (d.n - 1));
}
if (typeof document !== 'undefined' && !window.__viz) {
  window.__viz = true;
  document.addEventListener('pointermove', (e) => { const fig = e.target.closest?.('figure.viz'); document.querySelectorAll('figure.viz').forEach((f) => f !== fig && f._i != null && (vizOff(f), (f._i = null))); if (fig && e.target.closest('svg')) vizAt(fig, vizIndex(fig, e.clientX)); });
  document.addEventListener('pointerdown', (e) => { const fig = e.target.closest?.('figure.viz'); if (fig && e.target.closest('svg')) vizAt(fig, vizIndex(fig, e.clientX)); });
  document.addEventListener('focusin', (e) => { const fig = e.target.closest?.('figure.viz'); if (fig && e.target.tagName === 'svg') vizAt(fig, fig._i ?? JSON.parse(fig.dataset.tip).n - 1); });
  document.addEventListener('focusout', (e) => { const fig = e.target.closest?.('figure.viz'); if (fig) vizOff(fig); });
  // Barras con ruta: tocar una barra abre ese día (Intro con el teclado)
  document.addEventListener('click', (e) => { const fig = e.target.closest?.('figure.viz.pick'); if (!fig || !e.target.closest('svg')) return; const d = JSON.parse(fig.dataset.tip); const i = vizIndex(fig, e.clientX); if (d.hrefs?.[i]) location.hash = `#/${d.hrefs[i]}`; });
  document.addEventListener('keydown', (e) => { const fig = e.target.closest?.('figure.viz.pick'); if (fig && e.key === 'Enter' && fig._i != null) { const d = JSON.parse(fig.dataset.tip); if (d.hrefs?.[fig._i]) location.hash = `#/${d.hrefs[fig._i]}`; } });
  document.addEventListener('keydown', (e) => { const fig = e.target.closest?.('figure.viz'); if (!fig || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); vizAt(fig, (fig._i ?? 0) + (e.key === 'ArrowRight' ? 1 : -1)); });
}
export function spark(values, color = 'var(--series-1)', kind = 'line', h = 36) {
  const v = values.map((x) => (x == null || Number.isNaN(+x) ? null : +x)); const ok = v.filter((x) => x != null);
  if (ok.length < 2) return raw('');
  const W = 120, min = kind === 'bar' ? 0 : Math.min(...ok), max = Math.max(...ok), sp = max - min || 1, id = `sp${++gid}`;
  if (kind === 'bar') { const bw = W / v.length; return raw(`<svg class="spark" aria-hidden="true" viewBox="0 0 ${W} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${v.map((x, i) => (x == null ? '' : `<rect x="${i * bw + 1.5}" y="${h - (h * (x - min)) / sp}" width="${Math.max(2, bw - 3)}" height="${(h * (x - min)) / sp}" rx="2" fill="${color}" opacity="${i === v.length - 1 ? 1 : 0.5}"/>`)).join('')}</svg>`); }
  const pts = v.map((x, i) => (x == null ? null : [(W * i) / (v.length - 1), 3 + (h - 6) * (1 - (x - min) / sp)])).filter(Boolean);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return raw(`<svg class="spark" aria-hidden="true" viewBox="0 0 ${W} ${h}" width="100%" height="${h}" preserveAspectRatio="none"><path d="${d}L${W},${h}L0,${h}Z" fill="${color}" opacity="0.1"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`);
}

/** Pasos de una sesión planificada (ritmos, series, pesos, descansos). */
export function steps(list) {
  return (list || []).map((s) => {
    const m = [];
    if (s.repeat) m.push(`×${s.repeat}`);
    if (s.distanceM) m.push(s.distanceM >= 1000 ? `${(s.distanceM / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : `${Math.round(s.distanceM)} m`);
    if (s.durationS) m.push(s.durationS >= 60 ? `${Math.round(s.durationS / 60)}′` : `${s.durationS}″`);
    if (s.paceRange?.length === 2) m.push(`${pace(s.paceRange[0])}–${pace(s.paceRange[1])}`); else if (s.pace) m.push(pace(s.pace.secPerKm));
    if (s.hrRange?.length === 2) m.push(`${s.hrRange[0]}–${s.hrRange[1]} ppm`);
    if (s.sets && s.reps) m.push(`${s.sets}×${s.reps}`);
    if (s.loadKg) m.push(`${s.loadKg} kg`);
    if (s.rir != null && s.kind === 'exercise') m.push(`RIR ${s.rir}`);
    if (s.restS && s.kind === 'exercise') m.push(`desc. ${s.restS}″`);
    return html`<div class="step"><div class="row"><b class="grow">${s.label}</b><span class="m">${m.join(' · ')}</span></div>${s.cue ? html`<div class="small muted">${s.cue}</div>` : ''}${s.steps ? steps(s.steps) : ''}</div>`;
  });
}

/** Reduce una foto antes de subirla (menos datos, más rápido). */
export function resizeImage(file, maxSide = 1800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')); }, 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Imagen no válida')); img.src = url;
  });
}

export const SLOTS = ['desayuno', 'media_manana', 'pre_entreno', 'comida', 'merienda', 'post_entreno', 'cena', 'recena'];
export const slotName = (s) => ({ desayuno: 'Desayuno', media_manana: 'Almuerzo', pre_entreno: 'Pre-entreno', comida: 'Comida', merienda: 'Merienda', post_entreno: 'Post-entreno', cena: 'Cena', recena: 'Recena' })[s] || s;
export const phaseName = (k) => ({ general: 'Preparación general', development: 'Desarrollo', specific: 'Preparación específica', taper: 'Puesta a punto', competition: 'Competición', recovery: 'Recuperación', base: 'Base' })[k] || k;
export const GOAL_MODES = [['definicion', 'Definir (perder grasa)'], ['mantenimiento', 'Mantener'], ['volumen', 'Ganar masa muscular'], ['recomposicion', 'Recomposición'], ['rendimiento', 'Rendimiento']];
