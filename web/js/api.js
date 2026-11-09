// Cliente mínimo de Supabase (Auth + PostgREST + Storage + Edge Functions) sin dependencias.
const CFG = window.FORJA_CONFIG || {};
const URL_ = (CFG.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = CFG.SUPABASE_ANON_KEY || '';
const LS = 'forja.session';

export const configured = () => !!URL_ && !URL_.includes('TU-PROYECTO') && !!KEY && KEY !== 'TU_ANON_KEY';

let session = null;
try { session = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { session = null; }
const save = (s) => { session = s; try { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); } catch { /* modo privado */ } };

export const user = () => session?.user ?? null;
export const userId = () => session?.user?.id ?? null;

async function authFetch(path, body) {
  const r = await fetch(`${URL_}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(translateAuth(j.error_description || j.msg || j.message || j.error || `Error ${r.status}`));
  return j;
}
function translateAuth(m) {
  if (/invalid login/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Confirma tu email (revisa tu bandeja de entrada) y vuelve a entrar.';
  if (/already registered/i.test(m)) return 'Ya existe una cuenta con ese email.';
  if (/password/i.test(m) && /6/.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  return m;
}
const withExpiry = (j) => ({ ...j, expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600) });

export async function signIn(email, password) { save(withExpiry(await authFetch('token?grant_type=password', { email, password }))); }
export async function signUp(email, password) {
  const j = await authFetch('signup', { email, password });
  if (j.access_token) save(withExpiry(j));
  return !!j.access_token;   // false → hay que confirmar el email
}
export async function signOut() {
  try { await fetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${session?.access_token}` } }); } catch { /* sin conexión */ }
  save(null);
}
async function token() {
  if (!session) throw new Error('Inicia sesión');
  if (session.expires_at - 60 < Date.now() / 1000) {
    try { save(withExpiry(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token }))); }
    catch (e) {
      if (e instanceof TypeError || !navigator.onLine) throw offlineError();   // sin conexión: no cierres la sesión
      save(null); throw new Error('Tu sesión ha caducado. Vuelve a entrar.');
    }
  }
  return session.access_token;
}
const headers = async (extra = {}) => ({ apikey: KEY, Authorization: `Bearer ${await token()}`, ...extra });

// ---------- PostgREST ----------
const qs = (params) => Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

// ---------- Sin conexión: copia local de lo último leído + cola de cambios ----------
const offlineError = () => Object.assign(new Error('Sin conexión: te enseño lo último guardado en el móvil.'), { offline: true });
const isNet = (e) => e instanceof TypeError || e?.offline;
async function cachePut(key, data) { try { const c = await caches.open('forja-data'); await c.put(new Request(`https://forja.local/${encodeURIComponent(key)}`), new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })); } catch { /* sin Cache API */ } }
async function cacheGet(key) { try { const c = await caches.open('forja-data'); const r = await c.match(new Request(`https://forja.local/${encodeURIComponent(key)}`)); return r ? await r.json() : undefined; } catch { return undefined; } }
export let offline = false;
const setOffline = (v) => { if (offline !== v) { offline = v; document.documentElement.classList.toggle('offline', v); } };

async function rest(method, table, opts = {}) {
  if (method !== 'GET') return restNet(method, table, opts);
  const key = `rest:${table}?${qs(opts.query ?? {})}`;
  try { const j = await restNet(method, table, opts); setOffline(false); cachePut(key, j); return j; }
  catch (e) { if (!isNet(e)) throw e; const c = await cacheGet(key); setOffline(true); if (c !== undefined) return c; throw offlineError(); }
}
async function restNet(method, table, { query = {}, body, prefer } = {}) {
  const r = await fetch(`${URL_}/rest/v1/${table}${Object.keys(query).length ? '?' + qs(query) : ''}`, {
    method, headers: await headers({ 'content-type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }), body: body != null ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || `Error ${r.status} en ${table}`);
  return j;
}

/** db.select('goals', { status: 'eq.active', order: 'date' }) */
export const db = {
  select: (table, query = {}) => rest('GET', table, { query: { select: '*', ...query } }),
  insert: (table, rows) => rest('POST', table, { body: rows, prefer: 'return=representation' }),
  upsert: (table, rows, onConflict) => rest('POST', table, { body: rows, query: onConflict ? { on_conflict: onConflict } : {}, prefer: 'return=representation,resolution=merge-duplicates' }),
  update: (table, patch, query) => rest('PATCH', table, { body: patch, query, prefer: 'return=representation' }),
  remove: (table, query) => rest('DELETE', table, { query }),
};

// ---------- Edge Functions ----------
const READ_FNS = new Set(['nutrition-day', 'insights', 'goal', 'weekly', 'shopping-list']);
const isRead = (name, body) => READ_FNS.has(name) && (!body.action || ['build', 'latest'].includes(body.action));
export async function fn(name, body = {}) {
  if (!isRead(name, body)) return fnNet(name, body);
  const key = `fn:${name}:${JSON.stringify(body)}`;
  try { const j = await fnNet(name, body); setOffline(false); cachePut(key, j); return j; }
  catch (e) { if (!isNet(e)) throw e; const c = await cacheGet(key); setOffline(true); if (c !== undefined) return c; throw offlineError(); }
}

/** Cambios que pueden esperar a tener conexión (guardar un entreno, marcar una comida): si no hay red, se encolan. */
const OUTBOX = 'forja:outbox';
const readBox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; } };
const writeBox = (b) => { try { localStorage.setItem(OUTBOX, JSON.stringify(b)); } catch { /* */ } };
export const pendingCount = () => readBox().length;
export async function fnQueued(name, body = {}) {
  try { return await fnNet(name, body); }
  catch (e) { if (!isNet(e)) throw e; writeBox([...readBox(), { name, body, at: Date.now() }]); setOffline(true); return { queued: true }; }
}
export async function flushOutbox() {
  const box = readBox(); if (!box.length) return 0;
  let sent = 0; const keep = [];
  for (const it of box) {
    try { await fnNet(it.name, it.body); sent++; }
    catch (e) { if (isNet(e)) { keep.push(it); } else console.warn('outbox', it.name, e.message); }
  }
  writeBox(keep); if (sent) setOffline(false);
  return sent;
}

async function fnNet(name, body = {}) {
  const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: await headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  const j = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) { const e = new Error(j?.error || (r.status === 504 || r.status === 546 ? 'El servidor ha tardado demasiado (la IA estaba lenta). Vuelve a intentarlo.' : `Error ${r.status}`)); e.status = r.status; e.data = j; throw e; }
  return j;
}
export async function fnRaw(name) {
  const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'GET', headers: await headers() });
  if (!r.ok) throw new Error(`Error ${r.status}`);
  return r.blob();
}

// ---------- Storage (fotos) ----------
export async function uploadPhoto(blob, ext = 'jpg') {
  const path = `${userId()}/${crypto.randomUUID()}.${ext}`;
  const r = await fetch(`${URL_}/storage/v1/object/workout-photos/${path}`, { method: 'POST', headers: await headers({ 'content-type': blob.type || 'image/jpeg', 'x-upsert': 'false' }), body: blob });
  if (!r.ok) throw new Error('No se pudo subir la foto');
  return path;
}

export const baseUrl = () => URL_;
