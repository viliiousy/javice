package app.bashy;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// 홈 화면 위젯 두 개 — 둘 다 앱이 넘겨 준 '오늘 요약'(BashyNativePlugin.setWidget)만 그린다.
//   Today  (4×2) 습관 숫자 크게 + 오늘 할 일 + 아래 한 줄(체크·칼로리·몸무게) + 다음 일정
//   Habit  (2×2) 습관 숫자 하나와 다음 일정
// 날짜가 바뀌었는데 앱을 아직 안 열었으면 어제 숫자를 보이지 않고 '앱을 열어 새로 고침' 을 적는다.
public class BashyWidgets {
    static final String ACTION_OPEN = "app.bashy.WIDGET_OPEN";

    public static class Today extends AppWidgetProvider {
        @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, today(c)); }
    }
    public static class Habit extends AppWidgetProvider {
        @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, habit(c)); }
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (m == null) return;   // 위젯 기능이 없는 기기
        for (int id : m.getAppWidgetIds(new ComponentName(c, Today.class))) m.updateAppWidget(id, today(c));
        for (int id : m.getAppWidgetIds(new ComponentName(c, Habit.class))) m.updateAppWidget(id, habit(c));
    }

    static JSONObject data(Context c) {
        try {
            JSONObject o = new JSONObject(c.getSharedPreferences(BashyNativePlugin.PREFS, Context.MODE_PRIVATE).getString("today", "{}"));
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            if (!today.equals(o.optString("day"))) o.put("stale", true);
            return o;
        } catch (Exception e) { return new JSONObject(); }
    }

    static PendingIntent open(Context c) {
        Intent i = new Intent(c, MainActivity.class).setAction(ACTION_OPEN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String habitNum(JSONObject o) {
        JSONObject h = o.optJSONObject("habits");
        return h == null ? "–" : h.optInt("done") + "/" + h.optInt("total");
    }

    static String nextLine(JSONObject o) {
        JSONObject n = o.optJSONObject("next");
        if (n == null) return "";
        String w = n.optString("when");
        return (w.isEmpty() ? "" : w + "  ") + n.optString("title");
    }

    static RemoteViews today(Context c) {
        JSONObject o = data(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        v.setOnClickPendingIntent(R.id.w_root, open(c));
        boolean stale = o.optBoolean("stale", true) || o.length() == 0;
        v.setTextViewText(R.id.w_date, stale ? new SimpleDateFormat("M월 d일 EEEE", Locale.KOREAN).format(new Date()) : o.optString("date"));
        if (stale) {
            v.setTextViewText(R.id.w_big, "–");
            v.setTextViewText(R.id.w_tasks, "앱을 한 번 열면 오늘 요약이 채워집니다");
            v.setTextViewText(R.id.w_foot, "");
            v.setViewVisibility(R.id.w_next, View.GONE);
            return v;
        }
        v.setTextViewText(R.id.w_big, habitNum(o));

        StringBuilder t = new StringBuilder();
        JSONObject tk = o.optJSONObject("tasks");
        JSONArray top = tk == null ? null : tk.optJSONArray("top");
        if (top != null) for (int i = 0; i < Math.min(3, top.length()); i++) { if (i > 0) t.append('\n'); t.append("·  ").append(top.optString(i)); }
        v.setTextViewText(R.id.w_tasks, t.length() == 0 ? "남은 할 일이 없습니다" : t.toString());

        StringBuilder f = new StringBuilder();
        if (tk != null) f.append("할일 ").append(tk.optInt("count"));
        JSONObject ck = o.optJSONObject("check");
        if (ck != null && ck.optInt("total") > 0) f.append("   체크 ").append(ck.optInt("done")).append('/').append(ck.optInt("total"));
        JSONObject kc = o.optJSONObject("kcal");
        NumberFormat nf = NumberFormat.getIntegerInstance(Locale.KOREA);
        if (kc != null) {
            int goal = kc.optInt("goal"), eat = kc.optInt("eat");
            if (goal > 0) f.append("   남은 ").append(nf.format(Math.max(0, goal - eat))).append("kcal");
            else if (eat > 0) f.append("   ").append(nf.format(eat)).append("kcal");
        }
        if (o.has("kg")) f.append("   ").append(o.optDouble("kg")).append("kg");
        v.setTextViewText(R.id.w_foot, f.toString().trim());

        String n = nextLine(o);
        v.setViewVisibility(R.id.w_next, n.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_next, n);
        return v;
    }

    static RemoteViews habit(Context c) {
        JSONObject o = data(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_habit);
        v.setOnClickPendingIntent(R.id.w_root, open(c));
        boolean stale = o.optBoolean("stale", true) || o.length() == 0;
        v.setTextViewText(R.id.w_big, stale ? "–" : habitNum(o));
        String sub = "";
        if (!stale) {
            JSONObject h = o.optJSONObject("habits");
            JSONArray left = h == null ? null : h.optJSONArray("left");
            if (left != null && left.length() > 0) sub = "다음 · " + left.optString(0);
            else if (h != null && h.optInt("total") > 0) sub = "오늘 습관 끝";
        } else sub = "앱을 열어 새로 고침";
        v.setTextViewText(R.id.w_sub, sub);
        String n = stale ? "" : nextLine(o);
        v.setViewVisibility(R.id.w_next, n.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_next, n);
        return v;
    }
}
