// api/delete-account.js — 계정 삭제 (App Store 심사 지침 5.1.1(v))
//
// 앱 안 '설정 › 보안·계정 › 계정 삭제' 가 부른다. 본인의 Firebase ID 토큰으로만 지울 수 있다.
// 지우는 것
//   /users/<uid>                Bashy 에 저장한 모든 기록(습관·식단·체크리스트·메모·인바디·설정·AI 키)
//   /fcm_tokens/<uid>           알림 기기 등록
//   /econ_prices/<uid>          경제 시세 캐시
//   /google_refresh/<구글 sub>   서버에 보관한 구글 연결(리프레시 토큰) — 구글에도 폐기 요청
//   Firebase 로그인 계정 자체
// 지우지 않는 것: 사용자 본인의 구글 캘린더·구글 할 일(구글 계정에 있는 사용자 소유 데이터)

const { cors } = require('../lib/cors');
const { tfetch } = require('../lib/http');   // 바깥 호출 시간 제한 (lib/http.js)
const { fbFetch, fbGet } = require('../lib/fb-admin');

const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY';
const UID_RE = /^[A-Za-z0-9]{20,64}$/;
const SUB_RE = /^[0-9]{5,40}$/;

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

async function lookup(idToken) {
  const r = await tfetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
  if (!r.ok) return null;
  const u = ((await r.json().catch(() => ({}))).users || [])[0];
  if (!u || !u.localId) return null;
  const g = (u.providerUserInfo || []).find(p => p.providerId === 'google.com');
  return { uid: String(u.localId), sub: g && g.rawId ? String(g.rawId) : null };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const { idToken } = await readBody(req);
  const who = idToken ? await lookup(idToken) : null;
  if (!who || !UID_RE.test(who.uid)) { res.status(401).json({ error: '다시 로그인한 뒤 시도해 주세요' }); return; }

  const done = [], failed = [];
  const del = async (path) => {
    try { const r = await fbFetch(path, { method: 'DELETE' }); (r.ok ? done : failed).push(path); }
    catch (e) { failed.push(path); }
  };

  await del(`/users/${who.uid}.json`);
  await del(`/fcm_tokens/${who.uid}.json`);
  await del(`/econ_prices/${who.uid}.json`);

  if (who.sub && SUB_RE.test(who.sub)) {
    try {
      const v = await fbGet(`/google_refresh/${who.sub}.json`);
      if (v && v.rt) await tfetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: v.rt }) });
    } catch (e) {}
    await del(`/google_refresh/${who.sub}.json`);
  }

  // 마지막으로 로그인 계정 자체 (본인 토큰으로 지운다)
  let authDeleted = false;
  try {
    const r = await tfetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    authDeleted = r.ok;
  } catch (e) {}

  res.status(failed.length ? 500 : 200).json({ ok: !failed.length, authDeleted, removed: done.length, failed: failed.length });
};
