// ── APEX Service Worker v22 ───────────────────────────────────
// v22: Fix notifications — use showTrigger (TimestampTrigger) au lieu de
// setTimeout qui meurt quand le SW s'endort. Fallback via postMessage pour test immédiat.

const CACHE_NAME = 'apex-v22';
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
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});

// ── Notifications ─────────────────────────────────────────────
// SHOW_NOTIF_AT : timestamp précis — survit à l'endormissement du SW
// SHOW_NOTIF   : delay ms — pour test immédiat uniquement (SW peut mourir)
self.addEventListener('message', async e => {

  // ── Notification programmée avec timestamp (robuste) ─────
  if (e.data?.type === 'SHOW_NOTIF_AT') {
    const { title, body, tag, timestamp } = e.data;
    const options = {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: tag || 'apex',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { timestamp },
    };

    // Utilise showTrigger si disponible (Chrome Android 80+)
    if ('showTrigger' in Notification.prototype || typeof TimestampTrigger !== 'undefined') {
      try {
        options.showTrigger = new TimestampTrigger(timestamp);
        await self.registration.showNotification(title, options);
        return;
      } catch (err) {
        // Fallback ci-dessous
      }
    }

    // Fallback : setTimeout (fonctionne si l'app reste ouverte)
    const delay = timestamp - Date.now();
    if (delay > 0) {
      setTimeout(() => {
        self.registration.showNotification(title, options);
      }, delay);
    } else {
      self.registration.showNotification(title, options);
    }
    return;
  }

  // ── Notification immédiate / test (délai court en ms) ────
  if (e.data?.type === 'SHOW_NOTIF') {
    const { title, body, tag, delay } = e.data;
    const options = {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: tag || 'apex',
      renotify: true,
      vibrate: [200, 100, 200],
    };
    if (delay && delay > 0) {
      setTimeout(() => self.registration.showNotification(title, options), delay);
    } else {
      self.registration.showNotification(title, options);
    }
    return;
  }

  // ── Annuler toutes les notifs programmées ─────────────────
  if (e.data?.type === 'CANCEL_ALL') {
    try {
      const scheduled = await self.registration.getNotifications({ includeTriggered: true });
      scheduled.forEach(n => n.close());
    } catch (err) {}
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) clients[0].focus();
      else self.clients.openWindow('./');
    })
  );
});
