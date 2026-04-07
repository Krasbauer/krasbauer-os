const CACHE_NAME = 'krasbauer-os-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((resp) => {
        if (resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});

// Notification click: open/focus app and route to task
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if (action === 'done' && data.taskId) {
            client.postMessage({ type: 'MARK_DONE', taskId: data.taskId });
          } else if (data.taskId) {
            client.postMessage({ type: 'OPEN_TASK', taskId: data.taskId });
          } else if (data.action) {
            client.postMessage({ type: data.action });
          }
          return;
        }
      }
      return self.clients.openWindow('/');
    })
  );
});

// Message handler: show notification on demand from app
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = payload;
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: tag || 'kos-alarm',
      data: data || {},
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: data && data.taskId ? [
        { action: 'done', title: '✓ Done' }
      ] : []
    });
  }
});
