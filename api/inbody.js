// api/inbody.js — iOS 단축어(애플 헬스) → 인바디 기록 자동 저장
// 단축어는 OAuth를 못 하므로 공유 비밀키로 인증하고, DB 쓰기는 서비스 계정으로 한다.

const { fbFetch, fbGet } = require('../lib/fb-admin');

const RAW_KEY = 'gl_inbody_v1';

// 애플 헬스에서 받는 값. 골격근량(ms)·기초대사량(bmr)은 헬스에 없어 수동 입력을 유지한다.
const FIELDS = {
  wt:  { min: 20, max: 400 },   // 체중 kg
  bf:  { min: 1,  max: 70  },   // 체지방률 %
  lbm: { min: 10, max: 300 },   // 제지방 체중 kg
  bmi: { min: 5,  max: 100 },   // 체질량 지수
};

function num(v, spec) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  if (n < spec.min || n > spec.max) return null;   // 단위 착오·오타 방어
  return Math.round(n * 10) / 10;
}

function seoulToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 앱은 localStorage 키를 `u_<구글ID>_<키>` 로 저장하고 그대로 Firebase에 올린다.
// 이 접두사는 경로의 Firebase UID와 다른 값이라, 기존 키에서 직접 찾아낸다.
async function findPrefix(uid) {
  const keys = await fbGet(`/users/${uid}.json?shallow=true`);
  if (!keys || typeof keys !== 'object') return null;
  for (const k of Object.keys(keys)) {
    const m = k.match(/^(u_.+?_)gl_/);
    if (m) return m[1];
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST만 허용' }); return; }

  const secret = process.env.INBODY_SECRET;
  const uid    = process.env.INBODY_UID;
  if (!secret || !uid) { res.status(500).json({ error: 'INBODY_SECRET / INBODY_UID 미설정' }); return; }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const incoming = {};
    for (const [k, spec] of Object.entries(FIELDS)) {
      const v = num(body[k], spec);
      if (v !== null) incoming[k] = v;
    }
    // 지표별로 단축어를 나눠 쓰면 체중 없이 오는 요청도 있다. 하나라도 있으면 받는다.
    if (!Object.keys(incoming).length) {
      res.status(400).json({ error: 'wt/bf/lbm/bmi 중 최소 하나는 있어야 합니다', 받은값: body });
      return;
    }

    const dt = /^\d{4}-\d{2}-\d{2}$/.test(body.dt || '') ? body.dt : seoulToday();

    const prefix = await findPrefix(uid);
    if (!prefix) {
      res.status(409).json({ error: '앱 데이터를 찾지 못했습니다. 앱에서 한 번 로그인한 뒤 다시 시도하세요.' });
      return;
    }
    const path = `/users/${uid}/${prefix}${RAW_KEY}.json`;

    const raw = await fbGet(path);
    let list = [];
    if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch {} }
    else if (Array.isArray(raw)) list = raw;
    if (!Array.isArray(list)) list = [];

    // 같은 날짜면 병합 — 수동 입력한 골격근량·기초대사량을 덮어쓰지 않는다
    const idx  = list.findIndex(r => r && r.dt === dt);
    const rec  = { ...(idx >= 0 ? list[idx] : {}), dt, ...incoming };
    if (idx >= 0) list[idx] = rec; else list.push(rec);
    list.sort((a, b) => String(a.dt).localeCompare(String(b.dt)));

    // 앱이 localStorage 문자열로 다루므로 같은 형식(JSON 문자열)으로 저장
    const put = await fbFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(list)),
    });
    if (!put.ok) throw new Error(`RTDB PUT ${put.status}`);

    // 앱이 다음 폴링에서 변경을 감지하도록 타임스탬프 갱신
    await fbFetch(`/users/${uid}/_savedAt.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(String(Date.now())),
    });

    res.status(200).json({
      ok: true, dt, 저장: rec,
      처리: idx >= 0 ? '기존일자 병합' : '새 기록',
      총개수: list.length,
    });
  } catch (e) {
    console.error('[inbody]', e);
    res.status(500).json({ error: e.message });
  }
};
