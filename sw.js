/* ══════════════════════════════════════════════════════════════════════════
   Nexus Chat – Service Worker
   ──────────────────────────────────────────────────────────────────────────
   Aufgaben:
     1. App-Hülle offline verfügbar machen (Cache-First für lokale Dateien,
        Network-First für die Seite selbst, damit Updates ankommen).
     2. Echte System-Benachrichtigungen anzeigen – auch wenn der Tab im
        Hintergrund oder geschlossen ist (Android; iOS 16.4+ nur als
        installierte PWA).
     3. Klick auf die Benachrichtigung öffnet die App im richtigen Raum.
     4. App-Badge (Punkt am Icon) mit der Anzahl ungelesener Nachrichten.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const VERSION = '1.0.0';
const CACHE = 'nexus-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'games.js',
  'qr.js',
  'vendor/qrcode.js',
  'vendor/mqtt.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/badge-72.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Einzeln cachen: eine fehlende Datei darf die Installation nicht kippen.
    await Promise.all(SHELL.map(async (u) => {
      try { await cache.add(new Request(u, { cache: 'reload' })); } catch (err) { /* optional */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (err) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // CDNs/Broker nicht anfassen

  // Die Seite selbst: erst Netz (Updates!), sonst Cache (offline).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match('index.html')) || (await cache.match('./')) ||
          new Response('<h1>Nexus Chat</h1><p>Offline – bitte später erneut versuchen.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Alles andere lokal: aus dem Cache, im Hintergrund aktualisieren.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504, statusText: 'offline' });
  })());
});

/* ── Nachrichten aus der Seite ─────────────────────────────────────────── */
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'skip-waiting') { self.skipWaiting(); return; }
  if (d.type === 'notify') { showNote(d); return; }
  if (d.type === 'badge') {
    try {
      if (d.n > 0 && navigator.setAppBadge) navigator.setAppBadge(d.n);
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch (err) {}
  }
  if (d.type === 'ping') {
    (e.source || {}).postMessage && e.source.postMessage({ type: 'pong', version: VERSION });
  }
});

async function showNote(d) {
  const title = d.title || 'Nexus Chat';
  const opts = {
    body: d.body || '',
    tag: d.tag || ('nexus-' + Date.now()),
    renotify: !!d.tag,
    icon: d.icon || 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    lang: 'de',
    dir: 'ltr',
    vibrate: d.silent ? undefined : [40, 60, 40],
    silent: !!d.silent,
    data: { room: d.room || null, url: d.url || './index.html', ts: Date.now() },
    actions: d.room ? [{ action: 'open', title: 'Raum öffnen' }] : [{ action: 'open', title: 'Öffnen' }],
  };
  try { await self.registration.showNotification(title, opts); } catch (err) {}
}

/* ── Klick auf die Benachrichtigung ───────────────────────────────────── */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const room = e.notification.data && e.notification.data.room;
  const target = self.registration.scope;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.indexOf(target) === 0) {
        try { await c.focus(); } catch (err) {}
        if (room) c.postMessage({ type: 'open-room', room });
        return;
      }
    }
    const url = room ? (target + 'index.html?room=' + encodeURIComponent(room)) : target;
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

self.addEventListener('notificationclose', () => {});

/* ── Echte Push-Nachrichten (Zukunft: eigener Push-Server) ────────────── */
self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (err) { payload = { body: e.data && e.data.text() }; }
  e.waitUntil(showNote(payload));
});

/* ── Hintergrund-Sync: wartende Nachrichten später senden ─────────────── */
self.addEventListener('sync', (e) => {
  if (e.tag === 'nexus-outbox') {
    e.waitUntil((async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach((c) => c.postMessage({ type: 'flush-outbox' }));
    })());
  }
});
