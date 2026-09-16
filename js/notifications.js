// js/notifications.js — 알림 설정 및 FCM 구독 관리
//
// 토큰은 기기마다 다르다. 예전에는 UserStore(기기 간 동기화 대상)에 넣어서
// PC와 폰이 서로 토큰을 덮어썼고, 결국 한 기기만 알림을 받을 수 있었다.
// 이제 토큰과 기기 id 는 그 기기의 localStorage 에만 둔다(동기화하지 않는다).
//
// 그리고 토큰은 한 번 받아 두면 끝이 아니다 — 조용히 바뀐다.
// 2026-09-14 에 이것 때문에 알림이 통째로 멈춰 있었다. 자세한 건 refresh() 위에 적었다.

const Notifications = {
  _swReg:   null,
  _token:   null,

  // ── 기기 로컬 저장소 (UserStore 를 거치지 않는다 = 동기화 안 됨) ──
  TOKEN_KEY:  'gl_fcm_token_dev',
  DEVICE_KEY: 'gl_device_id',

  deviceId() {
    let id = localStorage.getItem(this.DEVICE_KEY);
    if (!id) {
      id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      localStorage.setItem(this.DEVICE_KEY, id);
    }
    return id;
  },
  localToken()      { return localStorage.getItem(this.TOKEN_KEY); },
  setLocalToken(t)  { localStorage.setItem(this.TOKEN_KEY, t); },

  // 기본 설정
  DEFAULT_SETTINGS: {
    enabled: false,
    habits:   { enabled: true,  time: '21:00' },
    diet:     { enabled: true,  아침: '09:00', 점심: '13:00', 저녁: '19:00' },
    tasks:    { enabled: true,  time: '09:00' },
    checklist:{ enabled: true,  time: '09:00' },
    calendar: { enabled: true,  time: '08:00' },
  },

  getSettings() {
    const saved = UserStore.get('gl_notif_settings');
    return saved ? { ...this.DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...this.DEFAULT_SETTINGS };
  },
  saveSettings(v) { UserStore.set('gl_notif_settings', JSON.stringify(v)); },

  // 서비스워커 + FCM 초기화
  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[Notif] 푸시 알림 미지원 브라우저');
      return false;
    }
    try {
      this._swReg = await navigator.serviceWorker.ready;
      this._syncUid();   // 저장 경로가 바뀌었으면 서버 등록 uid도 맞춰준다
      this.refresh();    // 토큰이 바뀌었으면 갈아 끼운다 (기다리지 않는다)
      return true;
    } catch (e) {
      console.warn('[Notif] SW 준비 실패:', e);
      return false;
    }
  },

  // 알림 등록에 쓸 uid — Firebase 인증이 됐으면 Firebase UID, 아니면 기존 uid
  // (크론이 users/<uid> 를 읽으므로 앱이 실제로 저장하는 경로와 반드시 같아야 한다)
  _effectiveUid() {
    try {
      if (typeof FirebaseSync !== 'undefined' && FirebaseSync._authed && FirebaseSync._uid) {
        return FirebaseSync._uid;
      }
    } catch {}
    return UserStore.getUser();
  },

  // 이미 발급된 토큰이 구경로 uid로 등록돼 있으면 새 uid로 옮긴다
  async _syncUid() {
    const token = this.localToken();
    if (!token) return;
    const want = this._effectiveUid();
    if (localStorage.getItem('gl_fcm_uid_dev') === want) return;
    console.log('[Notif] 등록 uid 갱신 →', want);
    await this._registerToken(token);
  },

  // ── 토큰 새로 고치기 ────────────────────────────
  // 한 번 등록하면 끝인 줄 알았다. 아니었다.
  //
  // FCM 웹 토큰은 조용히 바뀐다 — 서비스워커가 갱신되거나, 브라우저가 사이트 데이터를
  // 정리하거나, 홈 화면에 담아 둔 앱을 지웠다 다시 담으면 새 토큰이 나온다.
  // 그런데 토큰을 발급받는 곳은 subscribe() 한 군데뿐이었고, 그 단추는 한 번 등록되면
  // 설정 화면에서 사라졌다. 그래서 서버는 죽은 토큰을 영원히 들고 있었다.
  //
  // 더 나쁜 건 죽은 티가 안 난다는 것이다. FCM 은 한동안 그 토큰을 200 으로 받아 준다.
  // 크론은 '성공 4 / 실패 0' 이라 적고, 설정 화면엔 '✅ 이 기기에 등록됨' 이 떠 있고,
  // 폰에는 아무것도 안 온다. 어디를 봐도 초록불이라 물어볼 데가 없었다.
  //
  // 그래서 앱이 열릴 때마다 지금 토큰을 물어보고, 서버에 있는 것과 다르면 갈아 끼운다.
  // 같아도 오래됐으면 한 번 다시 올린다 — 등록 시각이 최신이어야 '언제 등록된 것인가'
  // 에 답할 수 있고, 그 답이 있어야 다음에 또 막혔을 때 볼 곳이 생긴다.
  REFRESH_AFTER: 3 * 24 * 3600 * 1000,     // 3일
  STAMP_KEY: 'gl_fcm_synced_at',

  syncedAt(){ return Number(localStorage.getItem(this.STAMP_KEY) || 0) || null; },

  async refresh() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!this.localToken()) return;            // 이 기기는 애초에 등록한 적이 없다
    const get = await this._waitForFcm();
    if (!get) return;

    let token = null;
    try { token = await get(); } catch { token = null; }
    if (!token) {
      // 권한은 살아 있는데 토큰이 안 나온다 = 이 기기의 푸시 등록이 사라졌다.
      // 조용히 넘기지 않는다. 여기서 안 알리면 다음에 알 방법이 또 없다.
      console.warn('[Notif] 토큰 재발급 실패 — 이 기기는 다시 등록해야 합니다');
      this._needsReauth = true;
      return;
    }
    this._needsReauth = false;

    const same = token === this.localToken();
    const age  = Date.now() - (this.syncedAt() || 0);
    if (same && age < this.REFRESH_AFTER) return;

    this.setLocalToken(token);
    const r = await this._registerToken(token);
    console.log('[Notif] 토큰 갱신', same ? '(같은 토큰, 시각만)' : '(새 토큰)', r.ok ? '성공' : r.error);
  },

  // _fcmGetToken 은 index.html 의 load 처리기에서 만들어진다. init() 은 그보다 먼저 돌 수 있다.
  async _waitForFcm(ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (typeof window._fcmGetToken === 'function') return window._fcmGetToken;
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  },

  // 알림 권한 요청 + FCM 토큰 발급
  async subscribe() {
    try {
      // 권한 요청
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        App.showToast('알림 권한이 거부됐습니다', 'error');
        return false;
      }

      // Firebase SDK로 FCM 토큰 발급 (index.html에서 초기화된 _fcmGetToken 사용)
      let token = null;
      if (typeof window._fcmGetToken === 'function') {
        token = await window._fcmGetToken();
      }

      // Firebase SDK 실패 시 Web Push 직접 방식으로 폴백
      if (!token) {
        console.warn('[Notif] Firebase SDK 토큰 발급 실패, Web Push 폴백 시도...');
        try {
          const sub = await this._swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this._urlBase64ToUint8Array(CONFIG.FCM_VAPID_KEY),
          });
          // FCM endpoint에서 토큰 추출
          if (sub.endpoint?.includes('fcm.googleapis.com')) {
            token = sub.endpoint.split('/').pop();
          }
          console.log('[Push] Web Push 폴백 토큰:', token ? token.slice(0,20)+'...' : 'null');
        } catch(e) {
          console.error('[Push] Web Push 폴백 실패:', e.message);
        }
      }

      if (!token) {
        App.showToast('FCM 토큰 발급 실패 (브라우저 설정 확인)', 'error');
        return false;
      }

      console.log('[Notif] FCM 토큰 발급 성공:', token.slice(0,20)+'...');
      this._token = token;
      this.setLocalToken(token);   // 이 기기에만 저장 (동기화하지 않는다)

      // 서버 등록이 실패하면 알림은 오지 않는다. 성공했다고 말하지 않는다.
      const reg = await this._registerToken(token);
      if (!reg.ok) {
        App.showToast('알림 등록 실패: ' + reg.error, 'error');
        return false;
      }
      App.showToast('✅ 백그라운드 알림 활성화됨', 'success');
      return true;
    } catch (e) {
      console.error('[Notif] 구독 실패:', e);
      App.showToast('알림 설정 실패: ' + e.message, 'error');
      return false;
    }
  },

  // 서버에 토큰 등록. 성공 여부를 반드시 돌려준다 — 실패를 조용히 넘기면
  // 화면에는 '활성화됨'이 뜨는데 알림은 영영 오지 않는다.
  async _registerToken(token) {
    const uid      = this._effectiveUid();
    const prev     = localStorage.getItem('gl_fcm_uid_dev');
    const settings = this.getSettings();
    const body     = { uid, token, settings, deviceId: this.deviceId(), ua: navigator.userAgent };
    if (prev && prev !== uid) body.prevUid = prev;   // 구경로 등록분 삭제 요청
    try {
      const res  = await fetch(Platform.api('/api/subscribe'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      console.log('[Notif] 토큰 등록:', res.status, data);
      if (!res.ok || !data.success) return { ok:false, error: data.error || ('HTTP ' + res.status) };
      localStorage.setItem('gl_fcm_uid_dev', uid);
      localStorage.setItem(this.STAMP_KEY, String(Date.now()));
      return { ok:true, data };
    } catch (e) {
      console.warn('[Notif] 토큰 등록 실패:', e);
      return { ok:false, error: e.message };
    }
  },

  // 테스트 알림 (로컬 Notification API)
  async sendTest() {
    if(Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
    if(Notification.permission === 'granted') {
      new Notification('⚡ Bashy 알림 테스트', {
        body: '알림이 정상 작동합니다! 🎉',
        icon: '/icons/icon-192.png',
      });
      App.showToast('✅ 테스트 알림 전송됨', 'success');
    } else {
      App.showToast('알림 권한이 없습니다', 'error');
    }
  },

  // 알림 설정 모달
  showSettings() {
    const s   = this.getSettings();
    const sub = this.localToken();   // 이 기기 기준 (다른 기기 등록과 무관)
    // '등록됨' 만으로는 부족하다. 죽은 토큰도 등록은 돼 있다 —
    // 언제 등록된 것인지가 보여야 '오래됐으니 한 번 다시 해 보자' 는 판단이 선다.
    const at  = this.syncedAt();
    const day = at ? Math.floor((Date.now() - at) / 86400000) : null;
    const when = day === null ? '' : day === 0 ? ' · 오늘 갱신' : ` · ${day}일 전 갱신`;
    const state = this._needsReauth ? '⚠️ 등록이 풀렸습니다 — 다시 등록하세요'
                : sub ? `✅ 이 기기에 등록됨${when}` : '미등록';
    App.openModal('🔔 알림 설정', `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--card2);border-radius:10px;margin-bottom:8px">
          <div>
            <div style="font-weight:600;font-size:14px">알림 활성화</div>
            <div style="font-size:11px;color:var(--text3)">${state}</div>
          </div>
          <button onclick="Notifications._toggleEnable()" class="btn-sm ${s.enabled?'accent':''}" id="notifToggle">
            ${s.enabled?'켜짐':'끄기'}
          </button>
        </div>
        <!-- 등록된 뒤에도 이 단추를 숨기지 않는다. 알림이 안 올 때 사용자가 스스로
             할 수 있는 일이 이것 하나인데, 예전엔 '등록됨' 이 되는 순간 사라졌다. -->
        <button onclick="Notifications.subscribe()" class="btn-sm ${sub&&!this._needsReauth?'':'accent'}"
          style="width:100%;padding:10px;margin-bottom:10px">
          ${sub ? '🔄 이 기기 다시 등록 <span style="opacity:.7;font-size:11px">(알림이 안 올 때)</span>'
                : '🔔 이 기기에서 알림 활성화'}
        </button>
      </div>

      <div class="notif-section">
        <div class="notif-row">
          <label class="notif-label">✅ 습관 리마인더</label>
          <input type="checkbox" id="n_habits" ${s.habits?.enabled?'checked':''}
            onchange="Notifications._toggle('habits',this.checked)">
        </div>
        <div class="notif-time-row" id="nr_habits" ${!s.habits?.enabled?'style="display:none"':''}>
          <span class="notif-time-lbl">알림 시간</span>
          <input type="time" value="${s.habits?.time||'21:00'}" class="inp notif-time-inp"
            onchange="Notifications._setTime('habits','time',this.value)">
        </div>
      </div>

      <div class="notif-section">
        <div class="notif-row">
          <label class="notif-label">🥗 식단 기록 알림</label>
          <input type="checkbox" id="n_diet" ${s.diet?.enabled?'checked':''}
            onchange="Notifications._toggle('diet',this.checked)">
        </div>
        <div id="nr_diet" ${!s.diet?.enabled?'style="display:none"':''}>
          ${['아침','점심','저녁'].map(m=>`
            <div class="notif-time-row">
              <span style="font-size:12px;color:var(--text2)">${m}</span>
              <input type="time" value="${s.diet?.[m]||{아침:'09:00',점심:'13:00',저녁:'19:00'}[m]}" class="inp inp-sm"
                onchange="Notifications._setTime('diet','${m}',this.value)">
            </div>`).join('')}
        </div>
      </div>

      <div class="notif-section">
        <div class="notif-row">
          <label class="notif-label">📋 오늘 마감 할일</label>
          <input type="checkbox" id="n_tasks" ${s.tasks?.enabled?'checked':''}
            onchange="Notifications._toggle('tasks',this.checked)">
        </div>
        <div class="notif-time-row" id="nr_tasks" ${!s.tasks?.enabled?'style="display:none"':''}>
          <span class="notif-time-lbl">알림 시간</span>
          <input type="time" value="${s.tasks?.time||'09:00'}" class="inp inp-sm"
            onchange="Notifications._setTime('tasks','time',this.value)">
        </div>
      </div>

      <div class="notif-section">
        <div class="notif-row">
          <label class="notif-label">📅 캘린더 일정</label>
          <input type="checkbox" id="n_cal" ${s.calendar?.enabled?'checked':''}
            onchange="Notifications._toggle('calendar',this.checked)">
        </div>
        <div class="notif-time-row" id="nr_calendar" ${!s.calendar?.enabled?'style="display:none"':''}>
          <span class="notif-time-lbl">오늘 일정 요약</span>
          <select class="inp inp-sm" onchange="Notifications._setTime('calendar','time',this.value)">
            ${Array.from({length:24},(_,h)=>{
              const v = String(h).padStart(2,'0')+':00';
              return `<option value="${v}" ${(s.calendar?.time||'08:00')===v?'selected':''}>${v}</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <p class="notif-hint">⏱ 알림 크론은 <b>매시 정각</b>에만 돌아갑니다. 분은 무시되니 시(時)만 맞춰 주세요.</p>

      <div class="modal-btns" style="margin-top:16px">
        <button onclick="Notifications.sendTest()" class="btn-sm">🔔 테스트 알림</button>
        <button onclick="Notifications._saveAll();App.closeModal();" class="btn-sm accent">저장</button>
      </div>`);
  },

  _toggleEnable() {
    const s    = this.getSettings();
    s.enabled  = !s.enabled;
    this.saveSettings(s);
    const btn  = document.getElementById('notifToggle');
    if (btn) { btn.textContent=s.enabled?'켜짐':'끄기'; btn.className=`btn-sm ${s.enabled?'accent':''}`; }
    if (s.enabled && !this.localToken()) this.subscribe();
    FirebaseSync?.scheduleSave();
  },

  _toggle(section, val) {
    const s = this.getSettings();
    if (!s[section]) s[section] = {};
    s[section].enabled = val;
    this.saveSettings(s);
    const row = document.getElementById(`nr_${section}`);
    if (row) row.style.display = val ? '' : 'none';
  },

  _setTime(section, key, val) {
    const s = this.getSettings();
    if (!s[section]) s[section] = {};
    s[section][key] = val;
    this.saveSettings(s);
  },

  _saveAll() {
    App.showToast('알림 설정 저장됨 ✓', 'success');
    // 서버에 설정 업데이트 (이 기기 토큰 기준)
    const token = this.localToken();
    if (token) this._registerToken(token).then(r => {
      if (!r.ok) App.showToast('설정 서버 반영 실패: ' + r.error, 'error');
    });
    FirebaseSync?.scheduleSave();
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  },
};
