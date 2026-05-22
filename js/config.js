// js/config.js — 설정

const CONFIG = {
  // Google Cloud Console > OAuth 2.0 클라이언트 ID
  GOOGLE_CLIENT_ID: '14470442015-uq9sskup7nq9uhirl1spthqvd53d48bh.apps.googleusercontent.com',

  SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' '),

  WEATHER_LAT:  37.2636,
  WEATHER_LON:  127.0286,
  WEATHER_CITY: '수원',
};
