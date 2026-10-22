// lib/market.js — 시세를 화면이 바로 받는 통로 (api/hub.js 의 act: quote / mkt)
//
// 왜 만들었나
//   예전 시세는 economy 레포의 깃허브 액션(price_watch.py)이 5분마다 모아 Firebase 에 넣었다.
//   그런데 깃허브는 예약 실행을 붐빌 때 마음대로 미룬다 — 실측으로 '5분마다' 가 3~5시간마다 돌았다.
//   (2026-10-22: 02:40Z 다음 실행이 오지 않아 11시 40분 시세에서 멈춰 보였다)
//   네이버 증권은 브라우저에서 직접 부르면 막힌다(CORS 헤더 없음). 그래서 여기서 대신 받는다.
//
//   quote: 담은·보유 종목의 지금 값 — 같은 종목은 20초 동안 기억(여러 사람이 1분마다 불러도 네이버엔 한 번)
//   mkt  : 검색 시트 첫 화면 — 국내·해외에서 거래대금이 많은 종목(1분 기억). 코인은 화면이 업비트에서 직접 받는다.
const { tfetch } = require('./http');

const H = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', Referer: 'https://m.stock.naver.com/' };
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : null; };
const QC = new Map(), QTTL = 20e3;
const CODE_RE = /^[A-Za-z0-9._-]{1,20}$/;

function urlsFor(t, c) {
  if (t === 'metal') return [`https://api.stock.naver.com/marketindex/metals/${c}/prices?pageSize=1`];
  if (t === 'exchange') return [`https://api.stock.naver.com/marketindex/exchange/${c}/prices?pageSize=1`];
  if (t === 'kr') return [`https://m.stock.naver.com/api/stock/${c}/basic`, `https://api.stock.naver.com/stock/${c}/basic`];
  if (t === 'us') return [`https://api.stock.naver.com/stock/${c}/basic`, `https://m.stock.naver.com/api/stock/${c}/basic`];
  return [];
}
function parse(d) {
  if (Array.isArray(d)) d = d[0];
  if (!d || typeof d !== 'object') return null;
  // 미국 장 밖이면 시간외 값이 따로 온다 — 정규장 마감값을 그대로 쓴다(앱의 다른 화면과 맞춤)
  const price = num(d.closePrice ?? d.nv);
  if (price == null) return null;
  let pct = num(d.fluctuationsRatio ?? d.cr);
  const amt = num(d.compareToPreviousClosePrice ?? d.fluctuations);
  if (pct != null && amt != null) pct = amt < 0 ? -Math.abs(pct) : amt > 0 ? Math.abs(pct) : pct;
  return { price, pct, at: d.localTradedAt || '', st: d.marketStatus || '' };
}
async function one(t, c) {
  const k = t + ':' + c, hit = QC.get(k);
  if (hit && Date.now() - hit.t < QTTL) return hit.v;
  for (const u of urlsFor(t, c)) {
    try {
      const r = await tfetch(u, { headers: H }, 5000);
      if (!r.ok) continue;
      const v = parse(await r.json());
      if (v) { QC.set(k, { t: Date.now(), v }); if (QC.size > 3000) QC.delete(QC.keys().next().value); return v; }
    } catch (e) {}
  }
  return hit ? hit.v : null;
}
async function quote(body) {
  const list = (Array.isArray(body.items) ? body.items : []).slice(0, 80)
    .map(x => ({ t: String(x.t || x.type || ''), c: String(x.c || x.code || '') }))
    .filter(x => ['kr', 'us', 'metal', 'exchange'].includes(x.t) && CODE_RE.test(x.c));
  const out = {}, q = list.slice();
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (q.length) { const x = q.shift(); const v = await one(x.t, x.c); if (v) out[x.t + ':' + x.c] = v; }
  }));
  return { ok: true, items: out, at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) };
}

// '25조 4,480억원' · '9,189억원' → 원
function hangeulWon(s) {
  s = String(s || '').replace(/,/g, ''); let v = 0, m;
  if ((m = s.match(/([\d.]+)\s*조/))) v += parseFloat(m[1]) * 1e12;
  if ((m = s.match(/([\d.]+)\s*억/))) v += parseFloat(m[1]) * 1e8;
  if ((m = s.match(/([\d.]+)\s*만/))) v += parseFloat(m[1]) * 1e4;
  return v;
}
let MK = null;
async function mkt() {
  if (MK && Date.now() - MK.t < 60e3) return MK.v;
  const get = async u => { try { const r = await tfetch(u, { headers: H }, 6000); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const [ks, kq, nq, ny] = await Promise.all([
    get('https://m.stock.naver.com/api/stocks/priceTop/KOSPI?page=1&pageSize=60'),     // 거래대금 순
    get('https://m.stock.naver.com/api/stocks/priceTop/KOSDAQ?page=1&pageSize=40'),
    get('https://api.stock.naver.com/stock/exchange/NASDAQ/marketValue?page=1&pageSize=60'),   // 해외는 시총 상위를 받아 거래대금으로 다시 줄 세운다
    get('https://api.stock.naver.com/stock/exchange/NYSE/marketValue?page=1&pageSize=60'),
  ]);
  const out = [];
  for (const s of [...(ks?.stocks || []), ...(kq?.stocks || [])]) {
    if (!s.itemCode) continue;
    out.push({ n: s.stockName, c: s.itemCode, t: 'kr', tv: 'KRX:' + s.itemCode, price: num(s.closePrice), pct: signed(s), val: (num(s.accumulatedTradingValue) || 0) * 1e6 });
  }
  for (const s of [...(nq?.stocks || []), ...(ny?.stocks || [])]) {
    if (!s.reutersCode) continue;
    out.push({ n: s.stockName, en: s.stockNameEng || '', c: s.reutersCode, t: 'us', tv: (s.stockExchangeType?.name || 'NASDAQ') + ':' + (s.symbolCode || s.reutersCode.split('.')[0]),
      price: num(s.closePrice), pct: signed(s), val: hangeulWon(s.accumulatedTradingValueKrwHangeul) });
  }
  const v = { ok: true, items: out };
  if (out.length) MK = { t: Date.now(), v };
  return v;
}
function signed(s) {
  const p = num(s.fluctuationsRatio), a = num(s.compareToPreviousClosePrice);
  if (p == null) return null;
  const code = s.compareToPreviousPrice && s.compareToPreviousPrice.code;   // 1·2 오름, 4·5 내림
  if (code === '4' || code === '5' || (a != null && a < 0)) return -Math.abs(p);
  return Math.abs(p);
}

module.exports = { quote, mkt, _t: { parse, hangeulWon } };
