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

const { fbFetch, fbGet } = require('../lib/fb-admin');
const { koName } = require('../lib/hevy-map');

const API     = 'https://api.hevyapp.com/v1';
const RAW_KEY = 'gl_hevy_v1';
const RT_KEY  = 'gl_hevy_routines_v1';   // 루틴(계획). 기록과 달리 자주 안 바뀐다.
const KEEP    = 200;      // 오래된 것부터 잘라낸다. 대시보드는 최근을 본다.
const MAX_PAGE = 30;

async function hevy(path) {
  const r = await fetch(API + path, {
    headers: { 'api-key': process.env.HEVY_API_KEY, 'Accept': 'application/json' },
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
let _prefix = null;
async function findPrefix(uid) {
  if (_prefix) return _prefix;
  const keys = await fbGet('/users/' + uid + '.json?shallow=true');
  if (!keys || typeof keys !== 'object') return null;
  for (const k of Object.keys(keys)) {
    const m = k.match(/^(u_.+?_)gl_/);
    if (m) { _prefix = m[1]; return _prefix; }
  }
  return null;
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

async function syncRoutines(path) {
  const out = [];
  let pages = 1;
  // pageSize 는 10 이 최대다(Hevy 문서). 루틴 쉰 개까지는 다섯 번이면 다 받는다.
  for (let p = 1; p <= Math.min(pages, 5); p++) {
    const r = await hevy('/routines?page=' + p + '&pageSize=10');
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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const uid = process.env.HEVY_UID || process.env.INBODY_UID;   // 같은 사람의 Firebase UID 다
  if (!process.env.HEVY_API_KEY) { res.status(500).json({ error: 'HEVY_API_KEY 미설정' }); return; }
  if (!uid) { res.status(500).json({ error: 'HEVY_UID / INBODY_UID 미설정' }); return; }

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

  try {
    const prefix = await findPrefix(uid);
    if (!prefix) { reply(409, { error: '앱 데이터를 찾지 못했습니다. 앱에서 한 번 로그인해 주세요.' }); return; }
    const path = '/users/' + uid + '/' + prefix + RAW_KEY + '.json';

    const cur  = await readList(path);
    // 처음이면 전체를 긁는다. 그 뒤로는 최근 한 페이지면 충분하다 —
    // 웹후크가 즉시 넣고, 크론은 한 시간 안의 빠진 것만 메우면 된다.
    const full = cur.length === 0 || (req.query && req.query.sync === 'all');

    const fetched = [];
    let pages = 1;
    for (let p = 1; p <= (full ? Math.min(pages, MAX_PAGE) : 1); p++) {
      const r = await hevy('/workouts?page=' + p + '&pageSize=10');
      if (r.status !== 200) { reply(502, { error: 'Hevy 응답 ' + r.status, head: r.head, page: p }); return; }
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
    const rt = req.method === 'GET'
      ? await syncRoutines('/users/' + uid + '/' + prefix + RT_KEY + '.json')
      : { skipped: true };

    // 바뀐 게 없으면 쓰지 않는다. 매시간 같은 값을 덮어쓰면 다른 기기가 매번 '변경됨' 으로 깨어난다.
    if (!added && !updated) {
      // 루틴만 바뀌었을 수도 있다. 그때는 타임스탬프를 올려 다른 기기가 알아채게 한다.
      if (rt && rt.changed) await touch(uid);
      reply(200, { ok: true, changed: false, total: out.length, full: full, routines: rt });
      return;
    }

    // 앱이 localStorage 문자열로 다루므로 같은 형식(JSON 문자열)으로 저장한다.
    const put = await fbFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(out)),
    });
    if (!put.ok) throw new Error('RTDB PUT ' + put.status);

    await touch(uid);

    reply(200, { ok: true, changed: true, added: added, updated: updated, total: out.length,
                 full: full, routines: rt });
  } catch (e) {
    console.error('[hevy]', e);
    reply(500, { error: e.message });
  }
};
