// lib/google-oauth.js — 구글 리프레시 토큰 보관·액세스 토큰 발급
//
// 브라우저만으로는 액세스 토큰(1시간)밖에 못 가진다. 갱신하려면 GIS 팝업을 다시 띄워야 하는데
// 팝업 차단·서드파티 쿠키 제한에 걸려 조용히 로그아웃되는 일이 있었다.
// 리프레시 토큰을 서버에 두면 팝업 없이 갱신되고, 앱을 열지 않아도 크론이 캘린더를 읽을 수 있다.
//
// 보관 위치: RTDB `/google_refresh/<구글 sub>`
//   이 경로에는 보안 규칙이 없다 → 클라이언트는 기본 거부. 서비스 계정만 읽고 쓴다.
//   리프레시 토큰 자체는 절대 브라우저로 돌려보내지 않는다.

const { fbFetch, fbGet } = require('./fb-admin');

// 클라이언트 ID와 Firebase API 키는 이미 js/config.js 에 공개된 값이라 상수로 둔다. 시크릿만 환경변수.
const CLIENT_ID    = process.env.GOOGLE_CLIENT_ID
  || '14470442015-llsapdnno92lbe2mblvqu1ihd4ccpms6.apps.googleusercontent.com';
const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://bashy.app';
const TOKEN_URL    = 'https://oauth2.googleapis.com/token';

function clientSecret() {
  const s = process.env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error('GOOGLE_CLIENT_SECRET 환경변수가 없습니다');
  return s;
}

async function postToken(params) {
  const res  = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// 구글 토큰 엔드포인트에서 직접(HTTPS로) 받은 id_token은 서명 검증 없이 payload를 읽어도 된다
// — 구글 문서가 명시한 예외다. 브라우저를 거쳐 온 토큰이라면 반드시 검증해야 한다.
function readIdToken(idToken) {
  try {
    return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64').toString('utf8'));
  } catch { return null; }
}

// Firebase ID 토큰을 검증하고 그 사용자의 구글 sub를 얻는다.
// RS256 검증을 직접 구현하는 대신 Identity Toolkit에 물어본다 — 검증과 조회가 한 번에 끝난다.
async function googleSubFromFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }) });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const user = (data.users || [])[0];
  if (!user) return null;
  const g = (user.providerUserInfo || []).find(p => p.providerId === 'google.com');
  return g && g.rawId ? String(g.rawId) : null;
}

const RT_PATH = sub => `/google_refresh/${sub}.json`;

async function loadRefresh(sub) {
  const v = await fbGet(RT_PATH(sub));
  return v && v.rt ? v : null;
}

async function saveRefresh(sub, rt, scope, email) {
  const res = await fbFetch(RT_PATH(sub), {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ rt, scope: scope || '', email: email || '', savedAt: Date.now() }),
  });
  if (!res.ok) throw new Error(`리프레시 토큰 저장 실패 ${res.status}`);
}

async function dropRefresh(sub) {
  await fbFetch(RT_PATH(sub), { method: 'DELETE' });
}

// 인증 코드 → 액세스 토큰(+ 가능하면 리프레시 토큰 저장). 저장 위치는 같은 응답의 id_token에서
// 뽑은 sub이므로, 유효한 코드를 가진 사람도 남의 자리에는 쓸 수 없다.
async function exchangeCode(code) {
  const { ok, data } = await postToken({
    grant_type:    'authorization_code',
    code,
    client_id:     CLIENT_ID,
    client_secret: clientSecret(),
    redirect_uri:  REDIRECT_URI,
  });
  if (!ok || !data.access_token) {
    return { error: data.error_description || data.error || '코드 교환 실패' };
  }
  const claims = readIdToken(data.id_token || '');
  if (!claims || !claims.sub) return { error: 'id_token에서 sub를 읽지 못했습니다' };

  // 리프레시 토큰은 동의를 새로 받을 때(prompt=consent)만 내려온다
  if (data.refresh_token) await saveRefresh(claims.sub, data.refresh_token, data.scope, claims.email);

  return {
    sub:          claims.sub,
    access_token: data.access_token,
    expires_in:   data.expires_in || 3600,
    scope:        data.scope || '',
    saved:        !!data.refresh_token,
  };
}

// 저장된 리프레시 토큰으로 액세스 토큰을 발급한다. 크론도 이걸 쓴다.
async function accessTokenFor(sub) {
  const rec = await loadRefresh(sub);
  if (!rec) return { needConsent: true };

  const { ok, data } = await postToken({
    grant_type:    'refresh_token',
    refresh_token: rec.rt,
    client_id:     CLIENT_ID,
    client_secret: clientSecret(),
  });

  if (!ok || !data.access_token) {
    // 사용자가 권한을 철회했거나 토큰이 폐기됨 → 쓸모없는 값을 남겨두지 않는다
    if (data.error === 'invalid_grant') {
      await dropRefresh(sub);
      return { needConsent: true, reason: 'invalid_grant' };
    }
    throw new Error(`토큰 갱신 실패: ${data.error_description || data.error || 'unknown'}`);
  }
  return {
    access_token: data.access_token,
    expires_in:   data.expires_in || 3600,
    scope:        data.scope || rec.scope || '',
  };
}

module.exports = {
  exchangeCode, accessTokenFor, loadRefresh, dropRefresh,
  googleSubFromFirebaseIdToken, CLIENT_ID, REDIRECT_URI,
};
