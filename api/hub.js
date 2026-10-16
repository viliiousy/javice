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

const crypto = require('crypto');
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
const CFG_FIELDS = { haUrl: 300, haUrlExt: 300, haToken: 600, aiUrl: 300, aiToken: 600, aiModel: 60, wakeWord: 30 };
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

const send = (res, r) => { const { status, ...rest } = r; res.status(status || 200).json(rest); };

module.exports = async (req, res) => {
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
    const uid  = await verify(body.code);
    if (!uid) { res.status(401).json({ error: '연결 코드가 맞지 않습니다 — bashy.app 설정에서 다시 확인해 주세요' }); return; }

    if (body.act === 'push')  { res.status(200).json({ ok: true, ...(await push(uid, body.usage)) }); return; }
    if (body.act === 'state') { res.status(200).json({ ok: true, ...(await state(uid, body.days)) }); return; }
    if (body.act === 'tasks') { res.status(200).json({ ok: true, ...(await tasks(uid)) }); return; }
    if (body.act === 'taskAdd') { res.status(200).json({ ok: true, ...(await taskAdd(uid, body.title)) }); return; }
    if (body.act === 'taskDone') { res.status(200).json({ ok: true, ...(await taskDone(uid, body.list, body.id, !!body.undo)) }); return; }
    if (body.act === 'ping')  { res.status(200).json({ ok: true }); return; }
    if (body.act === 'cfgGet') { res.status(200).json({ ok: true, cfg: await cfgGet(uid) }); return; }
    if (body.act === 'cfgPut') { res.status(200).json({ ok: true, ...(await cfgPut(uid, body.cfg)) }); return; }
    res.status(400).json({ error: '알 수 없는 act' });
  } catch (e) {
    console.error('[hub]', e);
    res.status(500).json({ error: e.message });
  }
};

// 테스트용
module.exports._t = { parseCode, clean, slotKey, sameSecret, cleanCfg };
