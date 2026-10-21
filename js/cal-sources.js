// js/cal-sources.js — 구글 말고도 쓰는 일정·할일 출처
//
// 구글 캘린더를 안 쓰는 사람도 '일정과 할일' 카드를 그대로 쓰게 출처를 셋 더 둔다.
//   bashy  : Bashy 계정에 저장하는 자체 캘린더·할일 (UserStore → Firebase). 항상 켜져 있다.
//   device : 아이폰 캘린더(EventKit). 아이폰 설정에 추가한 iCloud·네이버·아웃룩 계정이 다 들어온다. iOS 앱에서만.
//   ics    : 캘린더 구독 주소(.ics / webcal://). 읽기만 한다. 브라우저가 직접 못 받아서 서버(api/hub act=ics)가 대신 받는다.
//
// 화면(app.js)은 구글 모양 그대로를 기대한다 — 일정 {id, summary, start:{dateTime|date}, end, location, description},
// 할일 {id, title, notes, due, status, completed}. 그래서 모든 출처를 그 모양으로 바꾸고 `_src` 로 출처를 붙인다.

function _calYmd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// 화면의 onclick="...('id')" 에 그대로 들어가도 안전한 짧은 id (출처의 원래 id 는 따로 들고 있는다)
function _calHash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function _calSave() { try { if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleSave(); } catch (e) {} }

// ── Bashy 자체 캘린더 ─────────────────────────────
const BashyCal = {
  LIST_ID: 'bashy', NAME: 'Bashy', COLOR: '#FF6A2B',
  EV_KEY: 'gl_bashy_events', TASK_KEY: 'gl_bashy_tasks',
  _read(k) { try { const v = JSON.parse(UserStore.get(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
  _write(k, v) { UserStore.set(k, JSON.stringify(v)); _calSave(); },
  _id(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },

  // 일정
  _norm(e) { return { ...e, _src: 'bashy', _calId: 'bashy', _calName: 'Bashy', _calColor: this.COLOR }; },
  events(tMin, tMax) {
    return this._read(this.EV_KEY).filter(e => {
      const s = new Date(e.start?.dateTime || (e.start?.date + 'T00:00:00'));
      const en = new Date(e.end?.dateTime || (e.end?.date ? e.end.date + 'T00:00:00' : s));
      return !tMin || (en >= tMin && s <= tMax);
    }).map(e => this._norm(e));
  },
  _shape(f) {
    const out = { summary: f.title, location: f.location || '', description: f.description || '' };
    if (f.allDay) {
      const s = new Date(f.start), e = new Date(Math.max(+f.end, +f.start));
      e.setDate(e.getDate() + 1);   // 구글처럼 끝 날짜는 '다음 날' (끝을 포함하지 않는다)
      out.start = { date: _calYmd(s) }; out.end = { date: _calYmd(e) };
    } else {
      out.start = { dateTime: new Date(f.start).toISOString() }; out.end = { dateTime: new Date(Math.max(+f.end, +f.start)).toISOString() };
    }
    return out;
  },
  addEvent(f) {
    const ev = { id: this._id('be_'), ...this._shape(f), created: new Date().toISOString() };
    const all = this._read(this.EV_KEY); all.push(ev); this._write(this.EV_KEY, all);
    return this._norm(ev);
  },
  updateEvent(id, f) {
    const all = this._read(this.EV_KEY), i = all.findIndex(e => e.id === id);
    if (i < 0) throw new Error('일정을 찾지 못했습니다');
    all[i] = { ...all[i], ...this._shape(f), updated: new Date().toISOString() };
    this._write(this.EV_KEY, all);
    return this._norm(all[i]);
  },
  deleteEvent(id) { this._write(this.EV_KEY, this._read(this.EV_KEY).filter(e => e.id !== id)); },

  // 할일 — 구글 할 일과 같은 모양 (due 는 UTC 자정 문자열)
  list() { return { id: this.LIST_ID, title: this.NAME, _src: 'bashy' }; },
  tasks() { return this._read(this.TASK_KEY).map(t => ({ ...t, _src: 'bashy' })); },
  _due(d) { return d ? (typeof GoogleTasks !== 'undefined' ? GoogleTasks._dueToISO(d) : String(d).slice(0, 10) + 'T00:00:00.000Z') : null; },
  _clean(t) { const { _src, _lid, _lname, _hidden, starred, _apiStarred, ...rest } = t; return rest; },
  createTask(title, due = null, notes = '') {
    const now = new Date().toISOString();
    const t = { id: this._id('bt_'), title, notes: notes || '', due: this._due(due), status: 'needsAction', updated: now };
    if (!t.due) delete t.due;
    const all = this._read(this.TASK_KEY); all.unshift(t); this._write(this.TASK_KEY, all);
    return { ...t, _src: 'bashy' };
  },
  _patch(id, fn) {
    const all = this._read(this.TASK_KEY), i = all.findIndex(t => t.id === id);
    if (i < 0) throw new Error('할일을 찾지 못했습니다');
    fn(all[i]); all[i].updated = new Date().toISOString();
    all[i] = this._clean(all[i]);
    this._write(this.TASK_KEY, all);
    return { ...all[i], _src: 'bashy' };
  },
  updateTask(id, c) {
    return this._patch(id, t => {
      if (c.title !== undefined) t.title = c.title;
      if (c.notes !== undefined) t.notes = c.notes;
      if (c.due !== undefined) { if (c.due) t.due = this._due(c.due); else delete t.due; }
      if (c.status !== undefined) t.status = c.status;
    });
  },
  toggleTask(id, completed) {
    return this._patch(id, t => { t.status = completed ? 'completed' : 'needsAction'; if (completed) t.completed = new Date().toISOString(); else delete t.completed; });
  },
  deleteTask(id) { this._write(this.TASK_KEY, this._read(this.TASK_KEY).filter(t => t.id !== id)); },
};

// ── 아이폰 캘린더 (EventKit, iOS 앱만) ─────────────────────
// 설정은 기기마다 다르다(캘린더 id 가 기기에 묶여 있다) — 계정이 아니라 이 기기의 localStorage 에 둔다.
//   { on, hide:[숨길 캘린더 id], dest:새 일정 넣을 캘린더 id }
const DeviceCal = {
  KEY: 'gl_devcal',
  _cals: null,
  P() { return window.Capacitor?.Plugins?.BashyNative; },
  avail() { const B = this.P(); return !!(B && B.calEvents && window.Capacitor?.getPlatform?.() === 'ios'); },
  cfg() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch (e) { return {}; } },
  saveCfg(c) { try { localStorage.setItem(this.KEY, JSON.stringify(c)); } catch (e) {} },
  on() { return this.avail() && !!this.cfg().on; },
  async enable(on) {
    const c = this.cfg();
    if (on) {
      const r = await this.P().calAccess().catch(e => ({ granted: false, error: e.message }));
      if (!r.granted) {
        c.on = false; this.saveCfg(c);
        throw new Error(r.status === 'denied' || r.status === 'restricted'
          ? '캘린더 접근이 꺼져 있습니다 — 아이폰 설정 › Bashy › 캘린더에서 ‘전체 접근’을 허용해 주세요'
          : '캘린더 접근을 허락하지 않았습니다');
      }
      this._cals = null;
    }
    c.on = !!on; this.saveCfg(c);
  },
  async calendars(force) {
    if (!this.avail()) return [];
    if (this._cals && !force) return this._cals;
    const r = await this.P().calList();
    this._cals = (r && r.calendars) || [];
    return this._cals;
  },
  visible() { const hide = new Set(this.cfg().hide || []); return (this._cals || []).filter(c => !hide.has(c.id)); },
  writable() { return (this._cals || []).filter(c => c.allowsModify); },
  setVisible(id, show) {
    const c = this.cfg(), hide = new Set(c.hide || []);
    show ? hide.delete(id) : hide.add(id);
    c.hide = [...hide]; this.saveCfg(c);
  },
  setDest(id) { const c = this.cfg(); c.dest = id; this.saveCfg(c); },
  dest() {
    const w = this.writable(), d = this.cfg().dest;
    return (w.find(c => c.id === d) || w.find(c => c.isDefault) || w[0] || null);
  },
  _norm(x) {
    const cal = (this._cals || []).find(c => c.id === x.calendarId) || {};
    const s = new Date(x.start), en = new Date(Math.max(x.end, x.start));
    const ev = {
      id: 'dv_' + _calHash(x.id + '|' + x.start),
      summary: x.title || '', location: x.location || '', description: x.notes || '',
      _src: 'device', _calId: x.calendarId, _calName: x.calendarTitle || cal.title || '아이폰 캘린더',
      _calColor: x.color || cal.color || '#8E8E93', _nativeId: x.id, _startMs: x.start, _recurring: !!x.recurring,
      _readOnly: cal.allowsModify === false,
    };
    if (x.allDay) { ev.start = { date: _calYmd(s) }; ev.end = { date: _calYmd(new Date(+en + 1000)) }; }
    else { ev.start = { dateTime: s.toISOString() }; ev.end = { dateTime: en.toISOString() }; }
    return ev;
  },
  async fetch(tMin, tMax) {
    if (!this.on()) return [];
    await this.calendars();
    const ids = this.visible().map(c => c.id);
    if (!ids.length) return [];
    const r = await this.P().calEvents({ from: +tMin, to: +tMax, ids });
    if (r && r.ok === false && r.status && r.status !== 'granted') throw new Error('아이폰 캘린더 접근이 꺼져 있습니다');
    return ((r && r.events) || []).map(x => this._norm(x));
  },
  async add(calId, f) {
    const r = await this.P().calAdd({ calendarId: calId, title: f.title, start: +new Date(f.start), end: +new Date(f.end),
      allDay: !!f.allDay, location: f.location || '', notes: f.description || '' });
    const cal = (this._cals || []).find(c => c.id === (r.calendarId || calId)) || {};
    return this._norm({ id: r.id, calendarId: r.calendarId || calId, calendarTitle: cal.title, color: cal.color,
      title: f.title, start: +new Date(f.start), end: +new Date(f.end), allDay: !!f.allDay, location: f.location, notes: f.description });
  },
  async del(ev) { await this.P().calDelete({ id: ev._nativeId, start: ev._startMs }); },
};

// ── 캘린더 구독 주소 (ICS) ─────────────────────────
const IcsCal = {
  KEY: 'gl_ics_sources',
  TTL: 15 * 60 * 1000,
  COLORS: ['#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F59E0B', '#64748B'],
  _cache: {},   // url → { at, text }  (메모리에만. localStorage 는 기록 칸이 모자라질 수 있다)
  errors: {},   // 출처 id → 마지막 오류
  sources() { try { const v = JSON.parse(UserStore.get(this.KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
  _saveList(v) { UserStore.set(this.KEY, JSON.stringify(v)); _calSave(); },
  normUrl(u) {
    u = String(u || '').trim().replace(/^webcals?:\/\//i, 'https://');
    if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(u)) return null;
    return u;
  },
  add(name, url, color) {
    const u = this.normUrl(url);
    if (!u) throw new Error('http(s):// 또는 webcal:// 로 시작하는 주소를 넣어 주세요');
    const list = this.sources();
    if (list.some(s => s.url === u)) throw new Error('이미 추가한 주소입니다');
    const s = { id: 'ics' + Date.now().toString(36), name: String(name || '').trim().slice(0, 30) || '구독 캘린더', url: u,
      color: color || this.COLORS[list.length % this.COLORS.length] };
    list.push(s); this._saveList(list);
    return s;
  },
  remove(id) { const s = this.sources().find(x => x.id === id); if (s) delete this._cache[s.url]; this._saveList(this.sources().filter(x => x.id !== id)); delete this.errors[id]; },
  async _text(url, force) {
    const c = this._cache[url];
    if (!force && c && Date.now() - c.at < this.TTL) return c.text;
    const idToken = await Auth._firebaseIdToken();
    if (!idToken) throw new Error('로그인(동기화)이 끝난 뒤 다시 시도해 주세요');
    const r = await fetch(Platform.api('/api/hub'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ act: 'ics', url, idToken }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    this._cache[url] = { at: Date.now(), text: j.text };
    return j.text;
  },
  async fetch(tMin, tMax, force) {
    const list = this.sources();
    const out = [];
    await Promise.all(list.map(async s => {
      try {
        const text = await this._text(s.url, force);
        IcsParse.expand(IcsParse.parse(text), tMin, tMax).forEach(o => out.push({
          id: 'ic_' + _calHash(s.id + '|' + o.uid + '|' + o.key),
          summary: o.summary, location: o.location, description: o.description, start: o.start, end: o.end,
          _src: 'ics', _calId: s.id, _calName: s.name, _calColor: s.color, _readOnly: true,
        }));
        delete this.errors[s.id];
      } catch (e) { this.errors[s.id] = e.message || String(e); console.warn('[ICS]', s.name, e); }
    }));
    return out;
  },
  // 설정 화면에서 '추가' 전에 한 번 받아 본다 — 틀린 주소를 저장하지 않게
  async test(url) { const t = await this._text(url, true); const p = IcsParse.parse(t); return { count: p.events.length, name: p.name }; },
};

// ── ICS 해석 ─────────────────────────────────────
// RFC 5545 중 캘린더 앱들이 실제로 내보내는 만큼: 줄 접기, DATE/DATE-TIME(TZID·Z·떠 있는 시각), DURATION,
// RRULE(DAILY·WEEKLY·MONTHLY·YEARLY + INTERVAL·COUNT·UNTIL·BYDAY·BYMONTHDAY·BYMONTH), EXDATE, RECURRENCE-ID 덮어쓰기.
const IcsParse = {
  // 아웃룩은 TZID 에 윈도우 시간대 이름을 쓴다
  WIN_TZ: {
    'korea standard time': 'Asia/Seoul', 'tokyo standard time': 'Asia/Tokyo', 'china standard time': 'Asia/Shanghai',
    'taipei standard time': 'Asia/Taipei', 'singapore standard time': 'Asia/Singapore', 'utc': 'UTC', 'gmt standard time': 'Europe/London',
    'w. europe standard time': 'Europe/Berlin', 'romance standard time': 'Europe/Paris', 'central europe standard time': 'Europe/Budapest',
    'pacific standard time': 'America/Los_Angeles', 'mountain standard time': 'America/Denver', 'central standard time': 'America/Chicago',
    'eastern standard time': 'America/New_York', 'aus eastern standard time': 'Australia/Sydney', 'india standard time': 'Asia/Kolkata',
    'hawaiian standard time': 'Pacific/Honolulu', 'alaskan standard time': 'America/Anchorage', 'se asia standard time': 'Asia/Bangkok',
  },
  _tzOk: {},
  zone(tzid) {
    if (!tzid) return null;
    let z = String(tzid).replace(/^"|"$/g, '').trim();
    if (this.WIN_TZ[z.toLowerCase()]) z = this.WIN_TZ[z.toLowerCase()];
    const m = z.match(/([A-Za-z_]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?)$/);
    if (m) z = m[1];
    if (!(z in this._tzOk)) { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); this._tzOk[z] = true; } catch (e) { this._tzOk[z] = false; } }
    return this._tzOk[z] ? z : null;
  },
  _fmts: {},
  _offset(tz, t) {   // 그 시간대의 UTC 와의 차이(ms)
    const f = this._fmts[tz] || (this._fmts[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    const p = {}; f.formatToParts(new Date(t)).forEach(x => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  },
  // 벽시계 시각(c) → 실제 시각(ms). kind: utc | tz | float(이 기기 시간)
  toMs(c, kind, tz) {
    if (kind === 'utc') return Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s);
    if (kind === 'tz' && tz) {
      const g = Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s);
      let t = g - this._offset(tz, g);
      t = g - this._offset(tz, t);
      return t;
    }
    return new Date(c.y, c.m - 1, c.d, c.h, c.mi, c.s).getTime();
  },
  unesc(v) { return String(v || '').replace(/\\(n|N|,|;|\\)/g, (_, c) => (c === 'n' || c === 'N') ? '\n' : c); },
  // 값 하나 → { c:{y,m,d,h,mi,s}, date:bool, kind, tz }
  dt(v, params) {
    const m = String(v || '').trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const isDate = (params && /^date$/i.test(params.VALUE || '')) || !m[4];
    const c = { y: +m[1], m: +m[2], d: +m[3], h: isDate ? 0 : +m[4], mi: isDate ? 0 : +m[5], s: isDate ? 0 : +(m[6] || 0) };
    if (isDate) return { c, date: true, kind: 'float' };
    if (m[7]) return { c, date: false, kind: 'utc' };
    const tz = this.zone(params && params.TZID);
    return { c, date: false, kind: tz ? 'tz' : 'float', tz };
  },
  dur(v) {   // DURATION → ms
    const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return null;
    const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
    return m[1] === '-' ? -ms : ms;
  },
  _line(line) {
    // 이름;매개변수=값:내용 — 따옴표 안의 : ; 는 구분자가 아니다
    let q = false, i = 0, colon = -1;
    for (; i < line.length; i++) { const ch = line[i]; if (ch === '"') q = !q; else if (ch === ':' && !q) { colon = i; break; } }
    if (colon < 0) return null;
    const head = line.slice(0, colon), value = line.slice(colon + 1);
    const parts = []; let cur = ''; q = false;
    for (const ch of head) { if (ch === '"') q = !q; if (ch === ';' && !q) { parts.push(cur); cur = ''; } else cur += ch; }
    parts.push(cur);
    const params = {};
    parts.slice(1).forEach(p => { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); });
    return { name: parts[0].toUpperCase(), params, value };
  },
  parse(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const events = []; let cur = null, depth = 0, name = '';
    for (const raw of lines) {
      if (!raw) continue;
      const L = this._line(raw); if (!L) continue;
      if (L.name === 'BEGIN') {
        if (cur) { depth++; continue; }
        if (L.value.toUpperCase() === 'VEVENT') { cur = { exdates: [] }; depth = 0; }
        continue;
      }
      if (L.name === 'END') {
        if (cur && depth > 0) { depth--; continue; }
        if (cur && L.value.toUpperCase() === 'VEVENT') { if (cur.start) events.push(cur); cur = null; }
        continue;
      }
      if (!cur) { if (L.name === 'X-WR-CALNAME') name = this.unesc(L.value); continue; }
      if (depth > 0) continue;   // VALARM 같은 안쪽 묶음
      switch (L.name) {
        case 'UID': cur.uid = L.value; break;
        case 'SUMMARY': cur.summary = this.unesc(L.value); break;
        case 'LOCATION': cur.location = this.unesc(L.value); break;
        case 'DESCRIPTION': cur.description = this.unesc(L.value); break;
        case 'STATUS': cur.status = L.value.toUpperCase(); break;
        case 'DTSTART': cur.start = this.dt(L.value, L.params); break;
        case 'DTEND': cur.end = this.dt(L.value, L.params); break;
        case 'DURATION': cur.duration = this.dur(L.value); break;
        case 'RRULE': cur.rrule = this.rrule(L.value); break;
        case 'RECURRENCE-ID': cur.recurId = this.dt(L.value, L.params); break;
        case 'EXDATE': L.value.split(',').forEach(v => { const d = this.dt(v, L.params); if (d) cur.exdates.push(d); }); break;
      }
    }
    return { name, events };
  },
  rrule(v) {
    const r = {};
    String(v || '').split(';').forEach(p => { const k = p.indexOf('='); if (k > 0) r[p.slice(0, k).toUpperCase()] = p.slice(k + 1); });
    const out = { freq: (r.FREQ || '').toUpperCase(), interval: Math.max(1, parseInt(r.INTERVAL, 10) || 1) };
    if (r.COUNT) out.count = parseInt(r.COUNT, 10);
    if (r.UNTIL) out.until = this.dt(r.UNTIL, {});
    const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    if (r.BYDAY) out.byday = r.BYDAY.split(',').map(x => { const m = x.trim().toUpperCase().match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/); return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: WD[m[2]] } : null; }).filter(Boolean);
    if (r.BYMONTHDAY) out.bymonthday = r.BYMONTHDAY.split(',').map(x => parseInt(x, 10)).filter(x => x);
    if (r.BYMONTH) out.bymonth = r.BYMONTH.split(',').map(x => parseInt(x, 10)).filter(x => x >= 1 && x <= 12);
    out.wkst = WD[(r.WKST || 'MO').toUpperCase()] ?? 1;
    return out;
  },
  // 날짜 셈은 UTC 달력으로만 한다(벽시계 날짜끼리의 셈이라 서머타임에 흔들리지 않는다)
  _day(y, m, d) { const x = new Date(Date.UTC(y, m - 1, d)); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; },
  _dow(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); },
  _dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); },
  _key(c) { return `${c.y}${String(c.m).padStart(2, '0')}${String(c.d).padStart(2, '0')}T${String(c.h).padStart(2, '0')}${String(c.mi).padStart(2, '0')}${String(c.s).padStart(2, '0')}`; },
  _ms(dt, c) { return this.toMs(c || dt.c, dt.kind, dt.tz); },
  // 반복 규칙대로 벽시계 날짜들을 차례로 내놓는다 (시작일 포함)
  *_dates(ev) {
    const s = ev.start.c, R = ev.rrule, iv = R.interval;
    const t = { h: s.h, mi: s.mi, s: s.s };
    const cmp = (a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d);
    let guard = 0;
    if (R.freq === 'DAILY') {
      for (let i = 0; guard++ < 20000; i += iv) yield { ...this._day(s.y, s.m, s.d + i), ...t };
    } else if (R.freq === 'WEEKLY') {
      const days = (R.byday && R.byday.length ? R.byday.map(b => b.wd) : [this._dow(s.y, s.m, s.d)]);
      const back = (this._dow(s.y, s.m, s.d) - R.wkst + 7) % 7;   // 주의 첫날까지
      const order = [...new Set(days)].sort((a, b) => ((a - R.wkst + 7) % 7) - ((b - R.wkst + 7) % 7));
      for (let w = 0; guard++ < 5000; w += iv) {
        for (const wd of order) {
          const off = (wd - R.wkst + 7) % 7;
          const c = this._day(s.y, s.m, s.d - back + w * 7 + off);
          if (cmp(c, s) >= 0) yield { ...c, ...t };
        }
      }
    } else if (R.freq === 'MONTHLY') {
      for (let k = 0; guard++ < 2400; k += iv) {
        const base = this._day(s.y, s.m + k, 1), y = base.y, m = base.m, dim = this._dim(y, m);
        let ds = [];
        if (R.byday && R.byday.length) {
          R.byday.forEach(b => {
            const all = []; for (let d = 1; d <= dim; d++) if (this._dow(y, m, d) === b.wd) all.push(d);
            if (!b.n) ds.push(...all); else { const d = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (d) ds.push(d); }
          });
        } else if (R.bymonthday && R.bymonthday.length) {
          R.bymonthday.forEach(n => { const d = n > 0 ? n : dim + n + 1; if (d >= 1 && d <= dim) ds.push(d); });
        } else if (s.d <= dim) ds.push(s.d);   // 31일 반복은 30일까지인 달을 건너뛴다(규칙대로)
        ds = [...new Set(ds)].sort((a, b) => a - b);
        for (const d of ds) { const c = { y, m, d }; if (cmp(c, s) >= 0) yield { ...c, ...t }; }
      }
    } else if (R.freq === 'YEARLY') {
      const months = R.bymonth && R.bymonth.length ? [...R.bymonth].sort((a, b) => a - b) : [s.m];
      for (let k = 0; guard++ < 300; k += iv) {
        for (const m of months) {
          const y = s.y + k;
          const d = R.bymonthday && R.bymonthday.length ? R.bymonthday[0] : s.d;
          if (d > this._dim(y, m)) continue;   // 2월 29일은 윤년에만
          const c = { y, m, d }; if (cmp(c, s) >= 0) yield { ...c, ...t };
        }
      }
    } else {
      yield { ...s };
    }
  },
  _out(ev, sMs, eMs, c) {
    const o = { uid: ev.uid || ((ev.summary || '') + this._key(ev.start.c)), key: this._key(c),
      summary: ev.summary || '(제목 없음)', location: ev.location || '', description: ev.description || '' };
    if (ev.start.date) {
      const e = new Date(eMs);
      o.start = { date: `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}` };
      o.end = { date: _calYmd(e) };
    } else { o.start = { dateTime: new Date(sMs).toISOString() }; o.end = { dateTime: new Date(eMs).toISOString() }; }
    return o;
  },
  // 보이는 기간 [tMin, tMax] 안의 회차만
  expand(parsed, tMin, tMax) {
    const lo = +tMin, hi = +tMax, out = [];
    const evs = (parsed.events || []).filter(e => e.status !== 'CANCELLED');
    // RECURRENCE-ID 가 있는 것은 반복 중 그 회차만 고친 것 — 원래 회차를 빼고 이것을 넣는다
    const over = {};
    evs.filter(e => e.recurId).forEach(e => { (over[e.uid] = over[e.uid] || new Set()).add(this._key(e.recurId.c)); });
    const cancelled = {};
    (parsed.events || []).filter(e => e.recurId && e.status === 'CANCELLED').forEach(e => { (cancelled[e.uid] = cancelled[e.uid] || new Set()).add(this._key(e.recurId.c)); });
    for (const ev of evs) {
      const s0 = this._ms(ev.start);
      let len;
      if (ev.end) len = this._ms(ev.end) - s0;
      else if (ev.duration != null) len = ev.duration;
      else len = ev.start.date ? 86400000 : 0;
      if (!(len >= 0)) len = 0;
      if (!ev.rrule || ev.recurId || !ev.rrule.freq) {
        if (s0 + Math.max(len, 1) > lo && s0 <= hi) out.push(this._out(ev, s0, s0 + len, ev.start.c));
        continue;
      }
      const R = ev.rrule;
      const ex = new Set(ev.exdates.map(d => d.date ? this._key({ ...d.c, h: ev.start.c.h, mi: ev.start.c.mi, s: ev.start.c.s }) : String(this._ms(d))));
      const skip = new Set([...(over[ev.uid] || []), ...(cancelled[ev.uid] || [])]);
      const untilMs = R.until ? (R.until.date ? this.toMs({ ...R.until.c, h: 23, mi: 59, s: 59 }, ev.start.kind === 'utc' ? 'float' : ev.start.kind, ev.start.tz) : this._ms(R.until)) : Infinity;
      let n = 0;
      for (const c of this._dates(ev)) {
        const sMs = this._ms(ev.start, c);
        if (sMs > untilMs || sMs > hi) break;
        n++;
        if (R.count && n > R.count) break;
        const k = this._key(c);
        if (skip.has(k) || ex.has(k) || ex.has(String(sMs))) continue;
        if (sMs + Math.max(len, 1) > lo) out.push(this._out(ev, sMs, sMs + len, c));
        if (out.length > 5000) break;
      }
    }
    return out;
  },
};

// ── 새 일정을 어디에 넣을지 · 출처별로 지우기 ─────────────
const CalSources = {
  DEST_KEY: 'gl_ev_dest',
  googleOn() { return typeof Auth !== 'undefined' && Auth.isLoggedIn(); },
  // 저장할 수 있는 곳: [{ key:'google:<id>'|'device:<id>'|'bashy', label, group, color }]
  destinations() {
    const out = [];
    if (this.googleOn()) {
      const cals = (GoogleCalendar._allCalendars || []).filter(c => !c.accessRole || c.accessRole === 'owner' || c.accessRole === 'writer');
      if (cals.length) cals.forEach(c => out.push({ key: 'google:' + c.id, label: c.summary || c.id, group: '구글 캘린더', color: c.backgroundColor }));
      else out.push({ key: 'google:primary', label: '기본 캘린더', group: '구글 캘린더' });
    }
    if (DeviceCal.on()) DeviceCal.writable().forEach(c => out.push({ key: 'device:' + c.id, label: c.title, group: '아이폰 캘린더', color: c.color }));
    out.push({ key: 'bashy', label: 'Bashy 캘린더', group: 'Bashy', color: BashyCal.COLOR });
    return out;
  },
  defaultDest() {
    const all = this.destinations(), has = k => all.some(d => d.key === k);
    let last = null; try { last = localStorage.getItem(this.DEST_KEY); } catch (e) {}
    if (last && has(last)) return last;
    if (this.googleOn()) { const g = 'google:' + GoogleCalendar.getDefaultCalendar(); if (has(g)) return g; const f = all.find(d => d.group === '구글 캘린더'); if (f) return f.key; }
    if (DeviceCal.on()) { const d = DeviceCal.dest(); if (d && has('device:' + d.id)) return 'device:' + d.id; }
    return 'bashy';
  },
  remember(key) { try { localStorage.setItem(this.DEST_KEY, key); } catch (e) {} },
  // f = { title, start:Date, end:Date, allDay, description, location }
  async createEvent(key, f) {
    if (key && key.startsWith('google:')) {
      const calId = key.slice(7);
      const ev = await GoogleCalendar.createEvent(f.title, new Date(f.start).toISOString(), new Date(f.end).toISOString(), f.description || '', f.location || '', calId);
      if (!ev || !ev.id) throw new Error(ev?.error?.message || '구글 캘린더에 넣지 못했습니다');
      const cal = (GoogleCalendar._allCalendars || []).find(c => c.id === calId) || {};
      return { ...ev, _src: 'google', _calId: calId, _calColor: cal.backgroundColor, _calName: cal.summary };
    }
    if (key && key.startsWith('device:')) return DeviceCal.add(key.slice(7), f);
    return BashyCal.addEvent(f);
  },
  async deleteEvent(ev) {
    if (ev._readOnly) throw new Error('읽기 전용 캘린더입니다');
    if (ev._src === 'bashy') return BashyCal.deleteEvent(ev.id);
    if (ev._src === 'device') return DeviceCal.del(ev);
    if (ev._src === 'ics') throw new Error('구독 캘린더는 지울 수 없습니다');
    return GoogleCalendar.deleteEvent(ev.id, ev._calId || 'primary');
  },
  srcName(ev) {
    return { google: '구글 캘린더', device: '아이폰 캘린더', ics: '구독 캘린더', bashy: 'Bashy 캘린더' }[ev._src || 'google'] || '';
  },
  // 설정 갈래 목록에 적는 한 줄
  summary() {
    const on = [];
    if (this.googleOn()) on.push('구글');
    if (DeviceCal.on()) on.push('아이폰');
    const n = IcsCal.sources().length; if (n) on.push(`구독 ${n}`);
    on.push('Bashy');
    return on.join(' · ');
  },
};

// ── 할일: 목록 id 로 구글 / Bashy 를 가른다 ─────────────
const TaskStore = {
  isB(listId) { return listId === BashyCal.LIST_ID; },
  async createTask(listId, title, due = null, notes = '') { return this.isB(listId) ? BashyCal.createTask(title, due, notes) : GoogleTasks.createTask(listId, title, due, notes); },
  async updateTask(listId, taskId, c) { return this.isB(listId) ? BashyCal.updateTask(taskId, c) : GoogleTasks.updateTask(listId, taskId, c); },
  async toggleTask(listId, taskId, completed) { return this.isB(listId) ? BashyCal.toggleTask(taskId, completed) : GoogleTasks.toggleTask(listId, taskId, completed); },
  async deleteTask(listId, taskId) { return this.isB(listId) ? BashyCal.deleteTask(taskId) : GoogleTasks.deleteTask(listId, taskId); },
  async moveTask(fromListId, toListId, taskId, title, notes, due) {
    const created = await this.createTask(toListId, title, due, notes);
    await this.deleteTask(fromListId, taskId);
    return created;
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { IcsParse, _calYmd };
