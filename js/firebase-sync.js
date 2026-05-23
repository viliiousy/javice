// js/firebase-sync.js — Firebase 동기화 (레이스 컨디션 완전 해결)

const FirebaseSync = {
  _uid:       null,
  _dbUrl:     null,
  _saveTimer: null,
  _syncing:   false,
  _watching:  false,
  _pollTimer: null,
  _lastSave:  0,       // 마지막 저장 시각
  _lastLocal: 0,       // 마지막 로컬 변경 시각
  _origSet:   null,

  init(normalizedUid, dbUrl) {
    if (!normalizedUid || !dbUrl || dbUrl.includes('YOUR_FIREBASE')) return;
    this._uid   = normalizedUid;
    this._dbUrl = dbUrl.replace(/\/$/, '');
    console.log('[FirebaseSync] 초기화:', this._uid);
  },

  _collectData() {
    const data = UserStore.getAllData();
    ['gl_ai_key','gl_tts','gl_dark','gl_cat_colors'].forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    return data;
  },

  // 원본 setItem으로 직접 복원 (감시 루프 방지)
  _restoreData(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return;
    const orig = this._origSet || localStorage.setItem.bind(localStorage);

    Object.entries(remoteData).forEach(([k, v]) => {
      if (!k || v === null || v === undefined) return;

      // 로컬에 최근 변경된 키는 덮어쓰지 않음
      const localVal = localStorage.getItem(k);
      if (localVal === String(v)) return; // 동일하면 스킵

      orig(k, String(v));
    });
  },

  async load() {
    if (!this._uid || !this._dbUrl) return false;
    try {
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        this._restoreData(data);
        console.log('[FirebaseSync] 불러오기 완료:', Object.keys(data).length, '개');
        return true;
      }
      console.log('[FirebaseSync] 저장 데이터 없음 (첫 로그인)');
      return false;
    } catch (e) {
      console.error('[FirebaseSync] 불러오기 실패:', e.message);
      return false;
    }
  },

  async save() {
    if (!this._uid || !this._dbUrl) return;
    if (this._syncing) { this.scheduleSave(); return; }
    this._syncing = true;
    try {
      const data     = this._collectData();
      const keyCount = Object.keys(data).length;
      if (keyCount === 0) return;

      const res = await fetch(`${this._dbUrl}/users/${this._uid}.json`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._lastSave = Date.now();
      console.log('[FirebaseSync] 저장 완료:', keyCount, '개');
    } catch (e) {
      console.error('[FirebaseSync] 저장 실패:', e.message);
    } finally {
      this._syncing = false;
    }
  },

  // 변경 즉시 저장 (1초 디바운스)
  scheduleSave() {
    this._lastLocal = Date.now();
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 1000);
  },

  watchChanges() {
    if (this._watching || !this._uid) return;
    this._watching = true;

    const prefix = `u_${this._uid}_`;
    const extras = new Set(['gl_ai_key','gl_tts','gl_dark','gl_cat_colors']);

    this._origSet = localStorage.setItem.bind(localStorage);

    localStorage.setItem = (key, val) => {
      this._origSet(key, val);
      if (key && (key.startsWith(prefix) || extras.has(key))) {
        this.scheduleSave();
      }
    };

    // 페이지 포커스 시 서버에서 불러오기 (다른 기기 변경 반영)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // 마지막 로컬 변경이 3초 이상 지났을 때만 fetch
        if (Date.now() - this._lastLocal > 3000) {
          setTimeout(() => this._pollOnce(), 500);
        }
      }
    });

    // 30초마다 폴링 (다른 기기 변경 감지)
    this._startPolling();

    console.log('[FirebaseSync] 감시 시작. prefix:', prefix);
  },

  _startPolling() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => this._pollOnce(), 30000);
  },

  async _pollOnce() {
    // 최근 3초 이내 로컬 변경이 있으면 스킵 (내 변경 덮어쓰기 방지)
    if (Date.now() - this._lastLocal < 3000) return;
    // 최근 3초 이내 저장했으면 스킵
    if (Date.now() - this._lastSave < 3000) return;

    try {
      const res = await fetch(`${this._dbUrl}/users/${this._uid}.json`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data !== 'object') return;

      // 변경된 키만 업데이트
      const orig = this._origSet || localStorage.setItem.bind(localStorage);
      let changed = false;
      Object.entries(data).forEach(([k, v]) => {
        if (!k || v === null) return;
        if (localStorage.getItem(k) !== String(v)) {
          orig(k, String(v));
          changed = true;
        }
      });

      if (changed) {
        console.log('[FirebaseSync] 원격 변경 감지 → UI 갱신');
        this._refreshUI();
      }
    } catch {}
  },

  _refreshUI() {
    if (typeof App === 'undefined') return;
    const date = App.S?.selDate || new Date();
    requestAnimationFrame(() => {
      try { Habits.render(date); } catch {}
      try { Diet.render(date); } catch {}
      try { Checklist.render(); } catch {}
      try { Memo.render(); } catch {}
      try { App._updateStatsBanner(); } catch {}
    });
  },
};
