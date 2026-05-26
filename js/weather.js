// js/weather.js — GPS 기반 날씨 (어제·오늘·내일 3일 표시)

const Weather = {
  WMO: {
    0:['맑음','☀️'],1:['대체로 맑음','🌤'],2:['부분 흐림','⛅'],3:['흐림','☁️'],
    45:['안개','🌫'],48:['안개','🌫'],51:['이슬비','🌦'],53:['이슬비','🌦'],
    55:['짙은 이슬비','🌧'],61:['비','🌧'],63:['비','🌧'],65:['강한 비','🌧'],
    71:['눈','🌨'],73:['눈','❄️'],75:['강한 눈','❄️'],77:['진눈깨비','🌨'],
    80:['소나기','🌦'],81:['소나기','🌧'],82:['강한 소나기','🌧'],
    85:['눈소나기','🌨'],86:['눈소나기','❄️'],95:['뇌우','⛈'],99:['뇌우','⛈'],
  },
  code(c){ return this.WMO[c] || ['날씨','🌤']; },

  _localDateStr(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  },

  async init() {
    const el = document.getElementById('hWeather');
    if (!el) return;
    el.innerHTML = '<span style="color:var(--text3);font-size:11px">🌤 로딩중</span>';
    // 전체 타임아웃: 16초 내에 완료 안 되면 fallback UI 표시
    // (GPS 최대 3초 + fetch 최대 10초 + 여유 3초)
    const globalTimer = setTimeout(() => {
      const el2 = document.getElementById('hWeather');
      if (el2 && el2.innerHTML.includes('로딩중')) {
        el2.innerHTML = '<span style="color:var(--text3);font-size:11px">🌤 날씨 정보 없음</span>';
      }
    }, 16000);
    try {
      let lat = CONFIG.WEATHER_LAT, lon = CONFIG.WEATHER_LON;
      try {
        const pos = await this._getPos();
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch { /* GPS 실패 시 기본 좌표 사용 */ }
      await this._render(lat, lon);
    } catch(e) {
      console.warn('[Weather] 렌더 실패:', e.message);
      const el2 = document.getElementById('hWeather');
      if (el2) el2.innerHTML = '<span style="color:var(--text3);font-size:11px">🌤 날씨 정보 없음</span>';
    } finally {
      clearTimeout(globalTimer);
    }
  },

  _getPos() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('no geo')); return; }
      // GPS 타임아웃을 3초로 단축 → fetch에 더 많은 시간 확보
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout:3000, maximumAge:300000 });
    });
  },

  async _render(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weather_code,apparent_temperature`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
      + `&timezone=Asia%2FSeoul&forecast_days=3&past_days=1`;

    const controller = new AbortController();
    // AbortController 타임아웃을 10초로 늘림 (기존 8초에서 증가)
    const fetchTimer = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(fetchTimer);
    }
    if (!res.ok) throw new Error(`api error ${res.status}`);
    const data = await res.json();
    const c = data.current, d = data.daily;

    const todayStr = this._localDateStr();
    const ti = d.time.findIndex(t => t === todayStr);
    const safeT = ti >= 0 ? ti : 1;
    const yi = Math.max(0, safeT - 1);
    const ni = Math.min(d.time.length - 1, safeT + 1);

    const [todayDesc, todayIcon] = this.code(c.weather_code);
    const [, yIcon] = this.code(d.weather_code[yi]);
    const [, nIcon] = this.code(d.weather_code[ni]);

    const el = document.getElementById('hWeather');
    if (!el) return;

    el.innerHTML = `
      <div class="weather-3day">
        <div class="w3-item w3-side">
          <div class="w3-label">어제</div>
          <div class="w3-icon">${yIcon}</div>
          <div class="w3-temp">${Math.round(d.temperature_2m_max[yi])}°</div>
          <div class="w3-range">${Math.round(d.temperature_2m_min[yi])}°</div>
        </div>
        <div class="w3-item w3-today">
          <div class="w3-label">오늘</div>
          <div class="w3-icon">${todayIcon}</div>
          <div class="w3-temp">${Math.round(c.temperature_2m)}°</div>
          <div class="w3-range">${Math.round(d.temperature_2m_max[safeT])}°↑ ${Math.round(d.temperature_2m_min[safeT])}°↓</div>
        </div>
        <div class="w3-item w3-side">
          <div class="w3-label">내일</div>
          <div class="w3-icon">${nIcon}</div>
          <div class="w3-temp">${Math.round(d.temperature_2m_max[ni])}°</div>
          <div class="w3-range">${Math.round(d.temperature_2m_min[ni])}°↓</div>
        </div>
      </div>`;
  },
};
