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
    try { localStorage.setItem(this.key(rawKey), val); } catch(e) { console.warn('[UserStore] set failed:', e); }
  },

  remove(rawKey) {
    try { localStorage.removeItem(this.key(rawKey)); } catch {}
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
