// sw.js — Service Worker (정적 파일 캐싱)
const CACHE = 'godlife-v1';
const STATIC = ['./', './index.html', './css/style.css',
  './js/config.js', './js/google-auth.js', './js/google-calendar.js',
  './js/google-tasks.js', './js/calendar-ui.js', './js/weather.js',
  './js/fitness.js', './js/diet.js', './js/habits.js', './js/app.js'];

self.addEventListener('install',  e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return; // 외부 API는 캐시 안 함
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
