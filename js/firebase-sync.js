// js/firebase-sync.js — Firebase Realtime Database 실시간 동기화

const FirebaseSync = {
  _uid:       null,
  _dbUrl:     null,
  _saveTimer: null,
  _syncing:   false,
  _watching:  false,
  _sseSource: null,
  _lastSave:  0,

  init(uid, dbUrl) {
    if (!uid || !dbUrl || dbUrl === 'YOUR_FIREBASE_DB_URL') return;
    this._uid   = uid.replace(/[.#$[\]@]/g, '_');
    this._dbUrl = dbUrl.replace(/\/$/, '');
    console.log('[FirebaseSync] 초기화:', this._uid);
  },

  collectData() {
    const data = {}, prefix = `u_${this._uid}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) data[key] = localStorage.getItem(key);
    }
    ['gl_ai_key','gl_tts','gl_dark','gl_cat_colors'].forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    return data;
  },

  restoreData(data) {
    if (!data || typeof data !== 'object') return;
    Object.entries(data).forEach(([k, v]) => {
      if (v !== null && v !== undefined) {
        // localStorage.setItem 직접 호출 (무한루프 방지)
        Object.getPrototypeOf(localStorage).setItem.call(localStorage, k, v);
      }
    });
  },

  async load() {
    if (!this._uid || !this._dbUrl) return false;
    try {
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        this.restoreData(data);
        console.log('[FirebaseSync] 불러오기 완료:', Object.keys(data).length, '개');
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[FirebaseSync] 불러오기 실패:', e.message);
      return false;
    }
  },

  async save() {
    if (!this._uid || !this._dbUrl || this._syncing) return;
    this._syncing = true;
    try {
      const data = this.collectData();
      await fetch(`${this._dbUrl}/users/${this._uid}.json`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      this._lastSave = Date.now();
      console.log('[FirebaseSync] 저장 완료');
    } catch (e) {
      console.warn('[FirebaseSync] 저장 실패:', e.message);
    } finally {
      this._syncing = false;
    }
  },

  // 2초 디바운스 저장
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 2000);
  },

  // Firebase SSE 실시간 리스너 (다른 기기 변경 감지)
  startRealtime() {
    if (!this._uid || !this._dbUrl) return;
    if (this._sseSource) { this._sseSource.close(); }

    const url = `${this._dbUrl}/users/${this._uid}.json`;

    // Firebase REST SSE
    const evtSrc = new EventSource(`${url}?alt=sse`);
    evtSrc.addEventListener('put', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (!payload?.data) return;
        // 방금 내가 저장한 것이면 무시 (2초 이내)
        if (Date.now() - this._lastSave < 3000) return;
        console.log('[FirebaseSync] 원격 변경 감지 - 업데이트');
        this.restoreData(payload.data);
        // UI 갱신
        this._refreshUI();
      } catch {}
    });
    evtSrc.addEventListener('patch', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (!payload?.data) return;
        if (Date.now() - this._lastSave < 3000) return;
        this.restoreData(payload.data);
        this._refreshUI();
      } catch {}
    });
    evtSrc.onerror = () => {
      // SSE 연결 실패 시 폴링으로 대체
      evtSrc.close();
      this._startPolling();
    };
    this._sseSource = evtSrc;
    console.log('[FirebaseSync] 실시간 리스너 시작');
  },

  // SSE 안될 때 30초 폴링
  _pollTimer: null,
  _startPolling() {
    if (this._pollTimer) return;
    console.log('[FirebaseSync] 폴링 모드 시작 (30초)');
    this._pollTimer = setInterval(async () => {
      if (Date.now() - this._lastSave < 5000) return;
      const ok = await this.load();
      if (ok) this._refreshUI();
    }, 30000);
  },

  // UI 전체 갱신
  _refreshUI() {
    if (typeof App === 'undefined') return;
    try { Habits.render(App.S.selDate||new Date()); } catch {}
    try { Diet.render(App.S.selDate||new Date()); } catch {}
    try { Checklist.render(); } catch {}
    try { Memo.render(); } catch {}
    try { App._renderTasks(); } catch {}
    try { App._updateStatsBanner(); } catch {}
    console.log('[FirebaseSync] UI 갱신 완료');
  },

  watchChanges() {
    if (this._watching || !this._uid) return;
    this._watching = true;
    const prefix  = `u_${this._uid}_`;
    const extras  = new Set(['gl_ai_key','gl_tts','gl_dark','gl_cat_colors']);
    const origSet = Object.getPrototypeOf(localStorage).setItem.bind(localStorage);
    localStorage.setItem = (key, val) => {
      origSet(key, val);
      if (key.startsWith(prefix) || extras.has(key)) {
        this.scheduleSave();
      }
    };
    // 실시간 리스너 시작
    setTimeout(() => this.startRealtime(), 1000);
    console.log('[FirebaseSync] 변경 감시 시작 (prefix:', prefix, ')');
  },
};
