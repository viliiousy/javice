// api/broker.js — 증권사 계좌의 보유 종목 가져오기 (지금은 한국투자증권 KIS Open API)
//
// 왜 서버를 거치나: KIS 는 브라우저(CORS)에서 직접 부를 수 없고, 접근 토큰 발급이 1분에 1번·하루 유효라
// 기기마다 따로 받으면 금방 막힌다. 서버가 계정별로 토큰을 한 개 받아 두고(_link/kisTok) 같이 쓴다.
//
// 키는 사용자가 앱에서 넣는다 → /users/<uid>/_link/kis = { appkey, appsecret, cano, prdt, mock }
// (_link 는 기기 localStorage 로 내려가지 않는다. 본인 계정만 읽고 쓸 수 있다.)
// 키움·토스증권은 '허용 IP 등록' 이 필수라 고정 IP 가 없는 이 서버에서는 아직 붙일 수 없다.
//
// POST { idToken, act:'holdings' } → { rows:[{ name, ticker, qty, avg, market:'kr'|'us' }] }

const { cors } = require('../lib/cors');
const { fbFetch, fbGet } = require('../lib/fb-admin');

const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY';
const UID_RE = /^[A-Za-z0-9]{20,64}$/;
const REAL = 'https://openapi.koreainvestment.com:9443';
const MOCK = 'https://openapivts.koreainvestment.com:29443';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

async function uidOf(idToken) {
  if (!idToken) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
  if (!r.ok) return null;
  const u = ((await r.json().catch(() => ({}))).users || [])[0];
  return u && UID_RE.test(String(u.localId)) ? String(u.localId) : null;
}

// 접근 토큰: 남은 시간이 1시간 넘으면 저장해 둔 것을 쓴다
async function kisToken(uid, k, base) {
  const saved = await fbGet(`/users/${uid}/_link/kisTok.json`).catch(() => null);
  if (saved && saved.t && saved.base === base && saved.key === k.appkey.slice(0, 8) && saved.exp - Date.now() > 3600e3) return saved.t;
  const r = await fetch(base + '/oauth2/tokenP', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: k.appkey, appsecret: k.appsecret }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg1 || `토큰 발급 실패(HTTP ${r.status}) — 앱키·시크릿을 확인해 주세요`);
  const exp = Date.now() + (Number(j.expires_in) || 86400) * 1000;
  await fbFetch(`/users/${uid}/_link/kisTok.json`, { method: 'PUT', body: JSON.stringify({ t: j.access_token, exp, base, key: k.appkey.slice(0, 8) }) }).catch(() => {});
  return j.access_token;
}

async function kisGet(base, path, tr, tok, k, params) {
  const u = new URL(base + path);
  Object.entries(params).forEach(([a, b]) => u.searchParams.set(a, b));
  const r = await fetch(u, { headers: {
    'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${tok}`,
    appkey: k.appkey, appsecret: k.appsecret, tr_id: tr, custtype: 'P', tr_cont: '',
  } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.rt_cd && j.rt_cd !== '0')) throw new Error(j.msg1 || `조회 실패(HTTP ${r.status})`);
  return j;
}

async function kisHoldings(uid, k) {
  const base = k.mock ? MOCK : REAL;
  const tok = await kisToken(uid, k, base);
  const acct = { CANO: k.cano, ACNT_PRDT_CD: k.prdt || '01' };
  const rows = [], notes = [];
  // 국내
  const d = await kisGet(base, '/uapi/domestic-stock/v1/trading/inquire-balance', k.mock ? 'VTTC8434R' : 'TTTC8434R', tok, k, {
    ...acct, AFHR_FLPR_YN: 'N', OFL_YN: '', INQR_DVSN: '02', UNPR_DVSN: '01', FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N', PRCS_DVSN: '00', CTX_AREA_FK100: '', CTX_AREA_NK100: '',
  });
  for (const o of d.output1 || []) {
    const qty = Number(o.hldg_qty);
    if (qty > 0) rows.push({ name: o.prdt_name, ticker: o.pdno, qty, avg: Number(o.pchs_avg_pric) || null, market: 'kr' });
  }
  // 해외(미국) — 해외주식 API 사용 동의를 안 했으면 실패한다. 국내 결과는 그대로 돌려준다.
  try {
    const o = await kisGet(base, '/uapi/overseas-stock/v1/trading/inquire-balance', k.mock ? 'VTTS3012R' : 'TTTS3012R', tok, k, {
      ...acct, OVRS_EXCG_CD: 'NASD', TR_CRCY_CD: 'USD', CTX_AREA_FK200: '', CTX_AREA_NK200: '',
    });
    for (const x of o.output1 || []) {
      const qty = Number(x.ovrs_cblc_qty);
      if (qty > 0) rows.push({ name: x.ovrs_item_name, ticker: x.ovrs_pdno, qty, avg: Number(x.pchs_avg_pric) || null, market: 'us' });
    }
  } catch (e) { notes.push('해외 잔고: ' + e.message); }
  return { rows, notes };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const body = await readBody(req);
  const uid = await uidOf(body.idToken);
  if (!uid) { res.status(401).json({ error: '다시 로그인한 뒤 시도해 주세요' }); return; }
  try {
    const k = await fbGet(`/users/${uid}/_link/kis.json`);
    if (!k || !k.appkey || !k.appsecret || !/^\d{8}$/.test(String(k.cano || ''))) {
      res.status(400).json({ error: '한국투자증권 앱키·시크릿·계좌번호를 먼저 넣어 주세요' }); return;
    }
    const out = await kisHoldings(uid, k);
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
};
