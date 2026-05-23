// sw.js — Service Worker (푸시 알림 + 캐시)

const CACHE = 'javice-v3';
const STATIC = ['/', '/index.html', '/css/style.css'];

// 설치
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// 활성화
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 네트워크 요청
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // API는 캐시 안 함
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// ── 푸시 알림 수신 ──────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { notification: { title: '자비스', body: e.data.text() } }; }

  const { title, body, icon, badge } = data.notification || data;
  const options = {
    body:    body || '',
    icon:    icon  || '/icons/icon-192.png',
    badge:   badge || '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data:    { url: '/', ...data.data },
    actions: [{ action: 'open', title: '열기' }],
  };

  e.waitUntil(self.registration.showNotification(title || '자비스', options));
});

// ── 알림 클릭 ───────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const found = cls.find(c => c.url.includes(self.location.origin));
      if (found) { found.focus(); found.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
