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
  html() {
    const w = this.w || this.cached(); if (!w) return '';
    return `<button type="button" class="hd-wx" onclick="event.stopPropagation();Weather.tell()" aria-label="날씨 ${w.name} ${w.t}도">${this.icon(w.icon)}<span class="num">${w.t}°</span></button>`;
  },
  paint() { const el = document.getElementById('hWx'); if (el) el.innerHTML = this.html(); },
  tell() {
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
