const CONFIG = {
  GOOGLE_CLIENT_ID: '14470442015-llsapdnno92lbe2mblvqu1ihd4ccpms6.apps.googleusercontent.com',
  // 아이폰 앱 전용 구글 OAuth 클라이언트(종류: iOS). 앱 안에서는 웹 로그인 창을 구글이 막아서 이걸 쓴다.
  // 비워 두면 앱에서 로그인 단추가 안내만 띄운다. 웹에는 영향이 없다.
  GOOGLE_IOS_CLIENT_ID: '',
  SCOPES: ['https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/tasks','https://www.googleapis.com/auth/userinfo.profile','https://www.googleapis.com/auth/userinfo.email'].join(' '),
  FIREBASE_DB_URL: 'https://javice-6b647-default-rtdb.asia-southeast1.firebasedatabase.app',
  FCM_VAPID_KEY: 'BKHZRZwM-qdvXG2sUOh6Rw43Cs9wymweCDxhr_wyHLNr9oDG8bY9ijxvZhVjigqsTBQ3OJQ0KykbMhwyH6CYDeI',
  FIREBASE_CONFIG: {
    apiKey:            'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY',
    authDomain:        'javice-6b647.firebaseapp.com',
    databaseURL:       'https://javice-6b647-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId:         'javice-6b647',
    storageBucket:     'javice-6b647.firebasestorage.app',
    messagingSenderId: '651258693434',
    appId:             '1:651258693434:web:0dd3dea7b3d18e955bf203',
    measurementId:     'G-0ERL64J5ZZ',
  },
  WEATHER_LAT: 37.2636, WEATHER_LON: 127.0286, WEATHER_CITY: '수원',
};
