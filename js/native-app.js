// js/native-app.js — 아이폰 앱에서만 켜지는 기능. 웹(bashy.app)에서는 아무 일도 하지 않는다.
//
//   1) 시리·단축어("Bashy에 할 일 추가", "Bashy 오늘 할 일", "Bashy에 몸무게 기록")가 남긴 요청을 처리한다.
//      네이티브 쪽(BashyIntents.swift)은 요청을 저장만 하고 앱을 연다. 구글 토큰은 화면에만 있으므로 실제 일은 여기서.
//   2) 프로필 메뉴에 'Face ID 잠금' 을 붙인다(BashyLock.swift).
const NativeApp = {
  get on() { return typeof Platform !== 'undefined' && Platform.native && !!(window.Capacitor.Plugins || {}).BashyNative; },
  get P() { return window.Capacitor.Plugins.BashyNative; },
  _queue: [],

  init() {
    if (!this.on) return;
    this.P.addListener('intent', () => this.pull());
    const A = window.Capacitor.Plugins.App;
    if (A) A.addListener('appStateChange', s => { if (s.isActive) this.pull(); });
    // 홈 화면 위젯의 링크(bashy://…): + 할 일, 카드 열기, AI 사용량
    if (A) {
      A.addListener('appUrlOpen', d => this.openUrl(d && d.url));
      A.getLaunchUrl?.().then(r => { if (r && r.url) this.openUrl(r.url); }).catch(() => {});
    }
    this.pull();
    this.menu();
  },

  async pull() {
    try {
      const r = await this.P.consumePending();
      for (const it of (r && r.items) || []) this._queue.push(it);
    } catch (e) { console.warn('[NativeApp]', e); }
    this.run();
  },

  // 로그인·첫 동기화 전에 들어온 요청은 기다렸다가 처리한다.
  async run() {
    if (!this._queue.length) return;
    const ready = typeof Auth !== 'undefined' && Auth.signedIn() && App.S && Array.isArray(App.S.lists) && App.S.lists.length;
    if (!ready) { clearTimeout(this._wait); this._wait = setTimeout(() => this.run(), 1500); return; }
    while (this._queue.length) {
      const it = this._queue.shift();
      try { await this.handle(it); } catch (e) { App.showToast('처리 실패: ' + (e.message || e), 'error'); }
    }
  },

  // bashy://task/new · bashy://open/<카드> · bashy://ai — 화면이 준비될 때까지 기다렸다가 연다
  openUrl(url) {
    const m = /^bashy:\/\/([^/?#]+)\/?([^?#]*)/.exec(String(url || '')); if (!m) return;
    const go = () => {
      if (!(typeof Auth !== 'undefined' && Auth.signedIn && Auth.signedIn() && App.S && Array.isArray(App.S.lists))) { setTimeout(go, 600); return; }
      if (m[1] === 'task' && m[2] === 'quick') {
        const lid = decodeURIComponent((/[?&]list=([^&#]*)/.exec(String(url)) || [])[1] || '');
        App.closeModal?.(); App.quickTask(lid === '__all' ? '' : lid);
      } else if (m[1] === 'task' && m[2] === 'new') {
        App.closeModal?.(); App._gotoCard('calendar'); App.showAddTask(new Date());
        setTimeout(() => document.getElementById('qtTitle')?.focus(), 350);   // 바로 쓸 수 있게 글자판을 올린다
      } else if (m[1] === 'ai') { try { AIUsage.open(); } catch (e) {} }
      else if (m[1] === 'open' && m[2]) { App.closeModal?.(); App._gotoCard(m[2]); }
    };
    go();
  },

  async handle(it) {
    if (it.action === 'today') { App._gotoCard('calendar'); return; }
    // 위젯에서 동그라미를 눌러 끝낸 할 일
    if (it.action === 'taskDone' && it.id) {
      const t = (App.S.tasks[it.list] || []).find(x => String(x.id) === String(it.id))
        || Object.entries(App.S.tasks || {}).map(([l, a]) => (a || []).find(x => String(x.id) === String(it.id)) && { ...((a || []).find(x => String(x.id) === String(it.id))), _l: l }).find(Boolean);
      const list = t && (t._l || it.list);
      if (t && t.status !== 'completed') await App._toggle(t.id, list, false);
      return;
    }
    // 위젯에서 누른 습관 체크(그날 것만, 이미 같은 상태면 그대로)
    if (it.action === 'habitToggle' && it.id) {
      const d = new Date(), ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (it.day && it.day !== ymd) return;
      const want = it.ok === '1', has = Habits.getChecked(d).map(String).includes(String(it.id));
      if (want !== has) { const h = Habits.getHabitsForDate(d).find(x => String(x.id) === String(it.id)); if (h) Habits.toggle(h.id, d); }
      return;
    }
    if (it.action === 'addTask' && it.title) {
      // 구글이 없으면 Bashy 목록으로
      const listId = Auth.isLoggedIn() ? App.S.lists[0].id : BashyCal.LIST_ID;
      const task = await TaskStore.createTask(listId, String(it.title).slice(0, 200), null, '');
      task.starred = false;
      (App.S.tasks[listId] = App.S.tasks[listId] || []).unshift(task);
      App._renderTasks(); App._updateStatsBanner();
      App.showToast(`할 일 추가됨: ${it.title}`, 'success');
      App._gotoCard('calendar');
      return;
    }
    if (it.action === 'weight') {
      const kg = Math.round(Number(it.kg) * 10) / 10;
      if (!(kg > 20 && kg < 300)) throw new Error('몸무게 값이 이상합니다');
      const d = new Date(), dt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const recs = InBody.getRecords();
      const same = recs.find(r => r.dt === dt);
      if (same) same.wt = kg; else recs.push({ dt, wt: kg });
      InBody.saveRecords(recs); InBody.render();
      App.showToast(`몸무게 ${kg}kg 기록됨`, 'success');
      App._gotoCard('inbody');
    }
  },

  // ── Face ID 잠금 ──
  async menu() {
    const anchor = document.querySelector('.profile-menu-item[data-ic="logout"]');
    if (!anchor || document.getElementById('nativeLockItem')) return;
    let st = { enabled: false, available: false, kind: 'passcode' };
    try { st = await this.P.getAppLock(); } catch {}
    if (!st.available) return;
    const el = document.createElement('div');
    el.className = 'profile-menu-item'; el.id = 'nativeLockItem';
    el.onclick = () => this.toggleLock();
    anchor.parentNode.insertBefore(el, anchor);
    this._kind = st.kind; this.paint(st.enabled);
  },
  paint(on) {
    const el = document.getElementById('nativeLockItem'); if (!el) return;
    const name = this._kind === 'faceid' ? 'Face ID' : this._kind === 'touchid' ? 'Touch ID' : '암호';
    el.textContent = `${name} 잠금 · ${on ? '켜짐' : '꺼짐'}`;
    this._lock = on;
  },
  async toggleLock() {
    try {
      const r = await this.P.setAppLock({ enabled: !this._lock });
      this.paint(r.enabled);
      App.showToast(r.enabled ? '앱을 열 때마다 본인 확인을 합니다' : '잠금을 껐습니다', 'success');
    } catch (e) { App.showToast('잠금 설정 실패: ' + (e.message || e), 'error'); }
  },
};
window.addEventListener('load', () => NativeApp.init());
