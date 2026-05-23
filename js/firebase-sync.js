// js/firebase-sync.js — Firebase Realtime Database 기기간 동기화
// UserStore의 u_{uid}_ prefix 키를 모두 동기화

const FirebaseSync = {
  _uid:       null,
  _dbUrl:     null,
  _saveTimer: null,
  _syncing:   false,
  _watching:  false,

  init(uid, dbUrl) {
    if (!uid || !dbUrl || dbUrl === 'YOUR_FIREBASE_DB_URL') return;
    this._uid   = uid.replace(/[.#$[\]@]/g, '_');
    this._dbUrl = dbUrl.replace(/\/$/, '');
    console.log('[FirebaseSync] 초기화:', this._uid);
  },

  // 이 uid의 모든 데이터 수집
  collectData() {
    const data = {}, prefix = `u_${this._uid}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        data[key] = localStorage.getItem(key);
      }
    }
    // 기타 설정 키도 동기화
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
        localStorage.setItem(k, v);
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
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log('[FirebaseSync] 저장 완료 (' + Object.keys(data).length + '개)');
    } catch (e) {
      console.warn('[FirebaseSync] 저장 실패:', e.message);
    } finally {
      this._syncing = false;
    }
  },

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 2000);
  },

  watchChanges() {
    if (this._watching || !this._uid) return;
    this._watching = true;
    const prefix   = `u_${this._uid}_`;
    const extras   = new Set(['gl_ai_key','gl_tts','gl_dark','gl_cat_colors']);
    const origSet  = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key, val) => {
      origSet(key, val);
      if (key.startsWith(prefix) || extras.has(key)) {
        this.scheduleSave();
      }
    };
    console.log('[FirebaseSync] 변경 감시 시작 (prefix:', prefix, ')');
  },
};
