// api/hevy.js — Hevy(운동 기록 앱) → 대시보드
//
// 들어오는 길이 둘이다.
//   1) Hevy 웹후크(POST) — 운동을 저장하는 순간 Hevy 가 여기를 두드린다. 즉시 반영된다.
//   2) 매시 정각 알림 크론(GET) — 웹후크가 한 번 실패해도 한 시간 안에 메워진다.
// 크론을 새로 만들지 않았다. 이미 도는 notify.yml 에 한 줄 얹었을 뿐이다 —
// 2026-08-26 에 1분 크론 하나 때문에 실패 메일이 쏟아진 걸 그대로 겪었다.
//
// 인증은 CRON_SECRET 또는 HEVY_WEBHOOK_SECRET 중 하나면 통과한다.
// 앞엣것은 이미 있으니 웹후크 없이도 오늘부터 돌고, 웹후크는 나중에 붙여도 된다.
//
// API 키는 서버에만 둔다. Hevy API 에는 기록을 만들고 지우는 엔드포인트도 있다 —
// 브라우저에 두면 그건 공개된 것과 같다.
//
// 2026-09-01: 사람마다 제 키를 쓴다.
// 예전에는 HEVY_API_KEY / HEVY_UID 가 환경변수 하나씩이었다. 그러면 누가 가입하든
// 같은 사람의 운동 기록이 보인다 — 앱스토어 심사관이 데모 계정으로 들어와도 그렇다.
// 이제 키는 /users/<uid>/_link/hevyKey 에 사람마다 따로 있고, 크론은 키가 있는 사람만 돈다.
// 키가 없는 사람은 그냥 Hevy 연동이 없는 것이고, 그건 오류가 아니다.

const { fbFetch, fbGet } = require('../lib/fb-admin');
const { koName } = require('../lib/hevy-map');

const API     = 'https://api.hevyapp.com/v1';
const RAW_KEY = 'gl_hevy_v1';
const RT_KEY  = 'gl_hevy_routines_v1';   // 루틴(계획). 기록과 달리 자주 안 바뀐다.
const KEEP    = 200;      // 오래된 것부터 잘라낸다. 대시보드는 최근을 본다.
const MAX_PAGE = 30;
const MAX_USERS = 20;   // 한 번 실행에서 볼 사람 수 상한. 크론이 예산 안에 끝나야 한다.

async function hevy(path, apiKey) {
  const r = await fetch(API + path, {
    headers: { 'api-key': apiKey, 'Accept': 'application/json' },
  });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* head 로 확인한다 */ }
  return { status: r.status, body: body, head: text.slice(0, 200) };
}

// start_time 은 UTC 다. 그대로 자르면 새벽 운동이 전날로 밀린다.
function seoulDate(iso) {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 세트에서 있는 값만 남긴다. 없는 값을 0 으로 채우면 '안 했다' 와 '모른다' 가 섞인다.
function normSet(s) {
  const o = {};
  if (Number(s.weight_kg)       > 0) o.w = Number(s.weight_kg);
  if (Number(s.reps)            > 0) o.r = Number(s.reps);
  if (Number(s.duration_seconds)> 0) o.t = Number(s.duration_seconds);
  if (Number(s.distance_meters) > 0) o.d = Number(s.distance_meters);
  return o;
}

function normalize(w) {
  const items = (w.exercises || []).map(e => {
    const sets = (e.sets || []).map(normSet).filter(o => Object.keys(o).length);
    // 볼륨은 중량×횟수만 센다. 유산소 세트는 볼륨이 0 이지만 기록은 남는다.
    const vol = sets.reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0);
    const top = sets.reduce((a, s) => Math.max(a, s.w || 0), 0);
    return {
      name: koName(e.exercise_template_id, e.title),
      raw:  e.title,
      sets: sets,
      top:  Math.round(top * 10) / 10,
      vol:  Math.round(vol),
    };
  }).filter(it => it.sets.length);

  const st = new Date(w.start_time).getTime(), en = new Date(w.end_time).getTime();
  return {
    id:    w.id,
    dt:    seoulDate(w.start_time),
    title: w.title || '',
    min:   isFinite(st) && isFinite(en) && en > st ? Math.round((en - st) / 60000) : null,
    vol:   items.reduce((a, i) => a + i.vol, 0),
    items: items,
  };
}

// ── 루틴 ────────────────────────────────────────────────────
// 기록(workouts)이 '한 것' 이라면 루틴은 '할 것' 이다. 앱의 요일별 계획이 여태
// 코드에 박혀 있었는데, 정작 사람은 Hevy 에서 루틴을 짠다. 두 곳을 손으로 맞춰 놓는 건
// 언젠가 반드시 어긋난다. 짜는 곳을 하나로 두고 앱은 받아만 쓴다.
function normRoutine(r) {
  const items = (r.exercises || []).map(e => {
    const sets = e.sets || [];
    const reps = sets.map(s => Number(s.reps)).filter(v => v > 0);
    // 세트가 전부 같은 횟수면 '4×10', 아니면 세트 수만. 없는 값을 지어내지 않는다.
    let label = '';
    if (reps.length === sets.length && reps.length && reps.every(v => v === reps[0]))
      label = sets.length + '×' + reps[0];
    else if (sets.length) label = sets.length + '세트';
    return { name: koName(e.exercise_template_id, e.title), sets: label };
  }).filter(it => it.name);
  return { id: r.id, title: r.title || '이름 없음', updated: r.updated_at || '', items: items };
}

// 한 번 찾으면 바뀌지 않는다. 웜 인스턴스에서 왕복 하나를 던다 — 5초 예산이 빠듯해서다.
//
// 캐시는 반드시 uid 별이어야 한다. 예전엔 전역 변수 하나였는데, 사람이 둘이 되는 순간
// 두 번째 사람이 첫 번째 사람의 prefix 로 경로를 만든다 — 남의 칸에 쓰는 것이다.
const _prefix = new Map();
async function findPrefix(uid) {
  if (_prefix.has(uid)) return _prefix.get(uid);
  const keys = await fbGet('/users/' + uid + '.json?shallow=true');
  let found = null;
  if (keys && typeof keys === 'object') {
    for (const k of Object.keys(keys)) {
      const m = k.match(/^(u_.+?_)gl_/);
      if (m) { found = m[1]; break; }
    }
  }
  _prefix.set(uid, found);
  return found;
}

// 이 사람의 Hevy API 키. 없으면 null — 연동을 안 한 사람이다.
//
// HEVY_UID/HEVY_API_KEY 환경변수는 옮겨 심는 동안만 남겨 둔다. 그 사람이 앱에서
// 키를 한 번 넣으면 Firebase 쪽이 이기고, 그때 환경변수를 지우면 된다.
async function hevyKeyFor(uid) {
  try {
    const k = await fbGet('/users/' + uid + '/_link/hevyKey.json');
    if (typeof k === 'string' && k.trim()) return k.trim();
  } catch (e) { /* 아직 없는 경로는 오류가 아니다 */ }
  if (uid === process.env.HEVY_UID && process.env.HEVY_API_KEY) return process.env.HEVY_API_KEY;
  return null;
}

// 키를 넣어 둔 사람들. shallow 로 uid 목록만 받고 한 명씩 확인한다.
async function usersWithKey() {
  const all = await fbGet('/users.json?shallow=true');
  const uids = (all && typeof all === 'object') ? Object.keys(all) : [];
  const out = [];
  for (const uid of uids) {
    if (out.length >= MAX_USERS) break;          // 크론이 예산 안에 끝나야 한다
    const key = await hevyKeyFor(uid);
    if (key) out.push({ uid: uid, key: key });
  }
  return out;
}

async function readList(path) {
  const raw = await fbGet(path);
  let list = [];
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch (e) {} }
  else if (Array.isArray(raw)) list = raw;
  return Array.isArray(list) ? list : [];
}

// 앱이 다음 폴링에서 변경을 알아채도록 타임스탬프를 올린다.
async function touch(uid) {
  await fbFetch('/users/' + uid + '/_savedAt.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(String(Date.now())),
  }).catch(() => {});
}

async function syncRoutines(path, apiKey) {
  const out = [];
  let pages = 1;
  // pageSize 는 10 이 최대다(Hevy 문서). 루틴 쉰 개까지는 다섯 번이면 다 받는다.
  for (let p = 1; p <= Math.min(pages, 5); p++) {
    const r = await hevy('/routines?page=' + p + '&pageSize=10', apiKey);
    if (r.status !== 200) return { ok: false, status: r.status, head: r.head };
    pages = (r.body && r.body.page_count) || 1;
    for (const x of ((r.body && r.body.routines) || [])) {
      const n = normRoutine(x);
      if (n.items.length) out.push(n);
    }
  }
  const cur = await readList(path);
  // 바뀐 게 없으면 안 쓴다. 매시간 같은 값을 덮어쓰면 다른 기기가 매번 깨어난다.
  if (JSON.stringify(cur) === JSON.stringify(out)) return { ok: true, changed: false, n: out.length };
  const put = await fbFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(out)),
  });
  if (!put.ok) return { ok: false, status: put.status };
  return { ok: true, changed: true, n: out.length };
}

// 한 사람 몫. 예전에는 이게 전부 handler 안에 펼쳐져 있었는데,
// 사람이 여럿이 되면서 같은 일을 반복해야 해서 밖으로 뺐다.
async function syncOne(uid, apiKey, opts) {
  const wantAll  = !!(opts && opts.all);
  const withRoutines = !!(opts && opts.routines);

  const prefix = await findPrefix(uid);
  // 앱에 한 번도 로그인하지 않은 계정이다. 오류로 세우지 않고 이 사람만 건너뛴다 —
  // 크론은 나머지 사람들 몫을 마저 해야 한다.
  if (!prefix) return { uid: uid, skipped: '앱 데이터 없음' };

  const path = '/users/' + uid + '/' + prefix + RAW_KEY + '.json';
  const cur  = await readList(path);
  // 처음이면 전체를 긁는다. 그 뒤로는 최근 한 페이지면 충분하다 —
  // 웹후크가 즉시 넣고, 크론은 한 시간 안의 빠진 것만 메우면 된다.
  const full = cur.length === 0 || wantAll;

  const fetched = [];
  let pages = 1;
  for (let p = 1; p <= (full ? Math.min(pages, MAX_PAGE) : 1); p++) {
    const r = await hevy('/workouts?page=' + p + '&pageSize=10', apiKey);
    if (r.status !== 200) return { uid: uid, error: 'Hevy 응답 ' + r.status, head: r.head, page: p };
    pages = (r.body && r.body.page_count) || 1;
    for (const w of ((r.body && r.body.workouts) || [])) {
      const n = normalize(w);
      if (n.dt && n.items.length) fetched.push(n);
    }
  }

  const byId = new Map(cur.filter(w => w && w.id).map(w => [w.id, w]));
  let added = 0, updated = 0;
  for (const w of fetched) {
    const old = byId.get(w.id);
    if (!old) { added++; byId.set(w.id, w); continue; }
    // 같은 운동을 다시 받아온 것뿐이면 건드리지 않는다. 매시간 같은 값을 덮어쓰면
    // 다른 기기가 매번 '변경됨' 으로 깨어나 토스트를 띄운다.
    if (JSON.stringify(old) !== JSON.stringify(w)) { updated++; byId.set(w.id, w); }
  }
  const out = Array.from(byId.values())
    .sort((a, b) => String(a.dt).localeCompare(String(b.dt)))
    .slice(-KEEP);

  // 루틴은 크론(GET)에서만 받아 온다. 웹후크(POST)는 5초 안에 끝나야 해서
  // 왕복을 하나라도 더 얹으면 안 된다. 루틴은 급할 일이 없다 — 한 시간이면 충분하다.
  const rt = withRoutines
    ? await syncRoutines('/users/' + uid + '/' + prefix + RT_KEY + '.json', apiKey)
    : { skipped: true };

  // 바뀐 게 없으면 쓰지 않는다. 매시간 같은 값을 덮어쓰면 다른 기기가 매번 '변경됨' 으로 깨어난다.
  if (!added && !updated) {
    // 루틴만 바뀌었을 수도 있다. 그때는 타임스탬프를 올려 다른 기기가 알아채게 한다.
    if (rt && rt.changed) await touch(uid);
    return { uid: uid, changed: false, total: out.length, full: full, routines: rt };
  }

  // 앱이 localStorage 문자열로 다루므로 같은 형식(JSON 문자열)으로 저장한다.
  const put = await fbFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(out)),
  });
  if (!put.ok) return { uid: uid, error: 'RTDB PUT ' + put.status };

  await touch(uid);
  return { uid: uid, changed: true, added: added, updated: updated,
           total: out.length, full: full, routines: rt };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // PING_SECRET 은 바깥 스케줄러(cron-job.org) 몫이다. 자세한 사연은 api/cron-notify.js 참고.
  const NAMES = ['CRON_SECRET', 'HEVY_WEBHOOK_SECRET', 'PING_SECRET'];
  const have  = NAMES.filter(n => process.env[n]);
  const secrets = have.map(n => process.env[n]);
  if (!secrets.length) { res.status(500).json({ error: '인증 비밀이 하나도 설정되어 있지 않습니다' }); return; }
  // Hevy 웹후크 설정칸에 'Bearer xxx' 로 넣을 수도, 값만 넣을 수도 있다. 둘 다 받는다 —
  // 여기서 틀리면 증상이 '조용히 아무 일도 안 일어남' 이라 원인을 찾기 어렵다.
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  // 이름만 돌려준다(값은 아니다). 401 의 원인이 '값이 틀림' 인지 '아직 배포 안 됨' 인지 갈라 준다.
  if (!secrets.includes(given)) { res.status(401).json({ error: 'Unauthorized', accepts: have }); return; }

  // Hevy 는 5초 안에 200 을 받아야 성공으로 친다(웹후크 설정 화면에 명시돼 있다).
  // 한때 그것 때문에 '먼저 200 을 돌려주고 나중에 일한다' 로 바꿨는데, 그건 틀렸다.
  // Vercel 함수는 응답을 보내는 순간 얼어붙는다 — 뒷일이 그냥 죽는다.
  // 2026-08-27 웹후크 첫 발사에서 200 은 돌아왔는데 기록은 하나도 안 들어갔고,
  // 뒤이어 돈 크론이 added:1 로 집어넣어서야 드러났다. 응답 코드는 아무것도 증명하지 않는다.
  //
  // 그래서 다시 '일을 끝내고 응답한다'. 실측하면 2초 안에 끝나서 5초 안에 들어온다.
  // 그래도 늦어지면 웹후크 한 번을 놓칠 뿐이고, 매시 크론이 같은 걸 메운다.
  let replied = false;
  // endpoint 를 박아 둔다. 바깥 스케줄러에서 URL 을 서로 바꿔 넣어도 둘 다 200 이 떠서
  // 눈치채지 못한다 — 자세한 사연은 api/cron-notify.js 참고.
  const reply = (code, body) => { if (!replied) { replied = true; res.status(code).json({ endpoint:'hevy', ...body }); } };

  const q       = req.query || {};
  const wantAll = q.sync === 'all';

  try {
    // ── 웹후크(POST): 한 사람만 ────────────────────────────────
    // 웹후크는 Hevy 계정 하나에 URL 하나다. 그 URL 을 등록한 사람이 누구인지는
    // 본문으로 알 수 없으므로 ?u=<uid> 로 받는다. 비밀은 위에서 이미 확인했다 —
    // 이 비밀은 운영자만 아는 값이라, 웹후크는 사실상 운영자 전용 통로다.
    // 다른 사람은 웹후크 없이 매시 크론으로 받는다. 한 시간 늦을 뿐 빠지지는 않는다.
    if (req.method === 'POST') {
      const uid = q.u || process.env.HEVY_UID || process.env.INBODY_UID;
      if (!uid) { reply(400, { error: '대상 uid 가 없습니다 (?u=<uid>)' }); return; }
      const key = await hevyKeyFor(uid);
      if (!key) { reply(409, { error: 'Hevy API 키가 없습니다', uid: uid }); return; }
      const r = await syncOne(uid, key, { all: wantAll, routines: false });
      reply(r.error ? 502 : 200, { ok: !r.error, users: 1, results: [r] });
      return;
    }

    // ── 크론(GET): 키를 넣어 둔 사람 전부 ──────────────────────
    // ?u=<uid> 를 주면 그 사람만 돈다. 손으로 한 명을 확인할 때 쓴다.
    let targets;
    if (q.u) {
      const key = await hevyKeyFor(q.u);
      if (!key) { reply(409, { error: 'Hevy API 키가 없습니다', uid: q.u }); return; }
      targets = [{ uid: q.u, key: key }];
    } else {
      targets = await usersWithKey();
    }

    // 아무도 연동하지 않았어도 200 이다. 이건 고장이 아니라 '할 일이 없음' 이다 —
    // 500 을 내면 크론 실패 메일이 매시간 온다.
    if (!targets.length) { reply(200, { ok: true, users: 0, note: 'Hevy 키를 넣은 사람이 없습니다' }); return; }

    const results = [];
    for (const t of targets) {
      try {
        results.push(await syncOne(t.uid, t.key, { all: wantAll, routines: true }));
      } catch (e) {
        // 한 사람이 넘어져도 나머지는 마저 돈다.
        results.push({ uid: t.uid, error: e.message });
      }
    }

    const failed  = results.filter(r => r.error).length;
    const changed = results.filter(r => r.changed).length;
    reply(failed === results.length ? 502 : 200,
          { ok: failed < results.length, users: results.length,
            changed: changed, failed: failed, results: results });
  } catch (e) {
    console.error('[hevy]', e);
    reply(500, { error: e.message });
  }
};
