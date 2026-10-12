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
//   tasks : 허브 왼쪽의 구글 할일. 서버에 있는 리프레시 토큰(/google_refresh/<구글 sub>)으로
//           읽기만 한다. 구글 sub 는 사용자 데이터 키의 접두사(u_<sub>_)에서 얻는다.

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

async function tasks(uid) {
  const sub = await googleSub(uid);
  if (!sub) return { needConsent: true, reason: '구글 계정을 찾지 못했습니다' };
  const t = await accessTokenFor(sub);
  if (t.needConsent || !t.access_token) return { needConsent: true, reason: t.reason || 'bashy.app 에서 구글 접근을 한 번 더 허용해 주세요' };
  const tok = t.access_token;
  const base = 'https://tasks.googleapis.com/tasks/v1';
  const ls = await gget(tok, `${base}/users/@me/lists?maxResults=100`);
  const lists = (ls.items || []).map(l => ({ id: l.id, title: l.title }));
  const per = await Promise.all(lists.map(l =>
    gget(tok, `${base}/lists/${encodeURIComponent(l.id)}/tasks?showCompleted=false&showHidden=false&maxResults=100`)
      .then(j => (j.items || []).filter(x => x.title && x.status !== 'completed').map(x => ({
        id: x.id, list: l.id, title: String(x.title).slice(0, 200),
        due: x.due ? x.due.slice(0, 10) : null, pos: x.position || '', sub: !!x.parent,
      })))
      .catch(() => [])));
  return { lists, tasks: per.flat() };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST만 허용' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const uid  = await verify(body.code);
    if (!uid) { res.status(401).json({ error: '연결 코드가 맞지 않습니다 — bashy.app 설정에서 다시 확인해 주세요' }); return; }

    if (body.act === 'push')  { res.status(200).json({ ok: true, ...(await push(uid, body.usage)) }); return; }
    if (body.act === 'state') { res.status(200).json({ ok: true, ...(await state(uid, body.days)) }); return; }
    if (body.act === 'tasks') { res.status(200).json({ ok: true, ...(await tasks(uid)) }); return; }
    if (body.act === 'ping')  { res.status(200).json({ ok: true }); return; }
    res.status(400).json({ error: 'act 는 push / state / tasks / ping 중 하나' });
  } catch (e) {
    console.error('[hub]', e);
    res.status(500).json({ error: e.message });
  }
};

// 테스트용
module.exports._t = { parseCode, clean, slotKey, sameSecret };
