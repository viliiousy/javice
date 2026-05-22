// sw.js — Service Worker (정적 파일 캐싱)
const CACHE = 'godlife-v' + Date.now();
const STATIC = ['./', './index.html', './css/style.css',
  './js/config.js', './js/google-auth.js', './js/google-calendar.js',
  './js/google-tasks.js', './js/calendar-ui.js', './js/weather.js',
  './js/fitness.js', './js/diet.js', './js/habits.js', './js/app.js',
  './js/jarvis.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});