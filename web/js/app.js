// Forja · web app (PWA). Rutas, sesión, caché de datos y arranque.
import * as api from './api.js';
import { html, raw, act, toast, busy, today, addDays, closeSheet } from './ui.js';
import { ic } from './icons.js';
import { HOME, PLAN, WORKOUTS, COACH, HEALTH } from './screens.js';
import { NUTRITION } from './nutrition.js';
import { PROFILE, ONBOARDING } from './profile.js';
import { GOAL } from './goals.js';

// ---------- Caché de datos: al instante desde el móvil y actualizada por detrás ----------
// Primero se pinta lo último guardado en el móvil (localStorage) y, si está viejo, se pide al servidor sin bloquear:
// cuando llega algo distinto, la pantalla se vuelve a pintar sola. Tras un cambio tuyo (invalidate) se espera al servidor.
const cache = new Map();
const LS = 'forja:c:';
const inflight = new Map();
function readP(key) { try { const x = localStorage.getItem(LS + key); return x ? JSON.parse(x) : null; } catch { return null; } }
function writeP(key, v, t) {
  try { const s = JSON.stringify({ v, t }); if (s.length < 600_000) localStorage.setItem(LS + key, s); }
  catch { try { for (const k of Object.keys(localStorage)) if (k.startsWith(LS)) localStorage.removeItem(k); } catch { /* */ } }
}
let dirty = false;
function changed() {
  // Repinta solo si no estás escribiendo ni con una hoja abierta (si no, al cerrarla).
  if (!document.getElementById('sheet').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) { dirty = true; return; }
  clearTimeout(changed.t); changed.t = setTimeout(() => render({ soft: true }), 120);
}
export const flushDirty = () => { if (dirty) { dirty = false; changed(); } };
function revalidate(key, fetcher) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const v = await fetcher(); const old = cache.get(key);
      cache.set(key, { v, t: Date.now() }); writeP(key, v, Date.now());
      if (old && JSON.stringify(old.v) !== JSON.stringify(v)) changed();
      return v;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p); return p;
}
export async function get(key, fetcher, maxAge = 60_000) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < maxAge) return c.v;
  if (c) { revalidate(key, fetcher).catch(() => {}); return c.v; }
  const p = readP(key);
  if (p) { cache.set(key, p); if (Date.now() - p.t >= maxAge) revalidate(key, fetcher).catch(() => {}); return p.v; }
  return revalidate(key, fetcher);
}
export function invalidate(...prefixes) {
  const hit = (k) => !prefixes.length || prefixes.some((p) => k.startsWith(p));
  for (const k of [...cache.keys()]) if (hit(k)) cache.delete(k);
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(LS) && hit(k.slice(LS.length))) localStorage.removeItem(k); } catch { /* */ }
}
export function clearCache() { invalidate(); }

// ---------- Navegación ----------
const TABS = [['inicio', 'home', 'Inicio'], ['plan', 'calendar', 'Plan'], ['entrenos', 'activity', 'Entrenos'], ['nutricion', 'food', 'Nutrición'], ['coach', 'chat', 'Coach']];
const ROUTES = { inicio: HOME, plan: PLAN, entrenos: WORKOUTS, nutricion: NUTRITION, coach: COACH, perfil: PROFILE, onboarding: ONBOARDING, objetivo: GOAL, salud: HEALTH };

export const go = (path) => { if (location.hash !== `#/${path}`) location.hash = `#/${path}`; else render(); };
const route = () => { const [name = 'inicio', ...rest] = location.hash.replace(/^#\/?/, '').split('/'); return { name, params: rest }; };

let rendering = 0, lastRoute = '';
const SKELETON = '<div class="sk" style="height:190px;border-radius:28px"></div><div class="sk" style="height:120px"></div><div class="tiles"><div class="sk" style="height:120px;margin:0"></div><div class="sk" style="height:120px;margin:0"></div></div><div class="sk" style="height:160px"></div>';
export async function render(opts = {}) {
  const my = ++rendering;
  const view = document.getElementById('view'), top = document.getElementById('top'), tabs = document.getElementById('tabs');
  if (!api.configured()) { top.innerHTML = '<h1>Forja</h1>'; tabs.innerHTML = ''; view.innerHTML = html`<div class="card"><h3>Falta configurar</h3><p class="muted">Edita <code>js/config.js</code> con la URL y la anon key de tu proyecto de Supabase (lo hace solo el despliegue de GitHub).</p></div>`.s; return; }
  if (!api.user()) return renderAuth();
  const r = route();
  const key = `${r.name}/${r.params.join('/')}`, isNew = key !== lastRoute && !opts.soft;
  const screen = ROUTES[r.name] ?? HOME;
  tabs.innerHTML = TABS.map(([k, i, l]) => `<a href="#/${k}" class="${(r.name === k || (k === 'inicio' && (r.name === 'perfil' || r.name === 'salud' || r.name === 'objetivo'))) ? 'on' : ''}">${ic(i, 23)}${l}</a>`).join('');
  tabs.style.display = r.name === 'onboarding' ? 'none' : 'flex';
  // Si la pantalla tarda (primera vez sin datos guardados), se ve el esqueleto en vez de una página en blanco.
  const sk = isNew ? setTimeout(() => { if (my === rendering) { view.classList.remove('enter'); view.innerHTML = SKELETON; } }, 90) : 0;
  try {
    const out = await screen(r.params);
    clearTimeout(sk);
    if (my !== rendering) return;
    top.innerHTML = html`<h1>${out.sub ? html`<span class="sub">${out.sub}</span>` : ''}${out.title}</h1>${out.right ?? ''}`.s;
    if (isNew) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); } else view.classList.remove('enter');
    view.innerHTML = String(out.body);
    lastRoute = key;
    out.after?.();
  } catch (e) {
    clearTimeout(sk);
    if (my !== rendering) return;
    if (/sesión ha caducado|Inicia sesión/.test(e.message)) return renderAuth();
    view.innerHTML = html`<div class="card"><h3>No se pudo cargar</h3><p class="muted">${e.message}</p><button class="block" data-act="${act(() => { invalidate(); render(); })}">Reintentar</button></div>`.s;
  }
}
window.addEventListener('hashchange', () => { if (!document.getElementById('sheet').hidden) closeSheet(); window.scrollTo(0, 0); render(); });

// ---------- Acceso ----------
function renderAuth(mode = 'login') {
  document.getElementById('tabs').innerHTML = '';
  document.getElementById('top').innerHTML = '';
  const submit = act(async (v, form) => busy(form.querySelector('button[type=submit]'), async () => {
    if (mode === 'login') { await api.signIn(v.email.trim(), v.password); invalidate(); go('inicio'); }
    else {
      const logged = await api.signUp(v.email.trim(), v.password);
      if (logged) { invalidate(); go('onboarding'); } else { toast('Te he enviado un email para confirmar la cuenta. Confírmalo y entra aquí con tu contraseña.', 8000); renderAuth('login'); }
    }
  }));
  document.getElementById('view').innerHTML = html`
    <div style="padding-top:12vh;text-align:center"><div style="width:84px;height:84px;margin:0 auto;border-radius:26px;display:grid;place-items:center;background:linear-gradient(160deg,#5b97ff,#1d4ed8);box-shadow:0 18px 40px rgba(29,78,216,.5);color:#fff">${raw(ic('zap', 44))}</div><h1 style="margin:14px 0 6px;font-size:34px">Forja</h1>
      <p class="muted">Tu entrenador personal de running, CrossFit, HYROX y nutrición.</p></div>
    <form class="card" data-submit="${submit}">
      <label>Email</label><input name="email" type="email" autocomplete="email" required>
      <label>Contraseña</label><input name="password" type="password" minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>
      <button type="submit" class="primary block" style="margin-top:16px">${mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
    </form>
    <button class="ghost block" data-act="${act(() => renderAuth(mode === 'login' ? 'signup' : 'login'))}">${mode === 'login' ? '¿No tienes cuenta? Créala' : 'Ya tengo cuenta'}</button>
    <p class="muted xs" style="text-align:center">Tus datos se guardan en tu propia base de datos y solo tú puedes verlos.</p>`.s;
}

// ---------- Sincronización al abrir ----------
let lastSync = 0;
export async function backgroundSync(force = false) {
  if (!api.user() || (!force && Date.now() - lastSync < 45_000)) return;
  lastSync = Date.now();
  try {
    const sent = await api.flushOutbox().catch(() => 0);
    if (sent) { invalidate(); render(); toast(`Sincronizado lo que apuntaste sin conexión (${sent})`); }
    // En paralelo: Apple Watch (HealthFit → Intervals.icu), buzón del Atajo y calendario. Luego se reajusta el plan.
    const [icu, inbox, cal] = await Promise.all([
      api.fn('intervals-sync', { action: 'pull' }).catch(() => null),
      api.fn('process-inbox').catch(() => ({})),
      api.fn('calendar-sync', {}).catch(() => null),
    ]);
    if (icu?.activities) toast(`⌚ ${icu.activities} entreno${icu.activities > 1 ? 's' : ''} nuevo${icu.activities > 1 ? 's' : ''} del Apple Watch`, 5000);
    if (icu?.prs?.length || inbox.prs?.length) toast(`🏆 Nuevo récord: ${(icu?.prs ?? inbox.prs)[0]}`, 6000);
    else if (cal?.replanned) toast('Plan reorganizado con tu calendario');
    const news = icu?.activities || icu?.days || inbox.processed || cal?.replanned;
    if (news) { invalidate('sessions', 'readiness', 'health', 'changes', 'insights', 'planned'); render({ soft: true }); }
    const rp = await api.fn('replan', { trigger: 'checkin' }).catch(() => null);
    if (rp?.changes?.length) { invalidate('planned', 'changes'); render({ soft: true }); }
  } catch (e) { console.warn('sync', e); }
}
window.addEventListener('online', () => backgroundSync(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') backgroundSync(); });
// Con la app abierta, mira cada 2 minutos si el Watch ha mandado algo nuevo.
setInterval(() => { if (document.visibilityState === 'visible') backgroundSync(); }, 120_000);

// Si llegaron datos nuevos mientras escribías o con una hoja abierta, se repinta al terminar.
new MutationObserver(() => { if (document.getElementById('sheet').hidden) flushDirty(); }).observe(document.getElementById('sheet'), { attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('focusout', () => setTimeout(() => { if (!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) flushDirty(); }, 50));

// ---------- Arranque ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => {
  await render();
  if (api.user()) {
    try {
      const prof = await get('profile', async () => (await api.db.select('profiles', { id: `eq.${api.userId()}` }))[0]);
      if (prof && !prof.birth_date && route().name !== 'onboarding') return go('onboarding');
    } catch { /* sin conexión */ }
    backgroundSync(true);
  }
})();

export { api, today, addDays };
