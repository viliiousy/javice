// js/app.js — 갓생 대시보드 메인 컨트롤러

const App = {
  S: {
    calDate:    new Date(),
    selDate:    new Date(),
    lists:      [],
    tasks:      {},
    events:     [],
    offline:    false,
    taskFilter: 'all',   // 'all' | 'starred' | 'date' | listId
  },

  async init() {
    this._updateDate();
    this._loadQuote();
    this._setupListeners();
    setTimeout(() => { if (typeof JARVIS !== 'undefined') JARVIS.init(); }, 500);
    const waitGIS = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts) {
        clearInterval(waitGIS);
        Auth.init();
      }
    }, 150);
    setTimeout(() => { clearInterval(waitGIS); }, 5000);
  },

  _setupListeners() {
    const $ = id => document.getElementById(id);
    $('btnGoogleLogin').onclick  = () => Auth.login();
    $('btnOfflineMode').onclick  = () => this.startOffline();
    $('btnLogout').onclick       = () => Auth.logout();
    $('btnSync').onclick         = () => this.sync();
    $('btnAddTask').onclick      = () => this._showTaskForm(true);
    $('btnCancelTask').onclick   = () => this._showTaskForm(false);
    $('btnSaveTask').onclick     = () => this._saveTask();
    $('btnAddEvent').onclick     = () => this._showAddEventModal();
    $('btnManageHabits').onclick = () => Habits.showManageModal();
    $('btnModalClose').onclick   = () => this.closeModal();
    $('modal').onclick           = e => { if (e.target === $('modal')) this.closeModal(); };
    $('taskInput').onkeypress    = e => { if (e.key === 'Enter') this._saveTask(); };
  },

  async onAuthSuccess(userInfo) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    if (userInfo?.name) {
      document.getElementById('hName').textContent = userInfo.name;
      if (userInfo.picture) document.getElementById('hAvatar').src = userInfo.picture;
      document.getElementById('hUser').style.display = 'flex';
    }
    this._updateDate();
    Habits.init();
    Fitness.render();
    Diet.render();
    CalendarUI.render(document.getElementById('miniCal'), this.S.calDate, [], this.S.selDate);
    await this.sync();
    Weather.init();
  },

  startOffline() {
    this.S.offline = true;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    this._updateDate();
    Habits.init();
    Fitness.render();
    Diet.render();
    Weather.init();
    CalendarUI.render(document.getElementById('miniCal'), this.S.calDate, [], this.S.selDate);
    document.getElementById('eventsWrap').innerHTML = '<p class="empty" style="font-size:12px">오프라인 모드</p>';
    document.getElementById('tasksContainer').innerHTML =
      '<p class="empty">오프라인 모드 — 구글 로그인 시 할일이 동기화됩니다</p>';
  },

  // ── 동기화 ────────────────────────────
  async sync() {
    if (this.S.offline || !Auth.isLoggedIn()) return;
    this.showToast('동기화 중...', '');
    try {
      // 할일
      this.S.lists = await GoogleTasks.fetchTaskLists();
      const sel = document.getElementById('taskListSel');
      sel.innerHTML = this.S.lists.map(l => `<option value="${l.id}">${esc(l.title)}</option>`).join('');
      this.S.tasks = {};
      await Promise.all(this.S.lists.map(async l => {
        this.S.tasks[l.id] = await GoogleTasks.fetchTasks(l.id);
      }));
      this._buildTaskFilters();
      this._renderTasks();

      // 캘린더
      const tMin = new Date();
      tMin.setDate(tMin.getDate() - 14);
      tMin.setHours(0, 0, 0, 0);
      const tMax = new Date();
      tMax.setDate(tMax.getDate() + 60);
      tMax.setHours(23, 59, 59, 999);
      this.S.events = await GoogleCalendar.fetchEvents(tMin, tMax);
      CalendarUI.render(document.getElementById('miniCal'), this.S.calDate, this.S.events, this.S.selDate);
      this._renderEventsFor(this.S.selDate);
      this.showToast('동기화 완료 ✓', 'success');
    } catch (err) {
      console.error('[Sync]', err);
      this.showToast('동기화 실패: ' + err.message, 'error');
    }
  },

  // ── 할일 필터 탭 ──────────────────────
  _buildTaskFilters() {
    const wrap = document.getElementById('taskFilters');
    if (!wrap) return;
    const tabs = [
      { id: 'all',     label: '전체' },
      { id: 'starred', label: '⭐ 별표' },
      { id: 'date',    label: '📅 날짜순' },
      ...this.S.lists.map(l => ({ id: l.id, label: l.title })),
    ];
    wrap.innerHTML = tabs.map(t =>
      `<button class="fit-tab${this.S.taskFilter === t.id ? ' active' : ''}"
        onclick="App._setTaskFilter('${t.id}')">${esc(t.label)}</button>`
    ).join('');
  },

  _setTaskFilter(id) {
    this.S.taskFilter = id;
    this._buildTaskFilters();
    this._renderTasks();
  },

  // ── 할일 렌더 ─────────────────────────
  _renderTasks() {
    const today = new Date().toDateString();
    const filter = this.S.taskFilter;
    let allTasks = [];

    // 모든 할일 수집
    for (const list of this.S.lists) {
      const items = (this.S.tasks[list.id] || []).filter(t => {
        if (t.status === 'needsAction') return true;
        if (t.status === 'completed' && t.completed)
          return new Date(t.completed).toDateString() === today;
        return false;
      }).map(t => ({ ...t, _listId: list.id, _listTitle: list.title }));
      allTasks.push(...items);
    }

    // 필터 적용
    let filtered = allTasks;
    if (filter === 'starred') {
      filtered = allTasks.filter(t => t.starred === 'true' || t.starred === true);
    } else if (filter === 'date') {
      filtered = [...allTasks].sort((a, b) => {
        const da = a.due ? new Date(a.due) : new Date('9999');
        const db = b.due ? new Date(b.due) : new Date('9999');
        return da - db;
      });
    } else if (filter !== 'all') {
      filtered = allTasks.filter(t => t._listId === filter);
    }

    // 별표 항목 상단 고정 (전체/날짜순 탭에서도)
    if (filter !== 'starred') {
      filtered.sort((a, b) => {
        const as = a.starred === 'true' || a.starred === true ? 0 : 1;
        const bs = b.starred === 'true' || b.starred === true ? 0 : 1;
        return as - bs;
      });
    }

    if (!filtered.length) {
      document.getElementById('tasksContainer').innerHTML =
        `<p class="empty">${filter === 'starred' ? '별표 항목이 없습니다' : '할일이 없습니다 🎉'}</p>`;
      return;
    }

    // 날짜순 모드는 날짜 그룹핑, 나머지는 목록 그룹핑
    let html = '';
    if (filter === 'date') {
      const groups = {};
      filtered.forEach(t => {
        const key = t.due ? new Date(t.due).toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'short' }) : '날짜 없음';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      for (const [label, items] of Object.entries(groups)) {
        html += `<div class="task-group"><div class="task-group-name">${label}</div>${items.map(t => this._taskHTML(t, t._listId)).join('')}</div>`;
      }
    } else if (filter === 'all' || filter === 'starred') {
      const groups = {};
      filtered.forEach(t => {
        if (!groups[t._listTitle]) groups[t._listTitle] = [];
        groups[t._listTitle].push(t);
      });
      for (const [label, items] of Object.entries(groups)) {
        html += `<div class="task-group"><div class="task-group-name">${esc(label)}</div>${items.map(t => this._taskHTML(t, t._listId)).join('')}</div>`;
      }
    } else {
      html = filtered.map(t => this._taskHTML(t, t._listId)).join('');
    }

    document.getElementById('tasksContainer').innerHTML = html;
  },

  _taskHTML(t, listId) {
    const done    = t.status === 'completed';
    const due     = t.due ? new Date(t.due) : null;
    const overdue = due && due < new Date() && !done;
    const starred = t.starred === 'true' || t.starred === true;
    return `<div class="task-item${done ? ' done' : ''}">
      <div class="task-check" onclick="App._toggle('${t.id}','${listId}',${done})"></div>
      <div class="task-body">
        <div class="task-text">${esc(t.title)}</div>
        ${due ? `<div class="task-due${overdue ? ' overdue' : ''}">${_fmtDate(due)}</div>` : ''}
      </div>
      <button class="task-star${starred ? ' starred' : ''}" onclick="App._toggleStar('${t.id}','${listId}')" title="별표">☆</button>
      <button class="task-del" onclick="App._delTask('${t.id}','${listId}')" title="삭제">✕</button>
    </div>`;
  },

  async _toggle(taskId, listId, done) {
    try {
      await GoogleTasks.toggleTask(listId, taskId, !done);
      const t = this.S.tasks[listId]?.find(x => x.id === taskId);
      if (t) {
        t.status    = !done ? 'completed' : 'needsAction';
        t.completed = !done ? new Date().toISOString() : null;
      }
      this._renderTasks();
      this.showToast(!done ? '완료! ✓' : '다시 할일로', 'success');
    } catch { this.showToast('업데이트 실패', 'error'); }
  },

  _toggleStar(taskId, listId) {
    const t = this.S.tasks[listId]?.find(x => x.id === taskId);
    if (!t) return;
    t.starred = !(t.starred === 'true' || t.starred === true);
    // 로컬에만 저장 (Google Tasks API는 starred 미지원)
    const key = `gl_starred_${taskId}`;
    if (t.starred) localStorage.setItem(key, '1');
    else           localStorage.removeItem(key);
    this._renderTasks();
  },

  async _delTask(taskId, listId) {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      await GoogleTasks.deleteTask(listId, taskId);
      this.S.tasks[listId] = this.S.tasks[listId]?.filter(t => t.id !== taskId);
      this._renderTasks();
      this.showToast('삭제됨', 'success');
    } catch { this.showToast('삭제 실패', 'error'); }
  },

  _showTaskForm(show) {
    document.getElementById('taskForm').classList.toggle('hidden', !show);
    if (show) setTimeout(() => document.getElementById('taskInput').focus(), 50);
  },

  async _saveTask() {
    const title  = document.getElementById('taskInput').value.trim();
    if (!title) return;
    const listId = document.getElementById('taskListSel').value;
    const due    = document.getElementById('taskDue').value;
    if (!Auth.isLoggedIn()) { this.showToast('로그인이 필요합니다', 'error'); return; }
    try {
      const task = await GoogleTasks.createTask(listId, title, due || null);
      if (!this.S.tasks[listId]) this.S.tasks[listId] = [];
      this.S.tasks[listId].unshift(task);
      this._renderTasks();
      document.getElementById('taskInput').value = '';
      document.getElementById('taskDue').value   = '';
      this._showTaskForm(false);
      this.showToast('할일 추가됨 ✓', 'success');
    } catch { this.showToast('추가 실패', 'error'); }
  },

  // ── 캘린더 ────────────────────────────
  selectCalDate(date) {
    this.S.selDate = date;
    CalendarUI.render(document.getElementById('miniCal'), this.S.calDate, this.S.events, date);
    this._renderEventsFor(date);
  },

  changeCalMonth(dir) {
    const d = this.S.calDate;
    this.S.calDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    CalendarUI.render(document.getElementById('miniCal'), this.S.calDate, this.S.events, this.S.selDate);
  },

  _renderEventsFor(date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const evs = (this.S.events || []).filter(e => {
      try {
        let evDate;
        if (e.start?.dateTime) {
          evDate = new Date(e.start.dateTime);
        } else if (e.start?.date) {
          // 종일 이벤트: "2026-05-22" 형식 → 로컬 날짜로 파싱
          const [y, m, d] = e.start.date.split('-').map(Number);
          evDate = new Date(y, m - 1, d);
        } else return false;
        evDate.setHours(0, 0, 0, 0);
        return evDate.getTime() === targetDate.getTime();
      } catch { return false; }
    }).sort((a, b) => {
      const da = a.start?.dateTime ? new Date(a.start.dateTime) : new Date(a.start?.date);
      const db = b.start?.dateTime ? new Date(b.start.dateTime) : new Date(b.start?.date);
      return da - db;
    });

    const label = date.toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'short' });

    if (!evs.length) {
      document.getElementById('eventsWrap').innerHTML =
        `<p class="empty" style="font-size:12px">${label} — 일정 없음</p>`;
      return;
    }

    document.getElementById('eventsWrap').innerHTML = `
      <div style="padding:6px 12px 3px;font-size:11px;color:var(--text3)">${label} · ${evs.length}개</div>
      ${evs.map(e => {
        const allDay = !e.start?.dateTime;
        const s      = allDay ? null : new Date(e.start.dateTime);
        const col    = _evColor(e.colorId);
        return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')">
          <div class="event-time" style="color:${col}">${allDay ? '종일' : _fmtTime(s)}</div>
          <div>
            <div class="event-title">${esc(e.summary || '(제목 없음)')}</div>
            ${e.location ? `<div class="event-loc">📍 ${esc(e.location)}</div>` : ''}
          </div>
        </div>`;
      }).join('')}`;
  },

  _showEvDetail(id) {
    const e = this.S.events.find(x => x.id === id);
    if (!e) return;
    const allDay = !e.start?.dateTime;
    const s = allDay ? null : new Date(e.start.dateTime);
    const en = e.end?.dateTime ? new Date(e.end.dateTime) : null;
    this.openModal('📅 일정', `
      <h4 style="font-size:16px;font-weight:700;margin-bottom:12px">${esc(e.summary || '(제목 없음)')}</h4>
      <p style="color:var(--text2);font-size:13px;margin-bottom:8px">
        📅 ${e.start?.date || _fmtFull(s)}<br>
        🕐 ${allDay ? '종일' : _fmtTime(s) + (en ? ' — ' + _fmtTime(en) : '')}
      </p>
      ${e.location ? `<p style="color:var(--text2);font-size:13px;margin-bottom:8px">📍 ${esc(e.location)}</p>` : ''}
      ${e.description ? `<div style="color:var(--text2);font-size:13px;padding:10px;background:var(--card2);border-radius:8px;white-space:pre-wrap;word-break:break-word;margin-bottom:12px">${esc(e.description)}</div>` : ''}
      ${!this.S.offline ? `<button onclick="App._delEvent('${e.id}')"
        style="width:100%;padding:9px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;color:var(--red);cursor:pointer;font-family:inherit;font-size:13px">🗑 일정 삭제</button>` : ''}`);
  },

  async _delEvent(id) {
    if (!confirm('일정을 삭제하시겠습니까?')) return;
    try {
      await GoogleCalendar.deleteEvent(id);
      this.S.events = this.S.events.filter(e => e.id !== id);
      CalendarUI.render(document.getElementById('miniCal'), this.S.calDate, this.S.events, this.S.selDate);
      this._renderEventsFor(this.S.selDate);
      this.closeModal();
      this.showToast('삭제됨', 'success');
    } catch { this.showToast('삭제 실패', 'error'); }
  },

  _showAddEventModal() {
    const n = new Date();
    const s = new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours() + 1, 0);
    const e = new Date(s.getTime() + 3600000);
    const fmt = d => d.toISOString().slice(0, 16);
    this.openModal('📅 일정 추가', `
      <div class="modal-row"><label class="modal-lbl">제목 *</label><input id="evT" type="text" placeholder="일정 제목" class="inp"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">시작</label><input id="evS" type="datetime-local" value="${fmt(s)}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">종료</label><input id="evE" type="datetime-local" value="${fmt(e)}" class="inp inp-sm"></div>
      </div>
      <div class="modal-row"><label class="modal-lbl">장소 (선택)</label><input id="evL" type="text" placeholder="장소" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">설명 (선택)</label><textarea id="evD" placeholder="설명" class="inp" rows="3"></textarea></div>
      <div class="modal-btns">
        <button onclick="App._createEvent()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(() => document.getElementById('evT')?.focus(), 50);
  },

  async _createEvent() {
    const title = document.getElementById('evT').value.trim();
    const start = document.getElementById('evS').value;
    const end   = document.getElementById('evE').value;
    if (!title || !start || !end) { this.showToast('제목과 날짜를 입력해주세요', 'error'); return; }
    try {
      const ev = await GoogleCalendar.createEvent(
        title,
        new Date(start).toISOString(), new Date(end).toISOString(),
        document.getElementById('evD').value.trim(),
        document.getElementById('evL').value.trim()
      );
      this.S.events.push(ev);
      this.S.events.sort((a,b) => new Date(a.start?.dateTime||a.start?.date) - new Date(b.start?.dateTime||b.start?.date));
      CalendarUI.render(document.getElementById('miniCal'), this.S.calDate, this.S.events, this.S.selDate);
      this._renderEventsFor(this.S.selDate);
      this.closeModal();
      this.showToast('일정 추가됨 ✓', 'success');
    } catch { this.showToast('일정 추가 실패', 'error'); }
  },

  // ── 유틸리티 ──────────────────────────
  _updateDate() {
    const n = new Date();
    document.getElementById('hDate').textContent =
      n.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
    document.getElementById('hDay').textContent =
      n.toLocaleDateString('ko-KR', { weekday:'long' });
  },

  _loadQuote() {
    const Q = [
      '오늘 하루도 갓생을 살자 🔥','어제의 나보다 오늘의 내가 더 강하다',
      '작은 습관이 큰 변화를 만든다','힘들면 쉬어도 된다. 포기하지만 마라',
      '땀은 거짓말을 하지 않는다','불편함을 이겨내는 것이 성장이다',
      '완벽하지 않아도 괜찮다. 일단 시작해라','루틴이 나를 만든다',
      '결과는 내가 노력한 만큼 따라온다','오늘의 고통이 내일의 자신감이 된다',
      '나 자신과의 약속을 지켜라','지치더라도 멈추지 마라. 느리더라도 계속 가라',
      '운동은 몸을 단련하고 독서는 마음을 단련한다','생각만 하지 말고 행동하라',
      '오늘 포기하면 내일도 포기한다','강한 몸은 강한 정신에서 나온다',
      '습관은 제2의 천성이다','목표를 향해 한 걸음씩',
      '매일 1%씩 나아진다면 1년 뒤 38배 성장한다','나는 매일 조금씩 더 나아지고 있다',
    ];
    document.getElementById('quoteText').textContent = Q[new Date().getDate() % Q.length];
  },

  openModal(title, body) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML    = body;
    document.getElementById('modal').classList.remove('hidden');
  },

  closeModal() { document.getElementById('modal').classList.add('hidden'); },

  showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = `toast${type ? ' ' + type : ''}`;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), 3000);
  },
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _fmtDate(d)  { return d?.toLocaleDateString('ko-KR', { month:'short', day:'numeric', weekday:'short' }) || ''; }
function _fmtTime(d)  { return d?.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', hour12:false }) || ''; }
function _fmtFull(d)  { return d?.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' }) || ''; }
function _evColor(cid) {
  const MAP = { '1':'#7986cb','2':'#33b679','3':'#8e24aa','4':'#e67c73','5':'#f6bf26',
                '6':'#f5511d','7':'#039be5','8':'#616161','9':'#3f51b5','10':'#0b8043','11':'#d60000' };
  return MAP[cid] || 'var(--cyan)';
}

document.addEventListener('DOMContentLoaded', () => App.init());
