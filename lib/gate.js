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
const OPEN = process.env.SIGNUP_OPEN === '1';
// 승인제를 켠 때(2026-10-22 10:39 KST). 이보다 먼저 만든 계정만 '승인제 이전 사용자' 로 바로 승인한다.
// (예전엔 '/users 에 기록이 있으면' 으로 봤는데, 새 사람도 로그인하자마자 앱이 기록을 올려서 신청만 누르면 그냥 승인됐다)
const GATE_FROM = Date.parse('2026-10-22T01:39:00Z');
const isLegacy = created => !!created && created < GATE_FROM;   // 누구나 가입(나중에 서버 증설 후)
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
  return { uid: safe(u.localId), email, created: Number(u.createdAt) || 0, ...provOf(u), name: String(u.displayName || (u.providerUserInfo || []).map(p => p.displayName).find(Boolean) || '').slice(0, 40) };
}
const isAdmin = w => !!w && ADMIN.includes(w.email);
// 로그인 수단 · 구글 계정 이메일(애플 로그인이라도 구글을 연결했으면 그 이메일)
function provOf(u) {
  const P = u.providerUserInfo || [];
  const g = P.find(p => p.providerId === 'google.com'), a = P.find(p => p.providerId === 'apple.com');
  return { prov: g && a ? 'Apple+Google' : g ? 'Google' : a ? 'Apple' : (P[0] && P[0].providerId) || '', gemail: g && g.email ? String(g.email).toLowerCase() : '', gsub: g && g.rawId ? safe(g.rawId) : '' };
}

// 서비스 계정으로 여러 계정의 이메일·이름 조회(운영자 화면용)
async function authLookup(uids) {
  const out = {};
  try {
    const { getAccessToken, serviceAccount } = require('./fb-admin');
    const tok = await getAccessToken(), pid = serviceAccount().project_id;
    for (let i = 0; i < uids.length; i += 100) {
      const r = await tfetch(`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:lookup`,
        { method: 'POST', headers: { ...J, Authorization: `Bearer ${tok}` }, body: JSON.stringify({ localId: uids.slice(i, i + 100) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { console.warn('[gate] lookup', r.status, JSON.stringify(j).slice(0, 200)); continue; }
      for (const u of j.users || []) out[safe(u.localId)] = {
        email: String(u.email || (u.providerUserInfo || []).map(p => p.email).find(Boolean) || '').toLowerCase(),
        name: String(u.displayName || (u.providerUserInfo || []).map(p => p.displayName).find(Boolean) || '').slice(0, 40),
        created: Number(u.createdAt) || 0, lastLogin: Number(u.lastLoginAt) || 0, ...provOf(u) };
    }
  } catch (e) { console.warn('[gate] lookup', e.message); }
  return out;
}

// Firebase 로그인 계정 전부(서비스 계정) — 운영자 목록의 '진짜' 기준. 구글 계정 번호(sub)로도 찾을 수 있게 묶어 둔다.
// (예전 앱은 기록을 /users/<구글 계정 번호> 에 두었다 — 그 열쇠로는 Firebase 계정이 바로 안 찾아져 '이름 모름' 으로 보였다)
async function authAll() {
  const byUid = {}, bySub = {};
  try {
    const { getAccessToken, serviceAccount } = require('./fb-admin');
    const tok = await getAccessToken(), pid = serviceAccount().project_id;
    let next = '';
    for (let n = 0; n < 20; n++) {
      const r = await tfetch(`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:batchGet?maxResults=500${next ? '&nextPageToken=' + encodeURIComponent(next) : ''}`,
        { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { console.warn('[gate] batchGet', r.status, JSON.stringify(j).slice(0, 200)); break; }
      for (const u of j.users || []) {
        const v = { uid: safe(u.localId), email: String(u.email || (u.providerUserInfo || []).map(p => p.email).find(Boolean) || '').toLowerCase(),
          name: String(u.displayName || (u.providerUserInfo || []).map(p => p.displayName).find(Boolean) || '').slice(0, 40),
          created: Number(u.createdAt) || 0, lastLogin: Number(u.lastLoginAt) || 0, ...provOf(u) };
        byUid[v.uid] = v;
        const g = (u.providerUserInfo || []).find(p => p.providerId === 'google.com');
        if (g && g.rawId) bySub[safe(g.rawId)] = v;
      }
      next = j.nextPageToken; if (!next) break;
    }
  } catch (e) { console.warn('[gate] batchGet', e.message); }
  return { byUid, bySub, ok: Object.keys(byUid).length > 0 };
}

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
  // 승인제 전부터 쓰던 사람(이미 기록이 있는 계정)은 묻지 않고 바로 승인 — 운영자가 관리에서 차단·삭제할 수 있다
  if (!a && isLegacy(w.created)) {
    a = { email: w.email, name: w.name, msg: '승인제 이전부터 쓰던 계정', status: 'approved', at: Date.now(), decided: Date.now(), legacy: true };
    await put(`/approvals/${w.uid}.json`, a);
  }
  // 잘못 '이전 사용자' 로 승인된 새 계정은 대기로 되돌린다(운영자가 직접 승인한 것은 그대로)
  if (a && a.legacy && !a.byAdmin && a.status === 'approved' && w.created && !isLegacy(w.created)) {
    a = { ...a, status: 'pending', legacy: false, msg: a.msg && a.msg !== '승인제 이전부터 쓰던 계정' ? a.msg : '' };
    await put(`/approvals/${w.uid}.json`, a);
  }
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
  // 로그인할 때마다 누구인지 채운다: 로그인 수단, 구글 이메일, 앱에서 쓰는 이름(애플 로그인은 이메일이 가려져 있어 이게 단서다)
  if (a) {
    const up = { last: Date.now(), email: w.email || a.email || '', prov: w.prov || a.prov || '' };
    const hintName = String(body.hname || '').trim().slice(0, 40), hintG = String(body.hgoogle || '').trim().toLowerCase().slice(0, 80);
    if (w.gemail || /@/.test(hintG)) up.gemail = w.gemail || hintG;
    if (hintName && (!a.name || a.legacy || /privaterelay/.test(a.name))) up.name = hintName;
    else if (!a.name && w.name) up.name = w.name;
    patch(`/approvals/${w.uid}.json`, up).catch(() => {});
  }
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
    if (op === 'approve' || op === 'unblock') await patch(`/approvals/${uid}.json`, { status: 'approved', decided: Date.now(), byAdmin: true });
    else if (op === 'block') await patch(`/approvals/${uid}.json`, { status: 'blocked', decided: Date.now() });
    else if (op === 'note') await patch(`/approvals/${uid}.json`, { alias: String(body.alias || '').trim().slice(0, 30), note: String(body.note || '').trim().slice(0, 300) });   // 운영자 메모 · 별칭
    else if (op === 'reject') await fbFetch(`/approvals/${uid}.json`, { method: 'DELETE' });
    else if (op === 'delete') {
      // 기록까지 지운다. 다음에 그 계정으로 로그인하면 처음부터 다시 가입 신청을 해야 한다.
      const gs = ((await authLookup([uid]))[uid] || {}).gsub;   // 예전 열쇠(구글 계정 번호)에 남은 기록도
      if (gs && gs !== uid) for (const p of [`/users/${gs}`, `/approvals/${gs}`]) await fbFetch(`${p}.json`, { method: 'DELETE' }).catch(() => {});
      for (const p of [`/users/${uid}`, `/fcm_tokens/${uid}`, `/econ_prices/${uid}`, `/approvals/${uid}`]) await fbFetch(`${p}.json`, { method: 'DELETE' }).catch(() => {});
    } else return { status: 400, error: 'op' };
  }
  // 목록 + 통계(최근 7일)
  const ap = (await fbGet('/approvals.json').catch(() => null)) || {};
  // 기준은 Firebase 로그인 계정 전부. 로그인 수단·구글 이메일은 매번 최신으로 다시 맞춘다(나중에 구글을 연결한 사람도 바로 보이게).
  // 예전 열쇠(/users/<구글 계정 번호>)로 남은 기록은 그 구글 계정의 Firebase 계정에 묶어 한 줄로 보인다.
  const legacyOf = {};   // Firebase uid → 예전 열쇠
  try {
    const A = await authAll();
    const all = (await fbGet('/users.json?shallow=true').catch(() => null)) || {};
    const ids = new Set([...Object.keys(all).map(safe).filter(Boolean), ...Object.keys(ap)]);
    for (const id of ids) {
      const u = A.byUid[id], v = !u && A.bySub[id];
      if (v) {   // 예전 열쇠 — 진짜 계정 쪽으로 합친다
        legacyOf[v.uid] = id;
        if (ap[id] && ap[v.uid]) { ap[v.uid].last = Math.max(ap[v.uid].last || 0, ap[id].last || 0); if (!ap[v.uid].alias && ap[id].alias) ap[v.uid].alias = ap[id].alias; if (!ap[v.uid].note && ap[id].note) ap[v.uid].note = ap[id].note; }
        if (ap[id]) fbFetch(`/approvals/${id}.json`, { method: 'DELETE' }).catch(() => {});   // 예전 열쇠로 따로 생긴 승인 기록은 정리
        delete ap[id];
        continue;
      }
    }
    for (const u of Object.values(A.byUid)) {
      const cur = ap[u.uid];
      if (!cur) {   // 로그인한 적은 있는데 승인 기록이 없는 사람 — 승인제 이전에 만든 계정만 자동 승인, 그 뒤 계정은 대기
        let last = 0; try { last = Number(await fbGet(`/users/${legacyOf[u.uid] || u.uid}/_savedAt.json`)) || 0; } catch (e) {}
        const old = isLegacy(u.created);
        const a = { email: u.email, name: u.name, prov: u.prov || '?', gemail: u.gemail, msg: old ? '승인제 이전부터 쓰던 계정' : '(아직 신청 안 함)', status: old ? 'approved' : 'pending',
          at: u.created || last || Date.now(), ...(old ? { decided: Date.now(), legacy: true } : {}), last: Math.max(last, u.lastLogin || 0) };
        ap[u.uid] = a; await put(`/approvals/${u.uid}.json`, a).catch(() => {});
        continue;
      }
      // 잘못 '이전 사용자' 로 자동 승인된 새 계정은 대기로 되돌린다(운영자가 직접 승인한 것은 그대로)
      if (cur.legacy && !cur.byAdmin && cur.status === 'approved' && u.created && !isLegacy(u.created)) {
        Object.assign(cur, { status: 'pending', legacy: false, msg: '' });
        await patch(`/approvals/${u.uid}.json`, { status: 'pending', legacy: false, msg: '' }).catch(() => {});
      }
      const up = {};
      if ((u.prov || '?') !== cur.prov) up.prov = u.prov || '?';
      if (u.gemail && u.gemail !== cur.gemail) up.gemail = u.gemail;
      if (u.email && u.email !== cur.email) up.email = u.email;
      if (u.name && !cur.name) up.name = u.name;
      if (u.lastLogin > (cur.last || 0)) cur.last = u.lastLogin;
      if (Object.keys(up).length) { Object.assign(cur, up); await patch(`/approvals/${u.uid}.json`, up).catch(() => {}); }
    }
    // 로그인 계정이 없어진 기록(계정 삭제 등)은 그대로 두되 표시만 한다
    if (A.ok) for (const id of Object.keys(ap)) if (!A.byUid[id]) ap[id].gone = true;
  } catch (e) { console.warn('[gate] backfill', e.message); }
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
  const users = Object.entries(ap).map(([id, a]) => ({ uid: id, email: a.email || '', name: a.name || '', prov: a.prov || '', gemail: a.gemail || '', alias: a.alias || '', note: a.note || '', msg: a.msg || '', status: a.status || 'pending', gone: !!a.gone, legacyKey: legacyOf[id] || '',
    at: a.at || 0, last: a.last || 0, admin: ADMIN.includes(String(a.email || '').toLowerCase()), ...(per[id] || { days: 0, hits: 0, today: 0 }) }))
    .sort((x, y) => (x.status === 'pending' ? -1 : 0) - (y.status === 'pending' ? -1 : 0) || (y.last || y.at) - (x.last || x.at));
  return { ok: true, users, stats: {
    total: users.filter(u => u.status === 'approved').length, pending: users.filter(u => u.status === 'pending').length,
    blocked: users.filter(u => u.status === 'blocked').length, dau: daily[6].n, wau: week.size, daily, cats, open: OPEN } };
}

module.exports = { gate, usage, adm, isAdmin, ADMIN, who };
