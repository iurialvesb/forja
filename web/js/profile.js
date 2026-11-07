// Perfil, ajustes, integraciones gratuitas (Atajo de Apple Salud, calendario ICS de WodBuster/Google) y onboarding.
import * as api from './api.js';
import { get, invalidate, render, go } from './app.js';
import { html, act, toast, sheet, setSheet, closeSheet, busy, today, addDays, GOAL_MODES } from './ui.js';

const uid = () => api.userId();
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const GOAL_TYPES = [['half_marathon', 'Media maratón'], ['marathon', 'Maratón'], ['10k', '10K'], ['5k', '5K'], ['hyrox', 'HYROX'], ['crossfit_comp', 'Competición CrossFit'], ['strength', 'Fuerza'], ['general', 'General']];

export async function PROFILE() {
  const item = (icon, label, fn, sub = '') => html`<div class="item" data-act="${act(fn)}"><div class="ico">${icon}</div><div class="grow"><div>${label}</div>${sub ? html`<div class="xs muted">${sub}</div>` : ''}</div><span class="muted">›</span></div>`;
  const tokenRow = await get('ingest_token', async () => (await api.db.select('ingest_tokens', { user_id: `eq.${uid()}` }))[0], 300_000).catch(() => null);
  const icuConn = await get('icuconn', async () => (await api.db.select('intervals_connections', { select: 'athlete_id,last_pull_at,last_error' }))[0], 120_000).catch(() => null);
  const cal = await get('calset', async () => (await api.db.select('calendar_settings', { user_id: `eq.${uid()}` }))[0], 300_000).catch(() => null);
  return {
    title: 'Perfil',
    right: html`<button class="icon-btn" data-act="${act(() => go('inicio'))}">✕</button>`,
    body: html`
      <p class="muted small">${api.user()?.email ?? ''}</p>
      <h2>Perfil deportivo</h2><div class="card tight list">
        ${item('🧍', 'Datos personales y físicos', personal)}${item('❤️', 'Frecuencia cardíaca', physiology)}${item('📆', 'Disponibilidad semanal', availability)}
        ${item('⚙️', 'Preferencias de entrenamiento', preferences)}${item('🩹', 'Lesiones y molestias', injuries)}</div>
      <h2>Planificación</h2><div class="card tight list">${item('🏁', 'Objetivos y competiciones', goals)}</div>
      <h2>Conexiones</h2><div class="card tight list">
        ${item('⌚', 'Apple Watch automático (HealthFit + Intervals.icu)', watchSync, icuConn ? (icuConn.last_error ? `⚠️ ${icuConn.last_error}` : `Conectado${icuConn.last_pull_at ? ` · última recogida ${new Date(icuConn.last_pull_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`) : 'Sin conectar')}
        ${item('📲', 'Apple Salud (Atajo)', health, tokenRow?.last_used_at ? `Último envío: ${new Date(tokenRow.last_used_at).toLocaleString('es-ES')}` : 'Sin configurar')}
        ${item('🗓️', 'Calendario y WodBuster', calendar, cal?.ics_urls?.length ? `${cal.ics_urls.length} calendario(s)` : 'Sin configurar')}
        ${item('🔔', 'Notificaciones', notifications)}</div>
      <h2>Privacidad y datos</h2><div class="card tight list">${item('🔒', 'Privacidad e IA', privacy)}${item('📦', 'Exportar mis datos', exportData)}</div>
      <button class="block danger" data-act="${act(async () => { await api.signOut(); invalidate(); location.hash = ''; render(); })}">Cerrar sesión</button>
      <p class="xs muted" style="text-align:center">Para instalarla: en Safari, botón Compartir → «Añadir a pantalla de inicio».</p>`,
  };
}

// ---------- Datos personales ----------
async function personal() {
  const [p] = await api.db.select('profiles', { id: `eq.${uid()}` });
  const [bm] = await api.db.select('body_metrics', { order: 'date.desc', limit: 1 });
  sheet('Datos personales', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      await api.db.update('profiles', { display_name: v.name || null, birth_date: v.birth || null, sex: v.sex, height_cm: v.height ? +v.height : null, experience: v.exp || null }, { id: `eq.${uid()}` });
      if (v.weight) await api.db.upsert('body_metrics', [{ user_id: uid(), date: today(), weight_kg: +String(v.weight).replace(',', '.'), body_fat_pct: v.fat ? +String(v.fat).replace(',', '.') : null, source: 'manual' }], 'user_id,date,source');
      closeSheet(); invalidate(); toast('Guardado'); await api.fn('replan', { trigger: 'goal_change' }).catch(() => {}); render();
    }))}">
    <label>Nombre</label><input name="name" value="${p?.display_name ?? ''}">
    <label>Fecha de nacimiento</label><input name="birth" type="date" value="${p?.birth_date ?? ''}" required>
    <label>Sexo (para pesos de referencia y cálculos)</label><select name="sex"><option value="male" ${p?.sex !== 'female' ? 'selected' : ''}>Hombre</option><option value="female" ${p?.sex === 'female' ? 'selected' : ''}>Mujer</option></select>
    <div class="grid2"><div><label>Altura (cm)</label><input name="height" type="number" value="${p?.height_cm ?? ''}"></div><div><label>Peso (kg)</label><input name="weight" inputmode="decimal" value="${bm?.weight_kg ?? ''}"></div></div>
    <label>Grasa corporal (%) — opcional</label><input name="fat" inputmode="decimal" value="${bm?.body_fat_pct ?? ''}">
    <label>Experiencia deportiva</label><textarea name="exp" placeholder="Años entrenando, disciplinas, marcas…">${p?.experience ?? ''}</textarea>
    <button class="primary block">Guardar</button></form>`);
}

async function physiology() {
  const hist = await api.db.select('physiology', { order: 'effective_from.desc' });
  const h = hist[0] ?? {};
  sheet('Frecuencia cardíaca', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      await api.db.upsert('physiology', [{ user_id: uid(), effective_from: today(), hr_rest: v.rest ? +v.rest : null, hr_max: v.max ? +v.max : null, lthr: v.lthr ? +v.lthr : null, method: 'manual' }], 'user_id,effective_from');
      closeSheet(); invalidate(); toast('Zonas actualizadas'); render();
    }))}">
    <label>FC en reposo (ppm)</label><input name="rest" type="number" value="${h.hr_rest ?? ''}">
    <label>FC máxima medida (ppm)</label><input name="max" type="number" value="${h.hr_max ?? ''}">
    <label>FC de umbral (ppm), si la conoces</label><input name="lthr" type="number" value="${h.lthr ?? ''}">
    <p class="xs muted">Usa valores medidos (la FC máxima vista en una competición o test), no 220−edad.</p>
    <button class="primary block">Guardar desde hoy</button></form>
    ${hist.length ? html`<h3>Historial</h3>${hist.map((x) => html`<div class="small muted">${x.effective_from}: reposo ${x.hr_rest ?? '–'} · máx ${x.hr_max ?? '–'}${x.lthr ? ` · umbral ${x.lthr}` : ''}</div>`)}` : ''}`);
}

export async function availability(after) {
  const rows = await api.db.select('availability', { order: 'weekday' });
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => rows.find((r) => r.weekday === d) ?? { weekday: d, am: d >= 6, pm: d <= 5, max_minutes: d >= 6 ? 120 : 75, box_class: [1, 3, 5].includes(d) });
  sheet('Disponibilidad', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      await api.db.upsert('availability', days.map((d) => ({ user_id: uid(), weekday: d.weekday, am: !!v[`am${d.weekday}`], pm: !!v[`pm${d.weekday}`], max_minutes: +v[`min${d.weekday}`] || 0, box_class: !!v[`box${d.weekday}`] })), 'user_id,weekday');
      await api.fn('replan', { trigger: 'goal_change' }); closeSheet(); invalidate(); toast('Plan recalculado con tu disponibilidad'); after ? after() : render();
    }))}">
    ${days.map((d) => html`<div class="card tight"><b>${DAYS[d.weekday - 1]}</b>
      <div class="row"><label class="check"><input type="checkbox" name="am${d.weekday}" ${d.am ? 'checked' : ''}> Mañana</label><label class="check"><input type="checkbox" name="pm${d.weekday}" ${d.pm ? 'checked' : ''}> Tarde</label>
        <input style="width:80px" name="min${d.weekday}" type="number" value="${d.max_minutes}"> <span class="xs muted">min</span></div>
      <label class="check"><input type="checkbox" name="box${d.weekday}" ${d.box_class ? 'checked' : ''}> Suelo ir al box (CrossFit)</label></div>`)}
    <p class="xs muted">Si conectas el calendario de WodBuster, mandan tus clases reservadas; esto se usa cuando aún no has reservado.</p>
    <button class="primary block">Guardar y recalcular plan</button></form>`);
}

async function preferences() {
  const [p] = await api.db.select('profiles', { id: `eq.${uid()}` });
  sheet('Preferencias', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      await api.db.update('profiles', { allow_doubles: !!v.doubles, crossfit_per_week: +v.cf, hyrox_division: v.div, sleep_need_h: +v.sleep }, { id: `eq.${uid()}` });
      await api.fn('replan', { trigger: 'goal_change' }); closeSheet(); invalidate(); toast('Plan recalculado'); render();
    }))}">
    <label class="check"><input type="checkbox" name="doubles" ${p.allow_doubles ? 'checked' : ''}> Permitir sesiones dobles (rodaje suave + CrossFit el mismo día)</label>
    <label>Sesiones de CrossFit por semana</label><input name="cf" type="number" min="0" max="6" value="${p.crossfit_per_week}">
    <label>Categoría HYROX</label><select name="div">${[['open_men', 'Open hombre'], ['open_women', 'Open mujer'], ['pro_men', 'Pro hombre'], ['pro_women', 'Pro mujer']].map(([k, l]) => html`<option value="${k}" ${p.hyrox_division === k ? 'selected' : ''}>${l}</option>`)}</select>
    <label>Horas de sueño que necesitas</label><input name="sleep" type="number" step="0.5" value="${p.sleep_need_h}">
    <button class="primary block">Guardar</button></form>`);
}

async function injuries() {
  const list = await api.db.select('injuries', { order: 'created_at.desc' });
  sheet('Lesiones', html`
    ${list.filter((i) => !i.resolved_on).map((i) => html`<div class="card tight row"><div class="grow"><b>${i.area}</b><div class="small muted">${i.description ?? ''}</div></div><button class="sm" data-act="${act((b) => busy(b, async () => { await api.db.update('injuries', { resolved_on: today() }, { id: `eq.${i.id}` }); closeSheet(); injuries(); }))}">Resuelta</button></div>`)}
    <form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => { await api.db.insert('injuries', [{ user_id: uid(), area: v.area, description: v.desc || null, started_on: today() }]); closeSheet(); injuries(); }))}">
      <label>Zona</label><input name="area" required><label>Descripción / lo que te dijo tu fisio</label><textarea name="desc"></textarea><button class="block">Añadir</button></form>
    ${list.filter((i) => i.resolved_on).map((i) => html`<div class="xs muted">${i.area} · resuelta ${i.resolved_on}</div>`)}`);
}

// ---------- Objetivos ----------
export async function goals() {
  const list = await api.db.select('goals', { status: 'eq.active', order: 'date' });
  sheet('Objetivos', html`
    ${list.map((g) => html`<div class="card tight row" data-act="${act(() => goalEditor(g))}"><div class="grow"><b>${g.name}</b><div class="xs muted">${g.date} · prioridad ${g.priority}</div></div><span class="muted">›</span></div>`)}
    <button class="primary block" data-act="${act(() => goalEditor({ name: '', type: 'half_marathon', date: addDays(today(), 84), priority: 'A' }))}">＋ Añadir objetivo</button>`);
}
function goalEditor(g) {
  sheet(g.id ? 'Editar objetivo' : 'Nuevo objetivo', html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      const parts = (v.target || '').split(':').map(Number).filter((x) => !Number.isNaN(x));
      const row = { user_id: uid(), name: v.name, type: v.type, date: v.date, priority: v.priority, target_time_s: parts.length ? parts.reduce((a, b) => a * 60 + b, 0) : null, distance_m: ({ half_marathon: 21097.5, marathon: 42195, '10k': 10000, '5k': 5000 })[v.type] ?? null };
      if (g.id) await api.db.update('goals', row, { id: `eq.${g.id}` }); else await api.db.insert('goals', [row]);
      await api.fn('replan', { trigger: 'goal_change' }); closeSheet(); invalidate(); toast('Planificación actualizada'); render();
    }))}">
    <label>Nombre</label><input name="name" value="${g.name}" required>
    <label>Tipo</label><select name="type">${GOAL_TYPES.map(([k, l]) => html`<option value="${k}" ${g.type === k ? 'selected' : ''}>${l}</option>`)}</select>
    <label>Fecha</label><input name="date" type="date" value="${g.date}" required>
    <label>Prioridad</label><select name="priority">${['A', 'B', 'C'].map((p) => html`<option ${g.priority === p ? 'selected' : ''}>${p}</option>`)}</select>
    <label>Tiempo objetivo (h:mm:ss, opcional)</label><input name="target" placeholder="1:35:00">
    <button class="primary block">Guardar</button></form>
    ${g.id ? html`<button class="block danger" data-act="${act((b) => busy(b, async () => { await api.db.update('goals', { status: 'cancelled' }, { id: `eq.${g.id}` }); await api.fn('replan', { trigger: 'goal_change' }); closeSheet(); invalidate(); render(); }))}">Eliminar objetivo</button>` : ''}`);
}

// ---------- Apple Watch automático: HealthFit → Intervals.icu → Forja ----------
async function watchSync() {
  let st = await api.fn('intervals-sync', { action: 'status' }).catch(() => ({ connected: false }));
  let importing = false;
  const importAll = async () => {
    importing = true; draw();
    try {
      for (let i = 0; i < 80; i++) {
        const r = await api.fn('intervals-sync', { action: 'process', limit: 15 });
        st = { ...st, pending: r.remaining };
        const el = document.getElementById('icuprog'); if (el) el.textContent = `Quedan ${r.remaining} entrenos por importar…`;
        if (!r.remaining) break;
      }
      invalidate('sessions', 'planned', 'readiness', 'insights', 'records', 'exhist'); toast('Historial importado');
    } catch (e) { toast(e.message, 6000); }
    importing = false; st = await api.fn('intervals-sync', { action: 'status' }).catch(() => st); draw();
  };
  const draw = () => setSheet(st.connected ? html`
    <div class="card tight"><b>✓ Conectado</b> <span class="xs muted">(atleta ${st.athleteId})</span>
      <div class="small muted">${st.lastPullAt ? `Última recogida: ${new Date(st.lastPullAt).toLocaleString('es-ES')}` : 'Aún no ha recogido nada'} · ${st.total} entrenos recibidos</div>
      ${st.lastError ? html`<div class="small bad">${st.lastError}</div>` : ''}</div>
    <p class="small">Cada entreno que grabas en el Apple Watch llega solo: HealthFit lo sube a Intervals.icu al desbloquear el iPhone y Forja lo recoge cada 10 minutos (y al abrir la app). Te avisa con una notificación.</p>
    ${st.pending ? html`<div class="card tight"><b>Historial pendiente</b><div class="small" id="icuprog">Quedan ${st.pending} entrenos por importar.</div>
      <button class="primary block" ${importing ? 'disabled' : ''} data-act="${act(importAll)}">${importing ? 'Importando… no cierres Forja' : 'Importar ahora'}</button></div>` : ''}
    <div class="card tight"><b>¿Faltan entrenos antiguos?</b>
      <p class="small muted">Forja solo ve lo que HealthFit ha subido a Intervals.icu. Si después has subido tu historial, búscalo aquí.</p>
      <div class="row" style="gap:8px"><select id="icuhist" class="grow"><option value="365">Último año</option><option value="1095">Últimos 3 años</option><option value="3650">Todo</option></select>
      <button data-act="${act((b) => busy(b, async () => { const r = await api.fn('intervals-sync', { action: 'history', days: +document.getElementById('icuhist').value }); toast(r.found ? `${r.found} entrenos nuevos encontrados` : 'No hay entrenos nuevos en Intervals.icu en ese periodo', 6000); st = await api.fn('intervals-sync', { action: 'status' }); draw(); if (st.pending) importAll(); }))}">Buscar</button></div></div>
    <button class="block" data-act="${act((b) => busy(b, async () => { const r = await api.fn('intervals-sync', { action: 'pull' }); invalidate('sessions', 'planned', 'readiness', 'insights', 'icuconn'); st = await api.fn('intervals-sync', { action: 'status' }); draw(); toast(r.activities ? `${r.activities} entreno(s) nuevo(s)` : 'Todo al día'); }))}">Recoger ahora</button>
    <button class="block ghost danger" data-act="${act(async () => { if (!confirm('¿Desconectar Intervals.icu? Los entrenos ya importados se quedan.')) return; await api.fn('intervals-sync', { action: 'disconnect' }); invalidate('icuconn'); st = { connected: false }; draw(); })}">Desconectar</button>`
  : html`
    <p class="small">Así los entrenos del Apple Watch llegan solos, con FC, ritmo, splits, zonas, cadencia, potencia, ruta y vueltas, y también la VFC, el pulso en reposo y el sueño.</p>
    <ol class="small">
      <li>En <b>HealthFit</b>: pestaña de perfil → sincronización → <b>Intervals.icu</b> → inicia sesión y activa la sincronización automática (entrenos y métricas de salud).</li>
      <li>En <b>intervals.icu</b> (desde Safari): tu nombre → <b>Settings</b> → abajo del todo, <b>Developer Settings</b>. Ahí verás tu <b>Athlete ID</b> (empieza por «i») y el botón para generar la <b>API Key</b>.</li>
      <li>Copia los dos aquí:</li></ol>
    <label>Athlete ID</label><input id="icuid" placeholder="i123456" autocapitalize="off">
    <label>API Key</label><input id="icukey" placeholder="clave larga" autocapitalize="off" autocomplete="off">
    <label>Traer historial de</label><select id="icudays"><option value="90">Últimos 3 meses</option><option value="365" selected>Último año</option><option value="1095">Últimos 3 años</option></select>
    <button class="primary block" data-act="${act((b) => busy(b, async () => {
      const r = await api.fn('intervals-sync', { action: 'connect', athleteId: document.getElementById('icuid').value, apiKey: document.getElementById('icukey').value, historyDays: +document.getElementById('icudays').value });
      invalidate('icuconn');
      toast(`Conectado${r.athlete ? ` como ${r.athlete}` : ''}: ${r.found} entrenos encontrados`, 6000);
      st = await api.fn('intervals-sync', { action: 'status' }); draw();
      if (st.pending) importAll();
    }))}">Conectar</button>
    <p class="xs muted">La clave se guarda en tu base de datos de Supabase y solo la usa tu servidor para leer tus datos de Intervals.icu.</p>`);
  sheet('Apple Watch automático', ''); draw();
}

// ---------- Apple Salud vía Atajos ----------
async function health() {
  let created = null;
  const draw = () => setSheet(html`
    <p class="small">Una web no puede leer Apple Salud directamente. La forma gratuita es un <b>Atajo</b> de la app Atajos de tu iPhone que lee tus datos y los envía a Forja cada día (y al terminar un entreno, si tu iOS lo permite).</p>
    ${created ? html`<div class="card tight"><div class="small">Tu token (cópialo ahora, no se vuelve a mostrar):</div><input readonly value="${created.token}" onclick="this.select()"><div class="small" style="margin-top:6px">URL:</div><input readonly value="${created.url}" onclick="this.select()"></div>`
      : html`<button class="primary block" data-act="${act((b) => busy(b, async () => { created = await api.fn('health-token'); invalidate('ingest_token'); draw(); }))}">Crear mi token</button>`}
    <h3>Crear el Atajo (una vez)</h3>
    <ol class="small">
      <li>Abre <b>Atajos</b> → <b>＋</b> → nómbralo «Forja Salud».</li>
      <li>Añade <b>Buscar muestras de salud</b> → Tipo: <i>Variabilidad de la frecuencia cardíaca</i>, Fecha de inicio: <i>en las últimas 24 horas</i>. Después <b>Calcular estadísticas</b> → <i>Promedio</i>.</li>
      <li>Repite con <i>Frecuencia cardíaca en reposo</i> (Promedio), <i>Pasos</i> (Suma), <i>Energía activa</i> (Suma) y <i>Análisis del sueño</i> con valor <i>Dormido</i> en las últimas 18 horas → <b>Obtener detalles</b> → <i>Duración</i> → <b>Calcular estadísticas</b> → <i>Suma</i> (minutos).</li>
      <li>Añade <b>Diccionario</b> con las claves: <code>fecha</code> (Fecha actual, formato aaaa-MM-dd), <code>vfc</code>, <code>fc_reposo</code>, <code>pasos</code>, <code>kcal_activas</code>, <code>sueño_min</code> (cada una con su resultado).</li>
      <li>Añade <b>Obtener contenido de URL</b>: URL de arriba · Método <i>POST</i> · Cabecera <code>x-forja-token</code> = tu token · Cuerpo de la solicitud <i>JSON</i> → el Diccionario.</li>
      <li>En <b>Automatización</b> → <b>＋</b> → <i>Hora del día</i> 9:00 → Ejecutar inmediatamente → «Forja Salud».</li>
    </ol>
    <details><summary>Entrenos del Apple Watch (opcional)</summary><p class="small">Si tu iOS ofrece la automatización «Entreno del Apple Watch → al terminar», puedes añadir al Diccionario una clave <code>entrenos</code> (lista) con <code>inicio</code>, <code>fin</code>, <code>tipo</code>, <code>kcal</code>, <code>fc_media</code> y <code>distancia_km</code>. Si no, registra el entreno pegando el texto o con «Manual»: Forja lo une igual a tu plan.</p></details>
    <p class="xs muted">Los datos llegan a tu buzón y se procesan con tus permisos cuando abres Forja. Puedes crear un token nuevo cuando quieras (el anterior deja de funcionar).</p>`);
  sheet('Apple Salud', ''); draw();
}

// ---------- Calendario / WodBuster ----------
async function calendar() {
  const s = (await api.db.select('calendar_settings', { user_id: `eq.${uid()}` }))[0] ?? { ics_urls: [], crossfit_keywords: [] };
  let result = null;
  const draw = () => setSheet(html`<form data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
      const urls = [v.wb, v.g1, v.g2].map((x) => (x || '').trim()).filter(Boolean);
      result = await api.fn('calendar-sync', { settings: { ics_urls: urls, crossfit_keywords: v.kw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) } });
      invalidate('calset', 'planned'); draw();
    }))}">
    <label>Calendario de WodBuster (enlace de sincronización)</label><input name="wb" type="url" placeholder="webcal://… o https://…" value="${s.ics_urls[0] ?? ''}">
    <p class="xs muted">En WodBuster: Perfil → Calendarios → copia el enlace. Tus clases reservadas pasan a ser sesiones fijas y el resto de la semana se organiza a su alrededor.</p>
    <label>Google Calendar (dirección secreta en formato iCal)</label><input name="g1" type="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value="${s.ics_urls[1] ?? ''}">
    <p class="xs muted">En Google Calendar (web): Configuración → tu calendario → «Dirección secreta en formato iCal». Así evito ponerte entrenos cuando estás ocupado.</p>
    <label>Otro calendario ICS (opcional)</label><input name="g2" type="url" value="${s.ics_urls[2] ?? ''}">
    <label>Palabras que identifican tus clases (p. ej. nombre del box)</label><input name="kw" value="${(s.crossfit_keywords || []).join(', ')}">
    <button class="primary block">Guardar y sincronizar</button></form>
    ${result ? html`<div class="card tight"><b>Clases detectadas</b>${result.crossfitClasses.map((c) => html`<div class="small">${c.date} · ${c.startLocal} · ${c.title}</div>`)}${!result.crossfitClasses.length ? html`<div class="small muted">No veo clases reservadas en 3 semanas.</div>` : ''}
      ${result.replanned ? html`<div class="ok small">Plan reorganizado</div>` : ''}${[...result.errors, ...result.notes].map((e) => html`<div class="alert small">${e}</div>`)}</div>` : ''}`);
  sheet('Calendario', ''); draw();
}

// ---------- Notificaciones (Web Push) ----------
async function notifications() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  sheet('Notificaciones', html`
    <p class="small">Te aviso de lo que te falta o sobra antes de la siguiente comida y de tu entreno del día.</p>
    ${!standalone ? html`<p class="alert small">En iPhone solo funcionan con Forja añadida a la pantalla de inicio (Safari → Compartir → Añadir a pantalla de inicio) y abierta desde ese icono.</p>` : ''}
    <button class="primary block" data-act="${act((b) => busy(b, async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no permite notificaciones. Abre Forja desde el icono de la pantalla de inicio.');
      const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('No has dado permiso de notificaciones.');
      const { publicKey } = await api.fn('push-config'); if (!publicKey) throw new Error('Faltan las claves de notificaciones en el servidor (VAPID).');
      const reg = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (publicKey.length % 4)) % 4)), (c) => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await api.fn('push-subscribe', { subscription: sub.toJSON() }); toast('Notificaciones activadas');
    }))}">Activar notificaciones</button>`);
}

// ---------- Privacidad ----------
async function privacy() {
  const consent = (await api.db.select('consents', { kind: 'eq.ai_processing', revoked_at: 'is.null' })).length > 0;
  const mem = await api.db.select('coach_memory', { active: 'eq.true', select: 'id,fact' });
  sheet('Privacidad e IA', html`
    <p class="small">IA: <b>${consent ? 'activada' : 'desactivada'}</b>. Con ella activada se envían a <b>Google Gemini (nivel gratuito)</b> los datos necesarios para el coach, leer fotos, interpretar lo que comes y crear menús. En el nivel gratuito Google puede usarlos para mejorar sus productos. Sin IA siguen funcionando el plan, el intérprete de WODs en texto, los macros, la compra y los suplementos.</p>
    <button class="block ${consent ? 'danger' : 'primary'}" data-act="${act((b) => busy(b, async () => {
      if (consent) await api.db.update('consents', { revoked_at: new Date().toISOString() }, { kind: 'eq.ai_processing' });
      else await api.db.upsert('consents', [{ user_id: uid(), kind: 'ai_processing', version: '2026-11-gemini', provider: 'gemini', granted_at: new Date().toISOString(), revoked_at: null }], 'user_id,kind,version');
      invalidate('consent'); closeSheet(); privacy();
    }))}">${consent ? 'Desactivar la IA' : 'Activar la IA'}</button>
    <h3>Lo que el coach recuerda de ti</h3>
    ${mem.map((m) => html`<div class="row small"><span class="grow">${m.fact}</span><button class="sm ghost danger" data-act="${act((b) => busy(b, async () => { await api.db.remove('coach_memory', { id: `eq.${m.id}` }); closeSheet(); privacy(); }))}">Borrar</button></div>`)}
    ${!mem.length ? html`<p class="small muted">Nada todavía.</p>` : ''}`);
}

async function exportData() {
  sheet('Exportar', html`<p class="small">Descarga todos tus datos (perfil, plan, entrenos, series, récords, salud, comidas, despensa…) en un archivo JSON.</p>
    <button class="primary block" data-act="${act((b) => busy(b, async () => {
      const blob = await api.fnRaw('export-data'); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `forja-${today()}.json`; a.click();
    }))}">Descargar copia</button>`);
}

// ---------- Onboarding ----------
let ob = 0;
export async function ONBOARDING() {
  const steps = [
    () => html`<div class="card"><h3>Bienvenido a Forja</h3><p class="small">Vamos a configurar lo básico en 2 minutos. Luego podrás cambiarlo todo en Perfil.</p>
      <p class="small">Para tenerla como app: en Safari pulsa <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.</p></div>`,
    () => html`<form class="card" data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
        await api.db.update('profiles', { display_name: v.name || null, birth_date: v.birth, sex: v.sex, height_cm: +v.height }, { id: `eq.${uid()}` });
        await api.db.upsert('body_metrics', [{ user_id: uid(), date: today(), weight_kg: +String(v.weight).replace(',', '.'), source: 'manual' }], 'user_id,date,source');
        if (v.rest || v.max) await api.db.upsert('physiology', [{ user_id: uid(), effective_from: today(), hr_rest: v.rest ? +v.rest : null, hr_max: v.max ? +v.max : null, method: 'manual' }], 'user_id,effective_from');
        invalidate('profile'); ob++; render();
      }))}"><h3>Tus datos</h3>
      <label>Nombre</label><input name="name"><label>Fecha de nacimiento</label><input name="birth" type="date" required>
      <label>Sexo</label><select name="sex"><option value="male">Hombre</option><option value="female">Mujer</option></select>
      <div class="grid2"><div><label>Altura (cm)</label><input name="height" type="number" required></div><div><label>Peso (kg)</label><input name="weight" inputmode="decimal" required></div></div>
      <div class="grid2"><div><label>FC reposo</label><input name="rest" type="number" placeholder="opcional"></div><div><label>FC máxima medida</label><input name="max" type="number" placeholder="opcional"></div></div>
      <button class="primary block">Siguiente</button></form>`,
    () => html`<div class="card"><h3>Disponibilidad</h3><p class="small">Qué días y franjas puedes entrenar y cuándo sueles ir al box.</p><button class="primary block" data-act="${act(() => availability(() => { ob++; render(); }))}">Configurar</button></div>`,
    () => html`<form class="card" data-submit="${act((v, f) => busy(f.querySelector('button'), async () => {
        const av = await api.db.select('availability', {});
        if (!av.length) await api.db.upsert('availability', [1, 2, 3, 4, 5, 6, 7].map((d) => ({ user_id: uid(), weekday: d, am: d >= 6, pm: d <= 5, max_minutes: d >= 6 ? 120 : 75, box_class: [1, 3, 5].includes(d) })), 'user_id,weekday');
        if (v.hm) await api.db.insert('goals', [{ user_id: uid(), name: 'Media Maratón de Castellón', type: 'half_marathon', date: '2027-01-31', priority: 'A', distance_m: 21097.5 }]);
        if (v.hx) await api.db.insert('goals', [{ user_id: uid(), name: 'HYROX', type: 'hyrox', date: '2027-04-16', priority: 'A' }]);
        await api.db.upsert('nutrition_settings', [{ user_id: uid(), mode: v.mode }], 'user_id');
        if (v.ai) await api.db.upsert('consents', [{ user_id: uid(), kind: 'ai_processing', version: '2026-11-gemini', provider: 'gemini', granted_at: new Date().toISOString(), revoked_at: null }], 'user_id,kind,version');
        await api.fn('replan', { trigger: 'goal_change' }); invalidate(); ob = 0; go('inicio');
      }))}"><h3>Objetivos</h3>
      <label class="check"><input type="checkbox" name="hm" checked> Media Maratón de Castellón · 31/01/2027</label>
      <label class="check"><input type="checkbox" name="hx" checked> HYROX · 16/04/2027</label>
      <label>Objetivo nutricional</label><select name="mode">${GOAL_MODES.map(([k, l]) => html`<option value="${k}" ${k === 'mantenimiento' ? 'selected' : ''}>${l}</option>`)}</select>
      <label class="check"><input type="checkbox" name="ai"> Activar la IA (Google Gemini gratis: coach, fotos, menús). Google puede usar lo que envíes para mejorar sus productos.</label>
      <button class="primary block">Crear mi plan</button></form>`,
  ];
  return {
    title: `Configuración ${ob + 1}/${steps.length}`,
    body: html`${steps[ob]()}${ob === 0 ? html`<button class="primary block" data-act="${act(() => { ob++; render(); })}">Empezar</button>` : ''}${ob === 2 ? html`<button class="ghost block" data-act="${act(() => { ob++; render(); })}">Saltar (usaré valores por defecto)</button>` : ''}`,
  };
}
