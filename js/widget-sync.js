// js/widget-sync.js — 홈 화면 위젯에 보낼 '오늘 요약'
//
// 위젯은 화면(JS)을 돌리지 못한다. 그래서 앱이 열려 있을 때 오늘 요약을 만들어
// 네이티브(BashyNative.setWidget)에 넘기고, 네이티브가 위젯 저장소에 써 둔 뒤 위젯을 새로 그린다.
//   아이폰: App Group(group.app.bashy) UserDefaults → WidgetKit
//   안드로이드: SharedPreferences → AppWidgetProvider
// 기록이 바뀔 때마다 _updateStatsBanner 가 부르고, 여러 번 불러도 마지막 한 번만 보낸다.
// 웹(bashy.app)이나 위젯을 모르는 예전 앱에서는 아무 일도 하지 않는다.
const Widgets = {
  get P() { return (typeof Platform !== 'undefined' && Platform.native && window.Capacitor?.Plugins?.BashyNative) || null; },
  _t: null, _last: '', _off: false,

  push(delay = 1200) {
    if (!this.P || this._off) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this._send(), delay);
  },

  snapshot() {
    const now = new Date();
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = ymd(now);
    const out = { v: 1, date: `${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일`, day: today, at: Date.now() };

    try {
      const hs = Habits.getHabitsForDate(now), ck = Habits.getChecked(now);
      out.habits = { done: hs.filter(h => ck.includes(h.id)).length, total: hs.length,
        left: hs.filter(h => !ck.includes(h.id)).slice(0, 4).map(h => String(h.name || '').slice(0, 20)) };
    } catch (e) {}

    try {
      const pend = [];
      Object.values(App.S.tasks || {}).forEach(l => (l || []).forEach(t => { if (t.status === 'needsAction' && !t._hidden) pend.push(t); }));
      const todays = pend.filter(t => t.due ? t.due.split('T')[0] <= today : true);
      todays.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9')));
      out.tasks = { count: pend.filter(t => t.due ? t.due.split('T')[0] === today : true).length,
        top: todays.slice(0, 4).map(t => String(t.title || '').slice(0, 24)) };
    } catch (e) {}

    try {
      const items = Checklist.getItemsForDate(now);
      out.check = { done: items.filter(i => i.done).length, total: items.length };
    } catch (e) {}

    try {
      const dt = Diet.totals(Diet.getData()), ds = Diet.getSettings();
      out.kcal = { eat: Math.round(dt.cal || 0), goal: Number(ds.calorieGoal) || 0 };
    } catch (e) {}

    try {
      const r = InBody.getRecords().filter(x => Number(x.wt) > 0).sort((a, b) => String(a.dt).localeCompare(String(b.dt)));
      if (r.length) out.kg = Math.round(Number(r[r.length - 1].wt) * 10) / 10;
    } catch (e) {}

    try {
      const next = (App.S.events || []).map(e => {
        const d = e.start?.dateTime ? new Date(e.start.dateTime) : (e.start?.date ? new Date(e.start.date + 'T00:00:00') : null);
        return d && { d, all: !e.start?.dateTime, title: String(e.summary || '일정').slice(0, 24) };
      }).filter(x => x && (x.all ? ymd(x.d) >= today : x.d >= now)).sort((a, b) => a.d - b.d)[0];
      if (next) out.next = { title: next.title,
        when: (ymd(next.d) === today ? '' : `${next.d.getMonth() + 1}/${next.d.getDate()} `) + (next.all ? '종일' : next.d.toTimeString().slice(0, 5)) };
    } catch (e) {}

    return out;
  },

  async _send() {
    const s = this.snapshot();
    const key = JSON.stringify({ ...s, at: 0 });
    if (key === this._last) return;
    try {
      await this.P.setWidget({ json: JSON.stringify(s) });
      this._last = key;
    } catch (e) {
      // 위젯을 모르는 예전 빌드 — 다시 시도하지 않는다
      if (/not implemented|unimplemented/i.test(String(e && (e.message || e.code)))) this._off = true;
    }
  },

  init() {
    if (!this.P) return;
    this.push(3000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this._send(); });
  },
};
