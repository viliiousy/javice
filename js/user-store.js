// js/user-store.js — 계정별 localStorage 분리

const UserStore = {
  _uid: null,

  setUser(uid) {
    this._uid = uid || 'offline';
    localStorage.setItem('gl_current_uid', this._uid);
  },

  getUser() {
    return this._uid || localStorage.getItem('gl_current_uid') || 'offline';
  },

  // 계정 prefix 적용 키
  key(rawKey) {
    return `u_${this.getUser()}_${rawKey}`;
  },

  get(rawKey) {
    // 먼저 계정별 키, 없으면 기존 키 (마이그레이션)
    const val = localStorage.getItem(this.key(rawKey));
    if (val !== null) return val;
    // 기존 키 마이그레이션
    const old = localStorage.getItem(rawKey);
    if (old !== null) {
      localStorage.setItem(this.key(rawKey), old);
      localStorage.removeItem(rawKey);
      return old;
    }
    return null;
  },

  set(rawKey, val) {
    localStorage.setItem(this.key(rawKey), val);
  },

  remove(rawKey) {
    localStorage.removeItem(this.key(rawKey));
  },

  // 계정 전환 시 다른 계정 데이터 숨김
  switchUser(uid) {
    this.setUser(uid);
  },
};

// localStorage 래퍼 — 동기화 패턴 키는 계정 분리 적용
const _origGet = localStorage.getItem.bind(localStorage);
const _origSet = localStorage.setItem.bind(localStorage);

// UserStore 초기화 후 모듈들이 UserStore.get/set 직접 호출하도록
// habits, checklist, memo, diet, fitness 등이 UserStore를 사용
