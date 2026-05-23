// js/google-auth.js — Google Identity Services (GIS) 인증

const Auth = {
  accessToken: null,
  tokenExpiry:  null,
  tokenClient:  null,
  userInfo:     null,
  _ready:       false,

  init() {
    this._tryInit();
  },

  _tryInit() {
    if (typeof google !== 'undefined' && google.accounts?.oauth2) {
      this._setup();
    } else {
      setTimeout(() => this._tryInit(), 200);
    }
  },

  _setup() {
    if (CONFIG.GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE')) return;

    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope:     CONFIG.SCOPES,
      callback:  (resp) => {
        if (resp.error) {
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

    this._ready = true;

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
    if (!this._ready || !this.tokenClient) {
      // 아직 준비 안 됐으면 준비될 때까지 기다렸다가 자동 실행
      const wait = setInterval(() => {
        if (this._ready && this.tokenClient) {
          clearInterval(wait);
          this.tokenClient.requestAccessToken();
        }
      }, 100);
      setTimeout(() => clearInterval(wait), 10000);
      return;
    }
    this.tokenClient.requestAccessToken();
  },

  logout() {
    if (this.accessToken) {
      try { google.accounts.oauth2.revoke(this.accessToken, () => {}); } catch {}
    }
    this.accessToken = null;
    this.tokenExpiry  = null;
    this.userInfo     = null;
    this._ready       = false;
    this.tokenClient  = null;
    sessionStorage.removeItem('gl_token');
    sessionStorage.removeItem('gl_expiry');
    if (typeof GoogleCalendar !== 'undefined') GoogleCalendar._calendarList = [];
    location.reload();
  },

  isLoggedIn() {
    return !!(this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry);
  },

  async _fetchUserInfo(silent = false) {
    try {
      const res = await this.fetch('https://www.googleapis.com/oauth2/v2/userinfo');
      this.userInfo = await res.json();
      if (typeof UserStore !== 'undefined') {
        const uid = this.userInfo.id || this.userInfo.email || 'user';
        UserStore.setUser(uid);
      }
      if (typeof DriveSync !== 'undefined') {
        await DriveSync.load();
        DriveSync.watchChanges();
      }
      App.onAuthSuccess(this.userInfo);
    } catch (err) {
      if (!silent) App.showToast('사용자 정보 조회 실패', 'error');
      App.onAuthSuccess({});
    }
  },

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
      App.showToast('로그인이 만료됐습니다. 다시 로그인해주세요.', 'error');
      throw new Error('Token expired');
    }
    return res;
  },
};
