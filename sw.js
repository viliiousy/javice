// sw.js — Service Worker (캐시 + FCM 백그라운드 알림)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Firebase 초기화 (SW 내부)
firebase.initializeApp({
  apiKey:            'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY',
  authDomain:        'javice-6b647.firebaseapp.com',
  projectId:         'javice-6b647',
  storageBucket:     'javice-6b647.firebasestorage.app',
  messagingSenderId: '651258693434',
  appId:             '1:651258693434:web:0dd3dea7b3d18e955bf203',
});

const messaging = firebase.messaging();

// Firebase 백그라운드 메시지 처리 (앱이 닫혀 있거나 백그라운드일 때)
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Firebase 백그라운드 메시지 수신:', payload);
  const notification = payload.notification || {};
  const title = notification.title || payload.data?.title || '자비스';
  const body  = notification.body  || payload.data?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data:    payload.data || {},
    tag:     'javice-notification',
    renotify: true,
  });
});

const CACHE = 'javice-v5';

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

// 푸시 수신 (Firebase가 처리 못한 경우 폴백용)
self.addEventListener('push', e => {
  if(!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { notification: { title:'자비스', body: e.data.text() } }; }
  // Firebase SDK가 onBackgroundMessage로 처리하는 경우 'firebase-messaging-msg-type' 필드가 있음 → 중복 방지
  if(data['firebase-messaging-msg-type']) return;
  const notif = data.notification || {};
  const title = notif.title || data.title || '자비스';
  const body  = notif.body  || data.body  || '';
  const icon  = notif.icon  || '/icons/icon-192.png';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge:    '/icons/icon-192.png',
      vibrate:  [200, 100, 200],
      data:     data.data || {},
      tag:      'javice-notification',
      renotify: true,
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
