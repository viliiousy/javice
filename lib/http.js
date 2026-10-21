// lib/http.js — 바깥으로 나가는 fetch 에 시간 제한을 건다.
//
// fetch 는 기본으로 시간 제한이 없다. 상대 서버(구글·Firebase·SmartThings·식약처·KIS)가
// 응답을 붙잡고 있으면 함수가 Vercel 실행 한도까지 그대로 매달려 있다가 504 로 죽는다 —
// 사용자는 '그냥 안 됨' 만 보고, 로그에는 아무 이유도 남지 않는다.
// 호출부가 이미 signal 을 넘겼으면(ICS 받기처럼 전체 시간을 따로 재는 곳) 그대로 둔다.

const DEFAULT_MS = 10000;

function tfetch(url, opts, ms) {
  const o = opts || {};
  if (o.signal) return fetch(url, o);
  return fetch(url, { ...o, signal: AbortSignal.timeout(ms || DEFAULT_MS) });
}

module.exports = { tfetch, DEFAULT_MS };
