// Service worker: makes 9rayaverse installable and keeps the app shell available offline.
// Network-first for everything (always fresh when online); the API and uploads are never cached.
const CACHE = 'rayaverse-v1';
const SHELL = [
  './', 'index.html', 'app.html', 'room.html', 'offline.html',
  'assets/css/style.css',
  'assets/js/common.js', 'assets/js/avatar.js', 'assets/js/focus.js', 'assets/js/app.js', 'assets/js/room.js', 'assets/js/ambience.js',
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
