// api/econ-data.js — 시세를 레포 대신 Firebase 로 주고받는다
//
// 왜 옮겼나
//   수집은 1분마다인데 raw.githubusercontent.com 은 max-age=300 이다.
//   쿼리스트링을 붙여도 무시한다 — 실측으로 같은 값이 4분 넘게 고정되는 걸 확인했다.
//   그래서 화면은 0~5분 늦은 시세를 봤다. 옛 페이지가 GitHub API + PAT 를 쓴 이유가 이거였다.
//   덤: prices.json 이 1분마다 커밋되면서 레포가 하루 1,440건씩 불어났다.
//   (history.json 은 20분마다, watch_state.json 은 내용이 바뀔 때만이라 문제가 아니었다)
//
// 쓰기 — price_watch.py       : POST + Bearer ECON_SECRET
// 읽기 — 브라우저(bashy.app)  : GET  + Firebase ID 토큰
//
// 저장 위치 /econ_prices/<FirebaseUID> 는 보안 규칙이 없다 → 클라이언트는 기본 거부.
// 서비스 계정만 읽고 쓴다. (/google_refresh 와 같은 방식)

const { fbFetch, fbGet } = require('../lib/fb-admin');

const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY';
const UID_RE = /^[A-Za-z0-9]{20,64}$/;      // 경로 조작 방지. Firebase UID 는 영숫자다.

// Firebase ID 토큰 → Firebase UID.
// RS256 검증을 직접 구현하지 않고 Identity Toolkit 에 맡긴다 (lib/google-oauth.js 와 같은 이유).
async function uidFromIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }) });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const u = (data.users || [])[0];
  return u && u.localId ? String(u.localId) : null;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { return null; }
}

module.exports = async (req, res) => {
  try {
    // ── 쓰기: 크론만 ─────────────────────────────
    if (req.method === 'POST') {
      const secret = process.env.ECON_SECRET;
      if (!secret) { res.status(500).json({ error: 'ECON_SECRET 미설정' }); return; }
      if (req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const body = await readBody(req);
      if (!body) { res.status(400).json({ error: 'JSON 파싱 실패' }); return; }
      const { uid, prices } = body;
      if (!UID_RE.test(uid || '')) { res.status(400).json({ error: 'uid 형식이 올바르지 않습니다' }); return; }
      if (!prices || typeof prices !== 'object' || !prices.items) {
        res.status(400).json({ error: 'prices.items 가 없습니다' }); return;
      }

      const r = await fbFetch(`/econ_prices/${uid}.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prices, savedAt: Date.now() }),
      });
      // 저장 실패를 200 으로 넘기면 크론은 성공했다고 믿고 화면은 옛 시세를 계속 보여준다
      if (!r.ok) { res.status(502).json({ error: `Firebase 저장 실패 ${r.status}` }); return; }
      res.status(200).json({ ok: true, uid, count: Object.keys(prices.items).length });
      return;
    }

    // ── 읽기: 로그인한 본인만 ────────────────────
    if (req.method === 'GET') {
      const auth = req.headers.authorization || '';
      const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query?.idToken || '');
      const uid = await uidFromIdToken(idToken);
      if (!uid) { res.status(401).json({ error: '로그인이 필요합니다' }); return; }

      const data = await fbGet(`/econ_prices/${uid}.json`);
      if (!data) { res.status(404).json({ error: '아직 수집된 시세가 없습니다' }); return; }
      res.setHeader('Cache-Control', 'no-store');   // 이걸 캐시하면 옮긴 의미가 없다
      res.status(200).json({ ok: true, updated: data.updated || null, items: data.items || {} });
      return;
    }

    res.status(405).json({ error: 'GET 또는 POST 만 지원합니다' });
  } catch (e) {
    console.error('[econ-data]', e);
    res.status(500).json({ error: e.message });
  }
};
