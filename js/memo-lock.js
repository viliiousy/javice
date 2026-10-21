// js/memo-lock.js — 메모 잠금 (기기에서 암호화 · 운영자도 못 읽음)
//
// 잠근 메모의 내용(본문)은 기기 안에서 AES-256-GCM 으로 암호화한 뒤에만 계정에 저장된다.
// 서버·Firebase·운영자에게는 알아볼 수 없는 글자만 남는다. 제목은 카드에 보여야 해서 그대로 둔다.
//
// 열쇠(K)는 무작위로 한 번 만들고, 두 곳에만 '감싸서' 둔다:
//   1) 이 기기 — 밖으로 꺼낼 수 없는 기기 열쇠로 감싸 브라우저 저장소(IndexedDB)에. Face ID·계정 확인은 이걸 쓴다.
//   2) 간단 비밀번호 — 비밀번호에서 만든 열쇠로 감싸 계정에. 새 휴대폰·PC 에서 처음 열 때 쓴다.
// 그래서 K 자체는 어디에도 그대로 저장되지 않는다.
//
// 간단 비밀번호를 잊으면: 계정(구글·애플 로그인)으로 확인 → 새 비밀번호. 이 기기에 열쇠가 있으면 메모는 그대로 열린다.
// 열쇠가 있는 기기가 하나도 없고 비밀번호도 잊었다면, 잠긴 메모 내용은 아무도(운영자도) 되살릴 수 없다.

const MemoLock = {
  VAULT_KEY: 'gl_memo_vault',      // { v:1, salt, iter, len, iv, wk }  — 비밀번호로 감싼 K (계정에 저장)
  OLD_PIN: 'gl_memo_pin',          // 예전(암호화 전) 간단 비밀번호 해시 — 한 번 맞히면 새 방식으로 옮긴다
  OPEN_MS: 5 * 60e3,
  ITER: 310000,
  _K: null, _until: 0, _fails: 0, _plain: {},

  // ── 바이트 도우미 ─────────────────────────
  _b64(u8) { let s = ''; u8 = new Uint8Array(u8); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  _u8(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
  _rand(n) { return crypto.getRandomValues(new Uint8Array(n)); },
  async _gcm(key, data, iv) { return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)); },
  async _ungcm(key, data, iv) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)); },
  async _pinKey(pin, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async _importK(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); },

  // ── 계정에 둔 '비밀번호로 감싼 열쇠' ──────────────
  vault() { try { const v = JSON.parse(UserStore.get(this.VAULT_KEY) || 'null'); return v && v.wk ? v : null; } catch { return null; } },
  hasPin() { return !!this.vault() || !!this._oldPin(); },
  pinLen() { return this.vault()?.len || this._oldPin()?.len || 4; },
  _oldPin() { try { const v = JSON.parse(UserStore.get(this.OLD_PIN) || 'null'); return v && v.hash ? v : null; } catch { return null; } },
  async _saveVault(pin) {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', this._K));
    const salt = this._rand(16), iv = this._rand(12);
    const wk = await this._gcm(await this._pinKey(pin, salt, this.ITER), raw, iv);
    UserStore.set(this.VAULT_KEY, JSON.stringify({ v: 1, salt: this._b64(salt), iter: this.ITER, len: String(pin).length, iv: this._b64(iv), wk: this._b64(wk) }));
    UserStore.set(this.OLD_PIN, '');
    window.FirebaseSync?.scheduleSave?.();
  },
  async _fromPin(pin) {
    const v = this.vault(); if (!v) return null;
    try {
      const raw = await this._ungcm(await this._pinKey(pin, this._u8(v.salt), v.iter || this.ITER), this._u8(v.wk), this._u8(v.iv));
      return this._importK(raw);
    } catch (e) { return null; }   // 비밀번호가 틀리면 복호화가 실패한다
  },

  // ── 이 기기에 둔 열쇠 (IndexedDB, 기기 열쇠는 밖으로 꺼낼 수 없다) ──
  _db() {
    return this._dbp || (this._dbp = new Promise((res, rej) => {
      const r = indexedDB.open('bashy-vault', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keys');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  },
  async _idb(op, val) {
    const db = await this._db(), id = 'memo:' + UserStore.getUser();
    return new Promise((res, rej) => {
      const tx = db.transaction('keys', op ? 'readwrite' : 'readonly'), st = tx.objectStore('keys');
      const q = op === 'put' ? st.put(val, id) : op === 'del' ? st.delete(id) : st.get(id);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  },
  async _saveDevice() {
    try {
      const dk = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const iv = this._rand(12), raw = new Uint8Array(await crypto.subtle.exportKey('raw', this._K));
      await this._idb('put', { dk, iv, wk: await this._gcm(dk, raw, iv) });
    } catch (e) { console.warn('[MemoLock] 기기 열쇠 저장 실패', e); }
  },
  async _fromDevice() {
    try { const r = await this._idb(); if (!r) return null; return this._importK(await this._ungcm(r.dk, r.wk, r.iv)); }
    catch (e) { return null; }
  },
  async deviceHasKey() { try { return !!(await this._idb()); } catch { return false; } },

  // ── 내용 암호화 / 복호화 ─────────────────────
  async seal(obj) { const iv = this._rand(12); return { iv: this._b64(iv), ct: this._b64(await this._gcm(this._K, new TextEncoder().encode(JSON.stringify(obj)), iv)) }; },
  async unseal(enc) { return JSON.parse(new TextDecoder().decode(await this._ungcm(this._K, this._u8(enc.ct), this._u8(enc.iv)))); },
  plain(m) { return this._plain[m.id] || null; },
  // 열려 있는 동안 화면에 쓸 평문을 메모리에만 풀어 둔다(저장하지 않는다)
  async _decryptAll() {
    const items = Memo.getItems(); this._plain = {}; let bad = 0;
    for (const m of items) if (m.locked && m.enc) { try { this._plain[m.id] = await this.unseal(m.enc); } catch (e) { bad++; } }
    this._bad = bad;
  },
  // 예전처럼 평문으로 잠겨 있던 메모를 암호화해서 다시 저장한다
  async _migrate() {
    const items = Memo.getItems(); let n = 0;
    for (const m of items) if (m.locked && !m.enc && (m.html || m.content)) { m.enc = await this.seal({ html: m.html || '', content: m.content || '' }); m.html = ''; m.content = ''; n++; }
    if (n) Memo.saveItems(items);
  },

  isOpen() { return !!this._K && Date.now() < this._until; },
  lockNow() { this._K = null; this._plain = {}; this._until = 0; try { Memo.render(); } catch (e) {} },
  async _openWith(K) {
    this._K = K; this._until = Date.now() + this.OPEN_MS; this._fails = 0;
    clearTimeout(this._t); this._t = setTimeout(() => this.lockNow(), this.OPEN_MS);
    await this._migrate(); await this._decryptAll();
  },
  // 잠금을 처음 쓸 때 열쇠를 만든다
  async _newK() {
    this._K = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    await this._saveDevice();
  },

  // ── 본인 확인 수단 ─────────────────────────
  _B() { return window.Capacitor?.Plugins?.BashyNative; },
  bioAvail() { return typeof Platform !== 'undefined' && Platform.ios && !!this._B()?.bioAuth; },
  async bio(reason) { try { const r = await this._B().bioAuth({ reason }); return !!(r && r.ok); } catch (e) { return false; } },
  provider() {
    try {
      const u = firebase.auth().currentUser; if (!u) return null;
      const ids = (u.providerData || []).map(p => p.providerId);
      return ids.includes('apple.com') ? 'apple' : ids.includes('google.com') ? 'google' : null;
    } catch (e) { return null; }
  },
  provName() { return this.provider() === 'apple' ? 'Apple' : 'Google'; },
  // 계정으로 다시 확인 — 그 계정의 로그인 화면을 한 번 더 거친다(비밀번호는 구글·애플 화면에서 넣는다)
  async account() {
    const kind = this.provider();
    const u = (typeof firebase !== 'undefined') && firebase.auth && firebase.auth().currentUser;
    if (!kind || !u) { App.showToast('계정 로그인(동기화)이 끝난 뒤에 쓸 수 있습니다', 'error'); return false; }
    try {
      const SL = window.Capacitor?.Plugins?.SocialLogin;
      if (typeof Platform !== 'undefined' && Platform.native && SL) {
        if (kind === 'apple') {
          if (!Auth._slApple) { await SL.initialize({ apple: {} }); Auth._slApple = true; }
          const raw = [...this._rand(24)].map(x => x.toString(16).padStart(2, '0')).join('');
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
      // 웹 구글: 로그인에 쓰는 구글 창(GIS)으로 다시 확인한다 — Firebase 팝업은 도메인 등록이 필요해 쓰지 않는다
      if (kind === 'google' && window.google?.accounts?.oauth2) {
        const tok = await new Promise((res, rej) => {
          const c = google.accounts.oauth2.initTokenClient({ client_id: CONFIG.GOOGLE_CLIENT_ID, scope: 'openid email profile',
            prompt: 'consent', login_hint: u.email || '',
            callback: r => r && r.access_token ? res(r.access_token) : rej(new Error(r?.error || 'cancel')),
            error_callback: e => rej(new Error(e?.type === 'popup_closed' ? 'cancel' : (e?.message || e?.type || 'cancel'))) });
          c.requestAccessToken();
        });
        await u.reauthenticateWithCredential(firebase.auth.GoogleAuthProvider.credential(null, tok));
        return true;
      }
      const P = kind === 'apple' ? new firebase.auth.OAuthProvider('apple.com') : new firebase.auth.GoogleAuthProvider();
      if (kind === 'google') P.setCustomParameters({ prompt: 'login', login_hint: u.email || '' });
      await u.reauthenticateWithPopup(P);
      return true;
    } catch (e) {
      const m = String(e && (e.code || e.message));
      if (/cancel|closed|1001/i.test(m)) return false;
      if (/mismatch/i.test(m)) { App.showToast('로그인한 계정과 다른 계정입니다', 'error'); return false; }
      console.warn('[MemoLock] 계정 확인 실패', e);
      App.showToast('계정 확인에 실패했습니다: ' + (e.message || m), 'error');
      return false;
    }
  },

  // ── 열기 ─────────────────────────────────
  ensure(cb) {
    if (this.isOpen()) { cb && cb(); return; }
    this._cb = cb; this._code = '';
    this._sheet('open');
    if (this.bioAvail()) setTimeout(() => this._tryBio(), 250);   // 앱은 Face ID 부터
  },
  // Face ID·계정 확인은 '이 기기에 둔 열쇠' 를 연다
  async _viaDevice(ok) {
    if (!ok) return;
    let K = await this._fromDevice();
    if (!K && !this.vault() && !Memo.getItems().some(m => m.enc)) { await this._newK(); K = this._K; }   // 아직 아무것도 암호화 안 됨 — 새로 시작
    if (!K) { this._sheet('open'); this._paintDots(this.hasPin() ? '이 기기에서는 처음이라 간단 비밀번호가 한 번 필요합니다' : '이 기기에는 열쇠가 없습니다'); return; }
    await this._openWith(K); this._done();
  },
  async _tryBio() { this._viaDevice(await this.bio('잠긴 메모를 엽니다')); },
  async _tryAccount() { this._viaDevice(await this.account()); },
  _done() {
    this._close();
    try { Haptic.success(); } catch (e) {}
    const cb = this._cb; this._cb = null;
    try { Memo.render(); } catch (e) {}
    if (this._bad) App.showToast(`${this._bad}개 메모는 예전 열쇠로 잠겨 있어 이 기기에서 열 수 없습니다`, 'error');
    cb && cb();
  },
  async _byPin(code) {
    let K = await this._fromPin(code);
    if (!K) {
      // 예전 방식(해시만 저장) 비밀번호면, 맞힌 김에 새 방식으로 옮긴다
      const o = this._oldPin();
      if (o && await this._oldHash(o.salt, code) === o.hash) {
        K = await this._fromDevice();
        if (!K) { await this._newK(); K = this._K; } else this._K = K;
        await this._saveVault(code);
      }
    } else if (!(await this.deviceHasKey())) { this._K = K; await this._saveDevice(); }
    return K;
  },
  async _oldHash(salt, code) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + code)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); },

  // 시트: open(열기) / set(새 비밀번호) / confirm(한 번 더)
  _sheet(mode = 'open') {
    document.getElementById('mlSheet')?.remove();
    this._mode = mode;
    const pin = this.hasPin(), X = (typeof Icons !== 'undefined' && Icons.svg('x')) || '✕';
    const L = (mode === 'set' || mode === 'confirm') ? (this._newLen || 4) : this.pinLen();
    const title = mode === 'set' ? `새 간단 비밀번호 (${L}자리)` : mode === 'confirm' ? '한 번 더 입력해 주세요' : '잠긴 메모';
    const showPad = mode !== 'open' || pin;
    const el = document.createElement('div'); el.id = 'mlSheet'; el.className = 'mx-ov';
    el.innerHTML = `<div class="mx-sh ml-sh" role="dialog" aria-label="${title}">
      <div class="mx-hd"><b>${title}</b><button class="mx-x" onclick="MemoLock._close()" aria-label="닫기">${X}</button></div>
      ${mode === 'open' && !pin ? `<p class="ml-p">본인 확인 후 열 수 있습니다. 간단 비밀번호를 만들어 두면 숫자로 열 수 있고, 새 휴대폰·PC 에서도 열 수 있습니다.</p>` : ''}
      ${mode === 'set' ? `<div class="ml-len"><button type="button" class="${L === 4 ? 'on' : ''}" onclick="MemoLock._setLen(4)">4자리</button><button type="button" class="${L === 6 ? 'on' : ''}" onclick="MemoLock._setLen(6)">6자리</button></div>` : ''}
      ${showPad ? `<div class="ml-dots" id="mlDots">${Array.from({ length: L }, () => '<i></i>').join('')}</div>
        <p class="ml-err" id="mlErr"></p>
        <div class="ml-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}" class="num">${k}</button>`).join('')}</div>` : ''}
      ${mode === 'open' ? `<div class="ml-alt">
          ${this.bioAvail() ? `<button type="button" class="ml-go" onclick="MemoLock._tryBio()">Face ID 로 열기</button>` : ''}
          ${this.provider() ? `<button type="button" class="${this.bioAvail() || pin ? 'ml-sub' : 'ml-go'}" onclick="MemoLock._tryAccount()">${this.provName()} 계정으로 확인</button>` : ''}
        </div>
        <button type="button" class="ml-link" onclick="MemoLock.managePin()">${pin ? '간단 비밀번호를 잊었어요 · 바꾸기 · 없애기' : '간단 비밀번호 만들기 (4자리 · 6자리)'}</button>` : ''}
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
    const d = document.getElementById('mlDots');
    if (d) [...d.children].forEach((i, k) => i.classList.toggle('on', k < this._code.length));
    const e = document.getElementById('mlErr'); if (e) e.textContent = err || '';
    else if (err) App.showToast(err, 'error');
    if (err && d) { d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 }); try { Haptic.medium(); } catch (er) {} }
  },
  async _key(k) {
    if (this._busy) return;
    const L = (this._mode === 'set' || this._mode === 'confirm') ? (this._newLen || 4) : this.pinLen();
    if (k === '⌫') this._code = this._code.slice(0, -1);
    else if (this._code.length < L) this._code += k;
    try { Haptic.select?.(); } catch (e) {}
    this._paintDots();
    if (this._code.length < L) return;
    const code = this._code; this._code = '';
    if (this._mode === 'set') { this._first = code; this._sheet('confirm'); return; }
    if (this._mode === 'confirm') {
      if (code !== this._first) { this._sheet('set'); setTimeout(() => this._paintDots('두 번 입력한 숫자가 다릅니다. 처음부터 다시 입력해 주세요'), 50); return; }
      this._busy = true;
      try {
        if (!this._K) await this._newK();
        await this._saveVault(code);
        await this._openWith(this._K);
      } finally { this._busy = false; this._first = null; }
      this._close(); App.showToast('간단 비밀번호를 만들었습니다', 'success'); try { Memo.render(); } catch (e) {}
      if (this._after) { const f = this._after; this._after = null; f(); }
      return;
    }
    // 열기
    if (this._fails >= 5) { this._paintDots(`5번 틀려서 숫자로는 열 수 없습니다 — ${this.bioAvail() ? 'Face ID 나 ' : ''}계정으로 확인해 주세요`); return; }
    this._busy = true;
    const K = await this._byPin(code).catch(() => null);
    this._busy = false;
    if (K) { await this._openWith(K); return this._done(); }
    this._fails++;
    this._paintDots(this._fails >= 5 ? '5번 틀렸습니다 — 계정으로 확인해 주세요' : `숫자가 맞지 않습니다 (${this._fails}/5)`);
  },

  // 간단 비밀번호 만들기·바꾸기·없애기·잊었을 때 — 먼저 Face ID 나 계정(로그인 비밀번호)으로 확인
  async managePin() {
    const ok = (this.bioAvail() && await this.bio('간단 비밀번호를 바꿉니다')) || await this.account();
    if (!ok) return;
    // 열쇠가 필요하다: 이미 열려 있거나, 이 기기에 있거나
    if (!this._K) this._K = await this._fromDevice();
    const anyEnc = Memo.getItems().some(m => m.enc);
    if (!this._K && anyEnc) {
      // 열쇠가 있는 기기가 아니다 — 새로 시작하면 지금 잠긴 메모는 읽을 수 없게 된다
      this._confirmFresh(); return;
    }
    if (!this.hasPin()) { this._newLen = 4; this._code = ''; this._sheet('set'); return; }
    document.getElementById('mlSheet')?.remove();
    const X = (typeof Icons !== 'undefined' && Icons.svg('x')) || '✕';
    const el = document.createElement('div'); el.id = 'mlSheet'; el.className = 'mx-ov';
    el.innerHTML = `<div class="mx-sh ml-sh"><div class="mx-hd"><b>간단 비밀번호</b><button class="mx-x" onclick="MemoLock._close()" aria-label="닫기">${X}</button></div>
      <p class="ml-p">본인 확인이 끝났습니다. 새 비밀번호로 바꾸면 잠긴 메모는 그대로 열립니다.</p>
      <div class="ml-alt"><button type="button" class="ml-go" onclick="MemoLock._newLen=${this.pinLen()};MemoLock._code='';MemoLock._sheet('set')">새 비밀번호 만들기</button>
      <button type="button" class="ml-sub" onclick="MemoLock._removePin()">없애기 (이 기기에서만 열기)</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) this._close(); });
    requestAnimationFrame(() => el.classList.add('on'));
  },
  _confirmFresh() {
    document.getElementById('mlSheet')?.remove();
    const X = (typeof Icons !== 'undefined' && Icons.svg('x')) || '✕';
    const el = document.createElement('div'); el.id = 'mlSheet'; el.className = 'mx-ov';
    el.innerHTML = `<div class="mx-sh ml-sh"><div class="mx-hd"><b>이 기기에는 열쇠가 없습니다</b><button class="mx-x" onclick="MemoLock._close()" aria-label="닫기">${X}</button></div>
      <p class="ml-p">잠긴 메모는 기기 안에서 암호화되어 있어 운영자도 열 수 없습니다. 예전에 메모를 열었던 휴대폰(Face ID)에서 ‘간단 비밀번호를 잊었어요’ 를 누르면 내용을 그대로 지킨 채 새 비밀번호를 만들 수 있습니다.</p>
      <p class="ml-p">여기서 새로 시작하면 지금 잠긴 메모 내용은 다시 볼 수 없습니다(제목만 남습니다).</p>
      <div class="ml-alt"><button type="button" class="ml-sub" onclick="MemoLock._close()">다른 기기에서 하기</button>
      <button type="button" class="ml-danger" onclick="MemoLock._fresh()">새로 시작하기</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) this._close(); });
    requestAnimationFrame(() => el.classList.add('on'));
  },
  async _fresh() {
    await this._newK(); UserStore.set(this.VAULT_KEY, ''); UserStore.set(this.OLD_PIN, ''); window.FirebaseSync?.scheduleSave?.();
    this._newLen = 4; this._code = ''; this._sheet('set');
  },
  _setLen(n) { this._newLen = n; this._code = ''; this._sheet('set'); },
  _removePin() {
    UserStore.set(this.VAULT_KEY, ''); UserStore.set(this.OLD_PIN, ''); window.FirebaseSync?.scheduleSave?.();
    this._close(); App.showToast('간단 비밀번호를 없앴습니다 — 잠긴 메모는 이 기기에서 ' + (this.bioAvail() ? 'Face ID 나 ' : '') + '계정 확인으로 엽니다', 'success');
  },

  // 잠그기를 처음 누를 때: 열쇠가 없으면 만든다(간단 비밀번호도 권한다)
  async prepare() {
    if (this.isOpen()) return true;
    const K = await this._fromDevice();
    if (K) { await this._openWith(K); return true; }
    if (!this.vault() && !Memo.getItems().some(m => m.enc)) { await this._newK(); await this._openWith(this._K); return true; }
    return new Promise(res => this.ensure(() => res(true)));
  },

  init() {
    document.addEventListener('visibilitychange', () => { if (document.hidden && this._K) this.lockNow(); });
  },
};
MemoLock.init();
