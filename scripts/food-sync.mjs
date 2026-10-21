// scripts/food-sync.mjs — 식약처 식품영양성분DB 전체를 받아 data/food-db.json 으로 저장한다.
// .github/workflows/food-sync.yml 이 일주일에 한 번 새벽에 돌린다. 키는 우리 서버(api/food.js ?dump)에만 있고,
// 여기서는 CRON_SECRET 으로 그 문을 연다. 식약처가 느려도 사용자 검색은 이 파일에서 바로 찾는다.
import fs from 'node:fs';

const BASE = process.env.BASE || 'https://bashy.app';
const SEC = process.env.CRON_SECRET;
if (!SEC) { console.error('CRON_SECRET 없음'); process.exit(1); }
const ROWS = Number(process.env.ROWS || 100), PAR = 4;

async function page(n, tries = 4) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/food?dump=1&page=${n}&rows=${ROWS}`, { headers: { Authorization: `Bearer ${SEC}` } });
      const j = await r.json();
      if (j.ok) return j;
      console.warn('page', n, 'try', t, j.error);
    } catch (e) { console.warn('page', n, 'try', t, e.message); }
    await new Promise(r => setTimeout(r, 2000 * t));
  }
  throw new Error('page ' + n + ' 실패');
}

const first = await page(1);
const total = first.total, pages = Math.ceil(total / ROWS);
console.log('total', total, 'pages', pages, 'rows/page', first.items.length);
if (!total || !first.items.length) { console.error('비어 있음 — 기존 파일 유지', JSON.stringify(first).slice(0, 400)); process.exit(1); }
const all = [...first.items];
for (let p = 2; p <= pages; p += PAR) {
  const batch = await Promise.all(Array.from({ length: Math.min(PAR, pages - p + 1) }, (_, k) => page(p + k)));
  batch.forEach(b => all.push(...b.items));
  if (p % 20 < PAR) console.log('…', all.length);
}
console.log('받은 줄', all.length);
if (all.length < total * 0.9) { console.error('너무 적게 받음 — 기존 파일 유지'); process.exit(1); }

const cls = [], grp = [], idx = (arr, v) => { let i = arr.indexOf(v); if (i < 0) { arr.push(v); i = arr.length - 1; } return i; };
const seen = new Set(), r = [];
for (const x of all) {
  if (!x.name || x.kcal === null || x.kcal === undefined) continue;
  const k = [x.name, x.kcal, x.protein, x.carb, x.fat, x.maker].join('|');
  if (seen.has(k)) continue; seen.add(k);
  r.push([x.name, x.kcal, x.protein, x.carb, x.fat, x.per || 100, x.unit === 'mL' ? 1 : 0, x.pack || null, x.maker || '', idx(cls, x.cls || ''), idx(grp, x.group || '')]);
}
r.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const v = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// 한 줄에 음식 하나 — 다음 주에 바뀐 줄만 git 에 남게
const out = `{"v":"${v}","n":${r.length},"cls":${JSON.stringify(cls)},"grp":${JSON.stringify(grp)},"r":[\n` + r.map(a => JSON.stringify(a)).join(',\n') + '\n]}\n';
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/food-db.json', out);
console.log('저장', r.length, '줄', (out.length / 1048576).toFixed(1) + 'MB');
