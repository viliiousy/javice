// tests/smoke.mjs — 배포 전 자동 검사 (깃허브 액션 deploy.yml 이 먼저 돌린다. 하나라도 실패하면 배포하지 않는다)
//
// 왜: 손으로 고친 곳이 다른 화면을 망가뜨려도 아무도 몰랐다(다른 작업이 style.css 를 옛 버전으로 덮어 화면이 깨진 일).
// 브라우저로 index.html 을 실제로 열고, 핵심 기능을 화면 코드 그대로 돌려 결과를 확인한다. 로그인·서버 없이 돈다.
//
//   node tests/smoke.mjs          (playwright 가 설치돼 있어야 한다: npm i -D playwright && npx playwright install chromium)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }

const results = [];
const t = async (name, fn) => { try { const r = await fn(); results.push([true, name, r || '']); } catch (e) { results.push([false, name, e && e.message || String(e)]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

// ── 0. 파일 검사(브라우저 없이) ──────────────────────
await t('style.css 가 잘리거나 옛 버전으로 덮이지 않았다', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const n = css.split('\n').length;
  ok(n > 3000, `style.css 가 ${n}줄 — 너무 짧다(덮어쓰기 사고?)`);
  for (const sel of ['.wk{', '.fit-list', '.diet-food', '.hw-row', '.wko-r', '.fx-kc']) ok(css.includes(sel), `style.css 에 ${sel} 가 없다`);
  return `${n}줄`;
});
await t('index.html 이 읽는 스크립트가 다 있다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const src = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
  const miss = src.filter(s => !fs.existsSync(path.join(ROOT, s)));
  ok(!miss.length, '없는 파일: ' + miss.join(', '));
  return `${src.length}개`;
});
await t('식단 검색 서버: 브랜드로 찾으면 공식값이 위, 기본 음식은 기본이 위', async () => {
  const h = require(path.join(ROOT, 'api/food.js'));
  const run = q => new Promise(r => { const res = { status() { return this; }, json(j) { r(j); }, setHeader() {}, end() {} }; h({ query: { q, rows: 3 }, headers: {}, method: 'GET' }, res); });
  const a = await run('써브웨이 로스트 치킨'); ok(a.items?.[0]?.maker === '써브웨이' && a.items[0].cls === '공식', '써브웨이 공식값이 맨 위가 아니다');
  const b = await run('맥도날드 빅맥'); ok((b.items || []).some(x => /빅맥/.test(x.name)), '맥도날드 빅맥을 못 찾는다');
  const c = await run('김치찌개'); ok(!c.items?.[0]?.maker, '김치찌개 맨 위가 프랜차이즈다');
  return 'ok';
});
await t('동기화 병합: 두 기기가 같은 칸의 다른 항목을 바꾸면 둘 다 남는다', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/firebase-sync.js'), 'utf8');
  const FirebaseSync = new Function('UserStore', 'localStorage', 'document', 'window', src + '\nreturn FirebaseSync;')({}, {}, {}, {});
  ok(typeof FirebaseSync._merge3 === 'function', '_merge3 없음');
  const base = JSON.stringify({ '2026-10-26': 5000 }), mine = JSON.stringify({ '2026-10-26': 5000, '2026-10-27': 3000 }), theirs = JSON.stringify({ '2026-10-26': 7200 });
  const m = JSON.parse(FirebaseSync._merge3(base, mine, theirs));
  ok(m['2026-10-26'] === 7200 && m['2026-10-27'] === 3000, '병합 결과 ' + JSON.stringify(m));
  ok(FirebaseSync._merge3('a', 'b', 'c') === 'b', '문자열은 내 것이 이겨야 한다');
  const arr = FirebaseSync._merge3('[1]', '[1,2]', '[1,3]'); ok(arr === '[1,2]', '배열은 내 것: ' + arr);
  return 'ok';
});

// ── 1. 브라우저 ────────────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// 바깥 서버(구글·파이어베이스·날씨)는 막는다 — 시험은 이 저장소만으로 돈다
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForTimeout(2500);
const E = (name, fn, arg) => t(name, () => page.evaluate(fn, arg));

await t('페이지를 열 때 스크립트 오류가 없다', () => { ok(!errors.length, errors.slice(0, 3).join(' / ')); return 'ok'; });
await E('나눈 파일의 기능이 모두 붙어 있다', () => {
  const need = { Fitness: ['render', 'showDayPlan', 'rpHtml', 'applyList', 'toggleEdit', 'burn', 'pickOne', 'exercisesFor', 'partSheet', 'progList'],
    Diet: ['render', 'addToCart', 'commitCart', '_aiFood', '_fromDb', '_dbSearch'], WorkoutMode: ['start', 'confirmStart', 'paint', 'order'],
    WorkoutHistory: ['day', 'openAll'], Wheel: ['open'], NumIn: ['open'], VolTier: ['tier', 'chip'], FitSettings: [] };
  const miss = []; for (const [o, ms] of Object.entries(need)) { const O = window[o] || eval('typeof ' + o + "!=='undefined'?" + o + ':null'); if (!O) { miss.push(o); continue; } ms.forEach(m => { if (typeof O[m] !== 'function') miss.push(o + '.' + m); }); }
  if (miss.length) throw new Error('없음: ' + miss.join(', ')); return 'ok';
});

// 시험용 화면 칸 — 로그인 전이라 카드가 숨어 있으므로 보이게 한다
await page.evaluate(() => { const a = document.getElementById('app'); if (a) { a.hidden = false; a.style.display = 'block'; } document.querySelectorAll('.card-fitness,.card-habits,.card-diet').forEach(c => c.style.display = 'block'); });
const TODAY = await page.evaluate(() => Fitness._dateStr(new Date()));
const setup = () => page.evaluate(() => { const ds = Fitness._dateStr(new Date()), d = new Date(ds + 'T00:00:00'), dow = d.getDay();
  const dp = Fitness.dayPlan(); dp[dow] = 'part:가슴'; Fitness.saveDayPlan(dp); Fitness.setExtraPicks(ds, []); UserStore.set(Fitness._dayKey(ds), '');
  UserStore.set(Fitness._customKey(d), '[]'); UserStore.set(Fitness._orderKey(ds), '[]'); Fitness._save([], d); PlanGen.saveLog(ds, {}); Fitness._ed = null; WorkoutMode.st = null; });

await setup();
await E('오늘의 운동: 체크하면 완료로 남는다', () => { const d = new Date(); Fitness.render(d); const n = Fitness.exercisesFor(d).list.length; if (n < 3) throw new Error('운동 ' + n + '개');
  Fitness.toggle(0, Fitness._dateStr(d)); if (!Fitness._checked(d).includes(0)) throw new Error('체크 안 됨'); return n + '종목'; });
await setup();
await E('루틴 추가는 2회차로 따로, 비우면 회차가 사라진다', () => { const d = new Date(), ds = Fitness._dateStr(d);
  Fitness.render(d); Fitness.toggleEdit(); Fitness.edAddSet(); const rp = document.querySelector('#modal .rp');
  rp.querySelector('.rp-c[data-k="pa"][data-v="이두"]').click(); rp.querySelectorAll('.rp-x')[0].click(); Fitness._edAddSetGo();
  const s = new Set(Fitness._ed.list.map(x => x.sess)); if (!s.has(1)) throw new Error('2회차 없음');
  Fitness._ed.list = Fitness._ed.list.filter(x => x.sess !== 1); Fitness._ed.dirty = true; Fitness._edPaint();
  if (Fitness.extraPicks(ds).length) throw new Error('빈 회차가 남음'); Fitness.toggleEdit(); return 'ok'; });
await setup();
await E('운동 모드: 운동 중 더한 종목이 카드에 들어가고 완료가 붙는다, 지우고 끝내면 되돌린다', () => { const ds = Fitness._dateStr(new Date()), d = new Date(ds + 'T00:00:00');
  const pick = Fitness.pickOne; Fitness.pickOne = o => o.onPick('케이블 크로스오버');
  try { WorkoutMode.start(ds); const S = WorkoutMode.st; S.ex[0].rows.forEach(r => { r.ok = true; r.w = 40; r.r = 10; }); WorkoutMode.nextEx(); WorkoutMode.addEx();
    const ai = S.ex.findIndex(e => e.name === '케이블 크로스오버'); S.cur = ai; S.ex[ai].rows.forEach(r => { r.ok = true; r.w = 10; r.r = 12; }); WorkoutMode.nextEx();
    const L = Fitness.exercisesFor(d).list.map(x => x.name), chk = Fitness._checked(d).map(i => L.at(i));
    if (!L.includes('케이블 크로스오버')) throw new Error('더한 종목이 카드에 없음'); if (!chk.includes('케이블 크로스오버') || !chk.includes(L.at(0))) throw new Error('완료 표시 ' + chk);
    WorkoutMode._finishDiscard(); if (Fitness.exercisesFor(d).list.some(x => x.name === '케이블 크로스오버')) throw new Error('지우고 끝내도 남음');
  } finally { Fitness.pickOne = pick; } return 'ok'; });
await E('운동 시작 확인: 회차가 둘이면 안 끝난 회차를 고른다', () => { const ds = Fitness._dateStr(new Date()), d = new Date(ds + 'T00:00:00');
  Fitness.setExtraPicks(ds, ['sport:주짓수']); UserStore.set(Fitness._dayKey(ds), ''); const L = Fitness.exercisesFor(d).list; Fitness._save(L.map((x, i) => x.sess === 0 ? i : -1).filter(i => i >= 0), d);
  WorkoutMode.confirmStart(ds); const on = document.querySelector('#modal .wk-cf-ss.on b')?.textContent || ''; App.closeModal(); Fitness.setExtraPicks(ds, []);
  if (!/2회차/.test(on)) throw new Error('고른 회차: ' + on); return on; });
await E('식단: 담고 기록하면 그날 칼로리에 들어간다', () => { const ds = Diet._localDateStr(new Date()); const d = new Date(ds + 'T00:00:00');
  UserStore.set(Diet._key(d), ''); Diet._cart = []; Diet.addToCart({ n: '시험 음식', u: '1개', c: 300, p: 10, cb: 40, ft: 10 }, '점심', ds); Diet.commitCart('점심', ds);
  const dd = Diet.getData(d); const it = (dd['점심'] || []).find(x => x.base === '시험 음식'); if (!it || it.cal !== 300) throw new Error('기록 안 됨');
  UserStore.set(Diet._key(d), ''); return 'ok'; });
await E('습관 띠: 월~일 순서, 오늘은 주황 테두리 칸', () => { Habits.render(new Date()); const cells = [...document.querySelectorAll('#habitsFooter .hw-row .hw span')].map(s => s.textContent);
  if (cells.length && cells.join('') !== '월화수목금토일') throw new Error(cells.join('')); if (cells.length && !document.querySelector('#habitsFooter .hw.today')) throw new Error('오늘 칸 없음'); return cells.join('') || '습관 없음'; });
await E('걸음 수: 아이폰·갤럭시 중 많은 쪽', () => { const ds = Steps._ds(); UserStore.set('gl_steps_ios', JSON.stringify({ [ds]: 5000 })); UserStore.set('gl_steps_android', JSON.stringify({ [ds]: 7200 }));
  const n = Steps.get(new Date()); UserStore.set('gl_steps_ios', ''); UserStore.set('gl_steps_android', ''); if (n !== 7200) throw new Error(n); return n; });
await E('부위 이름: 셋 이상이면 많이 한 두 곳, 유산소는 셋 이상이면 뺀다', () => { const a = PlanGen.dayLabel(['벤치 프레스', '바벨 로우', '바벨 스쿼트', '러닝']), b = PlanGen.dayLabel(['벤치 프레스', '케이블 트라이셉 푸쉬다운', '러닝']);
  if (a.split('·').length !== 2 || /유산소/.test(b)) throw new Error(a + ' / ' + b); return a + ' / ' + b; });
await E('무게 단계: 볼륨으로 단계가 정해진다', () => { const t0 = VolTier.tier(0), t1 = VolTier.tier(100000); if (t0.lv !== 0 || !(t1.lv > 5)) throw new Error(JSON.stringify([t0.lv, t1.lv])); return 'Lv.' + t1.lv; });
// ── 동기화: 두 기기(브라우저 둘)가 가짜 Firebase 하나를 같이 쓴다 ──
{
  const DB = {};   // { 'u1': { key: value, _mod: {...}, _savedAt } }
  const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), DB);
  const set = (p, v) => { const ks = p.split('/').filter(Boolean); let o = DB; ks.slice(0, -1).forEach(k => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); if (v === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = v; };
  const fake = async (route) => { const req = route.request(), u = new URL(req.url()), p = decodeURIComponent(u.pathname.replace(/\.json$/, ''));
    if (req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(get(p) ?? null) });
    if (req.method() === 'PATCH') { const body = JSON.parse(req.postData() || '{}'); for (const [k, v] of Object.entries(body)) set(p + '/' + k, v); return route.fulfill({ contentType: 'application/json', body: '{}' }); }
    return route.fulfill({ status: 405, body: '' }); };
  const open2 = async () => { const pg = await browser.newPage(); pg.on('pageerror', e => errors.push(e.message)); await pg.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort()); await pg.route(/fake-rtdb\.test/, fake);
    await pg.goto(`http://localhost:${PORT}/index.html`); await pg.waitForTimeout(1500);
    await pg.evaluate(async () => { localStorage.clear(); FirebaseSync.init('u1', 'https://fake-rtdb.test'); await FirebaseSync.load(); }); return pg; };
  await t('동기화: 두 기기가 같은 칸의 다른 날을 고치면 둘 다 남고, 바뀐 칸만 받아 온다', async () => {
    const A = await open2();
    await A.evaluate(async () => { UserStore.set('gl_sync_test', JSON.stringify({ d1: 1 })); await FirebaseSync.save(); });
    const B = await open2();
    await A.evaluate(async () => { UserStore.set('gl_sync_test', JSON.stringify({ d1: 1, d2: 2 })); await new Promise(r => setTimeout(r, 5)); await FirebaseSync.save(); });
    await B.evaluate(async () => { UserStore.set('gl_sync_test', JSON.stringify({ d1: 5 })); await FirebaseSync.save(); });
    const a = await A.evaluate(async () => { FirebaseSync._lastEditTs = 0; FirebaseSync._lastSaveTs -= 10000; await FirebaseSync._pull(); return UserStore.get('gl_sync_test'); });
    const b = await B.evaluate(() => UserStore.get('gl_sync_test'));
    await A.close(); await B.close();
    const ja = JSON.parse(a), jb = JSON.parse(b);
    ok(jb.d1 === 5 && jb.d2 === 2, 'B: ' + b); ok(ja.d1 === 5 && ja.d2 === 2, 'A: ' + a);
    ok(DB.users?.u1?._mod && Object.keys(DB.users.u1._mod).some(k => /gl_sync_test/.test(k)), '_mod 표시가 없다');
    return b;
  });
}
await t('검사 중 스크립트 오류가 없다', () => { ok(!errors.length, errors.slice(0, 3).join(' / ')); return 'ok'; });

await browser.close(); server.close();
let bad = 0;
for (const [pass, name, info] of results) { if (!pass) bad++; console.log(`${pass ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`); }
console.log(`\n${results.length - bad}/${results.length} 통과`);
process.exit(bad ? 1 : 0);
