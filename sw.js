// sw.js — Service Worker (캐시만, FCM은 index.html에서 처리)

const CACHE = 'javice-v4';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(['/', '/index.html', '/css/style.css']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  if(e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// 푸시 수신 (FCM이 전달한 메시지)
self.addEventListener('push', e => {
  if(!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { notification: { title:'자비스', body: e.data.text() } }; }
  const { title, body, icon } = data.notification || data;
  e.waitUntil(
    self.registration.showNotification(title||'자비스', {
      body:    body||'',
      icon:    icon||'/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      vibrate: [200,100,200],
      data:    data.data||{},
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true })
      .then(cls => {
        const found = cls.find(c => c.url.includes(self.location.origin));
        if(found) found.focus();
        else clients.openWindow('/');
      })
  );
});

console.log('[SW] 로드됨');
