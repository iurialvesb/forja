// Nutrición: hoy (chequeo diario), menú semanal, compra, batch cooking, despensa y suplementos.
import * as api from './api.js';
import { get, invalidate, render } from './app.js';
import { parseFoodText, matchFood } from './engine/foodText.js';
import { html, act, toast, sheet, setSheet, closeSheet, busy, today, addDays, monday, dayName, shortDate, n0, bar, ring, resizeImage, SLOTS, slotName, GOAL_MODES } from './ui.js';

const uid = () => api.userId();
let tab = 'hoy', menuWeek = 0, shopWeek = 7, batchWeek = 7;
const TABS = [['hoy', 'Hoy'], ['menu', 'Menú'], ['compra', 'Compra'], ['batch', 'Batch'], ['despensa', 'Despensa'], ['suplementos', 'Suplementos']];
const week = (mon) => get(`nutweek:${mon}`, () => api.fn('nutrition-day', { weekStart: mon }), 120_000);
const refresh = () => { invalidate('nutweek', 'shopping', 'pantry'); render(); };

export async function NUTRITION(params = []) {
  if (params[0] && TABS.some(([k]) => k === params[0])) { tab = params[0]; history.replaceState(null, '', '#/nutricion'); }
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
  const mb = (n, v, t, c) => html`<div style="margin:9px 0"><div class="row small"><span class="grow" style="font-weight:650">${n}</span><b style="font-family:var(--num)">${n0(v)}<span class="muted"> / ${n0(t)} g</span></b></div>${bar(v, t, `linear-gradient(90deg, ${c}88, ${c})`)}</div>`;
  const meals = [...d.meals].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const kc = S.kcal / Math.max(1, T.kcal);
  return html`
    <div class="hero" style="padding:18px">
      <div class="row" style="position:relative;z-index:1">${ring(Math.min(1, kc), kc > 1.08 ? '#fbbf24' : '#7fb0ff', n0(S.kcal), 104, `de ${n0(T.kcal)}`)}
        <div class="grow"><div class="k">Día de carga ${d.target.load}</div><div class="big" style="font-size:22px">${({ definicion: 'Definiendo', volumen: 'Ganando masa', mantenimiento: 'Mantenimiento', recomposicion: 'Recomposición', rendimiento: 'Rendimiento' })[w.settings.mode] ?? 'Hoy'}</div>
          <div class="small" style="color:rgba(220,232,255,.78)">${S.kcal < T.kcal ? `Te quedan ${n0(T.kcal - S.kcal)} kcal` : `${n0(S.kcal - T.kcal)} kcal por encima`}</div></div></div>
      <div style="position:relative;z-index:1;margin-top:8px">${mb('Proteína', S.protein, T.protein, '#7fb0ff')}${mb('Hidratos', S.carbs, T.carbs, '#fbbf24')}${mb('Grasa', S.fat, T.fat, '#f472b6')}
      <div class="xs" style="color:rgba(220,232,255,.6)">Previsto con tu menú + lo que has registrado fuera de él (${n0(d.eaten.kcal)} kcal).${d.adherence ? ` Cumplimiento: ${d.adherence.mealsDone}/${d.adherence.mealsTotal} comidas · ${d.adherence.score}/100.` : ''}</div></div></div>
    ${d.adjustments?.length ? html`<div class="card tight"><div class="small" style="color:var(--accent);font-weight:700">🔄 He reajustado lo que te queda hoy</div>${d.adjustments.map((a) => html`<div class="small">• ${a.text}</div>`)}
        ${d.alerts.length ? html`<div class="small alert" style="margin-top:6px">Aun con el reajuste: ${d.alerts.map((a) => a.message.replace(/^Te quedarías/, 'te quedarías')).join(' ')}</div>` : ''}</div>`
      : d.alerts.map((a) => html`<div class="card tight alert">⚠️ ${a.message}</div>`)}
    ${w.balance?.message ? html`<div class="card tight small">📅 ${w.balance.message}</div>` : ''}
    ${(() => {
      const fixed = (w.settings.mealSlots ?? []).filter((x) => !meals.some((m) => m.slot === x));
      const opt = (w.settings.optionalSlots ?? []).filter((x) => !meals.some((m) => m.slot === x) && !fixed.includes(x));
      const all = [...meals.map((m) => ({ slot: m.slot, m })), ...fixed.map((slot) => ({ slot, m: null, fixed: true })), ...opt.map((slot) => ({ slot, m: null }))].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
      return all.map(({ slot, m, fixed: fx }) => (m ? mealCard(m) : html`<div class="card tight row" style="border-style:dashed;opacity:${fx ? 1 : 0.8}"><div class="grow"><b class="small" style="color:var(--accent)">${slotName(slot)}</b> <span class="xs muted">${fx ? '(sin planificar)' : '(opcional)'}</span><div class="xs muted">${fx ? 'Aún no está en tu menú: genera el menú en Batch o apunta lo que comas.' : 'Solo si lo haces hoy, p. ej. al volver de correr.'}</div></div><button class="sm" data-act="${act(() => logFood(slot))}">＋ Añadir</button></div>`));
    })()}
    ${!meals.length ? html`<div class="card muted small">Sin menú para hoy. Genéralo en <b>Batch</b> o cuéntame lo que has cocinado.</div>` : ''}
    <button class="primary block" data-act="${act(() => logFood())}">＋ He comido algo (extra o fuera del menú)</button>
    <details><summary>Por qué estos objetivos</summary>${d.target.explanation.map((e) => html`<p class="small muted">${e}</p>`)}</details>`;
}

const mealAction = (m, action, extra = {}) => async (b) => busy(b, async () => {
  const r = await api.fnQueued('meal-update', { mealId: m.id, action, ...extra });
  if (r.queued) return toast('Sin conexión: lo apunto y lo sincronizo al volver la cobertura');
  invalidate('nutweek'); render();
  const msg = [...(r.pantry?.used?.length ? [`Descontado de casa: ${r.pantry.used.map((u) => `${u.from} ${u.grams} g`).join(', ')}`] : []), ...(r.pantry?.missing?.length ? [`No lo tenías en casa: ${r.pantry.missing.map((x) => x.name).join(', ')}`] : []),
    ...(r.adjustments || []).map((a) => a.text), ...(r.alerts || []).map((a) => a.message)];
  if (r.pantry) invalidate('pantry', 'shopping');
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
    <button class="block primary" data-act="${act(() => logFood(m.slot, { plannedMealId: m.id, date: m.date, replace: true }))}">🔁 He comido otra cosa en su lugar</button>
    <p class="xs muted">P. ej. «una coca de tomate de la panadería y un café con leche»: lo calculo y reajusto el resto del día.</p>
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
// Catálogo de alimentos (tus productos + los de referencia) para interpretar al instante en el móvil.
const foodCatalog = () => get('foodcat', async () => {
  const rows = await api.db.select('foods', { select: 'id,name,kcal,protein,carbs,fat,unit_grams,source,brand,search_terms', limit: 5000 }).catch(() => []);
  return rows.map((r) => ({ id: r.id, name: r.name, terms: r.search_terms ?? [], unitGrams: r.unit_grams != null ? +r.unit_grams : undefined, brand: r.brand, source: r.source, per100: { kcal: +r.kcal, protein: +r.protein, carbs: +r.carbs, fat: +r.fat } }));
}, 6 * 3600_000);
const macrosFor = (f, g) => ({ kcal: (f.per100.kcal * g) / 100, protein: (f.per100.protein * g) / 100, carbs: (f.per100.carbs * g) / 100, fat: (f.per100.fat * g) / 100 });

export function logFood(slot, opts = {}) {
  const now = new Date().getHours();
  let sel = slot ?? (now < 11 ? 'desayuno' : now < 13 ? 'media_manana' : now < 16 ? 'comida' : now < 20 ? 'merienda' : 'cena');
  let slotTouched = !!slot;
  let items = [], extra = [], questions = [], photoPath = null, lastText = opts.prefill ?? '', pending = [], seq = 0;
  let catalog = null;
  foodCatalog().then((c) => { catalog = c; if (lastText) interpret(lastText); }).catch(() => { catalog = []; });
  // Interpreta en el móvil (instantáneo); lo que no reconoce lo busca el servidor en segundo plano, solo esas partes.
  const interpret = (text) => {
    lastText = text;
    if (!catalog) return;
    const r = parseFoodText(text);
    if (r.slot && !slotTouched) sel = r.slot;
    const prev = new Map(items.map((i) => [i.raw, i]));
    items = []; const unknown = [];
    for (const it of r.items) {
      const old = prev.get(it.raw);
      if (old && old.fromServer) { items.push(old); continue; }
      const f = matchFood(it.name, catalog, it.brand, it.cooked);
      if (f) items.push({ raw: it.raw, foodId: f.id, name: f.name, grams: it.grams, gramsConfidence: it.gramsConfidence, macros: macrosFor(f, it.grams) });
      else unknown.push(it.raw);
    }
    pending = unknown;
    draw();
    clearTimeout(interpret.t);
    if (unknown.length) interpret.t = setTimeout(() => lookup(unknown), 900);
  };
  const lookup = async (raws) => {
    const my = ++seq;
    try {
      const r = await api.fn('nutrition-log', { action: 'parse', text: raws.join(', ') });
      if (my !== seq) return;
      const got = r.items || [];
      // Cada parte que no entendí, con lo que ha encontrado el servidor (puede ser más de un alimento por parte).
      for (const it of got) items.push({ ...it, raw: raws.length === 1 ? raws[0] : `srv:${it.name}`, fromServer: true });
      questions = r.questions || []; pending = [];
      catalog = null; invalidate('foodcat'); foodCatalog().then((c) => { catalog = c; });
      draw();
    } catch (e) { if (my === seq) { pending = []; questions = [`No he podido buscar: ${raws.join(', ')} (${e.message})`]; draw(); } }
  };
  const total = () => [...items, ...extra].reduce((a, i) => ({ kcal: a.kcal + (i.macros?.kcal ?? 0), protein: a.protein + (i.macros?.protein ?? 0) }), { kcal: 0, protein: 0 });
  // Arriba (comida, cuadro de texto, foto, código) se pinta una vez para no cerrar el teclado; los resultados, en #lres.
  const drawStatic = () => setSheet(html`
    <label>Comida</label><select id="lslot" data-change="${act((el) => { sel = el.value; slotTouched = true; })}">${SLOTS.map((s) => html`<option value="${s}" ${s === sel ? 'selected' : ''}>${slotName(s)}</option>`)}</select>
    <label>${opts.replace ? '¿Qué has comido en su lugar?' : '¿Qué has comido?'}</label><textarea id="ltext" placeholder="${opts.replace ? 'Ej.: una coca de tomate de la panadería y un café con leche' : 'Ej.: wrap de avena Hacendado, canónigos, un huevo revuelto y medio aguacate'}">${lastText}</textarea>
    <div class="grid2"><label class="btn" style="margin:0">📷 Foto del plato<input type="file" accept="image/*" id="lphoto" hidden></label>
      <button data-act="${act(async () => { const { scanBarcode } = await import('./scanner.js'); const c = await scanBarcode(); if (c) busy(null, async () => { const r = await api.fn('nutrition-log', { action: 'parse', barcode: c.trim() }); extra.push(...r.items); questions = r.questions || []; draw(); }); })}">📷 Código de barras</button></div>
    <div id="lres"></div>
    <p class="xs muted">Se interpreta al instante en el móvil. Lo que no conozco lo busco en USDA y Open Food Facts (la IA solo traduce qué y cuánto).</p>`);
  const draw = () => {
    const el = document.getElementById('lres'); if (!el) return;
    const sl = document.getElementById('lslot'); if (sl && sl.value !== sel) sl.value = sel;
    const all = [...items, ...extra];
    el.innerHTML = html`
    ${pending.length ? html`<p class="small muted"><span class="spinner"></span> Buscando: ${pending.join(' · ')}</p>` : ''}
    ${questions.map((qq) => html`<p class="alert small">❓ ${qq}</p>`)}
    ${all.length ? html`<h3 style="margin-top:12px">Alimentos <small class="muted">${n0(total().kcal)} kcal · P ${n0(total().protein)} g</small></h3>${all.map((i) => html`<div class="row"><span class="grow small">${i.name} ${i.gramsConfidence === 'estimado' ? html`<span class="tag amber">estimado</span>` : ''}</span>
        <input style="width:80px" type="number" inputmode="decimal" value="${Math.round(i.grams)}" data-change="${act((inp) => { const g = +inp.value; if (i.macros && i.grams) { const k = g / i.grams; i.macros = { kcal: i.macros.kcal * k, protein: i.macros.protein * k, carbs: i.macros.carbs * k, fat: i.macros.fat * k }; } i.grams = g; i.gramsConfidence = 'dicho'; draw(); })}"> g <button class="sm ghost danger" data-act="${act(() => { const k = items.indexOf(i); if (k >= 0) items.splice(k, 1); else extra.splice(extra.indexOf(i), 1); draw(); })}">✕</button></div>`)}
      <label class="check"><input type="checkbox" id="lded" ${opts.replace ? '' : 'checked'}> Descontar de mi despensa (si lo has preparado en casa)</label>
      <button class="primary block" data-act="${act((b) => busy(b, async () => {
        sel = document.getElementById('lslot').value;
        const said = document.getElementById('ltext')?.value.trim() || lastText;
        const list = [...items, ...extra].filter((i) => i.foodId);
        const r = await api.fnQueued('nutrition-log', { action: 'confirm', date: opts.date ?? today(), slot: sel, items: list.map(({ foodId, name, grams }) => ({ foodId, name, grams })), source: photoPath ? 'foto' : 'texto', deductPantry: document.getElementById('lded').checked, photoPath,
          plannedMealId: opts.plannedMealId, title: opts.replace ? (said ? said.charAt(0).toUpperCase() + said.slice(1, 70) : list.map((i) => i.name).join(', ').slice(0, 70)) : undefined });
        closeSheet(); invalidate('nutweek', 'pantry'); render();
        if (r.queued) return toast('Sin conexión: lo apunto y lo subo al volver la cobertura');
        const msgs = (r.missingInPantry || []).map((x) => `No tenías ${x.name} en la despensa.`);
        toast([`Registrado: ${n0(r.logged.kcal)} kcal`, ...msgs].join(' · '), 6000);
      }))}">Registrar${pending.length ? ' lo reconocido' : ''}</button>` : lastText.trim() && !pending.length && catalog ? html`<p class="small muted">No reconozco nada todavía: escribe alimentos separados por comas.</p>` : ''}`.s;
  };
  sheet(opts.replace ? `${slotName(sel)}: lo que comí` : 'Registrar comida', '');
  drawStatic(); draw();
  document.getElementById('ltext').addEventListener('input', (e) => { clearTimeout(drawStatic.t); const v = e.target.value; drawStatic.t = setTimeout(() => interpret(v), 200); });
  document.getElementById('sheet').onchange = async (e) => {
    if (e.target.id !== 'lphoto' || !e.target.files[0]) return;
    try { toast('Analizando la foto…'); photoPath = await api.uploadPhoto(await resizeImage(e.target.files[0], 1400)); const r = await api.fn('nutrition-log', { action: 'parse', photoPath }); extra.push(...r.items); questions = r.questions || []; draw(); }
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
      ${(() => {
        const fixed = w.settings.mealSlots ?? [], opt = w.settings.optionalSlots ?? [];
        const slots = [...new Set([...fixed, ...opt, ...d.meals.map((m) => m.slot)])].sort((a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b));
        return slots.map((sl) => { const m = d.meals.find((x) => x.slot === sl);
          if (m) return html`<div class="card tight row" data-act="${act(() => editMeal(m))}"><div class="grow"><div class="xs" style="color:var(--accent)">${slotName(m.slot)}</div><div class="small" style="font-weight:600">${m.title}</div></div><span class="xs muted">${n0(m.macros.kcal)} kcal</span>${m.status !== 'planned' ? ' ✎' : ''}</div>`;
          return html`<div class="card tight row" style="border-style:dashed;opacity:.75"><div class="grow"><div class="xs" style="color:var(--accent)">${slotName(sl)}</div><div class="small muted">${fixed.includes(sl) ? 'Sin planificar' : 'Opcional'}</div></div><button class="sm ghost" data-act="${act(() => logFood(sl, { date: d.date }))}">＋</button></div>`; });
      })()}
      ${d.alerts.map((a) => html`<div class="small alert">⚠️ ${a.message}</div>`)}`)}`;
}

// ---------------- COMPRA ----------------
// Recorrido típico de cada súper (de la entrada a las cajas). Orientativo: cada tienda cambia algo.
const STORE_ROUTE = {
  mercadona: ['Frutería y verdulería', 'Panadería', 'Carnicería', 'Pescadería', 'Despensa', 'Lácteos y huevos', 'Congelados', 'Suplementos', 'Otros'],
  consum: ['Frutería y verdulería', 'Panadería', 'Despensa', 'Carnicería', 'Pescadería', 'Lácteos y huevos', 'Congelados', 'Suplementos', 'Otros'],
  alfabetico: ['Carnicería', 'Congelados', 'Despensa', 'Frutería y verdulería', 'Lácteos y huevos', 'Otros', 'Panadería', 'Pescadería', 'Suplementos'],
};
const STORE_NAME = { mercadona: 'Mercadona', consum: 'Consum', alfabetico: 'orden alfabético' };
const store = () => { try { return localStorage.getItem('forja:store') || 'mercadona'; } catch { return 'mercadona'; } };
async function compra() {
  const mon = addDays(monday(), shopWeek);
  const l = await get(`shopping:${mon}`, () => api.fn('shopping-list', { action: 'build', weekStart: mon }));
  const checked = new Set(l.checked || []);
  const by = {}; for (const i of l.items) (by[i.aisle] ??= []).push(i);
  const order = (a) => { const k = (STORE_ROUTE[store()] ?? STORE_ROUTE.mercadona).indexOf(a); return k < 0 ? 99 : k; };
  const aisles = Object.keys(by).sort((a, b) => order(a) - order(b));
  const share = aisles.map((a) => `${a.toUpperCase()}\n${by[a].map((i) => `☐ ${i.name} – ${i.buyUnits ? `${i.buyUnits} ud` : `${i.buyG} g`}`).join('\n')}`).join('\n\n');
  return html`
    <div class="seg"><button class="${shopWeek === 0 ? 'on' : ''}" data-act="${act(() => { shopWeek = 0; render(); })}">Esta semana</button><button class="${shopWeek === 7 ? 'on' : ''}" data-act="${act(() => { shopWeek = 7; render(); })}">Semana que viene</button></div>
    <p class="xs muted">Lo que comerás esa semana menos lo que tienes en congelador, nevera y despensa, descontando lo que aún comerás antes y lo que caduca antes de usarlo (+5 % de margen).</p>
    ${l.note ? html`<div class="card muted small">${l.note}</div>` : ''}
    <div class="row small" style="gap:8px;margin-top:6px"><span class="muted">Ordenada como el recorrido de</span><select style="width:auto" data-change="${act((el) => { try { localStorage.setItem('forja:store', el.value); } catch { /* */ } render(); })}">${Object.keys(STORE_ROUTE).map((k) => html`<option value="${k}" ${store() === k ? 'selected' : ''}>${STORE_NAME[k]}</option>`)}</select></div>
    ${aisles.map((a) => html`<h2>${a}</h2><div class="card tight list">${by[a].map((i) => html`
      <label class="item" style="margin:0"><input type="checkbox" ${checked.has(i.foodId) ? 'checked' : ''} data-change="${act((el) => api.fn('shopping-list', { action: 'check', weekStart: mon, foodId: i.foodId, checked: el.checked }).then(() => invalidate(`shopping:${mon}`)))}">
        <div class="grow"><div style="color:var(--text)">${i.name}</div><div class="xs muted">Necesitas ${i.needG} g · tienes ${i.haveG} g · desde el ${dayName(i.firstNeeded)}</div>${i.note ? html`<div class="xs alert">${i.note}</div>` : ''}</div>
        <b style="color:var(--text)">${i.buyUnits ? `${i.buyUnits} ud` : `${i.buyG} g`}</b></label>`)}</div>`)}
    ${l.coveredByStock?.length ? html`<details><summary>Ya lo tienes en casa (${l.coveredByStock.length})</summary>${l.coveredByStock.map((c) => html`<div class="small muted">${c.name} · ${c.grams} g</div>`)}</details>` : ''}
    ${l.items.length ? html`
      <button class="primary block" data-act="${act((b) => busy(b, async () => { const r = await api.fn('shopping-list', { action: 'bought', weekStart: mon }); invalidate('shopping', 'pantry'); render(); toast(`${r.addedToPantry} artículos añadidos a tu despensa`); }))}">Pasar lo marcado a la despensa</button>
      <button class="block" data-act="${act(async () => { if (navigator.share) { await navigator.share({ title: 'Lista de la compra', text: share }).catch(() => {}); return; } try { await navigator.clipboard.writeText(share); toast('Lista copiada'); } catch { const ta = document.createElement('textarea'); ta.value = share; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); toast(ok ? 'Lista copiada' : 'No se pudo copiar'); } })}">Compartir lista</button>
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
      }))}">Generar menú y batch cooking</button>
      <button class="block" data-act="${act(describeCooking)}">🍳 Ya he cocinado: te cuento qué y cuándo lo como</button></div>
    ${p ? html`
      <div class="card tight row">${w.batchCooked ? html`<div class="grow"><b class="ok">✅ Batch hecho</b><div class="xs muted">Ya descontado de tu despensa. Esas comidas no se vuelven a descontar al marcarlas.</div></div><button class="sm ghost" data-act="${act((b) => busy(b, async () => { await api.fn('menu-plan', { action: 'uncooked', weekStart: mon }); invalidate('nutweek', 'pantry', 'shopping'); render(); toast('Devuelto a la despensa'); }))}">Deshacer</button>`
        : html`<div class="grow small">¿Ya lo has cocinado?</div><button class="sm primary" data-act="${act((b) => busy(b, async () => {
          const r = await api.fn('menu-plan', { action: 'cooked', weekStart: mon }); invalidate('nutweek', 'pantry', 'shopping'); render();
          toast([`Descontado de tu despensa: ${r.used?.length ?? 0} productos`, ...(r.missing?.length ? [`No tenías: ${r.missing.map((x) => x.name).join(', ')}`] : [])].join(' · '), 8000);
        }))}">✅ He hecho el batch</button>`}</div>
      <h2>Plan de cocina <small>≈ ${Math.round(p.totalMinutes)} min · ${dayName(p.cookDate, true)}</small></h2>
      <div class="card tight">${p.tasks.map((t) => html`<div class="row top" style="padding:6px 0"><b style="width:38px;color:var(--accent)" class="small">${Math.round(t.start)}′</b><div class="grow"><div class="small">${t.text}</div><div class="xs muted">${t.recipe}${t.equipment ? ` · ${t.equipment}` : ''} · ${t.hands === 'pasiva' ? 'puedes hacer otra cosa' : 'manos ocupadas'}</div></div></div>`)}</div>
      ${p.warnings.map((x) => html`<p class="alert small">⚠️ ${x}</p>`)}
      <h2>Cantidades totales</h2>${p.totals.map((t) => html`<div class="card tight"><b class="small">${t.recipe}</b><div class="xs muted">${t.ingredients.map((i) => `${i.name} ${i.grams} g`).join(' · ')}</div></div>`)}
      <h2>Táperes <small>${p.containers.length}</small></h2>${p.containers.map((c) => html`<div class="card tight"><div class="row"><b class="small grow">${dayName(c.date)} · ${slotName(c.slot)}</b><span class="tag ${c.storage === 'congelador' ? 'blue' : 'green'}">${c.storage}</span></div><div class="small">${c.recipe}</div><div class="xs muted">${c.contents.map((i) => `${i.name} ${i.grams} g`).join(' · ')}</div>${c.note ? html`<div class="xs alert">${c.note}</div>` : ''}</div>`)}`
      : html`<div class="card muted small">Aún no hay plan de batch para esta semana.</div>`}`;
}

function describeCooking() {
  const saved = (() => { try { return localStorage.getItem('forja:cooked') || ''; } catch { return ''; } })();
  sheet('Lo que he cocinado', html`<p class="small muted">Cuéntalo como quieras: qué has cocinado, cuántos táperes y qué día lo comes. Lo pongo en tu menú, lo descuento de la despensa y reajusto el resto de comidas a tus macros.</p>
    <textarea id="ctext" rows="7" placeholder="He hecho lentejas con verduras para 3 comidas (lunes, martes y jueves) y pollo al curry con arroz para el miércoles y el viernes. Para las cenas, verduras al horno para 4 días.">${saved}</textarea>
    <button class="primary block" data-act="${act(() => {
      const t = document.getElementById('ctext').value.trim(); if (!t) return;
      try { localStorage.setItem('forja:cooked', t); } catch { /* */ }
      closeSheet();
      toast('🍳 Organizando lo que has cocinado… Puedes seguir usando Forja: te aviso al terminar (suele tardar 20-60 s).', 6000);
      api.fn('menu-plan', { action: 'describe', text: t }).then((r) => {
        try { localStorage.removeItem('forja:cooked'); } catch { /* */ }
        invalidate('nutweek', 'shopping', 'pantry'); render();
        toast([`✅ ${r.meals.length} comidas añadidas a tu menú`, ...(r.pantryUsed?.length ? [`Descontado de casa: ${[...new Set(r.pantryUsed.map((u) => u.from))].join(', ')}`] : []), ...(r.unresolved?.length ? [`Sin datos nutricionales: ${r.unresolved.join(', ')}`] : []), ...(r.questions || [])].join(' · '), 10000);
      }).catch((e) => toast(`No he podido organizarlo: ${e.message}. Tu texto está guardado: vuelve a «Ya he cocinado» y pulsa otra vez.`, 10000));
    })}">Añadir a mi menú</button>
    <p class="xs muted">Esas comidas quedan fijadas (🔒): si luego generas el menú, solo se completan las que falten (almuerzos, postres…).</p>`);
}

// ---------------- DESPENSA ----------------
const prodImg = (url, alt) => (url ? html`<img src="${url}" alt="${alt ?? ''}" loading="lazy">` : html`<div class="noimg">🥫</div>`);
const qtyText = (i) => [i.units ? `${i.units} ud${i.unitGrams || i.unit_grams ? ` × ${i.unitGrams ?? i.unit_grams} g` : ''}` : '', i.quantityG ?? i.quantity_g ? `${i.quantityG ?? i.quantity_g} g` : ''].filter(Boolean).join(' · ');

const LOCS = [['congelador', '❄️ Congelador'], ['nevera', '🧊 Nevera'], ['despensa', '🗄 Despensa']];
async function despensa() {
  const items = await get('pantry', () => api.db.select('pantry_items', { order: 'name' }));
  const soon = items.filter((i) => i.expires_on && i.expires_on <= addDays(today(), 3));
  setupPantryDrag();
  return html`
    ${soon.length ? html`<div class="card tight"><div class="small alert">⏰ Caduca pronto: ${soon.map((i) => `${i.name} (${i.expires_on <= today() ? 'hoy' : shortDate(i.expires_on)})`).join(', ')}</div>
      <button class="sm" style="margin-top:6px" data-act="${act((b) => recipeFor(b, soon.map((i) => i.id)))}">👩‍🍳 Proponme una receta con esto</button></div>` : ''}
    <div class="grid2"><button class="primary" data-act="${act(addPantry)}">＋ Añadir</button><button data-act="${act(() => scanToPantry())}">📷 Escanear código</button></div>
    <p class="xs muted">Arrastra por ⠿ para cambiar de sitio. Lo que comes desde el menú o cocinas en el batch se descuenta solo; −1 y − g son para lo que gastes por tu cuenta.</p>
    ${LOCS.map(([loc, label]) => html`<div data-loc="${loc}" class="ploc"><h2>${label} <small>${items.filter((i) => i.location === loc).length}</small></h2>
      <div class="card tight list">${items.filter((i) => i.location === loc).map((i) => pantryRow(i))}
        ${!items.filter((i) => i.location === loc).length ? html`<div class="item muted small">Vacío · suelta aquí</div>` : ''}</div></div>`)}`;
}

async function recipeFor(btn, ids) {
  await busy(btn, async () => {
    const r = await api.fn('pantry', { action: 'recipe', ids });
    if (!r.recipe) return toast(r.note ?? 'No se me ocurre nada con eso');
    const x = r.recipe;
    sheet(x.title, html`<p class="small muted">${x.servings ?? 1} ración(es)${x.minutes ? ` · ${x.minutes} min` : ''} · gasta: ${r.uses.join(', ')}</p>
      <h3>Ingredientes</h3>${x.ingredients.map((i) => html`<div class="row small"><span class="grow">${i.fromPantry ? '🏠 ' : ''}${i.name}</span><b>${Math.round(i.grams)} g</b></div>`)}
      <h3>Pasos</h3><ol class="small">${x.steps.map((st) => html`<li>${st}</li>`)}</ol>
      ${x.tip ? html`<p class="small" style="color:var(--accent)">${x.tip}</p>` : ''}
      <button class="block primary" data-act="${act(() => { closeSheet(); logFood(undefined, { prefill: `${x.title}: ${x.ingredients.map((i) => `${i.name} ${Math.round(i.grams / (x.servings || 1))} g`).join(', ')}` }); })}">Lo he comido: apuntarlo</button>
      <p class="xs muted">🏠 = lo tienes en casa.</p>`);
  });
}

function pantryRow(i) {
  const u = i.units != null ? +i.units : null; const pack = i.pack_units ? +i.pack_units : null;
  return html`<div class="item prod pitem" data-pid="${i.id}">
    <span class="drag" aria-label="Mover">⠿</span>
    <span data-act="${act(() => editPantry(i))}">${prodImg(i.image_url, i.name)}</span>
    <div class="grow" data-act="${act(() => editPantry(i))}"><div class="small" style="font-weight:600">${i.name}${i.brand ? html` <span class="muted xs">${i.brand}</span>` : ''}</div>
      <div class="xs muted">${u != null ? `${u}${pack ? ` de ${pack}` : ''} ud${i.unit_grams ? ` × ${+i.unit_grams} g` : ''}` : i.quantity_g ? `${+i.quantity_g} g` : 'cantidad sin indicar'}${i.expires_on ? ` · caduca ${shortDate(i.expires_on)}` : ''}${!i.food_id ? ' · sin datos nutricionales' : ''}</div>
      ${pack && pack <= 30 ? html`<div class="dots-row">${[...Array(pack)].map((_, k) => html`<i class="${k < (u ?? 0) ? 'on' : ''}"></i>`)}</div>` : ''}</div>
    ${u != null ? html`<button class="sm" data-act="${act((b) => busy(b, () => useUnit(i)))}">−1</button>` : i.quantity_g ? html`<button class="sm" data-act="${act(() => useGrams(i))}">− g</button>` : ''}
  </div>`;
}

async function useUnit(i, n = 1) {
  const left = Math.max(0, (+i.units || 0) - n);
  if (left === 0) { await api.db.remove('pantry_items', { id: `eq.${i.id}` }); toast(`${i.name}: se ha acabado`); }
  else await api.db.update('pantry_items', { units: left, updated_at: new Date().toISOString() }, { id: `eq.${i.id}` });
  invalidate('pantry', 'shopping'); render();
}

function useGrams(i) {
  const left = +i.quantity_g;
  const go = (g) => busy(null, async () => {
    const rest = Math.max(0, Math.round(left - g));
    if (rest <= 0) { await api.db.remove('pantry_items', { id: `eq.${i.id}` }); toast(`${i.name}: se ha acabado`); }
    else await api.db.update('pantry_items', { quantity_g: rest, updated_at: new Date().toISOString() }, { id: `eq.${i.id}` });
    closeSheet(); invalidate('pantry', 'shopping'); render();
  });
  sheet(`${i.name}: ¿cuánto has usado?`, html`<p class="small muted">Te quedan ${left} g. Lo que cocines desde el menú o el batch se descuenta solo; esto es para lo que gastes por tu cuenta.</p>
    <div class="grid3">${[50, 100, 150, 200, 250, 500].filter((g) => g < left).map((g) => html`<button data-act="${act(() => go(g))}">${g} g</button>`)}</div>
    <div class="row" style="gap:8px"><input id="ug" class="grow" type="number" inputmode="numeric" placeholder="gramos"><button class="primary" data-act="${act(() => { const g = +document.getElementById('ug').value; if (g > 0) go(g); })}">Restar</button></div>
    <button class="block danger" data-act="${act(() => go(left))}">Se ha acabado</button>`);
}

let dragReady = false;
/** Arrastrar productos entre congelador, nevera y despensa (con el dedo, desde ⠿). */
function setupPantryDrag() {
  if (dragReady) return; dragReady = true;
  let ghost = null, src = null, over = null, X = 0, Y = 0, timer = 0;
  const hit = () => {
    const el = document.elementFromPoint(X, Y)?.closest('.ploc');
    if (over !== el) { over?.classList.remove('drop'); over = el; over?.classList.add('drop'); }
  };
  const move = (e) => {
    if (!ghost) return; e.preventDefault();
    X = e.clientX; Y = e.clientY;
    ghost.style.transform = `translate(${X - 30}px, ${Y - 24}px)`;
    hit();
  };
  const up = async () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); clearInterval(timer);
    if (!ghost) return;
    ghost.remove(); ghost = null; src.classList.remove('dragging'); over?.classList.remove('drop');
    const loc = over?.dataset.loc; const id = src.dataset.pid; over = null;
    if (loc && id) {
      const it = (await get('pantry', () => api.db.select('pantry_items', { order: 'name' }))).find((x) => x.id === id);
      if (it && it.location !== loc) { await api.db.update('pantry_items', { location: loc }, { id: `eq.${id}` }); invalidate('pantry', 'shopping'); render(); toast(`${it.name} → ${loc}`); }
    }
  };
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest?.('.pitem .drag'); if (!h) return;
    e.preventDefault();
    src = h.closest('.pitem'); src.classList.add('dragging');
    ghost = src.cloneNode(true); ghost.className = 'item prod drag-ghost';
    document.body.appendChild(ghost);
    ghost.style.transform = `translate(${e.clientX - 30}px, ${e.clientY - 24}px)`;
    X = e.clientX; Y = e.clientY;
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up);
    // Si llevas el dedo al borde de la pantalla, se desplaza sola para llegar a otro sitio.
    timer = setInterval(() => { const d = Y < 110 ? -14 : Y > innerHeight - 140 ? 14 : 0; if (d) { window.scrollBy(0, d); hit(); } }, 30);
  });
}

/** Escanear un producto y añadirlo (con foto, marca y tabla nutricional de Open Food Facts). */
async function scanToPantry(list) {
  const { scanBarcode } = await import('./scanner.js');
  const code = await scanBarcode(); if (!code) return;
  const r = await busy(null, () => api.fn('pantry', { action: 'barcode', code }));
  if (!r.product) { toast(r.message, 6000); return; }
  const p = r.product;
  const item = { name: p.name, brand: p.brand, barcode: p.code, imageUrl: p.imageUrl, location: p.location ?? 'despensa', units: p.packUnits ?? 1, matched: true, packUnits: p.packUnits, unitGrams: p.unitG ?? p.packageG, queryEn: p.name };
  if (list) { list.push(item); return item; }
  sheet('Producto escaneado', html`<div class="card tight prod">${prodImg(p.imageUrl, p.name)}<div class="grow"><b>${p.name}</b><div class="xs muted">${p.brand ?? ''} ${p.quantity ?? ''}</div>
      ${p.food ? html`<div class="xs">${Math.round(p.food.per100.kcal)} kcal · P ${p.food.per100.protein} · C ${p.food.per100.carbs} · G ${p.food.per100.fat} (por 100 g)</div>` : html`<div class="xs bad">Sin tabla nutricional en Open Food Facts</div>`}</div></div>
    <form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => { await api.fn('pantry', { action: 'save', items: [{ ...item, location: v.location, units: +v.u || 1, packUnits: +v.pk || undefined, unitGrams: +v.ug || undefined }] }); closeSheet(); invalidate('pantry', 'shopping'); render(); toast('Añadido'); }))}">
      <label>Lugar</label><select name="location">${LOCS.map(([l, lb]) => html`<option value="${l}" ${item.location === l ? 'selected' : ''}>${lb}</option>`)}</select>
      <div class="grid3"><div><label>Unidades que tienes</label><input name="u" type="number" value="${item.units}"></div><div><label>Trae el pack</label><input name="pk" type="number" value="${item.packUnits ?? ''}" placeholder="—"></div><div><label>g por unidad</label><input name="ug" type="number" value="${item.unitGrams ?? ''}"></div></div>
      <p class="xs muted">Caja de sobres, pack de latas, docena de huevos…: pon cuántas trae y luego ve tocando −1 al gastarlas.</p>
      <button class="primary block">Añadir a la despensa</button></form>
    <button class="block" data-act="${act(() => scanToPantry())}">Escanear otro</button>`);
}

function addPantry() {
  let parsed = [];
  let status = '';
  const matchAll = async () => {
    const todo = parsed.map((p, k) => [p, k]).filter(([p]) => !p.matched && !p.barcode);
    if (!todo.length) return;
    status = 'Buscando los productos y sus fotos…'; draw();
    try {
      const r = await api.fn('pantry', { action: 'match', items: todo.map(([p]) => ({ name: p.name, brand: p.brand })) });
      r.matches.forEach((m, j) => { const p = todo[j][0]; p.matched = true; p.alts = [m.best, ...m.alternatives].filter(Boolean); if (m.best) choose(p, m.best); });
    } catch (e) { toast(`No he podido buscar los productos: ${e.message}`, 6000); }
    status = ''; draw();
  };
  const choose = (p, prod) => { p.barcode = prod.code; p.imageUrl = prod.imageUrl; p.brandFound = prod.brand; p.prodName = prod.name; if (!p.unitGrams && !p.quantityG && (prod.unitG || prod.packageG)) p.unitGrams = prod.unitG ?? prod.packageG; if (!p.packUnits && prod.packUnits) p.packUnits = prod.packUnits; };
  const draw = () => setSheet(html`
    <p class="small muted">Díctalo o escríbelo como te salga («dos sobres de puré Hacendado, seis latas de atún de 60 g escurrido…»), escanea los códigos de barras o haz una foto.</p>
    <textarea id="ptext" rows="5" placeholder="En la despensa: 2 sobres de puré de patatas Hacendado, 6 latas de atún claro al natural de 60 g escurrido, 1 kg de arroz La Fallera…"></textarea>
    <button class="primary block" data-act="${act((b) => busy(b, async () => {
      const t = document.getElementById('ptext').value.trim(); if (!t) return;
      status = 'Entendiendo tu lista… (unos segundos)'; draw();
      try { const r = await api.fn('pantry', { action: 'parse', text: t }); parsed.push(...r.items); if (r.questions?.length) toast(r.questions.join(' · '), 8000); }
      catch (e) { status = ''; draw(); throw e; }
      status = ''; draw(); matchAll();
    }))}">Organizar</button>
    <div class="grid2"><button data-act="${act(async () => { const it = await scanToPantry(parsed); if (it) { it.matched = true; draw(); } })}">📷 Código de barras</button>
      <label class="btn" style="margin:0">🖼 Foto<input type="file" accept="image/*" id="pphoto" hidden></label></div>
    ${status ? html`<p class="small"><span class="spinner"></span> ${status}</p>` : ''}
    ${parsed.length ? html`<h3 style="margin-top:12px">Revisa (${parsed.length})</h3>${parsed.map((p, k) => html`<div class="card tight">
        <div class="prod">${prodImg(p.imageUrl, p.name)}<div class="grow"><input value="${p.name}" data-change="${act((el) => { parsed[k].name = el.value; parsed[k].matched = false; })}">
          <div class="xs muted">${p.prodName ? `${p.prodName}${p.brandFound ? ` · ${p.brandFound}` : ''}` : p.matched ? 'No lo encuentro en Open Food Facts: usaré datos genéricos' : p.brand ?? ''}</div></div></div>
        ${p.alts?.length > 1 ? html`<div class="row" style="gap:6px;overflow-x:auto;margin-top:6px">${p.alts.map((a) => html`<button class="sm ${a.code === p.barcode ? 'primary' : 'ghost'}" style="padding:2px" title="${a.name}" data-act="${act(() => { choose(p, a); draw(); })}">${a.imageUrl ? html`<img src="${a.imageUrl}" style="width:40px;height:40px;object-fit:contain;background:#fff;border-radius:8px">` : a.name.slice(0, 14)}</button>`)}<button class="sm ghost" data-act="${act(() => { p.barcode = p.imageUrl = p.prodName = p.brandFound = undefined; draw(); })}">Ninguno</button></div>` : ''}
        <div class="row" style="margin-top:6px;gap:6px"><select style="width:auto" data-change="${act((el) => { parsed[k].location = el.value; })}">${['congelador', 'nevera', 'despensa'].map((l) => html`<option ${p.location === l ? 'selected' : ''}>${l}</option>`)}</select>
          <input class="num" type="number" placeholder="ud" value="${p.units ?? ''}" data-change="${act((el) => { parsed[k].units = el.value ? +el.value : undefined; })}"><span class="xs muted">ud ×</span>
          <input class="num" type="number" placeholder="g" value="${p.unitGrams ?? p.quantityG ?? ''}" data-change="${act((el) => { if (parsed[k].units) parsed[k].unitGrams = el.value ? +el.value : undefined; else parsed[k].quantityG = el.value ? +el.value : undefined; })}"><span class="xs muted">g</span>
          <button class="sm ghost danger" data-act="${act(() => { parsed.splice(k, 1); draw(); })}">✕</button></div></div>`)}
      <button class="primary block" data-act="${act((b) => busy(b, async () => {
        const items = parsed.map((p) => ({ name: p.prodName && p.barcode ? p.name : p.name, brand: p.brandFound ?? p.brand, barcode: p.barcode, imageUrl: p.imageUrl, location: p.location, units: p.units, packUnits: p.packUnits, unitGrams: p.unitGrams, quantityG: p.quantityG, queryEn: p.queryEn, expiresOn: p.expiresOn }));
        const r = await api.fn('pantry', { action: 'save', items }); closeSheet(); invalidate('pantry', 'shopping'); render();
        toast(r.unresolved.length ? `Guardado. Sin datos nutricionales: ${r.unresolved.join(', ')}` : `${r.saved} artículos guardados`, 6000);
      }))}">Guardar ${parsed.length} artículos</button>` : ''}`);
  sheet('Añadir a la despensa', '');
  draw();
  document.getElementById('sheet').onchange = async (e) => {
    if (e.target.id !== 'pphoto' || !e.target.files[0]) return;
    try { status = 'Analizando la foto…'; draw(); const path = await api.uploadPhoto(await resizeImage(e.target.files[0], 1600)); const r = await api.fn('pantry', { action: 'parse', photoPath: path }); parsed.push(...r.items); status = ''; draw(); matchAll(); }
    catch (err) { status = ''; draw(); toast(err.message, 6000); }
  };
}

function editPantry(i) {
  sheet(i.name, html`${i.image_url ? html`<div class="center"><img src="${i.image_url}" style="max-height:140px;border-radius:12px;background:#fff"></div>` : ''}
    <form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      await api.db.update('pantry_items', { quantity_g: v.g ? +v.g : null, units: v.u ? +v.u : null, pack_units: v.pk ? +v.pk : null, unit_grams: v.ug ? +v.ug : null, location: v.location, expires_on: v.exp || null }, { id: `eq.${i.id}` }); closeSheet(); invalidate('pantry', 'shopping'); render();
    }))}">
    <label>Lugar</label><div class="seg">${LOCS.map(([l, lb]) => html`<button type="button" class="${i.location === l ? 'on' : ''}" data-act="${act((b) => busy(b, async () => { await api.db.update('pantry_items', { location: l }, { id: `eq.${i.id}` }); i.location = l; invalidate('pantry', 'shopping'); render(); editPantry(i); }))}">${lb}</button>`)}</div><input type="hidden" name="location" value="${i.location}">
    <div class="grid3"><div><label>Unidades que quedan</label><input name="u" type="number" value="${i.units ?? ''}"></div><div><label>Trae el pack</label><input name="pk" type="number" value="${i.pack_units ?? ''}"></div><div><label>g/unidad</label><input name="ug" type="number" value="${i.unit_grams ?? ''}"></div></div>
    <label>g totales (si no va por unidades)</label><input name="g" type="number" value="${i.quantity_g ?? ''}">
    <label>Caduca</label><input name="exp" type="date" value="${i.expires_on ?? ''}"><button class="primary block">Guardar</button></form>
    <button class="block danger" data-act="${act((b) => busy(b, async () => { await api.db.remove('pantry_items', { id: `eq.${i.id}` }); closeSheet(); invalidate('pantry', 'shopping'); render(); }))}">Eliminar (se ha acabado)</button>`);
}

// ---------------- SUPLEMENTOS ----------------
async function suplementos() {
  const [w, mine, logs] = await Promise.all([week(monday()), get('supps', () => api.db.select('supplements', { active: 'eq.true' })), api.db.select('supplement_logs', { date: `eq.${today()}` })]);
  const taken = new Set(logs.map((l) => l.supplement_id));
  const KINDS = [['creatina', 'Creatina'], ['aminoacidos', 'Aminoácidos (EAA/BCAA)'], ['colageno', 'Colágeno'], ['vitamina_c', 'Vitamina C'], ['magnesio', 'Magnesio'], ['omega3', 'Omega-3'], ['vitamina_d', 'Vitamina D'], ['proteina', 'Proteína en polvo'], ['electrolitos', 'Electrolitos'], ['cafeina', 'Cafeína'], ['otro', 'Otro']];
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
    ${w.supplements.week?.length && mine.length ? html`<h2>Esta semana</h2><div class="card tight">${w.supplements.week.map((d) => html`<div class="row top" style="padding:5px 0;border-bottom:1px solid var(--line)"><b class="small" style="width:70px">${dayName(d.date).split(' ')[0]} ${d.date.slice(8)}</b><div class="grow small">${d.take.length ? d.take.map((t) => html`<span class="chip" title="${t.when ?? ''}">${t.name}</span>`) : html`<span class="muted">Nada</span>`}</div></div>`)}
      <p class="xs muted">Según los entrenos que tienes ese día: colágeno + vitamina C en días de saltos, series o fuerza; electrolitos en sesiones largas; creatina todos los días.</p></div>` : ''}
    ${w.supplements.missing?.length ? html`<h2>Te podría faltar</h2>${w.supplements.missing.map((m) => html`<div class="card tight"><b class="small">${m.name}</b><div class="small muted">${m.why}</div></div>`)}` : ''}
    <h2>Los que tengo</h2>
    <div class="card tight list">${mine.map((s) => html`<div class="item"><div class="grow" data-act="${act(() => editSupp(s))}">${s.name}<div class="xs ${s.stock != null && s.stock <= 5 ? 'alert' : 'muted'}">${s.dose_text}${s.stock != null ? ` · quedan ${s.stock} dosis${s.stock <= 5 ? ' — toca reponer' : ''}` : ''}</div></div>
      ${s.stock != null && s.stock <= 5 ? html`<a class="btn sm" target="_blank" rel="noopener" href="${s.buy_url || `https://www.google.com/search?q=${encodeURIComponent(`comprar ${s.name}`)}`}">Comprar</a>` : ''}
      <button class="sm ghost" data-act="${act(() => editSupp(s))}">✎</button></div>`)}${!mine.length ? html`<div class="item muted small">Ninguno todavía.</div>` : ''}</div>
    <form class="card" data-submit="${act((v, f) => busy(f.querySelector('button'), async () => { await api.db.insert('supplements', [{ user_id: uid(), kind: v.kind, name: v.name || KINDS.find((k) => k[0] === v.kind)[1], dose_text: v.dose, stock: v.stock ? +v.stock : null }]); invalidate('supps', 'nutweek'); render(); }))}">
      <h3>Añadir</h3><label>Tipo</label><select name="kind">${KINDS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
      <label>Nombre (opcional)</label><input name="name"><label>Dosis</label><input name="dose" required placeholder="500 mg, 15 g…"><label>Dosis que te quedan</label><input name="stock" type="number">
      <button class="block">Añadir</button></form>`;
}

function editSupp(s) {
  sheet(s.name, html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      await api.db.update('supplements', { dose_text: v.dose, stock: v.stock === '' ? null : +v.stock, buy_url: v.url.trim() || null, low_pushed_on: null }, { id: `eq.${s.id}` });
      closeSheet(); invalidate('supps', 'nutweek'); render();
    }))}">
    <label>Dosis</label><input name="dose" value="${s.dose_text}">
    <label>Dosis que te quedan</label><input name="stock" type="number" value="${s.stock ?? ''}">
    <p class="xs muted">Baja sola cada vez que lo marcas como tomado. Con 5 o menos te aviso.</p>
    <label>Enlace para recomprar (opcional)</label><input name="url" type="url" value="${s.buy_url ?? ''}" placeholder="https://…">
    <button class="block primary">Guardar</button></form>
    <button class="block ghost danger" data-act="${act((b) => busy(b, async () => { await api.db.update('supplements', { active: false }, { id: `eq.${s.id}` }); closeSheet(); invalidate('supps', 'nutweek'); render(); }))}">Ya no lo tomo</button>`);
}

// ---------------- OBJETIVO NUTRICIONAL ----------------
async function settings() {
  const s = (await api.db.select('nutrition_settings', { user_id: `eq.${uid()}` }))[0] ?? { mode: 'mantenimiento', activity_factor: 1.4, meal_slots: ['media_manana', 'comida', 'cena'], optional_slots: ['desayuno', 'merienda'], batch_day: 7, shopping_day: 6, dislikes: [], intolerances: [], notify: true, compensate: false, preferences: '' };
  const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  sheet('Objetivo nutricional', html`<form data-submit="${act((v, f) => busy(f.querySelector('button[type=submit]'), async () => {
      const row = { user_id: uid(), mode: v.mode, rate_kg_per_week: v.rate ? +v.rate : null, protein_g_per_kg: v.protein ? +v.protein : null, activity_factor: +v.activity, meal_slots: SLOTS.filter((x) => v[`slot_${x}`]), batch_day: +v.batch, shopping_day: +v.shop, dislikes: v.dislikes.split(',').map((x) => x.trim()).filter(Boolean), intolerances: v.intol.split(',').map((x) => x.trim()).filter(Boolean), max_supplements_per_day: v.maxsupp ? +v.maxsupp : null, compensate: !!v.compensate, notify: !!v.notify, optional_slots: ['desayuno', 'merienda', 'pre_entreno', 'post_entreno', 'recena'].filter((x) => v[`opt_${x}`] && !v[`slot_${x}`]), preferences: v.prefs?.trim() || null };
      await api.db.upsert('nutrition_settings', [row], 'user_id');
      if (v.mode !== s.mode) await api.db.insert('nutrition_goal_history', [{ user_id: uid(), mode: v.mode, from_date: today() }]);
      closeSheet(); refresh(); toast('Objetivos recalculados desde hoy');
    }))}">
    <label>Objetivo</label><select name="mode">${GOAL_MODES.map(([k, l]) => html`<option value="${k}" ${s.mode === k ? 'selected' : ''}>${l}</option>`)}</select>
    <div class="grid2"><div><label>Ritmo (kg/semana)</label><input name="rate" type="number" step="0.05" placeholder="auto" value="${s.rate_kg_per_week ?? ''}"></div><div><label>Proteína (g/kg)</label><input name="protein" type="number" step="0.1" placeholder="auto" value="${s.protein_g_per_kg ?? ''}"></div></div>
    <label>Actividad fuera del entreno</label><select name="activity">${[[1.3, 'Sedentaria'], [1.4, 'Ligera'], [1.5, 'Activa'], [1.6, 'Muy activa']].map(([k, l]) => html`<option value="${k}" ${+s.activity_factor === k ? 'selected' : ''}>${l}</option>`)}</select>
    <label>Comidas que haces siempre</label>${SLOTS.map((x) => html`<label class="check"><input type="checkbox" name="slot_${x}" ${s.meal_slots.includes(x) ? 'checked' : ''}> ${slotName(x)}</label>`)}
    <label>Comidas opcionales (solo algunos días; aparecen como hueco vacío)</label>${['desayuno', 'merienda', 'pre_entreno', 'post_entreno', 'recena'].map((x) => html`<label class="check"><input type="checkbox" name="opt_${x}" ${(s.optional_slots || []).includes(x) ? 'checked' : ''}> ${slotName(x)}</label>`)}
    <label>Tus preferencias y costumbres</label><textarea name="prefs" rows="5" placeholder="Ej.: postre de yogur con granola y plátano después de cenar; almuerzo frío tipo wrap en el trabajo; la ensalada la preparo la noche antes…">${s.preferences ?? ''}</textarea>
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
