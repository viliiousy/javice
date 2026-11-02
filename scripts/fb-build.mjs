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
for (const d of ['api', 'lib', 'data']) { fs.rmSync(path.join(fn, d), { recursive: true, force: true }); cp(path.join(root, d), path.join(fn, d)); }

const envFile = process.argv[2];
if (envFile && fs.existsSync(envFile)) {
  const out = {};
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
    let v = m[2];
    if (v.startsWith('"')) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"'); } }
    if (/^VERCEL|^TURBO_|^NX_/.test(m[1])) continue;   // Vercel 이 넣는 자기 변수는 뺀다
    out[m[1]] = v;
  }
  fs.writeFileSync(path.join(fn, 'env.json'), JSON.stringify(out));
  console.log('env.json:', Object.keys(out).join(', '));
}
const n = (d) => fs.readdirSync(d, { recursive: true }).length;
console.log(`public/ ${n(pub)}개 · functions/api ${fs.readdirSync(path.join(fn, 'api')).length}개`);
