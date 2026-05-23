// js/firebase-sync.js — Firebase Realtime Database 완전 재설계

const FirebaseSync = {
  _uid:       null,
  _dbUrl:     null,
  _saveTimer: null,
  _syncing:   false,
  _watching:  false,
  _pollTimer: null,
  _lastSave:  0,
  _origSet:   null,  // 원본 localStorage.setItem

  init(normalizedUid, dbUrl) {
    if (!normalizedUid || !dbUrl || dbUrl.includes('YOUR_FIREBASE')) return;
    this._uid   = normalizedUid;  // 이미 정규화된 uid
    this._dbUrl = dbUrl.replace(/\/$/, '');
    console.log('[FirebaseSync] 초기화 완료. uid:', this._uid);
  },

  // 현재 계정 데이터 수집 (UserStore prefix 사용)
  _collectData() {
    const data = UserStore.getAllData();
    // 공통 설정도 포함
    ['gl_ai_key', 'gl_tts', 'gl_dark', 'gl_cat_colors'].forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    return data;
  },

  // Firebase에서 받은 데이터를 localStorage에 복원
  // 원본 setItem으로 직접 써서 무한루프 방지
  _restoreData(data) {
    if (!data || typeof data !== 'object') return;
    const origSet = this._origSet || localStorage.setItem.bind(localStorage);
    let count = 0;
    Object.entries(data).forEach(([k, v]) => {
      if (k && v !== null && v !== undefined) {
        origSet(k, String(v));
        count++;
      }
    });
    console.log('[FirebaseSync] 복원 완료:', count, '개');
  },

  // Firebase에서 불러오기
  async load() {
    if (!this._uid || !this._dbUrl) { console.warn('[FirebaseSync] load: 초기화 안됨'); return false; }
    try {
      const url = `${this._dbUrl}/users/${this._uid}.json`;
      console.log('[FirebaseSync] 불러오기:', url);
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        this._restoreData(data);
        return true;
      }
      console.log('[FirebaseSync] 저장된 데이터 없음 (첫 로그인)');
      return false;
    } catch (e) {
      console.error('[FirebaseSync] 불러오기 실패:', e.message);
      return false;
    }
  },

  // Firebase에 저장
  async save() {
    if (!this._uid || !this._dbUrl) return;
    if (this._syncing) { this.scheduleSave(); return; }
    this._syncing = true;
    try {
      const data = this._collectData();
      const keyCount = Object.keys(data).length;
      if (keyCount === 0) { this._syncing = false; return; }

      const url = `${this._dbUrl}/users/${this._uid}.json`;
      const res = await fetch(url, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._lastSave = Date.now();
      console.log('[FirebaseSync] 저장 완료:', keyCount, '개 키');
    } catch (e) {
      console.error('[FirebaseSync] 저장 실패:', e.message);
    } finally {
      this._syncing = false;
    }
  },

  // 즉시 저장 (중요한 변경 시)
  saveNow() {
    clearTimeout(this._saveTimer);
    this.save();
  },

  // 1.5초 디바운스 저장
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 1500);
  },

  // localStorage.setItem 감시 시작
  watchChanges() {
    if (this._watching || !this._uid) return;
    this._watching = true;

    const prefix = `u_${this._uid}_`;
    const extras = new Set(['gl_ai_key', 'gl_tts', 'gl_dark', 'gl_cat_colors',
                            'gl_cat_colors', 'gl_current_uid']);

    // 원본 setItem 보존
    this._origSet = localStorage.setItem.bind(localStorage);

    // override
    localStorage.setItem = (key, val) => {
      this._origSet(key, val);
      if (key && (key.startsWith(prefix) || extras.has(key))) {
        this.scheduleSave();
      }
    };

    // 폴링으로 다른 기기 변경 감지 (15초마다)
    this._startPolling();

    console.log('[FirebaseSync] 감시 시작. prefix:', prefix);
  },

  // 15초마다 다른 기기 변경 확인
  _startPolling() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(async () => {
      // 방금 내가 저장한 거면 스킵
      if (Date.now() - this._lastSave < 5000) return;
      try {
        const url = `${this._dbUrl}/users/${this._uid}.json`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
          this._restoreData(data);
          this._refreshUI();
        }
      } catch {}
    }, 15000);
    console.log('[FirebaseSync] 폴링 시작 (15초 간격)');
  },

  // UI 전체 갱신
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
    console.log('[FirebaseSync] UI 갱신');
  },
};
