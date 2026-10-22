// js/weather.js — 상단바 요일 옆의 작은 날씨(아이콘 + 기온). 위젯 요약에도 같이 실린다.
// 서버(/api/weather)가 접속 위치로 날씨를 찾아 준다 — 위치 권한을 따로 묻지 않는다.
// 20분 동안은 기억해 둔 값을 쓴다. 누르면 오늘 최고·최저와 비 올 확률이 짧게 뜬다.
const Weather = {
  KEY: 'gl_wx', TTL: 20 * 60000, w: null,
  // 가는 선 아이콘(24 격자, 1.8 선) — 이모지 대신
  IC: {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5Z"/>',
    'cloud-sun': '<path d="M8.5 5.2V3.6M3.6 8.5H2M4.9 4.9l-1.1-1.1M12.2 4.9l1.1-1.1"/><path d="M5.6 10.6a3.6 3.6 0 0 1 6.3-3.1"/><path d="M8 20h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8 12.1 4 4 0 0 0 8 20Z"/>',
    'cloud-moon': '<path d="M11.5 6.5A4 4 0 0 1 6 11"/><path d="M8 20h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8 12.1 4 4 0 0 0 8 20Z"/>',
    rain: '<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.6 4.5 4.5 0 0 0 7 15.5Z"/><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>',
    snow: '<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.6 4.5 4.5 0 0 0 7 15.5Z"/><path d="M8.5 19h.01M12 20.5h.01M15.5 19h.01"/>',
    fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
    storm: '<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.6 4.5 4.5 0 0 0 7 15.5Z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>',
  },
  icon(n, cls = 'wx-ic') { return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.IC[n] || this.IC.cloud}</svg>`; },
  cached() { try { const v = JSON.parse(localStorage.getItem(this.KEY) || 'null'); return v && v.ok ? v : null; } catch (e) { return null; } },
  async load(force) {
    const c = this.cached();
    if (c) this.w = c;
    if (!force && c && Date.now() - c.at < this.TTL) return c;
    try {
      const r = await fetch(Platform.api('/api/weather'));
      const j = await r.json();
      if (j && j.ok) { this.w = j; try { localStorage.setItem(this.KEY, JSON.stringify(j)); } catch (e) {} this.paint(); try { Widgets.push(); } catch (e) {} }
    } catch (e) {}
    return this.w;
  },
  // 표시 방식: simple(아이콘+기온) · detail(최저-지금-최고 호 + 날짜 위 날씨 효과) · off — 이 기기에 저장
  MODE_KEY: 'gl_wx_mode',
  get mode() { const v = localStorage.getItem(this.MODE_KEY); return v === 'detail' || v === 'off' ? v : 'simple'; },
  setMode(v) {
    localStorage.setItem(this.MODE_KEY, v);
    try { App._updateHeaderDate(App.S.selDate || new Date()); } catch (e) {}
    try { Haptic.light(); } catch (e) {}
  },
  // 날씨를 누르면 간단 ↔ 세부
  toggle() {
    const next = this.mode === 'detail' ? 'simple' : 'detail';
    this.setMode(next);
    App.showToast(next === 'detail' ? '날씨 세부 표시 — 다시 누르면 간단히' : '날씨 간단 표시 — 다시 누르면 세부로');
  },
  // ── 날짜별 기록(서버 /api/weather?hist=1 — 2026-01-01 부터, 앞으로 16일 예보까지) ──
  HIST_KEY: 'gl_wx_hist', H: null,
  _ds(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },
  isToday(d) { return !d || this._ds(d) === this._ds(new Date()); },
  hist() {
    if (!this.H) { try { this.H = JSON.parse(localStorage.getItem(this.HIST_KEY) || 'null'); } catch (e) {} }
    return this.H && this.H.days ? this.H.days : {};
  },
  async loadHist(force) {
    this.hist();
    if (!force && this.H && Date.now() - (this.H.at || 0) < 3 * 3600e3) return;
    if (this._hl) return; this._hl = true;
    try {
      const j = await (await fetch(Platform.api('/api/weather?hist=1'))).json();
      if (j && j.ok && j.days) { this.H = { at: Date.now(), days: j.days }; try { localStorage.setItem(this.HIST_KEY, JSON.stringify(this.H)); } catch (e) {} this.paint(); }
    } catch (e) {} finally { this._hl = false; }
  },
  // 그 날짜의 기록 { lo, hi, icon, name, f(예보) } — 오늘이면 지금 값
  day(d) {
    if (this.isToday(d)) return this.w || this.cached();
    const r = this.hist()[this._ds(d)];
    if (!r) this.loadHist();
    return r || null;
  },
  has(d) { const w = this.day(d); return !!w && this.mode !== 'off'; },
  html(d) {
    if (this.mode === 'off') return '';
    const today = this.isToday(d), w = this.day(d); if (!w) return '';
    if (this.mode === 'detail') return this.arc(w, today);
    if (!today) {   // 다른 날: 지금 기온 대신 그날 최저/최고
      return `<button type="button" class="hd-wx" onclick="event.stopPropagation();Weather.toggle()" aria-label="${this._ds(d)} ${w.name} 최저 ${w.lo}도 최고 ${w.hi}도${w.f ? ' (예보)' : ''}">${this.icon(w.icon)}<span class="num">${w.lo}°</span><i class="hd-wx-sl">/</i><span class="num">${w.hi}°</span></button>`;
    }
    return `<button type="button" class="hd-wx" onclick="event.stopPropagation();Weather.toggle()" aria-label="날씨 ${w.name} ${w.t}도 — 누르면 세부 표시">${this.icon(w.icon)}<span class="num">${w.t}°</span></button>`;
  },
  // 세부: 반원(호) 위에 최저(왼쪽, 작고 흐리게) · 지금(가운데, 크게) · 최고(오른쪽)
  // 간단 표시와 같은 자리(요일 옆)에 들어간다: 지금 기온이 맨 앞에 크게, 최저(왼쪽 아래)·최고(오른쪽 아래)는 뒤에 작고 흐리게,
  // 짧은 반지름으로 기울여 지금 기온을 감싼다. 살짝 겹쳐도 된다. (두 자리 기온 기준으로 맞춤)
  // 다른 날은 가운데에 지금 기온 대신 그날 하늘(아이콘)
  arc(w, today = true) {
    const n = v => (v == null || isNaN(v)) ? '–' : v + '°';
    const mid = today ? n(w.t) : this.icon(w.icon, 'wxd-ic');
    return `<button type="button" class="hd-wxd${today ? '' : ' wxd-day'}" onclick="event.stopPropagation();Weather.toggle()" aria-label="${w.name}${today ? ` 지금 ${w.t}도,` : ''} 최저 ${w.lo}도, 최고 ${w.hi}도 — 누르면 간단 표시">
      <span class="wxd-now num"><span class="wxd-lo">${n(w.lo)}</span>${mid}<span class="wxd-hi">${n(w.hi)}</span></span></button>`;
  },
  // 날짜 숫자 위에 얹는 날씨 효과(세부 표시일 때) — 해가 뜨고 · 구름이 흐르고 · 비가 내리고 · 눈이 내려 살짝 쌓인다
  // 해: 해 뜬 시각 → 진 시각 사이에서 날짜 숫자 위를 왼쪽에서 오른쪽으로 둥글게 지나간다. 해가 지면 달.
  _sunPos(w) {
    const mm = s => { const m = /^(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const r = mm(w.rise), st = mm(w.set); if (r == null || st == null || st <= r) return null;
    const n = new Date(), now = n.getHours() * 60 + n.getMinutes();
    return (now - r) / (st - r);
  },
  fx(d) {
    const w = this.day(d); if (!w || this.mode !== 'detail') return '';
    if (!this.isToday(d)) {   // 다른 날: 그날 하늘을 조용히(움직임 없이 해는 한가운데)
      return this._fxHtml(w.icon, 0.5, true);
    }
    const p = this._sunPos(w);
    let ic = w.icon;
    if (p != null && (ic === 'sun' || ic === 'moon')) ic = p >= 0 && p <= 1 ? 'sun' : 'moon';
    if (p != null && (ic === 'cloud-sun' || ic === 'cloud-moon')) ic = p >= 0 && p <= 1 ? 'cloud-sun' : 'cloud-moon';
    return this._fxHtml(ic, p == null ? 0.75 : Math.max(0, Math.min(1, p)), false, w);
  },
  _fxHtml(icon, p, still, w) {
    w = w || {};
    const k = { sun: 'sun', moon: 'moon', 'cloud-sun': 'cloud', 'cloud-moon': 'cloud', cloud: 'cloud', fog: 'fog', rain: 'rain', storm: 'rain', snow: 'snow' }[icon] || 'cloud';
    // 해 자리: p(0~1)에 따라 왼쪽→오른쪽, 한낮에 가장 높게(반원)
    const pos = `left:calc(${(p * 100).toFixed(1)}% - 8px);top:${(2 + (1 - Math.sin(Math.PI * p)) * 16).toFixed(1)}px`;
    const drops = (n, cls) => Array.from({ length: n }, (_, i) => `<i class="${cls}" style="left:${(i * 97 / n + (i % 3) * 4) % 96}%;animation-delay:${(i * 0.37) % 1.6}s;animation-duration:${(cls === 'wxf-s' ? 3.2 : 0.9) + (i % 4) * (cls === 'wxf-s' ? 0.5 : 0.12)}s"></i>`).join('');
    let inner = '';
    const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M5.1 18.9l1.8-1.8M17.1 6.9l1.8-1.8"/></svg>';
    const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 14.6A7.6 7.6 0 1 1 9.4 4.5a6 6 0 0 0 10.1 10.1Z"/></svg>';
    if (k === 'sun') inner = `<i class="wxf-sun${still ? ' still' : ''}" style="${pos}">${SUN}</i>`;
    else if (k === 'moon') inner = `<i class="wxf-moon${still ? ' still' : ''}">${MOON}</i>`;
    else if (k === 'cloud' && (icon === 'cloud-sun' || icon === 'cloud-moon')) inner = (icon === 'cloud-sun' ? `<i class="wxf-sun dim" style="${pos}">${SUN}</i>` : `<i class="wxf-moon dim">${MOON}</i>`) + `<i class="wxf-cloud c1">${this.icon('cloud', 'wxf-cl')}</i>`;
    else if (k === 'cloud') inner = `<i class="wxf-cloud c1">${this.icon('cloud', 'wxf-cl')}</i><i class="wxf-cloud c2">${this.icon('cloud', 'wxf-cl')}</i>`;
    else if (k === 'fog') inner = '<i class="wxf-fog f1"></i><i class="wxf-fog f2"></i>';
    else if (k === 'rain') inner = drops(9, 'wxf-r') + (icon === 'storm' ? '<i class="wxf-flash"></i>' : '');
    else if (k === 'snow') inner = drops(10, 'wxf-s') + '<i class="wxf-cap"></i>';
    return `<span class="wxfx wxfx-${k}" aria-hidden="true">${inner}</span>`;
  },
  paint() { try { App._updateHeaderDate(App.S.selDate || new Date()); } catch (e) { const el = document.getElementById('hWx'); if (el) el.innerHTML = this.html(); } },
  tell() {   // (예전) 누르면 짧게 알려 주던 것 — 이제 누르면 표시 방식을 바꾼다
    const w = this.w; if (!w) return;
    App.showToast(`${w.name} ${w.t}° · 체감 ${w.feels}° · 최고 ${w.hi}° 최저 ${w.lo}°${w.rain != null ? ` · 비 올 확률 ${w.rain}%` : ''}`);
  },
  init() {
    this.w = this.cached();
    this.load();
    setTimeout(() => this.loadHist(), 3000);
    setInterval(() => { if (!document.hidden) this.load(); }, this.TTL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.load(); });
  },
};
