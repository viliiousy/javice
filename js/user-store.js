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
    return this._uid || localStorage.getItem('gl_current_uid') || 'offline';
  },

  key(rawKey) {
    return `u_${this.getUser()}_${rawKey}`;
  },

  get(rawKey) {
    const prefixedKey = this.key(rawKey);
    const val = localStorage.getItem(prefixedKey);
    if (val !== null) return val;
    // 기존 키 마이그레이션 (prefix 없는 구버전)
    const old = localStorage.getItem(rawKey);
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
