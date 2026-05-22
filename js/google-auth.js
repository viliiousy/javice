// js/google-auth.js — Google Identity Services (GIS) 인증

const Auth = {
  accessToken: null,
  tokenExpiry:  null,
  tokenClient:  null,
  userInfo:     null,

  init() {
    if (typeof google === 'undefined' || !google.accounts) return;

    // Placeholder check
    if (CONFIG.GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE')) {
      console.warn('[Auth] config.js 에 GOOGLE_CLIENT_ID 를 설정해주세요.');
      return;
    }

    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope:     CONFIG.SCOPES,
      callback:  (resp) => {
        if (resp.error) {
          console.error('[Auth] error:', resp.error, resp.error_description);
          App.showToast('로그인 실패: ' + resp.error, 'error');
          return;
        }
        this.accessToken = resp.access_token;
        this.tokenExpiry  = Date.now() + resp.expires_in * 1000;
        sessionStorage.setItem('gl_token',  this.accessToken);
        sessionStorage.setItem('gl_expiry', String(this.tokenExpiry));
        this._fetchUserInfo();
      },
    });

    // 세션 복원
    const t = sessionStorage.getItem('gl_token');
    const e = sessionStorage.getItem('gl_expiry');
    if (t && e && Date.now() < parseInt(e, 10)) {
      this.accessToken = t;
      this.tokenExpiry  = parseInt(e, 10);
      this._fetchUserInfo(true);
    }
  },

  login() {
    if (CONFIG.GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE')) {
      alert('⚠️ config.js 에서 GOOGLE_CLIENT_ID 를 설정해주세요.\nREADME.md 를 참고하세요.');
      return;
    }
    if (!this.tokenClient) {
      App.showToast('Google 초기화 중입니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }
    this.tokenClient.requestAccessToken();
  },

  logout() {
    if (this.accessToken) {
      google.accounts.oauth2.revoke(this.accessToken, () => {});
    }
    this.accessToken = null;
    this.tokenExpiry  = null;
    this.userInfo     = null;
    sessionStorage.removeItem('gl_token');
    sessionStorage.removeItem('gl_expiry');
    location.reload();
  },

  isLoggedIn() {
    return !!(this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry);
  },

  async _fetchUserInfo(silent = false) {
    try {
      const res  = await this.fetch('https://www.googleapis.com/oauth2/v2/userinfo');
      this.userInfo = await res.json();
      App.onAuthSuccess(this.userInfo);
    } catch (err) {
      if (!silent) App.showToast('사용자 정보 조회 실패', 'error');
      App.onAuthSuccess({});
    }
  },

  // 인증된 fetch — 모든 Google API 호출에 사용
  async fetch(url, opts = {}) {
    if (!this.accessToken) throw new Error('Not authenticated');
    const res = await fetch(url, {
      ...opts,
      headers: {
        Authorization:  `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) {
      sessionStorage.removeItem('gl_token');
      sessionStorage.removeItem('gl_expiry');
      App.showToast('로그인이 만료되었습니다. 다시 로그인해주세요.', 'error');
      throw new Error('Token expired');
    }
    return res;
  },
};
