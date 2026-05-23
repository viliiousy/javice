// js/firebase-sync.js — Firebase 동기화 (명시적 호출 방식)

const FirebaseSync = {
  _uid:        null,
  _dbUrl:      null,
  _saveTimer:  null,
  _syncing:    false,
  _lastSaveTs: 0,
  _lastEditTs: 0,
  _pollTimer:  null,

  init(normalizedUid, dbUrl) {
    if (!normalizedUid || !dbUrl || dbUrl.includes('YOUR_FIREBASE')) return;
    this._uid   = normalizedUid;
    this._dbUrl = dbUrl.replace(/\/$/, '');
    console.log('[FB] 초기화:', this._uid);
  },

  ready() { return !!(this._uid && this._dbUrl); },

  _collectData() {
    const data   = UserStore.getAllData();
    const extras = ['gl_ai_key','gl_tts','gl_dark','gl_cat_colors'];
    extras.forEach(k => { const v=localStorage.getItem(k); if(v!=null) data[k]=v; });
    data['_savedAt'] = String(Date.now());
    return data;
  },

  _restore(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return 0;
    let n = 0;
    Object.entries(remoteData).forEach(([k,v]) => {
      if (!k || k==='_savedAt' || v==null) return;
      localStorage.setItem(k, String(v));
      n++;
    });
    return n;
  },

  async load() {
    if (!this.ready()) return false;
    try {
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data==='object' && Object.keys(data).length > 0) {
        const remoteTs = parseInt(data['_savedAt']||'0',10);
        this._restore(data);
        if (remoteTs > 0) this._lastSaveTs = remoteTs; // 핵심: load 후 ts 설정
        console.log('[FB] 불러오기 완료, ts:', remoteTs);
        return true;
      }
      return false;
    } catch(e) {
      console.error('[FB] 불러오기 실패:', e.message);
      return false;
    }
  },

  async save() {
    if (!this.ready() || this._syncing) {
      if (this._syncing) this.scheduleSave();
      return;
    }
    this._syncing = true;
    try {
      const data = this._collectData();
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._lastSaveTs = parseInt(data['_savedAt'],10);
      console.log('[FB] 저장 완료, ts:', this._lastSaveTs);
    } catch(e) {
      console.error('[FB] 저장 실패:', e.message);
    } finally {
      this._syncing = false;
    }
  },

  // 각 모듈에서 데이터 변경 시 직접 호출
  scheduleSave() {
    this._lastEditTs = Date.now();
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 1000);
  },

  startPolling() {
    if (this._pollTimer) return;
    // 20초마다 다른 기기 변경 확인
    this._pollTimer = setInterval(() => this._poll(), 20000);
    // 앱 포커스 시 즉시 확인
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState==='visible') {
        setTimeout(() => this._poll(), 500);
      }
    });
    console.log('[FB] 폴링 시작 (20초)');
  },

  async _poll() {
    if (!this.ready()) return;
    if (Date.now() - this._lastEditTs < 2000) return; // 편집 중 스킵
    if (Date.now() - this._lastSaveTs  < 3000) return; // 방금 저장 스킵
    try {
      const res = await fetch(`${this._dbUrl}/users/${this._uid}/_savedAt.json`);
      if (!res.ok) return;
      const remoteTs = parseInt(await res.json()||'0',10);
      if (remoteTs > this._lastSaveTs + 1000) {
        console.log('[FB] 원격 변경 감지, ts:', remoteTs, '→ 불러오기');
        const ok = await this.load();
        if (ok) this._refreshUI();
      }
    } catch {}
  },

  _refreshUI() {
    if (typeof App==='undefined') return;
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
