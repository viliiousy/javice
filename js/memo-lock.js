// js/memo-lock.js — 메모 잠금
//
// 잠근 메모는 카드에 제목만 보이고 내용은 가려진다. 여는 방법은 셋:
//   · 아이폰 앱: Face ID(안 되면 기기 암호)
//   · 간단 비밀번호(4자리 또는 6자리) — 설정해 둔 경우
//   · 로그인한 계정으로 다시 확인 — 구글 계정이면 구글 로그인 창, 애플 계정이면 애플 로그인 창
//     (비밀번호는 구글·애플 화면에서 넣는다. Bashy 는 그 비밀번호를 보지도 저장하지도 않는다)
// 간단 비밀번호를 만들거나 바꾸거나 없앨 때는 Face ID 나 계정 확인을 먼저 받는다.
// 한 번 열면 5분 동안(또는 앱을 내릴 때까지) 열려 있다.
//
// 주의: 잠금은 화면 잠금이다. 내용은 다른 메모처럼 계정에 그대로 저장된다(암호화가 아니다).

const MemoLock = {
  PIN_KEY: 'gl_memo_pin',          // { salt, hash, len }  — 계정에 저장(기기 사이 공유), 숫자 자체는 저장하지 않는다
  OPEN_MS: 5 * 60e3,
  _until: 0, _fails: 0,

  isOpen() { return Date.now() < this._until; },
  lockNow() { this._until = 0; try { Memo.render(); } catch (e) {} },
  _opened() { this._until = Date.now() + this.OPEN_MS; this._fails = 0; clearTimeout(this._t); this._t = setTimeout(() => this.lockNow(), this.OPEN_MS); },

  pin() { try { const v = JSON.parse(UserStore.get(this.PIN_KEY) || 'null'); return v && v.hash ? v : null; } catch { return null; } },
  async _hash(salt, code) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + code)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); },

  // ── 본인 확인 수단 ─────────────────────────
  _B() { return window.Capacitor?.Plugins?.BashyNative; },
  bioAvail() { return typeof Platform !== 'undefined' && Platform.ios && !!this._B()?.bioAuth; },
  async bio(reason) {
    try { const r = await this._B().bioAuth({ reason }); return !!(r && r.ok); } catch (e) { return false; }
  },
  provider() {
    try {
      const u = firebase.auth().currentUser; if (!u) return null;
      const ids = (u.providerData || []).map(p => p.providerId);
      return ids.includes('apple.com') ? 'apple' : ids.includes('google.com') ? 'google' : null;
    } catch (e) { return null; }
  },
  provName() { return this.provider() === 'apple' ? 'Apple' : 'Google'; },
  // 계정으로 다시 확인 — 그 계정의 로그인 화면을 한 번 더 거친다
  async account() {
    const kind = this.provider();
    const u = (typeof firebase !== 'undefined') && firebase.auth && firebase.auth().currentUser;
    if (!kind || !u) { App.showToast('계정 로그인(동기화)이 끝난 뒤에 쓸 수 있습니다', 'error'); return false; }
    try {
      const SL = window.Capacitor?.Plugins?.SocialLogin;
      if (typeof Platform !== 'undefined' && Platform.native && SL) {
        if (kind === 'apple') {
          if (!Auth._slApple) { await SL.initialize({ apple: {} }); Auth._slApple = true; }
          const raw = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('');
          const r = await SL.login({ provider: 'apple', options: { scopes: ['email'], nonce: await Auth._sha256(raw) } });
          const idToken = r?.result?.idToken; if (!idToken) return false;
          await u.reauthenticateWithCredential(new firebase.auth.OAuthProvider('apple.com').credential({ idToken, rawNonce: raw }));
          return true;
        }
        const android = window.Capacitor.getPlatform?.() === 'android';
        if (!Auth._slReady) {
          await SL.initialize({ google: android ? { webClientId: CONFIG.GOOGLE_CLIENT_ID, mode: 'offline' }
            : { iOSClientId: CONFIG.GOOGLE_IOS_CLIENT_ID, iOSServerClientId: CONFIG.GOOGLE_CLIENT_ID, mode: 'offline' } });
          Auth._slReady = true;
        }
        const r = await SL.login({ provider: 'google', options: { scopes: ['openid', 'email', 'profile'] } });
        const idToken = r?.result?.idToken;
        if (idToken) { await u.reauthenticateWithCredential(firebase.auth.GoogleAuthProvider.credential(idToken)); return true; }
        const em = (r?.result?.profile?.email || '').toLowerCase();
        return !!em && em === String(u.email || '').toLowerCase();
      }
      // 웹: 그 계정 로그인 창을 띄운다. 구글은 비밀번호를 다시 묻게 한다.
      const P = kind === 'apple' ? new firebase.auth.OAuthProvider('apple.com') : new firebase.auth.GoogleAuthProvider();
      if (kind === 'google') P.setCustomParameters({ prompt: 'login', login_hint: u.email || '' });
      await u.reauthenticateWithPopup(P);
      return true;
    } catch (e) {
      const m = String(e && (e.code || e.message));
      if (/cancel|closed|1001/i.test(m)) return false;
      if (/mismatch|user-mismatch/i.test(m)) { App.showToast('로그인한 계정과 다른 계정입니다', 'error'); return false; }
      console.warn('[MemoLock] 계정 확인 실패', e);
      App.showToast('계정 확인에 실패했습니다: ' + (e.message || m), 'error');
      return false;
    }
  },
  // 간단 비밀번호를 바꾸기 전의 '강한' 확인: Face ID 우선, 없으면 계정
  async strong(reason) {
    if (this.bioAvail() && await this.bio(reason)) return true;
    return this.account();
  },

  // ── 잠금 열기 ─────────────────────────────
  // 열리면 cb() — 이미 열려 있으면 바로
  ensure(cb) {
    if (this.isOpen()) { cb && cb(); return; }
    this._cb = cb; this._code = '';
    this._sheet();
    if (this.bioAvail()) setTimeout(() => this._tryBio(), 250);   // 앱은 Face ID 부터
  },
  async _tryBio() { if (await this.bio('잠긴 메모를 엽니다')) this._done(); },
  async _tryAccount() { if (await this.account()) this._done(); },
  _done() {
    this._opened(); this._close();
    try { Haptic.success(); } catch (e) {}
    const cb = this._cb; this._cb = null;
    try { Memo.render(); } catch (e) {}
    cb && cb();
  },
  _sheet(mode = 'open') {
    document.getElementById('mlSheet')?.remove();
    const pin = this.pin();
    this._mode = mode;
    const el = document.createElement('div'); el.id = 'mlSheet'; el.className = 'mx-ov';
    const L = (mode === 'set' || mode === 'confirm') ? (this._newLen || 4) : (pin ? pin.len : 4);
    const title = mode === 'set' ? `새 간단 비밀번호 (${L}자리)` : mode === 'confirm' ? '한 번 더 입력해 주세요' : '잠긴 메모';
    const showPad = mode !== 'open' || !!pin;
    el.innerHTML = `<div class="mx-sh ml-sh" role="dialog" aria-label="${title}">
      <div class="mx-hd"><b>${title}</b><button class="mx-x" onclick="MemoLock._close()" aria-label="닫기">${(typeof Icons !== 'undefined' && Icons.svg('x')) || '✕'}</button></div>
      ${mode === 'open' && !pin ? `<p class="ml-p">본인 확인 후 열 수 있습니다.${this.bioAvail() ? '' : ' 간단 비밀번호를 만들어 두면 다음부터 숫자로 열 수 있습니다.'}</p>` : ''}
      ${mode === 'set' ? `<div class="ml-len"><button type="button" class="${L === 4 ? 'on' : ''}" onclick="MemoLock._setLen(4)">4자리</button><button type="button" class="${L === 6 ? 'on' : ''}" onclick="MemoLock._setLen(6)">6자리</button></div>` : ''}
      ${showPad ? `<div class="ml-dots" id="mlDots">${Array.from({ length: L }, () => '<i></i>').join('')}</div>
        <p class="ml-err" id="mlErr"></p>
        <div class="ml-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}" class="num">${k}</button>`).join('')}</div>` : ''}
      ${mode === 'open' ? `<div class="ml-alt">
          ${this.bioAvail() ? `<button type="button" class="ml-go" onclick="MemoLock._tryBio()">Face ID 로 열기</button>` : ''}
          ${this.provider() ? `<button type="button" class="${this.bioAvail() || pin ? 'ml-sub' : 'ml-go'}" onclick="MemoLock._tryAccount()">${this.provName()} 계정으로 확인</button>` : ''}
        </div>
        <button type="button" class="ml-link" onclick="MemoLock.managePin()">${pin ? '간단 비밀번호 바꾸기 · 없애기' : '간단 비밀번호 만들기 (4자리 · 6자리)'}</button>` : ''}
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el) return this._close();
      const b = e.target.closest('[data-k]'); if (b) this._key(b.dataset.k);
    });
    if (!this._kb) { this._kb = true; document.addEventListener('keydown', e => { if (!document.getElementById('mlSheet')?.querySelector('.ml-pad')) return; if (/^\d$/.test(e.key)) this._key(e.key); else if (e.key === 'Backspace') this._key('⌫'); else if (e.key === 'Escape') this._close(); }); }
    requestAnimationFrame(() => el.classList.add('on'));
  },
  _close() { const el = document.getElementById('mlSheet'); if (el) { el.classList.remove('on'); setTimeout(() => el.remove(), 200); } },
  _paintDots(err) {
    const d = document.getElementById('mlDots'); if (!d) return;
    [...d.children].forEach((i, k) => i.classList.toggle('on', k < this._code.length));
    const e = document.getElementById('mlErr'); if (e) e.textContent = err || '';
    if (err) { d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 }); try { Haptic.error?.() || Haptic.medium(); } catch (er) {} }
  },
  async _key(k) {
    const L = (this._mode === 'set' || this._mode === 'confirm') ? (this._newLen || 4) : (this.pin()?.len || 4);
    if (k === '⌫') this._code = this._code.slice(0, -1);
    else if (this._code.length < L) this._code += k;
    try { Haptic.select?.(); } catch (e) {}
    this._paintDots();
    if (this._code.length < L) return;
    const code = this._code; this._code = '';
    if (this._mode === 'set') { this._first = code; this._sheet('confirm'); return; }
    if (this._mode === 'confirm') {
      if (code !== this._first) { this._sheet('set'); setTimeout(() => this._paintDots('두 번 입력한 숫자가 다릅니다. 처음부터 다시 입력해 주세요'), 50); return; }
      const salt = [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join('');
      UserStore.set(this.PIN_KEY, JSON.stringify({ salt, hash: await this._hash(salt, code), len: code.length }));
      window.FirebaseSync?.scheduleSave?.();
      this._first = null; this._close(); this._opened();
      App.showToast('간단 비밀번호를 만들었습니다', 'success'); try { Memo.render(); } catch (e) {}
      return;
    }
    // 열기
    if (this._fails >= 5) { this._paintDots(`5번 틀려서 숫자로는 열 수 없습니다 — ${this.bioAvail() ? 'Face ID 나 ' : ''}계정으로 확인해 주세요`); return; }
    const p = this.pin();
    if (p && await this._hash(p.salt, code) === p.hash) return this._done();
    this._fails++;
    this._paintDots(this._fails >= 5 ? '5번 틀렸습니다 — 계정으로 확인해 주세요' : `숫자가 맞지 않습니다 (${this._fails}/5)`);
  },

  // 간단 비밀번호 만들기·바꾸기·없애기 — Face ID 나 계정 확인을 먼저
  async managePin() {
    const pin = this.pin();
    if (!await this.strong(pin ? '간단 비밀번호를 바꿉니다' : '간단 비밀번호를 만듭니다')) return;
    if (!pin) { this._newLen = 4; this._code = ''; this._sheet('set'); return; }
    document.getElementById('mlSheet')?.remove();
    const el = document.createElement('div'); el.id = 'mlSheet'; el.className = 'mx-ov';
    el.innerHTML = `<div class="mx-sh ml-sh"><div class="mx-hd"><b>간단 비밀번호</b><button class="mx-x" onclick="MemoLock._close()" aria-label="닫기">${(typeof Icons !== 'undefined' && Icons.svg('x')) || '✕'}</button></div>
      <p class="ml-p">지금 <span class="num">${pin.len}</span>자리 비밀번호를 쓰고 있습니다.</p>
      <div class="ml-alt"><button type="button" class="ml-go" onclick="MemoLock._newLen=${pin.len};MemoLock._code='';MemoLock._sheet('set')">바꾸기</button>
      <button type="button" class="ml-sub" onclick="MemoLock._removePin()">없애기</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) this._close(); });
    requestAnimationFrame(() => el.classList.add('on'));
  },
  _setLen(n) { this._newLen = n; this._code = ''; this._sheet('set'); },
  _removePin() {
    UserStore.set(this.PIN_KEY, ''); window.FirebaseSync?.scheduleSave?.();
    this._close(); App.showToast('간단 비밀번호를 없앴습니다 — 잠긴 메모는 ' + (this.bioAvail() ? 'Face ID 나 ' : '') + '계정 확인으로 엽니다', 'success');
  },

  init() {
    // 앱을 내리면(다른 앱·화면 끔) 바로 다시 잠근다
    document.addEventListener('visibilitychange', () => { if (document.hidden && this._until) this.lockNow(); });
  },
};
MemoLock.init();
