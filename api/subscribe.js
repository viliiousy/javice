// api/subscribe.js — 기기별 알림 토큰 등록
//
// 예전에는 `/fcm_tokens/<uid> = { token, settings }` 로 토큰 칸이 하나뿐이라
// PC와 폰이 서로를 덮어썼다. 이제 기기별로 나눠 담는다:
//   /fcm_tokens/<uid>/settings          사용자 단위 설정 (기기 공통)
//   /fcm_tokens/<uid>/devices/<기기id>  { token, ua, updatedAt }

const { fbFetch } = require('../lib/fb-admin');

// Firebase 경로에 못 쓰는 문자를 걸러낸다
const safeId = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') { res.status(200).end(); return; }
  if(req.method !== 'POST') { res.status(405).json({ error:'Method not allowed' }); return; }

  try {
    const { uid, token, settings, prevUid, deviceId, ua } = req.body || {};
    if(!uid || !token) { res.status(400).json({ error:'uid and token required' }); return; }

    const devId = safeId(deviceId) || 'default';
    const done  = [];

    // 1) 기기 토큰
    const devRes = await fbFetch(`/fcm_tokens/${uid}/devices/${devId}.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, ua: String(ua||'').slice(0,120), updatedAt: Date.now() }),
    });
    if(!devRes.ok) { res.status(502).json({ error:`기기 토큰 저장 실패 (Firebase ${devRes.status})` }); return; }
    done.push('device');

    // 2) 설정 (기기 공통)
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
    if (prevUid && prevUid !== uid) {
      try {
        const del = await fbFetch(`/fcm_tokens/${prevUid}.json`, { method: 'DELETE' });
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
