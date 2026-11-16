const V = 'fd-v1';
const META = 'fd-meta';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'data/index.js'])).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V && k !== META).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, so a new day's file always shows up. Cache is the offline fallback.
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      const cp = res.clone();
      caches.open(V).then(c => c.put(r, cp));
      return res;
    }).catch(() => caches.match(r).then(m => m || caches.match('index.html')))
  );
});

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'settings') {
    e.waitUntil(caches.open(META).then(c => c.put('settings', new Response(JSON.stringify({ remind: d.remind, time: d.time })))));
  }
});

function localKey(n) {
  const p = x => String(x).padStart(2, '0');
  return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate());
}

async function maybeNotify() {
  const c = await caches.open(META);
  const sr = await c.match('settings');
  if (!sr) return;
  const s = await sr.json();
  if (!s.remind) return;
  const now = new Date();
  const a = (s.time || '08:00').split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < a[0] * 60 + a[1]) return;
  const k = localKey(now);
  const nr = await c.match('notified');
  if (nr && (await nr.text()) === k) return;
  await c.put('notified', new Response(k));
  const title = 'Finance Daily, ' + now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  await self.registration.showNotification(title, {
    body: 'Your daily brief is ready. About 3 minutes.',
    icon: 'icon-192.png',
    tag: 'fd-' + k
  });
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-brief') e.waitUntil(maybeNotify());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('./');
    })
  );
});
