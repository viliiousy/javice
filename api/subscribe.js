// api/subscribe.js
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') { res.status(200).end(); return; }
  if(req.method !== 'POST') { res.status(405).json({ error:'Method not allowed' }); return; }

  try {
    const { uid, token, settings, prevUid } = req.body;
    if(!uid || !token) { res.status(400).json({ error:'uid and token required' }); return; }

    const dbUrl = process.env.FIREBASE_DB_URL;
    const data  = JSON.stringify({ token, settings: settings||{}, updatedAt: Date.now() });
    const url   = `${dbUrl}/fcm_tokens/${uid}.json`;

    const response = await fetch(url, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    data,
    });

    const result = await response.json();
    console.log('[subscribe] Firebase 응답:', response.status, JSON.stringify(result).slice(0,100));

    // 구경로에 남은 등록분 제거 (안 지우면 크론이 오래된 데이터로 중복 알림을 보낸다)
    let removed = null;
    if (response.ok && prevUid && prevUid !== uid) {
      try {
        const del = await fetch(`${dbUrl}/fcm_tokens/${prevUid}.json`, { method: 'DELETE' });
        removed = del.ok;
        console.log('[subscribe] 구 uid 정리:', prevUid, del.status);
      } catch(e) { console.warn('[subscribe] 구 uid 정리 실패:', e.message); }
    }

    res.status(200).json({ success: true, status: response.status, removedPrev: removed });
  } catch(e) {
    console.error('[subscribe] 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
};
