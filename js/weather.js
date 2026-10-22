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
  html() {
    const w = this.w || this.cached(); if (!w || this.mode === 'off') return '';
    if (this.mode === 'detail') return this.arc(w);
    return `<button type="button" class="hd-wx" onclick="event.stopPropagation();Weather.toggle()" aria-label="날씨 ${w.name} ${w.t}도 — 누르면 세부 표시">${this.icon(w.icon)}<span class="num">${w.t}°</span></button>`;
  },
  // 세부: 반원(호) 위에 최저(왼쪽, 작고 흐리게) · 지금(가운데, 크게) · 최고(오른쪽)
  arc(w) {
    const n = v => (v == null || isNaN(v)) ? '–' : v + '°';
    return `<button type="button" class="hd-wxd" onclick="event.stopPropagation();Weather.toggle()" aria-label="${w.name} 지금 ${w.t}도, 최저 ${w.lo}도, 최고 ${w.hi}도 — 누르면 간단 표시">
      <svg viewBox="0 0 100 50" aria-hidden="true">
        <path class="wxd-line" d="M4 48 A46 46 0 0 1 96 48"/>
        <path class="wxd-line" d="M22.6 12.8 L38 48 M77.4 12.8 L62 48"/>
        <text class="wxd-lo" x="20" y="43" transform="rotate(-24 20 43)" text-anchor="middle">${n(w.lo)}</text>
        <text class="wxd-now" x="50" y="34" text-anchor="middle">${n(w.t)}</text>
        <text class="wxd-hi" x="80" y="43" transform="rotate(24 80 43)" text-anchor="middle">${n(w.hi)}</text>
      </svg></button>`;
  },
  // 날짜 숫자 위에 얹는 날씨 효과(세부 표시일 때) — 해가 뜨고 · 구름이 흐르고 · 비가 내리고 · 눈이 내려 살짝 쌓인다
  fx() {
    const w = this.w || this.cached(); if (!w || this.mode !== 'detail') return '';
    const k = { sun: 'sun', moon: 'moon', 'cloud-sun': 'cloud', 'cloud-moon': 'cloud', cloud: 'cloud', fog: 'fog', rain: 'rain', storm: 'rain', snow: 'snow' }[w.icon] || 'cloud';
    const drops = (n, cls) => Array.from({ length: n }, (_, i) => `<i class="${cls}" style="left:${(i * 97 / n + (i % 3) * 4) % 96}%;animation-delay:${(i * 0.37) % 1.6}s;animation-duration:${(cls === 'wxf-s' ? 3.2 : 0.9) + (i % 4) * (cls === 'wxf-s' ? 0.5 : 0.12)}s"></i>`).join('');
    let inner = '';
    if (k === 'sun') inner = '<i class="wxf-sun"></i>';
    else if (k === 'moon') inner = '<i class="wxf-moon"></i>';
    else if (k === 'cloud') inner = `<i class="wxf-cloud c1">${this.icon('cloud', 'wxf-cl')}</i><i class="wxf-cloud c2">${this.icon('cloud', 'wxf-cl')}</i>`;
    else if (k === 'fog') inner = '<i class="wxf-fog f1"></i><i class="wxf-fog f2"></i>';
    else if (k === 'rain') inner = drops(9, 'wxf-r') + (w.icon === 'storm' ? '<i class="wxf-flash"></i>' : '');
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
    setInterval(() => { if (!document.hidden) this.load(); }, this.TTL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.load(); });
  },
};
