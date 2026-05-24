importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  projectId:       'javice-6b647',
  messagingSenderId: '651258693434',
  appId:           'javice-web',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || '자비스', {
    body:  body || '',
    icon:  icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data:  payload.data || {},
  });
});
