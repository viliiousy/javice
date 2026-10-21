// js/user-store.js — 계정별 localStorage 분리 (uid 정규화)

const UserStore = {
  _uid: null,

  // uid 정규화 - Firebase 경로에서 허용하지 않는 문자 제거
  _normalize(uid) {
    if (!uid) return 'offline';
    return uid.replace(/[.#$[\]@/]/g, '_');
  },

  setUser(rawUid) {
    this._uid = this._normalize(rawUid);
    // 원본 uid도 저장 (디버깅용)
    try { localStorage.setItem('gl_current_uid', this._uid); } catch {}
    console.log('[UserStore] 계정 설정:', this._uid);
  },

  getUser() {
    if (this._uid) return this._uid;
    try { return localStorage.getItem('gl_current_uid') || 'offline'; } catch { return 'offline'; }
  },

  key(rawKey) {
    return `u_${this.getUser()}_${rawKey}`;
  },

  get(rawKey) {
    const prefixedKey = this.key(rawKey);
    let val = null, old = null;
    try { val = localStorage.getItem(prefixedKey); } catch { return null; }   // 저장소가 막힌 환경(사생활 보호 모드 등)
    if (val !== null) return val;
    // 기존 키 마이그레이션 (prefix 없는 구버전)
    try { old = localStorage.getItem(rawKey); } catch {}
    if (old !== null) {
      try { localStorage.setItem(prefixedKey, old); } catch {}
      try { localStorage.removeItem(rawKey); } catch {}
      return old;
    }
    return null;
  },

  set(rawKey, val) {
    try {
      localStorage.setItem(this.key(rawKey), val);
      // FirebaseSync에 변경 알림 (각 모듈에서 직접 호출하는 것이 우선)
    } catch(e) { console.warn('[UserStore] set failed:', e); }
  },

  remove(rawKey) {
    try { localStorage.removeItem(this.key(rawKey)); } catch {}
  },

  // ── JSON 읽기 도우미 ───────────────────────
  // parse(): 매번 새로 푼 값(고쳐 써도 되는 값). 저장값이 깨져 있으면 fallback — 앱이 통째로 멈추지 않게.
  // json():  같은 문자열이면 지난번에 푼 값을 그대로 돌려준다(읽기 전용!). 습관 연속·트래커처럼
  //          같은 칸을 수백 번 읽는 곳에서 JSON.parse 를 반복하지 않으려고 둔다.
  //          저장된 문자열과 비교해서 쓰므로 다른 곳에서 값을 바꿔도 낡은 값이 나오지 않는다.
  parse(rawKey, fallback = null) {
    const v = this.get(rawKey);
    if (v == null || v === '') return fallback;
    try { const o = JSON.parse(v); return o == null ? fallback : o; } catch { return fallback; }
  },
  _jc: new Map(),
  json(rawKey, fallback = null) {
    const k = this.key(rawKey), v = this.get(rawKey);
    if (v == null || v === '') return fallback;
    const c = this._jc.get(k);
    if (c && c.raw === v) return c.val;
    let o; try { o = JSON.parse(v); } catch { o = undefined; }
    if (o == null) return fallback;
    if (this._jc.size > 800) this._jc.clear();   // 끝없이 커지지 않게
    this._jc.set(k, { raw: v, val: o });
    return o;
  },

  // ── 오프라인 모드에 갇혀 있던 기록 승계 ──────────────────
  // 예전에는 로그인 없이 '오프라인 모드로 시작' 을 누를 수 있었다. 그때 쓴 기록은
  // u_offline_* 로 저장됐고 — 로그인 계정과 열쇠가 다르니 — 클라우드에 한 번도 안 올라갔다.
  // 화면에는 멀쩡히 보이는데 다른 기기에는 없고, 이 브라우저 지우면 같이 사라지는 기록이었다.
  //
  // 오프라인 모드를 없애면서 그 기록을 데려온다. 덮어쓰지는 않는다 —
  // 계정 쪽에 이미 값이 있으면 그게 최신이다(다른 기기에서 쓴 것일 수 있다).
  // 빈자리만 채우고, 옮긴 자리는 지운다. 두 번 옮길 일은 없다.
  adoptOffline() {
    const me = this.getUser();
    if (!me || me === 'offline') return 0;
    const from = 'u_offline_';
    const moved = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(from)) moved.push(k);
    }
    let n = 0;
    for (const k of moved) {
      const bare = k.slice(from.length);
      const mine = `u_${me}_${bare}`;
      try {
        if (localStorage.getItem(mine) === null) {
          localStorage.setItem(mine, localStorage.getItem(k));
          n++;
        }
        localStorage.removeItem(k);
      } catch (e) { /* 저장 공간이 꽉 찼으면 원본은 남겨 둔다 */ }
    }
    if (n) console.log('[UserStore] 오프라인 기록', n, '건을 계정으로 옮겼습니다');
    return n;
  },

  // 예전엔 할 일 별표·시간(gl_star_*, gl_task_extra_*)을 계정 밖 칸에 둬서 다른 기기로 안 갔다. 계정 칸으로 옮긴다.
  adoptLoose() {
    const me = this.getUser(); if (!me || me === 'offline') return 0;
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^gl_(star|task_extra)_/.test(k)) ks.push(k); }
    ks.forEach(k => { try { if (localStorage.getItem(this.key(k)) === null) localStorage.setItem(this.key(k), localStorage.getItem(k)); localStorage.removeItem(k); } catch {} });
    return ks.length;
  },

  // 현재 계정의 모든 데이터 반환
  getAllData() {
    const prefix = `u_${this.getUser()}_`;
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) data[k] = localStorage.getItem(k);
    }
    return data;
  },
};
