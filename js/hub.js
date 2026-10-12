// js/hub.js — 태블릿 허브 (hub.html)
//
// 이 화면은 bashy 본 앱과 따로 돈다. 구글 로그인을 하지 않는다 — 태블릿 앱(WebView)에서는
// 구글이 OAuth 를 막기 때문이다. 대신 세 가지 연결을 이 기기의 localStorage 에 둔다.
//
//   연결 코드        → /api/hub 에서 AI 사용량(Claude·ChatGPT·Higgsfield)을 받는다
//   Home Assistant  → 집 안 Wi-Fi 로 직접 WebSocket. SmartThings·Tuya·샤오미를 HA 가 묶어 준다
//   OpenClaw (선택) → HA 가 못 알아들은 말을 맥미니의 ChatGPT 구독으로 보낸다
//
// 안드로이드 앱(Capacitor)으로 감싸면 음성 인식·음성 출력·앱 열기를 네이티브 플러그인으로 하고,
// 그냥 브라우저로 열면 웹 API 로 대신한다. 어느 쪽이든 같은 파일이다.

(() => {
'use strict';

const $  = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const HUB_API = 'https://bashy.app/api/hub';
const CFG_KEY = 'hub_cfg_v1';
const AREA_KEY = 'hub_area';
const LAT = 37.2848, LON = 127.0447;   // 광교

// ── 설정 ─────────────────────────────────────────
const Cfg = {
  get() { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem(CFG_KEY, JSON.stringify(v)); } catch {} },
};

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ── 네이티브(Capacitor) 연결 ──────────────────────
// 원격 페이지(bashy.app)를 감싼 앱이라 플러그인 JS 는 번들에 없다. 이름으로 프록시를 만든다.
const Native = {
  get on() { const C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform()); },
  plugin(name) {
    const C = window.Capacitor;
    if (!this.on) return null;
    return (C.Plugins && C.Plugins[name]) || (C.registerPlugin ? C.registerPlugin(name) : null);
  },
};

// ── 시계 · 날씨 ──────────────────────────────────
const Clock = {
  init() { this.tick(); setInterval(() => this.tick(), 1000 * 15); },
  tick() {
    const d = new Date();
    $('time').textContent = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    $('date').textContent = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
    const h = d.getHours();
    document.body.classList.toggle('night', !!Cfg.get().night && (h >= 23 || h < 7));
  },
};

const Weather = {
  CODES: [[0,'맑음'],[1,'대체로 맑음'],[2,'구름 조금'],[3,'흐림'],[45,'안개'],[48,'안개'],[51,'이슬비'],[53,'이슬비'],[55,'이슬비'],
          [61,'비'],[63,'비'],[65,'강한 비'],[66,'어는 비'],[67,'어는 비'],[71,'눈'],[73,'눈'],[75,'많은 눈'],[77,'싸락눈'],
          [80,'소나기'],[81,'소나기'],[82,'강한 소나기'],[85,'눈 소나기'],[86,'눈 소나기'],[95,'뇌우'],[96,'뇌우'],[99,'뇌우']],
  init() { this.load(); setInterval(() => this.load(), 30 * 60000); },
  async load() {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        '&current=temperature_2m,weather_code,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1';
      const j = await fetch(u).then(r => r.json());
      const c = j.current, d = j.daily;
      const label = (this.CODES.find(x => x[0] === c.weather_code) || [0, ''])[1];
      $('weather').innerHTML = `<b>${Math.round(c.temperature_2m)}°</b><span>${esc(label)}</span>` +
        `<span class="w-sub">${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°` +
        `${d.precipitation_probability_max[0] >= 30 ? ` · 비 ${d.precipitation_probability_max[0]}%` : ''} · 습도 ${c.relative_humidity_2m}%</span>`;
    } catch (e) { /* 날씨는 없어도 된다 */ }
  },
};

// ── AI 사용량 ────────────────────────────────────
const Usage = {
  data: null,
  SVC: [
    { k: 'claude',     name: 'Claude',     color: 'var(--claude)', c: '#e08a63', h: 'c5', d: 'c7' },
    { k: 'chatgpt',    name: 'ChatGPT',    color: 'var(--gpt)',    c: '#3fbf95', h: 'g5', d: 'g7' },
    { k: 'higgsfield', name: 'Higgsfield', color: 'var(--higgs)',  c: '#b9d84a', h: 'hf' },
  ],
  init() { this.load(); setInterval(() => { if (!document.hidden) this.load(); }, 60000); },

  async load() {
    const code = Cfg.get().code;
    if (!code) { this.render(null, '연결 코드를 넣으면 보입니다'); return; }
    try {
      const r = await fetch(HUB_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ act: 'state', code, days: 1 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      this.data = j;
      this.render(j);
    } catch (e) {
      $('usageNote').textContent = '불러오기 실패: ' + e.message;
      $('usageNote').classList.add('bad');
    }
  },

  _ago(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(m)) return '';
    return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
  },
  _until(iso) {
    const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    if (!isFinite(m)) return '';
    if (m <= 0) return '곧';
    if (m < 60) return `${m}분 뒤`;
    if (m < 1440) return `${Math.floor(m / 60)}시간 ${m % 60}분 뒤`;
    return `${Math.round(m / 1440)}일 뒤`;
  },
  _num(v) { const n = Number(v); return !isFinite(n) ? '—' : n >= 100 ? Math.round(n).toLocaleString('ko-KR') : String(Math.round(n * 10) / 10); },

  _ring(frac, color, inner) {
    const R = 32, C = 2 * Math.PI * R, f = Math.max(0, Math.min(1, frac || 0));
    return `<div class="u-ring"><svg viewBox="0 0 76 76"><circle class="trk" cx="38" cy="38" r="${R}"/>` +
      `<circle class="val" cx="38" cy="38" r="${R}" stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg>` +
      `<div class="num">${inner}</div></div>`;
  },

  render(j, note) {
    const box = $('usageCards');
    const latest = (j && j.latest) || {};
    $('usageNote').classList.remove('bad');
    $('usageNote').textContent = note || '5시간 한도 · 남은 크레딧';
    if (!j && note) {
      box.innerHTML = `<div class="u-empty">${esc(note)} — 오른쪽 아래 ⚙에서 설정합니다.</div>`;
      return;
    }
    box.innerHTML = this.SVC.map(s => {
      const v = latest[s.k];
      if (!v) return `<div class="u-card"><div class="u-name">${s.name}</div><div class="u-meta">아직 받은 값이 없습니다<br>PC 수집 확장을 확인해 주세요</div></div>`;
      const stale = Date.now() - Date.parse(v.at) > 30 * 60000;
      const age = `<br><span class="u-age${stale ? ' stale' : ''}">${this._ago(v.at)} 갱신</span>`;
      if (s.k === 'higgsfield') {
        const tot = Number(v.total) || 0, left = Number(v.credits) || 0;
        return `<div class="u-card">${this._ring(tot ? left / tot : 0, s.color, this._num(left))}
          <div class="u-name">${s.name}<span class="plan">${esc(v.plan || '')}</span></div>
          <div class="u-meta">남은 크레딧${tot ? ` / <b>${this._num(tot)}</b>` : ''}${v.ends ? `<br>구독 ${new Date(v.ends).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 갱신` : ''}${age}</div>
          <canvas class="u-spark" data-svc="${s.k}"></canvas></div>`;
      }
      const h5 = v.h5 ? Math.round(v.h5.pct) : null;
      const d7 = v.d7 ? Math.round(v.d7.pct) : null;
      const tone = h5 >= 90 ? 'var(--bad)' : h5 >= 70 ? 'var(--warn)' : s.color;
      return `<div class="u-card">${this._ring((h5 || 0) / 100, tone, h5 == null ? '—' : `${h5}<small>%</small>`)}
        <div class="u-name">${s.name}<span class="plan">${esc(v.plan || '')}</span></div>
        <div class="u-meta">${v.h5 && v.h5.reset ? `${this._until(v.h5.reset)} 초기화<br>` : ''}7일 <b>${d7 == null ? '—' : d7 + '%'}</b>${age}</div>
        <canvas class="u-spark" data-svc="${s.k}"></canvas></div>`;
    }).join('');
    requestAnimationFrame(() => this.sparks((j && j.hist) || {}));
  },

  // 최근 24시간. 실선 = 5시간 한도(또는 크레딧), 점선 = 7일 한도
  sparks(hist) {
    const keys = Object.keys(hist).sort();
    const toT = k => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10), +k.slice(10, 12));
    const t1 = Date.now(), t0 = t1 - 24 * 3600 * 1000;
    document.querySelectorAll('.u-spark').forEach(cv => {
      const s = this.SVC.find(x => x.k === cv.dataset.svc);
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = W * dpr; cv.height = H * dpr;
      const g = cv.getContext('2d'); g.scale(dpr, dpr);
      const series = f => keys.map(k => [toT(k), hist[k][f]]).filter(p => p[1] != null && p[0] >= t0);
      const main = series(s.h);
      const week = s.d ? series(s.d) : [];
      let max = 100;
      if (s.k === 'higgsfield') {
        const v = main.map(p => p[1]);
        max = Math.max(1, ...v, Number(((this.data || {}).latest || {}).higgsfield?.total) || 0);
      }
      const X = t => (t - t0) / (t1 - t0) * (W - 2) + 1;
      const Y = v => H - 3 - (v / max) * (H - 8);
      // 바닥선
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, H - 2.5); g.lineTo(W, H - 2.5); g.stroke();
      const line = (pts, dash, alpha) => {
        if (pts.length < 1) return;
        g.setLineDash(dash); g.globalAlpha = alpha; g.strokeStyle = s.c; g.lineWidth = 2; g.lineJoin = 'round';
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
        if (pts.length === 1) g.lineTo(X(t1), Y(pts[0][1]));
        g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      };
      line(week, [3, 4], 0.45);
      line(main, [], 1);
      if (!main.length && !week.length) {
        g.fillStyle = 'rgba(255,255,255,.25)'; g.font = '11px sans-serif'; g.fillText('그래프는 몇 시간 쌓이면 보입니다', 2, H / 2 + 4);
      }
    });
  },
};

// ── Home Assistant ──────────────────────────────
const HA = {
  ws: null, id: 1, pending: new Map(), states: {}, areas: {}, entArea: {}, hidden: new Set(),
  ready: false, area: localStorage.getItem(AREA_KEY) || 'all', _retry: 0,

  DOMAINS: ['light', 'switch', 'fan', 'climate', 'cover', 'input_boolean', 'humidifier', 'media_player', 'lock', 'vacuum', 'sensor', 'binary_sensor', 'scene', 'script'],

  wsUrl(u) {
    const base = String(u || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) return null;
    return base.replace(/^http/, 'ws') + '/api/websocket';
  },

  connect() {
    const c = Cfg.get();
    this.close();
    if (!c.haUrl || !c.haToken) { this.renderEmpty(); return; }
    const url = this.wsUrl(c.haUrl);
    if (!url) { this.note('주소 형식을 확인해 주세요 (http://… 로 시작)', true); return; }
    this.note('연결 중…');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.note('연결 실패: ' + e.message, true); this.retry(); return; }
    this.ws = ws;
    ws.onmessage = ev => this.onMsg(JSON.parse(ev.data));
    ws.onclose = () => { this.ready = false; if (this.ws === ws) { this.note('연결 끊김 — 다시 시도 중', true); this.retry(); } };
    ws.onerror = () => {};
  },
  close() { if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch {} } this.ready = false; },
  retry() { clearTimeout(this._rt); this._rt = setTimeout(() => this.connect(), Math.min(60000, 3000 * 2 ** this._retry++)); },
  note(t, bad) { $('haNote').textContent = t || ''; $('haNote').classList.toggle('bad', !!bad); },

  send(msg) {
    return new Promise((res, rej) => {
      if (!this.ws || this.ws.readyState !== 1) { rej(new Error('Home Assistant 에 연결되어 있지 않습니다')); return; }
      const id = this.id++;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, ...msg }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('응답 시간 초과')); } }, 15000);
    });
  },

  async onMsg(m) {
    if (m.type === 'auth_required') { this.ws.send(JSON.stringify({ type: 'auth', access_token: Cfg.get().haToken })); return; }
    if (m.type === 'auth_invalid') { this.note('토큰이 맞지 않습니다', true); this.close(); return; }
    if (m.type === 'auth_ok') { this._retry = 0; this.ready = true; this.note('연결됨'); this.bootstrap(); return; }
    if (m.type === 'event' && m.event && m.event.event_type === 'state_changed') {
      const d = m.event.data;
      if (d.new_state) this.states[d.entity_id] = d.new_state; else delete this.states[d.entity_id];
      this.schedule(); return;
    }
    if (m.type === 'result' && this.pending.has(m.id)) {
      const p = this.pending.get(m.id); this.pending.delete(m.id);
      m.success ? p.res(m.result) : p.rej(new Error((m.error && m.error.message) || '실패'));
    }
  },

  async bootstrap() {
    try {
      const [states, areas, ents, devs] = await Promise.all([
        this.send({ type: 'get_states' }),
        this.send({ type: 'config/area_registry/list' }).catch(() => []),
        this.send({ type: 'config/entity_registry/list' }).catch(() => []),
        this.send({ type: 'config/device_registry/list' }).catch(() => []),
      ]);
      this.states = Object.fromEntries(states.map(s => [s.entity_id, s]));
      this.areas = Object.fromEntries(areas.map(a => [a.area_id, a.name]));
      const devArea = Object.fromEntries(devs.map(d => [d.id, d.area_id]));
      this.entArea = {}; this.hidden = new Set();
      for (const e of ents) {
        const a = e.area_id || devArea[e.device_id];
        if (a) this.entArea[e.entity_id] = a;
        if (e.hidden_by || e.disabled_by || e.entity_category) this.hidden.add(e.entity_id);
      }
      await this.send({ type: 'subscribe_events', event_type: 'state_changed' });
      this.render();
    } catch (e) { this.note('불러오기 실패: ' + e.message, true); }
  },

  schedule() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); },

  name(s) {
    let n = (s.attributes && s.attributes.friendly_name) || s.entity_id;
    const a = this.areas[this.entArea[s.entity_id]];
    if (a && n.startsWith(a + ' ')) n = n.slice(a.length + 1);   // '거실 거실등' 같은 겹침을 줄인다
    return n;
  },

  // 화면에 올릴 것: 조작할 수 있는 것 + 온도·습도 센서. 나머지(배터리·신호세기 등)는 뺀다.
  visible() {
    const out = [];
    for (const s of Object.values(this.states)) {
      const [dom] = s.entity_id.split('.');
      if (!this.DOMAINS.includes(dom) || this.hidden.has(s.entity_id)) continue;
      if (dom === 'sensor' && !['temperature', 'humidity', 'pm25', 'carbon_dioxide'].includes(s.attributes.device_class)) continue;
      if (dom === 'binary_sensor' && !['door', 'window', 'opening', 'motion', 'occupancy'].includes(s.attributes.device_class)) continue;
      out.push(s);
    }
    return out;
  },

  isOn(s) { return ['on', 'open', 'opening', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'playing', 'unlocked', 'cleaning'].includes(s.state); },

  icon(s) {
    const dom = s.entity_id.split('.')[0], dc = s.attributes.device_class;
    const P = {
      light:   '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
      switch:  '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M12 7v4"/>',
      outlet:  '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9.5 9v2M14.5 9v2M10 15h4"/>',
      fan:     '<circle cx="12" cy="12" r="1.5"/><path d="M12 10.5C12 6 13 3 15.5 3S19 6 12 10.5ZM13.5 12c4.5 0 7.5 1 7.5 3.5S18 19 13.5 12ZM12 13.5c0 4.5-1 7.5-3.5 7.5S5 18 12 13.5ZM10.5 12C6 12 3 11 3 8.5S6 5 10.5 12Z"/>',
      climate: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/><path d="M12 11v6"/>',
      cover:   '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 8h16M4 13h16"/>',
      media:   '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
      lock:    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      vacuum:  '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/>',
      temp:    '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/>',
      drop:    '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
      door:    '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16"/><path d="M14 12h.01"/>',
      motion:  '<circle cx="12" cy="5" r="2"/><path d="m10 22 2-8 3 3v5M8 10l3-2 3 2 2 3"/>',
      toggle:  '<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>',
    };
    let k = { light: 'light', fan: 'fan', climate: 'climate', cover: 'cover', media_player: 'media', lock: 'lock', vacuum: 'vacuum', humidifier: 'drop', input_boolean: 'toggle' }[dom] || 'switch';
    if (dom === 'switch' && dc === 'outlet') k = 'outlet';
    if (dom === 'sensor') k = dc === 'humidity' ? 'drop' : 'temp';
    if (dom === 'binary_sensor') k = ['motion', 'occupancy'].includes(dc) ? 'motion' : 'door';
    return `<svg class="t-ic" viewBox="0 0 24 24">${P[k]}</svg>`;
  },

  stateText(s) {
    const dom = s.entity_id.split('.')[0], a = s.attributes;
    if (s.state === 'unavailable') return '연결 안 됨';
    if (dom === 'sensor') return `${s.state}${a.unit_of_measurement || ''}`;
    if (dom === 'binary_sensor') return s.state === 'on' ? (['motion', 'occupancy'].includes(a.device_class) ? '감지됨' : '열림') : (['motion', 'occupancy'].includes(a.device_class) ? '없음' : '닫힘');
    if (dom === 'climate') {
      const MODES = { off: '꺼짐', heat: '난방', cool: '냉방', heat_cool: '자동', auto: '자동', dry: '제습', fan_only: '송풍' };
      return `${a.current_temperature != null ? `현재 ${a.current_temperature}° · ` : ''}${MODES[s.state] || s.state}${a.temperature != null && s.state !== 'off' ? ` ${a.temperature}°` : ''}`;
    }
    if (dom === 'light' && s.state === 'on' && a.brightness != null) return `켜짐 · ${Math.round(a.brightness / 2.55)}%`;
    if (dom === 'cover') return { open: '열림', closed: '닫힘', opening: '여는 중', closing: '닫는 중' }[s.state] || s.state;
    if (dom === 'media_player') return { playing: '재생 중', paused: '일시정지', idle: '대기', off: '꺼짐', on: '켜짐' }[s.state] || s.state;
    if (dom === 'lock') return s.state === 'locked' ? '잠김' : '열림';
    if (dom === 'vacuum') return { cleaning: '청소 중', docked: '충전 중', returning: '복귀 중', idle: '대기' }[s.state] || s.state;
    return s.state === 'on' ? '켜짐' : s.state === 'off' ? '꺼짐' : s.state;
  },

  renderEmpty() {
    $('areas').innerHTML = ''; $('scenes').innerHTML = '';
    this.note('');
    $('tiles').innerHTML = `<div class="empty-home">
      <b>Home Assistant 를 연결하면</b> SmartThings · Smart Life(Tuya) · 샤오미 기기를 여기서 함께 켜고 끌 수 있습니다.<br>
      음성으로 "거실 불 꺼 줘" 같은 명령도 Home Assistant 가 알아듣습니다.<br>
      <button class="chip" onclick="document.getElementById('gear').click()">설정 열기</button></div>`;
  },

  // 왼쪽 날씨 아래 '실내' 한 줄. 거실(또는 첫 공간)의 온도·습도 센서.
  indoor(all) {
    const pick = dc => {
      const c = all.filter(s => s.entity_id.startsWith('sensor.') && s.attributes.device_class === dc && isFinite(parseFloat(s.state)));
      const living = c.find(s => /거실|living/i.test(this.areas[this.entArea[s.entity_id]] || ''));
      return living || c[0];
    };
    const t = pick('temperature'), h = pick('humidity');
    $('indoor').innerHTML = t || h
      ? `<span class="w-sub">실내</span>${t ? `<b>${esc(Math.round(parseFloat(t.state) * 10) / 10)}°</b>` : ''}${h ? `<span>습도 ${esc(Math.round(parseFloat(h.state)))}%</span>` : ''}`
      : '';
  },

  render() {
    if (!this.ready) return;
    const all = this.visible();
    this.indoor(all);
    const used = [...new Set(all.map(s => this.entArea[s.entity_id]).filter(Boolean))]
      .sort((a, b) => String(this.areas[a]).localeCompare(String(this.areas[b]), 'ko'));
    if (this.area !== 'all' && !used.includes(this.area)) this.area = 'all';
    $('areas').innerHTML = [`<button class="chip${this.area === 'all' ? ' sel' : ''}" data-area="all">전체</button>`]
      .concat(used.map(a => `<button class="chip${this.area === a ? ' sel' : ''}" data-area="${esc(a)}">${esc(this.areas[a] || a)}</button>`)).join('');

    const inArea = s => this.area === 'all' || this.entArea[s.entity_id] === this.area;
    const scenes = all.filter(s => /^(scene|script)\./.test(s.entity_id) && inArea(s));
    $('scenes').innerHTML = scenes.map(s => `<button class="chip" data-run="${esc(s.entity_id)}">${esc(this.name(s))}</button>`).join('');

    const rank = s => {
      const d = s.entity_id.split('.')[0];
      return ['light', 'switch', 'fan', 'climate', 'cover', 'input_boolean', 'humidifier', 'media_player', 'lock', 'vacuum', 'binary_sensor', 'sensor'].indexOf(d);
    };
    const tiles = all.filter(s => !/^(scene|script)\./.test(s.entity_id) && inArea(s))
      .sort((a, b) => rank(a) - rank(b) || this.name(a).localeCompare(this.name(b), 'ko'));

    if (!tiles.length && !scenes.length) {
      $('tiles').innerHTML = `<div class="empty-home">이 공간에 표시할 기기가 없습니다.</div>`;
      return;
    }
    $('tiles').innerHTML = tiles.map(s => this.tile(s)).join('');
  },

  tile(s) {
    const dom = s.entity_id.split('.')[0];
    const ro = dom === 'sensor' || dom === 'binary_sensor';
    const cls = ['tile', dom, this.isOn(s) && !ro ? 'on' : '', s.state === 'unavailable' ? 'off-line' : '', ro ? 'ro' : ''].filter(Boolean).join(' ');
    const id = esc(s.entity_id);
    if (dom === 'climate') {
      return `<div class="${cls}" data-id="${id}" data-tap="toggle">${this.icon(s)}
        <div class="t-name">${esc(this.name(s))}</div><div class="t-state">${esc(this.stateText(s))}</div>
        <div class="t-ctl"><button data-temp="-1" aria-label="낮추기">−</button><button data-temp="1" aria-label="높이기">+</button></div></div>`;
    }
    return `<button class="${cls}" data-id="${id}"${ro ? ' disabled' : ''}>${this.icon(s)}
      <span class="t-name">${esc(this.name(s))}</span><span class="t-state">${esc(this.stateText(s))}</span></button>`;
  },

  async toggle(id) {
    const s = this.states[id];
    if (!s || s.state === 'unavailable') return;
    const dom = id.split('.')[0];
    let domain = dom, service = 'toggle', data = { entity_id: id };
    if (dom === 'climate') { domain = 'climate'; service = s.state === 'off' ? 'turn_on' : 'turn_off'; }
    if (dom === 'lock') service = s.state === 'locked' ? 'unlock' : 'lock';
    if (dom === 'vacuum') service = s.state === 'cleaning' ? 'return_to_base' : 'start';
    if (dom === 'media_player') service = 'media_play_pause';
    if (dom === 'lock' && service === 'unlock') { toast('문 잠금 해제는 여기서 하지 않습니다'); return; }
    const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add('pending');
    try { await this.send({ type: 'call_service', domain, service, service_data: data }); }
    catch (e) { toast('실패: ' + e.message); if (el) el.classList.remove('pending'); }
  },

  async temp(id, delta) {
    const s = this.states[id];
    if (!s) return;
    const cur = Number(s.attributes.temperature);
    if (!isFinite(cur)) { toast('희망 온도를 바꿀 수 없는 기기입니다'); return; }
    const step = Number(s.attributes.target_temp_step) || 0.5;
    try { await this.send({ type: 'call_service', domain: 'climate', service: 'set_temperature', service_data: { entity_id: id, temperature: cur + delta * step } }); }
    catch (e) { toast('실패: ' + e.message); }
  },

  async run(id) {
    const [dom] = id.split('.');
    try { await this.send({ type: 'call_service', domain: dom, service: 'turn_on', service_data: { entity_id: id } }); toast('실행했습니다'); }
    catch (e) { toast('실패: ' + e.message); }
  },

  // 말 한 줄을 HA 에 맡긴다. 못 알아들었으면 null.
  async converse(text) {
    if (!this.ready) return null;
    const r = await this.send({ type: 'conversation/process', text, language: 'ko', conversation_id: this._conv || undefined });
    this._conv = r.conversation_id;
    const resp = r.response || {};
    const speech = resp.speech && resp.speech.plain && resp.speech.plain.speech;
    if (resp.response_type === 'error' && ['no_intent_match', 'no_valid_targets'].includes(resp.data && resp.data.code)) return this.converseAI(text);
    return speech || '알겠습니다.';
  },

  // 기기 명령이 아닌 말 → HA 에 등록된 AI 대화 에이전트(예: 맥미니 OpenClaw)에게 넘긴다.
  // HA 가 https 로 열려 있으니 밖(LTE)에서도 이 길로 간다. 에이전트가 없으면 null.
  async converseAI(text) {
    const agent = Object.keys(this.states).find(id => id.startsWith('conversation.') && id !== 'conversation.home_assistant');
    if (!agent) return null;
    const r = await this.send({ type: 'conversation/process', text, language: 'ko', agent_id: agent, conversation_id: this._aiConv || undefined });
    this._aiConv = r.conversation_id;
    const resp = r.response || {};
    const speech = resp.speech && resp.speech.plain && resp.speech.plain.speech;
    if (resp.response_type === 'error' || !speech) return null;
    return speech;
  },

  bind() {
    $('areas').addEventListener('click', e => {
      const b = e.target.closest('[data-area]'); if (!b) return;
      this.area = b.dataset.area; try { localStorage.setItem(AREA_KEY, this.area); } catch {}
      this.render();
    });
    $('scenes').addEventListener('click', e => { const b = e.target.closest('[data-run]'); if (b) this.run(b.dataset.run); });
    $('tiles').addEventListener('click', e => {
      const t = e.target.closest('[data-temp]');
      const tile = e.target.closest('[data-id]');
      if (!tile) return;
      if (t) { this.temp(tile.dataset.id, Number(t.dataset.temp)); return; }
      this.toggle(tile.dataset.id);
    });
  },
};

// ── 음성 ─────────────────────────────────────────
const Voice = {
  busy: false, history: [],

  init() {
    $('mic').addEventListener('click', () => this.listen());
    document.querySelectorAll('[data-app]').forEach(b => b.addEventListener('click', () => this.openApp(b.dataset.app)));
  },

  set(state) {
    $('mic').classList.toggle('listening', state === 'listen');
    $('mic').classList.toggle('busy', state === 'busy');
  },

  async listen() {
    if (this.busy) { this.stopListening(); return; }
    this.busy = true; this.set('listen');
    $('vHeard').textContent = ''; $('vReply').textContent = '';
    try {
      const text = await this.recognize();
      if (!text) { $('vReply').textContent = '잘 못 들었습니다. 다시 눌러 말씀해 주세요.'; return; }
      $('vHeard').textContent = text;
      this.set('busy');
      const reply = await this.handle(text);
      if (reply) { $('vReply').textContent = reply; this.speak(reply); }
    } catch (e) {
      $('vReply').textContent = e.message || String(e);
    } finally {
      this.busy = false; this.set('');
    }
  },

  stopListening() {
    const SR = Native.plugin('SpeechRecognition');
    if (SR) SR.stop().catch(() => {});
    if (this._web) try { this._web.stop(); } catch {}
  },

  async recognize() {
    const SR = Native.plugin('SpeechRecognition');
    if (SR) {
      const perm = await SR.requestPermissions().catch(() => null);
      if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') throw new Error('마이크 권한이 필요합니다');
      const r = await SR.start({ language: 'ko-KR', maxResults: 1, partialResults: false, popup: false });
      return ((r && r.matches) || [])[0] || '';
    }
    const W = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!W) throw new Error('이 브라우저는 음성 인식을 지원하지 않습니다 (태블릿 앱에서는 됩니다)');
    return new Promise((res, rej) => {
      const r = new W(); this._web = r;
      r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1;
      let got = '';
      r.onresult = e => { got = e.results[0][0].transcript; };
      r.onerror = e => (e.error === 'no-speech' ? res('') : rej(new Error('음성 인식 오류: ' + e.error)));
      r.onend = () => res(got);
      r.start();
    });
  },

  speak(text) {
    const clean = String(text).replace(/[*#`_>]/g, '').slice(0, 600);
    const TTS = Native.plugin('TextToSpeech');
    if (TTS) { TTS.speak({ text: clean, lang: 'ko-KR', rate: 1.0 }).catch(() => {}); return; }
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(clean); u.lang = 'ko-KR';
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    }
  },

  // 1) 앱 열기 말 → 바로 연다  2) Home Assistant  3) OpenClaw(ChatGPT 구독)  4) 안내
  async handle(text) {
    const t = text.replace(/\s+/g, '');
    if (/(챗지피티|chatgpt|지피티)/i.test(t) && /(열어|켜|실행)/.test(t)) { this.openApp('chatgpt'); return 'ChatGPT 를 엽니다.'; }
    if (/(클로드|claude)/i.test(t) && /(열어|켜|실행)/.test(t)) { this.openApp('claude'); return 'Claude 를 엽니다.'; }

    try {
      const r = await HA.converse(text);
      if (r) return r;
    } catch (e) { console.warn('[hub] HA converse', e); }

    const c = Cfg.get();
    if (c.aiUrl) return this.askAI(text, c);
    return HA.ready
      ? '집 기기 명령으로는 알아듣지 못했습니다. 일반 질문은 ChatGPT 앱에서 물어봐 주세요.'
      : '아직 연결된 곳이 없습니다. ⚙ 설정에서 Home Assistant 나 OpenClaw 를 연결해 주세요.';
  },

  async askAI(text, c) {
    this.history.push({ role: 'user', content: text });
    this.history = this.history.slice(-8);
    const r = await fetch(c.aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(c.aiToken ? { Authorization: 'Bearer ' + c.aiToken } : {}) },
      body: JSON.stringify({
        model: c.aiModel || 'openclaw',
        messages: [{ role: 'system', content: '너는 집 거실 태블릿의 음성 비서다. 답은 소리 내어 읽히므로 한국어로 두세 문장 안에, 목록·기호 없이 말하듯 답한다.' }, ...this.history],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('AI 응답 실패: ' + ((j.error && (j.error.message || j.error)) || r.status));
    const out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!out) throw new Error('AI 응답이 비어 있습니다');
    this.history.push({ role: 'assistant', content: out });
    return out;
  },

  async openApp(which) {
    const PKG = { chatgpt: 'com.openai.chatgpt', claude: 'com.anthropic.claude' };
    const WEB = { chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new' };
    const L = Native.plugin('AppLauncher');
    if (L) {
      try { await L.openUrl({ url: PKG[which] }); return; }
      catch (e) { toast('앱이 설치되어 있지 않습니다 — Play 스토어에서 설치해 주세요'); return; }
    }
    window.open(WEB[which], '_blank', 'noopener');
  },
};

// ── 설정 창 ──────────────────────────────────────
const Settings = {
  init() {
    $('gear').addEventListener('click', () => this.open());
    const dlg = $('settings');
    dlg.addEventListener('close', () => { if (dlg.returnValue === 'save') this.save(); });
    $('setTest').addEventListener('click', () => this.test());
  },
  open() {
    const c = Cfg.get(), f = $('setForm');
    for (const k of ['code', 'haUrl', 'haToken', 'aiUrl', 'aiToken', 'aiModel']) f.elements[k].value = c[k] || '';
    f.elements.night.checked = !!c.night;
    $('setStatus').textContent = '';
    $('settings').showModal();
  },
  read() {
    const f = $('setForm'), v = {};
    for (const k of ['code', 'haUrl', 'haToken', 'aiUrl', 'aiToken', 'aiModel']) v[k] = f.elements[k].value.trim();
    v.night = f.elements.night.checked;
    return v;
  },
  save() {
    const prev = Cfg.get(), v = this.read();
    Cfg.set(v);
    if (v.code !== prev.code) Usage.load();
    if (v.haUrl !== prev.haUrl || v.haToken !== prev.haToken) { HA._retry = 0; HA.connect(); }
    Clock.tick();
    toast('저장했습니다');
  },
  async test() {
    const v = this.read(), out = [];
    $('setStatus').textContent = '확인 중…';
    if (v.code) {
      try {
        const r = await fetch(HUB_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'ping', code: v.code }) });
        const j = await r.json().catch(() => ({}));
        out.push(r.ok ? '✓ 연결 코드' : '✗ 연결 코드: ' + (j.error || r.status));
      } catch (e) { out.push('✗ 연결 코드: ' + e.message); }
    }
    if (v.haUrl) out.push(await this.testHA(v));
    if (v.aiUrl) {
      try {
        const r = await fetch(v.aiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(v.aiToken ? { Authorization: 'Bearer ' + v.aiToken } : {}) },
          body: JSON.stringify({ model: v.aiModel || 'openclaw', messages: [{ role: 'user', content: '한 단어로: 안녕' }] }) });
        out.push(r.ok ? '✓ 음성 AI' : '✗ 음성 AI: HTTP ' + r.status);
      } catch (e) { out.push('✗ 음성 AI: ' + e.message + (location.protocol === 'https:' && v.aiUrl.startsWith('http:') ? ' (브라우저에서는 http 주소가 막힙니다 — 태블릿 앱에서 확인해 주세요)' : '')); }
    }
    $('setStatus').textContent = out.join('\n') || '확인할 항목이 없습니다';
  },
  testHA(v) {
    return new Promise(res => {
      const url = HA.wsUrl(v.haUrl);
      if (!url) { res('✗ Home Assistant: 주소는 http:// 또는 https:// 로 시작해야 합니다'); return; }
      let ws, done = false, ver = '';
      const fin = m => { if (done) return; done = true; try { ws.close(); } catch {} res(m); };
      try { ws = new WebSocket(url); } catch (e) { fin('✗ Home Assistant: ' + e.message); return; }
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: v.haToken }));
        else if (m.type === 'auth_ok') { ver = m.ha_version || ''; ws.send(JSON.stringify({ id: 1, type: 'get_states' })); }
        else if (m.id === 1 && m.type === 'result') {
          const ag = (m.result || []).map(s => s.entity_id).filter(id => id.startsWith('conversation.') && id !== 'conversation.home_assistant');
          fin('✓ Home Assistant ' + ver + (ag.length ? '\n✓ 음성 AI: Home Assistant 경유 (' + ag[0] + ') — 아래 OpenClaw 칸은 비워 두셔도 됩니다' : '\n· 음성 AI: Home Assistant 에 AI 대화 연동이 없습니다'));
        }
        else if (m.type === 'auth_invalid') fin('✗ Home Assistant: 토큰이 맞지 않습니다');
      };
      ws.onerror = () => fin('✗ Home Assistant: 접속할 수 없습니다' + (location.protocol === 'https:' && url.startsWith('ws:') ? ' (브라우저에서는 http 주소가 막힙니다 — 태블릿 앱에서 확인해 주세요)' : ''));
      setTimeout(() => fin('✗ Home Assistant: 응답 시간 초과'), 8000);
    });
  },
};

// ── 앱(네이티브)일 때만 하는 일 ─────────────────────
function nativeSetup() {
  if (!Native.on) return;
  const KA = Native.plugin('KeepAwake');
  if (KA) KA.keepAwake().catch(() => {});
  const SB = Native.plugin('StatusBar');
  if (SB) SB.hide().catch(() => {});
}

function boot() {
  Clock.init(); Weather.init(); Usage.init();
  HA.bind(); HA.connect();
  Voice.init(); Settings.init();
  nativeSetup();
  window.addEventListener('resize', () => { if (Usage.data) Usage.sparks(Usage.data.hist || {}); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { Usage.load(); if (!HA.ready && Cfg.get().haUrl) { HA._retry = 0; HA.connect(); } }
  });
  if (!Cfg.get().code && !Cfg.get().haUrl) setTimeout(() => Settings.open(), 600);
}

window.Hub = { HA, Usage, Voice, Cfg };   // 디버깅용
boot();
})();
