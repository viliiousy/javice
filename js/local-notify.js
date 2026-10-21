// js/local-notify.js — 아이폰 앱의 알림: 기기 안에서 예약하는 로컬 알림
//
// 앱(WKWebView)에는 브라우저의 Notification 이 없어서 '테스트 알림' 이 아무 일도 안 했다.
// 서버 푸시(FCM)는 APNs 키·인증서가 맞아야 오고, 맞지 않으면 어디서도 실패가 보이지 않는다.
// 그래서 앱에서는 알림을 기기 안에 직접 예약한다 — 인터넷이 없어도, 서버가 멈춰도 울린다.
//
// 앞으로 7일치를 예약해 두고, 앱을 열 때·설정을 바꿀 때·기록이 바뀔 때마다 다시 짠다.
// 오늘 것은 지금 상태(남은 습관 수, 오늘 일정)를 문구에 넣고, 내일부터는 일반 문구를 쓴다.
// 웹(브라우저)은 예전처럼 서버 푸시를 쓴다 — 이 파일은 앱에서만 일한다.

const LocalNotify = {
  BASE: 7000,        // 우리가 쓰는 알림 id 구간 (7000~7999)
  DAYS: 7,

  get P() { return (typeof Platform !== 'undefined' && Platform.native && window.Capacitor?.Plugins?.LocalNotifications) || null; },
  get ok() { return !!this.P; },

  async permission(ask) {
    const P = this.P; if (!P) return 'denied';
    try {
      const r = ask ? await P.requestPermissions() : await P.checkPermissions();
      return r.display === 'granted' ? 'granted' : (r.display || 'denied');
    } catch (e) { return 'denied'; }
  },

  async test() {
    const P = this.P; if (!P) return false;
    if ((await this.permission(true)) !== 'granted') return false;
    await P.schedule({ notifications: [{ id: this.BASE + 999, title: 'Bashy 알림 테스트', body: '알림이 정상적으로 울립니다.',
      schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true } }] });
    return true;
  },

  async cancelAll() {
    const P = this.P; if (!P) return;
    try {
      const { notifications = [] } = await P.getPending();
      const ours = notifications.filter(n => n.id >= this.BASE && n.id < this.BASE + 990);   // 7990~7999 는 운동 모드·테스트용(다시 짤 때 지우지 않는다)
      if (ours.length) await P.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    } catch (e) { console.warn('[LocalNotify] cancel', e); }
  },

  _at(day, hhmm) {
    const [h, m] = String(hhmm || '09:00').split(':').map(Number);
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + day); d.setHours(h || 0, m || 0, 0, 0);
    return d;
  },

  // 다시 짜기 — 여러 곳에서 연달아 불러도 마지막 한 번만 돈다
  _t: null,
  reschedule(delay = 800) { clearTimeout(this._t); this._t = setTimeout(() => this._run(), delay); },

  // 한 번 짜는 데 기기와 몇 번 오간다. 그사이 또 불리면 겹쳐 돌지 않고, 끝난 뒤 한 번 더 짠다.
  async _run() {
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    try { await this._run0(); } catch (e) { console.warn('[LocalNotify] run', e); }
    finally { this._busy = false; if (this._again) { this._again = false; this.reschedule(300); } }
  },
  async _run0() {
    const P = this.P; if (!P) return;
    const s = Notifications.getSettings();
    await this.cancelAll();
    if (!s.enabled) return;
    if ((await this.permission(false)) !== 'granted') return;

    const now = Date.now(), list = [];
    const add = (id, at, title, body) => { if (at.getTime() > now + 30000) list.push({ id: this.BASE + id, title, body, schedule: { at, allowWhileIdle: true } }); };

    for (let day = 0; day < this.DAYS; day++) {
      const date = this._at(day, '12:00');
      const n = day * 40;
      // 습관 — 그날 할 습관이 있을 때만
      {   // 시각을 정해 둔 약·습관은 '습관 알림' 묶음 설정과 상관없이 울린다(직접 켠 알림이다)
        try {
          const hs = Habits.getHabitsForDate(date), ck = Habits.getChecked(date);
          const left = hs.filter(h => !ck.includes(h.id)).length;
          if (s.habits?.enabled && hs.length && (day > 0 || left > 0))
            add(n + 1, this._at(day, s.habits.time || '21:00'), '오늘의 습관', day === 0 ? `아직 ${left}개 남았습니다. 잊기 전에 체크해 주세요.` : `오늘 습관 ${hs.length}개, 잊기 전에 체크해 주세요.`);
          // 시간이 정해진 약·습관은 그 시각에 따로 울린다
          hs.filter(h => h.time && (h.cat === 'med' ? h.notify !== false : h.notify === true)).forEach((h, i) => {
            if (day === 0 && ck.includes(h.id)) return;
            add(n + 20 + i, this._at(day, h.time), h.name, `${h.time} — 지금 할 시간입니다.`);
          });
        } catch (e) {}
      }
      // 식단 — 끼니마다
      if (s.diet?.enabled) ['아침', '점심', '저녁'].forEach((m, i) => {
        const t = s.diet[m] || { 아침: '09:00', 점심: '13:00', 저녁: '19:00' }[m];
        // 이미 그 끼니를 기록했으면(알림 시각 전에) 그날 알림은 걸지 않는다
        try { if ((Diet.getData(date)[m] || []).length) return; } catch (e) {}
        add(n + 2 + i, this._at(day, t), `${m} 기록`, `${m} 드셨으면 식단에 남겨 두세요.`);
      });
      // 오늘 마감 할일
      if (s.tasks?.enabled) {
        let due = 0;
        try {
          const ds = date.toDateString();
          Object.values(App.S.tasks || {}).forEach(l => (l || []).forEach(t => {
            if (t.status === 'needsAction' && t.due && new Date(t.due).toDateString() === ds) due++;
          }));
        } catch (e) {}
        if (day > 0 || due > 0) add(n + 6, this._at(day, s.tasks.time || '09:00'), '오늘 마감 할일', day === 0 ? `오늘 마감인 할일이 ${due}개 있습니다.` : '오늘 마감인 할일을 확인해 보세요.');
      }
      // 체크리스트
      if (s.checklist?.enabled) {
        try {
          const items = Checklist.getItemsForDate(date).filter(i => !i.done);
          if (items.length) add(n + 7, this._at(day, s.checklist.time || '09:00'), '체크리스트', `${items.slice(0, 2).map(i => i.title).join(', ')}${items.length > 2 ? ` 외 ${items.length - 2}개` : ''}`);
        } catch (e) {}
      }
      // 오늘 일정 요약
      if (s.calendar?.enabled) {
        try {
          const ds = date.toDateString();
          const evs = (App.S.events || []).filter(e => new Date(e.start?.dateTime || e.start?.date || 0).toDateString() === ds);
          if (evs.length) add(n + 8, this._at(day, s.calendar.time || '08:00'), `오늘 일정 ${evs.length}개`,
            evs.slice(0, 3).map(e => { const t = e.start?.dateTime ? new Date(e.start.dateTime).toTimeString().slice(0, 5) + ' ' : ''; return t + (e.summary || '일정'); }).join(' · '));
        } catch (e) {}
      }
    }
    if (list.length) {
      try { await P.schedule({ notifications: list.slice(0, 60) }); }   // iOS 는 앱당 대기 알림 64개까지
      catch (e) { console.warn('[LocalNotify] schedule', e); }
    }
    console.log('[LocalNotify] 예약', list.length);
  },

  init() {
    if (!this.ok) return;
    this.reschedule(2500);
    if (this._inited) return;   // 다시 로그인해 init 이 또 불려도 리스너가 쌓이지 않게
    this._inited = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.reschedule(1500); });
    // 알림을 누르면 앱이 열린다 — 식단 알림이면 건강 탭으로
    try {
      this.P.addListener('localNotificationActionPerformed', (ev) => {
        const id = ev?.notification?.id - this.BASE, slot = id % 40;
        if (slot >= 2 && slot <= 4 && typeof Tabs !== 'undefined') Tabs.set('body');
      });
    } catch (e) {}
  },
};
