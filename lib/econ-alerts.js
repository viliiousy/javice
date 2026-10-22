// lib/econ-alerts.js — 시세 알림을 앱 알림으로 (예전: economy 레포의 price_watch.py → 텔레그램)
//
// 알림 크론(api/cron-notify.js, cron-job.org 가 10분마다)이 사용자마다 부른다.
// 텔레그램은 운영자 한 사람만 받았고, 깃허브 예약 실행이 몇 시간씩 밀려 알림도 같이 밀렸다.
// 이제는 앱을 쓰는 사람 모두가 각자 담은 종목으로 받는다.
//
//   기준가 알림  : 담은 종목에 '알림가' 를 적어 둔 것 — 직전 확인 때는 바깥, 지금은 안쪽으로 넘어온 순간 한 번
//   급변동 알림  : 전날 대비 move_pct(기본 10%) 이상 움직이면 그날 한 번
//   리포트       : 정해 둔 시각(report_times)이 지나고 2시간 안에 한 번 — 담은 종목 시세 묶음
//   장 시작·마감 : 켜 둔 것만, 평일(현지 기준) 그 시각 뒤 1시간 안에 한 번
//
// 지난 값과 보낸 표식은 /econ_state/<uid> 에 둔다(서비스 계정만 읽고 쓴다).
const { fbGet, fbFetch } = require('./fb-admin');
const { quote } = require('./market');
const { tfetch } = require('./http');

const KEY = s => String(s).replace(/[.#$\[\]\/]/g, '_');
const won = n => Math.round(n).toLocaleString('ko-KR');
function fmtP(it, p) {
  if (p == null) return '—';
  if (it.type === 'us') return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (it.type === 'exchange') return Number(p).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원';
  if (it.type === 'crypto') return (p >= 100 ? won(p) : Number(p).toLocaleString('ko-KR', { maximumFractionDigits: 4 })) + '원';
  return won(p) + (it.unit || '원');
}
const fmtC = pct => pct == null ? '' : `${pct > 0 ? '▲' : pct < 0 ? '▼' : ''}${Math.abs(pct).toFixed(2)}%`;
const short = n => String(n || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim().slice(0, 18) || String(n || '');

async function cryptoQuotes(codes) {
  if (!codes.length) return {};
  try {
    const r = await tfetch('https://api.upbit.com/v1/ticker?markets=' + codes.map(encodeURIComponent).join(','), {}, 5000);
    const j = await r.json(), out = {};
    for (const t of Array.isArray(j) ? j : []) out['crypto:' + t.market] = { price: t.trade_price, pct: Math.round((t.signed_change_rate || 0) * 10000) / 100 };
    return out;
  } catch (e) { return {}; }
}

// 지금 그 시장 시각(평일인가, 몇 분인가)
function local(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { wd: p.weekday, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const MARKETS = {
  kr_open:  ['Asia/Seoul', 9 * 60, '한국 장 시작'],
  kr_close: ['Asia/Seoul', 15 * 60 + 30, '한국 장 마감'],
  us_open:  ['America/New_York', 9 * 60 + 30, '미국 장 시작'],
  us_close: ['America/New_York', 16 * 60, '미국 장 마감'],
};

// cfg: 앱의 gl_econ_config, today: 'YYYY-MM-DD'(KST), nowMin: KST 분
async function econAlerts(uid, cfg, today, nowMin, force) {
  const msgs = [], notes = [];
  if (!cfg || typeof cfg !== 'object') return { msgs, notes };
  const favs = Array.isArray(cfg.favorites) ? cfg.favorites : [];
  const lists = (Array.isArray(cfg.watchlists) ? cfg.watchlists : []).filter(w => w && w.alert);
  const seen = new Set(), watch = [];
  for (const it of favs) if (it && it.alert !== false && !seen.has(it.type + ':' + it.code)) { seen.add(it.type + ':' + it.code); watch.push(it); }
  for (const w of lists) for (const it of w.items || []) if (it && !seen.has(it.type + ':' + it.code)) { seen.add(it.type + ':' + it.code); watch.push(it); }
  const all = [...favs, ...lists.flatMap(w => w.items || [])].filter(Boolean);
  if (!all.length) return { msgs, notes };

  const ma = cfg.market_alerts || {}, times = Array.isArray(cfg.report_times) ? cfg.report_times : ['08:00'];
  const st = (await fbGet(`/econ_state/${uid}.json`).catch(() => null)) || {};
  st.items = st.items || {};
  let rep = st.report && st.report.date === today ? st.report : { date: today, done: [] };
  let mk = st.mkt && st.mkt.date === today ? st.mkt : { date: today, done: [] };

  // 보낼 일이 있을 때만 시세를 받는다 — 기준가·급변동은 늘 봐야 하므로 담은 게 있으면 받는다
  const uniq = [...new Map(all.map(it => [it.type + ':' + it.code, it])).values()];
  const [q1, q2] = await Promise.all([
    quote({ items: uniq.filter(x => x.type !== 'crypto').map(x => ({ t: x.type, c: x.code })) }).then(r => r.items).catch(() => ({})),
    cryptoQuotes(uniq.filter(x => x.type === 'crypto').map(x => x.code)),
  ]);
  const Q = { ...q1, ...q2 };
  if (!Object.keys(Q).length) { notes.push('시세: 받지 못함'); return { msgs, notes }; }

  const move = Number(cfg.move_pct) || 10;
  for (const it of watch) {
    const k = it.type + ':' + it.code, q = Q[k]; if (!q || q.price == null) continue;
    const s = st.items[KEY(k)] = st.items[KEY(k)] || {};
    const nm = short(it.name);
    const floor = it.floor != null && it.floor !== '' ? Number(it.floor) : null;
    if (floor && isFinite(floor)) {
      const below = it.floorDir !== 'above', prev = s.last;
      const inNow = below ? q.price <= floor : q.price >= floor;
      const outPrev = prev != null && (below ? prev > floor : prev < floor);
      if (inNow && outPrev) msgs.push({ slot: 'ec_f_' + KEY(k), title: `${below ? '📉' : '📈'} ${nm} 기준가 ${below ? '이하' : '이상'}`,
        body: `지금 ${fmtP(it, q.price)} (${fmtC(q.pct)}) · 기준 ${fmtP(it, floor)}` });
    }
    s.last = q.price;
    if (q.pct != null && Math.abs(q.pct) >= move && s.move !== today) {
      msgs.push({ slot: 'ec_m_' + KEY(k), title: `⚡ ${nm} ${q.pct > 0 ? '급등' : '급락'} ${fmtC(q.pct)}`, body: `전날보다 ${move}% 넘게 움직였습니다 · 지금 ${fmtP(it, q.price)}` });
      s.move = today;
    }
  }

  // 묶음(리포트·장 알림): 담은 종목 앞 6개(별 먼저)
  const ordered = favs.filter(x => x.star).concat(favs.filter(x => !x.star));
  const digest = () => ordered.slice(0, 6).map(it => { const q = Q[it.type + ':' + it.code] || {}; return `${short(it.name)} ${fmtP(it, q.price)} ${fmtC(q.pct)}`; }).join(' · ');
  for (const t of times) {
    if (rep.done.includes(t)) continue;
    const [h, m] = String(t).split(':').map(Number); if (!isFinite(h)) continue;
    const tm = h * 60 + (m || 0);
    if (force || (nowMin >= tm && nowMin - tm <= 120)) {
      if (ordered.length) msgs.push({ slot: 'ec_r_' + KEY(t), title: `📊 시세 리포트 ${t}`, body: digest() });
      rep.done.push(t);
    }
  }
  for (const [key, [tz, at, label]] of Object.entries(MARKETS)) {
    if (!ma[key] || mk.done.includes(key)) continue;
    const L = local(tz);
    if (L.wd === 'Sat' || L.wd === 'Sun') continue;
    if (L.min >= at && L.min - at <= 60) {
      const mine = ordered.filter(it => key.startsWith('kr') ? ['kr', 'exchange', 'metal'].includes(it.type) : it.type === 'us');
      const body = (mine.length ? mine : ordered).slice(0, 6).map(it => { const q = Q[it.type + ':' + it.code] || {}; return `${short(it.name)} ${fmtP(it, q.price)} ${fmtC(q.pct)}`; }).join(' · ');
      msgs.push({ slot: 'ec_k_' + key, title: `🔔 ${label}`, body: body || '담은 종목이 없습니다' });
      mk.done.push(key);
    }
  }

  if (!force) {
    st.report = rep; st.mkt = mk;
    await fbFetch(`/econ_state/${uid}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(st) }).catch(() => {});
  }
  notes.push(`시세 ${Object.keys(Q).length}종목 확인 · 알림 ${msgs.length}`);
  return { msgs, notes };
}

module.exports = { econAlerts, _t: { fmtP, fmtC, local, short } };
