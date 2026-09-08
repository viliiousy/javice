// lib/cors.js — 앱에서 /api 를 부를 수 있게 연다.
//
// 웹에서는 같은 출처라 CORS 가 아예 필요 없었다. 그런데 앱은 capacitor://localhost 에서
// 돌기 때문에 모든 호출이 교차 출처가 된다 — 헤더가 없으면 브라우저가 응답을 버린다.
// 서버 로그에는 200 이 찍히는데 앱에서는 실패하는, 찾기 고약한 종류의 고장이다.
//
// '*' 로 열지 않는다. /api/gauth 는 구글 액세스 토큰을 돌려주므로
// 아무 사이트나 부를 수 있게 두면 안 된다. 아는 출처만 이름을 불러 준다.
const ALLOW = new Set([
  'https://bashy.app',
  'capacitor://localhost',   // iOS 앱 번들
  'ionic://localhost',
  'http://localhost',        // 개발용 (cap run / 브라우저)
]);

// 프리플라이트까지 여기서 끝냈으면 true 를 준다. 호출부는 그때 곧장 return 한다.
function cors(req, res) {
  const o = req.headers && req.headers.origin;
  if (o && ALLOW.has(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    // 출처마다 응답이 다르므로 캐시가 섞이지 않게 알려 준다.
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

module.exports = { cors, ALLOW };
