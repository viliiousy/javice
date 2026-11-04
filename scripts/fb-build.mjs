// scripts/fb-build.mjs — Firebase 배포 준비(.github/workflows/deploy.yml 이 부른다)
//   ① public/   : 사이트 정적 파일(앱 래퍼·확장·문서·서버 코드 등은 뺀다 — 예전 .vercelignore 와 같은 기준)
//   ② functions/: 서버 코드(api/ lib/ data/) 복사
//   ③ functions/env.json : 환경변수 — 인자로 받은 .env 파일(vercel env pull 로 받은 것)을 JSON 으로 바꾼다
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'public'), fn = path.join(root, 'functions');
const SKIP = new Set(['.git', '.github', 'app', 'hub-app', 'extension', 'docs', 'scripts', 'tests', 'node_modules', 'api', 'lib', 'data',
  'functions', 'public', 'vercel.json', 'firebase.json', '.firebaserc', '.vercelignore', '.gitignore', '.env', '.env.production']);
const cp = (s, d) => fs.cpSync(s, d, { recursive: true, filter: f => !/(^|\/)\.DS_Store$/.test(f) });

fs.rmSync(pub, { recursive: true, force: true }); fs.mkdirSync(pub);
for (const f of fs.readdirSync(root)) {
  if (SKIP.has(f) || f.endsWith('.md')) continue;
  cp(path.join(root, f), path.join(pub, f));
}
// 웹 새 버전 알림용 — 열어 둔 창이 예전 코드로 계속 도는 것을 막는다(js/app-update.js WebFresh)
fs.writeFileSync(path.join(pub, 'build.json'), JSON.stringify({ v: process.env.GITHUB_SHA || String(Date.now()) }));
for (const d of ['api', 'lib', 'data']) { fs.rmSync(path.join(fn, d), { recursive: true, force: true }); cp(path.join(root, d), path.join(fn, d)); }

const envFile = process.argv[2];
if (envFile && fs.existsSync(envFile)) {
  const out = {}, hidden = [];
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
    let v = m[2];
    if (v.startsWith('"')) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"'); } }
    if (/^VERCEL|^TURBO_|^NX_/.test(m[1])) continue;   // Vercel 이 넣는 자기 변수는 뺀다
    if (v === '[SENSITIVE]') { hidden.push(m[1]); continue; }   // Vercel '민감' 값은 내려받을 수 없다 → 깃허브 시크릿 FUNCTIONS_ENV 에서 채운다
    out[m[1]] = v;
  }
  // 비밀 값은 깃허브 저장소 시크릿에서 받는다(워크플로가 FN_<이름> 으로 넘겨준다) — Vercel 은 '민감' 값을 내려주지 않는다
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('FN_') && v) out[k.slice(3)] = v;
  out.FIREBASE_DB_URL = out.FIREBASE_DB_URL || 'https://javice-6b647-default-rtdb.asia-southeast1.firebasedatabase.app';
  fs.writeFileSync(path.join(fn, 'env.json'), JSON.stringify(out));
  console.log('env.json:', Object.keys(out).join(', '));
  const miss = hidden.filter(k => !(k in out));
  if (miss.length) console.log('::warning::아직 없는 비밀 값(깃허브 시크릿에 넣어야 함):', miss.join(', '));
}
const n = (d) => fs.readdirSync(d, { recursive: true }).length;
console.log(`public/ ${n(pub)}개 · functions/api ${fs.readdirSync(path.join(fn, 'api')).length}개`);
