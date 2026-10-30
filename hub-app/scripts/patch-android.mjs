// cap add android 이 만든 기본 프로젝트를 허브에 맞게 고친다.
// android/ 는 커밋하지 않고 매번 새로 만든다 — 그래서 고칠 것은 전부 여기에 모아 둔다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const man = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let x = fs.readFileSync(man, 'utf8');

// 1) 권한: 마이크(음성 명령)
for (const p of ['android.permission.RECORD_AUDIO', 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'android.permission.WAKE_LOCK']) {
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
// 6) 호출어("자비스") 상시 듣기 — 이 앱만의 네이티브 플러그인을 넣고 등록한다
const pkgDir = path.join(root, 'android/app/src/main/java/app/bashy/hub');
fs.copyFileSync(path.join(root, 'native/JarvisListener.java'), path.join(pkgDir, 'JarvisListener.java'));
// 허브는 하루 종일 켜 두는 화면이다. 시간이 지나면 앱이 꺼지던 것을 막는다:
//   ① 화면 꺼짐 막기(창 플래그 — 자바스크립트 KeepAwake 보다 먼저, 페이지가 늦게 떠도)
//   ② 웹 화면 프로세스가 메모리 부족 등으로 죽으면(앱이 통째로 닫히던 원인) 앱을 닫지 않고 화면만 다시 띄운다
//   ③ 그래도 앱이 오류로 죽으면 2초 뒤 저절로 다시 켠다
//   ④ 배터리 최적화 예외를 한 번 요청한다(절전이 허브를 끄지 않게)
fs.writeFileSync(path.join(pkgDir, 'MainActivity.java'), `package app.bashy.hub;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JarvisListener.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        restartOnCrash();
        try {
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    // 웹 화면만 죽었다 — 앱은 살려 두고 화면을 새로 만든다
                    runOnUiThread(() -> recreate());
                    return true;
                }
            });
        } catch (Exception ignored) {}
        askBatteryOnce();
    }

    private void restartOnCrash() {
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                Intent i = new Intent(getApplicationContext(), MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                PendingIntent pi = PendingIntent.getActivity(getApplicationContext(), 7, i, PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE);
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null) am.set(AlarmManager.RTC, System.currentTimeMillis() + 2000, pi);
            } catch (Exception ignored) {}
            if (prev != null) prev.uncaughtException(t, e); else System.exit(2);
        });
    }

    private void askBatteryOnce() {
        try {
            if (Build.VERSION.SDK_INT < 23) return;
            SharedPreferences sp = getSharedPreferences("hub", MODE_PRIVATE);
            if (sp.getBoolean("askedBattery", false)) return;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            sp.edit().putBoolean("askedBattery", true).apply();
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {}
    }
}
`);

// 7) 다시 깔 때 '업데이트' 로 인식되도록 버전 번호를 매번 올린다 (분 단위 시각)
const gradle = path.join(root, 'android/app/build.gradle');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let g = fs.readFileSync(gradle, 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${Math.floor(Date.now() / 60000) - 29000000}`)
     .replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradle, g);

console.log('android 패치 완료');
