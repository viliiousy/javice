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
    try {
      const pos = await this._getPos();
      await this._render(pos.coords.latitude, pos.coords.longitude);
    } catch {
      await this._render(CONFIG.WEATHER_LAT, CONFIG.WEATHER_LON);
    }
  },

  _getPos() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('no geo')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout:6000, maximumAge:300000 });
    });
  },

  async _render(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weather_code,apparent_temperature`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
      + `&timezone=Asia%2FSeoul&forecast_days=3&past_days=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('api error');
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
          <div class="w3-range">${Math.round(d.temperature_2m_max[safeT])}°/${Math.round(d.temperature_2m_min[safeT])}°</div>
        </div>
        <div class="w3-item w3-side">
          <div class="w3-label">내일</div>
          <div class="w3-icon">${nIcon}</div>
          <div class="w3-temp">${Math.round(d.temperature_2m_max[ni])}°</div>
          <div class="w3-range">${Math.round(d.temperature_2m_min[ni])}°</div>
        </div>
      </div>`;
  },
};
