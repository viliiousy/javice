// api/gauth.js — 브라우저용 얇은 HTTP 층. 실제 토큰 로직은 lib/google-oauth.js 에 있다.
//
//   exchange : 최초 1회. 오프라인 동의에서 받은 인증 코드를 리프레시 토큰으로 바꿔 서버에 보관.
//   refresh  : 이후. Firebase ID 토큰으로 신원을 증명하면 팝업 없이 액세스 토큰을 내준다.
//   status   : 이 사용자의 리프레시 토큰이 서버에 있는지 (동의를 제안할지 판단용).
//
// 리프레시 토큰 자체는 어떤 응답에도 실리지 않는다.

const { exchangeCode, accessTokenFor, loadRefresh, googleSubFromFirebaseIdToken }
  = require('../lib/google-oauth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST만 허용' }); return; }

  try {
    const body   = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = body.action;

    if (action === 'exchange') {
      if (!body.code) { res.status(400).json({ error: 'code 없음' }); return; }
      const r = await exchangeCode(body.code);
      if (r.error) { res.status(400).json({ error: r.error }); return; }
      res.status(200).json({
        ok: true, access_token: r.access_token, expires_in: r.expires_in,
        scope: r.scope, 저장됨: r.saved,
      });
      return;
    }

    if (action === 'refresh' || action === 'status') {
      const sub = await googleSubFromFirebaseIdToken(body.idToken);
      if (!sub) { res.status(401).json({ error: 'Unauthorized' }); return; }

      if (action === 'status') {
        const rec = await loadRefresh(sub);
        res.status(200).json({ ok: true, hasRefresh: !!rec, savedAt: rec ? rec.savedAt : null });
        return;
      }

      const t = await accessTokenFor(sub);
      if (t.needConsent) { res.status(200).json({ ok: false, needConsent: true }); return; }
      res.status(200).json({ ok: true, ...t });
      return;
    }

    res.status(400).json({ error: 'action은 exchange/refresh/status 중 하나여야 합니다' });
  } catch (e) {
    console.error('[gauth]', e);
    res.status(500).json({ error: e.message });
  }
};
