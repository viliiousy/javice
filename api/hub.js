// api/hub.js — AI 사용량 허브
//
//   push  : PC 크롬 확장이 Claude·ChatGPT·Higgsfield 사용량을 올린다.
//   state : 태블릿 허브(hub.html)가 최신값과 최근 이력을 받아 간다.
//
// 두 쪽 다 구글 로그인을 하지 못한다. 확장은 서비스 워커라 팝업을 못 띄우고,
// 태블릿 앱(WebView)은 구글이 OAuth 를 막는다. 그래서 '연결 코드' 로 인증한다.
//   코드 = <FirebaseUID>.<hubKey>
//   hubKey 는 bashy.app 설정에서 만들어 /users/<uid>/_link/hubKey 에 둔다.
// 코드가 새면 bashy.app 에서 새로 만들면 된다 — 옛 코드는 그 순간 죽는다.
//
// 쓰는 곳은 /users/<uid>/_usage 하나뿐이다. 사용자 데이터(u_*)에는 손대지 않는다.
//   _usage/latest/<서비스>   마지막으로 본 값 (서비스별로 따로 덮어쓴다)
//   _usage/hist/<10분칸>     그래프용 압축 이력 { c5, c7, g5, g7, hf }
//
//   tasks : 허브 왼쪽의 구글 할일. 서버에 있는 리프레시 토큰(/google_refresh/<구글 sub>)으로 읽는다.
//           구글 sub 는 사용자 데이터 키의 접두사(u_<sub>_)에서 얻는다. 사이트의 숨김·별표·색 설정은
//           u_<sub>_gl_* 키를 읽기만 한다(쓰지 않는다).
//   taskDone : 허브에서 체크한 할일을 구글 할일에서 완료(또는 되돌림) 처리한다.
//   taskAdd  : 허브에 말로 한 할일을 구글 기본 목록에 넣는다.
//   ics      : 캘린더 구독 주소(.ics)를 대신 받아 원문을 돌려준다 (Firebase ID 토큰 필요, 연결 코드 아님).

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { fbFetch, fbGet } = require('../lib/fb-admin');
const { accessTokenFor } = require('../lib/google-oauth');

const HIST_DAYS = 8;          // 일주일 그래프 + 여유 하루
const SLOT_MIN  = 10;         // 이력 칸 크기(분). 확장이 5분마다 올려도 칸은 10분

const safeUid = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);

function parseCode(code) {
  const m = String(code || '').trim().match(/^([A-Za-z0-9_-]{6,128})\.([A-Za-z0-9_-]{16,128})$/);
  return m ? { uid: m[1], key: m[2] } : null;
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

async function verify(code) {
  const c = parseCode(code);
  if (!c) return null;
  const uid = safeUid(c.uid);
  const key = await fbGet(`/users/${uid}/_link/hubKey.json`);
  return sameSecret(key, c.key) ? uid : null;
}

// 숫자만, 범위 안에서만 받는다. 확장이 엉뚱한 응답을 파싱해 올려도 그래프가 망가지지 않게.
const pct = v => {
  const n = Number(v);
  return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 10) / 10)) : null;
};
const num = v => { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : null; };
const iso = v => {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  return isFinite(t) ? new Date(t).toISOString() : null;
};
const str = (v, n = 40) => (v == null ? null : String(v).slice(0, n));

function win(w) {
  if (!w || typeof w !== 'object') return null;
  const p = pct(w.pct);
  return p == null ? null : { pct: p, reset: iso(w.reset) };
}

// 확장이 보낸 원본을 우리가 저장할 모양으로 정리한다.
function clean(usage) {
  const out = {};
  const now = new Date().toISOString();
  const u = usage || {};
  for (const k of ['claude', 'chatgpt']) {
    const s = u[k];
    if (!s || typeof s !== 'object') continue;
    const h5 = win(s.h5), d7 = win(s.d7);
    if (!h5 && !d7) continue;
    out[k] = { plan: str(s.plan), h5, d7, at: iso(s.at) || now };
  }
  const h = u.higgsfield;
  if (h && typeof h === 'object' && num(h.credits) != null) {
    out.higgsfield = {
      plan:    str(h.plan),
      credits: num(h.credits),
      total:   num(h.total),
      extra:   num(h.extra),
      ends:    iso(h.ends),
      at:      iso(h.at) || now,
    };
  }
  return out;
}

function slotKey(d) {
  const t = Math.floor(d.getTime() / (SLOT_MIN * 60000)) * SLOT_MIN * 60000;
  // 사전순 = 시간순이 되도록 고정폭 UTC 문자열 (YYYYMMDDHHmm)
  return new Date(t).toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

async function push(uid, usage) {
  const data = clean(usage);
  const names = Object.keys(data);
  if (!names.length) return { saved: [] };

  const r1 = await fbFetch(`/users/${uid}/_usage/latest.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!r1.ok) throw new Error(`latest 저장 실패 HTTP ${r1.status}`);

  const point = {};
  if (data.claude)     { if (data.claude.h5) point.c5 = data.claude.h5.pct; if (data.claude.d7) point.c7 = data.claude.d7.pct; }
  if (data.chatgpt)    { if (data.chatgpt.h5) point.g5 = data.chatgpt.h5.pct; if (data.chatgpt.d7) point.g7 = data.chatgpt.d7.pct; }
  if (data.higgsfield) point.hf = data.higgsfield.credits;

  const now = new Date();
  const key = slotKey(now);
  const r2 = await fbFetch(`/users/${uid}/_usage/hist/${key}.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(point),
  });
  if (!r2.ok) throw new Error(`이력 저장 실패 HTTP ${r2.status}`);

  // 한 시간에 한 번만 오래된 칸을 치운다
  if (key.endsWith('00')) await prune(uid, now).catch(e => console.warn('[hub] prune', e.message));
  return { saved: names };
}

async function prune(uid, now) {
  const cut = slotKey(new Date(now.getTime() - HIST_DAYS * 86400000));
  const old = await fbGet(
    `/users/${uid}/_usage/hist.json?shallow=true&orderBy=%22$key%22&endAt=%22${cut}%22&limitToFirst=500`
  );
  const keys = old ? Object.keys(old) : [];
  if (!keys.length) return;
  const patch = Object.fromEntries(keys.map(k => [k, null]));
  await fbFetch(`/users/${uid}/_usage/hist.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  });
}

async function state(uid, days) {
  const d = Math.max(1, Math.min(HIST_DAYS, Number(days) || 2));
  const from = slotKey(new Date(Date.now() - d * 86400000));
  const [latest, hist] = await Promise.all([
    fbGet(`/users/${uid}/_usage/latest.json`),
    fbGet(`/users/${uid}/_usage/hist.json?orderBy=%22$key%22&startAt=%22${from}%22`),
  ]);
  return { latest: latest || {}, hist: hist || {} };
}

// ── 구글 할일 ─────────────────────────────────────
async function googleSub(uid) {
  const keys = await fbGet(`/users/${uid}.json?shallow=true`);
  for (const k of Object.keys(keys || {})) {
    const m = k.match(/^u_(\d{6,})_gl_/);   // 접두사가 이메일인 옛 계정은 sub 가 아니다
    if (m) return m[1];
  }
  return null;
}

async function gget(tok, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Tasks API ${r.status}: ${(j.error && j.error.message) || ''}`);
  return j;
}

// bashy.app 이 할일 화면에 쓰는 설정을 같이 읽는다 — 허브가 사이트와 똑같이 보이도록.
//   숨김(gl_hidden_<id>) · 별표(gl_star_<id>, 또는 notes 앞 마커) · 지난 할일 보기(gl_task_show_overdue) · 목록 색(gl_cat_colors)
// 사이트는 이 값들을 /users/<uid> 아래 u_<sub>_* 키로 올려 둔다(FirebaseSync).
const STAR_MARK = '__⭐__';
async function sitePrefs(uid, sub) {
  const range = p => fbGet(`/users/${uid}.json?orderBy=%22$key%22&startAt=%22${encodeURIComponent(p)}%22&endAt=%22${encodeURIComponent(p + '\uf8ff')}%22`).catch(() => null);
  const pre = `u_${sub}_`;
  const [hid, star, ov, col] = await Promise.all([
    range(pre + 'gl_hidden_'), range(pre + 'gl_star_'),
    fbGet(`/users/${uid}/${encodeURIComponent(pre + 'gl_task_show_overdue')}.json`).catch(() => null),
    fbGet(`/users/${uid}/gl_cat_colors.json`).catch(() => null),
  ]);
  const ids = (o, p) => new Set(Object.entries(o || {}).filter(([, v]) => String(v) === '1').map(([k]) => k.slice(p.length)));
  let colors = {};
  try { colors = typeof col === 'string' ? JSON.parse(col) : (col || {}); } catch {}
  return { hidden: ids(hid, pre + 'gl_hidden_'), star: ids(star, pre + 'gl_star_'), showOverdue: String(ov) !== '0', colors };
}

async function googleTok(uid) {
  const sub = await googleSub(uid);
  if (!sub) return { needConsent: true, reason: '구글 계정을 찾지 못했습니다' };
  const t = await accessTokenFor(sub);
  if (t.needConsent || !t.access_token) return { needConsent: true, reason: t.reason || 'bashy.app 에서 구글 접근을 한 번 더 허용해 주세요' };
  return { sub, tok: t.access_token };
}

async function tasks(uid) {
  const g = await googleTok(uid);
  if (g.needConsent) return g;
  const { sub, tok } = g;
  const base = 'https://tasks.googleapis.com/tasks/v1';
  const [ls, prefs] = await Promise.all([gget(tok, `${base}/users/@me/lists?maxResults=100`), sitePrefs(uid, sub)]);
  const lists = (ls.items || []).map(l => ({ id: l.id, title: l.title, color: prefs.colors[l.id] || null }));
  const per = await Promise.all(lists.map(l =>
    gget(tok, `${base}/lists/${encodeURIComponent(l.id)}/tasks?showCompleted=false&showHidden=false&maxResults=100`)
      .then(j => (j.items || []).filter(x => x.title && x.status !== 'completed' && !prefs.hidden.has(x.id)).map(x => ({
        id: x.id, list: l.id, title: String(x.title).slice(0, 200),
        due: x.due ? x.due.slice(0, 10) : null, pos: x.position || '', sub: !!x.parent,
        star: prefs.star.has(x.id) || (typeof x.notes === 'string' && x.notes.startsWith(STAR_MARK)),
      })))
      .catch(() => [])));
  return { lists, tasks: per.flat(), showOverdue: prefs.showOverdue };
}

// 허브에 말로 "할 일에 ○○ 추가" — 첫 번째 목록(구글 기본 목록)에 넣는다.
async function taskAdd(uid, title) {
  title = String(title || '').trim().slice(0, 200);
  if (title.length < 2) throw new Error('할일 내용이 비었습니다');
  const g = await googleTok(uid);
  if (g.needConsent) return g;
  const r = await fetch('https://tasks.googleapis.com/tasks/v1/lists/%40default/tasks', {
    method: 'POST', headers: { Authorization: `Bearer ${g.tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Tasks API ${r.status}: ${(j.error && j.error.message) || ''}`);
  return { id: j.id };
}

// 허브에서 체크하면 구글 할일에서 완료 처리 — bashy.app 도 같은 구글 할일을 보므로 그대로 따라온다.
async function taskDone(uid, list, id, undo) {
  if (!list || !id || !/^[\w-]{4,}$/.test(list) || !/^[\w-]{4,}$/.test(id)) throw new Error('할일 지정이 잘못되었습니다');
  const g = await googleTok(uid);
  if (g.needConsent) return g;
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list)}/tasks/${encodeURIComponent(id)}`;
  const body = undo ? { status: 'needsAction', completed: null } : { status: 'completed' };
  const r = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${g.tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Tasks API ${r.status}: ${(j.error && j.error.message) || ''}`);
  return { status: j.status };
}

// ── 클라우드 설정 · 기기 연결 ─────────────────────────
// 허브 설정(HA 주소·토큰, OpenClaw 등)은 /users/<uid>/_link/hubCfg 에 한 번 저장해 두고,
// 새 기기는 '연결 코드' 를 손으로 넣는 대신 bashy.app(구글 로그인)에서 승인만 하면 받아 간다.
//   pairStart   : 새 기기가 6자리 번호와 비밀 pairId 를 받는다 (10분 유효)
//   pairApprove : 로그인한 bashy.app 이 그 번호를 승인한다 (Firebase ID 토큰으로 사용자 확인)
//   pairPoll    : 새 기기가 pairId 로 결과(연결 코드 + 설정)를 가져간다 — 한 번 받으면 지운다
//   cfgGet / cfgPut : 연결 코드로 설정을 읽고 쓴다
const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY';
const PAIR_TTL = 10 * 60 * 1000;
const CFG_FIELDS = { provider: 8, haUrl: 300, haUrlExt: 300, haToken: 600, aiUrl: 300, aiToken: 600, aiModel: 60, wakeWord: 30 };
const CFG_FLAGS  = ['wakeOn', 'night'];

async function uidFromIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
  if (!r.ok) return null;
  const u = ((await r.json().catch(() => ({}))).users || [])[0];
  return u && u.localId ? safeUid(u.localId) : null;
}

function cleanCfg(c) {
  const out = {};
  if (!c || typeof c !== 'object') return out;
  for (const [k, n] of Object.entries(CFG_FIELDS)) if (typeof c[k] === 'string') out[k] = c[k].trim().slice(0, n);
  for (const k of CFG_FLAGS) if (typeof c[k] === 'boolean') out[k] = c[k];
  out.at = new Date().toISOString();
  return out;
}

const cfgGet = async uid => (await fbGet(`/users/${uid}/_link/hubCfg.json`)) || null;
async function cfgPut(uid, cfg) {
  const v = cleanCfg(cfg);
  const r = await fbFetch(`/users/${uid}/_link/hubCfg.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
  if (!r.ok) throw new Error('설정 저장 실패 HTTP ' + r.status);
  return { at: v.at };
}

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

async function pairStart() {
  for (let i = 0; i < 5; i++) {
    const pin = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    const cur = await fbGet(`/hub_pair/${pin}.json`);
    if (cur && cur.exp > Date.now()) continue;
    const pairId = crypto.randomBytes(24).toString('base64url');
    const r = await fbFetch(`/hub_pair/${pin}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ h: sha(pairId), exp: Date.now() + PAIR_TTL }) });
    if (!r.ok) throw new Error('연결 준비 실패 HTTP ' + r.status);
    return { pin, pairId, exp: Date.now() + PAIR_TTL };
  }
  throw new Error('잠시 뒤 다시 시도해 주세요');
}

async function pairApprove(idToken, pin) {
  const uid = await uidFromIdToken(idToken);
  if (!uid) return { status: 401, error: '로그인이 필요합니다' };
  pin = String(pin || '').replace(/\D/g, '');
  const cur = pin.length === 6 ? await fbGet(`/hub_pair/${pin}.json`) : null;
  if (!cur || !(cur.exp > Date.now())) return { status: 404, error: '번호가 없거나 만료되었습니다 — 기기 화면의 번호를 다시 확인해 주세요' };
  if (cur.uid) return { status: 409, error: '이미 승인된 번호입니다' };
  let key = await fbGet(`/users/${uid}/_link/hubKey.json`);
  if (!key) {   // 처음이면 연결 키를 만든다 (이미 있으면 그대로 써서 PC 확장 연결을 끊지 않는다)
    key = crypto.randomBytes(24).toString('base64url');
    const w = await fbFetch(`/users/${uid}/_link/hubKey.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(key) });
    if (!w.ok) throw new Error('연결 키 생성 실패 HTTP ' + w.status);
  }
  const r = await fbFetch(`/hub_pair/${pin}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, code: `${uid}.${key}` }) });
  if (!r.ok) throw new Error('승인 저장 실패 HTTP ' + r.status);
  return { status: 200, ok: true };
}

async function pairPoll(pin, pairId) {
  pin = String(pin || '').replace(/\D/g, '');
  if (pin.length !== 6 || !pairId) return { status: 400, error: '잘못된 요청' };
  const cur = await fbGet(`/hub_pair/${pin}.json`);
  if (!cur || !sameSecret(cur.h, sha(pairId))) return { status: 404, error: '만료되었습니다 — 다시 시작해 주세요' };
  if (!cur.code) return { status: 200, ok: true, waiting: true, exp: cur.exp };
  await fbFetch(`/hub_pair/${pin}.json`, { method: 'DELETE' });
  const cfg = await cfgGet(safeUid(cur.uid)).catch(() => null);
  return { status: 200, ok: true, code: cur.code, cfg };
}


// ── SmartThings (집에 서버 없이 쓰는 스마트홈) ─────────────────────
// Home Assistant 는 집에 서버(맥미니 등)를 둬야 해서 보통 사람에겐 어렵다. SmartThings 는 클라우드 API 가 있어
// 이 서버가 사용자 대신 기기 목록·상태를 읽고 켜고 끈다. 사용자는 bashy.app 에서 삼성 계정으로 '허락' 만 한다.
//   개인 액세스 토큰(PAT)은 2024년 말부터 24시간이면 만료라 쓰지 않고, OAuth(API_ONLY 앱)로 붙는다.
//   토큰은 /users/<uid>/_link/st = { at, rt, exp } (본인 계정 칸, 기기로 내려가지 않음)
//   stStart(idToken) → 삼성 로그인 주소 / GET /st/callback → 토큰 저장 → bashy.app 으로 돌아감
//   stDevices(code) → 방·기기·상태·장면 / stCmd(code) → 기기 명령 · 장면 실행 / stStatus·stUnlink(idToken)
const ST_API = 'https://api.smartthings.com/v1';
const ST_AUTH = 'https://api.smartthings.com/oauth/authorize';
const ST_TOKEN = 'https://auth-global.api.smartthings.com/oauth/token';
const ST_SCOPE = 'r:devices:* x:devices:* r:locations:* r:scenes:* x:scenes:*';
const ST_REDIRECT = process.env.ST_REDIRECT || 'https://bashy.app/st/callback';
// 대시보드에 붙여 넣을 때 섞인 공백·줄바꿈을 걷어낸다
const ST_ID = () => String(process.env.ST_CLIENT_ID || '').trim();
const ST_SECRET = () => String(process.env.ST_CLIENT_SECRET || '').trim();
const stReady = () => !!(ST_ID() && ST_SECRET());
const stBasic = () => 'Basic ' + Buffer.from(`${ST_ID()}:${ST_SECRET()}`).toString('base64');

async function stStart(idToken) {
  const uid = await uidFromIdToken(idToken);
  if (!uid) return { status: 401, error: '로그인이 필요합니다' };
  return stStartUid(uid);
}
// 허브(연결 코드로 인증)에서 바로 연결을 시작할 때
async function stStartUid(uid) {
  if (!stReady()) return { status: 503, error: 'SmartThings 연동 준비 중입니다(서버 설정 필요)' };
  const nonce = crypto.randomBytes(18).toString('base64url');
  await fbFetch(`/st_state/${nonce}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, exp: Date.now() + 10 * 60 * 1000 }) });
  const q = new URLSearchParams({ client_id: ST_ID(), response_type: 'code', redirect_uri: ST_REDIRECT, scope: ST_SCOPE, state: nonce });
  return { status: 200, ok: true, url: `${ST_AUTH}?${q}` };
}

async function stSaveTok(uid, j) {
  const v = { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (Number(j.expires_in) || 86400) * 1000 - 60000 };
  await fbFetch(`/users/${uid}/_link/st.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
  return v;
}
async function stTokReq(params) {
  const r = await fetch(ST_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: stBasic() }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `SmartThings 토큰 실패(HTTP ${r.status})`);
  return j;
}
async function stCallback(req, res) {
  const u = new URL(req.url, 'https://bashy.app');
  const back = m => { res.statusCode = 302; res.setHeader('Location', `https://bashy.app/?st=${m}`); res.end(); };
  const q = req.query || {};
  const code = q.code || u.searchParams.get('code'), nonce = q.state || u.searchParams.get('state');
  if (!code || !nonce || !/^[A-Za-z0-9_-]{10,64}$/.test(nonce)) return back('cancel');
  const st = await fbGet(`/st_state/${nonce}.json`);
  await fbFetch(`/st_state/${nonce}.json`, { method: 'DELETE' });
  if (!st || !(st.exp > Date.now()) || !st.uid) return back('expired');
  try { await stSaveTok(safeUid(st.uid), await stTokReq({ grant_type: 'authorization_code', code, redirect_uri: ST_REDIRECT, client_id: ST_ID() })); }
  catch (e) { console.error('[st cb]', e.message); return back('fail'); }
  return back('ok');
}
async function stToken(uid) {
  const t = await fbGet(`/users/${uid}/_link/st.json`);
  if (!t || !t.rt) throw Object.assign(new Error('SmartThings 가 연결되어 있지 않습니다 — bashy.app › 기기 연결에서 연결해 주세요'), { code: 'NOLINK' });
  if (t.at && t.exp > Date.now()) return t.at;
  const j = await stTokReq({ grant_type: 'refresh_token', refresh_token: t.rt, client_id: ST_ID() });
  return (await stSaveTok(uid, j)).at;
}
async function stGet(tok, path) {
  const r = await fetch(ST_API + path, { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error(`SmartThings ${path.split('?')[0]} HTTP ${r.status}`);
  return r.json();
}
// 화면에 쓰는 값만 골라 보낸다 (기기 상태 원본은 크다)
const ST_PICK = {
  switch: ['switch'], switchLevel: ['level'], temperatureMeasurement: ['temperature'], relativeHumidityMeasurement: ['humidity'],
  dustSensor: ['fineDustLevel', 'dustLevel'], fineDustSensor: ['fineDustLevel'], airConditionerMode: ['airConditionerMode'],
  thermostatCoolingSetpoint: ['coolingSetpoint'], thermostatHeatingSetpoint: ['heatingSetpoint'], windowShade: ['windowShade'],
  lock: ['lock'], robotCleanerMovement: ['robotCleanerMovement'], washerOperatingState: ['machineState', 'completionTime'],
  dryerOperatingState: ['machineState', 'completionTime'], contactSensor: ['contact'], motionSensor: ['motion'],
  mediaPlayback: ['playbackStatus'], carbonDioxideMeasurement: ['carbonDioxide'], fanSpeed: ['fanSpeed'],
};
async function stDevices(uid) {
  const tok = await stToken(uid);
  const [devs, locs, scenes] = await Promise.all([
    stGet(tok, '/devices'), stGet(tok, '/locations'), stGet(tok, '/scenes').catch(() => ({ items: [] })),
  ]);
  const rooms = {};
  await Promise.all((locs.items || []).map(async l => {
    const r = await stGet(tok, `/locations/${l.locationId}/rooms`).catch(() => ({ items: [] }));
    for (const x of r.items || []) rooms[x.roomId] = x.name;
  }));
  const items = (devs.items || []).slice(0, 80);
  const out = await Promise.all(items.map(async d => {
    const main = (d.components || []).find(c => c.id === 'main') || (d.components || [])[0] || {};
    const caps = (main.capabilities || []).map(c => c.id);
    const cat = ((main.categories || [])[0] || {}).name || '';
    const st = {};
    try {
      const s = await stGet(tok, `/devices/${d.deviceId}/components/main/status`);
      for (const [cap, keys] of Object.entries(ST_PICK)) if (s[cap]) for (const k of keys) if (s[cap][k] && s[cap][k].value != null) st[k] = s[cap][k].value;
      if (s.healthCheck && s.healthCheck.DeviceWatch && s.healthCheck['DeviceWatch-DeviceStatus']) st.health = s.healthCheck['DeviceWatch-DeviceStatus'].value;
    } catch (e) { st.err = 1; }
    return { id: d.deviceId, name: d.label || d.name, room: d.roomId || null, cat, caps: caps.filter(c => ST_PICK[c] || c === 'switch'), st };
  }));
  return { rooms, devices: out, scenes: (scenes.items || []).slice(0, 30).map(x => ({ id: x.sceneId, name: x.sceneName })) };
}
const ST_CMD_OK = /^[a-zA-Z]{2,40}$/;
async function stCmd(uid, b) {
  const tok = await stToken(uid);
  if (b.scene) {
    if (!/^[0-9a-f-]{20,64}$/i.test(String(b.scene))) throw new Error('잘못된 장면');
    const r = await fetch(`${ST_API}/scenes/${b.scene}/execute`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error('장면 실행 실패 HTTP ' + r.status);
    return { ok: true };
  }
  const id = String(b.device || '');
  if (!/^[0-9a-f-]{20,64}$/i.test(id)) throw new Error('잘못된 기기');
  const cmds = (Array.isArray(b.commands) ? b.commands : []).slice(0, 4)
    .filter(c => c && ST_CMD_OK.test(c.capability) && ST_CMD_OK.test(c.command))
    .map(c => ({ component: 'main', capability: c.capability, command: c.command, arguments: Array.isArray(c.arguments) ? c.arguments.slice(0, 3) : [] }));
  if (!cmds.length) throw new Error('명령이 없습니다');
  const r = await fetch(`${ST_API}/devices/${id}/commands`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ commands: cmds }) });
  if (!r.ok) throw new Error('명령 실패 HTTP ' + r.status);
  return { ok: true };
}
async function stStatus(idToken, unlink) {
  const uid = await uidFromIdToken(idToken);
  if (!uid) return { status: 401, error: '로그인이 필요합니다' };
  if (unlink) { await fbFetch(`/users/${uid}/_link/st.json`, { method: 'DELETE' }); return { status: 200, ok: true, linked: false }; }
  const t = await fbGet(`/users/${uid}/_link/st.json`);
  if (!t || !t.rt) return { status: 200, ok: true, ready: stReady(), linked: false };
  try { const d = await stDevices(uid); return { status: 200, ok: true, ready: true, linked: true, devices: d.devices.length, rooms: Object.keys(d.rooms).length }; }
  catch (e) { return { status: 200, ok: true, ready: true, linked: false, error: e.message }; }
}


// ── MCP 커넥터: ChatGPT·Claude 월 구독으로 Bashy 쓰기 ─────────────────────
// 구독(ChatGPT Plus·Claude Pro)은 API 키가 아니라서 Bashy 가 대신 부를 수 없다. 방향을 뒤집는다:
// 사용자의 ChatGPT·Claude 가 이 서버(MCP)를 '도구' 로 부르게 한다. 그러면 생각·계산은 그 사람의 구독이 하고,
// Bashy 는 기록을 읽고 쓰기만 한다. (Claude: 설정 › 커넥터 › 사용자 지정 커넥터 / ChatGPT: 개발자 모드 커넥터)
// 주소 = https://bashy.app/mcp/<uid>.<mcpKey>  — 키는 설정 › AI 에서 만들고, 새로 만들면 예전 주소는 끊긴다.
// 쓰기는 사이트와 같은 칸(/users/<uid>/u_<sub>_gl_*)에 하고 _savedAt 을 올려 열린 앱이 20초 안에 받아 가게 한다.
async function mcpVerify(code) {
  const c = parseCode(code);
  if (!c) return null;
  const uid = safeUid(c.uid);
  const key = await fbGet(`/users/${uid}/_link/mcpKey.json`);
  return sameSecret(key, c.key) ? uid : null;
}
const kstDate = (d) => {
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
};
async function uget(uid, sub, key, def) {
  const v = await fbGet(`/users/${uid}/${encodeURIComponent('u_' + sub + '_' + key)}.json`).catch(() => null);
  if (v == null) return def;
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return def; }
}
async function uset(uid, sub, patch) {
  const body = { _savedAt: String(Date.now()) };
  for (const [k, v] of Object.entries(patch)) body['u_' + sub + '_' + k] = JSON.stringify(v);
  const r = await fbFetch(`/users/${uid}.json`, { method: 'PATCH', body: JSON.stringify(body) });
  if (!r.ok) throw new Error('저장 실패 ' + r.status);
}
const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const HABIT_DEFAULT = [];

const MCP_TOOLS = [
  { name: 'get_today', description: '오늘(또는 지정한 날짜)의 Bashy 요약: 습관 체크 현황, 식단 칼로리·단백질과 목표, 체크리스트, 최근 몸무게, 구글 할 일. 사용자가 오늘 상황을 물으면 먼저 부른다.',
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD (생략하면 한국 시간 오늘)' } } } },
  { name: 'log_meal', description: '식단에 음식을 기록한다. 칼로리·탄단지는 당신(AI)이 추정해서 넣는다. 여러 음식이면 음식마다 한 번씩 부른다.',
    inputSchema: { type: 'object', required: ['meal', 'name', 'kcal'], properties: {
      meal: { type: 'string', enum: ['아침', '점심', '저녁', '간식'] }, name: { type: 'string', description: '음식 이름과 양 (예: 김치찌개 1인분)' },
      kcal: { type: 'number' }, protein: { type: 'number', description: 'g' }, carb: { type: 'number', description: 'g' }, fat: { type: 'number', description: 'g' },
      date: { type: 'string', description: 'YYYY-MM-DD' } } } },
  { name: 'check_habit', description: '습관을 완료(또는 취소) 표시한다. 이름 일부만 맞아도 된다.',
    inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, done: { type: 'boolean', default: true }, date: { type: 'string' } } } },
  { name: 'add_task', description: '구글 할 일(기본 목록)에 할 일을 추가한다. Bashy 일정 카드에 바로 보인다.',
    inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } },
  { name: 'complete_task', description: '구글 할 일에서 제목이 맞는 할 일을 완료 처리한다.',
    inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } },
  { name: 'log_body', description: '몸무게(필수)와 체지방률·골격근량(선택)을 인바디 기록에 남긴다.',
    inputSchema: { type: 'object', required: ['kg'], properties: { kg: { type: 'number' }, body_fat: { type: 'number', description: '%' }, muscle: { type: 'number', description: 'kg' }, date: { type: 'string' } } } },
  { name: 'add_memo', description: 'Bashy 메모를 추가한다.',
    inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, content: { type: 'string' } } } },
  { name: 'get_body_history', description: '최근 인바디(몸무게·체지방·근육량) 기록을 날짜순으로 돌려준다.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } } },
];

async function mcpCall(uid, name, a) {
  a = a || {};
  const sub = await googleSub(uid);
  if (!sub && name !== 'add_task' && name !== 'complete_task') throw new Error('Bashy 기록을 찾지 못했습니다 — 앱에 한 번 로그인해 주세요');
  if (name === 'get_today') {
    const ds = kstDate(a.date);
    const [habits, checked, diet, dset, cl, ib, tk] = await Promise.all([
      uget(uid, sub, 'gl_habits_list', HABIT_DEFAULT), uget(uid, sub, 'gl_habits_' + ds, []),
      uget(uid, sub, 'gl_diet_' + ds, {}), uget(uid, sub, 'gl_diet_settings', { calorieGoal: 2200, proteinGoal: 160 }),
      uget(uid, sub, 'gl_checklist_v2', []), uget(uid, sub, 'gl_inbody_v1', []),
      tasks(uid).catch(() => null),
    ]);
    const items = Object.values(diet || {}).flat();
    const sum = k => Math.round(items.reduce((t, i) => t + (Number(i[k]) || 0), 0));
    const last = (ib || []).slice().sort((x, y) => String(x.dt).localeCompare(String(y.dt))).pop() || null;
    return {
      date: ds,
      habits: (habits || []).filter(h => !h.deletedFrom || h.deletedFrom > ds).map(h => ({ name: h.name, done: (checked || []).includes(h.id) })),
      diet: { kcal: sum('cal'), protein: sum('protein'), goal_kcal: dset.calorieGoal, goal_protein: dset.proteinGoal,
        meals: Object.fromEntries(Object.entries(diet || {}).map(([m, l]) => [m, (l || []).map(i => `${i.name} ${i.cal}kcal`)])) },
      checklist: (cl || []).filter(i => !i.done).slice(0, 20).map(i => i.title),
      body: last,
      tasks: tk && tk.tasks ? tk.tasks.slice(0, 20).map(t => ({ title: t.title, due: t.due })) : '구글 연결 필요',
    };
  }
  if (name === 'log_meal') {
    const ds = kstDate(a.date), meal = ['아침', '점심', '저녁', '간식'].includes(a.meal) ? a.meal : '간식';
    const d = await uget(uid, sub, 'gl_diet_' + ds, { 아침: [], 점심: [], 저녁: [], 간식: [] });
    (d[meal] = d[meal] || []).push({ name: String(a.name).slice(0, 60), base: String(a.name).slice(0, 60), unit: '', qty: 1,
      cal: Math.round(Number(a.kcal) || 0), protein: +(Number(a.protein) || 0).toFixed(1), carb: +(Number(a.carb) || 0).toFixed(1), fat: +(Number(a.fat) || 0).toFixed(1), src: 'mcp' });
    await uset(uid, sub, { ['gl_diet_' + ds]: d });
    const tot = Object.values(d).flat().reduce((t, i) => t + (Number(i.cal) || 0), 0);
    return { ok: true, date: ds, meal, today_kcal: tot };
  }
  if (name === 'check_habit') {
    const ds = kstDate(a.date);
    const list = await uget(uid, sub, 'gl_habits_list', []);
    const q = norm(a.name);
    const h = list.find(x => norm(x.name) === q) || list.find(x => norm(x.name).includes(q) || q.includes(norm(x.name)));
    if (!h) return { ok: false, error: '그런 습관이 없습니다', habits: list.map(x => x.name) };
    const ck = new Set(await uget(uid, sub, 'gl_habits_' + ds, []));
    if (a.done === false) ck.delete(h.id); else ck.add(h.id);
    await uset(uid, sub, { ['gl_habits_' + ds]: [...ck] });
    return { ok: true, habit: h.name, done: a.done !== false, date: ds };
  }
  if (name === 'add_task') { const r = await taskAdd(uid, a.title); return r.needConsent ? { ok: false, error: '구글 연결이 필요합니다 — Bashy 앱에서 다시 로그인해 주세요' } : { ok: true, title: a.title }; }
  if (name === 'complete_task') {
    const t = await tasks(uid);
    if (t.needConsent) return { ok: false, error: '구글 연결이 필요합니다' };
    const q = norm(a.title);
    const hit = t.tasks.find(x => norm(x.title) === q) || t.tasks.find(x => norm(x.title).includes(q));
    if (!hit) return { ok: false, error: '그런 할 일이 없습니다', open: t.tasks.slice(0, 15).map(x => x.title) };
    await taskDone(uid, hit.list, hit.id, false);
    return { ok: true, done: hit.title };
  }
  if (name === 'log_body') {
    const ds = kstDate(a.date), kg = Number(a.kg);
    if (!(kg > 20 && kg < 300)) throw new Error('몸무게 값이 이상합니다');
    const r = await uget(uid, sub, 'gl_inbody_v1', []);
    const cur = r.find(x => x.dt === ds) || {};
    const rec = { ...cur, dt: ds, wt: Math.round(kg * 10) / 10 };
    if (Number(a.body_fat) > 0) rec.bf = Math.round(Number(a.body_fat) * 10) / 10;
    if (Number(a.muscle) > 0) { rec.ms = Math.round(Number(a.muscle) * 10) / 10; delete rec.msEst; }
    const next = r.filter(x => x.dt !== ds).concat(rec).sort((x, y) => String(x.dt).localeCompare(String(y.dt)));
    await uset(uid, sub, { gl_inbody_v1: next });
    return { ok: true, record: rec };
  }
  if (name === 'add_memo') {
    const m = await uget(uid, sub, 'gl_memos_v1', []);
    const now = new Date().toISOString();
    const content = String(a.content || '').slice(0, 5000);
    const html = content.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>');
    m.unshift({ id: 'memo_' + Date.now(), title: String(a.title).slice(0, 100), html, content, createdAt: now, updatedAt: now });
    await uset(uid, sub, { gl_memos_v1: m });
    return { ok: true };
  }
  if (name === 'get_body_history') {
    const r = await uget(uid, sub, 'gl_inbody_v1', []);
    return r.slice().sort((x, y) => String(x.dt).localeCompare(String(y.dt))).slice(-Math.min(60, Number(a.limit) || 10));
  }
  throw new Error('알 수 없는 도구: ' + name);
}

async function mcpHandle(req, res, code) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'MCP: POST 만 받습니다' }); return; }
  const uid = await mcpVerify(code);
  if (!uid) { res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: '주소가 맞지 않습니다 — Bashy 설정 › AI 에서 커넥터 주소를 다시 복사해 주세요' } }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const one = async (m) => {
    if (!m || m.id === undefined || m.id === null) return null;   // 알림(notifications/*)은 답하지 않는다
    const ok = result => ({ jsonrpc: '2.0', id: m.id, result });
    try {
      if (m.method === 'initialize') return ok({ protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18',
        capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'bashy', version: '1.0.0' },
        instructions: 'Bashy 는 사용자의 하루 기록 앱이다(습관·식단·할 일·몸무게·메모). 사용자가 먹은 것·한 일·몸무게를 말하면 해당 도구로 기록하고, 오늘 상황을 물으면 get_today 를 먼저 부른다. 칼로리는 당신이 추정한다. 날짜는 한국 시간 기준.' });
      if (m.method === 'ping') return ok({});
      if (m.method === 'tools/list') return ok({ tools: MCP_TOOLS });
      if (m.method === 'tools/call') {
        const p = m.params || {};
        try {
          const out = await mcpCall(uid, p.name, p.arguments);
          return ok({ content: [{ type: 'text', text: JSON.stringify(out) }] });
        } catch (e) { return ok({ content: [{ type: 'text', text: '실패: ' + (e.message || e) }], isError: true }); }
      }
      if (m.method === 'resources/list') return ok({ resources: [] });
      if (m.method === 'prompts/list') return ok({ prompts: [] });
      return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found: ' + m.method } };
    } catch (e) { return { jsonrpc: '2.0', id: m.id, error: { code: -32603, message: e.message || String(e) } }; }
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter(Boolean);
    if (!out.length) { res.status(202).end(); return; }
    res.status(200).json(out); return;
  }
  const r = await one(body);
  if (!r) { res.status(202).end(); return; }
  res.status(200).json(r);
}

// ── 캘린더 구독 주소(ICS) 대신 받기 ─────────────────────
// 브라우저는 네이버·아이클라우드·아웃룩의 .ics 주소를 직접 못 읽는다(CORS). 로그인한 사용자(Firebase ID 토큰)만
// 이 서버가 대신 받아 원문을 돌려준다. 해석은 화면(js/cal-sources.js)이 한다.
// 남의 서버를 두드리는 통로가 되지 않게: http(s)·webcal 만, 내부망·루프백 주소 거절, 2MB·10초 제한, 리다이렉트도 다시 검사.
const ICS_MAX = 2 * 1024 * 1024;
const ICS_TIMEOUT = 10000;
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return privateIp(m[1]);
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith('::ffff:') || x.startsWith('64:ff9b:');
  }
  return true;
}
async function publicHost(host) {
  const h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(h)) return false;
  if (net.isIP(h)) return !privateIp(h);
  try {
    const addrs = await dns.lookup(h, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every(a => !privateIp(a.address));
  } catch { return false; }
}
async function icsFetch(idToken, raw) {
  const uid = await uidFromIdToken(idToken);
  if (!uid) return { status: 401, error: '로그인이 필요합니다' };
  let s = String(raw || '').trim();
  if (s.length > 2000) return { status: 400, error: '주소가 너무 깁니다' };
  s = s.replace(/^webcals?:\/\//i, 'https://');
  let url;
  try { url = new URL(s); } catch { return { status: 400, error: '주소 형식이 맞지 않습니다' }; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ICS_TIMEOUT);
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return { status: 400, error: 'http(s)·webcal 주소만 쓸 수 있습니다' };
      if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) return { status: 400, error: '쓸 수 없는 포트입니다' };
      if (!(await publicHost(url.hostname))) return { status: 400, error: '공개된 인터넷 주소만 쓸 수 있습니다' };
      const r = await fetch(url, { redirect: 'manual', signal: ctl.signal,
        headers: { 'User-Agent': 'BashyCalendar/1.0 (+https://bashy.app)', Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url); continue; }
      if (!r.ok) return { status: 502, error: `캘린더 주소가 응답하지 않습니다(HTTP ${r.status})` };
      if (Number(r.headers.get('content-length') || 0) > ICS_MAX) return { status: 413, error: '캘린더가 너무 큽니다(2MB 초과)' };
      const reader = r.body.getReader(), parts = [];
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        n += value.length;
        if (n > ICS_MAX) { try { await reader.cancel(); } catch {} return { status: 413, error: '캘린더가 너무 큽니다(2MB 초과)' }; }
        parts.push(Buffer.from(value));
      }
      const text = Buffer.concat(parts).toString('utf8').replace(/^\uFEFF/, '');
      if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 4000))) return { status: 422, error: '캘린더(ICS) 주소가 아닙니다' };
      return { status: 200, ok: true, text };
    }
    return { status: 502, error: '리다이렉트가 너무 많습니다' };
  } catch (e) {
    return { status: 502, error: e.name === 'AbortError' ? '캘린더 주소가 너무 느립니다' : '캘린더를 받지 못했습니다' };
  } finally { clearTimeout(timer); }
}

const send = (res, r) => { const { status, ...rest } = r; res.status(status || 200).json(rest); };

module.exports = async (req, res) => {
  const mc = (req.query && req.query.mcp) || (String(req.url || '').match(/[?&]mcp=([^&]+)/) || [])[1];
  if (mc) { try { await mcpHandle(req, res, decodeURIComponent(mc)); } catch (e) { res.status(500).json({ error: e.message }); } return; }
  if ((req.query && req.query.st === 'cb') || /[?&]st=cb\b|\/st\/callback/.test(String(req.url || ''))) { try { await stCallback(req, res); } catch (e) { res.statusCode = 302; res.setHeader('Location', 'https://bashy.app/?st=fail'); res.end(); } return; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST만 허용' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.act === 'pairStart')   { res.status(200).json({ ok: true, ...(await pairStart()) }); return; }
    if (body.act === 'pairApprove') { send(res, await pairApprove(body.idToken, body.pin)); return; }
    if (body.act === 'pairPoll')    { send(res, await pairPoll(body.pin, body.pairId)); return; }
    if (body.act === 'stStart')     { send(res, await stStart(body.idToken)); return; }
    if (body.act === 'stStatus')    { send(res, await stStatus(body.idToken, !!body.unlink)); return; }
    if (body.act === 'ics')         { send(res, await icsFetch(body.idToken, body.url)); return; }
    const uid  = await verify(body.code);
    if (!uid) { res.status(401).json({ error: '연결 코드가 맞지 않습니다 — bashy.app 설정에서 다시 확인해 주세요' }); return; }

    if (body.act === 'push')  { res.status(200).json({ ok: true, ...(await push(uid, body.usage)) }); return; }
    if (body.act === 'state') { res.status(200).json({ ok: true, ...(await state(uid, body.days)) }); return; }
    if (body.act === 'tasks') { res.status(200).json({ ok: true, ...(await tasks(uid)) }); return; }
    if (body.act === 'taskAdd') { res.status(200).json({ ok: true, ...(await taskAdd(uid, body.title)) }); return; }
    if (body.act === 'taskDone') { res.status(200).json({ ok: true, ...(await taskDone(uid, body.list, body.id, !!body.undo)) }); return; }
    if (body.act === 'ping')  { res.status(200).json({ ok: true }); return; }
    if (body.act === 'stDevices') { try { res.status(200).json({ ok: true, ...(await stDevices(uid)) }); } catch (e) { res.status(e.code === 'NOLINK' ? 409 : 502).json({ error: e.message, nolink: e.code === 'NOLINK' }); } return; }
    if (body.act === 'stStart')   { send(res, await stStartUid(uid)); return; }
    if (body.act === 'stCmd')     { try { res.status(200).json(await stCmd(uid, body)); } catch (e) { res.status(502).json({ error: e.message }); } return; }
    if (body.act === 'cfgGet') { res.status(200).json({ ok: true, cfg: await cfgGet(uid) }); return; }
    if (body.act === 'cfgPut') { res.status(200).json({ ok: true, ...(await cfgPut(uid, body.cfg)) }); return; }
    res.status(400).json({ error: '알 수 없는 act' });
  } catch (e) {
    console.error('[hub]', e);
    res.status(500).json({ error: e.message });
  }
};

// 테스트용
module.exports._t = { parseCode, clean, slotKey, sameSecret, cleanCfg, privateIp, publicHost };
