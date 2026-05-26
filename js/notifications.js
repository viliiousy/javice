// js/notifications.js — 알림 설정 및 FCM 구독 관리

const Notifications = {
  _swReg:   null,
  _token:   null,

  // 기본 설정
  DEFAULT_SETTINGS: {
    enabled: false,
    habits:   { enabled: true,  time: '21:00' },
    diet:     { enabled: true,  아침: '09:00', 점심: '13:00', 저녁: '19:00' },
    tasks:    { enabled: true,  time: '09:00' },
    checklist:{ enabled: true,  time: '09:00' },
    calendar: { enabled: true,  minutesBefore: 30 },
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
      return true;
    } catch (e) {
      console.warn('[Notif] SW 준비 실패:', e);
      return false;
    }
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
      UserStore.set('gl_fcm_token', token);
      FirebaseSync?.scheduleSave();
      await this._registerToken(token);
      App.showToast('✅ 백그라운드 알림 활성화됨', 'success');
      return true;
    } catch (e) {
      console.error('[Notif] 구독 실패:', e);
      App.showToast('알림 설정 실패: ' + e.message, 'error');
      return false;
    }
  },

  // 서버에 토큰 등록
  async _registerToken(token) {
    const uid = UserStore.getUser();
    const settings = this.getSettings();
    try {
      const res = await fetch('/api/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid, token, settings }),
      });
      const data = await res.json();
      console.log('[Notif] 토큰 등록:', data);
    } catch (e) {
      console.warn('[Notif] 토큰 등록 실패:', e);
    }
  },

  // 테스트 알림 (로컬 Notification API)
  async sendTest() {
    if(Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
    if(Notification.permission === 'granted') {
      new Notification('⚡ 자비스 알림 테스트', {
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
    const sub = UserStore.get('gl_fcm_token');
    App.openModal('🔔 알림 설정', `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--card2);border-radius:10px;margin-bottom:8px">
          <div>
            <div style="font-weight:600;font-size:14px">알림 활성화</div>
            <div style="font-size:11px;color:var(--text3)">${sub?'✅ 이 기기에 등록됨':'미등록'}</div>
          </div>
          <button onclick="Notifications._toggleEnable()" class="btn-sm ${s.enabled?'accent':''}" id="notifToggle">
            ${s.enabled?'켜짐':'끄기'}
          </button>
        </div>
        ${!sub?`<button onclick="Notifications.subscribe()" class="btn-sm accent" style="width:100%;padding:10px;margin-bottom:10px">🔔 이 기기에서 알림 활성화</button>`:''}
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
          <span class="notif-time-lbl">몇 분 전</span>
          <select class="inp inp-sm" onchange="Notifications._setTime('calendar','minutesBefore',parseInt(this.value))">
            ${[10,15,30,60].map(m=>`<option value="${m}" ${s.calendar?.minutesBefore===m?'selected':''}>${m}분 전</option>`).join('')}
          </select>
        </div>
      </div>

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
    if (s.enabled && !UserStore.get('gl_fcm_token')) this.subscribe();
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
    // 서버에 설정 업데이트
    const token = UserStore.get('gl_fcm_token');
    if (token) this._registerToken(token);
    FirebaseSync?.scheduleSave();
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  },
};
