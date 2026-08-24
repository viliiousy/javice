// js/google-auth.js — Google Identity Services (자동 토큰 갱신)

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
          } else {
            App.showToast('로그인 실패: ' + resp.error, 'error');
          }
          this._refreshing = false;
          return;
        }
        const isRefresh = this._refreshing;
        this._refreshing = false;

        this.accessToken  = resp.access_token;
        this.tokenExpiry  = Date.now() + resp.expires_in * 1000;
        this.grantedScope = resp.scope || '';
        localStorage.setItem('gl_token',  this.accessToken);
        localStorage.setItem('gl_expiry', String(this.tokenExpiry));
        localStorage.setItem('gl_scope',  this.grantedScope);

        // ── 부분 동의(partial consent) 검사 ──
        // 사용자가 동의 화면에서 '캘린더'/'할일' 체크를 해제하면 토큰은 정상 발급되지만
        // 해당 API는 403 insufficient scopes 로 실패한다. 조용히 0개로 보이지 않도록 여기서 잡는다.
        const missing = this.missingScopes();
        if (missing.length) {
          console.warn('[Auth] 누락된 권한:', missing);
          App.showToast('캘린더·할일 권한이 허용되지 않았습니다. 다시 로그인해 모든 항목에 체크해주세요.', 'error');
        }

        // 다음 갱신 예약 (만료 5분 전)
        this._scheduleRefresh(resp.expires_in);

        if (isRefresh) {
          // 자동 갱신 - 조용히 처리
          console.log('[Auth] 토큰 자동 갱신 완료, 다음 만료:', new Date(this.tokenExpiry).toLocaleTimeString());
        } else {
          // 최초 로그인
          await this._fetchUserInfo();
        }
      },
    });

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

  // 조용한 자동 갱신 (팝업 없음)
  _silentRefresh() {
    if (!this.tokenClient) return;
    console.log('[Auth] 토큰 자동 갱신 시도...');
    this._refreshing = true;
    try {
      this.tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      this._refreshing = false;
      console.warn('[Auth] 자동 갱신 실패:', e);
      // 실패 시 1분 후 재시도
      setTimeout(() => this._silentRefresh(), 60000);
    }
  },

  login() {
    if (!this.tokenClient) {
      App.showToast('Google 로딩 중입니다. 1초 후 다시 눌러주세요.', '');
      return;
    }
    this._refreshing = false;
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
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
    // 만료됐으면 갱신 시도
    if (this.tokenClient) {
      return new Promise(resolve => {
        const origCallback = this.tokenClient.callback;
        this._refreshing = true;
        this.tokenClient.requestAccessToken({ prompt: '' });
        // 3초 후 확인
        setTimeout(() => resolve(this.isLoggedIn()), 3000);
      });
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

      if (typeof FirebaseSync !== 'undefined' &&
          CONFIG.FIREBASE_DB_URL &&
          !CONFIG.FIREBASE_DB_URL.includes('YOUR_FIREBASE')) {
        FirebaseSync.init(normalizedUid, CONFIG.FIREBASE_DB_URL);
        App.showToast('데이터 불러오는 중...', '');
        // 구글 액세스 토큰으로 Firebase에도 로그인 (실패해도 계속 진행)
        await FirebaseSync.signIn(this.accessToken);
        const loaded = await FirebaseSync.load();
        FirebaseSync.startPolling();
        if (loaded) App.showToast('동기화 완료 ✓', 'success');
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
      this._silentRefresh();
      await new Promise(r => setTimeout(r, 2000));
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
      this._silentRefresh();
      // 3초 후 재시도
      await new Promise(r => setTimeout(r, 3000));
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
