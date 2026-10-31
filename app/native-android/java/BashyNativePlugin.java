package app.bashy;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 화면(JS)과 안드로이드 기능 사이의 다리. 아이폰의 BashyNativePlugin.swift 와 이름·모양을 맞춘다.
//   setWidget      오늘 요약(JSON)을 위젯 저장소에 쓰고 위젯을 다시 그린다
//   consumePending 위젯 단추로 들어온 요청을 꺼낸다(지금은 '오늘 보기' 하나)
//   getAppLock     안드로이드는 아직 앱 잠금이 없다 — available:false 로 메뉴를 숨긴다
@CapacitorPlugin(name = "BashyNative")
public class BashyNativePlugin extends Plugin {
    static final String PREFS = "bashy_widget";

    // 허브 모드(설정 › 스마트홈 허브): 하루 종일 켜 두는 화면 — 화면 꺼짐을 막고, 처음 켤 때 배터리 최적화 예외를 한 번 묻는다.
    // MainActivity 는 이 표시(hub)를 보고 웹 화면이 죽거나 앱이 오류로 꺼지면 다시 띄운다.
    @PluginMethod
    public void hubMode(PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("hub", on).apply();
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            immersive(getActivity(), on);
        });
        if (on && Build.VERSION.SDK_INT >= 23) {
            try {
                SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (!sp.getBoolean("askedBattery", false) && pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
                    sp.edit().putBoolean("askedBattery", true).apply();
                    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    i.setData(Uri.parse("package:" + getContext().getPackageName()));
                    getActivity().startActivity(i);
                }
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    // 허브 모드: 위쪽 상태바(시간·배터리)와 아래 내비게이션 바를 숨긴다. 가장자리에서 쓸면 잠깐 나왔다가 다시 숨는다.
    static void immersive(android.app.Activity a, boolean on) {
        try {
            androidx.core.view.WindowInsetsControllerCompat c = androidx.core.view.WindowCompat.getInsetsController(a.getWindow(), a.getWindow().getDecorView());
            if (on) {
                c.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            } else c.show(androidx.core.view.WindowInsetsCompat.Type.systemBars());
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void setWidget(PluginCall call) {
        String json = call.getString("json", "{}");
        Context ctx = getContext();
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("today", json).apply();
        // 위젯 갱신이 실패해도(위젯 서비스가 없는 기기 등) 앱이 죽지 않게 — 저장은 이미 끝났다
        try { BashyWidgets.refreshAll(ctx); } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void consumePending(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String a = p.getString("pending", null);
        JSArray items = new JSArray();
        if (a != null) {
            JSObject it = new JSObject(); it.put("action", a); items.put(it);
            p.edit().remove("pending").apply();
        }
        JSObject r = new JSObject(); r.put("items", items);
        call.resolve(r);
    }

    @PluginMethod
    public void getAppLock(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", false); r.put("available", false); r.put("kind", "passcode");
        call.resolve(r);
    }

    @PluginMethod
    public void setAppLock(PluginCall call) { call.reject("이 기기에서는 아직 지원하지 않습니다"); }

    // 권한을 거절했을 때 '설정 › 앱 › Bashy' 를 찾아가게 하지 않고 바로 연다.
    // target: "notifications" → 이 앱의 알림 설정, 나머지 → 이 앱 정보(권한) 화면
    @PluginMethod
    public void openSettings(PluginCall call) {
        String target = call.getString("target", "app");
        Context ctx = getContext();
        Intent i;
        if ("notifications".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); JSObject r = new JSObject(); r.put("ok", true); call.resolve(r); }
        catch (Exception e) { call.reject("설정을 열지 못했습니다"); }
    }

    // 홈 화면에 위젯을 바로 놓는다(안드로이드 8+ 런처가 '추가할까요?' 를 묻는다). 아이폰은 이런 길이 없다.
    @PluginMethod
    public void pinWidget(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { r.put("ok", false); r.put("error", "안드로이드 8 이상에서 됩니다"); call.resolve(r); return; }
        AppWidgetManager m = ctx.getSystemService(AppWidgetManager.class);
        if (m == null || !m.isRequestPinAppWidgetSupported()) { r.put("ok", false); r.put("error", "이 홈 화면 앱은 위젯 바로 놓기를 지원하지 않습니다"); call.resolve(r); return; }
        Class<?> cls = "habit".equals(call.getString("kind", "today")) ? BashyWidgets.Habit.class : BashyWidgets.Today.class;
        boolean ok;
        try { ok = m.requestPinAppWidget(new ComponentName(ctx, cls), null, null); }
        catch (Exception e) { ok = false; }   // 앱이 앞에 있지 않을 때 등 IllegalStateException
        r.put("ok", ok); if (!ok) r.put("error", "위젯을 놓지 못했습니다");
        call.resolve(r);
    }

    // 앱이 이미 떠 있을 때 위젯을 누르면 화면에 알린다
    void onWidgetIntent() { notifyListeners("intent", new JSObject()); }
}
