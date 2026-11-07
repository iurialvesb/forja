// Service worker: la app funciona sin conexión para consultar (caché de la interfaz) y recibe notificaciones.
const VERSION = 'forja-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/api.js', 'js/ui.js', 'js/screens.js', 'js/logbook.js', 'js/engine/logbook.js', 'js/engine/workoutText.js', 'js/engine/exercises.js', 'js/engine/photo.js', 'js/nutrition.js', 'js/profile.js', 'js/config.js', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;     // la API siempre va a la red
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
self.addEventListener('push', (e) => {
  let d = { title: 'Forja', body: '' }; try { d = e.data.json(); } catch { d.body = e.data ? e.data.text() : ''; }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => cs[0] ? cs[0].focus() : self.clients.openWindow('./'))); });
