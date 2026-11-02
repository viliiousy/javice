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
  maxInstances: 3,          // 혹시 모를 폭주에도 요금이 무한정 늘지 않게(동시에 도는 서버 수 상한)
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

// ── 요금 안전장치: 예산을 넘으면 결제 연결을 끊어 더 이상 청구되지 않게 한다 ─────────────
// 예산 알림(Cloud Billing 예산)은 '알림' 일 뿐 청구를 막지 않는다. 구글이 안내하는 방식대로
// 예산 → Pub/Sub 주제(billing-alerts) → 이 함수 → 프로젝트의 결제 계정 연결 해제.
//   · 끊기면 Firebase 가 무료(Spark) 범위로 돌아간다: 사이트·데이터베이스는 무료 한도 안에서 계속 되고,
//     서버 함수(이 파일)는 멈춘다. 다시 켜려면 Firebase 콘솔에서 Blaze 로 다시 바꾸면 된다.
//   · 한도: env.json 의 BILLING_CAP_KRW (없으면 5,000원). 예산 금액보다 작게 두면 그 금액에서 끊긴다.
const { onMessagePublished } = require('firebase-functions/v2/pubsub');
exports.billingGuard = onMessagePublished({ topic: 'billing-alerts', region: 'us-central1', maxInstances: 1, memory: '256MiB' }, async (event) => {
  const d = (event.data && event.data.message && event.data.message.json) || {};
  const cap = Number(process.env.BILLING_CAP_KRW || 5000);
  const cost = Number(d.costAmount || 0);
  console.log('[billing]', JSON.stringify({ cost, budget: d.budgetAmount, currency: d.currencyCode, cap }));
  if (!(cost >= cap)) return;
  const pid = process.env.GCLOUD_PROJECT || 'javice-6b647';
  const tk = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } }).then(r => r.json());
  const url = `https://cloudbilling.googleapis.com/v1/projects/${pid}/billingInfo`;
  const cur = await fetch(url, { headers: { Authorization: 'Bearer ' + tk.access_token } }).then(r => r.json());
  if (!cur.billingEnabled) { console.log('[billing] 이미 결제가 꺼져 있음'); return; }
  const r = await fetch(url, { method: 'PUT', headers: { Authorization: 'Bearer ' + tk.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ billingAccountName: '' }) });
  console.error('[billing] 한도 ' + cap + '원 초과(' + cost + ') → 결제 연결 해제:', r.status, (await r.text()).slice(0, 300));
});
