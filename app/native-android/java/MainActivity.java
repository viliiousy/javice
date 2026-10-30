package app.bashy;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

// 구글 로그인 '오프라인 모드'(서버 인증 코드 + 캘린더·할 일 권한)는 권한 화면 결과를 이 화면이 플러그인에 넘겨 줘야 한다.
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle h = getBridge().getPlugin("SocialLogin");
            if (h != null && h.getInstance() instanceof SocialLoginPlugin) ((SocialLoginPlugin) h.getInstance()).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BashyNativePlugin.class);
        super.onCreate(savedInstanceState);
        // 허브 모드로 하루 종일 켜 두면 시간이 지나 앱이 꺼지던 것:
        //   ① 웹 화면 프로세스가 메모리 부족 등으로 죽으면 앱을 닫지 않고 화면만 다시 띄운다(모든 모드)
        //   ② 허브 모드일 때 앱이 오류로 꺼지면 2초 뒤 다시 켠다  ③ 허브 모드면 처음부터 화면 꺼짐을 막는다
        try {
            getBridge().setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
                @Override
                public boolean onRenderProcessGone(android.webkit.WebView view, android.webkit.RenderProcessGoneDetail detail) {
                    runOnUiThread(() -> recreate());
                    return true;
                }
            });
        } catch (Exception ignored) {}
        if (hubOn()) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            if (hubOn()) try {
                Intent i = new Intent(getApplicationContext(), MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                android.app.PendingIntent pi = android.app.PendingIntent.getActivity(getApplicationContext(), 7, i, android.app.PendingIntent.FLAG_ONE_SHOT | android.app.PendingIntent.FLAG_IMMUTABLE);
                android.app.AlarmManager am = (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
                if (am != null) am.set(android.app.AlarmManager.RTC, System.currentTimeMillis() + 2000, pi);
            } catch (Exception ignored) {}
            if (prev != null) prev.uncaughtException(t, e); else System.exit(2);
        });
    }

    private boolean hubOn() {
        try { return getSharedPreferences(BashyNativePlugin.PREFS, MODE_PRIVATE).getBoolean("hub", false); } catch (Exception e) { return false; }
    }

    // 위젯을 누르면 '오늘' 화면으로
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        mark(intent);
        try {
            PluginHandle h = getBridge().getPlugin("BashyNative");
            if (h != null) ((BashyNativePlugin) h.getInstance()).onWidgetIntent();
        } catch (Exception ignored) {}
    }

    @Override
    public void onStart() { super.onStart(); mark(getIntent()); }

    private void mark(Intent i) {
        if (i != null && BashyWidgets.ACTION_OPEN.equals(i.getAction())) {
            getSharedPreferences(BashyNativePlugin.PREFS, MODE_PRIVATE).edit().putString("pending", "today").apply();
            i.setAction(Intent.ACTION_MAIN);
        }
    }
}
