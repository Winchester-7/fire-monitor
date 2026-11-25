// Fire Monitor service worker: shows push notifications, keeps history, caches the app,
// puts the number of active alarms/malfunctions on the app icon.
const CACHE = 'fm-v3.1';
const SHELL = ['./', 'index.html', 'config.js', 'exits.js', 'manifest.webmanifest', 'site.enc', 'bg.jpg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
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
  const alarm = ['fire', 'attention', 'alarm'].includes(ev.level) && !ev.cleared && !ev.kind;
  // malfunctions, «Принял», sound off, reset: quiet (no sound, no vibration)
  const quiet = !alarm && !ev.test;
  const tag = ev.test ? 'test' : ev.kind ? ev.kind + '-' + ev.id : (ev.guid || ('z' + (ev.zoneNo || ''))) + (ev.cleared ? '-c' : '');
  e.waitUntil((async () => {
    await store(ev);
    await self.registration.showNotification(ev.title || 'Fire Monitor', {
      body: ev.body || '', tag, renotify: alarm, requireInteraction: alarm, icon: 'icons/icon-192.png', badge: 'icons/icon-96.png',
      data: {id: ev.id}, vibrate: alarm ? [400, 150, 400, 150, 800] : undefined, silent: quiet, timestamp: ev.ts || Date.now(),
    });
    if (ev.bld && self.navigator && 'setAppBadge' in self.navigator) {
      const n = (ev.bld.f || 0) + (ev.bld.a || 0) + (ev.bld.m || 0);
      try { n ? await self.navigator.setAppBadge(n) : await self.navigator.clearAppBadge(); } catch (x) {}
    }
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
