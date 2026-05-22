// js/google-calendar.js — Google Calendar API v3

const GoogleCalendar = {
  BASE: 'https://www.googleapis.com/calendar/v3',

  async fetchEvents(timeMin, timeMax) {
    const p = new URLSearchParams({
      timeMin:      timeMin.toISOString(),
      timeMax:      timeMax.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '200',
    });
    const res  = await Auth.fetch(`${this.BASE}/calendars/primary/events?${p}`);
    const data = await res.json();
    return data.items || [];
  },

  async createEvent(summary, startISO, endISO, description = '', location = '') {
    const body = { summary, start: { dateTime: startISO, timeZone: 'Asia/Seoul' }, end: { dateTime: endISO, timeZone: 'Asia/Seoul' } };
    if (description) body.description = description;
    if (location)    body.location    = location;
    const res = await Auth.fetch(`${this.BASE}/calendars/primary/events`, {
      method: 'POST',
      body:   JSON.stringify(body),
    });
    return res.json();
  },

  async updateEvent(eventId, changes) {
    const res = await Auth.fetch(
      `${this.BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { method: 'PATCH', body: JSON.stringify(changes) }
    );
    return res.json();
  },

  async deleteEvent(eventId) {
    await Auth.fetch(
      `${this.BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    );
  },
};
