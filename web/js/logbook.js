// Registro de CrossFit por casillas: una fila por serie, ronda o minuto. Interpreta el texto al instante en el navegador,
// lee las fotos en segundo plano, permite corregir la estructura y se guarda solo (borrador) mientras registras.
import * as api from './api.js';
import { get, invalidate, render } from './app.js';
import { html, act, toast, sheet, setSheet, closeSheet, busy, today, timeOf, shortDate, dayName, resizeImage, lineChart } from './ui.js';
import { parseWorkoutText } from './engine/workoutText.js';
import { buildLog, buildBlock, addGroup, regroup, statusFor, amrapResult, logToSession, fmtClock, parseClock, newBlock, emptyLog, summarizeLog, logFromSaved, displayName } from './engine/logbook.js';

const LS = 'forja:draft';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
let D = null;                 // borrador abierto
const editing = new Set();    // bloques con el editor de estructura abierto
let saveT = 0;
let exNames = [];

// ---------------- Borrador (autoguardado) ----------------
function persist() {
  if (!D) return;
  D.updatedAt = new Date().toISOString();
  try { localStorage.setItem(LS, JSON.stringify(D)); } catch { /* sin espacio */ }
  clearTimeout(saveT);
  saveT = setTimeout(() => { api.db.upsert('workout_drafts', [{ id: draftUuid(D), user_id: api.userId(), payload: D, updated_at: D.updatedAt }]).catch(() => {}); }, 1500);
}
function draftUuid(d) { return (d.uuid ??= uuid()); }
function dropDraft(d = D) {
  try { localStorage.removeItem(LS); } catch { /* */ }
  if (d?.uuid) api.db.remove('workout_drafts', { id: `eq.${d.uuid}` }).catch(() => {});
  D = null; editing.clear();
}
export async function pendingDraft() {
  try { const l = JSON.parse(localStorage.getItem(LS) || 'null'); if (l?.blocks) return l; } catch { /* */ }
  try { const [r] = await api.db.select('workout_drafts', { order: 'updated_at.desc', limit: 1 }); if (r?.payload?.blocks) return r.payload; } catch { /* tabla aún no creada */ }
  return null;
}
export async function draftBanner() {
  const d = await pendingDraft();
  if (!d) return '';
  const rows = d.blocks.flatMap((b) => b.groups.flatMap((g) => g.rows.filter((r) => !r.rest)));
  const done = rows.filter((r) => r.status !== 'pending').length;
  return html`<div class="card tight row" style="border-color:var(--accent)"><div class="grow"><b>Entreno sin terminar</b><div class="xs muted">${d.title ?? d.blocks.map((b) => b.title).join(' + ')} · ${shortDate(d.date)} · ${done}/${rows.length} casillas</div></div>
    <button class="sm primary" data-act="${act(() => { D = d; openLogger(); })}">Seguir</button><button class="sm ghost" data-act="${act(() => { dropDraft(d); render(); })}">Descartar</button></div>`;
}

// ---------------- Entradas ----------------
/** Pegar texto (Strava, notas, WhatsApp): se interpreta mientras escribes, sin servidor. */
export async function startFromText(prefill = '') {
  let text = prefill;
  const preview = () => {
    const out = document.getElementById('tprev'); if (!out) return;
    if (!text.trim()) { out.innerHTML = ''; return; }
    const p = parseWorkoutText(text);
    const d = buildLog(p, { date: today(), origin: 'text' });
    out.innerHTML = html`<div class="card tight">${d.blocks.length ? summaryLines(d) : html`<div class="small muted">Aún no veo ejercicios.</div>`}
      ${p.unparsed.length ? html`<div class="xs" style="color:var(--amber)">No entiendo: ${p.unparsed.join(' · ')}</div>` : ''}</div>`.s;
  };
  sheet('Pegar entreno', html`
    <p class="small muted">Pega la descripción de Strava, tus notas o el WhatsApp del box. Se interpreta al instante.</p>
    <textarea class="mono" id="wtext" rows="8" placeholder="FUERZA&#10;EMOM 10'&#10;- 6 FRONT SQUATS @ 50 kg&#10;WOD&#10;AMRAP 12&#10;- 10 wall balls">${text}</textarea>
    <button class="sm" data-act="${act(async () => { try { text = await navigator.clipboard.readText(); document.getElementById('wtext').value = text; preview(); } catch { toast('Mantén pulsado el cuadro y elige Pegar'); } })}">Pegar del portapapeles</button>
    <div id="tprev"></div>
    <button class="primary block" data-act="${act(() => {
      text = document.getElementById('wtext').value;
      const p = parseWorkoutText(text);
      if (!p.sections.length) return toast('No encuentro ejercicios en el texto');
      D = buildLog(p, { date: today(), origin: 'text', sourceText: text }); persist(); openLogger();
    })}">Registrar</button>
    <button class="block ghost small" data-act="${act((b) => busy(b, async () => {
      text = document.getElementById('wtext').value;
      const r = await api.fn('parse-workout-text', { action: 'parse', text, date: today() });
      D = buildLog(r.parsed, { date: today(), origin: r.engine === 'motor' ? 'text' : 'ai', sourceText: text }); persist(); openLogger();
    }))}">Revisar con IA si no lo entiende bien</button>`);
  document.getElementById('wtext').addEventListener('input', (e) => { text = e.target.value; clearTimeout(preview.t); preview.t = setTimeout(preview, 200); });
  if (!prefill) { try { const c = await navigator.clipboard.readText(); if (c && /\d/.test(c) && c.length < 4000) { text = c; document.getElementById('wtext').value = c; } } catch { /* sin permiso */ } }
  preview();
}

/** Foto: se sube y se lee en segundo plano; puedes cerrar la hoja o empezar a mano mientras tanto. */
export function startFromPhoto() {
  sheet('Foto de entreno', html`<p class="small muted">Pizarra del box o captura de WodBuster. La foto se envía a la IA (Google Gemini) para leerla; mientras tanto puedes seguir usando Forja.</p>
    <input type="file" accept="image/*" id="wphoto"><div id="wout"></div>`);
  document.getElementById('wphoto').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const out = document.getElementById('wout');
    out.innerHTML = html`<p class="small"><span class="spinner"></span> Leyendo la foto… Te aviso al terminar.</p>
      <button class="block" data-act="${act(() => { D = emptyLog(today()); persist(); openLogger(); })}">Empezar a registrar a mano mientras</button>`.s;
    readPhoto(f);
  };
}
async function readPhoto(file) {
  const t0 = Date.now();
  try {
    const blob = await resizeImage(file, 1600, 0.8);
    const path = await api.uploadPhoto(blob);
    const [row] = await api.db.insert('photo_imports', [{ user_id: api.userId(), storage_path: path }]);
    const r = await api.fn('parse-photo', { action: 'parse', importId: row.id });
    const fresh = buildLog(r.parsed, { date: r.parsed.date ?? today(), origin: 'ai', sourceText: r.transcript || '', importId: row.id });
    const secs = Math.round((Date.now() - t0) / 1000);
    // Si ya habías empezado a mano un borrador vacío, la lectura lo sustituye; si habías marcado casillas, se añade al final.
    if (D && D.blocks.some((b) => b.groups.some((g) => g.rows.some((x) => !x.rest && x.status !== 'pending')))) { D.blocks.push(...fresh.blocks); D.importId = row.id; D.sourceText = fresh.sourceText; }
    else D = { ...fresh, uuid: D?.uuid };
    persist();
    if (document.getElementById('sheet').hidden || document.getElementById('wout') || document.getElementById('logger')) openLogger();
    toast(`Foto leída en ${secs} s${r.engine === 'motor' ? '' : ' (lectura completa con IA)'} — revisa y marca lo que hiciste`, 6000);
  } catch (err) {
    toast(`No se pudo leer la foto: ${err.message}`, 7000);
  }
}

/** Registro manual por bloques (Fuerza, WOD, Endurance). */
export function startManual() { D = emptyLog(today()); persist(); openLogger(); }

/** Editar un entreno ya guardado. */
export async function editSession(id) {
  const [s] = await api.db.select('sessions', { id: `eq.${id}`, select: 'id,title,started_at,duration_s,rpe,session_blocks(position,prescribed)' });
  const d = logFromSaved({ id: s.id, title: s.title ?? undefined, startedAt: s.started_at, durationS: s.duration_s, rpe: s.rpe ?? undefined }, (s.session_blocks || []).sort((a, b) => a.position - b.position));
  if (!d) return toast('Este entreno se registró antes del registro por casillas: no se puede editar aquí');
  d.editId = id; d.linkSessionId = null; d.startTime = timeOf(s.started_at);
  D = d; persist(); openLogger();
}

// ---------------- Hoja de registro ----------------
const STATUS_ICON = { pending: '○', done: '✓', partial: '◐', skipped: '✕' };
const UNIT = { reps: 'reps', cal: 'cal', m: 'm', s: 's' };
const FORMATS = [['sets', 'Series'], ['emom', 'EMOM / cada X'], ['amrap', 'AMRAP'], ['for_time', 'For Time'], ['rounds', 'Rondas'], ['chipper', 'Chipper'], ['tabata', 'Tabata'], ['intervals', 'Intervalos'], ['steady', 'Continuo']];
const PARTS = [['strength', 'Fuerza'], ['wod', 'WOD'], ['endurance', 'Endurance'], ['other', 'Otro']];

function summaryLines(d) {
  return d.blocks.map((b) => {
    const rows = b.groups.flatMap((g) => g.rows.filter((r) => !r.rest));
    return html`<div class="small">• <b>${b.title}</b> ${fmtLabel(b)} · ${b.template.filter((t) => !t.rest).map((t) => t.exercise).join(', ')} <span class="muted">(${rows.length} casillas)</span></div>`;
  });
}
function fmtLabel(b) {
  const iv = b.intervalS && b.intervalS !== 60 ? ` cada ${b.intervalS / 60}'` : '';
  switch (b.format) {
    case 'emom': return `EMOM ${b.durationMin ?? (b.groups.length * (b.intervalS ?? 60)) / 60}'${iv} · ${b.rounds ?? '?'} rondas`;
    case 'amrap': return `AMRAP ${b.durationMin ?? '?'}'`;
    case 'for_time': return `For Time${b.rounds > 1 ? ` · ${b.rounds} rondas` : ''}${b.scheme ? ` · ${b.scheme.join('-')}` : ''}${b.timeCapS ? ` · cap ${b.timeCapS / 60}'` : ''}`;
    case 'rounds': return `${b.rounds ?? '?'} rondas`;
    case 'sets': return `${b.groups.length} series`;
    default: return b.format ? (FORMATS.find((f) => f[0] === b.format)?.[1] ?? b.format) : '';
  }
}
const targetHint = (r) => [r.target != null ? `${r.target}${r.unit === 'reps' ? '' : ` ${UNIT[r.unit]}`}` : '', r.targetKg != null ? `${r.targetKg} kg` : r.targetPct != null ? `${r.targetPct}%` : r.targetText ?? ''].filter(Boolean).join(' × ');
const showKg = (r) => r.targetKg != null || r.targetPct != null || r.targetText || r.doneKg != null;

function rowView(bi, gi, ri, r) {
  if (r.rest) return html`<div class="lrow rest"><span class="ck">·</span><span class="grow muted small">Descanso</span></div>`;
  const st = statusFor(r);
  return html`<div class="lrow ${st}" id="row-${r.id}">
    <button class="ck ${st}" id="ck-${r.id}" data-act="${act(() => cycle(r))}" aria-label="Marcar">${STATUS_ICON[st]}</button>
    <div class="grow"><div class="small" style="font-weight:600">${r.exercise}</div><div class="xs muted">obj. ${targetHint(r) || '—'}${r.notes ? ` · ${r.notes}` : ''}</div></div>
    <input class="num" inputmode="decimal" data-lf="done" data-b="${bi}" data-g="${gi}" data-r="${ri}" value="${r.done ?? ''}" placeholder="${UNIT[r.unit]}"><span class="xs muted u">${UNIT[r.unit]}</span>
    ${showKg(r) ? html`<input class="num" inputmode="decimal" data-lf="kg" data-b="${bi}" data-g="${gi}" data-r="${ri}" value="${r.doneKg ?? ''}" placeholder="kg"><span class="xs muted u">kg</span>` : ''}
  </div>`;
}

function blockResult(bi, b) {
  if (b.format === 'amrap') { const r = amrapResult(b); return html`<div class="ok small" id="amrap-${b.id}">Resultado: <b>${r.rounds} rondas + ${r.reps} reps</b> (se calcula de las casillas)</div>`; }
  if (b.part === 'wod' && ['for_time', 'rounds', 'chipper'].includes(b.format) || (b.part === 'endurance')) {
    return html`<div class="row" style="gap:8px;align-items:center"><label class="grow" style="margin:0">Tiempo final</label>
      <input class="num" style="width:84px" data-lf="time" data-b="${bi}" value="${fmtClock(b.result.timeS)}" placeholder="mm:ss" ${b.result.capped ? 'disabled' : ''}>
      <label class="check" style="margin:0"><input type="checkbox" data-lf="cap" data-b="${bi}" ${b.result.capped ? 'checked' : ''}> Cap</label></div>
      ${b.result.capped ? html`<label>Repeticiones hechas al llegar al cap</label><input class="num" data-lf="capreps" data-b="${bi}" value="${b.result.reps ?? ''}">` : ''}`;
  }
  return '';
}

function structureEditor(bi, b) {
  const dl = 'exlist';
  return html`<div class="card tight" style="background:rgba(255,255,255,.03)">
    <div class="grid2"><div><label>Apartado</label><select data-sf="part" data-b="${bi}">${PARTS.map(([k, l]) => html`<option value="${k}" ${b.part === k ? 'selected' : ''}>${l}</option>`)}</select></div>
      <div><label>Formato</label><select data-sf="format" data-b="${bi}">${FORMATS.map(([k, l]) => html`<option value="${k}" ${b.format === k ? 'selected' : ''}>${l}</option>`)}</select></div></div>
    <div class="grid2"><div><label>${b.format === 'emom' ? 'Rondas (salen de los minutos)' : 'Rondas / series'}</label><input class="num" data-sf="rounds" data-b="${bi}" value="${b.rounds ?? ''}" ${b.format === 'emom' && b.durationMin ? 'disabled' : ''}></div>
      <div><label>Minutos (duración o cap)</label><input class="num" data-sf="minutes" data-b="${bi}" value="${b.format === 'amrap' || b.format === 'emom' ? b.durationMin ?? '' : b.timeCapS ? b.timeCapS / 60 : ''}"></div></div>
    ${b.format === 'emom' ? html`<label>Cada cuántos segundos (EMOM = 60, E2MOM = 120)</label><input class="num" data-sf="interval" data-b="${bi}" value="${b.intervalS ?? 60}">` : ''}
    <label>Ejercicios de una ronda</label>
    ${b.template.map((t, ti) => html`<div style="margin:6px 0;padding-bottom:6px;border-bottom:1px solid var(--line)"><div class="row" style="gap:6px">
      <input class="grow" list="${dl}" data-tf="exercise" data-b="${bi}" data-t="${ti}" value="${t.exercise}" placeholder="Ejercicio" ${t.rest ? 'disabled' : ''}>
      <button class="sm ghost" data-act="${act(() => { b.template.splice(ti, 1); draw(); })}">✕</button></div>
      ${t.rest ? '' : html`<div class="row" style="gap:6px;margin-top:4px"><input class="num" data-tf="target" data-b="${bi}" data-t="${ti}" value="${t.scheme ? t.scheme.join('-') : t.target ?? ''}" placeholder="cantidad" style="width:90px">
      <select data-tf="unit" data-b="${bi}" data-t="${ti}" style="width:auto">${Object.keys(UNIT).map((u) => html`<option ${t.unit === u ? 'selected' : ''}>${u}</option>`)}</select>
      <input class="num grow" data-tf="kg" data-b="${bi}" data-t="${ti}" value="${t.targetKg ?? (t.targetPct != null ? `${t.targetPct}%` : t.targetText ?? '')}" placeholder="kg o %"></div>`}</div>`)}
    <datalist id="${dl}">${exNames.map((n) => html`<option value="${n}">`)}</datalist>
    <div class="grid2"><button class="sm" data-act="${act(() => { b.template.push({ exercise: '', unit: 'reps', target: 10 }); draw(); })}">+ Ejercicio</button>
      <button class="sm" data-act="${act(() => { b.template.push({ exercise: 'Descanso', unit: 's', target: b.intervalS ?? 60, rest: true }); draw(); })}">+ Descanso</button></div>
    <button class="block primary sm" data-act="${act(() => { regroup(b); editing.delete(b.id); persist(); draw(); toast('Estructura aplicada: revisa las casillas'); })}">Aplicar cambios</button>
    <p class="xs muted">Al aplicar se rehacen las casillas de este bloque. Escribe 5-5-3-3-1 en reps para series distintas.</p></div>`;
}

function blockView(bi, b) {
  const open = editing.has(b.id);
  return html`<div class="card" id="blk-${b.id}">
    <div class="row" style="gap:6px"><input class="grow title-in" data-bf="title" data-b="${bi}" value="${b.title}">
      <div class="seg mini"><button class="${b.scaling === 'rx' ? 'on' : ''}" data-act="${act(() => { b.scaling = 'rx'; persist(); draw(); })}">RX</button><button class="${b.scaling === 'scaled' ? 'on' : ''}" data-act="${act(() => { b.scaling = 'scaled'; persist(); draw(); })}">Scaled</button></div></div>
    <div class="row xs muted" style="gap:8px"><span class="tag accent">${PARTS.find((p) => p[0] === b.part)?.[1] ?? b.part}</span><span class="grow">${fmtLabel(b)}</span>
      <button class="sm ghost" data-act="${act(() => { open ? editing.delete(b.id) : editing.add(b.id); draw(); })}">${open ? 'Cerrar' : '✎ Estructura'}</button>
      <button class="sm ghost" data-act="${act(() => { if (confirm('¿Quitar este bloque?')) { D.blocks.splice(bi, 1); persist(); draw(); } })}">🗑</button></div>
    ${open ? structureEditor(bi, b) : ''}
    ${b.groups.length ? html`<button class="sm ghost" data-act="${act(() => { for (const g of b.groups) for (const r of g.rows) if (!r.rest && r.status === 'pending') r.status = statusFor({ ...r, status: 'done' }); persist(); draw(); })}">✓ Marcar todo como hecho</button>` : html`<p class="small muted">Añade los ejercicios con «✎ Estructura».</p>`}
    ${b.groups.map((g, gi) => html`<div class="lgroup"><div class="xs muted glabel">${g.label}</div>${g.rows.map((r, ri) => rowView(bi, gi, ri, r))}</div>`)}
    ${b.addable ? html`<button class="block sm" data-act="${act(() => { addGroup(b); persist(); draw(); })}">+ ${b.addable === 'set' ? 'Serie' : 'Ronda'}</button>` : ''}
    ${blockResult(bi, b)}
  </div>`;
}

function cycle(r) {
  const st = statusFor(r);
  r.status = st === 'pending' ? 'done' : st === 'done' || st === 'partial' ? 'skipped' : 'pending';
  if (r.status === 'done') { if (r.done == null || r.done === 0) r.done = r.target; r.status = statusFor(r); }
  persist(); refreshRow(r);
}
function refreshRow(r) {
  const st = statusFor(r);
  const ck = document.getElementById(`ck-${r.id}`); if (ck) { ck.className = `ck ${st}`; ck.textContent = STATUS_ICON[st]; }
  const row = document.getElementById(`row-${r.id}`); if (row) row.className = `lrow ${st}`;
  for (const b of D.blocks) if (b.format === 'amrap') { const el = document.getElementById(`amrap-${b.id}`); if (el) { const x = amrapResult(b); el.innerHTML = `Resultado: <b>${x.rounds} rondas + ${x.reps} reps</b> (se calcula de las casillas)`; } }
}

let candidates = [];
async function loadCandidates() {
  if (!D || D.editId) { candidates = []; return; }
  try {
    candidates = await api.db.select('sessions', { select: 'id,started_at,duration_s,title,avg_hr,primary_source', deleted_at: 'is.null', and: `(started_at.gte.${D.date}T00:00:00Z,started_at.lt.${D.date}T23:59:59Z)`, primary_source: 'eq.healthkit', order: 'started_at' });
  } catch { candidates = []; }
}

function draw() {
  if (!D) return;
  const panel = document.querySelector('#sheet .panel'); const top = panel?.scrollTop ?? 0;
  setSheet(html`<div id="logger">
    <input class="title-in big" data-df="title" value="${D.title ?? ''}" placeholder="Título (opcional)">
    <div class="grid2"><div><label>Fecha</label><input type="date" data-df="date" value="${D.date}"></div><div><label>Hora de inicio</label><input type="time" data-df="startTime" value="${D.startTime ?? '18:00'}"></div></div>
    ${D.sourceText != null && D.origin !== 'manual' ? html`<details class="small"><summary class="muted">Texto leído${D.origin === 'ai' ? ' de la foto' : ''} (puedes corregirlo)</summary>
      <textarea class="mono" id="srctext" rows="6">${D.sourceText}</textarea>
      <button class="sm" data-act="${act(() => { const t = document.getElementById('srctext').value; const p = parseWorkoutText(t); if (!p.sections.length) return toast('No encuentro ejercicios'); D.blocks = p.sections.filter((s) => s.items.length).map(buildBlock); D.sourceText = t; persist(); draw(); })}">Volver a interpretar</button></details>` : ''}
    ${D.blocks.map((b, bi) => blockView(bi, b))}
    <div class="grid3"><button class="sm" data-act="${act(() => addBlock('strength'))}">+ Fuerza</button><button class="sm" data-act="${act(() => addBlock('wod'))}">+ WOD</button><button class="sm" data-act="${act(() => addBlock('endurance'))}">+ Endurance</button></div>
    <div class="grid2"><div><label>Esfuerzo global (RPE 1-10)</label><select data-df="rpe"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<option ${D.rpe === n ? 'selected' : ''}>${n}</option>`)}</select></div>
      <div><label>Duración total (min)</label><input class="num" data-df="durationMin" value="${D.durationMin ?? 60}"></div></div>
    ${candidates.length ? html`<label>¿Lo unimos a tu entreno del Apple Watch?</label><select data-df="linkSessionId"><option value="">No, sesión nueva</option>${candidates.map((c, i) => html`<option value="${c.id}" ${D.linkSessionId === c.id || (D.linkSessionId === undefined && i === 0) ? 'selected' : ''}>${timeOf(c.started_at)} · ${Math.round(c.duration_s / 60)} min${c.avg_hr ? ` · ${c.avg_hr} ppm` : ''}</option>`)}</select>` : ''}
    <button class="primary block" data-act="${act(save)}">${D.editId ? 'Guardar cambios' : 'Guardar entreno'}</button>
    <button class="block ghost small" data-act="${act(() => { if (confirm('¿Descartar este registro?')) { dropDraft(); closeSheet(); render(); } })}">Descartar</button>
    <p class="xs muted center">Se guarda solo mientras registras. Si sales, lo recuperas en Entrenos.</p></div>`);
  const p2 = document.querySelector('#sheet .panel'); if (p2) p2.scrollTop = top;
}

function addBlock(part) { const b = newBlock(part); D.blocks.push(b); editing.add(b.id); persist(); draw(); }

export async function openLogger() {
  if (!D) return;
  sheet(D.editId ? 'Editar entreno' : 'Registrar entreno', '');
  bindInputs();
  draw();
  get('exercises', () => api.db.select('exercises', { select: 'id,name' }), 864e5).then((ex) => { exNames = ex.map((e) => e.name).sort(); }).catch(() => {});
  await loadCandidates();
  if (candidates.length && D.linkSessionId === undefined) D.linkSessionId = candidates[0].id;
  draw();
}

function num(v) { const n = Number(String(v).replace(',', '.')); return v === '' || Number.isNaN(n) ? undefined : n; }

function bindInputs() {
  const el = document.getElementById('sheet');
  const onInput = (e) => {
    const t = e.target; if (!D) return;
    const ds = t.dataset;
    if (ds.lf) {
      const b = D.blocks[+ds.b];
      if (ds.lf === 'time') { b.result.timeS = parseClock(t.value); persist(); return; }
      if (ds.lf === 'cap') { b.result.capped = t.checked; persist(); draw(); return; }
      if (ds.lf === 'capreps') { b.result.reps = num(t.value); persist(); return; }
      const r = b.groups[+ds.g].rows[+ds.r];
      if (ds.lf === 'done') r.done = num(t.value); else r.doneKg = num(t.value);
      if (r.status === 'pending' && t.value !== '') r.status = 'done';
      if (r.status !== 'pending' && r.status !== 'skipped') r.status = statusFor({ ...r, status: 'done' });
      persist(); refreshRow(r); return;
    }
    if (ds.bf) { D.blocks[+ds.b].title = t.value; persist(); return; }
    if (ds.df) {
      const k = ds.df; const v = t.value;
      D[k] = k === 'rpe' || k === 'durationMin' ? num(v) : k === 'linkSessionId' ? (v || null) : v;
      persist();
      if (k === 'date' && e.type === 'change') loadCandidates().then(draw);
      return;
    }
    if (ds.sf) {
      const b = D.blocks[+ds.b]; const v = t.value;
      if (ds.sf === 'part') b.part = v;
      if (ds.sf === 'format') { b.format = v; if (v === 'emom') b.intervalS ??= 60; if (e.type === 'change') draw(); }
      if (ds.sf === 'rounds') b.rounds = num(v);
      if (ds.sf === 'minutes') { const m = num(v); if (b.format === 'amrap' || b.format === 'emom') b.durationMin = m; else b.timeCapS = m ? m * 60 : undefined; }
      if (ds.sf === 'interval') b.intervalS = num(v) ?? 60;
      persist(); return;
    }
    if (ds.tf) {
      const b = D.blocks[+ds.b]; const tr = b.template[+ds.t]; const v = t.value.trim();
      if (ds.tf === 'exercise') tr.exercise = v ? displayName(v) === v ? v : displayName(v) : v;
      if (ds.tf === 'target') { const parts = v.split(/[-/]/).map(num).filter((x) => x != null); if (parts.length > 1) { tr.scheme = parts; tr.target = parts[0]; } else { tr.scheme = undefined; tr.target = parts[0]; } }
      if (ds.tf === 'unit') tr.unit = v;
      if (ds.tf === 'kg') { tr.targetKg = tr.targetPct = tr.targetText = undefined; const pct = v.match(/^(\d+(?:[.,]\d+)?)\s*%$/); if (pct) tr.targetPct = num(pct[1]); else if (num(v) != null) tr.targetKg = num(v); else if (v) tr.targetText = v; }
      persist(); return;
    }
  };
  el.oninput = onInput;
  el.onchange = onInput;
}

async function save(btn) {
  if (!D.blocks.length) return toast('Añade al menos un bloque');
  const pend = D.blocks.flatMap((b) => b.groups.flatMap((g) => g.rows)).filter((r) => !r.rest && r.status === 'pending').length;
  if (pend && !confirm(`Quedan ${pend} casillas sin marcar: se guardarán como no hechas. ¿Guardar igualmente?`)) return;
  await busy(btn, async () => {
    const startedAt = new Date(`${D.date}T${D.startTime || '18:00'}:00`).toISOString();
    const session = logToSession(D, { id: uuid(), startedAt, durationS: (D.durationMin ?? 60) * 60 });
    if (!session.blocks) return toast('No hay ninguna serie para guardar');
    const r = await api.fn('ingest-session', { session, attachTo: D.editId ?? D.linkSessionId ?? undefined, edit: !!D.editId });
    if (D.importId) api.db.update('photo_imports', { status: 'confirmed', session_id: r.sessionId }, { id: `eq.${D.importId}` }).catch(() => {});
    const lines = summarizeLog(D); const wasEdit = !!D.editId;
    dropDraft(); closeSheet(); invalidate('sessions', 'planned', 'readiness', 'changes', 'insights', 'records', 'exhist'); render();
    toast([wasEdit ? 'Cambios guardados' : r.merged ? 'Unido a tu sesión del Watch' : 'Entreno guardado', ...lines, ...r.prs.map((p) => `🏆 ${p}`), ...r.changes.filter((c) => c.action !== 'mark_done').map((c) => c.reason)].join(' · '), 8000);
  });
}

// ---------------- Historial por ejercicio ----------------
export async function exerciseHistory(exerciseId) {
  sheet('Historial por ejercicio', html`<div class="center"><span class="spinner"></span></div>`);
  const [sets, ex] = await Promise.all([
    get('exhist', () => api.db.select('session_sets', { select: 'exercise_id,performed_on,reps,load_kg,calories,distance_m,duration_s,status,set_label,target_reps,target_load_kg,session_id', exercise_id: 'not.is.null', status: 'neq.skipped', order: 'performed_on.desc,position', limit: 2000 }), 300_000),
    get('exercises', () => api.db.select('exercises', { select: 'id,name' }), 864e5),
  ]);
  const name = Object.fromEntries(ex.map((e) => [e.id, e.name]));
  const count = {}; for (const s of sets) count[s.exercise_id] = (count[s.exercise_id] ?? 0) + 1;
  const ids = Object.keys(count).sort((a, b) => count[b] - count[a]);
  let cur = exerciseId && count[exerciseId] ? exerciseId : ids[0];
  const show = () => {
    if (!ids.length) return setSheet(html`<p class="small muted">Aún no hay series registradas. Registra un entreno por casillas y aparecerá aquí.</p>`);
    const mine = sets.filter((s) => s.exercise_id === cur);
    const byDay = {}; for (const s of mine) (byDay[s.performed_on] ??= []).push(s);
    const days = Object.keys(byDay).sort().reverse();
    const top = days.map((d) => ({ d, kg: Math.max(0, ...byDay[d].map((s) => +s.load_kg || 0)) })).filter((x) => x.kg > 0).reverse();
    const qty = (s) => (s.reps != null ? `${s.reps}` : s.calories != null ? `${+s.calories} cal` : s.distance_m != null ? `${+s.distance_m} m` : s.duration_s != null ? `${s.duration_s} s` : '');
    setSheet(html`<select data-change="${act((el) => { cur = el.value; show(); })}">${ids.map((id) => html`<option value="${id}" ${id === cur ? 'selected' : ''}>${name[id] ?? id} (${count[id]})</option>`)}</select>
      ${top.length >= 2 ? html`<div class="card"><h3>Peso máximo por día</h3>${lineChart([{ color: 'var(--amber)', points: top.slice(-30).map((x) => ({ x: shortDate(x.d), y: x.kg })) }], { height: 120 })}</div>` : ''}
      ${days.map((d) => { const ss = byDay[d]; const vol = ss.reduce((a, s) => a + (s.reps ?? 0) * (+s.load_kg || 0), 0); const best = Math.max(0, ...ss.map((s) => +s.load_kg || 0));
        return html`<div class="card tight"><div class="row"><b class="grow">${dayName(d)}</b>${best ? html`<span class="tag amber">máx ${best} kg</span>` : ''}</div>
          <div class="small">${ss.map((s) => html`<span class="chip ${s.status === 'partial' ? 'warn' : ''}" title="${s.set_label ?? ''}">${qty(s)}${s.load_kg ? html` × ${+s.load_kg} kg` : ''}${s.status === 'partial' && s.target_reps ? html` <span class="xs">(de ${+s.target_reps})</span>` : ''}</span>`)}</div>
          <div class="xs muted">${ss.length} series${vol ? ` · volumen ${Math.round(vol).toLocaleString('es-ES')} kg` : ''}</div></div>`; })}`);
  };
  show();
}

// ---------------- Historial de cambios de un entreno ----------------
export async function sessionEdits(id) {
  const rows = await api.db.select('session_edits', { session_id: `eq.${id}`, order: 'edited_at.desc', limit: 50 }).catch(() => []);
  const LBL = { title: 'Título', rpe: 'RPE', duration_s: 'Duración', started_at: 'Inicio', discipline: 'Disciplina', notes: 'Notas', distance_m: 'Distancia', deleted_at: 'Eliminado', registro: 'Registro de series' };
  const val = (f, v) => (v == null ? '—' : f === 'registro' ? `${v.length} series` : f === 'duration_s' ? `${Math.round(v / 60)} min` : f === 'started_at' || f === 'deleted_at' ? `${shortDate(v)} ${timeOf(v)}` : String(v));
  sheet('Historial de cambios', rows.length ? html`${rows.map((r) => html`<div class="card tight"><div class="row"><b class="grow">${LBL[r.field] ?? r.field}</b><span class="xs muted">${shortDate(r.edited_at)} ${timeOf(r.edited_at)} · ${r.actor}</span></div>
    <div class="small"><span class="muted">${val(r.field, r.old_value)}</span> → <b>${val(r.field, r.new_value)}</b></div></div>`)}` : html`<p class="small muted">Sin cambios desde que se registró.</p>`);
}
