// lib/fcm.js — FCM HTTP v1 발송 (api/cron-notify.js · api/test-push.js 가 같이 쓴다)
//
// 예전에는 두 파일이 같은 코드를 따로 들고 있었고, 둘 다
//   · 메시지 한 건마다 OAuth 토큰을 새로 받았다(기기 3대 × 알림 4개면 토큰 요청 12번)
//   · https.request 에 시간 제한이 없었다
//   · 토큰 응답 파싱을 콜백 안에서 해서, 구글이 HTML 오류를 주면 잡히지 않는 예외로 함수가 죽었다
// 여기 한 군데로 모으고 토큰은 만료 1분 전까지 재사용한다.

const crypto = require('crypto');
const { tfetch } = require('./http');

let _tok = { token: null, exp: 0 };
let _pending = null;   // 같은 순간에 여러 건을 보내도(Promise.all) 토큰 요청은 한 번만

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT 없음');
  let sa;
  try { sa = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT가 올바른 JSON이 아닙니다'); }
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT에 client_email/private_key/project_id가 없습니다');
  }
  return sa;
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tok.token && _tok.exp - 60 > now) return _tok.token;
  if (!_pending) _pending = issue().finally(() => { _pending = null; });
  return _pending;
}

async function issue() {
  const now = Math.floor(Date.now() / 1000);
  const sa = serviceAccount();
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim  = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  // 환경변수에 넣는 방식에 따라 개행이 \n 문자열로 남아 있을 수 있다 (lib/fb-admin.js 와 같다)
  const key = sa.private_key.includes('\n') ? sa.private_key : sa.private_key.replace(/\\n/g, '\n');
  const jwt = `${header}.${claim}.${signer.sign(key, 'base64url')}`;
  const r = await tfetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const text = await r.text().catch(() => '');
  let j = null; try { j = JSON.parse(text); } catch {}
  if (!r.ok || !j || !j.access_token) throw new Error('토큰없음:' + text.slice(0, 200));
  _tok = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) };
  return _tok.token;
}

// message 는 FCM v1 의 message 객체 그대로. 결과는 { status, body(파싱한 JSON 또는 null), raw }.
// 네트워크 오류·시간 초과는 던지지 않고 status 0 으로 돌려준다 — 호출부가 기기별로 실패를 센다.
async function send(message) {
  const sa  = serviceAccount();
  const tok = await accessToken();
  try {
    const r = await tfetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ message }),
    });
    const raw = await r.text().catch(() => '');
    let body = null; try { body = JSON.parse(raw); } catch {}
    return { status: r.status, body, raw };
  } catch (e) {
    return { status: 0, body: null, raw: '', error: e.name === 'TimeoutError' ? '시간 초과' : e.message };
  }
}

module.exports = { accessToken, send };
