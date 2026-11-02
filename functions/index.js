// functions/index.js — Bashy 서버(API)를 Firebase(Cloud Functions)에서 돌린다.
//
// 2026-11 Vercel 무료 한도(Fluid Active CPU)를 넘어 사이트가 한 달 멈춘 뒤, 무료 범위가 훨씬 넓은
// Firebase 로 옮겼다(Blaze 무료 범위: 월 호출 200만 · CPU 200,000초). api/*.js 는 Vercel 때와 똑같은
// (req, res) 핸들러라 손대지 않고, 이 파일이 주소(/api/<이름>)를 보고 해당 파일로 넘겨준다.
//   · 배포 때(scripts/fb-build.mjs) 저장소의 api/ lib/ data/ 를 이 폴더로 복사한다.
//   · 환경변수는 env.json(배포 때 만들어짐, 저장소에 없음)에서 읽는다 — FIREBASE_ 로 시작하는 이름은
//     Firebase 가 .env 에 못 쓰게 막아서 파일로 따로 둔다.
const fs = require('fs');
const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');

try {
  const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'env.json'), 'utf8'));
  for (const [k, v] of Object.entries(env)) if (process.env[k] == null || k.startsWith('FIREBASE_')) process.env[k] = v;
} catch (e) { console.warn('[env] env.json 없음', e.message); }

const NAMES = new Set(fs.readdirSync(path.join(__dirname, 'api')).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)));
const cache = {};
const load = n => cache[n] || (cache[n] = require('./api/' + n + '.js'));

exports.api = onRequest({
  region: 'us-central1',
  timeoutSeconds: 300,      // 알림 발송(cron-notify)이 길게 걸릴 때가 있다
  memory: '512MiB',
  maxInstances: 5,          // 혹시 모를 폭주에도 요금이 무한정 늘지 않게
  invoker: 'public',
}, async (req, res) => {
  const p = req.path || '/';
  let name = null;
  // /mcp/<코드> — Vercel 의 rewrite(/api/hub?mcp=:code)를 여기서 대신한다
  const mcp = p.match(/^\/mcp\/([^/]+)/);
  if (mcp) { req.query = { ...(req.query || {}), mcp: decodeURIComponent(mcp[1]) }; name = 'hub'; }
  else if (/^\/st\/callback/.test(p)) { req.query = { ...(req.query || {}), st: 'cb' }; name = 'hub'; }
  else { const m = p.match(/^\/api\/([a-z0-9-]+)/i); if (m && NAMES.has(m[1])) name = m[1]; }
  if (!name) { res.status(404).json({ error: '없는 주소' }); return; }
  // Vercel 처럼 본문이 비어 있으면 빈 객체 대신 그대로 둔다(핸들러들이 문자열·객체 둘 다 처리한다)
  try { await load(name)(req, res); }
  catch (e) { console.error('[' + name + ']', e); if (!res.headersSent) res.status(500).json({ error: e.message }); }
});
