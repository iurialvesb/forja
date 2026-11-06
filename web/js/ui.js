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

export function toast(msg, ms = 3500) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}

let sheetClose = null;
export function sheet(title, body, onClose) {
  const el = document.getElementById('sheet');
  el.innerHTML = html`<div class="panel"><div class="grab"></div><div class="head"><h3>${title}</h3><button class="ghost" data-act="${act(closeSheet)}">Cerrar</button></div><div id="sheet-body">${body}</div></div>`.s;
  el.hidden = false; sheetClose = onClose ?? null;
  el.onclick = (e) => { if (e.target === el) closeSheet(); };
}
export function setSheet(body) { const b = document.getElementById('sheet-body'); if (b) b.innerHTML = flat(body); }
export function closeSheet() { const el = document.getElementById('sheet'); el.hidden = true; el.innerHTML = ''; el.onchange = null; const c = sheetClose; sheetClose = null; c?.(); }

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
export const pace = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}/km`; };
export const dur = (s) => { const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
export const n0 = (x) => (x == null || Number.isNaN(+x) ? '–' : Math.round(+x).toLocaleString('es-ES'));

// ---------- Componentes ----------
export const DISC = {
  running: ['🏃', 'var(--blue)'], crossfit: ['🏋️', 'var(--accent)'], hyrox: ['🛷', 'var(--purple)'], hybrid: ['🛷', 'var(--purple)'], strength: ['💪', 'var(--amber)'],
  weightlifting: ['🏋️', 'var(--amber)'], mobility: ['🧘', 'var(--green)'], yoga: ['🧘', 'var(--green)'], cycling: ['🚴', 'var(--blue)'], swimming: ['🏊', 'var(--blue)'],
  walking: ['🚶', 'var(--muted)'], hiking: ['🥾', 'var(--muted)'], padel: ['🎾', 'var(--green)'], tennis: ['🎾', 'var(--green)'], skiing: ['⛷️', 'var(--blue)'], dance: ['💃', 'var(--purple)'], other: ['⚡', 'var(--muted)'],
};
export const icon = (d) => html`<div class="ico" style="color:${(DISC[d] || DISC.other)[1]}">${(DISC[d] || DISC.other)[0]}</div>`;
export const intensityTag = (i) => html`<span class="tag ${i === 'alta' ? 'red' : i === 'moderada' ? 'amber' : 'green'}">${i || ''}</span>`;
export const levelColor = (l) => (l === 'verde' ? 'var(--green)' : l === 'ambar' ? 'var(--amber)' : l === 'rojo' ? 'var(--red)' : 'var(--muted)');

export function ring(value, color, label, size = 92) {
  const r = 40, c = 2 * Math.PI * r, v = Math.max(0.02, Math.min(1, value || 0));
  return raw(`<svg class="ring" viewBox="0 0 100 100" style="width:${size}px;height:${size}px"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 50 50)"/><text x="50" y="57" text-anchor="middle" style="font-size:24px;font-weight:700;fill:#fff">${esc(label)}</text></svg>`);
}
export const bar = (value, max, color = 'var(--accent)') => raw(`<div class="bar"><i style="width:${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%;background:${color}"></i></div>`);

export function barChart(points, { color = 'var(--blue)', height = 140, label = (p) => p.label } = {}) {
  if (!points.length) return raw('<p class="muted small">Sin datos todavía.</p>');
  const W = 320, H = height, pad = 18, max = Math.max(1, ...points.map((p) => p.value));
  const bw = (W - pad) / points.length;
  const bars = points.map((p, i) => { const h = ((H - 26) * p.value) / max; return `<rect x="${pad + i * bw + 2}" y="${H - 16 - h}" width="${Math.max(2, bw - 4)}" height="${h}" rx="3" fill="${color}"/>${i % Math.ceil(points.length / 6) === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${H - 3}" text-anchor="middle">${esc(label(p))}</text>` : ''}`; }).join('');
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="0" y="10">${Math.round(max)}</text>${bars}</svg>`);
}

export function lineChart(series, { height = 150, invert = false } = {}) {
  const all = series.flatMap((s) => s.points.map((p) => p.y)).filter((y) => y != null && !Number.isNaN(y));
  if (all.length < 2) return raw('<p class="muted small">Sin datos suficientes.</p>');
  const W = 320, H = height, pad = 24; let min = Math.min(...all), max = Math.max(...all); if (min === max) { min -= 1; max += 1; }
  const n = Math.max(...series.map((s) => s.points.length));
  const X = (i) => pad + ((W - pad - 4) * i) / Math.max(1, n - 1);
  const Y = (y) => { const t = (y - min) / (max - min); return 8 + (H - 24) * (invert ? t : 1 - t); };
  const paths = series.map((s) => { const pts = s.points.map((p, i) => (p.y == null ? null : `${X(i)},${Y(p.y)}`)).filter(Boolean); return `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${pts.join(' ')}"/>`; }).join('');
  const lab = series[0].points; const first = lab[0]?.x ?? '', last = lab[lab.length - 1]?.x ?? '';
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="0" y="12">${esc(series[0].fmt ? series[0].fmt(invert ? min : max) : Math.round(invert ? min : max))}</text><text x="0" y="${H - 14}">${esc(series[0].fmt ? series[0].fmt(invert ? max : min) : Math.round(invert ? max : min))}</text>${paths}<text x="${pad}" y="${H - 2}">${esc(first)}</text><text x="${W - 4}" y="${H - 2}" text-anchor="end">${esc(last)}</text></svg>`);
}

/** Pasos de una sesión planificada (ritmos, series, pesos, descansos). */
export function steps(list) {
  return (list || []).map((s) => {
    const m = [];
    if (s.repeat) m.push(`×${s.repeat}`);
    if (s.distanceM) m.push(s.distanceM >= 1000 ? `${(s.distanceM / 1000).toFixed(1)} km` : `${Math.round(s.distanceM)} m`);
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
export const slotName = (s) => ({ desayuno: 'Desayuno', media_manana: 'Media mañana', pre_entreno: 'Pre-entreno', comida: 'Comida', merienda: 'Merienda', post_entreno: 'Post-entreno', cena: 'Cena', recena: 'Recena' })[s] || s;
export const phaseName = (k) => ({ general: 'Preparación general', development: 'Desarrollo', specific: 'Preparación específica', taper: 'Puesta a punto', competition: 'Competición', recovery: 'Recuperación', base: 'Base' })[k] || k;
export const GOAL_MODES = [['definicion', 'Definir (perder grasa)'], ['mantenimiento', 'Mantener'], ['volumen', 'Ganar masa muscular'], ['recomposicion', 'Recomposición'], ['rendimiento', 'Rendimiento']];
