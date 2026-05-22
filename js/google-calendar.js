// js/google-calendar.js — Google Calendar API v3 (전체 캘린더 동기화)

const GoogleCalendar = {
  BASE: 'https://www.googleapis.com/calendar/v3',
  _calendarList: [],  // 사용자의 모든 캘린더 목록 캐시

  // 사용자의 모든 캘린더 목록 가져오기
  async fetchCalendarList() {
    const res  = await Auth.fetch(`${this.BASE}/users/me/calendarList?maxResults=50`);
    const data = await res.json();
    this._calendarList = (data.items || []).filter(c => c.selected !== false);
    return this._calendarList;
  },

  // 모든 캘린더에서 이벤트 가져오기
  async fetchEvents(timeMin, timeMax) {
    // 캘린더 목록이 없으면 먼저 가져오기
    if (!this._calendarList.length) {
      await this.fetchCalendarList();
    }

    const p = new URLSearchParams({
      timeMin:      timeMin.toISOString(),
      timeMax:      timeMax.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '250',
    });

    // 모든 캘린더에서 병렬로 이벤트 가져오기
    const results = await Promise.allSettled(
      this._calendarList.map(async cal => {
        const res  = await Auth.fetch(
          `${this.BASE}/calendars/${encodeURIComponent(cal.id)}/events?${p}`
        );
        const data = await res.json();
        // 이벤트에 캘린더 색상 정보 추가
        return (data.items || []).map(ev => ({
          ...ev,
          _calendarColor: cal.backgroundColor,
          _calendarName:  cal.summary,
        }));
      })
    );

    // 성공한 결과만 합치기
    const allEvents = [];
    results.forEach(r => {
      if (r.status === 'fulfilled') allEvents.push(...r.value);
    });

    // 날짜순 정렬
    allEvents.sort((a, b) => {
      const da = new Date(a.start?.dateTime || a.start?.date);
      const db = new Date(b.start?.dateTime || b.start?.date);
      return da - db;
    });

    console.log(`[Calendar] ${this._calendarList.length}개 캘린더에서 ${allEvents.length}개 이벤트 로드`);
    return allEvents;
  },

  // primary 캘린더에 이벤트 추가
  async createEvent(summary, startISO, endISO, description = '', location = '') {
    const body = {
      summary,
      start: { dateTime: startISO, timeZone: 'Asia/Seoul' },
      end:   { dateTime: endISO,   timeZone: 'Asia/Seoul' },
    };
    if (description) body.description = description;
    if (location)    body.location    = location;
    const res = await Auth.fetch(`${this.BASE}/calendars/primary/events`, {
      method: 'POST',
      body:   JSON.stringify(body),
    });
    return res.json();
  },

  async deleteEvent(eventId, calendarId = 'primary') {
    await Auth.fetch(
      `${this.BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    );
  },
};
