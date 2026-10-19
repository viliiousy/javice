// app/scripts/patch-android.mjs — `cap add android` 이 만든 기본 프로젝트를 Bashy 에 맞게 고친다.
// android/ 는 커밋하지 않고 빌드 때마다 새로 만든다(허브 앱과 같은 방식). 고칠 것은 전부 여기에 모은다.
//
//   VERSION_NAME   스토어에 보이는 버전 (기본: package.json 의 version)
//   VERSION_CODE   올릴 때마다 커져야 하는 정수 (기본: 분 단위 시각)
//   BASHY_KEYSTORE 업로드 키 파일 경로 — 있으면 release 빌드를 그 키로 서명한다
//     BASHY_KEYSTORE_PASSWORD · BASHY_KEY_ALIAS · BASHY_KEY_PASSWORD
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve(import.meta.dirname, '..');            // app/
const repo = path.resolve(app, '..');
const A = p => path.join(app, 'android', p);
const main = A('app/src/main');
const read = p => fs.readFileSync(p, 'utf8');
const copyDir = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
};

// 1) 네이티브 코드: 우리 플러그인(BashyNative), 위젯, 구글 로그인 결과를 넘기는 MainActivity
const pkgDir = path.join(main, 'java/app/bashy');
for (const f of fs.readdirSync(path.join(app, 'native-android/java'))) fs.copyFileSync(path.join(app, 'native-android/java', f), path.join(pkgDir, f));
copyDir(path.join(app, 'native-android/res'), path.join(main, 'res'));

// 2) 매니페스트: 권한, 위젯 등록, 다른 앱 보이기
const manPath = path.join(main, 'AndroidManifest.xml');
let x = read(manPath);
for (const p of ['android.permission.RECORD_AUDIO', 'android.permission.POST_NOTIFICATIONS', 'android.permission.VIBRATE']) {
  if (!x.includes(p)) x = x.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
}
if (!x.includes('BashyWidgets$Today')) {
  const rcv = (cls, info, label) => `
        <receiver android:name=".BashyWidgets$${cls}" android:exported="false" android:label="${label}">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/${info}" />
        </receiver>`;
  x = x.replace('    </application>', `${rcv('Today', 'widget_today_info', '@string/widget_today_name')}${rcv('Habit', 'widget_habit_info', '@string/widget_habit_name')}
    </application>`);
}
if (!x.includes('<queries>')) {
  x = x.replace('</manifest>', `    <queries>
        <intent><action android:name="android.speech.RecognitionService" /></intent>
        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>
</manifest>`);
}
// 세로 화면 앱 (태블릿은 허브 모드에서 가로로 쓰므로 막지 않는다)
fs.writeFileSync(manPath, x);

// 3) 아이콘: 적응형 아이콘 정의를 지우고 Bashy 아이콘(I10 밝은 판) PNG 로
const res = path.join(main, 'res');
fs.rmSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });
copyDir(path.join(repo, 'hub-app/icons'), res);

// 4) 시작 화면: 파란 기본 스플래시 대신 앱 바탕색(먹색) + 아이콘
for (const d of fs.readdirSync(res)) {
  if (d.startsWith('drawable')) fs.rmSync(path.join(res, d, 'splash.png'), { force: true });
}
fs.writeFileSync(path.join(res, 'values/bashy_colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="bashy_bg">#101113</color>
</resources>
`);
let st = read(path.join(res, 'values/styles.xml'));
st = st.replace(/<style name="AppTheme.NoActionBarLaunch"[\s\S]*?<\/style>/, `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/bashy_bg</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:background">@color/bashy_bg</item>
    </style>`);
st = st.replace('<item name="android:background">@null</item>', '<item name="android:background">@color/bashy_bg</item>');
fs.writeFileSync(path.join(res, 'values/styles.xml'), st);

// 5) 버전 + 서명
const pkg = JSON.parse(read(path.join(app, 'package.json')));
const gradlePath = A('app/build.gradle');
let g = read(gradlePath);
const vName = process.env.VERSION_NAME || pkg.version;
const vCode = Number(process.env.VERSION_CODE) || (Math.floor(Date.now() / 60000) - 29000000);
g = g.replace(/versionCode \d+/, `versionCode ${vCode}`).replace(/versionName "[^"]*"/, `versionName "${vName}"`);
if (process.env.BASHY_KEYSTORE && !g.includes('signingConfigs.release')) {
  g = g.replace(/buildTypes \{\s*release \{/, `signingConfigs {
        release {
            storeFile file(System.getenv("BASHY_KEYSTORE"))
            storePassword System.getenv("BASHY_KEYSTORE_PASSWORD")
            keyAlias System.getenv("BASHY_KEY_ALIAS")
            keyPassword System.getenv("BASHY_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release`);
}
// 디버그(테스트) APK 도 늘 같은 키로 — 저장소의 고정 디버그 키(SHA-1 18:23:53:…:4C:64, 구글 클라우드에 등록됨)
if (!g.includes('bashy-debug-key')) {
  const dk = path.join(repo, 'hub-app/keystore/debug.keystore').replace(/\\/g, '/');
  g = g.replace(/defaultConfig \{/, `signingConfigs {
        debug {   // bashy-debug-key
            storeFile file("${dk}")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
    defaultConfig {`);
  g = g.replace(/buildTypes \{/, `buildTypes {
        debug { signingConfig signingConfigs.debug }`);
}
fs.writeFileSync(gradlePath, g);

// 6) 푸시(FCM)는 google-services.json 이 있을 때만 켜진다. 없으면 알림은 기기 안 예약 알림(LocalNotify)으로만 간다.
const gs = path.join(app, 'google-services.json');
if (fs.existsSync(gs)) fs.copyFileSync(gs, A('app/google-services.json'));

console.log(`android 패치 완료 — ${vName} (${vCode})${process.env.BASHY_KEYSTORE ? ' · 서명 키 적용' : ' · 서명 키 없음(디버그 키)'}`);
