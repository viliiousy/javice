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
  self.registration.showNotification(title || 'Bashy', {
    // tag 를 준다. sw.js 와 이 파일은 서로 다른 서비스워커라 중복 장부를 공유할 수 없다 —
    // 둘 다 등록돼 있으면 같은 알림이 두 번 뜼는데, 같은 tag 면 뒤에 온 것이 앞을 덮어서 하나로 보인다.
    tag:      (payload.data && payload.data.slot) || 'javice-notification',
    renotify: false,
    body:    body  || '',
    icon:    icon  || '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data:    payload.data || {},
  });
});
