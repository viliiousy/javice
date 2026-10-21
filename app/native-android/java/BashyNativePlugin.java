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

    @PluginMethod
    public void setWidget(PluginCall call) {
        String json = call.getString("json", "{}");
        Context ctx = getContext();
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("today", json).apply();
        BashyWidgets.refreshAll(ctx);
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
        boolean ok = m.requestPinAppWidget(new ComponentName(ctx, cls), null, null);
        r.put("ok", ok); if (!ok) r.put("error", "위젯을 놓지 못했습니다");
        call.resolve(r);
    }

    // 앱이 이미 떠 있을 때 위젯을 누르면 화면에 알린다
    void onWidgetIntent() { notifyListeners("intent", new JSObject()); }
}
