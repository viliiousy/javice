// js/weather.js — GPS 기반 날씨 (헤더 전용)

const Weather = {
  WMO: {
    0:['맑음','☀️'],1:['대체로 맑음','🌤'],2:['부분 흐림','⛅'],3:['흐림','☁️'],
    45:['안개','🌫'],48:['안개','🌫'],51:['이슬비','🌦'],53:['이슬비','🌦'],
    55:['짙은 이슬비','🌧'],61:['가벼운 비','🌧'],63:['비','🌧'],65:['강한 비','🌧'],
    71:['눈','🌨'],73:['눈','❄️'],75:['강한 눈','❄️'],77:['진눈깨비','🌨'],
    80:['소나기','🌦'],81:['소나기','🌧'],82:['강한 소나기','🌧'],
    85:['눈소나기','🌨'],86:['강한 눈소나기','❄️'],95:['뇌우','⛈'],99:['뇌우','⛈'],
  },
  code(c){ return this.WMO[c] || ['날씨','🌤']; },

  // 로컬 날짜 문자열 (UTC 변환 없이)
  _localDateStr(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  },

  async init() {
    const el = document.getElementById('hWeather');
    if (!el) return;
    el.innerHTML = '<span style="color:var(--text3);font-size:12px">🌤 로딩중</span>';
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
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000, maximumAge: 300000 });
    });
  },

  async _render(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weather_code,apparent_temperature`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
      + `&timezone=Asia%2FSeoul&forecast_days=3&past_days=1`;

    const res  = await fetch(url);
    if (!res.ok) throw new Error('weather api error');
    const data = await res.json();
    const c = data.current;
    const d = data.daily;

    const [desc, icon] = this.code(c.weather_code);

    // 로컬 날짜 기준으로 인덱스 찾기 (UTC 변환 버그 방지)
    const todayStr = this._localDateStr();
    const ti = d.time.findIndex(t => t === todayStr);
    const safeIdx = ti >= 0 ? ti : 1; // 못 찾으면 중간값
    const yi = Math.max(0, safeIdx - 1);
    const ni = Math.min(d.time.length - 1, safeIdx + 1);

    const [, yIcon] = this.code(d.weather_code[yi]);
    const [, nIcon] = this.code(d.weather_code[ni]);

    const yDay = yi === safeIdx ? '어제' : new Date(d.time[yi]+'T00:00:00').toLocaleDateString('ko-KR',{weekday:'short'});
    const nDay = new Date(d.time[ni]+'T00:00:00').toLocaleDateString('ko-KR',{weekday:'short'});

    const el = document.getElementById('hWeather');
    if (!el) return;
    el.innerHTML = `
      <div class="h-weather-main" title="${desc} · 체감 ${Math.round(c.apparent_temperature)}°C">
        ${icon} <strong>${Math.round(c.temperature_2m)}°</strong>
        <span class="h-weather-range">${Math.round(d.temperature_2m_max[safeIdx])}°/${Math.round(d.temperature_2m_min[safeIdx])}°</span>
      </div>
      <div class="h-weather-adj">
        <span title="${yDay}">${yIcon} ${Math.round(d.temperature_2m_max[yi])}°</span>
        <span class="h-weather-sep">·</span>
        <span title="${nDay}">${nIcon} ${Math.round(d.temperature_2m_max[ni])}°</span>
      </div>`;
  },
};
