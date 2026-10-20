// app/scripts/build-www.mjs — 웹 화면을 앱 번들(app/www)로 복사한다.
//
// 앱은 bashy.app 을 원격으로 띄우지 않고, 화면 파일을 앱 안에 넣어 capacitor://localhost 에서 연다.
// (원격 URL 만 띄우는 앱은 App Store 심사 4.2/4.7 에서 거절되기 쉽다.) 서버 호출은 Platform.api() 가
// https://bashy.app 으로 보내므로 화면 파일만 복사하면 된다.
//
// 웹에만 필요한 것(서비스 워커, 웹 푸시용 FCM 워커, 태블릿 허브)은 넣지 않는다.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app  = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(app, '..');
const www  = join(app, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

const FILES = ['index.html', 'privacy.html', 'terms.html', 'delete-account.html', 'manifest.json', 'hub.html', 'hub-classic.html', 'hub.webmanifest'];   // 허브 모드(설정 › 기기·허브)용으로 허브도 넣는다
const DIRS  = ['css', 'js', 'icons', 'img'];
const SKIP  = /^$/;   // 예전엔 허브 파일을 뺐다 — 이제 앱 안에서 허브 모드로 쓴다

for (const f of FILES) if (existsSync(join(root, f))) cpSync(join(root, f), join(www, f));
for (const d of DIRS) cpSync(join(root, d), join(www, d), { recursive: true, filter: p => !SKIP.test(p.replace(/\\/g, '/')) });

// 서비스 워커 등록 줄은 앱에서 쓸모가 없다(capacitor:// 에서는 등록되지 않는다). 지워서 콘솔 오류를 없앤다.
const idx = join(www, 'index.html');
let html = readFileSync(idx, 'utf8');
html = html.replace(/<script>\s*if\('serviceWorker'in navigator\)[^<]*<\/script>/, '<!-- 서비스 워커: 앱에서는 쓰지 않음 -->');
// 웹 구글 로그인(GIS)은 앱에서 쓰지 않는다 — 앱은 네이티브 로그인(js/google-auth.js nativeLogin)
html = html.replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client"[^>]*><\/script>/, '<!-- GIS: 앱에서는 네이티브 로그인 -->');
writeFileSync(idx, html);

console.log('www 준비 완료:', www);
