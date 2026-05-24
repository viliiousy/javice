// sw.js — Service Worker (캐시 + FCM 백그라운드 알림 통합)

// Firebase compat SDK 임포트
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Firebase 초기화
firebase.initializeApp({
  apiKey:            'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY',
  authDomain:        'javice-6b647.firebaseapp.com',
  projectId:         'javice-6b647',
  storageBucket:     'javice-6b647.firebasestorage.app',
  messagingSenderId: '651258693434',
  appId:             '1:651258693434:web:0dd3dea7b3d18e955bf203',
});

const messaging = firebase.messaging();

// 백그라운드 푸시 수신
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] 백그라운드 메시지:', payload);
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || '자비스', {
    body:    body  || '',
    icon:    icon  || '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data:    payload.data || {},
  });
});

// ── 캐시 ──────────────────────────────
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
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// 알림 클릭
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(cls => {
      const found = cls.find(c => c.url.includes(self.location.origin));
      if(found) { found.focus(); }
      else clients.openWindow('/');
    })
  );
});
