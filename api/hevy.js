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

async function findPrefix(uid) {
  const keys = await fbGet('/users/' + uid + '.json?shallow=true');
  if (!keys || typeof keys !== 'object') return null;
  for (const k of Object.keys(keys)) {
    const m = k.match(/^(u_.+?_)gl_/);
    if (m) return m[1];
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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const uid = process.env.HEVY_UID || process.env.INBODY_UID;   // 같은 사람의 Firebase UID 다
  if (!process.env.HEVY_API_KEY) { res.status(500).json({ error: 'HEVY_API_KEY 미설정' }); return; }
  if (!uid) { res.status(500).json({ error: 'HEVY_UID / INBODY_UID 미설정' }); return; }

  const ok = [process.env.CRON_SECRET, process.env.HEVY_WEBHOOK_SECRET]
    .filter(Boolean).map(s => 'Bearer ' + s);
  if (!ok.length) { res.status(500).json({ error: '인증 비밀이 하나도 설정되어 있지 않습니다' }); return; }
  if (!ok.includes(req.headers.authorization || '')) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const prefix = await findPrefix(uid);
    if (!prefix) { res.status(409).json({ error: '앱 데이터를 찾지 못했습니다. 앱에서 한 번 로그인해 주세요.' }); return; }
    const path = '/users/' + uid + '/' + prefix + RAW_KEY + '.json';

    const cur  = await readList(path);
    // 처음이면 전체를 긁는다. 그 뒤로는 최근 한 페이지면 충분하다 —
    // 웹후크가 즉시 넣고, 크론은 한 시간 안의 빠진 것만 메우면 된다.
    const full = cur.length === 0 || (req.query && req.query.sync === 'all');

    const fetched = [];
    let pages = 1;
    for (let p = 1; p <= (full ? Math.min(pages, MAX_PAGE) : 1); p++) {
      const r = await hevy('/workouts?page=' + p + '&pageSize=10');
      if (r.status !== 200) { res.status(502).json({ error: 'Hevy 응답 ' + r.status, head: r.head, page: p }); return; }
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

    // 바뀐 게 없으면 쓰지 않는다. 매시간 같은 값을 덮어쓰면 다른 기기가 매번 '변경됨' 으로 깨어난다.
    if (!added && !updated) {
      res.status(200).json({ ok: true, changed: false, total: out.length, full: full });
      return;
    }

    // 앱이 localStorage 문자열로 다루므로 같은 형식(JSON 문자열)으로 저장한다.
    const put = await fbFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(out)),
    });
    if (!put.ok) throw new Error('RTDB PUT ' + put.status);

    // 앱이 다음 폴링에서 변경을 알아채도록 타임스탬프를 올린다.
    await fbFetch('/users/' + uid + '/_savedAt.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(String(Date.now())),
    });

    res.status(200).json({ ok: true, changed: true, added: added, updated: updated, total: out.length, full: full });
  } catch (e) {
    console.error('[hevy]', e);
    res.status(500).json({ error: e.message });
  }
};
