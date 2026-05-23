// js/firebase-sync.js — 타임스탬프 기반 충돌 해결 동기화

const FirebaseSync = {
  _uid:       null,
  _dbUrl:     null,
  _saveTimer: null,
  _syncing:   false,
  _watching:  false,
  _pollTimer: null,
  _lastSaveTs: 0,    // 내가 마지막으로 저장한 시각
  _lastEditTs: 0,    // 내가 마지막으로 로컬 데이터를 편집한 시각
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
    // 저장 시각 기록 (충돌 해결용)
    data['_savedAt'] = String(Date.now());
    return data;
  },

  _restoreData(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return;
    const orig = this._origSet || localStorage.setItem.bind(localStorage);
    let count = 0;
    Object.entries(remoteData).forEach(([k, v]) => {
      if (!k || k === '_savedAt' || v === null || v === undefined) return;
      orig(k, String(v));
      count++;
    });
    return count;
  },

  async load() {
    if (!this._uid || !this._dbUrl) return false;
    try {
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        const count = this._restoreData(data);
        console.log('[FirebaseSync] 불러오기 완료:', count, '개');
        return true;
      }
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
      const data = this._collectData();
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._lastSaveTs = Date.now();
      console.log('[FirebaseSync] 저장 완료, ts:', this._lastSaveTs);
    } catch (e) {
      console.error('[FirebaseSync] 저장 실패:', e.message);
    } finally {
      this._syncing = false;
    }
  },

  scheduleSave() {
    this._lastEditTs = Date.now(); // 편집 시각 기록
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

    // 페이지 다시 포커스 시 최신 데이터 동기화
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // 편집 후 2초 경과했을 때만 pull (내 변경 덮어쓰기 방지)
        if (Date.now() - this._lastEditTs > 2000) {
          setTimeout(() => this._smartPull(), 500);
        }
      }
    });

    // 20초마다 스마트 폴링
    this._pollTimer = setInterval(() => this._smartPoll(), 20000);
    console.log('[FirebaseSync] 감시 시작');
  },

  // 타임스탬프 비교 → 최신 데이터 승리
  async _smartPull() {
    if (!this._uid || !this._dbUrl) return;
    // 최근 1초 이내 편집 중이면 스킵
    if (Date.now() - this._lastEditTs < 1000) return;

    try {
      const res = await fetch(`${this._dbUrl}/users/${this._uid}/_savedAt.json`);
      if (!res.ok) return;
      const remoteTs = parseInt(await res.json() || '0', 10);
      const localTs  = this._lastSaveTs;

      console.log('[FirebaseSync] ts 비교 - 원격:', remoteTs, '로컬:', localTs);

      // 원격이 더 최신이면 전체 불러오기 + UI 갱신
      if (remoteTs > localTs + 500) { // 500ms 여유
        console.log('[FirebaseSync] 원격이 최신 → 불러오기');
        const ok = await this.load();
        if (ok) {
          this._lastSaveTs = remoteTs;
          this._refreshUI();
        }
      }
    } catch {}
  },

  // 20초 폴링
  async _smartPoll() {
    if (Date.now() - this._lastEditTs < 2000) return;
    await this._smartPull();
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
    console.log('[FirebaseSync] UI 갱신 완료');
  },
};
