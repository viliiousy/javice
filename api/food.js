// api/food.js — 식품영양성분DB 조회 프록시 (식약처 / 공공데이터포털)
//
// 왜 서버를 거치는가:
//   1) 공공데이터포털은 CORS 헤더를 주지 않는다. 브라우저에서 직접 부르면 막힌다.
//   2) 인증키를 브라우저에 두면 공개한 것과 같다. 하루 1만 회가 남의 것이 된다.
//
// 왜 이걸 만들었는가:
//   AI 에게 물으면 모르는 제품에도 그럴듯한 숫자를 지어냈다. '비요뜨' 를 물었더니
//   "요거트 음료 200ml, 100kcal" 이라고 답했다 — 실제로는 떠먹는 컵이고,
//   이 DB 에는 '비요뜨 초코링 145kcal/100g' 처럼 열 종류가 실측값으로 들어 있다.
//   추정이 사전에 영영 저장되는 게 제일 나쁘다. 그래서 실측을 먼저 본다.
//
// 호출과 AMT_NUM 매핑은 lib/mfds.js 에 있다 — api/barcode.js 도 같은 것을 쓴다.
// 두 벌 두면 한쪽만 고치는 날이 오고, 그날부터 두 화면이 다른 단백질을 말한다.
const { cors } = require('../lib/cors');
const { rank, normalize, search, searchLoose, cover, canon, MODS } = require('../lib/mfds');

const cache = new Map();
const TTL = 12 * 3600 * 1000;

// 같은 이름이면 브랜드 없는 기본형 → 많이 찾는 카페 → 나머지
const BRANDS = ['스타벅스', '이디야', '투썸', '메가', '컴포즈', '빽다방', '폴바셋', '할리스', '커피빈', '파스쿠찌', '엔제리너스', '탐앤탐스'];
function brandRank(x) {
  const t = (x.name + ' ' + (x.maker || '')).replace(/\s+/g, '');
  const i = BRANDS.findIndex(b => t.includes(b));
  if (i >= 0) return 1 + i / 100;
  return x.maker ? 2 : 0;
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const qy   = req.query || {};
  const q    = String(qy.q || '').trim();
  const rows = Math.min(Number(qy.rows || 12) || 12, 30);
  if (!q) { res.status(400).json({ error: '검색어(q)가 없습니다' }); return; }

  const ck  = q + '|' + rows;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) { res.status(200).json({ ...hit.v, cached: true }); return; }

  try {
    // 띄어쓰기·순서·표기가 달라도 찾도록 여러 모양으로 묻는다(lib/mfds.js searchLoose)
    const { total, items, tokens: tk } = await searchLoose(q);
    const coreTk = tk.filter(t => !MODS.includes(t));

    // ?raw=1 은 손대지 않은 원본을 그대로 준다. 필드 이름을 알아야 매핑을 고칠 수 있는데
    // 문서에 목록이 없다 — 실제 응답을 보는 것 말고는 방법이 없다.
    if (qy.raw) { res.status(200).json({ total, keys: Object.keys(items[0]||{}).filter(k=>!/^AMT_NUM/.test(k)),
                                         sample: items.slice(0,2).map(o=>{ const c={}; for(const k in o) if(!/^AMT_NUM/.test(k)) c[k]=o[k]; return c; }) }); return; }

    // 열량조차 없는 줄은 버린다. 이름만 있고 값이 빈 기록이 섞여 있다.
    // 같은 이름·같은 값이 여러 줄로 들어 있다. '햇반' 은 똑같은 150kcal 짜리가 셋이었다.
    // 목록에서 고를 게 없어 보이므로 하나만 남긴다 (코드는 다르지만 사람에겐 같은 음식이다).
    const seen = new Set();
    const out = items
      .map(normalize)
      .filter(x => x.name && x.kcal !== null)
      .filter(x => {
        const k = [x.name, x.kcal, x.protein, x.carb, x.fat].join('|');
        if (seen.has(k)) return false;
        seen.add(k); return true;
      })
      // 질문 낱말을 다 담은 이름이 먼저(순서 무관) → 이름이 가까운 순 → 브랜드 없는 기본형 → 짧은 이름
      .map(x => ({ x, c: cover(x.name, tk), r: rank(canon(x.name), canon(q)), b: brandRank(x) }))
      .filter(o => coreTk.every(t => canon(o.x.name).includes(t)) || o.r <= 1)   // 본체 낱말은 다 있어야(제로 같은 수식어는 없어도 아래쪽에)
      .sort((a, b) => b.c - a.c || a.r - b.r || a.b - b.b || a.x.name.length - b.x.name.length)
      .slice(0, rows)
      .map(o => o.x);

    // 찾은 게 없으면 '없다' 고 분명히 말한다. 숫자를 지어내지 않는다 —
    // 그건 앱이 사용자에게 직접 입력을 받거나 영양성분표를 찍게 할 신호다.
    const v = { ok: out.length > 0, q, total: Math.max(total, out.length), scanned: items.length, count: out.length, items: out,
                source: '식품의약품안전처 식품영양성분DB' };
    cache.set(ck, { t: Date.now(), v });
    res.status(200).json(v);
  } catch (e) {
    console.error('[food]', e);
    res.status(502).json({ error: e.message });
  }
};
