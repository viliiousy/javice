// lib/vt-rank.js — '들어 올린 무게' 순위 (api/hub.js 의 act: vt)
//
// 앱이 자기 총볼륨(레벨 계산에 쓰는, 비정상 기록을 거른 값)과 레벨을 올리면
// /vt_rank/<uid> = { v, vy(어제까지), lv, at } 로 둔다(서비스 계정만 읽고 쓴다). 돌려주는 것:
//   rank  : 내 등수(총볼륨 큰 순, 1등부터)   total : 기록이 있는 사람 수
//   levels: { 레벨: 그 레벨에 있는 사람 수 }   avgLv·avgV: 운동한 사람의 평균 레벨·총볼륨   sumY: 모두 합친 지금까지 총볼륨
// 이름·이메일 같은 개인 정보는 저장하지도 돌려주지도 않는다 — 숫자만.
const { fbGet, fbFetch } = require('./fb-admin');
const { who } = require('./gate');

let CACHE = null;   // 모든 사람 기록 — 1분 기억(여러 사람이 열어도 Firebase 는 한 번)
async function all(force) {
  if (!force && CACHE && Date.now() - CACHE.t < 60e3) return CACHE.v;
  const v = (await fbGet('/vt_rank.json').catch(() => null)) || {};
  CACHE = { t: Date.now(), v };
  return v;
}

async function vt(body) {
  const w = await who(body.idToken);
  if (!w) return { ok: false, error: '로그인이 필요합니다', code: 401 };
  const v = Math.max(0, Math.min(1e9, Math.round(Number(body.v) || 0)));   // kg, 앱이 이미 하루·주 상한으로 거른 값
  const lv = Math.max(0, Math.min(999, Math.round(Number(body.lv) || 0)));
  const vy = Math.max(0, Math.min(v, Math.round(Number(body.vy) || 0)));   // 어제까지의 총볼륨
  const A = await all();
  const prev = A[w.uid];
  if (v > 0 && (!prev || prev.v !== v || prev.lv !== lv || prev.vy !== vy)) {
    const rec = { v, vy, lv, at: Date.now() };
    await fbFetch(`/vt_rank/${w.uid}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) }).catch(() => {});
    A[w.uid] = rec;
  }
  const list = Object.values(A).filter(x => x && x.v > 0);
  const levels = {};
  for (const x of list) levels[x.lv] = (levels[x.lv] || 0) + 1;
  const mine = A[w.uid] ? A[w.uid].v : 0;
  const rank = mine > 0 ? 1 + list.filter(x => x.v > mine).length : 0;
  // 운동한 사람(총볼륨이 있는 사람)의 평균 레벨·평균 총볼륨, 모두 합친 어제까지의 총볼륨
  const n = list.length || 1;
  const avgLv = Math.round(list.reduce((a, x) => a + (x.lv || 0), 0) / n * 10) / 10;
  const avgV = Math.round(list.reduce((a, x) => a + x.v, 0) / n);
  // 모두 합친 볼륨 = 지금까지(오늘 포함) 각자의 총볼륨 합 — '어제까지' 로 두면 오늘 운동한 만큼 빠져 평균보다 작아 보였다
  const sumY = list.reduce((a, x) => a + (x.v || 0), 0);
  return { ok: true, rank, total: list.length, levels, avgLv, avgV, sumY };
}

module.exports = { vt };
