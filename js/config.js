// js/config.js — 설정
// ⚠️ GOOGLE_CLIENT_ID 를 본인 것으로 교체하세요

const CONFIG = {
  GOOGLE_CLIENT_ID: '14470442015-uq9sskup7nq9uhirl1spthqvd53d48bh.apps.googleusercontent.com',

  // drive.appdata 제거 (Drive API 활성화 후 다시 추가)
  SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' '),

  WEATHER_LAT:  37.2636,
  WEATHER_LON:  127.0286,
  WEATHER_CITY: '수원',
};
