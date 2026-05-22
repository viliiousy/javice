// ⚠️ IMPORTANT: config.js — 아래 CLIENT_ID를 반드시 교체해주세요!
// README.md 의 설정 가이드를 따라주세요.

const CONFIG = {
  // Google Cloud Console > API 및 서비스 > 사용자 인증 정보 > OAuth 2.0 클라이언트 ID
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com',

  // OAuth 스코프 (수정 불필요)
  SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' '),

  // 날씨 위치 (Open-Meteo 사용 — API 키 불필요!)
  WEATHER_LAT:  37.2636,
  WEATHER_LON:  127.0286,
  WEATHER_CITY: '수원',
};
