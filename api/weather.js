// api/weather.js — 상단바·위젯에 쓰는 '지금 날씨' (온도 · 하늘 · 오늘 최고/최저)
//
// 위치는 따로 묻지 않는다. 브라우저·앱 위치 권한을 받으면 그 좌표(?lat=&lon=)를 쓰고,
// 없으면 Vercel 이 붙여 주는 접속 위치(x-vercel-ip-latitude 등, 시·구 수준)로 본다.
// 날씨 값은 Open-Meteo(키 없음, 기상청 등 여러 모델 종합)에서 받아 15분 동안 기억해 둔다.
const { cors } = require('../lib/cors');
const { tfetch } = require('../lib/http');

const cache = new Map();
const TTL = 15 * 60 * 1000;

// WMO 날씨 코드 → 짧은 이름 · 아이콘 이름
function sky(code, day) {
  const c = Number(code);
  if (c === 0) return [day ? '맑음' : '맑음', day ? 'sun' : 'moon'];
  if (c === 1 || c === 2) return ['구름 조금', day ? 'cloud-sun' : 'cloud-moon'];
  if (c === 3) return ['흐림', 'cloud'];
  if (c === 45 || c === 48) return ['안개', 'fog'];
  if (c >= 51 && c <= 57) return ['이슬비', 'rain'];
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ['비', 'rain'];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['눈', 'snow'];
  if (c >= 95) return ['뇌우', 'storm'];
  return ['—', 'cloud'];
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  const q = req.query || {}, h = req.headers || {};
  let lat = Number(q.lat), lon = Number(q.lon), city = '';
  if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) {
    lat = Number(h['x-vercel-ip-latitude']); lon = Number(h['x-vercel-ip-longitude']);
    try { city = decodeURIComponent(h['x-vercel-ip-city'] || ''); } catch (e) {}
  }
  if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) { lat = 37.5665; lon = 126.978; city = city || 'Seoul'; }   // 모르면 서울
  const k = lat.toFixed(2) + ',' + lon.toFixed(2);
  const hit = cache.get(k);
  res.setHeader('Cache-Control', 'public, max-age=600');
  if (hit && Date.now() - hit.t < TTL) { res.status(200).json({ ...hit.v, city: city || hit.v.city }); return; }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + '&current=temperature_2m,apparent_temperature,weather_code,is_day,precipitation'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=Asia%2FSeoul';
    const r = await tfetch(url, {}, 6000);
    const j = await r.json();
    const c = j.current || {}, d = j.daily || {};
    const [name, icon] = sky(c.weather_code, c.is_day !== 0);
    const v = { ok: true, t: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), code: c.weather_code, day: c.is_day !== 0,
      name, icon, hi: Math.round((d.temperature_2m_max || [])[0]), lo: Math.round((d.temperature_2m_min || [])[0]),
      rain: (d.precipitation_probability_max || [])[0] ?? null, city, at: Date.now() };
    cache.set(k, { t: Date.now(), v });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    res.status(200).json(v);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
};
