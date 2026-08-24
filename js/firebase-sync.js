// js/firebase-sync.js — Firebase 동기화 (명시적 호출 방식)

const FirebaseSync = {
  _uid:        null,   // 실제 저장 경로 (Firebase 로그인 성공 시 Firebase UID)
  _legacyUid:  null,   // 구버전 경로 (구글 sub) — 마이그레이션용
  _authed:     false,  // Firebase 인증 성공 여부
  _dbUrl:      null,
  _saveTimer:  null,
  _syncing:    false,
  _lastSaveTs: 0,
  _lastEditTs: 0,
  _pollTimer:  null,

  init(normalizedUid, dbUrl) {
    if (!normalizedUid || !dbUrl || dbUrl.includes('YOUR_FIREBASE')) return;
    this._uid       = normalizedUid;
    this._legacyUid = normalizedUid;
    this._dbUrl     = dbUrl.replace(/\/$/, '');
    console.log('[FB] 초기화:', this._uid);
  },

  ready() { return !!(this._uid && this._dbUrl); },

  // ── Firebase 인증 ───────────────────────
  // 구글 액세스 토큰으로 Firebase에도 로그인한다.
  // 실패하면 인증 없이 기존 경로를 그대로 쓰므로 앱은 계속 동작한다.
  async signIn(accessToken) {
    if (!accessToken) return false;
    if (typeof firebase === 'undefined' || !firebase.auth) {
      console.warn('[FB] Auth SDK 없음 — 인증 없이 진행');
      return false;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
      const cred = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
      const res  = await firebase.auth().signInWithCredential(cred);
      this._uid    = res.user.uid;
      this._authed = true;
      console.log('[FB] 인증 완료, uid:', this._uid);
      await this._migrateLegacy();
      return true;
    } catch (e) {
      console.error('[FB] 인증 실패 — 인증 없이 진행:', e.code || e.message);
      this._authed = false;
      return false;
    }
  },

  // 요청에 붙일 ?auth=<idToken> (인증 안 됐으면 빈 문자열)
  async _q() {
    if (!this._authed) return '';
    try {
      const u = firebase.auth().currentUser;
      if (!u) return '';
      const t = await u.getIdToken();   // 만료 시 자동 갱신됨
      return t ? `?auth=${encodeURIComponent(t)}` : '';
    } catch { return ''; }
  },

  // 구버전 경로(구글 sub) → 새 경로(Firebase UID) 1회 이전
  async _migrateLegacy() {
    if (!this._legacyUid || this._legacyUid === this._uid) return;
    const q = await this._q();
    try {
      const curRes = await fetch(`${this._dbUrl}/users/${this._uid}/_savedAt.json${q}`);
      if (!curRes.ok) throw new Error(`새 경로 확인 ${curRes.status}`);
      if (await curRes.json()) return;   // 새 경로에 이미 데이터 있음 → 이전 불필요

      const oldRes = await fetch(`${this._dbUrl}/users/${this._legacyUid}.json${q}`);
      if (!oldRes.ok) throw new Error(`구 경로 조회 ${oldRes.status}`);
      const old = await oldRes.json();
      // 구 경로가 정말로 비어 있으면 신규 사용자 → 이전할 것 없이 새 경로 사용
      if (!old || typeof old !== 'object' || !Object.keys(old).length) {
        console.log('[FB] 이전할 구버전 데이터 없음 — 새 경로 사용');
        return;
      }

      const res = await fetch(`${this._dbUrl}/users/${this._uid}.json${q}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(old),
      });
      if (!res.ok) throw new Error(`PUT ${res.status}`);
      console.log('[FB] 구버전 데이터 이전 완료:', Object.keys(old).length + '개 키');
    } catch (e) {
      // 이전 실패 → 새 경로를 쓰면 데이터가 빈 것처럼 보이므로 구경로를 계속 사용
      console.warn('[FB] 이전 실패 — 기존 경로 유지:', e.message);
      this._uid = this._legacyUid;
    }
  },

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
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json${await this._q()}`);
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
      // 빈 데이터 저장 방지 - _savedAt 외에 실제 데이터 없으면 스킵
      const realKeys = Object.keys(data).filter(k => k !== '_savedAt');
      if(realKeys.length === 0) {
        console.warn('[FB] 빈 데이터 저장 방지');
        this._syncing = false;
        return;
      }
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json${await this._q()}`, {
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
      const res = await fetch(`${this._dbUrl}/users/${this._uid}/_savedAt.json${await this._q()}`);
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
    // 동기화 알림 토스트
    try { App?.showToast('🔄 다른 기기에서 변경됨', 'success'); } catch {}
  },
};
