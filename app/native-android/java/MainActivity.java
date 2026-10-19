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
