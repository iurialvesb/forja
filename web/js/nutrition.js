// Nutrición: hoy (chequeo diario), menú semanal, compra, batch cooking, despensa y suplementos.
import * as api from './api.js';
import { get, invalidate, render } from './app.js';
import { html, act, toast, sheet, setSheet, closeSheet, busy, today, addDays, monday, dayName, shortDate, n0, bar, resizeImage, SLOTS, slotName, GOAL_MODES } from './ui.js';

const uid = () => api.userId();
let tab = 'hoy', menuWeek = 0, shopWeek = 7, batchWeek = 7;
const TABS = [['hoy', 'Hoy'], ['menu', 'Menú'], ['compra', 'Compra'], ['batch', 'Batch'], ['despensa', 'Despensa'], ['suplementos', 'Suplementos']];
const week = (mon) => get(`nutweek:${mon}`, () => api.fn('nutrition-day', { weekStart: mon }), 120_000);
const refresh = () => { invalidate('nutweek', 'shopping', 'pantry'); render(); };

export async function NUTRITION() {
  const chips = html`<div class="chips">${TABS.map(([k, l]) => html`<button class="chip ${tab === k ? 'on' : ''}" data-act="${act(() => { tab = k; render(); })}">${l}</button>`)}</div>`;
  const body = await ({ hoy, menu, compra, batch, despensa, suplementos })[tab]();
  return { title: 'Nutrición', right: html`<button class="icon-btn" data-act="${act(settings)}">🎯</button>`, body: html`${chips}${body}` };
}

// ---------------- HOY ----------------
async function hoy() {
  const w = await week(monday());
  const d = w.days.find((x) => x.date === today());
  if (!d) return html`<div class="card muted">Sin datos para hoy.</div>`;
  const T = d.target.macros, S = d.totals;
  const mb = (n, v, t, c) => html`<div style="margin:8px 0"><div class="row small"><span class="grow">${n}</span><b>${n0(v)} / ${n0(t)} g</b></div>${bar(v, t, Math.abs(v - t) / Math.max(1, t) > 0.12 ? 'var(--amber)' : c)}</div>`;
  const meals = [...d.meals].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return html`
    <div class="card"><div class="row"><div class="grow"><div class="small muted">Día de carga ${d.target.load} · ${({ definicion: 'definiendo', volumen: 'ganando masa', mantenimiento: 'mantenimiento', recomposicion: 'recomposición', rendimiento: 'rendimiento' })[w.settings.mode] ?? ''}</div>
      <div style="font-size:24px;font-weight:800">${n0(S.kcal)} <span class="muted small">/ ${n0(T.kcal)} kcal</span></div></div></div>
      ${mb('Proteína', S.protein, T.protein, 'var(--red)')}${mb('Hidratos', S.carbs, T.carbs, 'var(--blue)')}${mb('Grasa', S.fat, T.fat, 'var(--amber)')}
      <div class="xs muted">Previsto con tu menú + lo que has registrado fuera de él (${n0(d.eaten.kcal)} kcal).${d.adherence ? ` Cumplimiento: ${d.adherence.mealsDone}/${d.adherence.mealsTotal} comidas · ${d.adherence.score}/100.` : ''}</div></div>
    ${d.alerts.map((a) => html`<div class="card tight alert">⚠️ ${a.message}</div>`)}
    ${w.balance?.message ? html`<div class="card tight small">📅 ${w.balance.message}</div>` : ''}
    ${d.adjustments?.length ? html`<div class="card tight"><div class="small" style="color:var(--accent);font-weight:700">🔄 He reajustado lo que te queda hoy</div>${d.adjustments.map((a) => html`<div class="small">• ${a.text}</div>`)}</div>` : ''}
    ${meals.map((m) => mealCard(m))}
    ${!meals.length ? html`<div class="card muted small">Sin menú para hoy. Genéralo en <b>Batch</b>.</div>` : ''}
    <button class="primary block" data-act="${act(() => logFood())}">＋ He comido algo (extra o fuera del menú)</button>
    <details><summary>Por qué estos objetivos</summary>${d.target.explanation.map((e) => html`<p class="small muted">${e}</p>`)}</details>`;
}

const mealAction = (m, action, extra = {}) => async (b) => busy(b, async () => {
  const r = await api.fn('meal-update', { mealId: m.id, action, ...extra });
  invalidate('nutweek'); render();
  const msg = [...(r.adjustments || []).map((a) => a.text), ...(r.alerts || []).map((a) => a.message)];
  if (msg.length) toast(msg.join(' · '), 8000);
});

function mealCard(m) {
  const st = m.status;
  return html`<div class="card tight">
    <div class="row"><b style="color:var(--accent)" class="small grow">${slotName(m.slot)} ${m.locked ? '🔒' : ''}</b><span class="xs muted">${n0(m.macros.kcal)} kcal · P${n0(m.macros.protein)} C${n0(m.macros.carbs)} G${n0(m.macros.fat)}</span></div>
    <div style="font-weight:600;${st === 'skipped' ? 'text-decoration:line-through;opacity:.6' : ''}">${m.title}</div>
    <div class="small muted">${m.ingredients.map((i) => `${i.name} ${Math.round(i.grams)} g`).join(' · ')}</div>
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">
      ${st === 'eaten' ? html`<span class="ok small">✅ Cumplido</span><button class="sm ghost" data-act="${act(mealAction(m, 'reset'))}">Deshacer</button>`
        : st === 'skipped' ? html`<span class="bad small">✕ No comido</span><button class="sm ghost" data-act="${act(mealAction(m, 'reset'))}">Deshacer</button>`
        : html`<button class="sm" style="color:var(--green)" data-act="${act(mealAction(m, 'eaten'))}">✓ Cumplido</button>
          <button class="sm" data-act="${act(() => partial(m))}">◐ A medias</button>
          <button class="sm" style="color:var(--red)" data-act="${act(mealAction(m, 'skip'))}">✕ No</button>`}
      <button class="sm" data-act="${act(() => editMeal(m))}">✎ Cambiar</button>
      ${m.fromBatch ? html`<span class="tag purple">batch</span>` : ''}
    </div></div>`;
}

function partial(m) {
  sheet('¿Cuánto has comido?', html`${[[0.25, '¼ de la ración'], [0.5, 'La mitad'], [0.75, '¾ de la ración'], [1.25, 'Un 25 % más'], [1.5, 'Un 50 % más']].map(([f, l]) => html`<button class="block" data-act="${act(async (b) => { await mealAction(m, 'partial', { fraction: f })(b); closeSheet(); })}">${l}</button>`)}`);
}

async function editMeal(m) {
  const recipes = await get('recipes', () => api.db.select('recipes', { select: 'id,name,tags', order: 'created_at.desc', limit: 40 }));
  const ing = m.ingredients.map((i) => ({ ...i }));
  sheet(`${slotName(m.slot)} · ${dayName(m.date)}`, html`
    <h3>Cantidades</h3>
    ${ing.map((i, k) => html`<div class="row"><span class="grow small">${i.name}</span><input style="width:90px" type="number" inputmode="numeric" value="${Math.round(i.grams)}" data-change="${act((el) => { ing[k].grams = +el.value; })}"> g
      <button class="sm ghost danger" data-act="${act((b) => { ing.splice(k, 1); b.closest('.row').remove(); })}">✕</button></div>`)}
    <p class="xs muted">Al guardar ajusto las comidas que te quedan para cuadrar macros y calorías.</p>
    <button class="primary block" data-act="${act(async (b) => { await mealAction(m, 'edit', { ingredients: ing })(b); closeSheet(); })}">Guardar y reajustar el día</button>
    <button class="block" data-act="${act(async (b) => { await mealAction(m, m.locked ? 'unlock' : 'lock')(b); closeSheet(); })}">${m.locked ? 'Desbloquear' : '🔒 Fijar esta comida tal cual'}</button>
    ${m.status !== 'planned' ? html`<button class="block" data-act="${act(async (b) => { await mealAction(m, 'reset')(b); closeSheet(); })}">Volver a la propuesta original</button>` : ''}
    <h3 style="margin-top:14px">Cambiar por otro plato</h3>
    ${recipes.map((r) => html`<button class="block" data-act="${act(async (b) => { await mealAction(m, 'swap', { recipeId: r.id })(b); closeSheet(); })}">${r.name}</button>`)}
    ${!recipes.length ? html`<p class="small muted">Aún no hay recetas: genera el menú en Batch.</p>` : ''}`);
}

// Registrar comida (texto, foto o código de barras)
export function logFood(slot) {
  const now = new Date().getHours();
  let sel = slot ?? (now < 11 ? 'desayuno' : now < 13 ? 'media_manana' : now < 16 ? 'comida' : now < 20 ? 'merienda' : 'cena');
  let items = [], questions = [], photoPath = null;
  const draw = () => setSheet(html`
    <label>Comida</label><select id="lslot">${SLOTS.map((s) => html`<option value="${s}" ${s === sel ? 'selected' : ''}>${slotName(s)}</option>`)}</select>
    <label>¿Qué has comido?</label><textarea id="ltext" placeholder="Ej.: 200 g de pollo, 80 g de arroz, una cucharada de aceite y una manzana"></textarea>
    <button class="block" data-act="${act((b) => busy(b, async () => { const t = document.getElementById('ltext').value.trim(); if (!t) return; const r = await api.fn('nutrition-log', { action: 'parse', text: t }); items.push(...r.items); questions = r.questions || []; draw(); }))}">Analizar texto</button>
    <div class="grid2"><label class="btn" style="margin:0">📷 Foto del plato<input type="file" accept="image/*" id="lphoto" hidden></label>
      <button data-act="${act(() => { const c = prompt('Número del código de barras'); if (c) busy(null, async () => { const r = await api.fn('nutrition-log', { action: 'parse', barcode: c.trim() }); items.push(...r.items); questions = r.questions || []; draw(); }); })}">🔢 Código de barras</button></div>
    ${questions.map((qq) => html`<p class="alert small">❓ ${qq}</p>`)}
    ${items.length ? html`<h3 style="margin-top:12px">Alimentos</h3>${items.map((i, k) => html`<div class="row"><span class="grow small">${i.name} ${i.gramsConfidence === 'estimado' ? html`<span class="tag amber">estimado</span>` : ''}</span>
        <input style="width:80px" type="number" value="${i.grams}" data-change="${act((el) => { items[k].grams = +el.value; })}"> g <button class="sm ghost danger" data-act="${act(() => { items.splice(k, 1); draw(); })}">✕</button></div>`)}
      <label class="check"><input type="checkbox" id="lded" checked> Descontar de mi despensa</label>
      <button class="primary block" data-act="${act((b) => busy(b, async () => {
        sel = document.getElementById('lslot').value;
        const r = await api.fn('nutrition-log', { action: 'confirm', date: today(), slot: sel, items: items.map(({ foodId, name, grams }) => ({ foodId, name, grams })), source: photoPath ? 'foto' : 'texto', deductPantry: document.getElementById('lded').checked, photoPath });
        closeSheet(); invalidate('nutweek', 'pantry'); render();
        const msgs = [...(r.day?.alerts || []).map((a) => a.message), ...(r.missingInPantry || []).map((x) => `No tenías ${x.name} en la despensa.`)];
        toast(msgs.length ? msgs.join(' · ') : `Registrado: ${n0(r.logged.kcal)} kcal`, 7000);
      }))}">Registrar</button>` : ''}
    <p class="xs muted">Macros de USDA FoodData Central y Open Food Facts (ODbL). La IA (Gemini) solo interpreta qué y cuánto has comido.</p>`);
  sheet('Registrar comida', '');
  draw();
  document.getElementById('sheet').onchange = async (e) => {
    if (e.target.id !== 'lphoto' || !e.target.files[0]) return;
    try { toast('Analizando la foto…'); photoPath = await api.uploadPhoto(await resizeImage(e.target.files[0], 1400)); const r = await api.fn('nutrition-log', { action: 'parse', photoPath }); items.push(...r.items); questions = r.questions || []; draw(); }
    catch (err) { toast(err.message, 6000); }
  };
}

// ---------------- MENÚ ----------------
async function menu() {
  const mon = addDays(monday(), menuWeek);
  const w = await week(mon);
  return html`
    <div class="row"><button class="sm" data-act="${act(() => { menuWeek -= 7; render(); })}">‹</button><b class="grow" style="text-align:center">Semana del ${shortDate(mon)}</b><button class="sm" data-act="${act(() => { menuWeek += 7; render(); })}">›</button></div>
    ${w.days.map((d) => html`<h2>${dayName(d.date)} <small>${n0(d.totals.kcal)}/${n0(d.target.macros.kcal)} kcal · P ${n0(d.totals.protein)}/${n0(d.target.macros.protein)}</small></h2>
      ${d.meals.length ? [...d.meals].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)).map((m) => html`<div class="card tight row" data-act="${act(() => editMeal(m))}"><div class="grow"><div class="xs" style="color:var(--accent)">${slotName(m.slot)}</div><div class="small" style="font-weight:600">${m.title}</div></div><span class="xs muted">${n0(m.macros.kcal)} kcal</span>${m.status !== 'planned' ? ' ✎' : ''}</div>`) : html`<div class="card tight muted small">Sin menú.</div>`}
      ${d.alerts.map((a) => html`<div class="small alert">⚠️ ${a.message}</div>`)}`)}`;
}

// ---------------- COMPRA ----------------
async function compra() {
  const mon = addDays(monday(), shopWeek);
  const l = await get(`shopping:${mon}`, () => api.fn('shopping-list', { action: 'build', weekStart: mon }));
  const checked = new Set(l.checked || []);
  const by = {}; for (const i of l.items) (by[i.aisle] ??= []).push(i);
  const share = Object.keys(by).sort().map((a) => `${a.toUpperCase()}\n${by[a].map((i) => `☐ ${i.name} – ${i.buyUnits ? `${i.buyUnits} ud` : `${i.buyG} g`}`).join('\n')}`).join('\n\n');
  return html`
    <div class="seg"><button class="${shopWeek === 0 ? 'on' : ''}" data-act="${act(() => { shopWeek = 0; render(); })}">Esta semana</button><button class="${shopWeek === 7 ? 'on' : ''}" data-act="${act(() => { shopWeek = 7; render(); })}">Semana que viene</button></div>
    <p class="xs muted">Lo que comerás esa semana menos lo que tienes en congelador, nevera y despensa, descontando lo que aún comerás antes y lo que caduca antes de usarlo (+5 % de margen).</p>
    ${l.note ? html`<div class="card muted small">${l.note}</div>` : ''}
    ${Object.keys(by).sort().map((a) => html`<h2>${a}</h2><div class="card tight list">${by[a].map((i) => html`
      <label class="item" style="margin:0"><input type="checkbox" ${checked.has(i.foodId) ? 'checked' : ''} data-change="${act((el) => api.fn('shopping-list', { action: 'check', weekStart: mon, foodId: i.foodId, checked: el.checked }).then(() => invalidate(`shopping:${mon}`)))}">
        <div class="grow"><div style="color:var(--text)">${i.name}</div><div class="xs muted">Necesitas ${i.needG} g · tienes ${i.haveG} g · desde el ${dayName(i.firstNeeded)}</div>${i.note ? html`<div class="xs alert">${i.note}</div>` : ''}</div>
        <b style="color:var(--text)">${i.buyUnits ? `${i.buyUnits} ud` : `${i.buyG} g`}</b></label>`)}</div>`)}
    ${l.coveredByStock?.length ? html`<details><summary>Ya lo tienes en casa (${l.coveredByStock.length})</summary>${l.coveredByStock.map((c) => html`<div class="small muted">${c.name} · ${c.grams} g</div>`)}</details>` : ''}
    ${l.items.length ? html`
      <button class="primary block" data-act="${act((b) => busy(b, async () => { const r = await api.fn('shopping-list', { action: 'bought', weekStart: mon }); invalidate('shopping', 'pantry'); render(); toast(`${r.addedToPantry} artículos añadidos a tu despensa`); }))}">Pasar lo marcado a la despensa</button>
      <button class="block" data-act="${act(async () => { if (navigator.share) await navigator.share({ title: 'Lista de la compra', text: share }).catch(() => {}); else { await navigator.clipboard.writeText(share); toast('Lista copiada'); } })}">Compartir lista</button>
      <p class="xs muted">La carne y el pescado de los 2 próximos días van a la nevera; el resto, al congelador.</p>` : ''}
    <button class="block" data-act="${act(() => { invalidate('shopping'); render(); })}">Recalcular</button>`;
}

// ---------------- BATCH ----------------
async function batch() {
  const mon = addDays(monday(), batchWeek);
  const w = await week(mon);
  const p = w.batchPlan;
  return html`
    <div class="card"><h3>Menú semanal y batch cooking</h3>
      <p class="small muted">Con lo que tienes en casa diseño las recetas del batch, reparto los táperes por días y ajusto cada ración a tus macros según el entreno de ese día. Usa la IA (tarda 1-2 min).</p>
      <div class="seg"><button class="${batchWeek === 0 ? 'on' : ''}" data-act="${act(() => { batchWeek = 0; render(); })}">Esta semana</button><button class="${batchWeek === 7 ? 'on' : ''}" data-act="${act(() => { batchWeek = 7; render(); })}">Semana que viene</button></div>
      <button class="primary block" data-act="${act((b) => busy(b, async () => {
        const r = await api.fn('menu-plan', { weekStart: mon }); invalidate('nutweek', 'shopping', 'recipes'); render();
        toast([`Menú creado: ${r.meals} comidas`, ...(r.unresolved?.length ? [`Sin datos nutricionales: ${r.unresolved.join(', ')}`] : []), ...(r.notes || [])].join(' · '), 9000);
      }))}">Generar menú y batch cooking</button></div>
    ${p ? html`
      <h2>Plan de cocina <small>≈ ${Math.round(p.totalMinutes)} min · ${dayName(p.cookDate, true)}</small></h2>
      <div class="card tight">${p.tasks.map((t) => html`<div class="row top" style="padding:6px 0"><b style="width:38px;color:var(--accent)" class="small">${Math.round(t.start)}′</b><div class="grow"><div class="small">${t.text}</div><div class="xs muted">${t.recipe}${t.equipment ? ` · ${t.equipment}` : ''} · ${t.hands === 'pasiva' ? 'puedes hacer otra cosa' : 'manos ocupadas'}</div></div></div>`)}</div>
      ${p.warnings.map((x) => html`<p class="alert small">⚠️ ${x}</p>`)}
      <h2>Cantidades totales</h2>${p.totals.map((t) => html`<div class="card tight"><b class="small">${t.recipe}</b><div class="xs muted">${t.ingredients.map((i) => `${i.name} ${i.grams} g`).join(' · ')}</div></div>`)}
      <h2>Táperes <small>${p.containers.length}</small></h2>${p.containers.map((c) => html`<div class="card tight"><div class="row"><b class="small grow">${dayName(c.date)} · ${slotName(c.slot)}</b><span class="tag ${c.storage === 'congelador' ? 'blue' : 'green'}">${c.storage}</span></div><div class="small">${c.recipe}</div><div class="xs muted">${c.contents.map((i) => `${i.name} ${i.grams} g`).join(' · ')}</div>${c.note ? html`<div class="xs alert">${c.note}</div>` : ''}</div>`)}`
      : html`<div class="card muted small">Aún no hay plan de batch para esta semana.</div>`}`;
}

// ---------------- DESPENSA ----------------
async function despensa() {
  const items = await get('pantry', () => api.db.select('pantry_items', { order: 'name' }));
  const soon = addDays(today(), 3);
  return html`
    <button class="primary block" data-act="${act(addPantry)}">＋ Añadir lo que tengo en casa</button>
    ${['congelador', 'nevera', 'despensa'].map((loc) => html`<h2>${loc[0].toUpperCase() + loc.slice(1)} <small>${items.filter((i) => i.location === loc).length}</small></h2>
      <div class="card tight list">${items.filter((i) => i.location === loc).map((i) => html`<div class="item">
        <div class="grow"><div>${i.name} ${!i.food_id ? html`<span class="tag amber">sin datos</span>` : ''}</div>${i.expires_on ? html`<div class="xs ${i.expires_on <= soon ? 'bad' : 'muted'}">Caduca ${shortDate(i.expires_on)}</div>` : ''}</div>
        <span class="muted small">${i.quantity_g != null ? `${n0(i.quantity_g)} g` : i.units != null ? `${n0(i.units)} ud` : '—'}</span>
        <button class="sm ghost" data-act="${act(() => editPantry(i))}">✎</button></div>`)}
        ${!items.filter((i) => i.location === loc).length ? html`<div class="item muted small">Vacío</div>` : ''}</div>`)}`;
}

function addPantry() {
  let parsed = [];
  const draw = () => setSheet(html`
    <p class="small muted">Dímelo como quieras (puedes dictarlo con el micrófono del teclado) o haz una foto de la nevera.</p>
    <textarea id="ptext" placeholder="En el congelador 1 kg de pechuga de pollo y 2 paquetes de salmón; en la nevera 6 huevos, 2 yogures griegos, espinacas; en la despensa arroz, avena y garbanzos"></textarea>
    <div class="grid2"><button data-act="${act((b) => busy(b, async () => { const t = document.getElementById('ptext').value.trim(); if (!t) return; const r = await api.fn('pantry', { action: 'parse', text: t }); parsed.push(...r.items); draw(); if (r.questions?.length) toast(r.questions.join(' · '), 7000); }))}">Organizar</button>
      <label class="btn" style="margin:0">📷 Foto<input type="file" accept="image/*" id="pphoto" hidden></label></div>
    ${parsed.length ? html`<h3 style="margin-top:12px">Revisa</h3>${parsed.map((p, k) => html`<div class="card tight">
        <input value="${p.name}" data-change="${act((el) => { parsed[k].name = el.value; })}">
        <div class="row" style="margin-top:6px"><select data-change="${act((el) => { parsed[k].location = el.value; })}">${['congelador', 'nevera', 'despensa'].map((l) => html`<option ${p.location === l ? 'selected' : ''}>${l}</option>`)}</select>
          <input type="number" placeholder="g" value="${p.quantityG ?? ''}" data-change="${act((el) => { parsed[k].quantityG = el.value ? +el.value : undefined; })}">
          <input type="number" placeholder="ud" value="${p.units ?? ''}" data-change="${act((el) => { parsed[k].units = el.value ? +el.value : undefined; })}">
          <button class="sm ghost danger" data-act="${act(() => { parsed.splice(k, 1); draw(); })}">✕</button></div></div>`)}
      <button class="primary block" data-act="${act((b) => busy(b, async () => { const r = await api.fn('pantry', { action: 'save', items: parsed }); closeSheet(); invalidate('pantry', 'shopping'); render(); toast(r.unresolved.length ? `Guardado. Sin datos nutricionales: ${r.unresolved.join(', ')}` : `${r.saved} artículos guardados`, 6000); }))}">Guardar ${parsed.length} artículos</button>` : ''}
    <details><summary>Añadir a mano</summary><form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => { await api.fn('pantry', { action: 'save', items: [{ name: v.name, queryEn: v.name, location: v.location, quantityG: v.g ? +v.g : undefined, units: v.u ? +v.u : undefined, expiresOn: v.exp || undefined }] }); closeSheet(); invalidate('pantry', 'shopping'); render(); }))}">
      <label>Nombre</label><input name="name" required><label>Lugar</label><select name="location"><option>nevera</option><option>congelador</option><option>despensa</option></select>
      <div class="grid2"><div><label>Gramos</label><input name="g" type="number"></div><div><label>Unidades</label><input name="u" type="number"></div></div>
      <label>Caduca</label><input name="exp" type="date"><button class="block">Añadir</button></form></details>`);
  sheet('Añadir a la despensa', '');
  draw();
  document.getElementById('sheet').onchange = async (e) => {
    if (e.target.id !== 'pphoto' || !e.target.files[0]) return;
    try { toast('Analizando la foto…'); const path = await api.uploadPhoto(await resizeImage(e.target.files[0], 1600)); const r = await api.fn('pantry', { action: 'parse', photoPath: path }); parsed.push(...r.items); draw(); }
    catch (err) { toast(err.message, 6000); }
  };
}

function editPantry(i) {
  sheet(i.name, html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      await api.db.update('pantry_items', { quantity_g: v.g ? +v.g : null, units: v.u ? +v.u : null, location: v.location, expires_on: v.exp || null }, { id: `eq.${i.id}` }); closeSheet(); invalidate('pantry', 'shopping'); render();
    }))}">
    <label>Lugar</label><select name="location">${['congelador', 'nevera', 'despensa'].map((l) => html`<option ${i.location === l ? 'selected' : ''}>${l}</option>`)}</select>
    <div class="grid2"><div><label>Gramos</label><input name="g" type="number" value="${i.quantity_g ?? ''}"></div><div><label>Unidades</label><input name="u" type="number" value="${i.units ?? ''}"></div></div>
    <label>Caduca</label><input name="exp" type="date" value="${i.expires_on ?? ''}"><button class="primary block">Guardar</button></form>
    <button class="block danger" data-act="${act((b) => busy(b, async () => { await api.db.remove('pantry_items', { id: `eq.${i.id}` }); closeSheet(); invalidate('pantry', 'shopping'); render(); }))}">Eliminar (se ha acabado)</button>`);
}

// ---------------- SUPLEMENTOS ----------------
async function suplementos() {
  const [w, mine, logs] = await Promise.all([week(monday()), get('supps', () => api.db.select('supplements', { active: 'eq.true' })), api.db.select('supplement_logs', { date: `eq.${today()}` })]);
  const taken = new Set(logs.map((l) => l.supplement_id));
  const KINDS = [['vitamina_c', 'Vitamina C'], ['magnesio', 'Magnesio'], ['colageno', 'Colágeno'], ['creatina', 'Creatina'], ['omega3', 'Omega-3'], ['vitamina_d', 'Vitamina D'], ['otro', 'Otro']];
  return html`
    <h2>Hoy</h2>
    ${w.supplements.recs.map((r) => html`<div class="card tight"><div class="row"><span>${r.take ? '✅' : '➖'}</span><b class="grow">${r.name}</b>
        ${r.take && r.supplementId ? (taken.has(r.supplementId) ? html`<span class="ok small">Tomado</span>` : html`<button class="sm" data-act="${act((b) => busy(b, async () => {
          await api.db.upsert('supplement_logs', [{ user_id: uid(), date: today(), supplement_id: r.supplementId, taken: true }], 'user_id,date,supplement_id');
          const s = mine.find((x) => x.id === r.supplementId); if (s?.stock > 0) await api.db.update('supplements', { stock: s.stock - 1 }, { id: `eq.${s.id}` });
          invalidate('supps'); render();
        }))}">Marcar tomado</button>`) : ''}</div>
      ${r.take && r.when ? html`<div class="small" style="color:var(--accent)">${r.when}</div>` : ''}<div class="small muted">${r.reason}</div></div>`)}
    ${w.supplements.notes.map((n) => html`<p class="xs muted">${n}</p>`)}
    <h2>Los que tengo</h2>
    <div class="card tight list">${mine.map((s) => html`<div class="item"><div class="grow">${s.name}<div class="xs muted">${s.dose_text}${s.stock != null ? ` · quedan ${s.stock}` : ''}</div></div><button class="sm ghost danger" data-act="${act((b) => busy(b, async () => { await api.db.update('supplements', { active: false }, { id: `eq.${s.id}` }); invalidate('supps', 'nutweek'); render(); }))}">Quitar</button></div>`)}${!mine.length ? html`<div class="item muted small">Ninguno todavía.</div>` : ''}</div>
    <form class="card" data-submit="${act((v, f) => busy(f.querySelector('button'), async () => { await api.db.insert('supplements', [{ user_id: uid(), kind: v.kind, name: v.name || KINDS.find((k) => k[0] === v.kind)[1], dose_text: v.dose, stock: v.stock ? +v.stock : null }]); invalidate('supps', 'nutweek'); render(); }))}">
      <h3>Añadir</h3><label>Tipo</label><select name="kind">${KINDS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
      <label>Nombre (opcional)</label><input name="name"><label>Dosis</label><input name="dose" required placeholder="500 mg, 15 g…"><label>Dosis que te quedan</label><input name="stock" type="number">
      <button class="block">Añadir</button></form>`;
}

// ---------------- OBJETIVO NUTRICIONAL ----------------
async function settings() {
  const s = (await api.db.select('nutrition_settings', { user_id: `eq.${uid()}` }))[0] ?? { mode: 'mantenimiento', activity_factor: 1.4, meal_slots: ['desayuno', 'comida', 'merienda', 'cena'], batch_day: 7, shopping_day: 6, dislikes: [], intolerances: [], notify: true, compensate: false };
  const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  sheet('Objetivo nutricional', html`<form data-submit="${act((v, f) => busy(f.querySelector('button[type=submit]'), async () => {
      const row = { user_id: uid(), mode: v.mode, rate_kg_per_week: v.rate ? +v.rate : null, protein_g_per_kg: v.protein ? +v.protein : null, activity_factor: +v.activity, meal_slots: SLOTS.filter((x) => v[`slot_${x}`]), batch_day: +v.batch, shopping_day: +v.shop, dislikes: v.dislikes.split(',').map((x) => x.trim()).filter(Boolean), intolerances: v.intol.split(',').map((x) => x.trim()).filter(Boolean), max_supplements_per_day: v.maxsupp ? +v.maxsupp : null, compensate: !!v.compensate, notify: !!v.notify };
      await api.db.upsert('nutrition_settings', [row], 'user_id');
      if (v.mode !== s.mode) await api.db.insert('nutrition_goal_history', [{ user_id: uid(), mode: v.mode, from_date: today() }]);
      closeSheet(); refresh(); toast('Objetivos recalculados desde hoy');
    }))}">
    <label>Objetivo</label><select name="mode">${GOAL_MODES.map(([k, l]) => html`<option value="${k}" ${s.mode === k ? 'selected' : ''}>${l}</option>`)}</select>
    <div class="grid2"><div><label>Ritmo (kg/semana)</label><input name="rate" type="number" step="0.05" placeholder="auto" value="${s.rate_kg_per_week ?? ''}"></div><div><label>Proteína (g/kg)</label><input name="protein" type="number" step="0.1" placeholder="auto" value="${s.protein_g_per_kg ?? ''}"></div></div>
    <label>Actividad fuera del entreno</label><select name="activity">${[[1.3, 'Sedentaria'], [1.4, 'Ligera'], [1.5, 'Activa'], [1.6, 'Muy activa']].map(([k, l]) => html`<option value="${k}" ${+s.activity_factor === k ? 'selected' : ''}>${l}</option>`)}</select>
    <label>Comidas que haces</label>${SLOTS.map((x) => html`<label class="check"><input type="checkbox" name="slot_${x}" ${s.meal_slots.includes(x) ? 'checked' : ''}> ${slotName(x)}</label>`)}
    <div class="grid2"><div><label>Día de batch</label><select name="batch">${DAYS.map((d, i) => html`<option value="${i + 1}" ${s.batch_day === i + 1 ? 'selected' : ''}>${d}</option>`)}</select></div>
      <div><label>Día de compra</label><select name="shop">${DAYS.map((d, i) => html`<option value="${i + 1}" ${(s.shopping_day ?? 6) === i + 1 ? 'selected' : ''}>${d}</option>`)}</select></div></div>
    <label>No me gusta (separado por comas)</label><input name="dislikes" value="${(s.dislikes || []).join(', ')}">
    <label>Intolerancias o alergias</label><input name="intol" value="${(s.intolerances || []).join(', ')}">
    <label>Máx. suplementos al día (vacío = sin límite)</label><input name="maxsupp" type="number" value="${s.max_supplements_per_day ?? ''}">
    <label class="check"><input type="checkbox" name="compensate" ${s.compensate ? 'checked' : ''}> Compensar a lo largo de la semana (máx. ±250 kcal/día)</label>
    <label class="check"><input type="checkbox" name="notify" ${s.notify ? 'checked' : ''}> Avisos de macros</label>
    <button type="submit" class="primary block">Guardar</button>
    <p class="xs muted">Herramienta de planificación, no sustituye a un dietista-nutricionista. Si tienes una patología, tomas medicación o notas que tu relación con la comida empeora, consulta con un profesional.</p></form>`);
}
