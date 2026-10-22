// api/subscribe.js — 기기별 알림 토큰 등록
//
// 예전에는 `/fcm_tokens/<uid> = { token, settings }` 로 토큰 칸이 하나뿐이라
// PC와 폰이 서로를 덮어썼다. 이제 기기별로 나눠 담는다:
//   /fcm_tokens/<uid>/settings          사용자 단위 설정 (기기 공통)
//   /fcm_tokens/<uid>/devices/<기기id>  { token, ua, updatedAt }

const { fbFetch } = require('../lib/fb-admin');
const { tfetch } = require('../lib/http');

// 보낸 사람이 정말 그 uid 인지 — Firebase 로그인 토큰으로 확인한다.
// 토큰 없이 온 요청(예전 앱)은 자기 기기 칸만 쓰고, 설정 덮어쓰기·다른 uid 지우기는 못 한다.
const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY';
async function uidFromIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const r = await tfetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    if (!r.ok) return null;
    const u = ((await r.json().catch(() => ({}))).users || [])[0];
    return u && u.localId ? String(u.localId) : null;
  } catch (e) { return null; }
}

// Firebase 경로에 못 쓰는 문자를 걸러낸다
const safeId = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') { res.status(200).end(); return; }
  if(req.method !== 'POST') { res.status(405).json({ error:'Method not allowed' }); return; }

  try {
    const { uid: rawUid, token, settings, prevUid, deviceId, ua, idToken, local } = req.body || {};
    const uid = safeId(rawUid);
    if(!uid || !token || typeof token !== 'string') { res.status(400).json({ error:'uid and token required' }); return; }
    const authUid = await uidFromIdToken(idToken);
    if (authUid && authUid !== uid) { res.status(403).json({ error:'로그인 정보가 맞지 않습니다' }); return; }
    const trusted = !!authUid;

    const devId = safeId(deviceId) || 'default';
    const done  = [];

    // 1) 기기 토큰
    const devRes = await fbFetch(`/fcm_tokens/${uid}/devices/${devId}.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, ua: String(ua||'').slice(0,120), updatedAt: Date.now(), ...(local ? { local: true } : {}) }),
    });
    if(!devRes.ok) { res.status(502).json({ error:`기기 토큰 저장 실패 (Firebase ${devRes.status})` }); return; }
    done.push('device');

    // 2) 설정 (기기 공통) — 확인된 본인이거나, 아직 설정이 없을 때만
    if (!trusted) {
      const cur = await fbFetch(`/fcm_tokens/${uid}/settings.json`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (cur) { res.status(200).json({ success:true, done:[...done, 'settings-kept'], note:'로그인 확인 없이 온 요청이라 설정은 그대로 두었습니다' }); return; }
    }
    const setRes = await fbFetch(`/fcm_tokens/${uid}/settings.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(settings || {}),
    });
    if(!setRes.ok) { res.status(502).json({ error:`설정 저장 실패 (Firebase ${setRes.status})` }); return; }
    done.push('settings');

    // 3) 구버전 최상위 token 은 이제 의미가 없다. 남겨두면 크론이 죽은 토큰으로 계속 실패한다.
    let legacyRemoved = null;
    try {
      const del = await fbFetch(`/fcm_tokens/${uid}/token.json`, { method: 'DELETE' });
      legacyRemoved = del.ok;
    } catch(e) { console.warn('[subscribe] 구버전 token 정리 실패:', e.message); }

    // 4) 구경로 uid 정리 (안 지우면 크론이 오래된 데이터로 중복 알림을 보낸다)
    let removedPrev = null;
    if (trusted && prevUid && safeId(prevUid) && safeId(prevUid) !== uid) {
      try {
        const del = await fbFetch(`/fcm_tokens/${safeId(prevUid)}.json`, { method: 'DELETE' });
        removedPrev = del.ok;
        console.log('[subscribe] 구 uid 정리:', prevUid, del.status);
      } catch(e) { console.warn('[subscribe] 구 uid 정리 실패:', e.message); }
    }

    // 실패를 success:true 로 덮지 않는다 — 여기까지 왔으면 실제로 저장된 것이다
    res.status(200).json({ success: true, deviceId: devId, saved: done, legacyRemoved, removedPrev });
  } catch(e) {
    console.error('[subscribe] 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
};
