// js/google-calendar.js — 전체 캘린더 동기화 + 필터 설정

const GoogleCalendar = {
  BASE: 'https://www.googleapis.com/calendar/v3',
  _allCalendars: [],

  // ── 설정 관리 ─────────────────────────
  getSettings() {
    const raw = typeof UserStore!=='undefined'
      ? UserStore.get('gl_cal_settings')
      : localStorage.getItem('gl_cal_settings');
    return JSON.parse(raw || '{"visible":[],"default":"primary"}');
  },
  saveSettings(v) {
    const s = JSON.stringify(v);
    if (typeof UserStore!=='undefined') UserStore.set('gl_cal_settings', s);
    else localStorage.setItem('gl_cal_settings', s);
    FirebaseSync?.scheduleSave();
  },

  isVisible(calId) {
    const s = this.getSettings();
    if (!s.visible.length) return true; // 설정 없으면 전부 표시
    return s.visible.includes(calId);
  },

  getDefaultCalendar() {
    return this.getSettings().default || 'primary';
  },

  // ── 캘린더 목록 가져오기 ───────────────
  async fetchCalendarList() {
    const res  = await Auth.fetch(`${this.BASE}/users/me/calendarList?maxResults=50`);
    const data = await res.json();
    this._allCalendars = (data.items||[]).filter(c=>c.selected!==false);
    return this._allCalendars;
  },

  // ── 전체 캘린더에서 이벤트 ─────────────
  async fetchEvents(timeMin, timeMax) {
    if (!this._allCalendars.length) await this.fetchCalendarList();

    const visible = this._allCalendars.filter(c => this.isVisible(c.id));
    const p = new URLSearchParams({
      timeMin:      timeMin.toISOString(),
      timeMax:      timeMax.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '250',
    });

    const results = await Promise.allSettled(
      visible.map(async cal => {
        const res  = await Auth.fetch(`${this.BASE}/calendars/${encodeURIComponent(cal.id)}/events?${p}`);
        const data = await res.json();
        return (data.items||[]).map(ev=>({
          ...ev,
          _calId:    cal.id,
          _calColor: cal.backgroundColor,
          _calName:  cal.summary,
        }));
      })
    );

    const all = [];
    results.forEach(r=>{ if(r.status==='fulfilled') all.push(...r.value); });
    all.sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
    console.log(`[Calendar] ${visible.length}개 캘린더, ${all.length}개 이벤트`);
    return all;
  },

  async createEvent(summary, startISO, endISO, description='', location='', calendarId=null) {
    const calId = calendarId || this.getDefaultCalendar();
    const body = {
      summary,
      start:{ dateTime:startISO, timeZone:'Asia/Seoul' },
      end:  { dateTime:endISO,   timeZone:'Asia/Seoul' },
    };
    if(description) body.description=description;
    if(location)    body.location=location;
    const res = await Auth.fetch(`${this.BASE}/calendars/${encodeURIComponent(calId)}/events`,{
      method:'POST', body:JSON.stringify(body),
    });
    return res.json();
  },

  async deleteEvent(eventId, calendarId=null) {
    const calId = calendarId || 'primary';
    await Auth.fetch(`${this.BASE}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
      {method:'DELETE'});
  },

  // ── 설정 모달 ─────────────────────────
  showSettings() {
    if (!this._allCalendars.length) {
      App.showToast('캘린더 목록을 불러오는 중입니다. 잠시 후 다시 시도해주세요.','error');
      return;
    }
    const s = this.getSettings();
    App.openModal('📅 캘린더 설정', `
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px">표시할 캘린더를 선택하고 기본 캘린더를 설정하세요.</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto">
        ${this._allCalendars.map(cal=>`
          <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--card2);border-radius:8px">
            <input type="checkbox" id="cal_${cal.id}" value="${cal.id}"
              ${!s.visible.length||s.visible.includes(cal.id)?'checked':''}>
            <span style="width:12px;height:12px;border-radius:50%;background:${cal.backgroundColor||'var(--cyan)'};flex-shrink:0"></span>
            <span style="flex:1;font-size:13px">${esc(cal.summary)}</span>
            <label style="font-size:11px;color:var(--accent-l);cursor:pointer">
              <input type="radio" name="defCal" value="${cal.id}" ${s.default===cal.id?'checked':''}> 기본
            </label>
          </div>`).join('')}
      </div>
      <div class="modal-btns" style="margin-top:14px">
        <button onclick="GoogleCalendar._saveSettings()" class="btn-sm accent">저장 후 동기화</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },

  _saveSettings() {
    const visible = [...document.querySelectorAll('[id^="cal_"]:checked')].map(c=>c.value);
    const defRad  = document.querySelector('input[name="defCal"]:checked');
    this.saveSettings({ visible, default: defRad?.value||'primary' });
    App.closeModal();
    App.showToast('저장됨 — 재동기화 중...','success');
    setTimeout(()=>App.sync(),300);
  },
};
