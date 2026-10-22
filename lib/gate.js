// lib/gate.js — 가입 승인 · 운영 관리 · 사용 통계 (api/hub.js 의 act: gate / adm / usage)
//
// 지금은 서버 여력이 넉넉하지 않아 '운영자가 승인한 계정만' 쓴다. 나중에 서버를 늘리면 OPEN 을 켜면 된다.
//   /approvals/<uid> = { email, name, msg, status: pending|approved|blocked, at, decided, last }
//   /usage/<YYYY-MM-DD>/<uid> = { opens, cats: { 식단: n, 운동: n, … } }   (서버 값 increment 로 더한다)
//   /admin_uid = 운영자의 Firebase uid (가입 신청 알림을 보낼 기기를 찾는 데 쓴다)
// 운영자 계정은 이메일로 정한다. 운영자 확인은 언제나 서버에서(로그인 토큰의 이메일) 한다.
const { tfetch } = require('./http');
const { fbFetch, fbGet } = require('./fb-admin');
const fcm = require('./fcm');

const ADMIN = ['yanggnay119@gmail.com'];
const OPEN = process.env.SIGNUP_OPEN === '1';   // 누구나 가입(나중에 서버 증설 후)
const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBWrrQLSK-krXQMwuueI_dw893bK5-hmPY';
const safe = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
const J = { 'Content-Type': 'application/json' };
const put = (p, v) => fbFetch(p, { method: 'PUT', headers: J, body: JSON.stringify(v) });
const patch = (p, v) => fbFetch(p, { method: 'PATCH', headers: J, body: JSON.stringify(v) });
const kst = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

async function who(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const r = await tfetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
    { method: 'POST', headers: J, body: JSON.stringify({ idToken }) });
  if (!r.ok) return null;
  const u = ((await r.json().catch(() => ({}))).users || [])[0];
  if (!u || !u.localId) return null;
  const email = String(u.email || (u.providerUserInfo || []).map(p => p.email).find(Boolean) || '').toLowerCase();
  return { uid: safe(u.localId), email, name: String(u.displayName || (u.providerUserInfo || []).map(p => p.displayName).find(Boolean) || '').slice(0, 40) };
}
const isAdmin = w => !!w && ADMIN.includes(w.email);

// 운영자 기기로 알림(가입 신청)
async function notifyAdmin(title, body) {
  try {
    const uid = await fbGet('/admin_uid.json'); if (!uid) return;
    const t = await fbGet(`/fcm_tokens/${safe(uid)}.json`); if (!t) return;
    const toks = [];
    if (t.devices) for (const d of Object.values(t.devices)) if (d && d.token && !d.invalid) toks.push(d.token);
    if (t.token && !t.invalid) toks.push(t.token);
    for (const tok of toks) {
      if (typeof tok !== 'string' || tok.startsWith('local_') || tok.startsWith('{') || tok.length < 30) continue;
      await fcm.send({ token: tok, data: { title, body, slot: 'signup' }, webpush: { fcm_options: { link: '/?admin=1' } },
        apns: { payload: { aps: { alert: { title, body }, sound: 'default' } } } });
    }
  } catch (e) { console.warn('[gate] notify', e.message); }
}

// 로그인할 때마다: 내 상태를 알려 준다. req 가 있으면 가입 신청(한마디 msg 함께)
async function gate(body) {
  const w = await who(body.idToken);
  if (!w) return { status: 401, error: '다시 로그인해 주세요' };
  if (isAdmin(w)) {
    await put('/admin_uid.json', w.uid).catch(() => {});
    await patch(`/approvals/${w.uid}.json`, { email: w.email, name: w.name || '운영자', status: 'approved', last: Date.now() }).catch(() => {});
    return { ok: true, state: 'approved', admin: true };
  }
  let a = await fbGet(`/approvals/${w.uid}.json`).catch(() => null);
  if (OPEN && (!a || a.status === 'pending')) {
    a = { email: w.email, name: w.name, msg: a?.msg || '', status: 'approved', at: a?.at || Date.now(), decided: Date.now(), auto: true };
    await put(`/approvals/${w.uid}.json`, a);
  }
  if (body.req && (!a || a.status === 'pending')) {
    const msg = String(body.msg || '').trim().slice(0, 200);
    const first = !a;
    a = { email: w.email, name: String(body.name || w.name || '').slice(0, 40), msg, status: 'pending', at: a?.at || Date.now() };
    await put(`/approvals/${w.uid}.json`, a);
    if (first || body.again) await notifyAdmin('Bashy 가입 신청', `${a.name || a.email}${msg ? ` — ${msg.slice(0, 80)}` : ''}`);
  }
  if (a && a.status === 'approved') patch(`/approvals/${w.uid}.json`, { last: Date.now() }).catch(() => {});
  return { ok: true, state: a ? a.status : 'none', msg: a?.msg || '', email: w.email };
}

// 앱이 몇 분마다 보내는 사용량 — 승인된 사람만 센다
const CATS = ['열기', '일정', '할일', '습관', '체크리스트', '메모', '식단', '운동', '운동모드', '인바디', '경제', 'AI', '스마트홈', '설정', '위젯'];
async function usage(body) {
  const w = await who(body.idToken);
  if (!w) return { status: 401, error: 'login' };
  const a = await fbGet(`/approvals/${w.uid}/status.json`).catch(() => null);
  if (a !== 'approved' && !isAdmin(w)) return { ok: false };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day || '') ? body.day : kst();
  const up = {};
  for (const [k, n] of Object.entries(body.cats || {})) {
    if (!CATS.includes(k)) continue;
    const v = Math.max(0, Math.min(500, Math.round(Number(n) || 0))); if (!v) continue;
    up[`cats/${k}`] = { '.sv': { increment: v } };
  }
  up.at = Date.now();
  await patch(`/usage/${day}/${w.uid}.json`, up);
  patch(`/approvals/${w.uid}.json`, { last: Date.now() }).catch(() => {});
  return { ok: true };
}

// 운영자 화면
async function adm(body) {
  const w = await who(body.idToken);
  if (!isAdmin(w)) return { status: 403, error: '운영자만 볼 수 있습니다' };
  const op = String(body.op || 'list'), uid = safe(body.uid);
  if (op !== 'list') {
    if (!uid) return { status: 400, error: 'uid' };
    if (op === 'approve' || op === 'unblock') await patch(`/approvals/${uid}.json`, { status: 'approved', decided: Date.now() });
    else if (op === 'block') await patch(`/approvals/${uid}.json`, { status: 'blocked', decided: Date.now() });
    else if (op === 'reject') await fbFetch(`/approvals/${uid}.json`, { method: 'DELETE' });
    else if (op === 'delete') {
      // 기록까지 지운다. 다음에 그 계정으로 로그인하면 처음부터 다시 가입 신청을 해야 한다.
      for (const p of [`/users/${uid}`, `/fcm_tokens/${uid}`, `/econ_prices/${uid}`, `/approvals/${uid}`]) await fbFetch(`${p}.json`, { method: 'DELETE' }).catch(() => {});
    } else return { status: 400, error: 'op' };
  }
  // 목록 + 통계(최근 7일)
  const ap = (await fbGet('/approvals.json').catch(() => null)) || {};
  const days = Array.from({ length: 7 }, (_, i) => kst(Date.now() - i * 864e5)).reverse();
  const use = (await fbGet(`/usage.json?orderBy=%22$key%22&startAt=%22${days[0]}%22`).catch(() => null)) || {};
  const daily = days.map(d => ({ d, n: Object.keys(use[d] || {}).length }));
  const week = new Set(), cats = {}, per = {};
  for (const d of days) for (const [u, v] of Object.entries(use[d] || {})) {
    week.add(u);
    const p = per[u] = per[u] || { days: 0, hits: 0, today: 0 };
    p.days++;
    for (const [k, n] of Object.entries((v && v.cats) || {})) { cats[k] = (cats[k] || 0) + (Number(n) || 0); p.hits += Number(n) || 0; if (d === days[6]) p.today += Number(n) || 0; }
  }
  const users = Object.entries(ap).map(([id, a]) => ({ uid: id, email: a.email || '', name: a.name || '', msg: a.msg || '', status: a.status || 'pending',
    at: a.at || 0, last: a.last || 0, admin: ADMIN.includes(String(a.email || '').toLowerCase()), ...(per[id] || { days: 0, hits: 0, today: 0 }) }))
    .sort((x, y) => (x.status === 'pending' ? -1 : 0) - (y.status === 'pending' ? -1 : 0) || (y.last || y.at) - (x.last || x.at));
  return { ok: true, users, stats: {
    total: users.filter(u => u.status === 'approved').length, pending: users.filter(u => u.status === 'pending').length,
    blocked: users.filter(u => u.status === 'blocked').length, dau: daily[6].n, wau: week.size, daily, cats, open: OPEN } };
}

module.exports = { gate, usage, adm, isAdmin, ADMIN };
