// js/weather.js — 상단바 요일 옆의 작은 날씨(아이콘 + 기온). 위젯 요약에도 같이 실린다.
// 위치: 기기 위치(앱은 기기 위치 기능, 웹은 브라우저)로 — 허락은 계정마다 한 번만 묻는다(아래 locate). 허락이 없으면 서버가 접속 위치로 찾는다.
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
    drizzle: '<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.6 4.5 4.5 0 0 0 7 15.5Z"/><path d="M9 18.5v1M13 18.5v1M17 18.5v1"/>',
    'rain-heavy': '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 5.6 4.5 4.5 0 0 0 7 14.5Z"/><path d="m7.5 17-1.5 3M11 17l-1.5 3M14.5 17 13 20M18 17l-1.5 3"/>',
    sleet: '<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.6 4.5 4.5 0 0 0 7 15.5Z"/><path d="m9 18.5-1 2M15 18.5l-1 2"/><path d="M12 19.5h.01"/>',
    'snow-heavy': '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 5.6 4.5 4.5 0 0 0 7 14.5Z"/><path d="M8 17.5h.01M12 17.5h.01M16 17.5h.01M10 20.5h.01M14 20.5h.01"/>',
    hail: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 5.6 4.5 4.5 0 0 0 7 14.5Z"/><circle cx="9" cy="18.5" r=".9"/><circle cx="13" cy="20" r=".9"/><circle cx="16.5" cy="18" r=".9"/><path d="m11.5 15.5-1 2h2l-1 2"/>',
  },
  icon(n, cls = 'wx-ic') { return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.IC[n] || this.IC.cloud}</svg>`; },
  // ── 위치: 기기 위치(GPS·와이파이)로 — 허락 안 하면 접속 위치(서버가 IP 로)로 ──
  // 좌표는 0.05도(약 5km)로 뭉개서 쓴다: 날씨에는 충분하고, 정확한 자리는 어디에도 남지 않는다.
  // 위치 허락은 계정마다 한 번만 묻는다 (gl_wx_ask: 'yes'·'no' — 계정에 같이 저장돼 다른 기기·다시 설치해도 따라간다)
  //   앱(iOS·안드로이드): 기기 위치 기능(@capacitor/geolocation)으로 — 운영체제가 한 번 묻고 기억한다.
  //     예전엔 웹뷰의 위치 기능을 써서 iOS 가 앱을 켤 때마다 "bashy.app 이(가) 위치를 사용하려고 합니다" 를 다시 물었다.
  //   웹: 브라우저가 이미 허락돼 있으면 조용히 받고, 아직이면 이 계정에서 처음 한 번만 묻는다.
  //   묻지 않는 기기에서는 계정에 저장된 마지막 좌표(5km 단위)를 그대로 쓴다.
  // 날씨 위치는 사용자가 고른 도시로 본다(gl_wx_city — 계정에 저장돼 다른 기기에도 따라간다).
  //   도시를 고를 때만: ① 도시 이름으로 찾기(Open-Meteo 지명 검색) ② '지금 위치로 찾기' — 위치를 딱 한 번 받아 가장 가까운 도시 이름으로.
  //   그 뒤로는 위치(GPS)를 다시 묻지 않는다. 아직 안 골랐으면 예전에 받아 둔 좌표, 그것도 없으면 접속 위치(시·구 수준)로.
  GEO_KEY: 'gl_wx_geo', GEO_ON: 'gl_wx_gps', ASK_KEY: 'gl_wx_ask', CITY_KEY: 'gl_wx_city',
  GEO_ACCT: 'gl_wx_geo_a',
  get gpsOn() { return false; },
  setGps() {},
  city() { try { const c = JSON.parse(localStorage.getItem(this.CITY_KEY) || 'null'); return c && isFinite(c.lat) && isFinite(c.lon) ? c : null; } catch (e) { return null; } },
  setCity(c) {
    try { if (c) localStorage.setItem(this.CITY_KEY, JSON.stringify({ name: c.name, sub: c.sub || '', lat: Math.round(c.lat * 100) / 100, lon: Math.round(c.lon * 100) / 100 })); else localStorage.removeItem(this.CITY_KEY); } catch (e) {}
    try { window.FirebaseSync?.scheduleSave?.(); } catch (e) {}
    this.H = null; try { localStorage.removeItem(this.HIST_KEY); localStorage.removeItem(this.KEY); } catch (e) {}
    this.load(true); this.loadHist(true);
  },
  geo() {
    const c = this.city(); if (c) return { lat: c.lat, lon: c.lon, at: Date.now() };
    try { const a = JSON.parse(localStorage.getItem(this.GEO_ACCT) || 'null'); return a && a.lat != null ? { lat: a.lat, lon: a.lon, at: 0 } : null; } catch (e) { return null; }
  },
  _q() { const g = this.geo(), c = this.city(); return g ? `lat=${g.lat}&lon=${g.lon}${c ? '&city=' + encodeURIComponent(c.name) : ''}` : ''; },
  _nGeo() { try { return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.Geolocation || null : null; } catch (e) { return null; } },
  async _pos(N) {
    if (N) {
      try { await N.requestPermissions?.({ permissions: ['coarseLocation'] }); } catch (e) {}
      try { const p = await N.getCurrentPosition({ enableHighAccuracy: false, maximumAge: 30 * 60000, timeout: 10000 }); return p && p.coords ? p.coords : null; } catch (e) { return null; }
    }
    if (!navigator.geolocation) return null;
    return new Promise(res => navigator.geolocation.getCurrentPosition(p => res(p.coords), () => res(null), { enableHighAccuracy: false, maximumAge: 30 * 60000, timeout: 10000 }));
  },
  locate() { return Promise.resolve(this.geo()); },   // 자동으로 위치를 묻지 않는다
  // ── 도시 고르기 ──
  pick() {
    const c = this.city();
    App.openModal('@sun 날씨 볼 도시', `<div class="fz fz-wxc">
      <p class="fz-note">${c ? `지금: <b>${esc(c.name)}</b>${c.sub ? ' · ' + esc(c.sub) : ''}` : '아직 도시를 고르지 않았습니다 — 지금은 접속 위치로 봅니다'}</p>
      <input id="wxcQ" class="inp" type="search" placeholder="도시 이름 (예: 수원, 강남구, Tokyo)" autocomplete="off" oninput="Weather._find(this.value)">
      <div id="wxcList" class="wxc-list"></div>
      <button type="button" class="fz-act" onclick="Weather._here(this)"><span>지금 위치로 찾기</span><small>위치를 이번 한 번만 씁니다</small></button>
      ${c ? `<button type="button" class="fz-act" onclick="Weather.setCity(null);App.closeModal();App.showToast('접속 위치로 봅니다')"><span>도시 지우기</span><small>접속 위치(시·구 수준)로 보기</small></button>` : ''}
    </div>`);
    setTimeout(() => document.getElementById('wxcQ')?.focus(), 200);
  },
  _find(q) {
    clearTimeout(this._ft); q = String(q || '').trim();
    const box = document.getElementById('wxcList'); if (!box) return;
    if (q.length < 1) { box.innerHTML = ''; return; }
    this._ft = setTimeout(async () => {
      // 두 지명 검색을 합친다: Open-Meteo(인구 순, '수원'→'수원시' 도 같이) + OpenStreetMap(구·군 이름에 강함). 큰 도시가 위로
      const om = async n => { try { const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(n)}&count=8&language=ko&format=json`)).json();
        return (j.results || []).map(x => ({ name: x.name, sub: [x.admin1, x.country].filter(Boolean).join(' · '), lat: x.latitude, lon: x.longitude, rank: x.population || 0 })); } catch (e) { return []; } };
      const osm = async n => { try { const j = await (await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(n)}&format=jsonv2&accept-language=ko&limit=6&addressdetails=1`)).json();
        const big = { city: 800000, borough: 500000, county: 300000, province: 900000, state: 900000, town: 100000, municipality: 200000, district: 200000 };
        return (j || []).filter(x => big[x.addresstype] || x.addresstype === 'village' || x.addresstype === 'suburb').map(x => { const a = x.address || {};
          return { name: x.name, sub: [a.city !== x.name ? a.city : '', a.province || a.state, a.country].filter(Boolean).join(' · '), lat: Number(x.lat), lon: Number(x.lon), rank: big[x.addresstype] || Math.round((x.importance || 0) * 1000) }; }); } catch (e) { return []; } };
      try {
        const extra = /[시구군도]$/.test(q) || !/[가-힣]/.test(q) ? [] : [om(q + '시')];
        const all = (await Promise.all([om(q), osm(q), ...extra])).flat();
        const seen = new Set(), r = [];
        for (const x of all.sort((a, b) => b.rank - a.rank)) {
          const k = x.name + '|' + Math.round(x.lat * 10) + '|' + Math.round(x.lon * 10); if (seen.has(k)) continue; seen.add(k); r.push(x); if (r.length >= 8) break;
        }
        this._res = r;
        box.innerHTML = r.length ? r.map((x, i) => `<button type="button" class="wxc-it" onclick="Weather._choose(${i})"><b>${esc(x.name)}</b><small>${esc(x.sub)}</small></button>`).join('') : '<p class="fz-note">찾는 도시가 없습니다 — 다른 이름(시·구 단위, 영어)으로 찾아 보세요</p>';
      } catch (e) { box.innerHTML = '<p class="fz-note">도시를 찾지 못했습니다 — 인터넷 연결을 확인해 주세요</p>'; }
    }, 300);
  },
  _choose(i) { const x = (this._res || [])[i]; if (!x) return; this.setCity(x); App.closeModal(); App.showToast(`${x.name} 날씨로 봅니다`, 'success'); },
  async _here(btn) {
    if (btn) { btn.disabled = true; btn.querySelector('span').textContent = '위치 확인 중…'; }
    const c = await this._pos(this._nGeo());
    if (!c) { if (btn) { btn.disabled = false; btn.querySelector('span').textContent = '지금 위치로 찾기'; } App.showToast('위치를 받지 못했습니다 — 도시 이름으로 찾아 주세요', 'error'); return; }
    let name = '', sub = '';
    try {
      const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${c.latitude}&longitude=${c.longitude}&localityLanguage=ko`)).json();
      name = j.locality || j.city || ''; sub = [j.principalSubdivision, j.countryName].filter(Boolean).join(' · ');
      if (j.city && j.locality && j.city !== j.locality) { name = `${j.city} ${j.locality}`; }
    } catch (e) {}
    this.setCity({ name: name || '내 위치', sub, lat: c.latitude, lon: c.longitude });
    App.closeModal(); App.showToast(`${name || '내 위치'} 날씨로 봅니다`, 'success');
  },
  cached() { try { const v = JSON.parse(localStorage.getItem(this.KEY) || 'null'); return v && v.ok ? v : null; } catch (e) { return null; } },
  async load(force) {
    const c = this.cached();
    if (c) this.w = c;
    try {
      const g0 = this.geo(); await this.locate(); const g = this.geo();
      const moved = (g0 && g0.lat) !== (g && g.lat) || (g0 && g0.lon) !== (g && g.lon);
      if (!force && !moved && c && Date.now() - c.at < this.TTL) return c;
      const q = this._q();
      const r = await fetch(Platform.api('/api/weather' + (q ? '?' + q : '')));
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
      await this.locate(); const q = this._q();
      const j = await (await fetch(Platform.api('/api/weather?hist=1' + (q ? '&' + q : '')))).json();
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
    const lbl = `${w.name}${today ? ` 지금 ${w.t}도,` : ''} 최저 ${w.lo}도, 최고 ${w.hi}도 — 누르면 간단 표시`;
    // 다른 날: 지금 기온이 없으니 최저 / 최고만 조금 크게
    if (!today) return `<button type="button" class="hd-wxd wxd-day" onclick="event.stopPropagation();Weather.toggle()" aria-label="${lbl}"><span class="wxd-lo2 num">${n(w.lo)}</span><i class="wxd-sl">/</i><span class="wxd-hi2 num">${n(w.hi)}</span></button>`;
    return `<button type="button" class="hd-wxd" onclick="event.stopPropagation();Weather.toggle()" aria-label="${lbl}">
      <span class="wxd-now num"><span class="wxd-lo">${n(w.lo)}</span>${n(w.t)}<span class="wxd-hi">${n(w.hi)}</span></span></button>`;
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
    const k = { sun: 'sun', moon: 'moon', 'cloud-sun': 'cloud', 'cloud-moon': 'cloud', cloud: 'cloud', fog: 'fog', rain: 'rain', 'rain-heavy': 'rain', drizzle: 'rain', storm: 'rain', hail: 'hail', sleet: 'sleet', snow: 'snow', 'snow-heavy': 'snow' }[icon] || 'cloud';
    // 해 자리: p(0~1)에 따라 왼쪽→오른쪽, 한낮에 가장 높게(반원)
    const pos = `left:calc(${(p * 100).toFixed(1)}% - 8px);top:${(2 + (1 - Math.sin(Math.PI * p)) * 16).toFixed(1)}px`;
    const drops = (n, cls) => Array.from({ length: n }, (_, i) => { const sl = cls === 'wxf-s', hl = cls === 'wxf-h', base = sl ? 3.2 : hl ? 0.7 : cls.includes('dz') ? 1.3 : cls.includes('hv') ? 0.6 : 0.9;
      return `<i class="${cls}" style="left:${(i * 97 / n + (i % 3) * 4) % 96}%;animation-delay:${(i * 0.37) % 1.6}s;animation-duration:${base + (i % 4) * (sl ? 0.5 : 0.12)}s"></i>`; }).join('');
    let inner = '';
    const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M5.1 18.9l1.8-1.8M17.1 6.9l1.8-1.8"/></svg>';
    const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 14.6A7.6 7.6 0 1 1 9.4 4.5a6 6 0 0 0 10.1 10.1Z"/></svg>';
    if (k === 'sun') inner = `<i class="wxf-sun${still ? ' still' : ''}" style="${pos}">${SUN}</i>`;
    else if (k === 'moon') inner = `<i class="wxf-moon${still ? ' still' : ''}">${MOON}</i>`;
    // 구름: 해를 가린 채 떠다니지 않고 제자리에서 두둥실(구름 조금 = 한 장, 흐림 = 두 장)
    else if (k === 'cloud') inner = `<i class="wxf-cloud c1">${this.icon('cloud', 'wxf-cl')}</i>` + (icon === 'cloud' ? `<i class="wxf-cloud c2">${this.icon('cloud', 'wxf-cl')}</i>` : '');
    else if (k === 'fog') inner = '<i class="wxf-fog f1"></i><i class="wxf-fog f2"></i><i class="wxf-fog f3"></i>';
    else if (k === 'rain') {
      const n = icon === 'drizzle' ? 6 : icon === 'rain-heavy' || icon === 'storm' ? 14 : 9, cls = icon === 'drizzle' ? 'wxf-r dz' : icon === 'rain-heavy' ? 'wxf-r hv' : 'wxf-r';
      inner = drops(n, cls) + (icon === 'storm' ? '<i class="wxf-flash"></i><i class="wxf-bolt"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5Z"/></svg></i>' : '');
    }
    else if (k === 'hail') inner = drops(7, 'wxf-r') + drops(7, 'wxf-h') + '<i class="wxf-flash"></i>';
    else if (k === 'sleet') inner = drops(6, 'wxf-r') + drops(6, 'wxf-s');
    else if (k === 'snow') inner = drops(icon === 'snow-heavy' ? 16 : 10, 'wxf-s');
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
