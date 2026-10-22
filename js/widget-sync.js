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
    const out = { v: 2, date: `${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일`, day: today, at: Date.now() };

    try {
      const hs = Habits.getHabitsForDate(now), ck = Habits.getChecked(now);
      out.habits = { done: hs.filter(h => ck.includes(h.id)).length, total: hs.length,
        left: hs.filter(h => !ck.includes(h.id)).slice(0, 4).map(h => String(h.name || '').slice(0, 20)),
        // 위젯에서 바로 체크하는 목록(안 한 것 먼저)
        items: hs.slice().sort((a, b) => ck.includes(a.id) - ck.includes(b.id)).slice(0, 8).map(h => ({ id: String(h.id), n: this._plain(h.name).slice(0, 18), ok: ck.includes(h.id) })) };
    } catch (e) {}

    try {
      const pend = [];
      // 앱에서 '지난 할 일 안 보기' 로 해 두면 위젯에서도 기한 지난 것은 뺀다
      const showOver = typeof App.showOverdue === 'function' ? App.showOverdue() : true;
      Object.entries(App.S.tasks || {}).forEach(([lid, l]) => (l || []).forEach(t => { if (t.status === 'needsAction' && !t._hidden && (showOver || !t.due || t.due.split('T')[0] >= today)) pend.push({ ...t, _l: lid }); }));
      const todays = pend.filter(t => t.due ? t.due.split('T')[0] <= today : true);
      todays.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9')));
      out.tasks = { count: pend.filter(t => t.due ? t.due.split('T')[0] === today : true).length,
        top: todays.slice(0, 4).map(t => String(t.title || '').slice(0, 24)),
        // 위젯에서 바로 완료하는 목록 — 오늘·지난 것 먼저, 그다음 날짜 없는 것·다가오는 것
        items: pend.slice().sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9')))
          .slice(0, 8).map(t => ({ id: String(t.id), l: String(t._l), t: String(t.title || '').slice(0, 30),
            d: t.due ? (t.due.split('T')[0] < today ? '지남' : t.due.split('T')[0] === today ? '오늘' : `${+t.due.slice(5, 7)}/${+t.due.slice(8, 10)}`) : '' })) };
      // 할 일 위젯(목록 고르기): 목록 이름과 목록마다 할 일(먼저 할 것 순, 8개까지)
      const ord = (a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9'));
      const row = t => ({ id: String(t.id), l: String(t._l), t: String(t.title || '').slice(0, 30),
        d: t.due ? (t.due.split('T')[0] < today ? `${+t.due.slice(5, 7)}월 ${+t.due.slice(8, 10)}일` : t.due.split('T')[0] === today ? '오늘' : `${+t.due.slice(5, 7)}/${+t.due.slice(8, 10)}`) : '',
        o: t.due ? t.due.split('T')[0] < today : false, s: !!t.starred });
      out.lists = (App.S.lists || []).map(l => ({ id: String(l.id), n: String(l.title || '목록').slice(0, 12), c: pend.filter(t => t._l === String(l.id)).length }));
      out.tl = {};
      out.lists.forEach(l => { out.tl[l.id] = pend.filter(t => t._l === l.id).sort(ord).slice(0, 8).map(row); });
      out.tl.__all = pend.slice().sort(ord).slice(0, 8).map(row);
    } catch (e) {}

    try {
      const items = Checklist.getItemsForDate(now);
      out.check = { done: items.filter(i => i.done).length, total: items.length };
    } catch (e) {}

    try {
      const dt = Diet.totals(Diet.getData()), ds = Diet.getSettings();
      out.kcal = { eat: Math.round(dt.cal || 0), goal: Number(ds.calorieGoal) || 0 };
      // 칼로리·운동 위젯
      let burn = 0; try { burn = Fitness.burn(now).kcal || 0; } catch (e) {}
      const bm = ds.burnMode || 'half', bonus = bm === 'off' ? 0 : bm === 'full' ? burn : Math.round(burn / 2 / 10) * 10;
      out.body = { eat: Math.round(dt.cal || 0), goal: (Number(ds.calorieGoal) || 0) + bonus, burn: Math.round(burn),
        p: Math.round(dt.protein || 0), c: Math.round(dt.carb || 0), f: Math.round(dt.fat || 0),
        pg: Number(ds.proteinGoal) || 0, cg: Number(ds.carbGoal) || 0, fg: Number(ds.fatGoal) || 0 };
      try {
        const { list } = Fitness.exercisesFor(now), chk = Fitness._checked(now), day = WorkoutHistory.day(today, true);
        const lg = PlanGen.log(today), doneNm = [...new Set(list.filter((_, i) => chk.includes(i)).map(x => x.name).concat(Object.keys(lg).filter(n => (lg[n] || []).length)))];
        Object.assign(out.body, { part: PlanGen.dayLabel(doneNm.length ? doneNm : list.map(x => x.name)) || '', done: chk.length, total: list.length, vol: Math.round(day.vol || 0), sets: day.sets || 0 });
      } catch (e) {}
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

    // 달력 위젯: 이번 달에 일정이 있는 날
    try {
      const y = now.getFullYear(), m = now.getMonth(), marks = new Set();
      (App.S.events || []).forEach(e => {
        const d = e.start?.dateTime ? new Date(e.start.dateTime) : (e.start?.date ? new Date(e.start.date + 'T00:00:00') : null);
        if (d && d.getFullYear() === y && d.getMonth() === m) marks.add(d.getDate());
      });
      out.cal = { y, m: m + 1, marks: [...marks].sort((a, b) => a - b) };
      out.evs = (App.S.events || []).map(e => {
        const d = e.start?.dateTime ? new Date(e.start.dateTime) : (e.start?.date ? new Date(e.start.date + 'T00:00:00') : null);
        return d && { d, all: !e.start?.dateTime, t: String(e.summary || '일정').slice(0, 26) };
      }).filter(x => x && (x.all ? ymd(x.d) >= today : x.d >= now)).sort((a, b) => a.d - b.d).slice(0, 4)
        .map(x => ({ t: x.t, w: (ymd(x.d) === today ? '오늘 ' : `${x.d.getMonth() + 1}/${x.d.getDate()} `) + (x.all ? '종일' : x.d.toTimeString().slice(0, 5)) }));
    } catch (e) {}
    // AI 사용량 위젯: 남은 % (5시간 · 7일), Higgsfield 는 남은 크레딧 %
    try {
      const d = (typeof AIUsage !== 'undefined' && AIUsage.data) || {}, L = w => w && w.pct != null ? Math.max(0, Math.min(100, Math.round(100 - Number(w.pct)))) : null;
      out.ai = ['claude', 'chatgpt', 'higgsfield'].filter(k => d[k]).map(k => {
        const v = d[k];
        if (k === 'higgsfield') { const tot = Number(v.total) || 0; return { k, n: 'Higgs', left: tot ? Math.round(Math.max(0, Math.min(1, Number(v.credits) / tot)) * 100) : null }; }
        return { k, n: k === 'claude' ? 'Claude' : 'GPT', h5: L(v.h5), d7: L(v.d7), r: v.h5 && v.h5.reset ? String(v.h5.reset) : '' };
      });
    } catch (e) {}
    // 시세 위젯: 비트코인 + 즐겨찾기 앞 3개
    try {
      const mk = [];
      if (this._btc) mk.push({ n: '비트코인', p: Math.round(this._btc.p).toLocaleString('ko-KR') + '원', c: Math.round(this._btc.c * 10000) / 100 });
      const E = typeof Econ !== 'undefined' ? Econ : null;
      (E && E.C ? E.favOrdered() : []).slice(0, 4).forEach(it => { const q = E.PRICES[E.keyOf(it)]; if (q && q.price != null) mk.push({ n: String(it.name).slice(0, 10), p: E.fmt(it, q.price), c: q.pct != null ? Math.round(q.pct * 100) / 100 : null }); });
      out.mkt = mk.slice(0, 5);
    } catch (e) {}
    try { const w = typeof Weather !== 'undefined' && Weather.w; if (w) out.wx = { t: w.t, icon: w.icon, name: w.name, hi: w.hi, lo: w.lo }; } catch (e) {}
    return out;
  },
  _plain(s) { return String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim(); },
  // 업비트 비트코인 시세(키 없이) — 앱이 열려 있는 동안 10분마다
  async _fetchBtc() {
    try {
      const r = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC'); const j = await r.json();
      if (j && j[0]) { this._btc = { p: j[0].trade_price, c: j[0].signed_change_rate }; this.push(); }
    } catch (e) {}
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
    this._fetchBtc(); setInterval(() => { if (!document.hidden) this._fetchBtc(); }, 10 * 60000);
    // AI 사용량·시세가 바뀌어도 위젯을 새로(같은 내용이면 보내지 않는다)
    setInterval(() => { if (!document.hidden) this.push(); }, 5 * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this._send(); });
  },
};
