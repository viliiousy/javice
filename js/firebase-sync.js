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
  _synced:     null,   // 마지막으로 서버와 맞춘 값 {키: 값}. 이것과 다른 칸만 올린다(다른 기기 편집을 덮지 않게)
  _retry:      0,

  init(normalizedUid, dbUrl) {
    if (!normalizedUid || !dbUrl || dbUrl.includes('YOUR_FIREBASE')) return;
    this._uid       = normalizedUid;
    this._legacyUid = normalizedUid;
    this._dbUrl     = dbUrl.replace(/\/$/, '');
    this._synced    = null;
    this._ownerCheck(normalizedUid);
    console.log('[FB] 초기화:', this._uid);
  },

  ready() { return !!(this._uid && this._dbUrl); },

  // 계정마다 따로 두지 않는 기기 공용 칸(AI 키·디자인 설정 등). 사용자 데이터(u_<id>_*)는 계정별 접두사가 있어 안전하다.
  DEVICE_KEYS: ['gl_ai_key','gl_ai_prov','gl_ai_key_openai','gl_ai_key_anthropic','gl_ai_key_gemini','gl_ai_key_xai','gl_aiu_show','gl_cat_colors','gl_top_info','gl_home_cats','hub_cfg_v1','gl_hub_mode','gl_wx_ask','gl_wx_gps','gl_wx_geo','gl_wx_geo_a','gl_wx_city'],
  SECRET_KEYS: ['gl_ai_key','gl_ai_key_openai','gl_ai_key_anthropic','gl_ai_key_gemini','gl_ai_key_xai','hub_cfg_v1'],

  // 같은 기기에서 다른 구글 계정으로 들어오면, 앞 사람의 AI 키·설정이 새 계정에 보이고
  // 다음 저장 때 새 계정으로 올라가 버렸다. 주인이 바뀌면 공용 칸을 비우고 시작한다.
  _ownerCheck(id) {
    const prev = localStorage.getItem('gl_owner');
    if (prev && prev !== id) {
      this.DEVICE_KEYS.forEach(k => localStorage.removeItem(k));
      Object.keys(localStorage).filter(k => k.startsWith('gl_ai_models_')).forEach(k => localStorage.removeItem(k));
      console.log('[FB] 계정이 바뀌어 기기 공용 설정을 비웠습니다');
    }
    localStorage.setItem('gl_owner', id);
  },
  // 로그아웃: 비밀(키)은 이 기기에 남기지 않는다. 다시 로그인하면 계정에서 내려온다.
  clearSecrets() { this.SECRET_KEYS.forEach(k => localStorage.removeItem(k)); },

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

  // ── 연동 비밀 (_link) ───────────────────
  // 앱 데이터(u_<uid>_gl_*)와 달리 이건 localStorage 로 내려오지 않는다.
  // 서버 크론이 여기 있는 Hevy 키를 읽어 '그 사람 몫' 을 받아 온다.
  // 예전에는 이 키가 환경변수 하나였고, 그래서 누가 가입하든 같은 사람의 기록이 보였다.
  async getLink() {
    if (!this.ready()) return null;
    try {
      const r = await fetch(`${this._dbUrl}/users/${this._uid}/_link.json${await this._q()}`);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  },

  // PATCH 다 — 나중에 다른 연동이 늘어도 서로 지우지 않는다.
  async setLink(patch) {
    if (!this.ready()) return false;
    try {
      const r = await fetch(`${this._dbUrl}/users/${this._uid}/_link.json${await this._q()}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      });
      return r.ok;
    } catch (e) { return false; }
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

  EXTRAS: ['gl_ai_key','gl_ai_prov','gl_ai_key_openai','gl_ai_key_anthropic','gl_ai_key_gemini','gl_ai_key_xai','gl_aiu_show','gl_haptic','gl_tts','gl_dark','gl_cat_colors','gl_top_info','gl_home_cats','gl_top_overdue','gl_wx_ask','gl_wx_gps','gl_wx_geo_a','gl_wx_city'],
  _allLocal() {
    const data = UserStore.getAllData();
    this.EXTRAS.forEach(k => { const v=localStorage.getItem(k); if(v!=null) data[k]=v; });
    return data;
  },
  _mine(k) { return k.startsWith(`u_${UserStore.getUser()}_`) || this.EXTRAS.includes(k); },
  // 서버와 마지막으로 맞춘 뒤 이 기기에서 바뀐 칸 (지운 칸은 null)
  _dirty() {
    const all = this._allLocal();
    if (!this._synced) return all;               // 아직 서버와 맞춘 적이 없으면 전부
    const out = {};
    Object.entries(all).forEach(([k, v]) => { if (this._synced[k] !== v) out[k] = v; });
    Object.keys(this._synced).forEach(k => { if (!(k in all) && this._mine(k)) out[k] = null; });
    return out;
  },
  _collectData() {
    const data = this._dirty();
    data['_savedAt'] = String(Date.now());
    return data;
  },

  // ── 세 갈래 합치기 ────────────────────────
  // 같은 칸을 두 기기가 같이 바꿨을 때. 예전엔 '내 기기 것' 이 통째로 이겨 다른 기기에서 바꾼 것이 사라졌다
  // (예: 아이폰이 오늘 걸음, 갤럭시가 어제 걸음을 같은 칸에 넣으면 한쪽만 남았다).
  // base = 마지막으로 맞춘 값, mine = 이 기기, theirs = 서버. JSON 객체면 항목별로 합친다 —
  // 내가 바꾼 항목은 내 것, 아니면 서버 것(서버에서 지운 항목은 지운다). 한 단계 아래 객체도 같은 규칙으로.
  // 배열·글자는 나눌 수 없어 내 것이 이긴다(예전과 같음).
  _merge3(base, mine, theirs) {
    if (mine === theirs) return mine;
    if (base === theirs) return mine;     // 서버는 그대로 — 내 것
    if (base === mine) return theirs;     // 나는 그대로 — 서버 것
    const P = v => { try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } };
    const b = P(base) || {}, m = P(mine), t = P(theirs);
    if (!m || !t) return mine;
    const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    const obj = v => v && typeof v === 'object' && !Array.isArray(v);
    const merge = (b, m, t) => {
      const out = {};
      for (const k of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(b)])) {
        const inB = k in b, inM = k in m, inT = k in t;
        if (inM && inT && obj(m[k]) && obj(t[k])) { out[k] = merge(obj(b[k]) ? b[k] : {}, m[k], t[k]); continue; }
        const mineChanged = inM !== inB || (inM && !eq(m[k], b[k]));
        if (mineChanged) { if (inM) out[k] = m[k]; continue; }   // 내가 바꾸거나 더하거나(지웠으면 뺀다)
        if (inT) out[k] = t[k];                                  // 아니면 서버 것(서버가 지웠으면 빠진다)
      }
      return out;
    };
    return JSON.stringify(merge(b, m, t));
  },

  _restore(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return 0;
    // 이 기기에서 아직 못 올린 칸은 덮지 않고 합친다(합친 값은 다음 저장 때 올라간다)
    const dirty = this._synced ? this._dirty() : {};
    const base = this._synced || {};
    const synced = {};
    let n = 0;
    Object.entries(remoteData).forEach(([k,v]) => {
      // '_' 로 시작하는 칸은 앱 데이터가 아니라 서버가 쓰는 자리다(_savedAt, _link, _mod).
      if (!k || k.charAt(0)==='_' || v==null) return;
      synced[k] = String(v);
      if (k in dirty) {
        if (dirty[k] != null && base[k] !== String(v)) { const mg = this._merge3(base[k], dirty[k], String(v)); if (mg !== dirty[k]) { localStorage.setItem(k, mg); n++; } }
        return;
      }
      if (localStorage.getItem(k) !== String(v)) { localStorage.setItem(k, String(v)); n++; }
    });
    this._synced = synced;
    if (remoteData._mod && typeof remoteData._mod === 'object') this._modSeen = { ...remoteData._mod };
    return n;
  },
  // 바뀐 칸만 받아 합친다 — 칸마다 서버에 '바뀐 때' (_mod/칸) 를 남겨 두고, 그보다 새 칸만 가져온다.
  // 예전엔 다른 기기에서 하나만 바꿔도 계정 전체(몇 년 치 기록)를 다시 받았다.
  async _pull() {
    if (!this.ready()) return false;
    if (!this._modSeen || !this._synced) return this.load();
    try {
      const q = await this._q();
      const r = await fetch(`${this._dbUrl}/users/${this._uid}/_mod.json${q}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const mod = (await r.json()) || {};
      const ch = Object.keys(mod).filter(k => Number(mod[k]) > Number(this._modSeen[k] || 0));
      if (!ch.length) return this.load();   // 바뀌었다는데 표시가 없다 = 옛 앱·서버가 쓴 것 → 통째로
      if (ch.length > 60) return this.load();   // 너무 많이 바뀌었으면 통째로
      const vals = await Promise.all(ch.map(k => fetch(`${this._dbUrl}/users/${this._uid}/${encodeURIComponent(k)}.json${q}`).then(x => x.ok ? x.json() : undefined).catch(() => undefined)));
      const dirty = this._dirty();
      let n = 0;
      ch.forEach((k, i) => {
        const v = vals[i]; if (v === undefined) return;   // 못 받은 칸은 다음에
        this._modSeen[k] = Number(mod[k]);
        if (v === null) {   // 다른 기기에서 지운 칸
          if (!(k in dirty)) { if (localStorage.getItem(k) != null) { localStorage.removeItem(k); n++; } }
          delete this._synced[k]; return;
        }
        const sv = typeof v === 'string' ? v : JSON.stringify(v), base = this._synced[k];
        this._synced[k] = sv;
        if (k in dirty) { if (dirty[k] != null && base !== sv) { const mg = this._merge3(base, dirty[k], sv); if (mg !== dirty[k]) { localStorage.setItem(k, mg); n++; } } return; }
        if (localStorage.getItem(k) !== sv) { localStorage.setItem(k, sv); n++; }
      });
      try { const t = await fetch(`${this._dbUrl}/users/${this._uid}/_savedAt.json${q}`); if (t.ok) { const ts = parseInt(await t.json() || '0', 10); if (ts > this._lastSaveTs) this._lastSaveTs = ts; } } catch (e) {}
      console.log('[FB] 바뀐 칸만 받기:', ch.length + '칸');
      if (n && Object.keys(this._dirty()).length) this.scheduleSave();   // 합친 값은 다시 올린다
      return n > 0;
    } catch (e) { console.warn('[FB] 바뀐 칸 받기 실패 — 통째로:', e.message); return this.load(); }
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
      // 다른 기기가 그사이 저장했으면 먼저 받아 합친다(내가 바꾼 칸은 그대로 둔다)
      if (this._synced) {
        const r = await fetch(`${this._dbUrl}/users/${this._uid}/_savedAt.json${await this._q()}`);
        if (r.ok) {
          const remoteTs = parseInt(await r.json()||'0',10);
          if (remoteTs > this._lastSaveTs) {
            this._syncing = false;
            const ok = await this._pull();
            this._syncing = true;
            if (ok) this._refreshUI(true);
          }
        }
      }
      const data = this._collectData();
      const realKeys = Object.keys(data).filter(k => k !== '_savedAt');
      if(realKeys.length === 0) { this._syncing = false; return; }   // 바뀐 것이 없다
      // 칸마다 '바뀐 때' 를 같이 남긴다 — 다른 기기는 이것보다 새 칸만 받아 간다(_pull)
      const stamp = parseInt(data['_savedAt'], 10);
      realKeys.forEach(k => { data['_mod/' + k] = stamp; });
      const res  = await fetch(`${this._dbUrl}/users/${this._uid}.json${await this._q()}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._lastSaveTs = parseInt(data['_savedAt'],10);
      if (!this._synced) this._synced = {};
      realKeys.forEach(k => { if (data[k] === null) delete this._synced[k]; else this._synced[k] = data[k]; });
      if (this._modSeen) realKeys.forEach(k => { this._modSeen[k] = stamp; });
      this._retry = 0;
      console.log('[FB] 저장 완료,', realKeys.length + '칸, ts:', this._lastSaveTs);
    } catch(e) {
      // 실패하면 바뀐 칸은 그대로 남아 있으니 잠시 뒤 다시 올린다(오프라인·토큰 만료 등)
      console.error('[FB] 저장 실패:', e.message);
      this._retry = Math.min(6, this._retry + 1);
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => { this._saveTimer = null; this.save(); }, 5000 * this._retry);
    } finally {
      this._syncing = false;
    }
  },

  // 각 모듈에서 데이터 변경 시 직접 호출
  // 1초 동안 더 바뀌는 게 없으면 올린다. 쉬지 않고 계속 바뀌어도(글 쓰는 중 등) 8초를 넘겨 미루지는 않는다.
  _firstEditTs: 0,
  scheduleSave() {
    const now = Date.now();
    this._lastEditTs = now;
    if (!this._saveTimer) this._firstEditTs = now;
    clearTimeout(this._saveTimer);
    const wait = Math.max(0, Math.min(1000, this._firstEditTs + 8000 - now));
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this.save(); }, wait);
  },

  startPolling() {
    if (this._pollTimer) return;
    // 다른 기기 변경: 서버가 바로 알려 준다(_listen, 변경 알림). 알림이 끊긴 때를 대비해 60초마다도 확인한다(예전엔 20초 폴링만).
    this._listen();
    this._pollTimer = setInterval(() => { if (!document.hidden) { this._poll(); if (!this._es) this._listen(); } }, 60000);   // 화면이 가려져 있으면 쉬고, 돌아오면 바로 확인한다(아래)
    // 앱 포커스 시 즉시 확인
    if (!this._visBound) this._visBound = true; else return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState==='visible') {
        setTimeout(() => this._poll(), 500);
      }
    });
    console.log('[FB] 폴링 시작 (20초)');
  },

  // Firebase 변경 알림(EventSource) — _savedAt 이 바뀌면 바로 바뀐 칸만 받는다. 토큰이 끝나면 다시 붙는다.
  async _listen() {
    if (!this.ready() || typeof EventSource === 'undefined' || this._esBusy) return;
    this._esBusy = true;
    try {
      try { this._es?.close(); } catch (e) {}
      this._es = null;
      const es = new EventSource(`${this._dbUrl}/users/${this._uid}/_savedAt.json${await this._q()}`);
      const on = ev => { try { const j = JSON.parse(ev.data || 'null'); const ts = parseInt((j && j.data) || '0', 10); if (ts > this._lastSaveTs) this._poll(); } catch (e) {} };
      es.addEventListener('put', on); es.addEventListener('patch', on);
      const again = () => { try { es.close(); } catch (e) {} if (this._es === es) this._es = null; setTimeout(() => this._listen(), 5000); };
      es.addEventListener('auth_revoked', again); es.addEventListener('cancel', again);
      es.onerror = () => { if (es.readyState === 2) again(); };
      this._es = es;
      console.log('[FB] 변경 알림 연결');
    } catch (e) { this._es = null; }
    finally { this._esBusy = false; }
  },

  async _poll() {
    if (!this.ready()) return;
    if (Date.now() - this._lastEditTs < 2000) return; // 편집 중 스킵
    if (Date.now() - this._lastSaveTs  < 3000) return; // 방금 저장 스킵
    try {
      const res = await fetch(`${this._dbUrl}/users/${this._uid}/_savedAt.json${await this._q()}`);
      if (!res.ok) return;
      const remoteTs = parseInt(await res.json()||'0',10);
      if (remoteTs > this._lastSaveTs) {
        console.log('[FB] 원격 변경 감지, ts:', remoteTs, '→ 바뀐 칸만 받기');
        const ok = await this._pull();
        if (ok) this._refreshUI();
      }
    } catch {}
  },

  _refreshUI(quiet) {
    if (typeof App==='undefined') return;
    const date = App.S?.selDate || new Date();
    requestAnimationFrame(() => {
      try { Habits.render(date); } catch {}
      try { Diet.render(date); } catch {}
      try { Checklist.render(); } catch {}
      try { Memo.render(); } catch {}
      // 운동·인바디도 다시 그린다. Hevy 기록과 애플 헬스 인바디는 서버가 넣어 주는 값이라
      // 이 폴링이 유일한 도착 신호다. 여기 없으면 앱을 껐다 켜야 보였다.
      try { Fitness.render(date); } catch {}
      try { InBody.render(); } catch {}
      try { App.refreshLocal(); } catch {}   // Bashy 일정·할일 (계정에 저장된 것)
      try { App._updateStatsBanner(); } catch {}
      try { Tabs.applyOff(); Tabs.applyOrder(); } catch {}   // 다른 기기에서 바꾼 카드 순서·켜고 끄기
    });
    // 동기화 알림 토스트
    if (!quiet) try { App?.showToast('다른 기기에서 바뀐 내용을 불러왔습니다', 'success'); } catch {}
  },
};
