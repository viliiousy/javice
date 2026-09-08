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
// AMT_NUM 의 뜻은 문서가 아니라 산수로 확인했다.
//   국밥_돼지머리 100g: 단백질 6.70×4 + 지방 5.16×9 + 탄수화물 15.94×4 = 137.0
//   = AMT_NUM1(에너지). 그래서 3=단백질, 4=지방, 6=탄수화물이 맞다. (2=수분, 5=회분)

const BASE = 'http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';
const SCAN = 100;   // 한 번에 훑는 개수. 이름이 겹치는 음식이 많아 넉넉히 받아 우리가 고른다.

// 인증키는 Encoding / Decoding 두 모양으로 발급된다.
// Decoding 키에는 + / = 가 들어 있어 그대로 URL 에 붙이면 깨진다. 여기서 갈라 준다.
function keyParam() {
  const raw = process.env.FOOD_API_KEY;
  if (!raw) return null;
  const k = raw.trim();
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
}

const cache = new Map();
const TTL = 12 * 3600 * 1000;

const num = v => { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : null; };

// 이름이 질문에 얼마나 가까운가. 낮을수록 위로 간다.
// '닭가슴살' 을 물었는데 '샌드위치_닭가슴살' 이 먼저 나오면 안 된다.
function rank(nameRaw, qRaw) {
  const n = String(nameRaw || '').replace(/\s+/g, '');
  const q = String(qRaw   || '').replace(/\s+/g, '');
  if (!n || !q) return 9;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  // 이 DB 는 '샌드위치_닭가슴살' 처럼 밑줄로 갈래를 나눈다. 조각이 정확히 같으면 그다음.
  if (n.split(/[_()]/).includes(q)) return 2;
  if (n.includes(q)) return 3;
  return 4;
}

function normalize(it) {
  const serving = String(it.DISH_ONE_SERVING || it.SERVING_SIZE || '').trim();
  const m = serving.match(/^([\d.]+)\s*(g|mL|ml|ML)?$/);
  return {
    code:    it.FOOD_CD || '',
    name:    it.FOOD_NM_KR || '',
    group:   it.DB_GRP_NM || '',      // 음식 / 가공식품
    cls:     it.DB_CLASS_NM || '',    // 품목대표 / 상용제품 / 외식
    cat:     it.FOOD_CAT1_NM || '',
    per:     m ? Number(m[1]) : null, // 이 값들이 몇 g/mL 기준인지
    unit:    m && /ml/i.test(m[2] || '') ? 'mL' : 'g',
    kcal:    num(it.AMT_NUM1),
    protein: num(it.AMT_NUM3),
    fat:     num(it.AMT_NUM4),
    carb:    num(it.AMT_NUM6),
  };
}

async function search(q) {
  const key = keyParam();
  if (!key) throw new Error('FOOD_API_KEY 미설정');
  const url = `${BASE}?serviceKey=${key}&FOOD_NM_KR=${encodeURIComponent(q)}`
            + `&pageNo=1&numOfRows=${SCAN}&type=json`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await r.text();
  let b = null;
  try { b = JSON.parse(text); } catch (e) { /* 오류는 XML 로 올 때가 있다 */ }
  if (!b) throw new Error('응답을 읽지 못했습니다: ' + text.slice(0, 120));
  const body  = b.body || b;
  const items = Array.isArray(body.items) ? body.items : (body.items ? [body.items] : []);
  return { total: Number(body.totalCount || 0), items: items };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const qy   = req.query || {};
  const q    = String(qy.q || '').trim();
  const rows = Math.min(Number(qy.rows || 12) || 12, 30);
  if (!q) { res.status(400).json({ error: '검색어(q)가 없습니다' }); return; }

  const ck  = q + '|' + rows;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) { res.status(200).json({ ...hit.v, cached: true }); return; }

  try {
    const { total, items } = await search(q);

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
      .map(x => ({ x, r: rank(x.name, q) }))
      .sort((a, b) => a.r - b.r || a.x.name.length - b.x.name.length)
      .slice(0, rows)
      .map(o => o.x);

    // 찾은 게 없으면 '없다' 고 분명히 말한다. 숫자를 지어내지 않는다 —
    // 그건 앱이 사용자에게 직접 입력을 받거나 영양성분표를 찍게 할 신호다.
    const v = { ok: out.length > 0, q, total, scanned: items.length, count: out.length, items: out,
                source: '식품의약품안전처 식품영양성분DB' };
    cache.set(ck, { t: Date.now(), v });
    res.status(200).json(v);
  } catch (e) {
    console.error('[food]', e);
    res.status(502).json({ error: e.message });
  }
};
