// js/wmission.js — 주간 미션
//
// 습관과 뭐가 다른가: 습관은 '이 요일에 한다', 주간 미션은 '이번 주에 N번 한다'.
// 헬스 3회, 독서 5회처럼 언제 하든 주에 몇 번만 채우면 되는 것들이다.
//
// god_life 에서 옮겨 왔다. 거기 있던 '요일을 체크하면 횟수가 자동으로 정해짐' 은 뺐다 —
// 그건 습관 카드가 이미 하는 일이고, 둘이 겹치면 새 항목을 어느 카드에 적어야 할지
// 매번 헷갈린다. 여기는 순수하게 '주 N회' 만 센다.

const WMission = {
  KEY: 'gl_wmissions',
  MAX: 14,          // 점을 한 줄에 담을 수 있는 한계. 주 15회는 습관으로 적는 게 맞다.
  _off: 0,          // 보고 있는 주 (0 = 이번 주, -1 = 지난주)

  // ── 주 계산 — 월요일 시작 ──────────────
  _ds(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  },
  _mon(date) {
    const r = new Date(date), w = r.getDay();
    r.setDate(r.getDate() - (w === 0 ? 6 : w - 1));   // 일요일은 그 주의 끝이다
    r.setHours(0,0,0,0);
    return r;
  },
  _weekStart(off) { const m = this._mon(new Date()); m.setDate(m.getDate() + off*7); return m; },
  _weekKey(off)   { return this._ds(this._weekStart(off)); },
  _logKey(wk)     { return `gl_wmlog_${wk}`; },

  // ── 저장 ───────────────────────────────
  // 목록은 하나, 기록은 주마다 따로 둔다. 한 덩어리로 묶으면 몇 년 치가 한 키에 쌓인다.
  getList()    { try { return JSON.parse(UserStore.get(this.KEY) || '[]'); } catch { return []; } },
  saveList(v)  { UserStore.set(this.KEY, JSON.stringify(v)); FirebaseSync?.scheduleSave(); },
  getLog(wk)   { try { return JSON.parse(UserStore.get(this._logKey(wk)) || '{}'); } catch { return {}; } },
  saveLog(wk,v){ UserStore.set(this._logKey(wk), JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  // 그 주에 이미 있던 미션만 센다. 오늘 만든 미션 때문에 지난주가 '0/3 실패' 로
  // 보이면 안 된다 — 하지도 않기로 한 일을 못 한 걸로 적는 셈이다.
  _forWeek(wk) { return this.getList().filter(m => !m.since || m.since <= wk); },
  _count(log, m) { const a = log[m.id]; return Array.isArray(a) ? Math.min(a.length, m.tg) : 0; },

  // ── 조작 ───────────────────────────────
  step(d) {
    const n = this._off + d;
    if (n > 0) return;                  // 아직 오지 않은 주는 볼 것도 채울 것도 없다
    this._off = n;
    this.render();
  },
  toggle(id, j) {
    if (this._off > 0) return;
    const wk  = this._weekKey(this._off);
    const log = this.getLog(wk);
    const m   = this.getList().find(x => x.id === id);
    if (!m) return;
    if (!Array.isArray(log[id])) log[id] = [];
    const a = log[id];
    // 왼쪽부터 채워지는 점이다. 이미 켜진 자리를 누르면 하나 빼고, 빈 자리를 누르면 하나 넣는다.
    if (j < a.length)        a.splice(j, 1);
    else if (a.length < m.tg) a.push(this._markDate());
    else return;
    this.saveLog(wk, log);
    this.render();
  },
  // 이번 주면 오늘 날짜, 지난 주를 뒤늦게 채우면 그 주 마지막 날로 적는다.
  _markDate() {
    if (this._off === 0) return this._ds(new Date());
    const s = this._weekStart(this._off); s.setDate(s.getDate() + 6);
    return this._ds(s);
  },

  add(name, tg) {
    name = String(name || '').trim();
    if (!name) return false;
    tg = Math.min(this.MAX, Math.max(1, parseInt(tg, 10) || 1));
    const list = this.getList();
    list.push({ id: 'w_' + Date.now(), name, tg, since: this._weekKey(0) });
    this.saveList(list);
    return true;
  },
  remove(id) {
    this.saveList(this.getList().filter(m => m.id !== id));
    // 기록은 지우지 않는다. 지난주에 세 번 한 건 사실이고, 되살리면 그대로 돌아온다.
  },

  // ── 화면 ───────────────────────────────
  render() {
    const wrap = document.getElementById('wmWrap');
    if (!wrap) return;
    const wk    = this._weekKey(this._off);
    const list  = this._forWeek(wk);
    const log   = this.getLog(wk);
    const start = this._weekStart(this._off);
    const end   = new Date(start); end.setDate(end.getDate() + 6);
    const fmt   = d => `${d.getMonth()+1}/${d.getDate()}`;

    let done = 0, total = 0;
    list.forEach(m => { total += m.tg; done += this._count(log, m); });
    const pct = total ? Math.round(done / total * 100) : 0;

    const label = this._off === 0 ? '이번 주'
                : this._off === -1 ? '지난주'
                : `${fmt(start)}–${fmt(end)}`;
    const nav = `<div class="wm-nav">
      <button onclick="WMission.step(-1)" aria-label="지난 주">‹</button>
      <span class="wm-week">${label}<i>${fmt(start)}–${fmt(end)}</i></span>
      <button onclick="WMission.step(1)" ${this._off >= 0 ? 'disabled' : ''} aria-label="다음 주">›</button>
    </div>`;

    if (!list.length) {
      wrap.innerHTML = nav + `<p class="empty">${Icons.big('target')}${
        this._off === 0 ? '주간 미션이 없습니다' : '그 주에는 미션이 없었습니다'}<br>
        <span class="wm-hint">주에 몇 번 할지 정해 두는 것들 — 헬스 3회, 독서 5회</span></p>`;
      this._foot(list, done, total);
      return;
    }

    const rows = list.map(m => {
      const c = this._count(log, m);
      const dots = Array.from({ length: m.tg }, (_, j) =>
        `<button class="wm-dot${j < c ? ' on' : ''}" onclick="WMission.toggle('${m.id}',${j})"
          aria-label="${esc(m.name)} ${j+1}번째 ${j < c ? '완료 취소' : '완료'}">${j < c ? '✓' : j+1}</button>`
      ).join('');
      return `<div class="wm-row">
        <div class="wm-top">
          <button class="wm-name" onclick="WMission.showEdit('${m.id}')">${esc(m.name)}</button>
          <span class="wm-cnt${c >= m.tg ? ' is-full' : ''}">${c}<i>/${m.tg}</i></span>
        </div>
        <div class="wm-dots">${dots}</div>
      </div>`;
    }).join('');

    // 한 값이 한 한계에 대해 어디쯤인가 — 미터 하나면 된다.
    // 예전 갓생일지는 30/60/100% 마다 빨강→노랑→파랑→초록으로 바뀌었는데,
    // 한 가지를 색 네 개로 말하면 색이 뜻을 잃는다. 같은 색조의 옅은 트랙에 진한 채움 하나.
    // 다 채운 순간만 다르게 두되, 색만으로 말하지 않고 '주간 완료' 라고 적는다.
    const meter = `<div class="wm-meter">
      <div class="wm-track"><div class="wm-fill${pct >= 100 ? ' is-full' : ''}" style="width:${pct}%"></div></div>
      <div class="wm-mlb"><span>${done}/${total}</span>
        <span class="wm-pct">${pct >= 100 ? `${Icons.svg('check','wm-ic')}주간 완료` : pct + '%'}</span></div>
    </div>`;

    wrap.innerHTML = nav + rows + meter;
    this._foot(list, done, total);
  },

  _foot(list, done, total) {
    const el = document.getElementById('wmFooter');
    if (!el) return;
    const left = total - done;
    el.innerHTML = `<span>${
      !list.length ? '아직 없음' : left === 0 ? '이번 주 전부 완료' : `${left}번 남음`
    }</span><button class="btn-sm" onclick="WMission.showAdd()">+ 미션 추가</button>`;
  },

  // ── 모달 ───────────────────────────────
  showAdd() {
    App.openModal('@target 주간 미션 추가', `
      <div class="modal-row"><label class="modal-lbl">이름</label>
        <input id="wmName" type="text" class="inp" placeholder="예: 헬스"></div>
      <div class="modal-row"><label class="modal-lbl">주 몇 회</label>
        <input id="wmTg" type="number" class="inp inp-sm" style="width:80px" value="3" min="1" max="${this.MAX}"></div>
      <p class="wm-hint" style="margin:8px 0 0">요일은 정하지 않습니다. 그 주에 몇 번 했는지만 셉니다.</p>
      <div class="modal-btns">
        <button onclick="WMission._doAdd()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`, () => document.getElementById('wmName')?.focus());
  },
  _doAdd() {
    const n = document.getElementById('wmName')?.value;
    const t = document.getElementById('wmTg')?.value;
    if (!this.add(n, t)) { App.showToast('이름을 입력해주세요', 'error'); return; }
    App.closeModal();
    this._off = 0;                 // 방금 만든 건 이번 주에 있다. 지난주를 보고 있었어도 데려온다.
    this.render();
  },
  showEdit(id) {
    const m = this.getList().find(x => x.id === id);
    if (!m) return;
    App.openModal('@target 주간 미션 수정', `
      <div class="modal-row"><label class="modal-lbl">이름</label>
        <input id="wmEName" type="text" class="inp" value="${this._attr(m.name)}"></div>
      <div class="modal-row"><label class="modal-lbl">주 몇 회</label>
        <input id="wmETg" type="number" class="inp inp-sm" style="width:80px" value="${m.tg}" min="1" max="${this.MAX}"></div>
      <div class="modal-btns">
        <button onclick="WMission._saveEdit('${id}')" class="btn-sm accent">저장</button>
        <button onclick="WMission._doRemove('${id}')" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },
  _attr(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); },
  _saveEdit(id) {
    const list = this.getList(), m = list.find(x => x.id === id);
    if (!m) return;
    const n = document.getElementById('wmEName')?.value.trim();
    const t = parseInt(document.getElementById('wmETg')?.value, 10);
    if (n) m.name = n;
    if (isFinite(t)) m.tg = Math.min(this.MAX, Math.max(1, t));
    this.saveList(list);
    App.closeModal();
    this.render();
  },
  _doRemove(id) {
    this.remove(id);
    App.closeModal();
    this.render();
  },

  init() { this.render(); },
};
