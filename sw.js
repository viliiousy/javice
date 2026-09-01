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

// ── 알림을 띄우는 곳은 여기 하나뿐이다 ─────────────────────
// 예전에는 onBackgroundMessage 와 push 리스너가 각자 showNotification 을 불렀다.
// 중복을 막는다고 둔 검사(`data['firebase-messaging-msg-type']`)는 FCM v1 이 실제로
// 보내는 모양에 그런 칸이 없어서 한 번도 걸린 적이 없다. 그래서 둘 다 띄웠다.
//
// tag 를 slot 으로 준다. 예전엔 모두 'javice-notification' 한 개였는데 그건 양쪽으로 틀렸다 —
// 같은 알림이 두 번 와도 안 합쳐질 이유가 없고(다른 경로로 오면 태그가 달랐다),
// 습관 알림과 약 알림처럼 서로 다른 알림은 오히려 서로를 덮어썼다.
// slot 을 태그로 쓰면 같은 것끼리만 합쳐지고 다른 것끼리는 나란히 남는다.
const shown = new Map();          // slot|본문 → 마지막으로 띄운 시각
function show(title, body, slot, data) {
  const key = (slot || '') + '|' + (title || '') + '|' + (body || '');
  const now = Date.now();
  // 같은 알림이 몇 초 사이에 또 들어오면 무시한다. 태그만으로는 소리·진동이 다시 울린다.
  if (now - (shown.get(key) || 0) < 60000) {
    console.log('[SW] 같은 알림이 방금 왔다 — 건너뜀:', key);
    return Promise.resolve();
  }
  shown.set(key, now);
  if (shown.size > 50) for (const [k, t] of shown) if (now - t > 3600000) shown.delete(k);
  return self.registration.showNotification(title || '자비스', {
    body:    body || '',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data:    data || {},
    tag:     slot || 'javice-notification',
    renotify: false,
  });
}

// Firebase 백그라운드 메시지 처리 (앱이 닫혀 있거나 백그라운드일 때)
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Firebase 백그라운드 메시지 수신:', payload);
  const d = payload.data || {};
  const n = payload.notification || {};
  show(n.title || d.title, n.body || d.body, d.slot, d);
});

const CACHE = 'javice-v6';

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

// 푸시 수신 — Firebase SDK 가 못 읽고 지나간 경우의 폴백.
// 위 onBackgroundMessage 와 같은 show() 를 부르므로, 둘 다 불려도 한 번만 뜬다.
self.addEventListener('push', e => {
  if(!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { data:{ title:'자비스', body:e.data.text() } }; }
  const d = data.data || {};
  const n = data.notification || {};
  e.waitUntil(show(n.title || d.title || data.title,
                   n.body  || d.body  || data.body,
                   d.slot  || data.slot, d));
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
