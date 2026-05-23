// js/firebase-sync.js — Firebase Realtime Database 기기간 동기화

const FirebaseSync = {
  _uid:      null,
  _dbUrl:    null,
  _saveTimer: null,
  _syncing:   false,

  SYNC_KEYS: [
    /^gl_habits_/,
    /^gl_checklist_/,
    /^gl_memos_/,
    /^gl_diet_/,
    /^gl_fitness_/,
    /^gl_star_/,
    /^gl_task_extra_/,
    /^gl_cal_settings/,
    /^gl_ai_key/,
    /^gl_tts/,
    /^gl_dark/,
  ],

  init(uid, dbUrl) {
    if (!uid || !dbUrl || dbUrl === 'YOUR_FIREBASE_DB_URL') return;
    this._uid   = uid.replace(/[.#$[\]]/g, '_'); // Firebase 키 허용 문자로 변환
    this._dbUrl = dbUrl.replace(/\/$/, '');
    console.log('[FirebaseSync] 초기화 완료:', this._uid);
  },

  shouldSync(key) {
    return this.SYNC_KEYS.some(p => p.test(key));
  },

  collectData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && this.shouldSync(key)) data[key] = localStorage.getItem(key);
    }
    return data;
  },

  restoreData(data) {
    if (!data || typeof data !== 'object') return;
    Object.entries(data).forEach(([key, val]) => {
      if (val !== null && val !== undefined) localStorage.setItem(key, val);
    });
  },

  // ── 불러오기 ──────────────────────────
  async load() {
    if (!this._uid || !this._dbUrl) return false;
    try {
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        this.restoreData(data);
        console.log('[FirebaseSync] 불러오기 완료:', Object.keys(data).length, '개');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[FirebaseSync] 불러오기 실패:', err.message);
      return false;
    }
  },

  // ── 저장 ──────────────────────────────
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
      console.log('[FirebaseSync] 저장 완료');
    } catch (err) {
      console.warn('[FirebaseSync] 저장 실패:', err.message);
    } finally {
      this._syncing = false;
    }
  },

  // ── 변경 감지 (디바운스 3초) ──────────
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 3000);
  },

  watchChanges() {
    if (!this._uid) return;
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key, val) => {
      orig(key, val);
      if (this.shouldSync(key)) this.scheduleSave();
    };
    console.log('[FirebaseSync] 변경 감시 시작');
  },
};
