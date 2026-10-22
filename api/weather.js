// api/weather.js — 상단바·위젯에 쓰는 '지금 날씨' (온도 · 하늘 · 오늘 최고/최저)
//
// 위치는 따로 묻지 않는다. 브라우저·앱 위치 권한을 받으면 그 좌표(?lat=&lon=)를 쓰고,
// 없으면 Vercel 이 붙여 주는 접속 위치(x-vercel-ip-latitude 등, 시·구 수준)로 본다.
// 날씨 값은 Open-Meteo(키 없음, 기상청 등 여러 모델 종합)에서 받아 15분 동안 기억해 둔다.
const { cors } = require('../lib/cors');
const { tfetch } = require('../lib/http');
const { fbGet, fbFetch } = require('../lib/fb-admin');

// 날짜별 기록(최저·최고·하늘) — 지역 칸(0.1도, 약 10km)마다 /wx_hist/<칸>/<YYYY-MM-DD> = { lo, hi, c }
// 날짜를 바꿔 보면 그날 날씨를 보여 주려고 남긴다. 2026-01-01 부터는 지난 기록(Open-Meteo archive)으로 한 번 채운다.
const grid = (lat, lon) => `${Math.round(lat * 10)}_${Math.round(lon * 10)}`;
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const HIST_FROM = '2026-01-01';
async function writeDays(g, rows) {
  if (!Object.keys(rows).length) return;
  await fbFetch(`/wx_hist/${g}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) }).catch(() => {});
}
function dailyRows(d, future) {
  const out = {}, T = d.time || [];
  for (let i = 0; i < T.length; i++) {
    const hi = d.temperature_2m_max?.[i], lo = d.temperature_2m_min?.[i], c = d.weather_code?.[i];
    if (hi == null || lo == null) continue;
    out[T[i]] = { lo: Math.round(lo), hi: Math.round(hi), c: c == null ? null : Number(c), ...(future && T[i] > future ? { f: 1 } : {}) };
  }
  return out;
}
async function history(lat, lon) {
  const g = grid(lat, lon), today = kstDay();
  let H = (await fbGet(`/wx_hist/${g}.json`).catch(() => null)) || {};
  if (H._bf !== today) {   // 하루 한 번만 채운다: 지난 기록(5일 전까지) + 최근·앞으로 16일 예보
    const rows = {};
    try {
      const end = kstDay(Date.now() - 5 * 864e5);
      const have = Object.keys(H).filter(k => k >= HIST_FROM && k <= end).length;
      const need = Math.round((Date.parse(end) - Date.parse(HIST_FROM)) / 864e5) + 1;
      if (have < need - 2) {
        const r = await tfetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${HIST_FROM}&end_date=${end}`
          + '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul', {}, 9000);
        const j = await r.json(); if (j && j.daily) Object.assign(rows, dailyRows(j.daily));
      }
    } catch (e) {}
    try {
      const r = await tfetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=7&forecast_days=16`
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul', {}, 7000);
      const j = await r.json(); if (j && j.daily) Object.assign(rows, dailyRows(j.daily, today));
    } catch (e) {}
    if (Object.keys(rows).length) { rows._bf = today; await writeDays(g, rows); Object.assign(H, rows); }
  }
  const out = {};
  for (const [k, v] of Object.entries(H)) {
    if (!/^\d{4}-\d\d-\d\d$/.test(k) || !v) continue;
    const [name, icon] = sky(v.c, true);
    out[k] = { lo: v.lo, hi: v.hi, icon, name, ...(v.f ? { f: 1 } : {}) };
  }
  return { ok: true, grid: g, days: out };
}


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
  if (q.hist) {   // 날짜별 기록(2026-01-01 ~ 앞으로 16일)
    try { res.setHeader('Cache-Control', 'public, max-age=1800'); res.status(200).json(await history(lat, lon)); }
    catch (e) { res.status(502).json({ ok: false, error: e.message }); }
    return;
  }
  const k = lat.toFixed(2) + ',' + lon.toFixed(2);
  const hit = cache.get(k);
  res.setHeader('Cache-Control', 'public, max-age=600');
  if (hit && Date.now() - hit.t < TTL) { res.status(200).json({ ...hit.v, city: city || hit.v.city }); return; }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + '&current=temperature_2m,apparent_temperature,weather_code,is_day,precipitation'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset&forecast_days=1&timezone=Asia%2FSeoul';
    const r = await tfetch(url, {}, 6000);
    const j = await r.json();
    const c = j.current || {}, d = j.daily || {};
    const [name, icon] = sky(c.weather_code, c.is_day !== 0);
    const v = { ok: true, t: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), code: c.weather_code, day: c.is_day !== 0,
      name, icon, hi: Math.round((d.temperature_2m_max || [])[0]), lo: Math.round((d.temperature_2m_min || [])[0]),
      rain: (d.precipitation_probability_max || [])[0] ?? null, city, at: Date.now(),
      // 해 뜨고 지는 시각(KST 'HH:MM') — 세부 표시에서 해가 날짜 위를 지나가는 자리를 정한다
      rise: String((d.sunrise || [])[0] || '').slice(11, 16), set: String((d.sunset || [])[0] || '').slice(11, 16) };
    // 오늘 기록을 남긴다(지역 칸마다 · 하루 중 바뀌면 덮어쓴다)
    if (isFinite(v.hi) && isFinite(v.lo)) writeDays(grid(lat, lon), { [kstDay()]: { lo: v.lo, hi: v.hi, c: (d.weather_code || [])[0] ?? c.weather_code } });
    cache.set(k, { t: Date.now(), v });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    res.status(200).json(v);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
};
