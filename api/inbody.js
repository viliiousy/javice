// api/inbody.js — iOS 단축어(애플 헬스) → 인바디 기록 자동 저장
// 단축어는 OAuth를 못 하므로 공유 비밀키로 인증하고, DB 쓰기는 서비스 계정으로 한다.

const { fbFetch, fbGet } = require('../lib/fb-admin');

const RAW_KEY = 'gl_inbody_v1';

// 애플 헬스에서 받는 값. 기초대사량(bmr)은 헬스에 없어 수동 입력을 유지한다.
// 골격근량(ms)도 헬스에 없지만, 과거 실측 기록으로 회귀식을 세워 추정한다(아래 estimateMs).
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

// ── 골격근량 추정 ────────────────────────────────────────────────
// 애플 헬스는 제지방량(lbm)까지만 준다. 골격근량은 제지방량에 거의 비례하지만
// 비율이 체지방률에 따라 완만히 움직여서(마를수록 상승) 2변수 회귀가 가장 정확했다.
//   실측 84건 기준 시간순 검증: 평균오차 0.09kg, 98%가 ±0.3kg 이내
//   (인바디 기기 자체 재현오차와 비슷한 수준)
// 계수는 고정하지 않고 이 사람의 실측 기록에서 매번 다시 구한다. 체성분이
// 장기적으로 변해도 따라가고, 다른 사람이 써도 그 사람 몸에 맞춰진다.
const MS_FIT_MIN   = 12;   // 이보다 실측이 적으면 기본 계수 사용
const MS_FIT_WINDOW = 40;  // 최근 N건만 학습 (최근 구간이 근소하게 더 정확)
const MS_FALLBACK  = [-2.4377, 0.61375, -0.016172];  // 84건 전체 적합값
const MS_RATIO     = 0.5691;                          // 최후 수단: 제지방량 대비 비율

// 3x3 정규방정식을 가우스 소거로 푼다. 특이행렬이면 null.
function solve3(A, b) {
  const m = [[...A[0], b[0]], [...A[1], b[1]], [...A[2], b[2]]];
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    if (Math.abs(m[p][i]) < 1e-9) return null;
    [m[i], m[p]] = [m[p], m[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = m[r][i] / m[i][i];
      for (let c = i; c < 4; c++) m[r][c] -= f * m[i][c];
    }
  }
  const x = [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  return x.every(v => isFinite(v)) ? x : null;
}

// 실측(=추정이 아닌) 기록만 학습 대상. 추정치를 다시 학습하면 오차가 누적된다.
function fitMs(list) {
  const rows = list
    .filter(r => r && !r.msEst && Number(r.ms) > 0 && Number(r.lbm) > 0 && Number(r.bf) > 0)
    .slice(-MS_FIT_WINDOW);
  if (rows.length < MS_FIT_MIN) return { coef: MS_FALLBACK, n: rows.length, src: '기본' };

  const A = [[0,0,0],[0,0,0],[0,0,0]], b = [0,0,0];
  for (const r of rows) {
    const x = [1, Number(r.lbm), Number(r.bf)], y = Number(r.ms);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += x[i] * x[j];
      b[i] += x[i] * y;
    }
  }
  const coef = solve3(A, b);
  if (!coef) return { coef: MS_FALLBACK, n: rows.length, src: '기본' };
  return { coef, n: rows.length, src: '학습' };
}

function estimateMs(list, rec) {
  const lbm = Number(rec.lbm), bf = Number(rec.bf);
  if (!(lbm > 0) || !(bf > 0)) return null;

  const { coef, n, src } = fitMs(list);
  let ms = coef[0] + coef[1] * lbm + coef[2] * bf;

  // 회귀가 이상한 값을 내면(학습 데이터가 한쪽으로 쏠린 경우 등) 단순 비율로 후퇴
  if (!isFinite(ms) || ms < 10 || ms > lbm) ms = MS_RATIO * lbm;
  if (!isFinite(ms) || ms < 10 || ms > lbm) return null;

  return { ms: Math.round(ms * 10) / 10, n, src };
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
      res.status(409).json({ error: '앱 데이터를 찾지 ꫻했습니다. 앱에서 한 번 로그인한 뒤 다시 시도하세요.' });
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

    // 골격근량: 실측이 있으면 손대지 않고, 없거나 이전 추정치면 다시 추정한다
    let est = null;
    const measured = Number(rec.ms) > 0 && !rec.msEst;
    if (!measured) {
      est = estimateMs(list, rec);
      if (est) { rec.ms = est.ms; rec.msEst = true; }
    }

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
      골격근량: measured ? '실측 유지'
              : est     ? `추정 ${est.ms}kg (${est.src} 계수, 실측 ${est.n}건)`
                        : '추정 불가(제지방량·체지방률 필요)',
      총개수: list.length,
    });
  } catch (e) {
    console.error('[inbody]', e);
    res.status(500).json({ error: e.message });
  }
};
