// Service worker: makes 9rayaverse installable and keeps the app shell available offline.
// Network-first for everything (always fresh when online); the API and uploads are never cached.
const CACHE = 'rayaverse-v8';
const SHELL = [
  './', 'index.html', 'app.html', 'room.html', 'offline.html',
  'assets/css/style.css',
  'assets/js/common.js', 'assets/js/avatar.js', 'assets/js/focus.js', 'assets/js/study.js', 'assets/js/bac-data.js', 'assets/js/app.js', 'assets/js/room.js', 'assets/js/room3d.js', 'assets/js/ambience.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Notifications sent by ws-server/push.js
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || '9rayaverse', {
    body: data.body || '',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/favicon-32.png',
    data: { url: data.url || '' },
    tag: data.tag || undefined,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // The site address changes on every start, so links usually point to the permanent GitHub link.
  const url = e.notification.data && e.notification.data.url ? e.notification.data.url : self.registration.scope + 'app.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open && !e.notification.data.url) return open.focus();
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.includes('/uploads/')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('offline.html') : Response.error()))
  );
});
