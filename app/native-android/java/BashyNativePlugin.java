package app.bashy;

import android.content.Context;
import android.content.SharedPreferences;
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

    // 앱이 이미 떠 있을 때 위젯을 누르면 화면에 알린다
    void onWidgetIntent() { notifyListeners("intent", new JSObject()); }
}
