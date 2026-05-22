// js/weather.js — GPS 기반 날씨 (헤더 전용)

const Weather = {
  WMO: {
    0:['맑음','☀️'],1:['대체로 맑음','🌤'],2:['부분 흐림','⛅'],3:['흐림','☁️'],
    45:['안개','🌫'],48:['안개','🌫'],51:['이슬비','🌦'],53:['이슬비','🌦'],
    55:['짙은 이슬비','🌧'],61:['비','🌧'],63:['비','🌧'],65:['강한 비','🌧'],
    71:['눈','🌨'],73:['눈','❄️'],75:['강한 눈','❄️'],77:['진눈깨비','🌨'],
    80:['소나기','🌦'],81:['소나기','🌧'],82:['강한 소나기','🌧'],
    85:['눈소나기','🌨'],86:['강한 눈소나기','❄️'],95:['뇌우','⛈'],99:['뇌우','⛈'],
  },
  code(c){ return this.WMO[c]||['날씨','🌤']; },

  async init() {
    const hWeather=document.getElementById('hWeather');
    if (!hWeather) return;
    hWeather.innerHTML='<span style="color:var(--text3);font-size:12px">날씨 로딩중...</span>';

    try {
      const pos = await this._getPosition();
      await this._fetchAndRender(pos.coords.latitude, pos.coords.longitude);
    } catch {
      // GPS 실패 시 수원 기본값
      await this._fetchAndRender(CONFIG.WEATHER_LAT, CONFIG.WEATHER_LON);
    }
  },

  _getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('no geo')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, {timeout:5000});
    });
  },

  async _fetchAndRender(lat, lon) {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yStr = yesterday.toISOString().split('T')[0];

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weather_code`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
      + `&timezone=Asia%2FSeoul&forecast_days=3&past_days=1`;

    const res  = await fetch(url);
    const data = await res.json();
    const c    = data.current;
    const d    = data.daily;

    const [desc, icon] = this.code(c.weather_code);
    const todayIdx = d.time.findIndex(t => t === new Date().toISOString().split('T')[0]);
    const yi = todayIdx > 0 ? todayIdx-1 : 0;
    const ti = todayIdx >= 0 ? todayIdx : 0;
    const ni = Math.min(ti+1, d.time.length-1);

    const [,yi_icon] = this.code(d.weather_code[yi]);
    const [,ni_icon] = this.code(d.weather_code[ni]);

    const hWeather = document.getElementById('hWeather');
    if (hWeather) {
      hWeather.innerHTML = `
        <div class="h-weather-main" title="${desc}">
          ${icon} <strong>${Math.round(c.temperature_2m)}°</strong>
          <span class="h-weather-range">${Math.round(d.temperature_2m_max[ti])}°/${Math.round(d.temperature_2m_min[ti])}°</span>
        </div>
        <div class="h-weather-adj">
          <span title="어제">${yi_icon} ${Math.round(d.temperature_2m_max[yi])}°</span>
          <span class="h-weather-sep">·</span>
          <span title="내일">${ni_icon} ${Math.round(d.temperature_2m_max[ni])}°</span>
        </div>`;
    }
  },
};
