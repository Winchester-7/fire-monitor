// Fire Monitor service worker: shows push notifications, keeps history, caches the app.
const CACHE = 'fm-v2';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'site.enc', 'bg.jpg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // relay requests go to network
  // network first (fresh app), cache as fallback (works offline)
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});

function idb() { return new Promise((res, rej) => { const r = indexedDB.open('firemon', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('events', {keyPath: 'id'}); d.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function store(ev) { try { const d = await idb(); await new Promise(r => { const t = d.transaction('events', 'readwrite'); t.objectStore('events').put(ev); t.oncomplete = r; t.onerror = r; }); } catch (e) {} }

self.addEventListener('push', e => {
  let ev = {};
  try { ev = e.data.json(); } catch (x) { ev = {t: 'event', id: 'p' + Date.now(), ts: Date.now(), level: 'info', title: 'Fire Monitor', body: e.data ? e.data.text() : ''}; }
  const urgent = ['fire', 'attention', 'alarm'].includes(ev.level) && !ev.cleared;
  const tag = ev.test ? 'test' : (ev.guid || ('z' + (ev.zoneNo || ''))) + (ev.cleared ? '-c' : '');
  e.waitUntil((async () => {
    await store(ev);
    await self.registration.showNotification(ev.title || 'Fire Monitor', {
      body: ev.body || '', tag, renotify: true, requireInteraction: urgent, icon: 'icons/icon-192.png', badge: 'icons/icon-96.png',
      data: {id: ev.id}, vibrate: urgent ? [400, 150, 400, 150, 800] : [200], silent: false,
    });
    const cs = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    cs.forEach(c => c.postMessage({type: 'event', ev}));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    if (cs.length) { cs[0].postMessage({type: 'event'}); return cs[0].focus(); }
    return self.clients.openWindow('./');
  })());
});
