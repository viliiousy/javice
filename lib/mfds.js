// lib/mfds.js — 식약처 식품영양성분DB 클라이언트 (공공데이터포털)
//
// api/food.js 와 api/barcode.js 가 같이 쓴다. 한 군데 두는 이유는 AMT_NUM 매핑 때문이다 —
// 이걸 두 벌 두면 한쪽만 고치는 날이 오고, 그날부터 두 화면이 다른 단백질을 말한다.
//
// AMT_NUM 의 뜻은 문서가 아니라 산수로 확인했다.
//   국밥_돼지머리 100g: 단백질 6.70×4 + 지방 5.16×9 + 탄수화물 15.94×4 = 137.0
//   = AMT_NUM1(에너지). 그래서 3=단백질, 4=지방, 6=탄수화물이 맞다. (2=수분, 5=회분)

const { tfetch } = require('./http');   // 바깥 호출 시간 제한 (lib/http.js)

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
  const unit = m && /ml/i.test(m[2] || '') ? 'mL' : 'g';

  // Z10500 은 제품 한 개의 중량이다. '비요뜨 초코링' 은 138.000g —
  // 이런 건 100g 씩 사는 게 아니라 한 개씩 먹으므로 그 단위로 담을 수 있어야 한다.
  // 기준량과 단위가 다르면(g vs mL) 환산할 수 없다. 억지로 맞추면 숫자가 틀린다.
  const pm = String(it.Z10500 || '').trim().match(/^([\d.]+)\s*(g|ml|mL|ML|G)?$/);
  let pack = null;
  if (pm) {
    const pv = Number(pm[1]);
    const pu = String(pm[2] || 'g').toLowerCase() === 'ml' ? 'mL' : 'g';
    if (isFinite(pv) && pv > 0 && pv <= 5000 && pu === unit) pack = Math.round(pv * 10) / 10;
  }

  return {
    pack:    pack,                                   // 제품 1개 중량 (모르면 null)
    maker:   String(it.MAKER_NM || '').trim(),
    label:   String(it.NUTRI_AMOUNT_SERVING || '').trim(),   // 포장에 적힌 기준량
    code:    it.FOOD_CD || '',
    // 품목보고번호. 가공식품 상용제품에만 채워져 있고, 바코드로 제품을 특정할 때 쓴다 —
    // 이게 있어야 '훈제닭가슴살' 51건 중 어느 것이 내 것인지 이름 눈치로 고르지 않아도 된다.
    report:  String(it.ITEM_REPORT_NO || '').trim(),
    name:    it.FOOD_NM_KR || '',
    group:   it.DB_GRP_NM || '',      // 음식 / 가공식품
    cls:     it.DB_CLASS_NM || '',    // 품목대표 / 상용제품 / 외식
    cat:     it.FOOD_CAT1_NM || '',
    per:     m ? Number(m[1]) : null, // 이 값들이 몇 g/mL 기준인지
    unit:    unit,
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
  const r = await tfetch(url, { headers: { Accept: 'application/json' } }, 8000);
  const text = await r.text();
  let b = null;
  try { b = JSON.parse(text); } catch (e) { /* 오류는 XML 로 올 때가 있다 */ }
  if (!b) throw new Error('응답을 읽지 못했습니다: ' + text.slice(0, 120));
  const body  = b.body || b;
  const items = Array.isArray(body.items) ? body.items : (body.items ? [body.items] : []);
  return { total: Number(body.totalCount || 0), items: items };
}

// ── 띄어쓰기·순서·표기가 달라도 찾기 ─────────────────────
// 식약처 DB 는 이름에 '그 글자 그대로' 들어 있어야 찾는다. '칠성 사이다 제로' 는 0건,
// '칠성사이다제로' 만 나온다. 그래서 질문을 몇 가지 모양으로 바꿔 함께 묻고, 모은 결과를
// '질문 낱말이 이름에 다 들어 있나' 로 다시 고른다(순서는 따지지 않는다).
// 외래어 표기 갈래 — 하나로 묶어 비교하고, DB 에는 갈래마다 물어본다.
const VARIANTS = [   // [대표형, 다른 표기…] — solo: 낱말만 따로 물어볼 만큼 특징 있는 말
  { g: ['마끼아또', '마키아또', '마키아토', '마끼야또', '마키야또', '마끼아토'], solo: ['마끼아또', '마키아또', '마키아토'] },
  { g: ['프라푸치노', '프라프치노', '프라푸찌노'], solo: ['프라푸치노'] },
  { g: ['카라멜', '캐러멜', '캬라멜'] }, { g: ['라떼', '라테'] }, { g: ['요거트', '요구르트'] }, { g: ['치즈케이크', '치즈케익'] },
];
const MODS = ['제로', '라이트', '무설탕', '저당', '디카페인', '슈거프리', '로우슈거'];
const canon = s => {
  let t = String(s || '').toLowerCase().replace(/[\s_()\[\]·.,/-]+/g, '');
  for (const { g } of VARIANTS) for (const v of g.slice(1)) t = t.split(v).join(g[0]);
  return t;
};
// 질문을 낱말로: 띄어쓰기 + 수식어(제로 등) 떼어 내기
function tokens(q) {
  const out = [];
  for (let w of String(q || '').trim().split(/\s+/)) {
    w = canon(w); if (!w) continue;
    for (const m of MODS) if (w !== m && w.includes(m)) { out.push(m); w = w.split(m).join(''); }
    if (w) out.push(w);
  }
  return [...new Set(out)];
}
// DB 에 물어볼 모양들 (많아야 7개, 결과는 12시간 캐시)
function queries(q) {
  const raw = String(q || '').trim(), nos = raw.replace(/\s+/g, ''), tk = tokens(raw);
  const core = tk.filter(t => !MODS.includes(t)), mods = tk.filter(t => MODS.includes(t));
  const out = [];
  const add = x => { if (x && x.length >= 2 && !out.includes(x)) out.push(x); };
  add(nos);                                                   // '칠성 사이다 제로' → '칠성사이다제로'
  if (mods.length) add(core.join('') + mods.join(''));       // '제로칠성사이다' → '칠성사이다제로'
  add(core.join(''));                                         // 수식어 뺀 본체: '사이다', '칠성사이다'
  add(canon(nos));                                            // 대표 표기로: '바닐라라테' → '바닐라라떼'
  // 표기가 갈리는 특징 있는 낱말(마끼아또/마키아또/마키아토)은 낱말만 따로 갈래마다 묻는다 — 브랜드 메뉴는 '커피_카라멜마끼아또' 처럼 앞에 말이 붙는다
  const c = canon(nos);
  for (const { g, solo } of VARIANTS) if (solo && c.includes(g[0])) solo.forEach(add);
  if (out.length < 4) core.slice().sort((x, y) => y.length - x.length).slice(0, 1).forEach(add);   // 제일 긴 낱말
  if (!out.includes(raw) && raw !== nos) add(raw);
  return out.slice(0, 7);
}
// 이름이 질문 낱말을 몇 개나 담았나(0~1). 순서는 상관없다.
function cover(name, tk) {
  if (!tk.length) return 0;
  const n = canon(name);
  return tk.filter(t => n.includes(t)).length / tk.length;
}
// 여러 모양으로 물어 모은다
async function searchLoose(q) {
  const qs = queries(q);
  const res = await Promise.all(qs.map(x => search(x).catch(() => ({ total: 0, items: [] }))));
  const seen = new Set(), items = []; let total = 0;
  res.forEach(r => { total = Math.max(total, r.total || 0); for (const it of r.items || []) { const k = it.FOOD_CD || (it.FOOD_NM_KR + '|' + it.AMT_NUM1 + '|' + it.MAKER_NM); if (!seen.has(k)) { seen.add(k); items.push(it); } } });
  return { total, items, queries: qs, tokens: tokens(q) };
}

module.exports = { BASE, SCAN, keyParam, num, rank, normalize, search, searchLoose, tokens, cover, canon, queries, MODS };
