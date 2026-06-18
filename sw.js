// ── APEX Service Worker v21 ───────────────────────────────────
const CACHE_NAME = 'apex-v21';
const ASSETS = [
  './', './index.html', './main.css',
  './db.js', './utils.js', './app.js',
  './workout.js', './medocs.js', './orders.js',
  './catalogue.js', './clients.js', './protocoles.js',
  './finances.js', './todos.js', './divers.js',
  './mood.js', './weight.js', './recap.js',
  './notifs.js',
  './vault.js',
  './tiktok.js', './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Bug 2b fix: Network First strategy — always try network, fall back to cache
  // This ensures updates on Vercel are reflected immediately
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache the fresh response for offline use
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});

// ── Notification triggered by main thread via postMessage ─────
self.addEventListener('message', e => {
  if (e.data?.type === 'SHOW_NOTIF') {
    const { title, body, tag, icon, delay } = e.data;
    if (delay && delay > 0) {
      setTimeout(() => {
        self.registration.showNotification(title, {
          body,
          icon: icon || './icon-192.png',
          badge: './icon-192.png',
          tag: tag || 'apex',
          renotify: true,
          vibrate: [200, 100, 200],
        });
      }, delay);
    } else {
      self.registration.showNotification(title, {
        body,
        icon: icon || './icon-192.png',
        badge: './icon-192.png',
        tag: tag || 'apex',
        renotify: true,
        vibrate: [200, 100, 200],
      });
    }
  }

  // Cancel all pending (can't cancel setTimeout in SW but tag reuse handles dedup)
  if (e.data?.type === 'CANCEL_ALL') {
    // Tags will be overwritten on next schedule
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow('./');
      }
    })
  );
});
