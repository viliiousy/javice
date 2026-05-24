importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY',
  authDomain:        'javice-6b647.firebaseapp.com',
  projectId:         'javice-6b647',
  storageBucket:     'javice-6b647.firebasestorage.app',
  messagingSenderId: '651258693434',
  appId:             '1:651258693434:web:0dd3dea7b3d18e955bf203',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || '자비스', {
    body:    body  || '',
    icon:    icon  || '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data:    payload.data || {},
  });
});
