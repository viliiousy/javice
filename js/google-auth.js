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
    }
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
      const r = await fetch('/api/gauth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'refresh', idToken }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.needConsent) { localStorage.setItem('gl_offline', '0'); return false; }
      if (!r.ok || !d.access_token) return false;
      this._applyToken(d);
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
        const r = await fetch('/api/gauth', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'exchange', code }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.access_token) throw new Error(d.error || '코드 교환 실패');
        this._applyToken(d);
        localStorage.setItem('gl_offline', d['저장됨'] ? '1' : '0');
        await this._fetchUserInfo();
        App.showToast(d['저장됨'] ? '백그라운드 동기화 켜짐 ✓' : '로그인됨 (동기화는 다음에)',
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
      const r = await fetch('/api/gauth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'status', idToken }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;                       // 서버가 아직 준비 전이면 조용히 넘어간다
      if (d.hasRefresh) { localStorage.setItem('gl_offline', '1'); return; }
    } catch { return; }

    App.openModal('🔄 백그라운드 동기화', `
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
      if (ok || !this.tokenClient) return;
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
    location.reload();
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

  // 부족한 권한을 다시 요청 (동의 화면 강제 표시)
  reconsent() {
    if (!this.tokenClient) return;
    this._refreshing = false;
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  },

  isLoggedIn() {
    return !!(this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry);
  },

  // 토큰 유효성 확인 후 필요시 즉시 갱신
  async ensureToken() {
    if (this.isLoggedIn()) return true;
    // 서버에 리프레시 토큰이 있으면 팝업 없이 끝난다
    if (await this.serverRefresh()) return true;
    if (this.tokenClient) {
      this._refreshing = true;
      this.tokenClient.requestAccessToken({ prompt: '' });
      await new Promise(r => setTimeout(r, 3000));   // 콜백이 반영될 시간
      return this.isLoggedIn();
    }
    return false;
  },

  async _fetchUserInfo(silent = false) {
    try {
      const res     = await this.fetch('https://www.googleapis.com/oauth2/v2/userinfo');
      this.userInfo = await res.json();

      const rawUid        = this.userInfo.id || this.userInfo.email || 'user';
      UserStore.setUser(rawUid);
      const normalizedUid = UserStore.getUser();
      // 오프라인 모드 시절 기록을 계정으로 데려온다. 반드시 load() 앞이다 —
      // 클라우드에 같은 키가 있으면 그쪽이 최신이므로 뒤에 오는 load() 가 덮어써야 맞다.
      const adopted = UserStore.adoptOffline();

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
        else if (loaded) App.showToast('동기화 완료 ✓', 'success');
        // 서버에 리프레시 토큰이 없으면 최초 1회 동의를 제안한다 (모달, 스누즈 가능)
        setTimeout(() => this._maybeOfferOffline(), 2500);
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
