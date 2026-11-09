// Forja · web app (PWA). Rutas, sesión, caché de datos y arranque.
import * as api from './api.js';
import { html, act, toast, busy, today, addDays, closeSheet } from './ui.js';
import { HOME, PLAN, WORKOUTS, COACH } from './screens.js';
import { NUTRITION } from './nutrition.js';
import { PROFILE, ONBOARDING } from './profile.js';
import { GOAL } from './goals.js';

// ---------- Caché de datos ----------
const cache = new Map();
export async function get(key, fetcher, maxAge = 60_000) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < maxAge) return c.v;
  const v = await fetcher(); cache.set(key, { v, t: Date.now() }); return v;
}
export function invalidate(...prefixes) { for (const k of [...cache.keys()]) if (!prefixes.length || prefixes.some((p) => k.startsWith(p))) cache.delete(k); }

// ---------- Navegación ----------
const TABS = [['inicio', '🏠', 'Inicio'], ['plan', '📅', 'Plan'], ['entrenos', '🏃', 'Entrenos'], ['nutricion', '🥗', 'Nutrición'], ['coach', '💬', 'Coach']];
const ROUTES = { inicio: HOME, plan: PLAN, entrenos: WORKOUTS, nutricion: NUTRITION, coach: COACH, perfil: PROFILE, onboarding: ONBOARDING, objetivo: GOAL };

export const go = (path) => { if (location.hash !== `#/${path}`) location.hash = `#/${path}`; else render(); };
const route = () => { const [name = 'inicio', ...rest] = location.hash.replace(/^#\/?/, '').split('/'); return { name, params: rest }; };

let rendering = 0;
export async function render() {
  const my = ++rendering;
  const view = document.getElementById('view'), top = document.getElementById('top'), tabs = document.getElementById('tabs');
  if (!api.configured()) { top.innerHTML = '<h1>Forja</h1>'; tabs.innerHTML = ''; view.innerHTML = html`<div class="card"><h3>Falta configurar</h3><p class="muted">Edita <code>js/config.js</code> con la URL y la anon key de tu proyecto de Supabase (lo hace solo el despliegue de GitHub).</p></div>`.s; return; }
  if (!api.user()) return renderAuth();
  const r = route();
  const screen = ROUTES[r.name] ?? HOME;
  tabs.innerHTML = TABS.map(([k, i, l]) => `<a href="#/${k}" class="${(r.name === k || (k === 'inicio' && r.name === 'perfil')) ? 'on' : ''}"><span class="i">${i}</span>${l}</a>`).join('');
  tabs.style.display = r.name === 'onboarding' ? 'none' : 'flex';
  try {
    const out = await screen(r.params);
    if (my !== rendering) return;
    top.innerHTML = html`<h1>${out.title}</h1>${out.right ?? ''}`.s;
    view.innerHTML = String(out.body);
    out.after?.();
  } catch (e) {
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
    <div style="padding-top:12vh;text-align:center"><div style="font-size:64px">🔥</div><h1 style="margin:6px 0">Forja</h1>
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
  if (!api.user() || (!force && Date.now() - lastSync < 3 * 60_000)) return;
  lastSync = Date.now();
  try {
    const sent = await api.flushOutbox().catch(() => 0);
    if (sent) { invalidate(); render(); toast(`Sincronizado lo que apuntaste sin conexión (${sent})`); }
    const icu = await api.fn('intervals-sync', { action: 'pull' }).catch(() => null);   // Apple Watch vía HealthFit + Intervals.icu
    if (icu?.activities) { invalidate('sessions', 'planned', 'readiness', 'changes', 'insights'); toast(`⌚ ${icu.activities} entreno${icu.activities > 1 ? 's' : ''} nuevo${icu.activities > 1 ? 's' : ''} del Apple Watch`, 5000); }
    if (icu?.prs?.length) toast(`🏆 Nuevo récord: ${icu.prs[0]}`, 6000);
    const inbox = await api.fn('process-inbox');
    const cal = await api.fn('calendar-sync', {}).catch(() => null);
    await api.fn('replan', { trigger: 'checkin' });
    if (inbox.prs?.length) toast(`🏆 Nuevo récord: ${inbox.prs[0]}`, 6000);
    else if (cal?.replanned) toast('Plan reorganizado con tu calendario');
    if (inbox.processed || cal?.replanned) { invalidate(); render(); }
  } catch (e) { console.warn('sync', e); }
}
window.addEventListener('online', () => backgroundSync(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') backgroundSync(); });

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
