// js/config.js — 설정

const CONFIG = {
  GOOGLE_CLIENT_ID: '14470442015-uq9sskup7nq9uhirl1spthqvd53d48bh.apps.googleusercontent.com',

  SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' '),

  FIREBASE_DB_URL: 'https://javice-6b647-default-rtdb.asia-southeast1.firebasedatabase.app',

  WEATHER_LAT:  37.2636,
  WEATHER_LON:  127.0286,
  WEATHER_CITY: '수원',
};
