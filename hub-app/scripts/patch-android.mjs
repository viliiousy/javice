// cap add android 이 만든 기본 프로젝트를 허브에 맞게 고친다.
// android/ 는 커밋하지 않고 매번 새로 만든다 — 그래서 고칠 것은 전부 여기에 모아 둔다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const man = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let x = fs.readFileSync(man, 'utf8');

// 1) 권한: 마이크(음성 명령)
for (const p of ['android.permission.RECORD_AUDIO']) {
  if (!x.includes(p)) x = x.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
}

// 2) 안드로이드 11+ 는 다른 앱이 '보이도록' 미리 적어 둬야 열 수 있다 (ChatGPT·Claude 앱, 음성 인식 서비스)
if (!x.includes('<queries>')) {
  x = x.replace('</manifest>', `    <queries>
        <package android:name="com.openai.chatgpt" />
        <package android:name="com.anthropic.claude" />
        <intent><action android:name="android.speech.RecognitionService" /></intent>
        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>
    </queries>
</manifest>`);
}

// 3) 집 안 Home Assistant · 맥미니는 http 주소다. 평문 통신을 허용한다.
if (!x.includes('usesCleartextTraffic')) x = x.replace('<application', '<application\n        android:usesCleartextTraffic="true"');

// 4) 가로 고정(뒤집기는 허용), 화면 켜 둔 채 쓰는 앱
if (!x.includes('android:screenOrientation')) {
  x = x.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"');
}

fs.writeFileSync(man, x);

// 5) 앱 아이콘: 적응형 아이콘 정의를 지우고 Bashy 아이콘 PNG 로 바꾼다
const res = path.join(root, 'android/app/src/main/res');
fs.rmSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });
for (const d of fs.readdirSync(path.join(root, 'icons'))) {
  const dst = path.join(res, d);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'icons', d))) {
    fs.copyFileSync(path.join(root, 'icons', d, f), path.join(dst, f));
  }
}
console.log('android 패치 완료');
