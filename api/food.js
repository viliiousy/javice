// api/food.js — 식품영양성분DB 조회 프록시 (식약처 / 공공데이터포털)
//
// 왜 서버를 거치는가:
//   1) 공공데이터포털은 CORS 헤더를 주지 않는다. 브라우저에서 직접 부르면 막힌다.
//   2) 인증키를 브라우저에 두면 공개한 것과 같다. 하루 1만 회가 남의 것이 된다.
//
// 왜 이걸 만들었는가:
//   AI 에게 물으면 모르는 제품에도 그럴듯한 숫자를 지어냈다. '비요뜨' 를 물었더니
//   "요거트 음료 200ml, 100kcal" 이라고 답했다 — 비요뜨는 마시는 게 아니라
//   토핑이 붙은 떠먹는 컵이고 230kcal 대다. 추정이 사전에 영영 저장되는 게 제일 나쁘다.
//   그래서 실측값을 가진 곳을 먼저 본다. 여기에 없으면 '없다' 고 말한다.
//
// 인증키는 두 가지 모양으로 발급된다(Encoding / Decoding).
// Decoding 키에는 + / = 가 들어 있어 그대로 URL 에 붙이면 깨진다. 여기서 갈라 준다.

const BASE = 'http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

function keyParam() {
  const raw = process.env.FOOD_API_KEY;
  if (!raw) return null;
  const k = raw.trim();
  // 이미 퍼센트 인코딩된 키(Encoding)면 다시 인코딩하면 망가진다. %XX 가 있으면 그대로 쓴다.
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
}

// 웜 인스턴스 동안만 사는 캐시. 같은 검색을 반복해도 하루 1만 회를 축내지 않는다.
const cache = new Map();
const TTL = 6 * 3600 * 1000;

async function call(params) {
  const key = keyParam();
  if (!key) throw new Error('FOOD_API_KEY 미설정');
  const qs = Object.entries(params)
    .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
    .join('&');
  const url = `${BASE}?serviceKey=${key}&${qs}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* XML 오류 응답일 수 있다 */ }
  // 키를 절대 밖으로 내보내지 않는다. 진단용으로도 안 된다.
  return { status: r.status, body, head: text.slice(0, 400) };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = String((req.query && req.query.q) || '').trim();
  const raw = !!(req.query && req.query.raw);
  const rows = Math.min(Number((req.query && req.query.rows) || 10) || 10, 30);

  if (!q) { res.status(400).json({ error: '검색어(q)가 없습니다' }); return; }

  const ck = q + '|' + rows;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL && !raw) { res.status(200).json({ ...hit.v, cached: true }); return; }

  try {
    // 검색 파라미터 이름이 확실해질 때까지 후보를 순서대로 시도한다.
    // 추측한 이름 하나로 0건이 나오면 '없는 음식' 과 '파라미터가 틀림' 을 구분할 수 없다.
    const NAMES = ['FOOD_NM_KR', 'FOOD_NM', 'DESC_KOR'];
    const tried = [];
    for (const nm of NAMES) {
      const r = await call({ [nm]: q, pageNo: 1, numOfRows: rows, type: 'json' });
      const b = r.body || {};
      const items = (b.body && b.body.items) || b.items || null;
      const total = (b.body && b.body.totalCount);
      tried.push({ param: nm, status: r.status, total: total === undefined ? null : total,
                   n: Array.isArray(items) ? items.length : (items ? 1 : 0),
                   head: r.status !== 200 || !items ? r.head : undefined });
      if (Array.isArray(items) && items.length) {
        const out = { ok: true, q, param: nm, total: total, count: items.length,
                      items: raw ? items : items.slice(0, rows) };
        cache.set(ck, { t: Date.now(), v: out });
        res.status(200).json(out); return;
      }
    }
    // 못 찾은 것과 고장난 것을 구분해서 돌려준다.
    res.status(200).json({ ok: false, q, reason: '검색 결과 없음', tried });
  } catch (e) {
    console.error('[food]', e);
    res.status(500).json({ error: e.message });
  }
};
