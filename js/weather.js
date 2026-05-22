// js/weather.js — Open-Meteo 날씨 (API 키 불필요)

const Weather = {
  WMO: {
    0:['맑음','☀️'],1:['대체로 맑음','🌤'],2:['부분 흐림','⛅'],3:['흐림','☁️'],
    45:['안개','🌫'],48:['안개','🌫'],
    51:['가벼운 이슬비','🌦'],53:['이슬비','🌦'],55:['짙은 이슬비','🌧'],
    61:['가벼운 비','🌧'],63:['비','🌧'],65:['강한 비','🌧'],
    71:['가벼운 눈','🌨'],73:['눈','❄️'],75:['강한 눈','❄️'],77:['진눈깨비','🌨'],
    80:['소나기','🌦'],81:['소나기','🌧'],82:['강한 소나기','🌧'],
    85:['눈 소나기','🌨'],86:['강한 눈 소나기','❄️'],
    95:['뇌우','⛈'],96:['우박 뇌우','⛈'],99:['강한 뇌우','⛈'],
  },

  code(c) { return this.WMO[c] || ['날씨','🌤']; },

  async init() {
    document.getElementById('weatherCity').textContent = CONFIG.WEATHER_CITY;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.WEATHER_LAT}&longitude=${CONFIG.WEATHER_LON}`
        + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation`
        + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
        + `&timezone=Asia%2FSeoul&forecast_days=5`;
      const res  = await fetch(url);
      const data = await res.json();
      this.render(data);
    } catch {
      document.getElementById('weatherWrap').innerHTML = '<p class="empty">날씨 정보를 불러올 수 없습니다</p>';
    }
  },

  render(data) {
    const c = data.current;
    const [desc, icon] = this.code(c.weather_code);

    // 헤더 스니펫
    document.getElementById('hWeather').textContent = `${icon} ${Math.round(c.temperature_2m)}°C`;

    const forecastHTML = data.daily.time.slice(0, 5).map((day, i) => {
      const [, fi] = this.code(data.daily.weather_code[i]);
      const dt = new Date(day + 'T00:00:00');
      const label = i === 0 ? '오늘' : dt.toLocaleDateString('ko-KR', { weekday: 'short' });
      return `<div class="fc-item">
        <div class="fc-day">${label}</div>
        <div class="fc-icon">${fi}</div>
        <div class="fc-temp">${Math.round(data.daily.temperature_2m_max[i])}° <span>/ ${Math.round(data.daily.temperature_2m_min[i])}°</span></div>
      </div>`;
    }).join('');

    document.getElementById('weatherWrap').innerHTML = `
      <div class="weather-main">
        <div class="weather-icon">${icon}</div>
        <div>
          <div><span class="weather-temp-num">${Math.round(c.temperature_2m)}</span><span class="weather-temp-unit">°C</span></div>
          <div class="weather-desc">${desc}</div>
          <div class="weather-feels">체감 ${Math.round(c.apparent_temperature)}°C</div>
        </div>
      </div>
      <div class="weather-grid">
        <div class="weather-cell"><div class="weather-cell-lbl">💧 습도</div><div class="weather-cell-val">${c.relative_humidity_2m}%</div></div>
        <div class="weather-cell"><div class="weather-cell-lbl">💨 바람</div><div class="weather-cell-val">${Math.round(c.wind_speed_10m)} km/h</div></div>
        <div class="weather-cell"><div class="weather-cell-lbl">🌡 최고/최저</div><div class="weather-cell-val">${Math.round(data.daily.temperature_2m_max[0])}° / ${Math.round(data.daily.temperature_2m_min[0])}°</div></div>
        <div class="weather-cell"><div class="weather-cell-lbl">🌧 강수</div><div class="weather-cell-val">${c.precipitation} mm</div></div>
      </div>
      <div class="weather-forecast">${forecastHTML}</div>`;
  },
};