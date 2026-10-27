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
const { rank, normalize, search, searchLoose, cover, canon, tokens, MODS, dumpPage } = require('../lib/mfds');

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

// ── 우리 쪽에 저장해 둔 식약처 DB (data/food-db.json.gz) ─────────────
// 식약처 서버는 한 번 묻는 데 2~3초 걸린다. 그래서 일주일에 한 번 새벽에 전부 받아(.github/workflows/food-sync.yml)
// 함수 안에 같이 싣고, 여기서 바로 찾는다. 파일이 없거나 여기서 못 찾으면 예전처럼 식약처에 직접 묻는다.
let DB = null, DBN = null;
function db() {
  if (DB !== null) return DB;
  try {
    // 배포 용량을 줄이려고 gzip 으로 둔다(29MB → 8MB). 배포가 하루 수십 번이라 원본이면 Vercel 저장 한도를 금방 채운다.
    const fs = require('fs'), path = require('path'), zlib = require('zlib');
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'data', 'food-db.json.gz'))).toString('utf8'));
    const C = j.cls || [], G = j.grp || [];
    DB = j.r.map(a => ({ name: a[0], kcal: a[1], protein: a[2], carb: a[3], fat: a[4], per: a[5], unit: a[6] ? 'mL' : 'g',
                         pack: a[7], maker: a[8] || '', cls: C[a[9]] || '', group: G[a[10]] || '' }));
    // 찾을 때는 이름 + 제조사(프랜차이즈 이름)를 같이 본다 — 식약처 음식 DB 는 '버거_빅맥' 처럼 이름에 브랜드가 없고 제조사 칸에 '맥도날드' 가 있다.
    // 그래서 '맥도날드 빅맥' 을 치면 아무것도 안 나왔다.
    DBN = DB.map(x => canon(x.name) + '|' + canon(x.maker));
    DB.v = j.v;
  } catch (e) { DB = false; }
  return DB;
}
// ── 프랜차이즈 공식 영양정보 (data/franchise.json) ─────────────
// 써브웨이·쉐이크쉑처럼 식약처 DB 에 없거나, 치킨·도시락처럼 빈 곳을 브랜드가 공개한 값으로 채운다.
// 한 줄 = 한 번 먹는 양(15cm · 1개 · 1마리 · 1조각). per = 그 양의 g(모르면 1), kcal 등은 그 양 기준.
let FR = null, FRN = null;
function fr() {
  if (FR !== null) return FR;
  try {
    const fs = require('fs'), path = require('path');
    FR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'franchise.json'), 'utf8'));
    FRN = FR.map(x => canon(x.name) + '|' + canon(x.maker));
  } catch (e) { FR = []; FRN = []; }
  return FR;
}
function frSearch(q) {
  const F = fr(); if (!F.length) return [];
  const tk = tokens(q), core = tk.filter(t => !MODS.includes(t)), cq = canon(q);
  if (!core.length) return [];
  const out = [];
  for (let i = 0; i < F.length; i++) { const n = FRN[i]; if (core.every(t => n.includes(t)) || n.startsWith(cq)) out.push(F[i]); }
  // 이름이 질문에 가까운 순(브랜드만 쳤으면 브랜드 안 목록 순서 그대로)
  const nameOnly = tk.filter(t => !F.some((x, i) => out.includes(x) && canon(x.maker) === t));
  return out.map((x, i) => ({ x, c: cover(x.name, nameOnly.length ? nameOnly : tk), i }))
    .sort((a, b) => b.c - a.c || a.i - b.i).map(o => o.x);
}
function localSearch(q) {
  const D = db(); if (!D) return null;
  const tk = tokens(q), core = tk.filter(t => !MODS.includes(t)), cq = canon(q), out = [];
  if (!core.length) return null;
  for (let i = 0; i < D.length; i++) { const n = DBN[i]; if (core.every(t => n.includes(t)) || n.startsWith(cq)) out.push(D[i]); }
  return { total: out.length, items: out, tokens: tk, v: D.v };
}

// 질문 낱말을 다 담은 이름이 먼저(순서 무관) → 첫 갈래가 같은 것 → 기본 음식 → 이름이 가까운 순 → 브랜드 없는 기본형 → 짧은 이름
function order(list, q, tk) {
  const coreTk = tk.filter(t => !MODS.includes(t)), seen = new Set(), cq = canon(q);
  return list
    .filter(x => x.name && x.kcal !== null && x.kcal !== undefined)
    .filter(x => { const k = [x.name, x.kcal, x.protein, x.carb, x.fat].join('|'); if (seen.has(k)) return false; seen.add(k); return true; })
    // seg: 이름의 첫 갈래(밑줄 앞)가 질문과 같은가 — '달걀_삶은것' 은 '계란' 에 딱 맞고 '계란도시락' 은 아니다
    // gen: 품목대표(기본 음식) → 음식 → 가공·상용제품 순
    .map(x => { const s0 = canon(String(x.name).split(/[_(]/)[0]);
      return { x, c: cover(x.name + ' ' + (x.maker || ''), tk), seg: s0 === cq ? 0 : (s0.startsWith(cq) ? 1 : 2), r: rank(canon(x.name), cq), b: brandRank(x),
               gen: x.cls === '품목대표' ? 0 : (x.group === '음식' ? 1 : 2) }; })
    .filter(o => coreTk.every(t => (canon(o.x.name) + '|' + canon(o.x.maker)).includes(t)) || o.r <= 1)
    .sort((a, b) => b.c - a.c || a.seg - b.seg || a.gen - b.gen || a.r - b.r || a.b - b.b || a.x.name.length - b.x.name.length)
    .map(o => o.x)
    // 이름이 같은 줄은 하나만(달걀국이 여섯 줄 나오던 것)
    .filter((x, i, arr) => arr.findIndex(y => y.name === x.name) === i)
    .slice(0, 300);
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  const qy = req.query || {};

  // ?dump=1&page=N — 밤 동기화(깃허브 액션)만 쓴다. CRON_SECRET 이 맞아야 한다.
  if (qy.dump) {
    const sec = process.env.CRON_SECRET;
    if (!sec || req.headers.authorization !== `Bearer ${sec}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const pg = Math.max(1, Number(qy.page) || 1), rows = Math.min(1000, Math.max(10, Number(qy.rows) || 100));
      const { total, items, head } = await dumpPage(pg, rows);
      res.status(200).json({ ok: true, page: pg, rows, total, items: items.map(normalize), ...(head ? { head } : {}) });
    } catch (e) { res.status(502).json({ error: e.message }); }
    return;
  }

  const q    = String(qy.q || '').trim();
  const rows = Math.min(Number(qy.rows || 12) || 12, 30);
  const page = Math.max(1, Math.min(20, Number(qy.page || 1) || 1));
  if (!q) { res.status(400).json({ error: '검색어(q)가 없습니다' }); return; }

  // 정렬한 전체 목록을 검색어별로 기억해 두고, 쪽(page)만 잘라 준다 — '더 보기' 는 다시 묻지 않는다
  const slice = (v, cached) => {
    const items = v.all.slice((page - 1) * rows, page * rows);
    return { ok: items.length > 0, q, page, rows, total: v.total, count: items.length, more: v.all.length > page * rows,
             left: Math.max(0, v.all.length - page * rows), items, source: v.source, from: v.from, ...(cached ? { cached: true } : {}) };
  };
  const hit = cache.get(q);
  if (hit && Date.now() - hit.t < TTL && !qy.live) { res.status(200).json(slice(hit.v, true)); return; }

  try {
    // 0) 프랜차이즈 공식값  1) 저장해 둔 식약처 DB (수십 ms) — 둘 다 있으면 공식값을 위에
    const F = qy.live ? [] : frSearch(q);
    const L = qy.live ? null : localSearch(q);
    let v = null;
    if ((L && L.items.length) || F.length) {
      const all = F.concat(L && L.items.length ? order(L.items, q, L.tokens) : []);
      if (all.length) v = { total: Math.max((L ? L.total : 0) + F.length, all.length), all, source: F.length ? '브랜드 공개 영양정보 · 식품의약품안전처 식품영양성분DB' : '식품의약품안전처 식품영양성분DB', from: 'local ' + ((L && L.v) || '') };
    }
    // 2) 없으면 식약처에 직접 (띄어쓰기·순서·표기가 달라도 찾도록 여러 모양으로 묻는다)
    if (!v) {
      const { total, items, tokens: tk } = await searchLoose(q);
      if (qy.raw) { res.status(200).json({ total, keys: Object.keys(items[0]||{}).filter(k=>!/^AMT_NUM/.test(k)),
                                           sample: items.slice(0,2).map(o=>{ const c={}; for(const k in o) if(!/^AMT_NUM/.test(k)) c[k]=o[k]; return c; }) }); return; }
      const all = order(items.map(normalize), q, tk);
      // 찾은 게 없으면 '없다' 고 분명히 말한다. 숫자를 지어내지 않는다.
      v = { total: Math.max(total, all.length), all, source: '식품의약품안전처 식품영양성분DB', from: 'live' };
    }
    cache.set(q, { t: Date.now(), v });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    res.status(200).json(slice(v));
  } catch (e) {
    console.error('[food]', e);
    res.status(502).json({ error: e.message });
  }
};
