// lib/fb-admin.js — 서비스 계정으로 Realtime Database에 인증된 요청을 보낸다.
// DB 규칙을 사용자별로 잠근 뒤에도 서버(크론·구독 API)는 관리자 자격으로 접근해야 하므로 필요하다.

const crypto = require('crypto');

let _cache = { token: null, exp: 0 };

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 없습니다');
  let sa;
  try {
    sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT가 올바른 JSON이 아닙니다');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT에 client_email/private_key가 없습니다');
  }
  return sa;
}

// 서비스 계정 JWT → OAuth 액세스 토큰 (1시간 캐시)
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_cache.token && _cache.exp - 60 > now) return _cache.token;

  const sa    = serviceAccount();
  const scope = [
    'https://www.googleapis.com/auth/firebase.database',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim  = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope,
    aud:  'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  // 환경변수에 넣는 방식에 따라 개행이 \n 문자열로 남아 있을 수 있다
  const key = sa.private_key.includes('\n') ? sa.private_key : sa.private_key.replace(/\\n/g, '\n');
  const sig = signer.sign(key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${header}.${claim}.${sig}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`액세스 토큰 발급 실패 ${res.status}: ${(data.error_description || data.error || '')}`);
  }
  _cache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return _cache.token;
}

// 인증된 RTDB REST 요청
async function fbFetch(path, opts = {}) {
  const token = await getAccessToken();
  const base  = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
  const sep   = path.includes('?') ? '&' : '?';
  return fetch(`${base}${path}${sep}access_token=${encodeURIComponent(token)}`, opts);
}

// 실패를 조용히 null로 삼키지 않는다 (예전에 이 때문에 문제를 오래 못 봤다)
async function fbGet(path) {
  const res = await fbFetch(path);
  if (!res.ok) throw new Error(`RTDB GET ${path} → HTTP ${res.status}`);
  return res.json();
}

module.exports = { getAccessToken, fbFetch, fbGet };
