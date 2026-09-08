// api/barcode.js — 바코드 하나로 제품의 정체와 영양성분을 찾는다.
//
// 왜 바코드인가:
//   이름으로 찾으면 '훈제닭가슴살' 이 51건 나오고 그중 어느 것이 내 것인지 알 수 없다.
//   바코드는 제품 하나를 가리킨다. 눈치로 고르는 일이 사라진다.
//
// 어디에도 바코드로 영양성분까지 바로 주는 한국 공공 API 는 없다. 확인한 바로는:
//   · 식약처 C005(바코드연계제품정보) → 제품명·제조사·품목보고번호. 영양성분 없음.
//   · 식약처 I2570(유통바코드)        → 2018년 이후 갱신 중단. 쓰지 않는다.
//   · Open Food Facts                 → 영양성분 있음. 한국 제품은 3,224개뿐.
// 그래서 둘을 이어 붙인다:
//   바코드 → C005 로 '정확한 제품명 + 품목보고번호' → 영양성분DB 에서 그 이름으로 검색
//          → 품목보고번호가 같은 줄이 있으면 그게 확실히 내 제품이다.
// 이름이 겹쳐도 번호는 안 겹치므로, 이 마지막 한 칸이 추측을 사실로 바꾼다.

const { rank, normalize, search } = require('../lib/mfds');

const FSK = 'http://openapi.foodsafetykorea.go.kr/api';
const OFF = 'https://world.openfoodfacts.org/api/v2/product';
const UA  = 'bashy.app/1.0 (personal diet tracker)';

const cache = new Map();
const TTL = 24 * 3600 * 1000;

// EAN-13 / EAN-8 체크디지트. 카메라가 한 자리를 잘못 읽으면 남의 제품을 담게 된다 —
// 조회하기 전에 여기서 걸러야 '아무것도 안 나옴' 이 아니라 '잘못 읽음' 이라고 말할 수 있다.
function validBarcode(raw) {
  const c = String(raw || '').replace(/\D/g, '');
  if (c.length !== 13 && c.length !== 8 && c.length !== 12) return null;
  const d = c.split('').map(Number);
  const chk = d.pop();
  // 오른쪽에서부터 3,1,3,1… 로 곱한다 (자릿수가 짝수든 홀수든 이 방향이면 같다)
  const sum = d.reverse().reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === chk ? c : null;
}

async function getJson(url, ms = 6000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json', 'User-Agent': UA } });
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { return null; }
  } catch (e) { return null; } finally { clearTimeout(t); }
}

// 식약처 C005 — 바코드로 제품의 '정체' 를 묻는다. 영양성분은 여기 없다.
// 키가 없으면 조용히 건너뛴다. 이 단계가 빠져도 Open Food Facts 는 여전히 동작한다.
//
// 못 찾은 것과 못 물어본 것을 반드시 갈라서 돌려준다. 안 그러면
// '낮에는 안 되고 밤에는 되는' 이유를 영영 알 수 없다 — 아래 closed 를 보라.
async function identify(code) {
  const key = (process.env.FOODSAFETY_API_KEY || '').trim();
  if (!key) return { why: 'nokey' };
  const j = await getJson(`${FSK}/${encodeURIComponent(key)}/C005/json/1/5/BAR_CD=${code}`);
  const body = j && j.C005;
  if (!body) return { why: 'error' };
  const rc = (body.RESULT || {}).CODE || '';

  // 식약처 오픈API 는 09~19시(KST)에 닫힌다. C005 만이 아니라 사이트 전체다 —
  // 같은 시각에 C002·I0490·I2570·I0930 이 전부 똑같이 ERROR-503 을 줬고,
  // 없는 서비스만 ERROR-310 으로 갈렸다. 그러니 이건 우리 키 문제가 아니다.
  if (rc === 'ERROR-503') return { why: 'closed' };
  // INFO-200 은 '조건에 맞는 자료가 없음' 이다. 진짜로 없는 것.
  if (rc && rc !== 'INFO-000') return { why: rc === 'INFO-200' ? 'none' : 'error', code: rc };

  const rows = body.row || [];
  const r = Array.isArray(rows) ? rows[0] : rows;
  if (!r || !r.PRDLST_NM) return { why: 'none' };
  return {
    ok:     true,
    name:   String(r.PRDLST_NM || '').trim(),
    maker:  String(r.BSSH_NM || '').trim(),
    kind:   String(r.PRDLST_DCNM || '').trim(),   // 식품 유형
    report: String(r.PRDLST_REPORT_NO || '').trim(),
    // 생산이 끝난 제품은 그렇다고 말해 준다. 값이 틀린 건 아니지만 알고는 있어야 한다.
    ended:  String(r.END_DT || '').trim() || null,
  };
}

// Open Food Facts — 바코드로 영양성분까지 준다. 한국 제품 수록은 얇다.
async function offLookup(code) {
  const f = 'code,product_name,product_name_ko,brands,quantity,serving_size,nutriments';
  const j = await getJson(`${OFF}/${code}.json?fields=${f}`);
  const p = j && j.status === 1 && j.product;
  if (!p) return null;
  const n = p.nutriments || {};
  const kcal = Number(n['energy-kcal_100g']);
  if (!isFinite(kcal) || kcal <= 0) return null;   // 열량조차 없으면 쓸 게 없다
  const q = String(p.quantity || '').trim().match(/^([\d.]+)\s*(g|ml|mL|G|ML)\b/);
  const unit = q && /ml/i.test(q[2]) ? 'mL' : 'g';
  const r1 = v => { const x = Number(v); return isFinite(x) ? Math.round(x * 10) / 10 : null; };
  return {
    src: 'off',
    name: String(p.product_name_ko || p.product_name || '').trim(),
    maker: String(p.brands || '').trim(),
    per: 100, unit,
    pack: q ? Math.round(Number(q[1]) * 10) / 10 : null,
    kcal: Math.round(kcal),
    protein: r1(n.proteins_100g), carb: r1(n.carbohydrates_100g), fat: r1(n.fat_100g),
  };
}

// 정체를 알아냈으면 그 이름으로 영양성분DB 를 뒤진다.
//
// 표기 하나로만 물으면 놓친다. 실제로 확인한 것:
//   '하림 닭가슴살' 5건 / '하림닭가슴살' 1건  — 서로 다른 기록이다
//   '비비고 왕교자' 1건 / '비비고왕교자' 6건
// 이 DB 는 공백을 문자 그대로 본다. 그래서 붙여 쓴 것과 띄어 쓴 것을 둘 다 묻고,
// 그래도 없으면 뒷단어를 한 개씩 떼며 좁은 이름에서 넓은 이름으로 물러난다
// ('하림 닭가슴살 갈릭' → '하림 닭가슴살'). 제품 하나를 놓치는 것보다 세 번 묻는 게 싸다.
function queries(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  const push = v => { if (v && v.length >= 2 && !out.includes(v)) out.push(v); };
  for (let n = w.length; n >= 1 && out.length < 4; n--) {
    const part = w.slice(0, n);
    push(part.join(' '));
    push(part.join(''));
  }
  return out.slice(0, 4);
}

// 이름이 서로를 품고 있는가. 한쪽이 다른 쪽보다 길 수 있다 —
// C005 는 '하림 닭가슴살 갈릭' 이라 하고 영양성분DB 는 '하림닭가슴살' 이라 하는 식이다.
// 짧은 쪽이 너무 짧으면 아무 데나 걸리므로 세 글자 미만은 보지 않는다.
function near(a, b) {
  const x = String(a || '').replace(/\s+/g, '');
  const y = String(b || '').replace(/\s+/g, '');
  if (!x || !y) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 3 && l.includes(s);
}

// 품목보고번호가 같은 줄은 '확실' 이고, 이름만 닮은 줄은 '아마도' 다. 둘을 섞지 않는다.
async function nutrition(id) {
  const rows = [];
  const seen = new Set();
  for (const q of queries(id.name)) {
    let got = null;
    try { got = await search(q); } catch (e) { continue; }
    for (const it of (got.items || [])) {
      const x = normalize(it);
      if (!x.name || !x.kcal) continue;
      const k = x.code || (x.name + '|' + x.kcal);
      if (seen.has(k)) continue;
      seen.add(k); rows.push(x);
    }
    // 번호까지 맞은 줄이 나왔으면 더 물을 이유가 없다. 그게 답이다.
    if (id.report && rows.some(x => x.report === id.report)) break;
  }

  const sure = id.report ? rows.find(x => x.report && x.report === id.report) : null;
  const maybe = rows
    .filter(x => x !== sure && near(x.name, id.name))
    .map(x => ({ x, r: rank(x.name, id.name) }))
    .sort((a, b) => a.r - b.r || a.x.name.length - b.x.name.length)
    .slice(0, 5)
    .map(o => ({ ...o.x, src: 'mfds' }));
  return { sure: sure ? { ...sure, src: 'mfds' } : null, maybe };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const qy = req.query || {};

  // 키가 함수까지 왔는지 확인하는 칸. 값은 절대 내보내지 않는다 — 있고 없고, 그리고 길이만.
  // 길이를 주는 이유: 붙여넣다 잘리는 일이 실제로 있고, 그러면 '없음' 이 아니라 '틀림' 이다.
  // 식약처에 한 번 물어 본 결과도 같이 보여 준다. 우리 쪽이 문제인지 저쪽이 문제인지 갈려야 한다.
  if (qy.diag) {
    const len = n => (process.env[n] || '').trim().length;
    const out = { ok: true, env: {
      FOODSAFETY_API_KEY:  len('FOODSAFETY_API_KEY'),
      FOOD_SAFETY_API_KEY: len('FOOD_SAFETY_API_KEY'),
      FOODSAFETY_KEY:      len('FOODSAFETY_KEY'),
      FOOD_API_KEY:        len('FOOD_API_KEY'),
    }};
    const key = (process.env.FOODSAFETY_API_KEY || '').trim();
    if (key) {
      const j = await getJson(`${FSK}/${encodeURIComponent(key)}/C005/json/1/5/BAR_CD=8801007880440`);
      const r = j && j.C005;
      out.c005 = !r ? '응답을 읽지 못했습니다'
        : { total: r.total_count, code: (r.RESULT || {}).CODE, msg: (r.RESULT || {}).MSG,
            name: (Array.isArray(r.row) ? r.row[0] : r.row || {}).PRDLST_NM };
    }
    res.status(200).json(out); return;
  }

  const code = validBarcode(qy.code);
  if (!code) { res.status(400).json({ ok: false, error: 'bad_barcode' }); return; }

  const hit = cache.get(code);
  if (hit && Date.now() - hit.t < TTL) { res.status(200).json({ ...hit.v, cached: true }); return; }

  // 정체 확인과 Open Food Facts 는 서로를 기다릴 이유가 없다. 같이 보낸다.
  const [idr, off] = await Promise.all([
    identify(code).catch(() => ({ why: 'error' })),
    offLookup(code).catch(() => null),
  ]);
  const id  = idr && idr.ok ? idr : null;
  const nut = id ? await nutrition(id).catch(() => ({ sure: null, maybe: [] })) : { sure: null, maybe: [] };

  // 순서가 곧 신뢰도다. 품목보고번호까지 맞은 실측 → OFF 실측 → 이름만 맞은 후보.
  const hits = [];
  if (nut.sure) hits.push(nut.sure);
  if (off) hits.push(off);
  for (const m of nut.maybe) hits.push(m);

  const out = {
    ok: true,
    code,
    // 영양성분을 못 찾았어도 이름은 알려 준다 — 그것만으로도 검색어를 고칠 수 있다.
    id: id || null,
    exact: !!nut.sure,
    hits,
    // 식약처 쪽이 어떤 상태였는지 그대로 넘긴다. 조용히 덜 찾아 주는 것보다 말하는 게 낫다.
    //   ok / nokey(키 없음) / closed(09~19시 휴무) / none(그 바코드가 없음) / error
    fsk: id ? 'ok' : ((idr && idr.why) || 'error'),
  };
  cache.set(code, { t: Date.now(), v: out });
  res.status(200).json(out);
};

module.exports.validBarcode = validBarcode;
module.exports.queries      = queries;
module.exports.near         = near;
