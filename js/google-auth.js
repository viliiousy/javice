// js/google-auth.js — Google Identity Services (자동 토큰 갱신)
//
// 토큰 갱신은 두 경로가 있다:
//   1) 서버 경로 (기본) — 서버가 보관한 리프레시 토큰으로 갱신. 팝업이 뜨지 않는다.
//      Firebase 세션은 구글 액세스 토큰과 별개로 살아 있으므로, 액세스 토큰이 만료된 뒤에도
//      Firebase ID 토큰으로 서버에 신원을 증명할 수 있다. (api/gauth.js)
//   2) GIS 팝업 (폴백) — 서버에 리프레시 토큰이 아직 없거나 서버가 실패할 때.
// 리프레시 토큰을 받으려면 access_type=offline + prompt=consent 동의가 최초 1회 필요하다.

// 반드시 필요한 스코프 (동의 화면에서 체크 해제되면 조용히 빠지므로 검증 필요)
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

const Auth = {
  accessToken:   null,
  tokenExpiry:   null,
  grantedScope:  '',
  tokenClient:   null,
  userInfo:      null,
  _refreshTimer: null,
  _refreshing:   false,
  _pendingLogin: false,   // GIS 로딩 전에 누른 로그인 요청
  _offerChecked: false,   // 오프라인 동의 제안을 이미 확인했는지
  _loginPrompt:  '',      // 이번 로그인 시도의 prompt 값

  init() {
    // 아이폰 앱에서는 웹 로그인(GIS)을 쓰지 않는다 — nativeLogin() 참고. 세션 복원만 한다.
    const native = typeof Platform !== 'undefined' && Platform.native;
    // 아이폰 앱: Apple 로 로그인 (App Store 가이드라인 4.8)
    if (this.appleAvail()) { const b = document.getElementById('btnAppleLogin'); if (b) b.hidden = false; }
    if (this.appleAvail() && localStorage.getItem('gl_apple') === '1') { this._restoreApple(); return; }
    if (!native) {
    if (typeof google === 'undefined' || !google.accounts) return;
    if (CONFIG.GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE')) return;

    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope:     CONFIG.SCOPES,
      // prompt: '' → 자동 갱신 시 팝업 없이 갱신
      prompt:    '',
      callback:  async (resp) => {
        if (resp.error) {
          if (this._refreshing) {
            // 자동 갱신 실패 — OAuth 앱이 '테스트' 게시 상태면 동의 후 7일마다 권한이 만료된다.
            // 조용히 넘기지 말고 재로그인을 안내한다.
            console.warn('[Auth] 자동 갱신 실패:', resp.error);
            App.showToast('구글 권한이 만료되었습니다. 다시 로그인해주세요.', 'error');
            this._promptRelogin();
          } else if (this._loginPrompt !== 'consent') {
            // 조용한 로그인 실패 (동의 이력 없음/세션 만료) → 동의 화면으로 재시도
            console.log('[Auth] 조용한 로그인 실패, 동의 화면으로 재시도:', resp.error);
            this._refreshing  = false;
            this._loginPrompt = 'consent';
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
            return;
          } else {
            App.showToast('로그인 실패: ' + resp.error, 'error');
          }
          this._refreshing = false;
          return;
        }
        const isRefresh = this._refreshing;
        this._refreshing = false;

        this._applyToken(resp);

        // ── 부분 동의(partial consent) 검사 ──
        // 사용자가 동의 화면에서 '캘린더'/'할일' 체크를 해제하면 토큰은 정상 발급되지만
        // 해당 API는 403 insufficient scopes 로 실패한다. 조용히 0개로 보이지 않도록 여기서 잡는다.
        const missing = this.missingScopes();
        if (missing.length) {
          console.warn('[Auth] 누락된 권한:', missing);
          App.showToast('캘린더·할일 권한이 허용되지 않았습니다. 다시 로그인해 모든 항목에 체크해주세요.', 'error');
        }

        if (isRefresh) {
          // 자동 갱신 - 조용히 처리
          console.log('[Auth] 토큰 자동 갱신 완료, 다음 만료:', new Date(this.tokenExpiry).toLocaleTimeString());
        } else {
          // 최초 로그인
          await this._fetchUserInfo();
        }
      },
    });

    }   // ← 웹(GIS) 전용 끝

    // GIS 로딩 전에 로그인을 눌렀다면 이제 이어서 진행 (다시 누를 필요 없음)
    if (this._pendingLogin) {
      this._pendingLogin = false;
      setTimeout(() => this.login(), 0);
    }

    // 오프라인 동의에서 돌아왔다면(?code=…) 그 처리를 우선한다
    if (this._consumeAuthCode()) return;

    // 세션 복원
    const t = localStorage.getItem('gl_token');
    const e = localStorage.getItem('gl_expiry');
    if (t && e && Date.now() < parseInt(e, 10)) {
      this.accessToken  = t;
      this.tokenExpiry  = parseInt(e, 10);
      this.grantedScope = localStorage.getItem('gl_scope') || '';
      // 남은 시간 기반으로 갱신 예약
      const remaining = (parseInt(e, 10) - Date.now()) / 1000;
      this._scheduleRefresh(remaining);
      this._fetchUserInfo(true);
      if (this.missingScopes().length) {
        setTimeout(() => App.showToast('캘린더·할일 권한이 없습니다. 로그아웃 후 다시 로그인해 모든 항목에 체크해주세요.', 'error'), 1500);
      }
    } else if (t || localStorage.getItem('gl_offline') === '1') {
      // 구글 토큰(1시간짜리)은 만료됐지만 예전에 로그인한 적이 있다 → 서버의 리프레시 토큰으로 조용히 되살린다.
      // 예전엔 여기서 그냥 로그인 화면을 보여서, 앱을 한 시간 뒤에 열 때마다 다시 로그인해야 했다.
      this._restoreViaServer();
    }
    this._watchResume();
  },

  async _restoreViaServer() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return;
      if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
      document.body.classList.add('auth-restoring');
      // Firebase 로그인(저장돼 있음)이 되살아나기를 잠깐 기다린다
      const user = await new Promise(res => {
        let done = false;
        const off = firebase.auth().onAuthStateChanged(u => { if (!done) { done = true; off(); res(u); } });
        setTimeout(() => { if (!done) { done = true; res(firebase.auth().currentUser); } }, 6000);
      });
      if (user && await this.serverRefresh()) { await this._fetchUserInfo(true); return; }
    } catch (e) { console.warn('[Auth] 세션 되살리기 실패', e); }
    finally { document.body.classList.remove('auth-restoring'); }
  },

  // 앱이 백그라운드에 오래 있으면 예약해 둔 갱신이 멈춘다. 다시 보일 때 만료됐으면 바로 갱신한다.
  _watchResume() {
    if (this._resumeBound) return;
    this._resumeBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !this.userInfo) return;
      if (!this.tokenExpiry || Date.now() > this.tokenExpiry - 120000) this._silentRefresh();
    });
  },

  // 팝업·서버 어느 쪽에서 받았든 토큰을 같은 방식으로 반영한다
  _applyToken(d) {
    this.accessToken  = d.access_token;
    this.tokenExpiry  = Date.now() + (d.expires_in || 3600) * 1000;
    this.grantedScope = d.scope || this.grantedScope || '';
    localStorage.setItem('gl_token',  this.accessToken);
    localStorage.setItem('gl_expiry', String(this.tokenExpiry));
    localStorage.setItem('gl_scope',  this.grantedScope);
    this._scheduleRefresh(d.expires_in || 3600);
  },

  async _firebaseIdToken() {
    try {
      const u = (typeof firebase !== 'undefined') && firebase.auth && firebase.auth().currentUser;
      return u ? await u.getIdToken() : null;
    } catch { return null; }
  },

  // 서버가 보관한 리프레시 토큰으로 갱신 (팝업 없음). 성공하면 true.
  async serverRefresh() {
    const idToken = await this._firebaseIdToken();
    if (!idToken) return false;
    try {
      const r = await fetch(Platform.api('/api/gauth'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'refresh', idToken }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.needConsent) { localStorage.setItem('gl_offline', '0'); return false; }
      if (!r.ok || !d.access_token) return false;
      this._applyToken(d);
      this._nativeFails = 0;
      localStorage.setItem('gl_offline', '1');
      console.log('[Auth] 서버 갱신 완료, 다음 만료:', new Date(this.tokenExpiry).toLocaleTimeString());
      return true;
    } catch (e) {
      console.warn('[Auth] 서버 갱신 실패:', e.message);
      return false;
    }
  },

  // 오프라인 동의에서 돌아왔는지 확인. 코드가 있으면 서버에 교환을 맡기고 true를 반환한다.
  _consumeAuthCode() {
    const p     = new URLSearchParams(location.search);
    const code  = p.get('code');
    const state = p.get('state');
    if (!code) {
      if (p.get('error') && sessionStorage.getItem('gl_oauth_state')) {
        sessionStorage.removeItem('gl_oauth_state');
        this._cleanUrl();
        App.showToast('백그라운드 동기화를 켜지 않았습니다', '');
      }
      return false;
    }
    const expect = sessionStorage.getItem('gl_oauth_state');
    sessionStorage.removeItem('gl_oauth_state');
    this._cleanUrl();
    // state가 다르면 우리가 시작한 요청이 아니다 (CSRF 방어)
    if (!expect || expect !== state) { console.warn('[Auth] state 불일치 — 코드 무시'); return false; }

    (async () => {
      try {
        const r = await fetch(Platform.api('/api/gauth'), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'exchange', code }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.access_token) throw new Error(d.error || '코드 교환 실패');
        this._applyToken(d);
        localStorage.setItem('gl_offline', d['저장됨'] ? '1' : '0');
        await this._fetchUserInfo();
        App.showToast(d['저장됨'] ? '백그라운드 동기화 켜짐' : '로그인됨 (동기화는 다음에)',
                      d['저장됨'] ? 'success' : '');
      } catch (e) {
        console.error('[Auth] 코드 교환 실패:', e);
        App.showToast('백그라운드 동기화 설정 실패: ' + e.message, 'error');
        this.login();   // 평소 로그인으로 되돌린다 — 앱이 막히지 않게
      }
    })();
    return true;
  },

  _cleanUrl() {
    try { history.replaceState(null, '', location.pathname); } catch {}
  },

  // 서버에 리프레시 토큰이 없으면 최초 1회 동의를 제안한다
  async _maybeOfferOffline() {
    if (this._offerChecked) return;
    this._offerChecked = true;
    if (localStorage.getItem('gl_offline') === '1') return;
    if (Number(localStorage.getItem('gl_offline_snooze') || 0) > Date.now()) return;

    const idToken = await this._firebaseIdToken();
    if (!idToken) return;
    try {
      const r = await fetch(Platform.api('/api/gauth'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'status', idToken }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;                       // 서버가 아직 준비 전이면 조용히 넘어간다
      if (d.hasRefresh) { localStorage.setItem('gl_offline', '1'); return; }
    } catch { return; }

    App.openModal('@refresh 백그라운드 동기화', `
      <p class="modal-lbl" style="line-height:1.7">
        지금은 한 시간마다 로그인 창이 다시 떠야 하고, 앱을 열지 않으면 서버가 일정을 읽지 못합니다.<br><br>
        <b>한 번만</b> 허용하면 그 뒤로는 창이 뜨지 않고, 아침 알림에 오늘 일정도 담을 수 있습니다.
      </p>
      <div class="modal-btns">
        <button onclick="Auth.startOfflineConsent()" class="btn-sm accent">켜기</button>
        <button onclick="Auth.snoozeOffline()" class="btn-sm">나중에</button>
      </div>`);
  },

  snoozeOffline() {
    localStorage.setItem('gl_offline_snooze', String(Date.now() + 7 * 24 * 3600 * 1000));
    App.closeModal();
  },

  // 리프레시 토큰은 access_type=offline + prompt=consent 로 동의를 새로 받을 때만 발급된다.
  // GIS 팝업 방식에는 이 두 파라미터가 없어서 표준 리디렉션 흐름을 직접 만든다.
  startOfflineConsent() {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('gl_oauth_state', state);
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id',     CONFIG.GOOGLE_CLIENT_ID);
    u.searchParams.set('redirect_uri',  location.origin);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope',         CONFIG.SCOPES);
    u.searchParams.set('access_type',   'offline');
    u.searchParams.set('prompt',        'consent');
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('state',         state);
    if (this.userInfo && this.userInfo.email) u.searchParams.set('login_hint', this.userInfo.email);
    location.href = u.toString();
  },

  // 만료 5분 전에 자동 갱신 예약
  _scheduleRefresh(expiresInSeconds) {
    clearTimeout(this._refreshTimer);
    // 5분(300초) 전, 최소 30초 후
    const delay = Math.max(30, expiresInSeconds - 300) * 1000;
    console.log('[Auth] 토큰 갱신 예약:', Math.round(delay/1000), '초 후');
    this._refreshTimer = setTimeout(() => {
      this._silentRefresh();
    }, delay);
  },

  // 조용한 자동 갱신 — 서버(리프레시 토큰) 먼저, 안 되면 GIS 팝업으로 폴백
  _silentRefresh() {
    if (this._refreshing) return;
    console.log('[Auth] 토큰 자동 갱신 시도...');
    this._refreshing = true;
    this.serverRefresh().then(ok => {
      this._refreshing = false;
      if (ok) return;
      if (typeof Platform !== 'undefined' && Platform.native) {
        // 앱: 네트워크가 잠깐 끊긴 것일 수 있다 — 바로 로그아웃하지 않고 몇 번 더 해 본다.
        this._nativeFails = (this._nativeFails || 0) + 1;
        if (this._nativeFails < 4 && localStorage.getItem('gl_offline') === '1') { setTimeout(() => this._silentRefresh(), 30000 * this._nativeFails); return; }
        this._nativeFails = 0;
        App.showToast('구글 로그인이 만료되었습니다. 다시 로그인해 주세요.', 'error');
        this._promptRelogin && this._promptRelogin();
        return;
      }
      if (!this.tokenClient) return;
      console.log('[Auth] 서버 갱신 불가 — GIS 갱신으로 대체');
      this._refreshing = true;
      try {
        this.tokenClient.requestAccessToken({ prompt: '' });
      } catch (e) {
        this._refreshing = false;
        console.warn('[Auth] 자동 갱신 실패:', e);
        setTimeout(() => this._silentRefresh(), 60000);   // 실패 시 1분 후 재시도
      }
    });
  },

  login(forceConsent = false) {
    if (typeof Platform !== 'undefined' && Platform.native) return this.nativeLogin();
    if (!this.tokenClient) {
      // 아직 GIS 로딩 중 — 요청을 기억해뒀다가 준비되면 자동으로 이어간다
      this._pendingLogin = true;
      App.showToast('Google 로그인 준비 중...', '');
      setTimeout(() => {
        if (this._pendingLogin && !this.tokenClient) {
          this._pendingLogin = false;
          App.showToast('Google 로그인을 불러오지 못했습니다. 새로고침해주세요.', 'error');
        }
      }, 9000);
      return;
    }
    this._refreshing = false;
    // prompt:'' → 이미 동의한 계정이면 동의·경고 화면 없이 통과한다.
    // 'consent'를 매번 강제하면 재로그인마다 전체 동의 절차를 다시 밟게 된다.
    // 조용한 시도가 실패하면 콜백에서 consent로 한 번 재시도한다.
    this._loginPrompt = forceConsent ? 'consent' : '';
    this.tokenClient.requestAccessToken({ prompt: this._loginPrompt });
  },

  // ── 아이폰 앱 로그인 ──
  // 앱(WKWebView) 안에서는 구글이 웹 로그인 창(GIS 팝업)을 막는다(disallowed_useragent).
  // 그래서 구글 공식 iOS 로그인으로 '서버 인증 코드'를 받아 서버(/api/gauth exchange)에서 토큰으로 바꾼다.
  // 서버는 이때 리프레시 토큰을 보관하므로, 이후 갱신은 웹과 똑같이 serverRefresh() 로 팝업 없이 된다.
  async nativeLogin() {
    const SL = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
    const android = window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android';
    if (!SL || (!android && !CONFIG.GOOGLE_IOS_CLIENT_ID)) { App.showToast('앱 로그인이 아직 준비되지 않았습니다', 'error'); return; }
    try {
      if (!this._slReady) {
        // 안드로이드는 웹 클라이언트 ID 하나로 된다(구글 클라우드에 패키지 이름 + 서명 SHA-1 로 안드로이드 클라이언트만 등록해 두면 됨)
        await SL.initialize({ google: android
          ? { webClientId: CONFIG.GOOGLE_CLIENT_ID, mode: 'offline' }
          : { iOSClientId: CONFIG.GOOGLE_IOS_CLIENT_ID, iOSServerClientId: CONFIG.GOOGLE_CLIENT_ID, mode: 'offline' } });
        this._slReady = true;
      }
      const r = await SL.login({ provider: 'google', options: {
        scopes: ['openid', 'email', 'profile', ...REQUIRED_SCOPES], forceRefreshToken: true,
      } });
      const code = r && r.result && r.result.serverAuthCode;
      if (!code) throw new Error('구글에서 인증 코드를 받지 못했습니다');
      const res = await fetch(Platform.api('/api/gauth'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exchange', code, native: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.access_token) throw new Error(d.error || '로그인 처리에 실패했습니다');
      this._applyToken(d);
      localStorage.setItem('gl_offline', '1');
      const missing = this.missingScopes();
      if (missing.length) App.showToast('캘린더·할일 권한이 허용되지 않았습니다. 다시 로그인해 모든 항목에 체크해주세요.', 'error');
      await this._fetchUserInfo();
    } catch (e) {
      const msg = String(e && (e.message || e.code));
      // 안드로이드는 앱 서명·OAuth 설정이 안 맞아도 '취소'로 돌아온다 — 조용히 넘기지 않고 알린다
      if (/cancel/i.test(msg) && !(window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android')) return;   // 사용자가 닫음
      console.warn('[Auth] 앱 로그인 실패', e);
      App.showToast('로그인 실패: ' + (e.message || e), 'error');
    }
  },

  // ── Apple 로 로그인 (아이폰 앱) ──────────────────
  // Apple 계정으로 Firebase 에 로그인해 기록(습관·식단·운동·인바디·메모…)을 계정에 붙인다.
  // 구글 캘린더·할 일은 나중에 '구글 연결' 로 같은 계정에 덧붙인다(Firebase 계정 연결).
  appleUser: null,
  appleAvail() { return typeof Platform !== 'undefined' && Platform.native && window.Capacitor?.getPlatform?.() === 'ios' && !!window.Capacitor?.Plugins?.SocialLogin; },
  signedIn() { return this.isLoggedIn() || !!this.appleUser; },
  async _sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); },
  async appleLogin() {
    const SL = window.Capacitor?.Plugins?.SocialLogin;
    if (!SL) { App.showToast('Apple 로그인을 쓸 수 없습니다', 'error'); return; }
    try {
      if (!this._slApple) { await SL.initialize({ apple: {} }); this._slApple = true; }
      const raw = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('');
      const r = await SL.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: await this._sha256(raw) } });
      const idToken = r && r.result && r.result.idToken;
      if (!idToken) throw new Error('Apple 에서 로그인 정보를 받지 못했습니다');
      if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
      const cred = new firebase.auth.OAuthProvider('apple.com').credential({ idToken, rawNonce: raw });
      const res = await firebase.auth().signInWithCredential(cred);
      const pf = (r.result && r.result.profile) || {};
      const name = [pf.givenName, pf.familyName].filter(Boolean).join(' ') || res.user.displayName || '';
      if (name) localStorage.setItem('gl_apple_name', name);
      localStorage.setItem('gl_apple', '1');
      await this._appleSession(res.user);
    } catch (e) {
      const msg = String(e && (e.message || e.code));
      if (/cancel|1001/i.test(msg)) return;
      console.warn('[Auth] Apple 로그인 실패', e);
      App.showToast('Apple 로그인 실패: ' + (e.message || e), 'error');
    }
  },
  async _restoreApple() {
    try {
      if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
      document.body.classList.add('auth-restoring');
      const user = await new Promise(res => {
        let done = false;
        const off = firebase.auth().onAuthStateChanged(u => { if (!done) { done = true; off(); res(u); } });
        setTimeout(() => { if (!done) { done = true; res(firebase.auth().currentUser); } }, 6000);
      });
      if (user) await this._appleSession(user);
      else localStorage.removeItem('gl_apple');
    } catch (e) { console.warn('[Auth] Apple 세션 되살리기 실패', e); }
    finally { document.body.classList.remove('auth-restoring'); }
  },
  async _appleSession(user) {
    const name = localStorage.getItem('gl_apple_name') || user.displayName || 'Apple 사용자';
    this.appleUser = { uid: user.uid, email: user.email || '', name };
    UserStore.setUser('apple_' + user.uid);
    if (typeof FirebaseSync !== 'undefined' && CONFIG.FIREBASE_DB_URL) {
      FirebaseSync.init(UserStore.getUser(), CONFIG.FIREBASE_DB_URL);
      FirebaseSync._uid = user.uid; FirebaseSync._authed = true;
      App.showToast('데이터 불러오는 중...', '');
      await FirebaseSync.load();
      FirebaseSync.startPolling();
    }
    await App.onAuthSuccess({ name, email: this.appleUser.email });
    // 이 Apple 계정에 구글이 이미 연결돼 있으면 서버에서 구글 토큰을 조용히 받아 캘린더·할 일도 띄운다
    if (user.providerData.some(p => p.providerId === 'google.com') && await this.serverRefresh()) await this._attachGoogle();
    this._paintGConnect();
  },
  // Apple 로 로그인했고 구글이 없을 때 '일정과 할일' 카드에 한 번 보이는 안내.
  // 예전엔 '구글을 연결해야 쓴다' 였다 — 이제 일정·할일은 Bashy 계정에 저장되고, 아이폰 캘린더·구독 주소도 볼 수 있다.
  _paintGConnect() {
    const noG = !!(this.appleUser && !this.isLoggedIn());
    const el = document.getElementById('gConnect');
    let other = false, closed = false;
    try { other = DeviceCal.on() || IcsCal.sources().length > 0; } catch (e) {}
    try { closed = localStorage.getItem('gl_gconnect_off') === '1'; } catch (e) {}
    const show = noG && !other && !closed;
    if (el) {
      el.hidden = !show;
      if (show) {
        const dev = typeof DeviceCal !== 'undefined' && DeviceCal.avail();
        el.innerHTML = `<p><b>일정과 할일은 구글 없이도 씁니다</b><span>여기서 추가한 일정과 할일은 Bashy 계정에 저장됩니다. ${dev ? '아이폰 캘린더(iCloud·네이버·아웃룩 등), ' : ''}구글 캘린더, 캘린더 구독 주소도 함께 볼 수 있습니다.</span></p>
          <div class="g-connect-acts">
            ${dev ? '<button class="btn-sm accent" onclick="Settings.deviceCal(true)">아이폰 캘린더 보기</button>' : ''}
            <button class="btn-sm${dev ? '' : ' accent'}" onclick="Auth.connectGoogle()">구글 연결</button>
            <button class="btn-sm" onclick="Settings.open('cal')">다른 캘린더</button>
          </div>
          <button type="button" class="g-x" onclick="Auth.hideGConnect()" aria-label="안내 닫기">닫기</button>`;
      }
    }
    // 구글이 끊겼으면 구글 일정·할일만 내린다 (Bashy 것은 그대로 둔다)
    if (noG) { try { if (App._srcEv.google.length || App.S.lists.some(l => l.id !== BashyCal.LIST_ID)) App.dropGoogle(); } catch (e) {} }
  },
  hideGConnect() { try { localStorage.setItem('gl_gconnect_off', '1'); } catch (e) {} this._paintGConnect(); },
  // Apple 로그인 상태에서 구글 캘린더·할 일 붙이기 — 구글 로그인 후 같은 Firebase 계정에 연결한다
  async connectGoogle() { this._wantLink = true; await this.nativeLogin(); },
  async _attachGoogle() {
    try {
      const res = await this.fetch('https://www.googleapis.com/oauth2/v2/userinfo');
      this.userInfo = await res.json();
      const u = firebase.auth().currentUser;
      if (this._wantLink && u && !u.providerData.some(p => p.providerId === 'google.com')) {
        try { await u.linkWithCredential(firebase.auth.GoogleAuthProvider.credential(null, this.accessToken)); App.showToast('구글 캘린더·할 일을 연결했습니다', 'success'); }
        catch (e) {
          if (/already-in-use|credential-already/i.test(e.code || e.message)) App.showToast('이 구글 계정은 이미 다른 Bashy 계정에 쓰이고 있습니다 — 이번 접속에서만 일정을 보여 드립니다', 'error');
          else console.warn('[Auth] 구글 연결 실패', e);
        }
      }
      this._wantLink = false;
    } catch (e) { console.warn('[Auth] 구글 연결 정보 실패', e); }
    this._paintGConnect();
    await App.sync();
  },

  logout() {
    clearTimeout(this._refreshTimer);
    if (this.accessToken) {
      try { google.accounts.oauth2.revoke(this.accessToken, () => {}); } catch {}
    }
    this.accessToken  = null;
    this.tokenExpiry  = null;
    this.userInfo     = null;
    this.tokenClient  = null;
    this._refreshing  = false;
    localStorage.removeItem('gl_token');
    localStorage.removeItem('gl_expiry');
    localStorage.removeItem('gl_scope');
    localStorage.removeItem('gl_offline');
    localStorage.removeItem('gl_apple');
    try { FirebaseSync.clearSecrets(); } catch {}
    try { if (typeof firebase !== 'undefined' && firebase.apps.length) firebase.auth().signOut().finally(() => location.reload()); else location.reload(); }
    catch { location.reload(); }
  },

  // 발급된 토큰에 없는 필수 스코프 목록
  missingScopes() {
    const granted = (this.grantedScope || '').split(' ').filter(Boolean);
    if (!granted.length) return [];   // 스코프 정보를 모르는 경우는 판단 보류
    return REQUIRED_SCOPES.filter(s => !granted.includes(s));
  },

  // 저장된 세션을 버리고 로그인 화면으로 되돌린다
  _promptRelogin() {
    clearTimeout(this._refreshTimer);
    if (this.appleUser) {   // Apple 로그인은 그대로 — 구글 일정만 내려 두고 다시 연결하라고 보여 준다
      this.accessToken = null; this.tokenExpiry = null;
      localStorage.removeItem('gl_token'); localStorage.removeItem('gl_expiry');
      this._paintGConnect(); return;
    }
    this.accessToken  = null;
    this.tokenExpiry  = null;
    this.grantedScope = '';
    localStorage.removeItem('gl_token');
    localStorage.removeItem('gl_expiry');
    localStorage.removeItem('gl_scope');
    const ls = document.getElementById('loginScreen');
    const ap = document.getElementById('app');
    if (ls) ls.style.display = 'flex';
    if (ap) ap.style.display = 'none';
  },

  isLoggedIn() {
    return !!(this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry);
  },

  async _fetchUserInfo(silent = false) {
    if (this.appleUser) return this._attachGoogle();
    try {
      const res     = await this.fetch('https://www.googleapis.com/oauth2/v2/userinfo');
      this.userInfo = await res.json();

      const rawUid        = this.userInfo.id || this.userInfo.email || 'user';
      UserStore.setUser(rawUid);
      const normalizedUid = UserStore.getUser();
      // 오프라인 모드 시절 기록을 계정으로 데려온다. 반드시 load() 앞이다 —
      // 클라우드에 같은 키가 있으면 그쪽이 최신이므로 뒤에 오는 load() 가 덮어써야 맞다.
      const adopted = UserStore.adoptOffline() + (UserStore.adoptLoose ? UserStore.adoptLoose() : 0);

      if (typeof FirebaseSync !== 'undefined' &&
          CONFIG.FIREBASE_DB_URL &&
          !CONFIG.FIREBASE_DB_URL.includes('YOUR_FIREBASE')) {
        FirebaseSync.init(normalizedUid, CONFIG.FIREBASE_DB_URL);
        App.showToast('데이터 불러오는 중...', '');
        // 구글 액세스 토큰으로 Firebase에도 로그인 (실패해도 계속 진행)
        await FirebaseSync.signIn(this.accessToken);
        const loaded = await FirebaseSync.load();
        FirebaseSync.startPolling();
        // 데려온 기록은 아직 이 브라우저에만 있다. 올려 두지 않으면 다음 기기에서 또 없다.
        if (adopted) { FirebaseSync.scheduleSave(); App.showToast(`이전 기록 ${adopted}건을 계정으로 옮겼습니다`, 'success'); }
        else if (loaded) App.showToast('동기화 완료', 'success');
        // 서버에 리프레시 토큰이 없으면 최초 1회 동의를 제안한다 (모달, 스누즈 가능)
        if (!(typeof Platform !== 'undefined' && Platform.native)) setTimeout(() => this._maybeOfferOffline(), 2500);   // 앱은 로그인 때 이미 오프라인 동의를 받는다
      }

      App.onAuthSuccess(this.userInfo);
    } catch (err) {
      console.error('[Auth] fetchUserInfo 실패:', err);
      if (!silent) App.showToast('사용자 정보 조회 실패', 'error');
      App.onAuthSuccess({});
    }
  },

  async fetch(url, opts = {}) {
    if (!this.accessToken) throw new Error('Not authenticated');

    // 만료 1분 이내면 갱신 대기
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      console.warn('[Auth] 토큰 곧 만료, 갱신 시도');
      if (!await this.serverRefresh()) {
        this._silentRefresh();
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const res = await fetch(url, {
      ...opts,
      headers: {
        Authorization:  `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });

    if (res.status === 401) {
      console.warn('[Auth] 401 - 토큰 만료, 갱신 시도');
      if (!await this.serverRefresh()) {
        this._silentRefresh();
        await new Promise(r => setTimeout(r, 3000));   // 팝업 갱신이 끝날 시간
      }
      if (this.accessToken) {
        return fetch(url, {
          ...opts,
          headers: {
            Authorization:  `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
          },
        });
      }
      throw new Error('Token expired');
    }
    return res;
  },
};
