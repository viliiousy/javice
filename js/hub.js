// js/hub.js — 태블릿 허브 (hub.html)
//
// 이 화면은 bashy 본 앱과 따로 돈다. 구글 로그인을 하지 않는다 — 태블릿 앱(WebView)에서는
// 구글이 OAuth 를 막기 때문이다. 대신 세 가지 연결을 이 기기의 localStorage 에 둔다.
//
//   연결 코드        → /api/hub 에서 AI 사용량과 구글 할일을 받는다
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
const CFG_KEY  = 'hub_cfg_v1';
const AREA_KEY = 'hub_area';
const DEV_KEY  = 'hub_dev_v1';      // 기기별 { hide, icon, name } — 이 태블릿에만 둔다
const SNAP_KEY = 'hub_ha_snap_v1';  // 마지막으로 받은 기기 목록. HA 가 잠깐 끊겨도 타일이 사라지지 않게.
const LAT = 37.2848, LON = 127.0447;   // 광교

// ── 설정 ─────────────────────────────────────────
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const Cfg = { get: () => store.get(CFG_KEY, {}), set: v => store.set(CFG_KEY, v) };

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

async function hubCall(body) {
  const code = Cfg.get().code;
  if (!code) throw new Error('연결 코드가 없습니다');
  const r = await fetch(HUB_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ── 네이티브(Capacitor) 연결 ──────────────────────
// 원격 페이지(bashy.app)를 감싼 앱이라 플러그인 JS 는 번들에 없다. 이름으로 프록시를 만든다.
const Native = {
  get on() { const C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform()); },
  plugin(name) {
    const C = window.Capacitor;
    if (!this.on) return null;
    // 이 앱에 없는 플러그인은 null — Bashy 앱 안에서 허브를 열면 태블릿 앱 전용(JarvisListener 등)이 없다
    if (C.isPluginAvailable && !C.isPluginAvailable(name)) return null;
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
  // [코드, 이름, 아이콘]
  CODES: [[0,'맑음','sun'],[1,'대체로 맑음','sun'],[2,'구름 조금','part'],[3,'흐림','cloud'],[45,'안개','fog'],[48,'안개','fog'],
          [51,'이슬비','rain'],[53,'이슬비','rain'],[55,'이슬비','rain'],[61,'비','rain'],[63,'비','rain'],[65,'강한 비','rain'],
          [66,'어는 비','rain'],[67,'어는 비','rain'],[71,'눈','snow'],[73,'눈','snow'],[75,'많은 눈','snow'],[77,'싸락눈','snow'],
          [80,'소나기','rain'],[81,'소나기','rain'],[82,'강한 소나기','rain'],[85,'눈 소나기','snow'],[86,'눈 소나기','snow'],
          [95,'뇌우','storm'],[96,'뇌우','storm'],[99,'뇌우','storm']],
  ICON: {
    sun:   '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon:  '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    part:  '<path d="M8 3.5v1.2M3.5 8h1.2M4.8 4.8l.9.9M11.2 4.8l-.9.9"/><path d="M5.6 10.5a3 3 0 0 1 5.2-3"/><path d="M17 20a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 20Z"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 11.3 3.5 3.5 0 0 0 6.5 19Z"/>',
    fog:   '<path d="M17.5 14a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 6.3"/><path d="M3 14h13M5 18h14M3 22h10"/>',
    rain:  '<path d="M17.5 15a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 7.3 3.5 3.5 0 0 0 6.5 15Z"/><path d="m8 18-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow:  '<path d="M17.5 15a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 7.3 3.5 3.5 0 0 0 6.5 15Z"/><path d="M8 19h.01M12 18h.01M16 19h.01M10 21.5h.01M14 21.5h.01"/>',
    storm: '<path d="M17.5 15a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 7.3 3.5 3.5 0 0 0 6.5 15Z"/><path d="m13 14-3 4h4l-3 4"/>',
  },
  init() { this.load(); setInterval(() => this.load(), 30 * 60000); },
  async load() {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        '&current=temperature_2m,weather_code,relative_humidity_2m,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1';
      const j = await fetch(u).then(r => r.json());
      const c = j.current, d = j.daily;
      const [, label, ic0] = this.CODES.find(x => x[0] === c.weather_code) || [0, '', 'cloud'];
      const ic = ic0 === 'sun' && !c.is_day ? 'moon' : ic0;
      $('weather').title = label;
      $('weather').innerHTML = `<svg class="w-ic w-${ic}" viewBox="0 0 24 24" aria-label="${esc(label)}">${this.ICON[ic]}</svg>` +
        `<b>${Math.round(c.temperature_2m)}°</b>` +
        `<span class="w-sub">${Math.round(d.temperature_2m_min[0])}°/${Math.round(d.temperature_2m_max[0])}°` +
        `${d.precipitation_probability_max[0] >= 30 ? ` · 비 ${d.precipitation_probability_max[0]}%` : ''}</span>`;
    } catch (e) { /* 날씨는 없어도 된다 */ }
  },
};

// ── AI 사용량 ────────────────────────────────────
// 원은 '남은 양'이다. 5시간 한도는 남은 %, Higgsfield 는 남은 크레딧.
// 그 아래 선 그래프는 최근 24시간 동안 그 남은 양이 어떻게 움직였는지,
// 맨 아래 막대는 7일 한도(Higgsfield 는 이번 구독 기간 크레딧)의 남은 양이다.
const Usage = {
  data: null,
  SVC: [
    { k: 'claude',     name: 'Claude',     color: 'var(--claude)', c: '#e08a63', h: 'c5' },
    { k: 'chatgpt',    name: 'ChatGPT',    color: 'var(--gpt)',    c: '#3fbf95', h: 'g5' },
    { k: 'higgsfield', name: 'Higgsfield', color: 'var(--higgs)',  c: '#b9d84a', h: 'hf' },
  ],
  init() { this.load(); setInterval(() => { if (!document.hidden) this.load(); }, 60000); },

  async load() {
    if (!Cfg.get().code) { this.render(null, '설정에서 bashy 계정을 연결하면 보입니다'); return; }
    try {
      const j = await hubCall({ act: 'state', days: 1 });
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
    const d = new Date(iso), w = '일월화수목금토'[d.getDay()];
    const at = `${d.getMonth() + 1}/${d.getDate()}(${w}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간 뒤(${at})`;
  },
  _num(v) { const n = Number(v); return !isFinite(n) ? '—' : n >= 100 ? Math.round(n).toLocaleString('ko-KR') : String(Math.round(n * 10) / 10); },
  _left(w) { return w && w.pct != null ? Math.max(0, Math.min(100, Math.round(100 - w.pct))) : null; },
  _tone(left, base) { return left == null ? base : left <= 10 ? 'var(--bad)' : left <= 30 ? 'var(--warn)' : base; },

  _ring(frac, color, inner) {
    const R = 32, C = 2 * Math.PI * R, f = Math.max(0, Math.min(1, frac || 0));
    return `<div class="u-ring"><svg viewBox="0 0 76 76"><circle class="trk" cx="38" cy="38" r="${R}"/>` +
      `<circle class="val" cx="38" cy="38" r="${R}" stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg>` +
      `<div class="num">${inner}</div></div>`;
  },

  _bar(label, frac, value, sub, color) {
    const f = Math.max(0, Math.min(1, frac || 0));
    return `<div class="u-week">
      <div class="u-week-top"><span>${label}</span><b>${value}</b></div>
      <div class="u-week-trk"><div class="u-week-fill" style="width:${f * 100}%;background:${color}"></div></div>
      ${sub ? `<div class="u-week-sub">${sub}</div>` : ''}</div>`;
  },

  render(j, note) {
    const box = $('usageCards');
    const latest = (j && j.latest) || {};
    $('usageNote').classList.remove('bad');
    $('usageNote').textContent = note || '남은 양 · 선 그래프는 최근 24시간';
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
        const frac = tot ? left / tot : 0;
        const tone = tot && frac <= 0.1 ? 'var(--bad)' : s.color;
        return `<div class="u-card">${this._ring(frac, tone, this._num(left))}
          <div class="u-name">${s.name}<span class="plan">${esc(v.plan || '')}</span></div>
          <div class="u-meta">남은 크레딧${tot ? ` / <b>${this._num(tot)}</b>` : ''}${age}</div>
          <canvas class="u-spark" data-svc="${s.k}"></canvas>
          ${this._bar('이번 구독 기간', frac, `${tot ? Math.round(frac * 100) : '—'}% 남음`,
            v.ends ? `${new Date(v.ends).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 갱신` : '', tone)}</div>`;
      }
      const h5 = this._left(v.h5), d7 = this._left(v.d7);
      return `<div class="u-card">${this._ring((h5 || 0) / 100, this._tone(h5, s.color), h5 == null ? '—' : `${h5}<small>%</small>`)}
        <div class="u-name">${s.name}<span class="plan">${esc(v.plan || '')}</span></div>
        <div class="u-meta">5시간 한도 남음${v.h5 && v.h5.reset ? `<br>${this._until(v.h5.reset)} 초기화` : ''}${age}</div>
        <canvas class="u-spark" data-svc="${s.k}"></canvas>
        ${this._bar('7일 한도', (d7 || 0) / 100, d7 == null ? '—' : `${d7}% 남음`,
          v.d7 && v.d7.reset ? `${this._until(v.d7.reset)} 초기화` : '', this._tone(d7, s.color))}</div>`;
    }).join('');
    requestAnimationFrame(() => this.sparks((j && j.hist) || {}));
  },

  // 최근 24시간의 '남은 양' (5시간 한도 남은 % · 남은 크레딧)
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
      const hf = s.k === 'higgsfield';
      const pts = keys.map(k => [toT(k), hist[k][s.h]]).filter(p => p[1] != null && p[0] >= t0)
        .map(p => [p[0], hf ? p[1] : 100 - p[1]]);
      let max = 100;
      if (hf) max = Math.max(1, ...pts.map(p => p[1]), Number((((this.data || {}).latest || {}).higgsfield || {}).total) || 0);
      const X = t => (t - t0) / (t1 - t0) * (W - 2) + 1;
      const Y = v => H - 3 - (v / max) * (H - 8);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, H - 2.5); g.lineTo(W, H - 2.5); g.stroke();
      if (!pts.length) {
        g.fillStyle = 'rgba(255,255,255,.25)'; g.font = '11px sans-serif'; g.fillText('그래프는 몇 시간 쌓이면 보입니다', 2, H / 2 + 4);
        return;
      }
      // 아래를 옅게 채워 '얼마나 남았나' 가 면적으로 보이게
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, s.c + '40'); grad.addColorStop(1, s.c + '00');
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      const lastX = pts.length === 1 ? X(t1) : X(pts[pts.length - 1][0]);
      if (pts.length === 1) g.lineTo(lastX, Y(pts[0][1]));
      g.strokeStyle = s.c; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
      g.lineTo(lastX, H - 2.5); g.lineTo(X(pts[0][0]), H - 2.5); g.closePath();
      g.fillStyle = grad; g.fill();
    });
  },
};

// ── 구글 할일 ────────────────────────────────────
// 서버(bashy)가 갖고 있는 구글 권한으로 읽기만 한다. 목록(카테고리)별로 고를 수 있고,
// 앱을 열 때마다 '전체' 로 시작한다.
const Tasks = {
  data: null, sel: 'all', done: new Set(),
  init() {
    // bashy.app 과 같은 구글 할일을 1분마다 다시 받는다(사이트에서 고친 것이 곧 보이게).
    this.load(); setInterval(() => { if (!document.hidden) this.load(); }, 60000);
    $('taskTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-list]'); if (!b) return;
      this.sel = b.dataset.list; this.render();
    });
    $('taskList').addEventListener('click', e => {
      const c = e.target.closest('[data-done]'); if (c) this.check(c.dataset.done, c.dataset.l);
    });
  },
  async load() {
    if (!Cfg.get().code) { this.note('설정에서 bashy 계정을 연결하면 보입니다'); return; }
    try {
      const j = await hubCall({ act: 'tasks' });
      if (j.needConsent) { this.note(j.reason || '구글 할일 권한이 필요합니다'); return; }
      this.data = j; this.done.clear(); this.render();
    } catch (e) { if (!this.data) this.note('불러오기 실패: ' + e.message); }
  },
  note(t) { $('taskTabs').innerHTML = ''; $('taskList').innerHTML = `<li class="tk-empty">${esc(t)}</li>`; $('taskCount').textContent = ''; },

  // 동그라미를 누르면 완료. 2.5초 안에 한 번 더 누르면 되돌린다.
  async check(id, list) {
    const undo = this.done.has(id);
    undo ? this.done.delete(id) : this.done.add(id);
    this.render();
    try {
      const j = await hubCall({ act: 'taskDone', id, list, undo });
      if (j.needConsent) throw new Error(j.reason || '구글 권한이 필요합니다');
      if (!undo) {
        toast('완료했습니다 — 다시 누르면 되돌립니다');
        clearTimeout(this._gone); this._gone = setTimeout(() => this.load(), 2500);
      }
    } catch (e) { undo ? this.done.add(id) : this.done.delete(id); this.render(); toast('실패: ' + e.message); }
  },

  _day(d) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(d + 'T00:00:00') - t) / 86400000); },
  _due(d) {
    if (!d) return null;
    const n = this._day(d), dt = new Date(d + 'T00:00:00');
    if (n < 0) return { t: `${-n}일 지남`, cls: 'late' };
    if (n === 0) return { t: '오늘', cls: 'today' };
    if (n === 1) return { t: '내일', cls: '' };
    if (n < 7) return { t: dt.toLocaleDateString('ko-KR', { weekday: 'short' }), cls: '' };
    return { t: `${dt.getMonth() + 1}/${dt.getDate()}`, cls: '' };
  },

  // bashy.app 할일 화면과 같은 규칙: 숨긴 할일은 빼고(서버가 이미 뺌), '지난 할일 보기'를 꺼 두었으면
  // 기한 지난 것도 접고, 날짜순으로. 별표와 목록 색도 사이트에서 정한 그대로.
  render() {
    const { lists = [], tasks = [], showOverdue = true } = this.data || {};
    if (this.sel !== 'all' && !lists.some(l => l.id === this.sel)) this.sel = 'all';
    const late = t => t.due && this._day(t.due) < 0 && !this.done.has(t.id);
    const shown = tasks.filter(t => showOverdue || !late(t));
    const folded = tasks.length - shown.length;
    const used = lists.filter(l => shown.some(t => t.list === l.id));
    $('taskTabs').innerHTML = [`<button class="chip${this.sel === 'all' ? ' sel' : ''}" data-list="all">전체</button>`]
      .concat(used.map(l => `<button class="chip${this.sel === l.id ? ' sel' : ''}" data-list="${esc(l.id)}"${l.color ? ` style="--lc:${esc(l.color)}"` : ''}>${esc(l.title)}</button>`)).join('');
    const L = Object.fromEntries(lists.map(l => [l.id, l]));
    const rows = shown.filter(t => this.sel === 'all' || t.list === this.sel)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || String(a.pos).localeCompare(String(b.pos)));
    $('taskCount').textContent = rows.length ? `${rows.length}개` : '';
    const col = c => /^#[0-9a-f]{3,8}$|^rgb|^hsl/i.test(c || '') ? c : '';
    $('taskList').innerHTML = (rows.length ? rows.map(t => {
      const d = this._due(t.due), l = L[t.list] || {}, c = col(l.color), ok = this.done.has(t.id);
      return `<li class="tk${t.sub ? ' tk-sub' : ''}${ok ? ' tk-done' : ''}"${c ? ` style="--lc:${c}"` : ''}>
        <button class="tk-dot" data-done="${esc(t.id)}" data-l="${esc(t.list)}" aria-label="${ok ? '되돌리기' : '완료'}"></button>
        <span class="tk-title">${t.star ? '<i class="tk-star">★</i>' : ''}${esc(t.title)}${this.sel === 'all' && used.length > 1 ? `<small>${esc(l.title || '')}</small>` : ''}</span>
        ${d ? `<span class="tk-due ${d.cls}">${d.t}</span>` : ''}</li>`;
    }).join('') : '<li class="tk-empty">남은 할일이 없습니다</li>')
      + (folded ? `<li class="tk-empty tk-fold">지난 할일 ${folded}개는 bashy.app 설정대로 접어 두었습니다</li>` : '');
  },
};

// ── 기기 설정 (표시 · 아이콘 · 이름) ──────────────────
const Dev = {
  all() { return store.get(DEV_KEY, {}); },
  get(id) { return this.all()[id] || {}; },
  save(map) { store.set(DEV_KEY, map); },
};

// ── SmartThings 연결 (집에 서버 없이) ─────────────────────
// bashy.app 에서 삼성 계정으로 허락해 두면, 서버(/api/hub stDevices·stCmd)가 대신 읽고 켠다.
// 받은 기기를 Home Assistant 상태 모양(entity_id·state·attributes)으로 바꿔 HA 화면 코드를 그대로 쓴다.
const ST = {
  map: {}, _t: 0, _busy: false,
  stop() { clearTimeout(this._t); this._t = 0; },
  connect() {
    if (!Object.keys(HA.states).length) HA.loadSnap();
    HA.note('SmartThings 연결 중…');
    this.poll();
  },
  next(ms) { clearTimeout(this._t); this._t = setTimeout(() => this.poll(), ms || (document.hidden ? 60000 : 15000)); },
  async poll() {
    if (HA.mode !== 'st' || this._busy) return;
    this._busy = true;
    try {
      const j = await hubCall({ act: 'stDevices' });
      this.apply(j);
      HA.ready = true; HA.markStale(false);
      HA.note(`SmartThings · 기기 ${j.devices.length}개`);
      HA.render(); HA.saveSnap();
      this.next();
    } catch (e) {
      HA.ready = false; HA.markStale(true);
      if (/연결되어 있지 않습니다|nolink/i.test(e.message)) { HA.note('SmartThings 가 아직 연결되지 않았습니다 — bashy.app › 기기 연결에서 연결해 주세요', true); if (!Object.keys(HA.states).length) HA.renderEmpty(); this.next(60000); }
      else { HA.note('SmartThings 불러오기 실패 — 다시 시도 중', true); this.next(20000); }
    } finally { this._busy = false; }
  },
  apply(j) {
    const states = {}, entArea = {}, map = {};
    const put = (eid, state, attrs, dev, room, kind) => { states[eid] = { entity_id: eid, state: String(state), attributes: attrs }; if (room) entArea[eid] = room; map[eid] = { dev, kind }; };
    for (const d of j.devices || []) {
      const s = d.st || {}, caps = d.caps || [], cat = String(d.cat || '').toLowerCase(), key = 'st_' + String(d.id).replace(/[^a-z0-9]/gi, '').toLowerCase();
      const off = s.health === 'OFFLINE' ? 'unavailable' : null;
      const has = c => caps.includes(c);
      const sw = s.switch || 'off';
      const base = { friendly_name: d.name };
      if (has('airConditionerMode') || /airconditioner|thermostat/.test(cat)) {
        put('climate.' + key, off || (sw === 'off' ? 'off' : (s.airConditionerMode || 'cool')), { ...base, current_temperature: s.temperature, temperature: s.coolingSetpoint ?? s.heatingSetpoint, target_temp_step: 1 }, d.id, d.room, 'climate');
      } else if (has('washerOperatingState') || has('dryerOperatingState')) {
        const k2 = key + (has('dryerOperatingState') ? '_dryer' : '');
        put(`sensor.${k2}_machine_state`, off || s.machineState || 'stop', base, d.id, d.room, 'appl');
        if (s.completionTime) put(`sensor.${k2}_completion_time`, s.completionTime, {}, d.id, d.room, 'ro');
      } else if (has('windowShade')) {
        put('cover.' + key, off || (s.windowShade === 'closed' ? 'closed' : 'open'), base, d.id, d.room, 'cover');
      } else if (has('lock')) {
        put('lock.' + key, off || (s.lock === 'locked' ? 'locked' : 'unlocked'), base, d.id, d.room, 'lock');
      } else if (has('robotCleanerMovement')) {
        put('vacuum.' + key, off || (s.robotCleanerMovement === 'cleaning' ? 'cleaning' : 'docked'), base, d.id, d.room, 'vacuum');
      } else if (has('switch')) {
        const dom = /light/.test(cat) || has('switchLevel') ? 'light' : /fan/.test(cat) || has('fanSpeed') ? 'fan' : 'switch';
        const a = { ...base };
        if (dom === 'light' && has('switchLevel')) { a.supported_color_modes = ['brightness']; if (sw === 'on' && s.level != null) a.brightness = Math.round(s.level * 2.55); }
        put(`${dom}.${key}`, off || sw, a, d.id, d.room, dom);
      }
      // 함께 달린 센서들 (에어컨 실내 온도는 위에서 이미 씀)
      if (!has('airConditionerMode')) {
        if (s.temperature != null) put(`sensor.${key}_temperature`, s.temperature, { friendly_name: d.name, device_class: 'temperature', unit_of_measurement: '°C' }, d.id, d.room, 'ro');
      }
      if (s.humidity != null) put(`sensor.${key}_humidity`, s.humidity, { friendly_name: d.name, device_class: 'humidity', unit_of_measurement: '%' }, d.id, d.room, 'ro');
      if (s.fineDustLevel != null) put(`sensor.${key}_pm25`, s.fineDustLevel, { friendly_name: d.name, device_class: 'pm25', unit_of_measurement: 'µg/m³' }, d.id, d.room, 'ro');
      if (s.carbonDioxide != null) put(`sensor.${key}_co2`, s.carbonDioxide, { friendly_name: d.name, device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }, d.id, d.room, 'ro');
      if (s.contact != null) put(`binary_sensor.${key}_contact`, s.contact === 'open' ? 'on' : 'off', { friendly_name: d.name, device_class: 'door' }, d.id, d.room, 'ro');
      if (s.motion != null) put(`binary_sensor.${key}_motion`, s.motion === 'active' ? 'on' : 'off', { friendly_name: d.name, device_class: 'motion' }, d.id, d.room, 'ro');
    }
    for (const x of j.scenes || []) put('scene.st_' + String(x.id).replace(/[^a-z0-9]/gi, '').toLowerCase(), 'scening', { friendly_name: x.name }, null, null, 'scene:' + x.id);
    HA.states = states; HA.areas = j.rooms || {}; HA.entArea = entArea; HA.hidden = new Set(); HA.unitF = false;
    this.map = map;
  },
  cmd(eid, capability, command, args) {
    const m = this.map[eid]; if (!m || !m.dev) throw new Error('기기를 찾지 못했습니다');
    return hubCall({ act: 'stCmd', device: m.dev, commands: [{ capability, command, arguments: args || [] }] });
  },
  setState(eid, state, attrs) { const x = HA.states[eid]; if (!x) return; HA.states[eid] = { ...x, state, attributes: { ...x.attributes, ...(attrs || {}) } }; HA.schedule(); },
  async send(msg) {
    if (msg.type === 'ping') return true;
    if (msg.type !== 'call_service') throw new Error('SmartThings 에서 지원하지 않는 요청');
    const { domain, service } = msg, data = msg.service_data || {};
    const ids = [].concat(data.entity_id || []);
    await Promise.all(ids.map(eid => this.one(eid, domain, service, data)));
    this.next(1500);   // 실제 상태로 곧 다시 맞춘다
    return true;
  },
  async one(eid, domain, service, data) {
    const m = this.map[eid] || {}, cur = HA.states[eid] || {}, on = cur.state && !['off', 'closed', 'locked', 'docked', 'unavailable'].includes(cur.state);
    if (String(m.kind || '').startsWith('scene:')) return hubCall({ act: 'stCmd', scene: m.kind.slice(6) });
    const dom = eid.split('.')[0];
    if (dom === 'cover') {
      const open = service === 'open_cover' || (service === 'toggle' && !on);
      this.setState(eid, open ? 'open' : 'closed'); return this.cmd(eid, 'windowShade', open ? 'open' : 'close');
    }
    if (dom === 'lock') { this.setState(eid, 'locked'); return this.cmd(eid, 'lock', 'lock'); }
    if (dom === 'vacuum') {
      const go = service === 'start';
      this.setState(eid, go ? 'cleaning' : 'docked'); return this.cmd(eid, 'robotCleanerMovement', 'setRobotCleanerMovement', [go ? 'cleaning' : 'homing']);
    }
    if (dom === 'climate' && service === 'set_temperature') {
      this.setState(eid, cur.state, { temperature: data.temperature }); return this.cmd(eid, 'thermostatCoolingSetpoint', 'setCoolingSetpoint', [Number(data.temperature)]);
    }
    if (dom === 'light' && service === 'turn_on' && data.brightness_pct != null) {
      this.setState(eid, 'on', { brightness: Math.round(data.brightness_pct * 2.55) }); return this.cmd(eid, 'switchLevel', 'setLevel', [Math.round(data.brightness_pct)]);
    }
    let want = service === 'turn_on' ? true : service === 'turn_off' ? false : !on;   // toggle · media_play_pause
    this.setState(eid, want ? (dom === 'climate' ? 'cool' : 'on') : 'off');
    return this.cmd(eid, 'switch', want ? 'on' : 'off');
  },
};

// ── 애플 홈 (아이폰·아이패드 Bashy 앱 안에서만) ───────────────
// 애플 홈은 서버 API 가 없다. iOS 앱의 BashyHome 플러그인(HomeKit)이 집·방·기기·장면을 넘겨 주고,
// 여기서 Home Assistant 상태 모양으로 바꿔 같은 타일 화면을 쓴다. 값이 바뀌면 플러그인이 'change' 로 알려 준다.
const AH = {
  map: {}, _sub: false,
  P() { return Native.plugin('BashyHome'); },
  async connect() {
    const P = this.P();
    if (!P) { HA.note('애플 홈은 아이폰·아이패드의 Bashy 앱 허브 모드에서만 쓸 수 있습니다', true); HA.renderEmpty(); return; }
    if (!Object.keys(HA.states).length) HA.loadSnap();
    HA.note('애플 홈 불러오는 중…');
    if (!this._sub) {
      this._sub = true;
      try { P.addListener('change', e => this.onChange(e)); P.addListener('homes', () => this.load()); } catch (e) {}
    }
    this.load();
  },
  async load() {
    if (HA.mode !== 'apple') return;
    try {
      const j = await this.P().list();
      this._last = j; this.apply(j);
      HA.ready = true; HA.markStale(false);
      HA.note(`애플 홈 · 기기 ${(j.items || []).length}개`);
      HA.render(); HA.saveSnap();
    } catch (e) { HA.ready = false; HA.note(e.message || '애플 홈을 불러오지 못했습니다', true); }
  },
  apply(j) {
    const states = {}, entArea = {}, map = {};
    const put = (eid, state, attrs, it) => { states[eid] = { entity_id: eid, state: String(state), attributes: attrs }; if (it && it.room) entArea[eid] = it.room; if (it) map[eid] = it; };
    for (const it of j.items || []) {
      const v = it.v || {}, key = 'ah_' + String(it.id).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24), base = { friendly_name: it.name };
      const off = it.reachable === false ? 'unavailable' : null;
      const on = v.on != null ? !!v.on : v.active != null ? !!Number(v.active) : false;
      it._key = key;
      switch (it.kind) {
        case 'light': put('light.' + key, off || (on ? 'on' : 'off'), { ...base, ...(v.brightness != null ? { supported_color_modes: ['brightness'], brightness: on ? Math.round(v.brightness * 2.55) : undefined } : {}) }, it); break;
        case 'switch': case 'fan': put(`${it.kind}.${key}`, off || (on ? 'on' : 'off'), base, it); break;
        case 'climate': put('climate.' + key, off || (!on ? 'off' : Number(v.mode) === 1 ? 'heat' : Number(v.mode) === 3 ? 'cool' : (v.target != null && v.cur != null && v.target > v.cur ? 'heat' : 'cool')), { ...base, current_temperature: v.cur, temperature: v.target, target_temp_step: 0.5 }, it); break;
        case 'cover': put('cover.' + key, off || (Number(v.pos) > 0 ? 'open' : 'closed'), base, it); break;
        case 'lock': put('lock.' + key, off || (Number(v.lock) === 1 ? 'locked' : 'unlocked'), base, it); break;
        case 'temp': if (v.cur != null) put(`sensor.${key}_temperature`, Math.round(v.cur * 10) / 10, { ...base, device_class: 'temperature', unit_of_measurement: '°C' }, it); break;
        case 'humidity': if (v.humidity != null) put(`sensor.${key}_humidity`, Math.round(v.humidity), { ...base, device_class: 'humidity', unit_of_measurement: '%' }, it); break;
        case 'contact': put(`binary_sensor.${key}_contact`, Number(v.contact) === 1 ? 'on' : 'off', { ...base, device_class: 'door' }, it); break;
        case 'motion': put(`binary_sensor.${key}_motion`, v.motion ? 'on' : 'off', { ...base, device_class: 'motion' }, it); break;
      }
    }
    for (const x of j.scenes || []) put('scene.ah_' + String(x.id).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24), 'scening', { friendly_name: x.name }, { scene: x.id });
    HA.states = states; HA.areas = j.rooms || {}; HA.entArea = entArea; HA.hidden = new Set(); HA.unitF = false;
    this.map = map;
  },
  // 기기 값이 바뀌었다는 알림 → 마지막으로 받은 목록에서 그 값만 고쳐 다시 그린다
  onChange(e) {
    const j = this._last; if (!j) return;
    const it = (j.items || []).find(x => x.id === e.id); if (!it) return;
    it.v = { ...(it.v || {}), [e.key]: e.value };
    this.apply(j); HA.schedule(); HA.saveSnap();
  },
  async send(msg) {
    if (msg.type === 'ping') return true;
    if (msg.type !== 'call_service') throw new Error('애플 홈에서 지원하지 않는 요청');
    const P = this.P(); if (!P) throw new Error('애플 홈을 쓸 수 없는 기기입니다');
    const { domain, service } = msg, data = msg.service_data || {};
    for (const eid of [].concat(data.entity_id || [])) {
      const it = this.map[eid] || {}, cur = HA.states[eid] || {}, on = cur.state && !['off', 'closed', 'locked', 'unavailable'].includes(cur.state);
      if (it.scene) { await P.scene({ id: it.scene }); continue; }
      const dom = eid.split('.')[0];
      if (dom === 'cover') { const open = service === 'open_cover' || (service === 'toggle' && !on); await P.set({ id: it.id, key: 'pos', value: open ? 100 : 0 }); continue; }
      if (dom === 'lock') { await P.set({ id: it.id, key: 'lock', value: 1 }); continue; }
      if (dom === 'climate' && service === 'set_temperature') { await P.set({ id: it.id, key: 'target', value: Number(data.temperature) }); continue; }
      if (dom === 'light' && service === 'turn_on' && data.brightness_pct != null) { await P.set({ id: it.id, key: 'brightness', value: Math.round(data.brightness_pct) }); await P.set({ id: it.id, key: 'on', value: true }).catch(() => {}); continue; }
      const want = service === 'turn_on' ? true : service === 'turn_off' ? false : !on;
      await P.set({ id: it.id, key: dom === 'climate' ? 'active' : 'on', value: want });
    }
    clearTimeout(this._re); this._re = setTimeout(() => this.load(), 600);
    return true;
  },
};

// ── Home Assistant ──────────────────────────────
const HA = {
  ws: null, id: 1, pending: new Map(), states: {}, areas: {}, entArea: {}, hidden: new Set(),
  ready: false, area: localStorage.getItem(AREA_KEY) || 'all', _retry: 0, unitF: false,

  DOMAINS: ['light', 'switch', 'fan', 'climate', 'cover', 'input_boolean', 'humidifier', 'media_player', 'lock', 'vacuum', 'sensor', 'binary_sensor', 'scene', 'script'],

  wsUrl(u) {
    const base = String(u || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) return null;
    return base.replace(/^http/, 'ws') + '/api/websocket';
  },

  // 시도할 주소 목록: 집 주소 → (예전 :8123 이면 포트 뺀 주소) → 외부 주소.
  // 집 Wi-Fi 밖이거나 HA 포트가 바뀌어도 다음 주소로 넘어가서 붙는다.
  urls(c) {
    const out = [];
    const add = u => { const w = this.wsUrl(u); if (w && !out.includes(w)) out.push(w); };
    add(c.haUrl);
    if (/:8123\/?$/.test(String(c.haUrl || '').trim())) add(String(c.haUrl).trim().replace(/:8123\/?$/, ''));
    add(c.haUrlExt);
    return out;
  },
  _ui: 0,

  mode: 'ha',
  useST(c = Cfg.get()) { return c.provider === 'st' || (!c.provider && !c.haToken && !!c.code); },
  connect() {
    const c = Cfg.get();
    this.close();
    if (c.provider === 'apple') { ST.stop(); this.mode = 'apple'; AH.connect(); return; }
    if (this.useST(c)) { this.mode = 'st'; ST.connect(); return; }
    this.mode = 'ha'; ST.stop();
    if (!(c.haUrl || c.haUrlExt) || !c.haToken) { this.renderEmpty(); return; }
    if (!this.ready && !Object.keys(this.states).length) this.loadSnap();
    const list = this.urls(c);
    if (!list.length) { this.note('주소 형식을 확인해 주세요 (http://… 로 시작)', true); return; }
    const url = list[this._ui % list.length];
    this.note(list.length > 1 ? `연결 중… (${url.replace(/^wss?:\/\//, '').replace(/\/api\/websocket$/, '')})` : '연결 중…');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.note('연결 실패: ' + e.message, true); this.retry(); return; }
    this.ws = ws;
    ws.onmessage = ev => this.onMsg(JSON.parse(ev.data));
    let ok = false;
    ws.addEventListener('message', () => { ok = true; });
    setTimeout(() => { if (!ok && this.ws === ws) { try { ws.close(); } catch {} } }, 7000);   // 닿지 않는 주소는 7초 만에 포기
    ws.onclose = () => {
      this.ready = false;
      if (this.ws !== ws) return;
      this.note('연결 끊김 — 마지막 상태 표시 중', true); this.markStale(true);
      if (!ok && list.length > 1) { this._ui++; clearTimeout(this._rt); this._rt = setTimeout(() => this.connect(), 800); return; }   // 다음 주소로 바로
      this.retry();
    };
    ws.onerror = () => {};
  },
  close() { if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch {} } this.ready = false; },
  // 다시 붙는 간격은 최대 20초. 맥미니가 재시작돼도 금방 돌아온다.
  retry() { clearTimeout(this._rt); this._rt = setTimeout(() => this.connect(), Math.min(20000, 2000 * 2 ** this._retry++)); },

  // 끊긴 줄도 모르고 붙잡고 있는 연결(맥미니가 멈췄다 깨어난 경우 등)을 30초마다 확인해 끊고 다시 붙는다.
  keepAlive() {
    clearInterval(this._ka);
    this._ka = setInterval(async () => {
      if (!this.ready || document.hidden) return;
      try { await this.send({ type: 'ping' }); }
      catch { const w = this.ws; this.ws = null; this.ready = false; try { w && w.close(); } catch {} this.note('연결 끊김 — 다시 연결 중', true); this.markStale(true); this._retry = 0; this.connect(); }
    }, 30000);
  },

  // ── 마지막 상태 저장/복원 ──
  // 화면에 쓰는 것만 줄여서 둔다. HA 에 다시 붙으면 곧바로 최신 값으로 바뀐다.
  saveSnap() {
    clearTimeout(this._snapT);
    this._snapT = setTimeout(() => {
      const keep = ['friendly_name', 'device_class', 'unit_of_measurement', 'brightness', 'supported_color_modes', 'current_temperature', 'temperature', 'target_temp_step'];
      const st = {};
      for (const x of this.candidates()) {
        const a = {}; for (const k of keep) if (x.attributes[k] != null) a[k] = x.attributes[k];
        st[x.entity_id] = { entity_id: x.entity_id, state: x.state, attributes: a };
      }
      for (const id of Object.keys(this.states)) if (/_completion_time$/.test(id)) st[id] = { entity_id: id, state: this.states[id].state, attributes: {} };
      store.set(SNAP_KEY, { at: Date.now(), states: st, areas: this.areas, entArea: this.entArea, unitF: this.unitF });
    }, 2000);
  },
  loadSnap() {
    const sn = store.get(SNAP_KEY, null);
    if (!sn || !sn.states) return false;
    this.states = sn.states; this.areas = sn.areas || {}; this.entArea = sn.entArea || {}; this.unitF = !!sn.unitF; this.hidden = new Set();
    this.draw(); this.markStale(true);
    return true;
  },
  markStale(on) { this.stale = on; const t = $('tiles'); if (t) t.classList.toggle('stale', on); },
  note(t, bad) { $('haNote').textContent = t || ''; $('haNote').classList.toggle('bad', !!bad); },

  send(msg) {
    if (this.mode === 'st') return ST.send(msg);
    if (this.mode === 'apple') return AH.send(msg);
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
    if (m.type === 'auth_ok') { this._retry = 0; this.ready = true; this.note('연결됨'); this.keepAlive(); this.bootstrap(); return; }
    if (m.type === 'pong' && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); p.res(true); return; }
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
      const [states, areas, ents, devs, conf] = await Promise.all([
        this.send({ type: 'get_states' }),
        this.send({ type: 'config/area_registry/list' }).catch(() => []),
        this.send({ type: 'config/entity_registry/list' }).catch(() => []),
        this.send({ type: 'config/device_registry/list' }).catch(() => []),
        this.send({ type: 'get_config' }).catch(() => ({})),
      ]);
      // HA 가 미국식 단위(°F)로 설정돼 있으면 온도 조절기 값도 °F 로 온다. 화면은 °C 로 바꿔 보여준다.
      this.unitF = /F/.test(((conf || {}).unit_system || {}).temperature || '');
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
      this.markStale(false);
      this.render();
    } catch (e) { this.note('불러오기 실패: ' + e.message, true); }
  },

  schedule() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); },

  // °F → °C. 센서는 자기 단위를 갖고 있고, 온도 조절기는 HA 전체 단위를 따른다.
  cel(v, unit) {
    const n = parseFloat(v);
    if (!isFinite(n)) return null;
    const f = unit ? /F/.test(unit) : this.unitF;
    return Math.round((f ? (n - 32) * 5 / 9 : n) * 10) / 10;
  },

  baseName(s) {
    let n = String((s.attributes && s.attributes.friendly_name) || s.entity_id);
    // 샤오미 공식 통합은 '청공  Air Purifier Switch Status' 처럼 기기 이름 뒤에 영어 설명을 붙인다.
    // 두 칸 띄움 앞의 한글 이름만 쓴다. '로청 로청' 같은 되풀이도 하나로.
    const two = n.split(/\s{2,}/);
    if (two.length > 1 && /[가-힣]/.test(two[0])) n = two[0];
    const w = n.split(' ');
    if (w.length === 2 && w[0] === w[1]) n = w[0];
    if (/_machine_state$/.test(s.entity_id)) n = n.replace(/\s*(장치\s*상태|machine\s*state)$/i, '');
    const a = this.areas[this.entArea[s.entity_id]];
    if (a && n.startsWith(a + ' ')) n = n.slice(a.length + 1);   // '거실 거실등' 같은 겹침을 줄인다
    return n.trim() || s.entity_id;
  },

  // 처음부터 숨겨 두는 것: 기기의 '설정 항목'(알림음·어린이 잠금·전원 복귀 동작 등)과
  // 샤오미 통합의 부가 항목('*' 가 붙은 이름). 기기 설정에서 언제든 다시 켤 수 있다.
  noise(s) {
    const id = s.entity_id, n = String(s.attributes.friendly_name || '');
    if (/\s\*\s/.test(n)) return true;
    if (/(alarm|child_?lock|physical|default_power|save_state|delay_off|double_click|long_press|pomodoro|no_disturb|wrinkle|bubble|backlight|power_on_behavior|indicator|led_)/i.test(id)) return true;
    if (/_p_\d+_\d+$/.test(id) && !/(_on_p_|switch_status|_power_p_)/i.test(id + n)) return true;
    return false;
  },
  name(s) { return Dev.get(s.entity_id).name || this.baseName(s); },

  // 화면에 올릴 수 있는 것: 조작할 수 있는 것 + 온도·습도 센서. (배터리·신호세기 등은 처음부터 뺀다)
  candidates() {
    const out = [];
    for (const s of Object.values(this.states)) {
      const [dom] = s.entity_id.split('.');
      if (!this.DOMAINS.includes(dom) || this.hidden.has(s.entity_id)) continue;
      if (dom === 'sensor' && !['temperature', 'humidity', 'pm25', 'carbon_dioxide'].includes(s.attributes.device_class) && !/_machine_state$/.test(s.entity_id)) continue;
      if (dom === 'binary_sensor' && !['door', 'window', 'opening', 'motion', 'occupancy'].includes(s.attributes.device_class)) continue;
      out.push(s);
    }
    return out;
  },
  hiddenNow(s, prefs) { const p = (prefs || Dev.all())[s.entity_id] || {}; return p.hide != null ? !!p.hide : this.noise(s); },
  visible() { const prefs = Dev.all(); return this.candidates().filter(s => !this.hiddenNow(s, prefs)); },

  isOn(s) { return ['on', 'open', 'opening', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'playing', 'unlocked', 'cleaning'].includes(s.state); },

  // 이름으로 먼저 고른다 (내 집 기기 이름이 곧 무엇인지 말해 준다). 못 고르면 종류로.
  NAME_ICONS: [
    [/엘베|엘리베이터|elevator/i, 'elevator'], [/로청|로봇\s*청소|청소기|vacuum/i, 'vacuum'], [/청공|공기\s*청정|purifier/i, 'purifier'],
    [/세탁기|washer/i, 'washer'], [/건조기|dryer/i, 'dryer'], [/식기\s*세척|식세기/i, 'dishwasher'], [/스타일러|에어드레서/i, 'styler'],
    [/모니터\s*(조명|등|라이트)|라이트\s*바|lightbar/i, 'monitorlight'], [/침대|무드|수면등|취침/i, 'nightlight'], [/스탠드/i, 'lamp'],
    [/천장|거실등|방등|메인\s*등/i, 'ceiling'], [/led|줄\s*조명|스트립/i, 'strip'], [/컴퓨터|pc|데스크탑/i, 'pc'], [/모니터/i, 'monitor'],
    [/셋톱|셋탑|set.?top|iptv|btv|올레/i, 'settop'], [/tv|티비|텔레비전/i, 'tv'], [/스피커|speaker|홈팟|nest/i, 'speaker'],
    [/멀티탭|플러그|plug/i, 'plug'], [/콘센트|소켓|socket|outlet/i, 'outlet'], [/에어컨|냉방/i, 'ac'], [/보일러|난방|히터/i, 'heater'],
    [/제습/i, 'dehumidifier'], [/가습/i, 'humidifier'], [/서큘|순환/i, 'circulator'], [/선풍기|팬/i, 'fan'], [/환기|전열\s*교환/i, 'vent'],
    [/정수기/i, 'purifierwater'], [/냉장고/i, 'fridge'], [/전자\s*레인지/i, 'microwave'], [/오븐|에어\s*프라이어/i, 'oven'],
    [/인덕션|전기\s*레인지|하이라이트|가스/i, 'cooktop'], [/밥솥/i, 'ricecooker'], [/커피/i, 'coffee'], [/포트|주전자/i, 'kettle'],
    [/커튼/i, 'curtain'], [/블라인드|롤스크린/i, 'blind'], [/창문/i, 'window'], [/현관|도어락|잠금/i, 'lock'], [/문\b|방문|도어/i, 'door'],
    [/인터폰|초인종|벨/i, 'doorbell'], [/카메라|cctv|캠/i, 'camera'], [/장판|매트/i, 'heatmat'], [/안마/i, 'massage'],
    [/프린터/i, 'printer'], [/공유기|와이파이|wifi|라우터/i, 'router'], [/게임|플스|ps5|닌텐도|xbox/i, 'game'], [/충전/i, 'charger'],
  ],
  autoIcon(s) {
    const dom = s.entity_id.split('.')[0], dc = s.attributes.device_class;
    const nm = this.baseName(s) + ' ' + (s.attributes.friendly_name || '');
    if (/_machine_state$/.test(s.entity_id)) return /건조|dryer/i.test(nm + s.entity_id) ? 'dryer' : 'washer';
    if (dom !== 'sensor' && dom !== 'binary_sensor') { const hit = this.NAME_ICONS.find(([re]) => re.test(nm)); if (hit) return hit[1]; }
    if (dom === 'switch' && dc === 'outlet') return 'outlet';
    if (dom === 'sensor') return dc === 'humidity' ? 'drop' : 'temp';
    if (dom === 'binary_sensor') return ['motion', 'occupancy'].includes(dc) ? 'motion' : dc === 'window' ? 'window' : 'door';
    if (dom === 'cover') return dc === 'curtain' ? 'curtain' : dc === 'blind' || dc === 'shade' ? 'blind' : 'blind';
    if (dom === 'media_player') return dc === 'tv' ? 'tv' : dc === 'speaker' ? 'speaker' : 'media';
    return { light: 'bulb', fan: 'fan', climate: 'ac', lock: 'lock', vacuum: 'vacuum', humidifier: 'humidifier', input_boolean: 'toggle', scene: 'star', script: 'star' }[dom] || 'switch';
  },
  iconKey(s) { return Dev.get(s.entity_id).icon || this.autoIcon(s); },

  stateText(s) {
    const dom = s.entity_id.split('.')[0], a = s.attributes;
    if (s.state === 'unavailable') return '연결 안 됨';
    if (/_machine_state$/.test(s.entity_id)) {
      const M = { stop: '대기', run: '동작 중', pause: '일시정지', none: '대기', finished: '완료' };
      let t = M[s.state] || s.state;
      if (s.state === 'run') {
        const fin = this.states[s.entity_id.replace(/_machine_state$/, '_completion_time')];
        const at = fin && Date.parse(fin.state);
        if (at && at > Date.now()) t += ` · ${new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 완료`;
      }
      return t;
    }
    if (dom === 'sensor') {
      if (a.device_class === 'temperature') { const c = this.cel(s.state, a.unit_of_measurement); return c == null ? s.state : `${c}°C`; }
      return `${s.state}${a.unit_of_measurement || ''}`;
    }
    if (dom === 'binary_sensor') return s.state === 'on' ? (['motion', 'occupancy'].includes(a.device_class) ? '감지됨' : '열림') : (['motion', 'occupancy'].includes(a.device_class) ? '없음' : '닫힘');
    if (dom === 'climate') {
      const MODES = { off: '꺼짐', heat: '난방', cool: '냉방', heat_cool: '자동', auto: '자동', dry: '제습', fan_only: '송풍' };
      const cur = this.cel(a.current_temperature), tgt = this.cel(a.temperature);
      return `${cur != null ? `현재 ${cur}° · ` : ''}${MODES[s.state] || s.state}${tgt != null && s.state !== 'off' ? ` ${tgt}°` : ''}`;
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
    $('indoor').innerHTML = '';
    $('tiles').innerHTML = `<div class="empty-home">
      <b>스마트홈을 연결하면</b> 집 기기를 여기서 켜고 끌 수 있습니다.<br>
      서버 없이 쓰려면 bashy.app › 기기 연결에서 <b>SmartThings</b> 를 연결하고, 집에 Home Assistant 가 있으면 설정에 주소와 토큰을 넣어 주세요.<br>
      <button class="chip" onclick="document.getElementById('gear').click()">설정 열기</button></div>`;
  },

  // 왼쪽 날씨 아래 '실내' 한 줄. 거실(또는 첫 공간)의 온도·습도 센서.
  indoor() {
    const all = this.candidates();
    const pick = dc => {
      const c = all.filter(s => s.entity_id.startsWith('sensor.') && s.attributes.device_class === dc && isFinite(parseFloat(s.state)));
      const living = c.find(s => /거실|living/i.test(this.areas[this.entArea[s.entity_id]] || ''));
      return living || c[0];
    };
    const t = pick('temperature'), h = pick('humidity');
    const tc = t ? this.cel(t.state, t.attributes.unit_of_measurement) : null;
    $('indoor').innerHTML = tc != null || h
      ? `<span class="w-sub">실내</span>${tc != null ? `<b>${esc(Math.round(tc))}°</b>` : ''}${h ? `<span>${esc(Math.round(parseFloat(h.state)))}%</span>` : ''}`
      : '';
  },

  render() {
    if (!this.ready) return;
    if (this._dimActive) { this._dimDirty = true; return; }   // 밝기를 끄는 중에는 타일을 다시 그리지 않는다
    this.draw();
    this.saveSnap();
  },

  draw() {
    this.indoor();
    const all = this.visible();
    const used = [...new Set(all.map(s => this.entArea[s.entity_id]).filter(Boolean))]
      .sort((a, b) => String(this.areas[a]).localeCompare(String(this.areas[b]), 'ko'));
    if (this.area !== 'all' && !used.includes(this.area)) this.area = 'all';
    $('areas').innerHTML = [`<button class="chip${this.area === 'all' ? ' sel' : ''}" data-area="all">전체</button>`]
      .concat(used.map(a => `<button class="chip${this.area === a ? ' sel' : ''}" data-area="${esc(a)}">${esc(this.areas[a] || a)}</button>`)).join('');

    const inArea = s => this.area === 'all' || this.entArea[s.entity_id] === this.area;
    const scenes = all.filter(s => /^(scene|script)\./.test(s.entity_id) && inArea(s));
    $('scenes').innerHTML = scenes.map(s => `<button class="chip" data-run="${esc(s.entity_id)}">${esc(this.name(s))}</button>`).join('');

    const rank = s => ['light', 'switch', 'fan', 'climate', 'cover', 'input_boolean', 'humidifier', 'media_player', 'lock', 'vacuum', 'binary_sensor', 'sensor'].indexOf(s.entity_id.split('.')[0]);
    const tiles = all.filter(s => !/^(scene|script)\./.test(s.entity_id) && inArea(s))
      .sort((a, b) => rank(a) - rank(b) || this.name(a).localeCompare(this.name(b), 'ko'));

    if (!tiles.length && !scenes.length) {
      $('tiles').innerHTML = `<div class="empty-home">이 공간에 표시할 기기가 없습니다. 오른쪽 위 ⚙에서 보일 기기를 고를 수 있습니다.</div>`;
      return;
    }
    $('tiles').innerHTML = tiles.map(s => this.tile(s)).join('');
  },

  tile(s) {
    const dom = s.entity_id.split('.')[0];
    const ro = dom === 'sensor' || dom === 'binary_sensor';
    const busy = /_machine_state$/.test(s.entity_id) && s.state === 'run';
    const cls = ['tile', dom, (this.isOn(s) && !ro) || busy ? 'on' : '', /_machine_state$/.test(s.entity_id) ? 'appl' : '', s.state === 'unavailable' ? 'off-line' : '', ro ? 'ro' : ''].filter(Boolean).join(' ');
    const id = esc(s.entity_id);
    const ic = HubIcons.svg(this.iconKey(s), 't-ic');
    if (dom === 'climate') {
      return `<div class="${cls}" data-id="${id}">${ic}
        <div class="t-name">${esc(this.name(s))}</div><div class="t-state">${esc(this.stateText(s))}</div>
        <div class="t-ctl"><button data-temp="-1" aria-label="낮추기">−</button><button data-temp="1" aria-label="높이기">+</button></div></div>`;
    }
    if (this.dimmable(s)) {
      const pct = s.state === 'on' ? Math.max(1, Math.round((s.attributes.brightness || 0) / 2.55)) : 0;
      return `<button class="${cls} dim" data-id="${id}" style="--b:${pct}%">${ic}
        <span class="t-name">${esc(this.name(s))}</span><span class="t-state">${esc(this.stateText(s))}</span>
        <span class="t-bri" aria-hidden="true"></span><span class="t-big" aria-hidden="true"></span></button>`;
    }
    return `<button class="${cls}" data-id="${id}"${ro ? ' disabled' : ''}>${ic}
      <span class="t-name">${esc(this.name(s))}</span><span class="t-state">${esc(this.stateText(s))}</span></button>`;
  },

  // 밝기를 바꿀 수 있는 조명인가 — 켜고 끄기만 되는 조명은 빼고.
  dimmable(s) {
    if (!s.entity_id.startsWith('light.') || s.state === 'unavailable') return false;
    const m = s.attributes.supported_color_modes;
    return Array.isArray(m) ? m.some(x => x !== 'onoff') : s.attributes.brightness != null;
  },

  async setBrightness(id, pct) {
    const data = pct <= 0 ? { entity_id: id } : { entity_id: id, brightness_pct: Math.max(1, Math.min(100, Math.round(pct))) };
    try { await this.send({ type: 'call_service', domain: 'light', service: pct <= 0 ? 'turn_off' : 'turn_on', service_data: data }); }
    catch (e) { toast('실패: ' + e.message); }
  },

  // 조명 타일을 꾹 누르면(0.4초) 밝기 모드. 그대로 좌우로 끌면 밝기가 바뀌고, 손을 떼면 그 값으로 맞춘다.
  // 짧게 누르면 지금처럼 켜고 끈다. 위아래로 끌면 화면이 스크롤된다.
  bindDim() {
    const box = $('tiles');
    let d = null;
    const end = (apply) => {
      if (!d) return;
      clearTimeout(d.timer);
      if (d.on) {
        d.el.classList.remove('dimming');
        this._dimActive = false; if (this._dimDirty) { this._dimDirty = false; this.schedule(); }
        if (apply && d.pct !== d.sent) this.setBrightness(d.id, d.pct);
        this._swallow = true; setTimeout(() => { this._swallow = false; }, 400);
      }
      d = null;
    };
    box.addEventListener('pointerdown', e => {
      const el = e.target.closest('.tile.dim'); if (!el || e.button > 0) return;
      const s = this.states[el.dataset.id]; if (!s) return;
      const base = s.state === 'on' ? Math.round((s.attributes.brightness || 0) / 2.55) : 0;
      d = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, base, pct: base, sent: base, on: false, pid: e.pointerId };
      d.timer = setTimeout(() => {
        if (!d) return;
        d.on = true; this._dimActive = true; el.classList.add('dimming');
        try { el.setPointerCapture(d.pid); } catch {}
        el.style.setProperty('--b', d.pct + '%');
        el.querySelector('.t-big').textContent = d.pct + '%';
        if (navigator.vibrate) navigator.vibrate(15);
      }, 400);
    });
    box.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.pid) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.on) { if (Math.hypot(dx, dy) > 8) { clearTimeout(d.timer); d = null; } return; }
      e.preventDefault();
      const w = d.el.getBoundingClientRect().width;
      d.pct = Math.max(0, Math.min(100, Math.round(d.base + dx / (w * 1.2) * 100)));
      d.el.style.setProperty('--b', d.pct + '%');
      d.el.querySelector('.t-big').textContent = d.pct ? d.pct + '%' : '끄기';
      // 끄는 동안에도 불빛이 따라오게, 0.35초마다 한 번씩 보낸다.
      const now = Date.now();
      if (now - (d.last || 0) > 350 && d.pct !== d.sent) { d.last = now; d.sent = d.pct; this.setBrightness(d.id, d.pct); }
    });
    box.addEventListener('pointerup', () => end(true));
    box.addEventListener('pointercancel', () => end(false));
    box.addEventListener('contextmenu', e => { if (e.target.closest('.tile')) e.preventDefault(); });
  },

  async toggle(id) {
    const s = this.states[id];
    if (!s || s.state === 'unavailable') return;
    const dom = id.split('.')[0];
    let domain = dom, service = 'toggle';
    if (dom === 'climate') service = s.state === 'off' ? 'turn_on' : 'turn_off';
    if (dom === 'lock') { if (s.state === 'locked') { toast('문 잠금 해제는 여기서 하지 않습니다'); return; } service = 'lock'; }
    if (dom === 'vacuum') service = s.state === 'cleaning' ? 'return_to_base' : 'start';
    if (dom === 'media_player') service = 'media_play_pause';
    const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add('pending');
    try { await this.send({ type: 'call_service', domain, service, service_data: { entity_id: id } }); }
    catch (e) { toast('실패: ' + e.message); if (el) el.classList.remove('pending'); }
  },

  // 화면은 °C 기준 0.5° 씩. HA 가 °F 면 그 단위로 바꿔 보낸다.
  async temp(id, delta) {
    const s = this.states[id];
    if (!s) return;
    const raw = Number(s.attributes.temperature);
    if (!isFinite(raw)) { toast('희망 온도를 바꿀 수 없는 기기입니다'); return; }
    let next;
    if (this.unitF) {
      const c = Math.round(((raw - 32) * 5 / 9 + delta * 0.5) * 2) / 2;
      next = Math.round(c * 9 / 5 + 32);
    } else {
      next = raw + delta * (Number(s.attributes.target_temp_step) || 0.5);
    }
    try { await this.send({ type: 'call_service', domain: 'climate', service: 'set_temperature', service_data: { entity_id: id, temperature: next } }); }
    catch (e) { toast('실패: ' + e.message); }
  },

  async run(id) {
    const [dom] = id.split('.');
    try { await this.send({ type: 'call_service', domain: dom, service: 'turn_on', service_data: { entity_id: id } }); toast('실행했습니다'); }
    catch (e) { toast('실패: ' + e.message); }
  },

  // 말 한 줄을 HA 에 맡긴다. 못 알아들었으면 null.
  async converse(text, noAI) {
    if (!this.ready) return null;
    const r = await this.send({ type: 'conversation/process', text, language: 'ko', conversation_id: this._conv || undefined });
    this._conv = r.conversation_id;
    const resp = r.response || {};
    const speech = resp.speech && resp.speech.plain && resp.speech.plain.speech;
    if (resp.response_type === 'error' && ['no_intent_match', 'no_valid_targets'].includes(resp.data && resp.data.code)) return noAI ? null : this.converseAI(text);
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
    this.bindDim();
    $('tiles').addEventListener('click', e => {
      if (this._swallow) return;
      const t = e.target.closest('[data-temp]');
      const tile = e.target.closest('[data-id]');
      if (!tile) return;
      if (t) { this.temp(tile.dataset.id, Number(t.dataset.temp)); return; }
      this.toggle(tile.dataset.id);
    });
  },
};

// ── 기기 설정 창 ──────────────────────────────────
const DevSettings = {
  draft: null, openIcon: null,
  init() {
    $('devGear').addEventListener('click', () => this.open());
    $('devSet').addEventListener('close', () => { if ($('devSet').returnValue === 'save') this.save(); });
    $('devList').addEventListener('click', e => this.onClick(e));
    $('devList').addEventListener('input', e => {
      const al = e.target.closest('[data-alias]');
      if (al) { this.row(al.dataset.alias).alias = al.value.trim(); return; }
      const inp = e.target.closest('[data-name]'); if (!inp) return;
      this.row(inp.dataset.name).name = inp.value.trim();
    });
    $('devReset').addEventListener('click', () => { this.draft = {}; this.openIcon = null; this.render(); });
  },
  row(id) { return this.draft[id] || (this.draft[id] = {}); },
  open() {
    if (!HA.ready) { toast('Home Assistant 에 연결된 뒤에 설정할 수 있습니다'); return; }
    this.draft = JSON.parse(JSON.stringify(Dev.all()));
    this.openIcon = null;
    this.render();
    $('devSet').showModal();
  },
  render() {
    const list = HA.candidates();
    const groups = {};
    for (const s of list) (groups[HA.entArea[s.entity_id] || ''] = groups[HA.entArea[s.entity_id] || ''] || []).push(s);
    const order = Object.keys(groups).sort((a, b) => (a ? HA.areas[a] || a : '힣').localeCompare(b ? HA.areas[b] || b : '힣', 'ko'));
    $('devList').innerHTML = order.map(a => `
      <div class="dv-group">${esc(a ? HA.areas[a] || a : '공간 없음')}</div>
      ${groups[a].sort((x, y) => (HA.noise(x) - HA.noise(y)) || HA.baseName(x).localeCompare(HA.baseName(y), 'ko')).map(s => {
        const p = this.draft[s.entity_id] || {};
        const off = p.hide != null ? !!p.hide : HA.noise(s);
        const key = p.icon || HA.autoIcon(s);
        const id = esc(s.entity_id);
        return `<div class="dv-row${off ? ' dv-off' : ''}">
          <button type="button" class="dv-ic" data-pick="${id}" aria-label="아이콘 바꾸기">${HubIcons.svg(key)}</button>
          <input class="dv-name" data-name="${id}" value="${esc(p.name || '')}" placeholder="${esc(HA.baseName(s))}" autocomplete="off" spellcheck="false">
          <button type="button" class="dv-sw${off ? '' : ' on'}" data-vis="${id}" aria-label="화면에 보이기">${off ? '숨김' : '표시'}</button>
          <input class="dv-alias" data-alias="${id}" value="${esc(p.alias || '')}" placeholder="음성 별명 (쉼표로 여러 개)" autocomplete="off" spellcheck="false">
        </div>
        ${this.openIcon === s.entity_id ? `<div class="dv-icons">
          <button type="button" class="dv-opt${!p.icon ? ' sel' : ''}" data-set="${id}" data-key="">${HubIcons.svg(HA.autoIcon(s))}<span>자동</span></button>
          ${HubIcons.LIST.map(([k, label]) => `<button type="button" class="dv-opt${p.icon === k ? ' sel' : ''}" data-set="${id}" data-key="${k}">${HubIcons.svg(k)}<span>${label}</span></button>`).join('')}
        </div>` : ''}`;
      }).join('')}`).join('') || '<p class="s-help">표시할 수 있는 기기가 없습니다.</p>';
  },
  onClick(e) {
    const pick = e.target.closest('[data-pick]');
    if (pick) { this.openIcon = this.openIcon === pick.dataset.pick ? null : pick.dataset.pick; this.render(); return; }
    const set = e.target.closest('[data-set]');
    if (set) { const r = this.row(set.dataset.set); if (set.dataset.key) r.icon = set.dataset.key; else delete r.icon; this.openIcon = null; this.render(); return; }
    const vis = e.target.closest('[data-vis]');
    if (vis) {
      const id = vis.dataset.vis, r = this.row(id), st = HA.states[id];
      const off = r.hide != null ? !!r.hide : (st ? HA.noise(st) : false);
      r.hide = !off; this.render();
    }
  },
  save() {
    // 빈 칸은 지워서 저장한다 — '자동' 과 '아무것도 안 바꿈' 을 같은 것으로 둔다
    const clean = {};
    for (const [id, p] of Object.entries(this.draft || {})) {
      const q = {};
      const st = HA.states[id];
      if (p.hide != null && st && !!p.hide !== HA.noise(st)) q.hide = !!p.hide;   // 기본과 다를 때만 적어 둔다
      if (p.icon) q.icon = p.icon;
      if (p.name) q.name = p.name;
      if (p.alias) q.alias = p.alias;
      if (Object.keys(q).length) clean[id] = q;
    }
    Dev.save(clean);
    HA.render();
    toast('기기 설정을 저장했습니다');
  },
};

// ── 말로 기기 다루기 ──────────────────────────────
// 한 문장을 [무엇을(동작)] + [어디·무엇에(대상)] 로 나눈다. 전부 이 태블릿 안에서 끝난다 —
// 서버나 AI 를 거치지 않으니 빠르고, 같은 말이면 늘 같은 결과가 나온다.
//
//   동작: 켜/꺼/밝기 N%/밝게/어둡게/N도(난방)/상태 묻기
//   대상: ① 기기 이름(허브 타일 이름·HA 이름·별명)  ② 공간(거실·침실1…)  ③ 종류(불·난방·컴퓨터·청정기·청소기·TV)
//         ④ '다·전부·모두' 가 붙으면 그 범위 전체
// 못 알아들은 말만 Home Assistant 대화 → AI 로 넘긴다. (그 길은 몇 초씩 걸린다)
const Cmd = {
  n: s => String(s || '').toLowerCase().replace(/[\s.,!?~'"·]/g, ''),
  CTRL: ['light', 'switch', 'fan', 'climate', 'cover', 'input_boolean', 'humidifier', 'media_player', 'vacuum'],

  // 종류 낱말 → 그 종류에 드는 기기인지
  KINDS: [
    { k: 'light',  re: /(불|조명|전등|라이트|램프|스탠드)/, is: s => s.entity_id.startsWith('light.') || /(조명|불|램프|라이트|스탠드)/.test(HA.name(s)) },
    { k: 'heat',   re: /(난방|보일러)/,                    is: s => s.entity_id.startsWith('climate.') },
    { k: 'pc',     re: /(컴퓨터|피씨|pc|데스크탑)/i,         is: s => /(컴퓨터|pc)/i.test(HA.name(s)) },
    { k: 'air',    re: /(공기\s*청정기|청정기|청공)/,         is: s => /(청정기|청공)/.test(HA.name(s)) || s.entity_id.startsWith('fan.') },
    { k: 'vacuum', re: /(청소기|로봇\s*청소기|로청|청소)/,     is: s => s.entity_id.startsWith('vacuum.') },
    { k: 'tv',     re: /(티비|tv|텔레비전|테레비)/i,          is: s => s.entity_id.startsWith('media_player.') },
  ],
  ALL_RE: /(다\s*(꺼|켜|끄|켜)|전부|모두|모든|전체|싹\s*다|싹|집\s*안)/,

  verb(t) {
    if (/(켜져|꺼져|켜졌|꺼졌)\s*(있|있어|있나|있니|있냐|있어요)?\s*\??$|상태\s*(어때|알려|봐)|(켜져|꺼져)\s*있/.test(t)) return { act: 'ask' };
    const deg = t.match(/(\d{2})\s*도/);
    if (deg && /(난방|보일러|온도)/.test(t)) return { act: 'temp', v: Number(deg[1]) };
    const pct = t.match(/(\d{1,3})\s*(%|퍼센트|프로)/) || (/밝기/.test(t) && t.match(/(\d{1,3})/));
    if (pct) return { act: 'bri', v: Math.min(100, Number(pct[1])) };
    if (/(더\s*)?밝게|밝혀|환하게/.test(t)) return { act: 'step', v: 25 };
    if (/(더\s*)?어둡게|어두워|어둡|줄여/.test(t)) return { act: 'step', v: -25 };
    if (/(꺼|끄|끔|끈|off|오프|멈춰|정지|중지|그만|닫아)/i.test(t)) return { act: 'off' };
    if (/(켜|틀어|켬|\bon\b|시작|돌려|작동|열어)/i.test(t)) return { act: 'on' };
    return null;
  },

  // 기기 하나가 들을 수 있는 이름들. 'HA 이름 · 허브에서 바꾼 이름 · 별명' 에
  // '침실1 침실1조명1' 같은 되풀이를 접은 것, 끝 숫자를 뗀 것까지 넣는다.
  // 불·전등·라이트·조명은 같은 말로 본다 ("침실1 불" = "침실1 조명")
  KW: s => s.replace(/(불|전등|라이트|램프)/g, '조명'),
  PURE: /^(조명|난방|보일러|컴퓨터|스위치|콘센트|플러그|switch)\d*$/,

  aliases(s) {
    const out = new Set();
    const add = x => {
      const k = this.KW(this.n(x)); if (k.length < 2 || this.PURE.test(k)) return;
      out.add(k);
      const bare = k.replace(/(조명|난방)/g, '');            // '침실1조명' → '침실1' (종류는 따로 맞춘다)
      if (bare.length >= 2 && bare !== k && !/^\d+$/.test(bare)) out.add(bare);
    };
    const base = [HA.name(s), HA.baseName(s), ...((Dev.get(s.entity_id).alias || '').split(/[,，]/))];
    for (const nm of base) {
      if (!nm) continue;
      add(nm);
      const w = String(nm).trim().split(/\s+/);
      if (w.length > 1 && w[1].startsWith(w[0])) add(w.slice(1).join(' '));         // 침실1 침실1조명1 → 침실1조명1
      add(String(nm).replace(/\s*\d+$/, ''));                                       // 거실 조명1 → 거실 조명
    }
    return [...out];
  },

  areaOf(t) {
    const nt = this.n(t);
    let best = null, len = 0;
    for (const [id, nm] of Object.entries(HA.areas)) { const k = this.n(nm); if (k.length >= 2 && nt.includes(k) && k.length > len) { best = id; len = k.length; } }
    return best;
  },

  // 대상 찾기. { list, why } — why 는 못 찾았을 때 되물을 말
  find(t, v) {
    if (!HA.ready && !Object.keys(HA.states).length) return { list: [] };
    const nt = this.KW(this.n(t));
    const all = HA.candidates().filter(s => this.CTRL.includes(s.entity_id.split('.')[0]) && !HA.hiddenNow(s));
    const kind = this.KINDS.find(k => k.re.test(t));
    const pool = kind ? all.filter(kind.is) : all;
    const many = this.ALL_RE.test(t);

    // ① 이름: 가장 길게 겹치는 이름. 같은 길이로 여럿이면 전부 (거실 조명 → 거실 조명1·2)
    let best = [], bestLen = 0;
    for (const s of pool) {
      let m = 0;
      for (const a of this.aliases(s)) if (nt.includes(a) && a.length > m) m = a.length;
      if (!m) continue;
      if (m > bestLen) { best = [s]; bestLen = m; } else if (m === bestLen) best.push(s);
    }
    if (best.length) return { list: best };

    // ② 공간 (+종류)
    const area = this.areaOf(t);
    if (area) {
      const inArea = pool.filter(s => HA.entArea[s.entity_id] === area);
      if (inArea.length) return { list: inArea };
    }
    // ③ 종류만: 하나뿐이면 그것, '다' 가 붙었으면 전부
    if (kind) {
      if (pool.length === 1 || many) return { list: pool };
      if (pool.length > 1) {
        // 켜는 말이면 꺼진 것, 끄는 말이면 켜진 것만 남겨 본다 — 하나로 좁혀지면 그것
        const want = v && v.act === 'off' ? pool.filter(s => HA.isOn(s)) : v && v.act === 'on' ? pool.filter(s => !HA.isOn(s) && s.state !== 'unavailable') : [];
        if (v && v.act === 'off') return { list: want.length ? want : pool };   // "불 꺼" = 켜진 것 전부 (없으면 '이미 꺼져 있습니다')
        if (want.length === 1) return { list: want };
        return { list: [], why: `어느 ${kind.k === 'light' ? '조명' : '기기'}인지 말씀해 주세요. ${pool.slice(0, 4).map(s => HA.name(s)).join(', ')}${pool.length > 4 ? ' …' : ''}` };
      }
    }
    return { list: [] };
  },

  j(w, a, b) { const c = String(w).charCodeAt(String(w).length - 1); return w + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b); },

  // 말 한 줄을 바로 실행할 수 있는지만 본다 (부분 인식 결과로 미리 실행할지 정할 때 씀)
  ready(text) { const v = this.verb(text); if (!v) return false; const f = this.find(text, v); return f.list.length > 0; },

  // 기다리지 않는다: 명령은 보내 놓고, 1.5초 안에 실패가 오면 그때만 알린다.
  fire(domain, service, data) {
    const p = HA.send({ type: 'call_service', domain, service, service_data: data });
    return Promise.race([p.then(() => true), new Promise(r => setTimeout(() => r(true), 1500))]);
  },

  async run(text) {
    const v = this.verb(text);
    if (!v) return null;
    const { list: hits, why } = this.find(text, v);
    if (!hits.length) return why || null;
    const names = hits.length > 2 ? `${HA.name(hits[0])} 등 ${hits.length}개` : hits.map(s => HA.name(s)).join(', ');

    if (v.act === 'ask') {
      return hits.map(s => `${HA.name(s)} ${s.state === 'unavailable' ? '연결 안 됨' : HA.isOn(s) ? '켜져 있음' : '꺼져 있음'}`).join(', ') + '.';
    }
    const dead = hits.filter(s => s.state === 'unavailable');
    const live = hits.filter(s => s.state !== 'unavailable');
    if (!live.length) return `${this.j(HA.name(dead[0]), '이', '가')} 지금 연결되어 있지 않습니다.`;

    const jobs = [];
    for (const s of live) {
      const [dom] = s.entity_id.split('.'), id = s.entity_id;
      if (v.act === 'bri' || v.act === 'step') {
        if (dom !== 'light' || !HA.dimmable(s)) continue;
        const cur = s.state === 'on' ? Math.round((s.attributes.brightness || 0) / 2.55) : 0;
        jobs.push(HA.setBrightness(id, v.act === 'bri' ? v.v : Math.max(0, Math.min(100, cur + v.v))));
        continue;
      }
      if (v.act === 'temp') {
        if (dom === 'climate') jobs.push(this.fire('climate', 'set_temperature', { entity_id: id, temperature: v.v, hvac_mode: 'heat' }));
        continue;
      }
      let domain = dom, service = v.act === 'on' ? 'turn_on' : 'turn_off';
      if (dom === 'vacuum') service = v.act === 'on' ? 'start' : 'return_to_base';
      if (dom === 'cover') service = v.act === 'on' ? 'open_cover' : 'close_cover';
      if (dom === 'media_player' && v.act === 'off') service = 'turn_off';
      if (v.act === 'off' && !HA.isOn(s)) continue;      // 이미 꺼진 건 건너뛴다 (보내 봐야 느리기만 하다)
      if (v.act === 'on' && HA.isOn(s) && dom !== 'vacuum') continue;
      jobs.push(this.fire(domain, service, { entity_id: id }));
    }
    await Promise.all(jobs).catch(e => { throw new Error('실패했습니다: ' + e.message); });

    const tail = dead.length ? ` (${dead.map(s => HA.name(s)).join(', ')} 연결 안 됨)` : '';
    if (!jobs.length && (v.act === 'on' || v.act === 'off')) return `이미 ${v.act === 'on' ? '켜져' : '꺼져'} 있습니다.${tail}`;
    if (v.act === 'bri') return `밝기 ${v.v}%.${tail}`;
    if (v.act === 'step') return `${v.v > 0 ? '밝게' : '어둡게'} 했습니다.${tail}`;
    if (v.act === 'temp') return `난방 ${v.v}도로 맞췄습니다.${tail}`;
    if (live.every(s => s.entity_id.startsWith('vacuum.'))) return v.act === 'on' ? '청소 시작합니다.' : '충전대로 보냅니다.';
    return `${this.j(names, '을', '를')} ${v.act === 'on' ? '켰습니다' : '껐습니다'}.${tail}`;
  },
};

// ── 음성 ─────────────────────────────────────────
// 두 가지 길이 있다.
//   1) 항상 듣기: "자비스" 하고 부르면 띠링 → 이어지는 말을 명령으로 받는다.
//      태블릿 앱에서는 네이티브 JarvisListener 가 듣고, 브라우저에서는 웹 음성 인식으로 흉내 낸다.
//   2) 마이크 단추: 호출어 없이 바로 한 마디를 듣는다.
// 받은 말은 Home Assistant(기기 → AI 에이전트) → OpenClaw 순서로 넘긴다.
const Voice = {
  busy: false, history: [], wakeOn: false, _web: null, _webWoke: false,

  init() {
    $('mic').addEventListener('click', () => this.tapMic());
    this.applyWake();
  },

  wakeWords() {
    const w = (Cfg.get().wakeWord || '자비스').trim() || '자비스';
    const base = [w];
    if (w === '자비스') base.push('쟈비스', '자비쓰', '자빗스', '잡이스', '자비스야', 'jarvis', '재비스', '저비스');
    return base;
  },
  enabled() { const c = Cfg.get(); return c.wakeOn !== false; },   // 기본은 켜짐

  set(state) {
    $('mic').classList.toggle('listening', state === 'listen');
    $('mic').classList.toggle('busy', state === 'busy');
    const idle = this.wakeOn ? `"${esc(this.wakeWords()[0])}" 하고 불러 주세요` : '눌러서 말하기';
    if (state === 'listen') $('vHint').textContent = '듣고 있습니다…';
    else if (state === 'busy') $('vHint').textContent = '생각 중…';
    else $('vHint').innerHTML = idle;
    $('mic').classList.toggle('armed', this.wakeOn && !state);
  },

  // 띠링 — 두 음을 짧게. 파일 없이 만들어서 어디서든 같은 소리.
  chime() {
    if (this.leaving) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ctx = this._ac || (this._ac = new C());
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      [[1318.5, 0], [1760, 0.11]].forEach(([f, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.32);
        o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.34);
      });
    } catch (e) {}
  },

  done() {
    if (this.leaving) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ctx = this._ac || (this._ac = new C());
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.27);
    } catch (e) {}
  },

  // 말이 끝나기를 기다리지 않는다: 중간 인식 결과가 이미 '실행할 수 있는 기기 명령' 이고
  // 0.35초 동안 그대로면 그 자리에서 실행한다. ("자비스 모니터 조명 꺼" → '꺼' 를 듣자마자)
  onPartial(text) {
    text = String(text || '').trim();
    if (this.busy || text.length < 3) return;
    clearTimeout(this._pt);
    // 문장이 동작 말로 끝났을 때만 (말하는 중간의 '모니터 조명 켜…져 있어?' 를 미리 실행하지 않게)
    if (!/(꺼|켜|줘|주세요|해|돌려|틀어|멈춰|%|퍼센트|프로|도)$/.test(text.replace(/[\s.!?]+$/, '')) || /(켜져|꺼져)$/.test(text)) return;
    if (!Cmd.ready(text) || Cmd.verb(text).act === 'ask') return;
    this._pt = setTimeout(async () => {
      if (this.busy) return;
      const J = Native.plugin('JarvisListener');
      this._early = { text, at: Date.now() };
      if (J && J.finish) { try { await J.finish(); } catch (e) {} }
      this.run(text);
    }, 400);
  },

  // ── 항상 듣기 켜고 끄기 ──
  async applyWake() {
    const want = this.enabled();
    const J = Native.plugin('JarvisListener');
    if (J) {
      if (!this._bound) {
        this._bound = true;
        J.addListener('wake', () => this.onWake());
        J.addListener('command', e => this.onCommand((e && e.text) || ''));
        J.addListener('partial', e => this.onPartial((e && e.text) || ''));
        J.addListener('error', e => { this.wakeOn = false; this.set(''); toast((e && e.message) || '음성 대기 오류'); });
      }
      try {
        if (want) { await J.start({ wakeWords: this.wakeWords(), lang: 'ko-KR' }); this.wakeOn = true; }
        else { await J.stop(); this.wakeOn = false; }
      } catch (e) { this.wakeOn = false; toast(e.message || '마이크 권한이 필요합니다'); }
      this.set(''); this.guard(); return;
    }
    // 브라우저: 연속 인식으로 흉내 (크롬 데스크톱 등)
    this.webStop();
    if (want && (window.SpeechRecognition || window.webkitSpeechRecognition)) { this.wakeOn = true; this.webStart(); }
    else this.wakeOn = false;
    this.set('');
  },

  // 화면 쪽 감시: 1분마다 귀가 살아 있는지 묻고, 멈춰 있으면 다시 켠다.
  // (앱 안쪽에도 감시자가 있지만, 그것까지 멈췄을 때를 대비한 두 번째 안전장치)
  guard() {
    clearInterval(this._guard);
    const J = Native.plugin('JarvisListener');
    if (!J || !this.wakeOn) return;
    this._guard = setInterval(async () => {
      if (!this.wakeOn || this.busy || document.hidden) return;
      let st = null;
      try { st = await Promise.race([J.status(), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 5000))]); } catch (e) {}
      const stuck = !st || !st.enabled || (st.running && st.sinceStart > 40000) || (st.paused && !this.busy);
      if (stuck) { try { await J.stop(); } catch (e) {} try { await J.start({ wakeWords: this.wakeWords(), lang: 'ko-KR' }); } catch (e) {} }
    }, 60000);
  },

  onWake() {
    if (this.busy) return;
    this.chime();
    $('vHeard').textContent = ''; $('vReply').textContent = '';
    this.set('listen');
  },

  async onCommand(text) {
    text = String(text || '').trim();
    clearTimeout(this._pt);
    if (this._early && Date.now() - this._early.at < 4000) { this._early = null; return; }   // 중간 결과로 이미 실행함
    if (!text) { this.set(''); $('vReply').textContent = '잘 못 들었습니다. 다시 불러 주세요.'; return; }
    await this.run(text);
  },

  async run(text) {
    if (this.busy) return;
    this.busy = true;
    $('vHeard').textContent = text; $('vReply').textContent = '';
    this.set('busy');
    try {
      this._devOk = false;
      const reply = await this.handle(text);
      if (reply) {
        $('vReply').textContent = reply;
        // 기기를 켜고 끈 경우엔 말로 되읽지 않고 '딩' 한 번 — 다음 명령을 바로 받을 수 있게.
        if (this._devOk) this.done(); else await this.speak(reply);
      }
    } catch (e) {
      $('vReply').textContent = e.message || String(e);
    } finally {
      this.busy = false; this.set('');
    }
  },

  async tapMic() {
    const J = Native.plugin('JarvisListener');
    if (J && this.wakeOn) {                // 호출어 없이 바로 명령 듣기
      this.chime(); this.set('listen');
      $('vHeard').textContent = ''; $('vReply').textContent = '';
      try { await J.listenNow(); } catch (e) {}
      return;
    }
    if (this.busy) return;
    this.set('listen');
    $('vHeard').textContent = ''; $('vReply').textContent = '';
    try {
      this.webStop();
      const text = await this.recognizeOnce();
      if (text) await this.run(text);
      else { this.set(''); $('vReply').textContent = '잘 못 들었습니다. 다시 눌러 말씀해 주세요.'; }
    } catch (e) { this.set(''); $('vReply').textContent = e.message || String(e); }
    finally { if (this.wakeOn && !Native.plugin('JarvisListener')) this.webStart(); }
  },

  async recognizeOnce() {
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
      const r = new W();
      r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1;
      let got = '';
      r.onresult = e => { got = e.results[0][0].transcript; };
      r.onerror = e => (e.error === 'no-speech' ? res('') : rej(new Error('음성 인식 오류: ' + e.error)));
      r.onend = () => res(got);
      r.start();
    });
  },

  // 호출어 뒤의 말. 호출어가 없으면 null.
  afterWake(raw) {
    const norm = x => String(x).toLowerCase().replace(/[\s.,!?~]/g, '');
    const n = norm(raw);
    for (const w of this.wakeWords().map(norm)) {
      const at = n.indexOf(w);
      if (at < 0) continue;
      let seen = 0, cut = raw.length;
      for (let k = 0; k < raw.length; k++) { if (!/[\s.,!?~]/.test(raw[k])) seen++; if (seen === at + w.length) { cut = k + 1; break; } }
      return raw.slice(cut).replace(/^\s*(야|아|님|씨)?[\s,.!?]*/, '').trim();
    }
    return null;
  },

  webStart() {
    const W = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!W || this._web) return;
    const r = new W(); this._web = r;
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    let pendingCmd = false;
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (pendingCmd) { if (e.results[i].isFinal) { pendingCmd = false; this.onCommand(t); } else this.onPartial(t); continue; }
        const rest = this.afterWake(t);
        if (rest == null) continue;
        if (!this._webWoke) { this._webWoke = true; this.onWake(); }
        if (!e.results[i].isFinal) this.onPartial(rest);
        if (e.results[i].isFinal) {
          this._webWoke = false;
          if (rest.length >= 2) this.onCommand(rest); else pendingCmd = true;
        }
      }
    };
    r.onend = () => { if (this._web === r) { this._web = null; if (this.wakeOn) setTimeout(() => this.webStart(), 300); } };
    r.onerror = e => { if (e.error === 'not-allowed') { this.wakeOn = false; this.set(''); } };
    try { r.start(); } catch (e) { this._web = null; }
  },
  webStop() { const r = this._web; this._web = null; if (r) try { r.abort(); } catch (e) {} },

  // 말하는 동안에는 듣지 않는다 (자기 목소리에 깨지 않게)
  async speak(text) {
    const clean = String(text).replace(/[*#`_>]/g, '').slice(0, 600);
    const J = Native.plugin('JarvisListener');
    const TTS = Native.plugin('TextToSpeech');
    if (TTS) {
      if (J && this.wakeOn) await J.pause().catch(() => {});
      try { await Promise.race([TTS.speak({ text: clean, lang: 'ko-KR', rate: 1.0 }), new Promise(r => setTimeout(r, 30000))]); } catch (e) {}
      finally { if (J && this.wakeOn) await J.resume().catch(() => {}); }
      return;
    }
    if ('speechSynthesis' in window) {
      this.webStop();
      await new Promise(res => {
        const u = new SpeechSynthesisUtterance(clean); u.lang = 'ko-KR';
        u.onend = u.onerror = () => res();
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        setTimeout(res, 20000);
      });
      if (this.wakeOn) this.webStart();
    }
  },

  // 1) 앱 열기 말 → 바로 연다  2) Home Assistant  3) OpenClaw(ChatGPT 구독)  4) 안내
  async handle(text) {
    const t = text.replace(/\s+/g, '');
    if (/(챗지피티|chatgpt|지피티)/i.test(t) && /(열어|켜|실행)/.test(t)) { this.openApp('chatgpt'); return 'ChatGPT 를 엽니다.'; }
    if (/(클로드|claude)/i.test(t) && /(열어|켜|실행)/.test(t)) { this.openApp('claude'); return 'Claude 를 엽니다.'; }

    // "할 일에 관리비 내기 추가해 줘" / "관리비 내기 할 일 추가" → 구글 할일(첫 번째 목록)에 넣는다. bashy.app 에도 그대로 보인다.
    const add = [text.match(/할\s*일\s*(?:에|로|목록에)\s*(.+?)\s*(?:을|를)?\s*(?:추가|넣어|등록|적어)/), text.match(/^(.+?)\s*(?:을|를)?\s*할\s*일\s*(?:에|로)?\s*(?:추가|넣어|등록|적어)/)]
      .map(m => m && m[1].trim()).find(x => x && x.length >= 2 && !/^할\s*일/.test(x));
    if (add) {
      const title = add;
      const j = await hubCall({ act: 'taskAdd', title });
      if (j.needConsent) return j.reason || '구글 할일 권한이 필요합니다';
      Tasks.load();
      return `할 일에 '${title}'${Cmd.j(title, '을', '를').slice(title.length)} 추가했습니다.`;
    }

    // 허브 화면에 보이는 기기 이름으로 먼저 직접 처리한다 ("모니터 조명 꺼 줘", "거실 불 켜", "모니터 조명 밝기 30").
    // Home Assistant 의 말 알아듣기는 샤오미처럼 이름 뒤에 영어가 붙은 기기를 못 찾는 일이 많다.
    try {
      const r = await Cmd.run(text);
      if (r) { this._devOk = !/(못|없|않|실패|어느)/.test(r); return r; }
    } catch (e) { return '실패했습니다: ' + e.message; }

    // 켜·꺼 같은 기기 말인데 대상을 못 찾았으면 AI 로 넘기지 않는다 — 느리고, 엉뚱한 대답('껐습니다')을 지어낸다.
    const deviceish = !!Cmd.verb(text) || Cmd.KINDS.some(k => k.re.test(text));
    try {
      const r = await HA.converse(text, deviceish);
      if (r) return r;
    } catch (e) { console.warn('[hub] HA converse', e); }
    if (deviceish) return '어떤 기기인지 찾지 못했습니다. 기기 이름이나 공간(거실·침실1)을 넣어 다시 말씀해 주세요.';

    const c = Cfg.get();
    if (c.aiUrl) return this.askAI(text, c);
    return HA.ready
      ? '집 기기 명령으로는 알아듣지 못했습니다.'
      : '아직 연결된 곳이 없습니다. ⚙ 설정에서 Home Assistant 를 연결해 주세요.';
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
      catch (e) { toast('앱이 설치되어 있지 않습니다'); return; }
    }
    window.open(WEB[which], '_blank', 'noopener');
  },
};


// ── 클라우드 설정 · bashy 계정 연결 ───────────────────
// 연결 코드 하나만 있으면 나머지 설정(HA·OpenClaw·호출어)은 /api/hub 의 cfgGet/cfgPut 으로 오간다.
// 새 기기는 '연결' 을 눌러 6자리 번호를 띄우고, 로그인된 bashy.app 에서 승인하면 코드와 설정을 함께 받는다.
const CLOUD_KEYS = ['provider', 'haUrl', 'haUrlExt', 'haToken', 'aiUrl', 'aiToken', 'aiModel', 'wakeWord', 'wakeOn', 'night'];
const Cloud = {
  pick(c) { const o = {}; for (const k of CLOUD_KEYS) if (c[k] !== undefined) o[k] = c[k]; return o; },
  // 받은 설정을 이 기기에 적용한다. 바뀐 것만 다시 연결한다.
  apply(cfg, code) {
    const prev = Cfg.get(), next = { ...prev, ...(code ? { code } : {}) };
    if (cfg) { for (const k of CLOUD_KEYS) if (cfg[k] !== undefined) next[k] = cfg[k]; next.cfgAt = cfg.at || new Date().toISOString(); }
    Cfg.set(next);
    if (next.code !== prev.code) { Usage.load(); Tasks.load(); }
    if (next.provider !== prev.provider || next.haUrl !== prev.haUrl || next.haUrlExt !== prev.haUrlExt || next.haToken !== prev.haToken) { HA._retry = 0; HA._ui = 0; HA.connect(); }
    if (next.wakeOn !== prev.wakeOn || next.wakeWord !== prev.wakeWord) Voice.applyWake();
    Clock.tick();
  },
  async push() {
    const c = Cfg.get();
    if (!c.code) return;
    try { const j = await hubCall({ act: 'cfgPut', cfg: this.pick(c) }); Cfg.set({ ...Cfg.get(), cfgAt: j.at }); }
    catch (e) { console.warn('[hub] cfgPut', e); }
  },
  // 켤 때마다: 클라우드가 더 새것이면 받고, 클라우드가 비었거나 이 기기가 더 새것이면 올린다.
  async sync() {
    const c = Cfg.get();
    if (!c.code) return;
    try {
      const { cfg } = await hubCall({ act: 'cfgGet' });
      if (cfg && cfg.at && (!c.cfgAt || cfg.at > c.cfgAt)) this.apply(cfg);
      else if ((!cfg || !cfg.at || c.cfgAt > cfg.at) && (c.haUrl || c.haUrlExt || c.aiUrl)) await this.push();
    } catch (e) { console.warn('[hub] cfg sync', e); }
  },

  _poll: null,
  async startPair() {
    const box = $('pairBox');
    this.stopPair();
    box.innerHTML = '<p class="s-help">번호를 받는 중…</p>';
    let p;
    try {
      const r = await fetch(HUB_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'pairStart' }) });
      p = await r.json();
      if (!r.ok) throw new Error(p.error || r.status);
    } catch (e) { box.innerHTML = `<p class="s-help">연결 준비 실패: ${esc(e.message)}</p><button type="button" class="chip" id="pairBtn">다시 시도</button>`; $('pairBtn').onclick = () => this.startPair(); return; }
    const url = `https://bashy.app/?pair=${p.pin}`;
    let qr = '';
    try { if (window.qrcode) { const q = qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 0 }); } } catch {}
    box.innerHTML = `<div class="pair-wait">
        ${qr ? `<div class="pair-qr">${qr}</div>` : ''}
        <div class="pair-txt">
          <div class="pair-pin">${p.pin.slice(0, 3)} ${p.pin.slice(3)}</div>
          <div>휴대폰 카메라로 QR 을 찍거나,<br><b>bashy.app → 프로필 → 기기 연결</b> 에 이 번호를 넣고 승인해 주세요.</div>
          <div id="pairLeft" class="s-help"></div>
        </div>
      </div>
      <button type="button" class="chip" id="pairCancel">취소</button>`;
    $('pairCancel').onclick = () => { this.stopPair(); this.renderAcct(); };
    const tick = async () => {
      const left = Math.max(0, Math.round((p.exp - Date.now()) / 1000));
      const el = $('pairLeft'); if (el) el.textContent = `${Math.floor(left / 60)}분 ${left % 60}초 안에 승인해 주세요`;
      if (left <= 0) { this.stopPair(); this.renderAcct('번호가 만료되었습니다. 다시 눌러 주세요.'); return; }
      try {
        const r = await fetch(HUB_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'pairPoll', pin: p.pin, pairId: p.pairId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { this.stopPair(); this.renderAcct(j.error || '연결 실패'); return; }
        if (j.code) {
          this.stopPair();
          this.apply(j.cfg, j.code);
          if (!j.cfg && (Cfg.get().haUrl || Cfg.get().aiUrl)) await this.push();   // 클라우드가 비어 있으면 이 기기 설정을 올린다
          Settings.fill();
          this.renderAcct();
          toast('bashy 계정에 연결했습니다');
          return;
        }
      } catch {}
      this._poll = setTimeout(tick, 2500);
    };
    tick();
  },
  stopPair() { clearTimeout(this._poll); this._poll = null; },
  renderAcct(msg) {
    const box = $('pairBox'), c = Cfg.get();
    const on = !!c.code;
    box.innerHTML = `<p class="s-help">${msg ? esc(msg) + '<br>' : ''}${on
      ? '✓ bashy 계정에 연결되어 있습니다. 아래 설정을 바꾸고 저장하면 클라우드에도 저장되어, 같은 계정으로 연결한 다른 기기에도 그대로 적용됩니다.'
      : 'bashy 계정으로 연결하면 AI 사용량·할 일·Home Assistant·음성 AI 설정을 클라우드에서 한 번에 받아 옵니다. 다른 기기도 같은 계정으로 연결만 하면 바로 씁니다.'}</p>
      <button type="button" id="pairBtn" class="chip ${on ? '' : 'chip-acc'}">${on ? '다른 계정으로 다시 연결' : 'bashy 계정으로 연결'}</button>`;
    $('pairBtn').onclick = () => this.startPair();
  },
};

// ── 설정 창 ──────────────────────────────────────
const Settings = {
  init() {
    $('gear').addEventListener('click', () => this.open());
    const dlg = $('settings');
    // 닫으면(닫기·바깥 누르기·뒤로) 항상 저장한다 — 바뀐 게 있을 때만
    dlg.addEventListener('close', () => { Cloud.stopPair(); this.saveIfChanged(); });
    $('setTest').addEventListener('click', () => this.test());
    $('provSel').addEventListener('change', () => this.showProv());
    $('stLink').addEventListener('click', () => this.stLink());
  },
  open() {
    this.fill();
    Cloud.renderAcct();
    $('setStatus').textContent = '';
    this.showProv();
    $('settings').showModal();
  },
  // 고른 연결 방식에 필요한 칸만 보인다
  showProv() {
    const p = $('provSel').value;
    document.querySelectorAll('#setForm .prov').forEach(d => { d.hidden = d.dataset.prov !== p; });
    if (p === 'st') this.stState();
  },
  async stState() {
    const el = $('stState'), btn = $('stLink');
    if (!Cfg.get().code && !$('setForm').elements.code.value.trim()) { el.textContent = '먼저 위에서 bashy 계정으로 연결해 주세요'; btn.hidden = true; return; }
    btn.hidden = false; el.textContent = '확인 중…';
    try {
      const j = await hubCall({ act: 'stDevices' });
      el.textContent = `연결됨 · 방 ${Object.keys(j.rooms || {}).length} · 기기 ${(j.devices || []).length}`;
      btn.textContent = '다른 SmartThings 계정 연결하기'; btn.classList.remove('chip-acc');
    } catch (e) {
      el.textContent = /연결되어 있지 않습니다/.test(e.message) ? '아직 연결하지 않았습니다' : /준비 중/.test(e.message) ? 'SmartThings 연동 준비 중입니다 (서버 설정 대기)' : '확인 실패: ' + e.message;
      btn.textContent = 'SmartThings 계정 연결하기'; btn.classList.add('chip-acc');
    }
  },
  async stLink() {
    try {
      const j = await hubCall({ act: 'stStart' });
      const B = Native.plugin('Browser');
      if (B) await B.open({ url: j.url }); else window.open(j.url, '_blank');
      $('stState').textContent = '삼성 계정에서 허용한 뒤 이 화면으로 돌아오세요';
      clearTimeout(this._stT); this._stT = setTimeout(() => this.stState(), 20000);
    } catch (e) { $('stState').textContent = e.message; }
  },
  saveIfChanged() {
    const prev = Cfg.get(), v = this.read();
    const changed = Object.keys(v).some(k => (v[k] ?? '') !== (k === 'wakeOn' ? prev[k] !== false : (prev[k] ?? (typeof v[k] === 'boolean' ? false : ''))));
    if (changed) this.save();
  },
  fill() {
    const c = Cfg.get(), f = $('setForm');
    for (const k of ['code', 'haUrl', 'haUrlExt', 'haToken', 'aiUrl', 'aiToken', 'aiModel']) f.elements[k].value = c[k] || '';
    if (f.elements.provider) f.elements.provider.value = HA.useST(c) ? 'st' : 'ha';
    f.elements.night.checked = !!c.night;
    f.elements.wakeOn.checked = c.wakeOn !== false;
    f.elements.wakeWord.value = c.wakeWord || '';
  },
  read() {
    const f = $('setForm'), v = {};
    for (const k of ['code', 'haUrl', 'haUrlExt', 'haToken', 'aiUrl', 'aiToken', 'aiModel']) v[k] = f.elements[k].value.trim();
    if (f.elements.provider) v.provider = f.elements.provider.value === 'google' ? 'st' : f.elements.provider.value;
    v.night = f.elements.night.checked;
    v.wakeOn = f.elements.wakeOn.checked;
    v.wakeWord = f.elements.wakeWord.value.trim();
    return v;
  },
  save() {
    const prev = Cfg.get(), v = this.read();
    Cfg.set({ ...prev, ...v, cfgAt: new Date().toISOString() });
    Cloud.push();
    if (v.code !== prev.code) { Usage.load(); Tasks.load(); }
    if (v.provider !== prev.provider || v.haUrl !== prev.haUrl || v.haUrlExt !== prev.haUrlExt || v.haToken !== prev.haToken) { HA._retry = 0; HA._ui = 0; HA.connect(); }
    if (v.wakeOn !== (prev.wakeOn !== false) || v.wakeWord !== (prev.wakeWord || '')) Voice.applyWake();
    Clock.tick();
    toast('설정을 저장했습니다');
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
    if (v.haUrlExt) out.push((await this.testHA({ ...v, haUrl: v.haUrlExt })).replace('Home Assistant', 'Home Assistant(외부)'));
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
// 앱으로 돌아가기: 듣던 마이크를 먼저 끄고(끄지 않으면 넘어가는 순간 인식이 끊기며 '띠링' 이 울렸다), 화면 방향을 풀고 이동한다
async function backToApp() {
  Voice.leaving = true;
  try { Voice.webStop(); } catch (e) {}
  const J = Native.plugin('JarvisListener');
  if (J) { try { await Promise.race([J.stop(), new Promise(r => setTimeout(r, 400))]); } catch (e) {} }
  await setOrient('portrait');
  location.href = 'index.html?nohub=1';
}

// 화면 방향 바꾸기: 우리 앱 플러그인(가로 양쪽 허용)을 먼저, 없으면 Capacitor 방향 플러그인
async function setOrient(mode) {
  const B = Native.plugin('BashyNative');
  if (B && B.setOrientation) { try { await B.setOrientation({ mode }); return; } catch (e) {} }
  const SO = Native.plugin('ScreenOrientation');
  if (SO) { try { await SO.lock({ orientation: mode }); } catch (e) {} }
}

function nativeSetup() {
  const b = $('backApp'); if (b) b.addEventListener('click', backToApp);
  if (!Native.on) return;
  // 휴대폰에서 허브를 열면 가로로 돌린다(태블릿은 원래 가로)
  if (document.body.classList.contains('hub-mode')) {
    setOrient('landscape');
    setTimeout(() => setOrient('landscape'), 800);   // 처음 한 번이 화면 준비 전에 가면 무시될 때가 있다
  }
  const KA = Native.plugin('KeepAwake');
  if (KA) KA.keepAwake().catch(() => {});
  const SB = Native.plugin('StatusBar');
  if (SB) SB.hide().catch(() => {});
}

function boot() {
  // 앱(설정 › 허브 모드)에서 왔는데 연결 코드가 없으면, 로그인한 계정으로 연결하러 앱에 잠깐 다녀온다
  const fromApp = /[?&]from=app/.test(location.search) || document.body.classList.contains('hub-mode');
  if (fromApp && !Cfg.get().code && !/[?&]linked=0/.test(location.search)) { location.replace('index.html?nohub=1&linkhub=1'); return; }
  Clock.init(); Weather.init(); Usage.init(); Tasks.init();
  HA.bind(); HA.connect();
  Voice.init(); Settings.init(); DevSettings.init();
  nativeSetup();
  Cloud.sync();
  window.addEventListener('resize', () => { if (Usage.data) Usage.sparks(Usage.data.hist || {}); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { Usage.load(); Tasks.load(); Cloud.sync(); if (HA.mode === 'st') ST.poll(); else if (HA.mode === 'apple') AH.load(); else if (!HA.ready && (Cfg.get().haUrl || Cfg.get().haUrlExt)) { HA._retry = 0; HA.connect(); } }
  });
  if (!fromApp && !Cfg.get().code && !Cfg.get().haUrl && !Cfg.get().haUrlExt) setTimeout(() => Settings.open(), 600);
}

window.Hub = { HA, Usage, Voice, Tasks, Cfg, Cloud, Cmd };   // 디버깅용
boot();
})();
