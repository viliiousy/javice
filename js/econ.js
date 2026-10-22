// js/econ.js — 경제(시세) — viliiousy/economy 대시보드를 흡수한 것
//
// 원래 이 화면은 viliiousy.github.io/economy 라는 별도 페이지였고,
// GitHub PAT 를 localStorage 에 넣어 두고 그 토큰으로 레포에 config.json 을 직접 커밋했다.
// 그 페이지는 서드파티 CDN 스크립트를 불러오므로, CDN 이 한 번 오염되거나 XSS 가 나면
// repo 쓰기 권한이 통째로 넘어간다. 그래서 여기로 옮겼다.
//
//   설정(관심종목 등) → UserStore('gl_econ_config') → 기존 /users/<uid> 경로로 동기화
//                       price_watch.py 는 /api/econ-config 로 이 값을 읽어 간다
//   시세·차트 데이터   → 공개 레포의 정적 파일. raw.githubusercontent.com 은
//                       Access-Control-Allow-Origin: * 이라 토큰 없이 읽힌다 (캐시 5분).
//
// PAT 는 이제 어디에도 없다.

const Econ = {
  REPO:   'viliiousy/economy',
  BRANCH: 'main',
  KEY:    'gl_econ_config',
  POLL:   60000,          // 1분마다 — 화면이 떠 있을 때만(서버가 네이버에서 바로 받아 준다: lib/market.js)

  DEF: {
    move_pct: 10, favorites: [], watchlists: [], holdings: [],
    report_times: ['08:00'],
    market_alerts: { kr_open:false, kr_close:false, us_open:false, us_close:false },
  },
  TYPE: { kr:'국내', us:'해외', exchange:'환율', metal:'금', crypto:'코인' },

  C: null, PRICES: {}, PREV: {}, TICKERS: null,
  HIST: { items:{} }, HIST_AT: 0,
  _poll: null, _saveT: null, _lwLoading: null,
  view: 'main', activeList: null,
  chartScope: 'fav', chartMode: 'combined', chartTF: 'd',

  // ── 설정 ────────────────────────────────────────────
  cfg() {
    if (this.C) return this.C;
    let c = {};
    try { c = JSON.parse(UserStore.get(this.KEY) || '{}'); } catch {}
    this.C = Object.assign({}, this.DEF, c);
    this.C.favorites  = this.C.favorites  || [];
    this.C.watchlists = this.C.watchlists || [];
    this.C.holdings   = this.C.holdings   || [];
    if (!this.C.report_times || !this.C.report_times.length) this.C.report_times = ['08:00'];
    this.C.market_alerts = Object.assign({}, this.DEF.market_alerts, this.C.market_alerts || {});
    this.C.favorites.forEach(f => { if (f.alert === undefined) f.alert = true; });
    this.C.watchlists.forEach(w => { if (w.alert === undefined) w.alert = false; });
    if (!this.activeList && this.C.watchlists[0]) this.activeList = this.C.watchlists[0].id;
    return this.C;
  },
  save() {
    UserStore.set(this.KEY, JSON.stringify(this.C));
    if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleSave?.();
  },
  queueSave() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.save(), 700); },

  // ── 유틸 ────────────────────────────────────────────
  raw(f)     { return `https://raw.githubusercontent.com/${this.REPO}/${this.BRANCH}/${f}?t=${Date.now()}`; },
  keyOf(it)  { return it.type + ':' + it.code; },
  // 별(즐겨찾기) 먼저, 그다음 담은 순서 — 카드 · 상단바 · 위젯이 모두 이 순서를 쓴다
  favOrdered() { const f = this.cfg().favorites || []; return f.filter(x => x.star).concat(f.filter(x => !x.star)); },
  // 긴 이름 줄이기: 괄호 속 풀이 · Class A · Inc. 같은 꼬리를 뗀다(원래 이름은 title 로 남긴다)
  shortName(n) {
    let s = String(n || '').trim();
    const b = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); if (b) s = b;
    s = s.replace(/\s+Class\s+([A-C])\b/i, ' $1').replace(/\s+보통주$/, '')
         .replace(/,?\s+(Inc\.?|Corp\.?|Corporation|Holdings?|Ltd\.?|plc|Co\.?|Company|Group|Incorporated)$/i, '').trim();
    return s || String(n || '');
  },
  // 이름 길이에 맞춰 글자만 줄인다 — 칸 높이는 그대로(아주 길면 작은 글씨 두 줄)
  nmCls(n) { let w = 0; for (const ch of String(n)) w += /[\u3131-\uD79D]/.test(ch) ? 1 : 0.58; return w <= 8 ? '' : w <= 11 ? ' ec-nm-s' : ' ec-nm-xs'; },
  nmHtml(it, pre = '') { const s = this.shortName(it.name); return `<div class="ec-nm${this.nmCls(s)}" title="${esc(it.name)}">${pre}${esc(s)}</div>`; },
  unitFor(t) { return t === 'us' ? '$' : t === 'metal' ? '원/g' : '원'; },
  uid()      { return 'w' + Date.now().toString(36) + Math.floor(Math.random()*1e3).toString(36); },
  attr(o)    { return JSON.stringify(o).replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },

  fmt(it, p) {
    if (p == null) return '—';
    if (it.type === 'crypto')   return (p >= 100 ? Math.round(p).toLocaleString('ko-KR') : p.toLocaleString('ko-KR', { maximumFractionDigits: p >= 1 ? 2 : 4 })) + '원';
    if (it.type === 'us')       return '$' + p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    if (it.type === 'exchange') return p.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}) + (it.unit||'원');
    return Math.round(p).toLocaleString('ko-KR') + (it.unit || '');
  },
  delta(pct) {
    if (pct == null) return '<div class="ec-delta ec-flat">—</div>';
    const c = pct > 0 ? 'ec-up' : pct < 0 ? 'ec-dn' : 'ec-flat';
    const a = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
    return `<div class="ec-delta ${c}">${a} ${Math.abs(pct).toFixed(2)}%</div>`;
  },

  // ── 초기화 ──────────────────────────────────────────
  init() {
    const had = UserStore.get(this.KEY);
    this.cfg();
    this.render();
    if (!had) this._seed().then(() => this.refresh());
    else this.refresh();
    // 1분마다 새 시세 — 앱이 화면에 떠 있을 때만. 돌아오면 바로 한 번.
    setInterval(() => { if (!document.hidden) this.refresh(); }, this.POLL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (this._lastRf || 0) > 20e3) this.refresh(); });
  },

  // PAT 시절 설정은 공개 레포의 config.json 에 있었다. 처음 한 번만 가져와 옮긴다.
  // (옮기고 나면 그 파일은 레포에서 지운다 — 관심종목이 공개돼 있을 이유가 없다)
  async _seed() {
    try {
      const r = await fetch(this.raw('config.json'), { cache:'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (!j || (!(j.favorites||[]).length && !(j.watchlists||[]).length)) return;
      // fetch 하는 사이에 Firebase 동기화가 값을 채웠을 수 있다. 그러면 그 쪽이 최신이다.
      // 이 확인이 없으면 폰에서 처음 열 때 옛 config.json 이 새 설정을 덮어쓴다.
      if (UserStore.get(this.KEY)) return;
      UserStore.set(this.KEY, JSON.stringify(j));
      this.C = null; this.cfg();
      this.save();
      this.render();
      App.showToast('이전 관심종목 설정을 가져왔습니다','success');
    } catch {}
  },

  // 메인 카드에 한 번에 보여줄 최대 종목 수.
  // 훑어보는 자리라 다 늘어놓으면 카드만 길어지고 아래 카드가 밀린다.
  MAIN_MAX: 4,
  _expanded: false,
  // 카드에서 바로: 빼기 · 별 · 순서
  favRemove(k) {
    const c = this.cfg(), it = c.favorites.find(x => this.keyOf(x) === k); if (!it) return;
    c.favorites = c.favorites.filter(x => this.keyOf(x) !== k);
    this.queueSave(); this.render(); App.showToast(`${it.name} 뺐습니다`);
  },
  favStar(k) {
    const it = this.cfg().favorites.find(x => this.keyOf(x) === k); if (!it) return;
    it.star = !it.star; this.queueSave(); this.render();
    App.showToast(it.star ? `${it.name} 즐겨찾기 — 맨 위에 둡니다` : `${it.name} 즐겨찾기 해제`, 'success');
  },
  favOrder(keys) {
    const c = this.cfg(), by = new Map(c.favorites.map(x => [this.keyOf(x), x]));
    const moved = keys.map(k => by.get(k)).filter(Boolean), rest = c.favorites.filter(x => !keys.includes(this.keyOf(x)));
    c.favorites = moved.concat(rest);
    this.queueSave(); this.render();
  },
  // ── 검색 시트: 전체 · 국내 · 해외 · 코인 (고른 칸은 기억) ──
  SCAT_KEY: 'gl_ec_scat',
  searchSheet() {
    document.getElementById('ecSearch')?.remove();
    const cat = localStorage.getItem(this.SCAT_KEY) || 'all';
    const ov = document.createElement('div'); ov.id = 'ecSearch'; ov.className = 'mx-ov qt-ov';
    ov.innerHTML = `<div class="mx-sh qt-sh ec-ssh" role="dialog" aria-label="종목 검색">
      <div class="qt-lists">${[['all','전체'],['kr','국내'],['us','해외'],['crypto','코인'],['etc','지수·금·환율']].map(([v,l]) => `<button type="button" class="qt-l${v===cat?' on':''}" data-v="${v}">${l}</button>`).join('')}</div>
      <input id="ecSQ" class="qt-title" type="search" autocomplete="off" placeholder="삼성전자 · 테슬라 · 비트코인 · 금" enterkeyhint="search">
      <div id="ecSRes" class="ec-sres"></div></div>`;
    document.body.appendChild(ov);
    const q = ov.querySelector('#ecSQ');
    ov.addEventListener('click', e => { if (e.target === ov) { ov.classList.remove('on'); setTimeout(() => ov.remove(), 200); } });
    ov.querySelectorAll('.qt-l').forEach(b => b.onclick = () => {
      ov.querySelectorAll('.qt-l').forEach(x => x.classList.toggle('on', x === b));
      localStorage.setItem(this.SCAT_KEY, b.dataset.v); try { Haptic.light(); } catch (e) {}
      this.search(q.value, 'S');
    });
    q.addEventListener('input', () => this.search(q.value, 'S'));
    this._sList('');
    requestAnimationFrame(() => { ov.classList.add('on'); });
  },
  // 카드 아래: 상단바에 무엇을 보일지(담은 종목 / 보유 수익 / 끔) · 보유 설정 · 전체 화면
  _foot() {
    const st = typeof TopInfo !== 'undefined' ? TopInfo.get().stock : 'off';
    const seg = [['watch', '담은 종목'], ['hold', '보유 수익'], ['off', '끔']].map(([v, l]) =>
      `<button type="button" class="ec-tseg${st === v ? ' on' : ''}" onclick="event.stopPropagation();Econ.setTop('${v}')">${l}</button>`).join('');
    return `<div class="ec-foot">
      <div class="ec-topset"><span class="ec-tlb">상단바</span><span class="ec-tsegs">${seg}</span></div>
      <span class="ec-hint">꾹 눌러 순서 · 왼쪽으로 밀어 빼기 · 오른쪽으로 밀어 즐겨찾기</span>
      <div class="ec-flinks"><button type="button" class="ec-link" onclick="Econ.open('hold')">보유 종목 설정 ›</button><button type="button" class="ec-link" onclick="Econ.open('main')">차트·알림 ›</button></div></div>`;
  },
  setTop(v) {
    if (typeof TopInfo === 'undefined') return;
    if (v === 'hold' && !(this.cfg().holdings || []).length) App.showToast('보유 종목이 아직 없습니다 — 「보유 종목 설정」에서 넣으면 상단바에 총 수익이 보입니다');
    TopInfo.set({ stock: v }); try { Haptic.light(); } catch (e) {}
    this.render();
  },
  toggleMore() { this._expanded = !this._expanded; this.render(); },

  // 카드에는 즐겨찾기만 간단히 보여준다. 전체 터미널은 모달에서 연다.
  render() {
    this._paintHold();
    const wrap = document.getElementById('econWrap');
    if (!wrap) return;
    const c = this.cfg();
    const upd = document.getElementById('econUpd');
    if (upd) upd.textContent = this._updatedAt ? '업데이트 ' + this._updatedAt.replace('T',' ').slice(5,16) : '시세 대기 중';

    if (!c.favorites.length) {
      wrap.innerHTML = `<p class="empty">${Icons.big('trend')}담은 종목이 없어요<br><span class="ec-hint">위 「검색」에서 주식·지수·금·환율·코인을 찾아 담으면 여기에 시세가 보입니다</span></p>` + this._foot();
      return;
    }
    // 별(즐겨찾기) 붙인 종목이 맨 위, 그다음 담은 순서. 꾹 눌러 끌면 순서가 바뀌고, 왼쪽으로 밀면 빼고, 오른쪽으로 밀면 별
    const all = this.favOrdered(), nk = this._newK; this._newK = null;
    const shown = this._expanded ? all : all.slice(0, this.MAIN_MAX);
    const rest = all.length - shown.length;
    wrap.innerHTML = '<div class="ec-list">' + shown.map(it => {
      const q = this.PRICES[this.keyOf(it)] || {};
      return `<div class="ec-row${nk === this.keyOf(it) ? ' ec-new' : ''}" data-row data-i="${esc(this.keyOf(it))}" data-label="${esc(it.name)}" onclick='Econ.openChart(${this.attr(it)})'>
        <div class="ec-row-l">
          ${this.nmHtml(it, it.star ? '<i class="ec-star" aria-label="즐겨찾기">★</i>' : '')}
          <div class="ec-meta">${esc(it.code)} · ${this.TYPE[it.type]||''}</div>
        </div>
        <div class="ec-row-r" data-pk="${this.keyOf(it)}" data-ptype="${it.type}" data-punit="${it.unit||''}">
          <div class="ec-price">${this.fmt(it, q.price)}</div>${this.delta(q.pct)}
        </div>
      </div>`;
    }).join('') + '</div>'
    + (rest > 0
        ? `<div class="ec-more" onclick="Econ.toggleMore()">+${rest}개 더 보기</div>`
        : this._expanded && all.length > this.MAIN_MAX
          ? `<div class="ec-more" onclick="Econ.toggleMore()">접기</div>` : '')
    + this._foot();
    try { RowUI.paint(wrap.querySelector('.ec-list'), {
      edit: () => {},
      del: k => this.favRemove(k),
      fav: k => this.favStar(k),
      reorder: keys => this.favOrder(keys),
    }); } catch (e) {}
    try { App._updateStatsBanner(); } catch (e) {}   // 순서를 바꾸면 상단바 순서도 바로
  },

  // ── 시세 ────────────────────────────────────────────
  // 담은·보유·관심 종목의 지금 값을 서버(네이버 증권)에서 바로 — 코인은 _crypto 가 업비트에서
  _allItems() { const c = this.C || {}; return [...(c.favorites || []), ...(c.holdings || []), ...(c.watchlists || []).flatMap(w => w.items || [])]; },
  async _live() {
    const seen = new Set(), items = [];
    for (const x of this._allItems()) { const k = this.keyOf(x); if (x.type === 'crypto' || seen.has(k)) continue; seen.add(k); items.push({ t: x.type, c: x.code }); }
    if (!items.length) return false;
    const r = await fetch(Platform.api('/api/hub'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'quote', items }), cache: 'no-store' });
    if (!r.ok) throw new Error('시세 ' + r.status);
    const j = await r.json();
    for (const [k, v] of Object.entries(j.items || {})) this.PRICES[k] = Object.assign({}, this.PRICES[k] || {}, { price: v.price, pct: v.pct });
    if (Object.keys(j.items || {}).length) this._updatedAt = j.at || '';
    return true;
  },
  async refresh() {
    this._lastRf = Date.now();
    document.querySelector('.ec-rf')?.classList.add('spin');
    this.PREV = Object.assign({}, this.PRICES);
    let live = false;
    try { live = await this._live(); this._err = null; } catch (e) { this._err = null; }
    if (live) { await this._crypto(); this._paint(); document.querySelector('.ec-rf')?.classList.remove('spin'); return; }
    try {
      // 예전엔 레포의 prices.json 을 raw 로 읽었다. 그런데 raw 는 max-age=300 이고
      // 쿼리스트링을 무시한다 — 1분마다 갱신되는 시세가 최대 5분 늦게 보였다.
      // (실측: 같은 값이 4분 넘게 고정) 그래서 서버가 Firebase 에서 바로 준다.
      const idToken = await Auth._firebaseIdToken();
      if (!idToken) throw new Error('로그인이 필요합니다');
      const r = await fetch(Platform.api('/api/econ-data'), {
        headers: { Authorization: 'Bearer ' + idToken }, cache: 'no-store',
      });
      if (r.status === 404) throw new Error('아직 수집된 시세가 없습니다');
      if (!r.ok) throw new Error('시세 ' + r.status);
      const j = await r.json();
      this.PREV = this.PRICES;
      this.PRICES = Object.assign({}, j.items || {}, this._cryptoOnly(this.PREV));
      this._updatedAt = j.updated || '';
      this._err = null;
    } catch (e) {
      // 조용히 옛 시세를 계속 보여주면 멈춘 걸 모른다 → 카드에 표시한다
      this._err = e.message;
    }
    await this._crypto();
    this._paint();
    document.querySelector('.ec-rf')?.classList.remove('spin');
  },
  // ── 코인(업비트 원화 시세) — 수집 서버를 거치지 않고 화면이 바로 받는다(키 없음) ──
  _cryptoOnly(P) { const o = {}; for (const k in (P || {})) if (k.startsWith('crypto:')) o[k] = P[k]; return o; },
  _cryptoCodes() {
    const c = this.C || {}, all = [...(c.favorites || []), ...(c.holdings || []), ...(c.watchlists || []).flatMap(w => w.items || [])];
    return [...new Set(all.filter(x => x.type === 'crypto').map(x => x.code))];
  },
  async _crypto() {
    const codes = this._cryptoCodes(); if (!codes.length) return;
    try {
      const r = await fetch('https://api.upbit.com/v1/ticker?markets=' + codes.map(encodeURIComponent).join(','));
      const j = await r.json();
      for (const t of Array.isArray(j) ? j : []) this.PRICES['crypto:' + t.market] = { price: t.trade_price, pct: Math.round((t.signed_change_rate || 0) * 10000) / 100 };
    } catch (e) {}
  },
  // 업비트 원화 마켓 목록 → 검색 목록에 '코인' 으로 섞는다(비트코인 · BTC · bitcoin 모두로 찾힌다)
  async _coins() {
    if (this.COINS) return this.COINS;
    try {
      const j = await (await fetch('https://api.upbit.com/v1/market/all?isDetails=false')).json();
      this.COINS = (j || []).filter(m => /^KRW-/.test(m.market)).map(m => ({ n: m.korean_name, c: m.market, t: 'crypto', en: m.english_name, sym: m.market.slice(4) }));
    } catch (e) { this.COINS = []; }
    return this.COINS;
  },
  _paint() {
    const upd = document.getElementById('econUpd');
    if (upd) {
      // 실패 사유를 그대로 보여준다. '불러오기 실패' 한 줄이면 로그인 문제인지
      // 수집이 멈춘 건지 구분이 안 된다.
      upd.textContent = this._err ? this._err :
        (this._updatedAt ? '업데이트 ' + this._updatedAt.replace('T',' ').slice(5,16) : '시세 대기 중');
      upd.classList.toggle('ec-err', !!this._err);
    }
    document.querySelectorAll('[data-pk]').forEach(w => {
      const it = { type:w.dataset.ptype, unit:w.dataset.punit };
      const q  = this.PRICES[w.dataset.pk] || {}, p = this.PREV[w.dataset.pk] || {};
      const pe = w.querySelector('.ec-price');
      if (pe) {
        if (q.price != null && p.price != null && q.price !== p.price) {
          pe.classList.remove('ec-fl-up','ec-fl-dn'); void pe.offsetWidth;
          pe.classList.add(q.price > p.price ? 'ec-fl-up' : 'ec-fl-dn');
        }
        pe.textContent = this.fmt(it, q.price);
      }
      const d = w.querySelector('.ec-delta');
      if (d) d.outerHTML = this.delta(q.pct);
    });
    this._paintHold();
    try { App._updateStatsBanner(); } catch (e) {}   // 상단바의 종목 등락 · 보유 수익도 같이
  },
  _startPoll() {},   // 이제 init 이 늘 1분마다 돈다(모달이 열려 있을 때만 돌던 것)
  _stopPoll()  { if (this._poll) { clearInterval(this._poll); this._poll = null; } },

  // ── 터미널 (모달) ───────────────────────────────────
  open(view) {
    this.view = view || 'main';
    App.openModal('@trend 경제', `<div class="ecv ecv-term">
      <div class="ec-nav">
        ${[['main','메인'],['hold','보유'],['watch','관심종목'],['charts','차트']].map(([v,l]) =>
          `<button class="${this.view===v?'on':''}" onclick="Econ.tab('${v}')">${l}</button>`).join('')}
        <button class="ec-gear" onclick="Econ.settings()" title="알림 설정" aria-label="알림 설정">${typeof Icons!=='undefined'?Icons.svg('gear'):'설정'}</button>
      </div>
      <div id="ecBody"></div></div>`);
    document.querySelector('#modal .modal-box')?.classList.add('wide');
    this._boundClose = this._boundClose || (() => { this._stopPoll(); document.querySelector('#modal .modal-box')?.classList.remove('wide'); });
    document.getElementById('btnModalClose')?.addEventListener('click', this._boundClose, { once:true });
    this._draw();
    this.refresh();
    this._startPoll();
  },
  tab(v) { this.view = v; document.querySelectorAll('.ec-nav button').forEach(b => b.classList.remove('on'));
           event?.target?.classList.add('on'); this._draw(); },
  _draw() {
    if (this.view === 'main')   return this._drawMain();
    if (this.view === 'hold')   return this._drawHold();
    if (this.view === 'watch')  return this._drawWatch();
    if (this.view === 'charts') return this._drawCharts();
  },

  _ic(n, alt) { return typeof Icons !== 'undefined' ? Icons.svg(n) : (alt || ''); },

  _card(it, ctx) {
    const q = this.PRICES[this.keyOf(it)] || {}, k = this.keyOf(it);
    return `<div class="ec-item">
      <div class="ec-item-top">
        <div class="ec-item-id"><div class="ec-nm">${esc(it.name)}</div>
             <div class="ec-meta"><span class="num">${esc(it.code)}</span> · ${this.TYPE[it.type]||''}</div></div>
        <div class="ec-row-r" data-pk="${k}" data-ptype="${it.type}" data-punit="${it.unit||''}">
          <div class="ec-price">${this.fmt(it,q.price)}</div>${this.delta(q.pct)}</div>
      </div>
      <div class="ec-item-bot">
        <label class="ec-fl">알림가</label>
        <input class="inp inp-sm ec-floor num" type="number" inputmode="decimal" placeholder="없음" value="${it.floor??''}"
          onchange="Econ.setFloor('${ctx}','${k}',this.value)">
        <button class="ec-dir ${it.floorDir==='above'?'ec-dir-up':'ec-dir-dn'}"
          onclick="Econ.cycleDir('${ctx}','${k}')" title="이상/이하 전환">${it.floorDir==='above'?'이상':'이하'}</button>
        <span class="ec-sp"></span>
        ${ctx==='F' ? `<span class="ec-swl">알림</span><label class="ec-sw" title="알림"><input type="checkbox" ${it.alert!==false?'checked':''}
          onchange="Econ.favAlert('${k}',this.checked)" aria-label="알림"><span></span></label>` : ''}
        <button class="ec-ib" onclick='Econ.openChart(${this.attr(it)})' title="차트" aria-label="차트">${this._ic('chart','차트')}</button>
        <button class="ec-ib ec-rm" onclick="Econ.remove('${ctx}','${k}')" title="삭제" aria-label="삭제">${this._ic('trash','삭제')}</button>
      </div></div>`;
  },

  _body() { return document.getElementById('ecBody'); },   // 모달이 닫혀 있으면 null

  _drawMain() {
    const c = this.cfg();
    const b = this._body(); if (!b) return;
    b.innerHTML =
      `<input class="inp ec-search" id="ecFSearch" placeholder="종목 검색 — 금, 삼성, 테슬라, KODEX, 비트코인"
         oninput="Econ.search(this.value,'F')"><div id="ecFRes"></div>` +
      (c.favorites.length
        ? `<div class="ec-sec"><span>즐겨찾기</span><b class="num">${c.favorites.length}</b></div>
           <div class="ec-grid">${c.favorites.map(it => this._card(it,'F')).join('')}</div>`
        : `<p class="empty">메인이 비어 있어요<br><span class="ec-hint">위에서 종목을 찾아 담으면 여기에 표시되고 알림도 옵니다</span></p>`);
  },

  _drawWatch() {
    if (!this._body()) return;
    const c = this.cfg();
    let h = `<div class="ec-lists">` +
      c.watchlists.map(w => `<button class="ec-chip ${w.id===this.activeList?'on':''}" onclick="Econ.selList('${w.id}')">${esc(w.name)}</button>`).join('') +
      `<button class="ec-chip ec-add" onclick="Econ.newList()">${this._ic('plus','＋')}새 리스트</button></div>`;
    const wl = c.watchlists.find(w => w.id === this.activeList);
    if (!c.watchlists.length) {
      h += `<p class="empty">관심종목 리스트를 만들어 보세요<br><span class="ec-hint">반도체·AI·배당주처럼 주제별로 여러 개 가능합니다</span></p>`;
    } else if (wl) {
      h += `<div class="ec-lhead"><span class="ec-lt">${esc(wl.name)}</span>
        <span class="ec-swl">알림</span>
        <label class="ec-sw"><input type="checkbox" ${wl.alert?'checked':''} onchange="Econ.listAlert('${wl.id}',this.checked)" aria-label="리스트 알림"><span></span></label>
        <button class="ec-tb" onclick="Econ.renameList('${wl.id}')">이름 변경</button>
        <button class="ec-tb ec-rm" onclick="Econ.delList('${wl.id}')">삭제</button></div>
        <input class="inp ec-search" placeholder="이 리스트에 종목 추가 — 검색" oninput="Econ.search(this.value,'L')"><div id="ecLRes"></div>`;
      h += wl.items.length
        ? `<div class="ec-grid">${wl.items.map(it => this._card(it,'L:'+wl.id)).join('')}</div>`
        : `<p class="empty">이 리스트가 비어 있어요<br><span class="ec-hint">리스트 알림을 켜면 담긴 종목 전체에 알림이 옵니다</span></p>`;
    }
    const b = this._body(); if (!b) return;
    b.innerHTML = h;
  },

  // ── 종목 검색 (tickers.json 1.3MB — 처음 검색할 때만 받는다) ──
  async _tickers() {
    if (this.TICKERS) return this.TICKERS;
    try { this.TICKERS = await (await fetch(this.raw('tickers.json'))).json(); }
    catch { this.TICKERS = []; App.showToast('종목 목록을 불러오지 못했습니다','error'); }
    return this.TICKERS;
  },
  async search(v, where) {
    if (where === 'S') return this._sList(v);
    const box = document.getElementById({ F:'ecFRes', L:'ecLRes', H:'ecHRes', O:'obERes' }[where]);
    if (!box) return;
    v = v.trim();
    if (!v) { box.innerHTML = ''; return; }
    const out = await this._match(v, () => true);
    const code = /^[0-9A-Za-z]{6}$/.test(v) ? v.toUpperCase() : '';
    box.innerHTML = out.slice(0, 8).map(x => {
        const e = x[2];
        const it = { name:e.ko || e.n, code:e.c, type:e.t, tv:e.tv, unit:this.unitFor(e.t), floor:null };
        return `<div class="ec-res"><div class="ec-item-id"><div class="ec-nm">${esc(e.ko || e.n)}</div>
          <div class="ec-meta">${e.ko ? esc(e.n)+' · ' : ''}<span class="num">${esc(e.cn || e.c)}</span> · ${this.TYPE[e.t]||''}${e.t === 'crypto' ? ' · 업비트' : ''}</div></div>
          <button class="btn-sm ec-add-btn" onclick='Econ.add("${where}",${this.attr(it)})'>${where==='H'?'보유 추가':'담기'}</button></div>`;
      }).join('') +
      (where === 'O' ? '' :
      `<button class="ec-res ec-manual" onclick="Econ.manual('${where}','${code}')">
        <span class="ec-item-id"><span class="ec-nm">코드로 직접 추가</span><span class="ec-meta">검색에 없는 ETF 등 · 예: 0173Y0</span></span><span class="ec-chev">›</span></button>`);
  },
  // 이름 · 코드 · 한글 이름표로 찾기 → [[점수, 길이, 항목], …] (점수 낮을수록 먼저)
  async _match(v, okT) {
    const [list0, coins0] = await Promise.all([this._tickers(), this._coins()]);
    const list = list0.filter(e => okT(e.t)), coins = okT('crypto') ? coins0 : [];
    const q = v.toLowerCase(), out = [];
    // 코인: 한글 이름 · 심볼(BTC) · 영어 이름. '코인' 이나 '비트' 처럼 치면 위로 올린다
    const big = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'USDT'];
    for (const e of coins) {
      const n = e.n.toLowerCase(), sym = e.sym.toLowerCase(), en = String(e.en || '').toLowerCase();
      let s = -1;
      if (/^(코인|암호화폐|가상화폐|crypto)$/.test(q) && big.includes(e.sym)) s = 2 + big.indexOf(e.sym) * 0.01;
      else if (sym === q || n === q) s = 0; else if (n.startsWith(q) || sym.startsWith(q) || en.startsWith(q)) s = 1;
      else if (n.includes(q) || en.includes(q)) s = 3;
      else if (/^(코인|암호화폐|가상화폐|crypto)$/.test(q) && big.includes(e.sym)) s = 2 + big.indexOf(e.sym) * 0.01;
      if (s >= 0) out.push([s - (big.includes(e.sym) ? 0.5 : 0), s >= 2 && s < 3 ? 0 : e.n.length, Object.assign({}, e, { c: e.c, ko: '' , cn: e.sym })]);
    }
    // 한글로 친 해외 종목(테슬라·애플…)은 한글 이름표에서 티커를 찾아 맨 앞에 올린다.
    const ko = new Map((typeof EconKo !== 'undefined' ? EconKo.match(v) : []).map(m => [m.tk, m]));
    for (const e of list) {
      const n = e.n.toLowerCase(), cd = e.c.toLowerCase();
      if (ko.size && e.t === 'us') {
        const sym = (e.tv || '').split(':')[1] || e.c.replace(/\.[A-Z]+$/, '');
        const m = ko.get(sym);
        if (m) { out.push([-10 + m.score, 0, Object.assign({}, e, { ko: m.label })]); ko.delete(sym); continue; }
      }
      let s = -1;
      if (cd === q) s = 0; else if (n.startsWith(q)) s = 1; else if (cd.startsWith(q)) s = 2;
      else if (n.includes(q)) s = 3; else if (cd.includes(q)) s = 4;
      if (s >= 0) out.push([s, e.n.length, e]);
    }
    out.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
    return out;
  },

  // ── 검색 시트 목록 ─────────────────────────────────
  // 아무것도 안 쳤을 때: 담은 종목(별 먼저, 담은 순서) → 거래대금이 많은 종목. 쳤으면 이름이 맞는 순서.
  // 담긴 줄은 주황 띠와 '담김' 단추로 구분하고, 다시 누르면 뺀다.
  async _sList(v) {
    const box = document.getElementById('ecSRes'); if (!box) return;
    const cat = localStorage.getItem(this.SCAT_KEY) || 'all';
    const okT = t => cat === 'all' || (cat === 'etc' ? !['kr', 'us', 'crypto'].includes(t) : t === cat);
    const tok = this._sTok = (this._sTok || 0) + 1;
    v = String(v || '').trim();
    const have = new Set(this.cfg().favorites.map(x => this.keyOf(x)));
    if (!v) {
      const mine = this.favOrdered().filter(x => okT(x.type)).map(it => ({ it, q: this.PRICES[this.keyOf(it)] }));
      const head = mine.length ? `<div class="ec-sh"><span>담은 종목</span><b class="num">${mine.length}</b></div>` + mine.map(r => this._sRow(r, have)).join('') : '';
      box.innerHTML = head + '<div class="ec-sh"><span>거래대금 많은 순</span></div><p class="ec-sload">불러오는 중…</p>';
      const mk = await this._mkt(cat);
      if (tok !== this._sTok) return;
      const rest = mk.filter(r => !have.has(this.keyOf(r.it))).slice(0, 80);
      box.innerHTML = head + `<div class="ec-sh"><span>${cat === 'etc' ? '지수·금·환율' : '거래대금 많은 순'}</span></div>` +
        (rest.length ? rest.map(r => this._sRow(r, have)).join('') : '<p class="ec-sload">목록을 받지 못했습니다 — 위에서 이름으로 찾아 주세요</p>');
      return;
    }
    const out = await this._match(v, okT);
    if (tok !== this._sTok) return;
    const code = /^[0-9A-Za-z]{6}$/.test(v) ? v.toUpperCase() : '';
    box.innerHTML = out.slice(0, 30).map(x => {
      const e = x[2], it = { name: e.ko || e.n, code: e.c, type: e.t, tv: e.tv, unit: this.unitFor(e.t), floor: null };
      return this._sRow({ it, q: this.PRICES[this.keyOf(it)], sub: e.ko ? e.n : '', cn: e.cn }, have);
    }).join('') + `<button class="ec-res ec-manual" onclick="Econ.manual('F','${code}')">
        <span class="ec-item-id"><span class="ec-nm">코드로 직접 추가</span><span class="ec-meta">검색에 없는 ETF 등 · 예: 0173Y0</span></span><span class="ec-chev">›</span></button>`;
  },
  _sRow(r, have) {
    const it = r.it, k = this.keyOf(it), on = have.has(k);
    const mine = on ? this.cfg().favorites.find(x => this.keyOf(x) === k) : null, q = r.q || {};
    const code = r.cn || (it.type === 'crypto' ? String(it.code).replace(/^KRW-/, '') : it.code);
    return `<div class="ec-sr${on ? ' on' : ''}" data-k="${esc(k)}">
      <div class="ec-sr-l">${this.nmHtml(it, mine && mine.star ? '<i class="ec-star">★</i>' : '')}
        <div class="ec-meta">${r.sub ? esc(this.shortName(r.sub)) + ' · ' : ''}<span class="num">${esc(code)}</span> · ${this.TYPE[it.type] || ''}</div></div>
      <div class="ec-sr-p">${q.price != null ? `<div class="ec-price num">${this.fmt(it, q.price)}</div>${this.delta(q.pct)}` : ''}</div>
      <button type="button" class="ec-sbtn" onclick='Econ.sToggle(this,${this.attr(it)})' aria-pressed="${on}">${on ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>담김' : '담기'}</button></div>`;
  },
  // 담기 ↔ 빼기 — 목록을 다시 그리지 않고 그 줄만 바꾼다(움직임이 끊기지 않게)
  sToggle(btn, it) {
    const row = btn.closest('.ec-sr'), c = this.cfg(), k = this.keyOf(it);
    const on = c.favorites.some(x => this.keyOf(x) === k);
    if (on) {
      c.favorites = c.favorites.filter(x => this.keyOf(x) !== k);
      this.queueSave(); this.render();
      try { Haptic.light(); } catch (e) {}
      App.showToast(`${this.shortName(it.name)} 뺐습니다`);
    } else {
      c.favorites.push(Object.assign({ alert: it.type !== 'crypto' }, it));
      this.queueSave(); this._newK = k; this.render();
      try { Haptic.success ? Haptic.success() : Haptic.medium(); } catch (e) {}
      if (it.type === 'crypto') setTimeout(() => this._crypto().then(() => this._paint()), 200);
      else setTimeout(() => this._live().then(() => this._paint()).catch(() => {}), 200);
    }
    if (!row) return;
    row.classList.toggle('on', !on); btn.setAttribute('aria-pressed', String(!on));
    btn.innerHTML = !on ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>담김' : '담기';
    row.classList.remove('pop', 'unpop'); void row.offsetWidth; row.classList.add(on ? 'unpop' : 'pop');
  },
  // 거래대금 상위: 국내·해외는 서버(네이버), 코인은 업비트 24시간 거래대금 — 1분 기억
  async _mkt(cat) {
    if (!this._MK || Date.now() - this._MK.t > 60e3) {
      const [st, cr] = await Promise.all([
        fetch(Platform.api('/api/hub'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'mkt' }) }).then(r => r.json()).catch(() => ({})),
        this._coinTop()]);
      const mk = e => ({ it: { name: e.n, code: e.c, type: e.t, tv: e.tv, unit: this.unitFor(e.t), floor: null }, q: { price: e.price, pct: e.pct }, val: e.val || 0, sub: e.en || '' });
      const ok = (st.items || []).map(mk).sort((a, b) => b.val - a.val);
      this._MK = { t: Date.now(), kr: ok.filter(r => r.it.type === 'kr'), us: ok.filter(r => r.it.type === 'us'), crypto: cr };
      if (!ok.length && !cr.length) this._MK.t = 0;
    }
    const M = this._MK;
    if (cat === 'kr' || cat === 'us' || cat === 'crypto') return M[cat];
    if (cat === 'etc') {
      const t = (await this._tickers()).filter(e => !['kr', 'us', 'crypto'].includes(e.t));
      return t.map(e => ({ it: { name: e.n, code: e.c, type: e.t, tv: e.tv, unit: this.unitFor(e.t), floor: null }, q: this.PRICES[e.t + ':' + e.c] }));
    }
    // 전체: 국내 · 해외 · 코인을 순위대로 번갈아(한쪽만 몰려 보이지 않게)
    const out = [], n = Math.max(M.kr.length, M.us.length, M.crypto.length);
    for (let i = 0; i < n; i++) for (const L of [M.kr, M.us, M.crypto]) if (L[i]) out.push(L[i]);
    return out;
  },
  async _coinTop() {
    try {
      const [coins, tk] = await Promise.all([this._coins(), fetch('https://api.upbit.com/v1/ticker/all?quote_currencies=KRW').then(r => r.json())]);
      const nm = new Map(coins.map(c => [c.c, c]));
      return (Array.isArray(tk) ? tk : []).filter(t => nm.has(t.market)).sort((a, b) => (b.acc_trade_price_24h || 0) - (a.acc_trade_price_24h || 0)).slice(0, 60)
        .map(t => { const c = nm.get(t.market);
          return { it: { name: c.n, code: t.market, type: 'crypto', tv: '', unit: '원', floor: null }, q: { price: t.trade_price, pct: Math.round((t.signed_change_rate || 0) * 10000) / 100 }, val: t.acc_trade_price_24h || 0, sub: c.en || '' }; });
    } catch (e) { return []; }
  },
  add(where, it) {
    if (it.type === 'crypto') setTimeout(() => this._crypto().then(() => this._paint()), 300);   // 코인은 담자마자 시세를 받는다
    // 설정 도우미(O)에서 담은 종목은 즐겨찾기로 들어간다.
    if (where === 'O') {
      const c = this.cfg(), k = this.keyOf(it);
      if (c.favorites.some(x => this.keyOf(x) === k)) { App.showToast('이미 담았어요'); return; }
      c.favorites.push(Object.assign({ alert: it.type !== 'crypto' }, it));
      this.queueSave(); App.showToast(`${it.name} 담음`, 'success');
      try { this._drawMain(); this.render(); } catch {}
      return;
    }
    const c = this.cfg(), k = this.keyOf(it);
    if (where === 'H') {
      if (it.type === 'exchange') { App.showToast('환율은 보유로 담을 수 없어요','error'); return; }
      c.holdings = c.holdings || [];
      if (c.holdings.some(x => this.keyOf(x) === k)) { App.showToast('이미 보유 목록에 있어요'); return; }
      c.holdings.push(Object.assign({ qty:0, avg:0 }, it));
      this.queueSave(); App.showToast('보유에 추가 — 수량과 평단을 입력하세요','success');
      this._drawHold(); this._paintHold();
      return;
    }
    if (where === 'F' || where === 'S') {
      if (c.favorites.some(x => this.keyOf(x) === k)) { App.showToast('이미 담겨 있어요'); return; }
      c.favorites.push(Object.assign({ alert: it.type !== 'crypto' }, it));
      this.queueSave(); App.showToast(`${it.name} 담았습니다 — 카드에 시세가 보입니다`,'success');
      try { if (where === 'F') this._drawMain(); } catch (e) {}
      this.render();
    } else {
      const w = c.watchlists.find(x => x.id === this.activeList);
      if (!w) return;
      if (w.items.some(x => this.keyOf(x) === k)) { App.showToast('이미 담겨 있어요'); return; }
      w.items.push(Object.assign({}, it));
      this.queueSave(); App.showToast(w.name + '에 담음','success'); this._drawWatch();
    }
  },
  manual(where, code) {
    App.openModal('코드로 직접 추가', `<div class="ecv ecv-sheet">
      <div class="modal-row"><label class="modal-lbl">표시 이름</label>
        <input id="ecMName" class="inp" placeholder="예: KODEX 반도체"></div>
      <div class="modal-row"><label class="modal-lbl">종목 코드</label>
        <input id="ecMCode" class="inp num" placeholder="예: 0173Y0" autocapitalize="characters" value="${code?esc(code):''}"></div>
      <p class="ec-hint">국내 종목·ETF용입니다. 해외주식은 검색으로 추가해 주세요.</p>
      <div class="modal-btns">
        <button class="btn-sm accent" onclick="Econ.manualDo('${where}')">추가</button>
        <button class="btn-sm" onclick="Econ.open('${this.view}')">취소</button>
      </div></div>`);
  },
  manualDo(where) {
    const name = document.getElementById('ecMName')?.value.trim();
    const code = (document.getElementById('ecMCode')?.value || '').trim().toUpperCase();
    if (!name || !code) { App.showToast('이름과 코드를 입력하세요','error'); return; }
    this.open(this.view);
    this.add(where, { name, code, type:'kr', tv:'KRX:'+code, unit:'원', floor:null });
  },

  // ── 보유 (수동 입력 + 자동 평가) ────────────────────
  // 증권사 API 는 개인에게 열려 있지 않다(계좌 조회는 마이데이터 허가 사항).
  // 그래서 수량·평단만 손으로 넣고, 현재가는 이미 1분마다 돌고 있는 수집
  // 파이프라인에서 그대로 가져와 곱한다. 나중에 API 어댑터가 생기면
  // holdings 의 qty/avg 를 그쪽 값으로 덮어쓰기만 하면 화면은 그대로 산다.
  fx() { const q = this.PRICES['exchange:FX_USDKRW']; return q && q.price ? q.price : null; },
  toKRW(it, p) {
    if (p == null) return null;
    if (it.type === 'us') { const f = this.fx(); return f ? p * f : null; }   // 환율 없으면 '모름'
    return p;
  },
  _won(v) { return Math.round(v).toLocaleString('ko-KR') + '원'; },
  holdSummary() {
    const hs = this.cfg().holdings || [];
    let cost = 0, value = 0, miss = 0;
    for (const h of hs) {
      const q   = this.PRICES[this.keyOf(h)] || {};
      const cur = this.toKRW(h, q.price);
      const avg = this.toKRW(h, h.avg);
      // 시세나 평단이 없는 종목은 0 으로 치지 않고 빼고 센다. 0원과 '모름'은 다르다.
      if (cur == null || avg == null || !h.qty) { miss++; continue; }
      cost  += avg * h.qty;
      value += cur * h.qty;
    }
    const profit = value - cost;
    return { n: hs.length, miss, cost, value, profit, pct: cost > 0 ? profit / cost * 100 : null };
  },
  holdHtml() {
    const s = this.holdSummary();
    if (!s.n) return '';
    const cls = s.profit > 0 ? 'ec-up' : s.profit < 0 ? 'ec-dn' : 'ec-flat';
    const sg  = s.profit > 0 ? '+' : s.profit < 0 ? '-' : '';
    return `<div class="ec-hold" onclick="Econ.open('hold')" title="보유 종목 편집">
      <span class="ec-hold-lb">보유 ${s.n}종목</span>
      <span class="ec-hold-v">${s.cost ? this._won(s.value) : '수량·평단 입력 필요'}</span>
      ${s.cost ? `<span class="ec-hold-p ${cls}">${sg}${this._won(Math.abs(s.profit))}
        · ${s.pct == null ? '—' : (s.pct > 0 ? '+' : '') + s.pct.toFixed(2) + '%'}</span>` : ''}
      ${s.miss ? `<span class="ec-hold-miss">미집계 ${s.miss}</span>` : ''}
    </div>`;
  },
  _paintHold() {
    const el = document.getElementById('econHold');
    if (el) el.innerHTML = this.holdHtml();
    // 보유가 바뀌면 맨 위 한 줄도 같이 바뀌어야 한다. 1분 뒤 시세 폴링까지 기다릴 일이 아니다.
    if (typeof TopStrip !== 'undefined') { try { TopStrip.render(); } catch {} }
  },
  _drawHold() {
    const b = this._body(); if (!b) return;
    const hs = this.cfg().holdings || [], s = this.holdSummary();
    let h = '';
    if (hs.length) {
      const cls = s.profit >= 0 ? 'ec-up' : 'ec-dn';
      h += `<div class="ec-hold-sum">
        <div class="ec-hs-main"><span>평가액</span><b class="num">${this._won(s.value)}</b></div>
        <div class="${cls}"><span>평가손익</span><b class="num">${(s.profit >= 0 ? '+' : '-') + this._won(Math.abs(s.profit))}</b></div>
        <div class="${cls}"><span>수익률</span><b class="num">${s.pct == null ? '—' : (s.pct > 0 ? '+' : '') + s.pct.toFixed(2) + '%'}</b></div>
        <div><span>매입액</span><b class="num">${this._won(s.cost)}</b></div>
      </div>`;
      if (s.miss) h += `<p class="ec-hint ec-miss-note">${s.miss}종목은 계산에서 뺐습니다 — 수량·평단이 비었거나 시세가 아직 없습니다.</p>`;
    }
    h += `<div class="ec-hold-top">
        <input class="inp ec-search" placeholder="보유 종목 추가 — 삼성전자, NVDA …"
          oninput="Econ.search(this.value,'H')">
        <div class="ec-hold-acts">
          <button class="btn-sm ec-scan" onclick="Econ.showHoldScan()" title="증권사 앱 캡처에서 읽어 오기">${this._ic('camera')}캡처로 채우기</button>
          <button class="btn-sm ec-scan" onclick="Econ.showBroker()" title="증권사 Open API 로 보유 종목 가져오기">증권사 연동</button>
        </div>
      </div><div id="ecHRes"></div>`;
    if (!hs.length) {
      h += `<p class="empty">보유 종목이 없습니다<br><span class="ec-hint">한국투자증권은 <b>증권사 연동</b>, 다른 증권사는 보유 화면 <b>캡처로 채우기</b>로 가져올 수 있습니다. 직접 검색해 넣어도 됩니다. 현재가·평가액·수익률은 자동으로 계산됩니다.</span></p>`;
    } else {
      h += `<div class="ec-sec"><span>보유 종목</span><b class="num">${hs.length}</b></div>
        <div class="ec-grid">${hs.map(it => this._holdCard(it)).join('')}</div>`;
    }
    b.innerHTML = h;
  },
  _holdCard(it) {
    const k = this.keyOf(it), q = this.PRICES[k] || {};
    const cur = this.toKRW(it, q.price), avg = this.toKRW(it, it.avg);
    const val = (cur == null || !it.qty) ? null : cur * it.qty;
    const pf  = (cur == null || avg == null || !it.qty) ? null : (cur - avg) * it.qty;
    const pct = (pf == null || !avg) ? null : (cur - avg) / avg * 100;
    const cls = pf == null ? '' : pf >= 0 ? 'ec-up' : 'ec-dn';
    return `<div class="ec-item ec-hitem">
      <div class="ec-item-top">
        <div class="ec-item-id"><div class="ec-nm">${esc(it.name)}</div>
             <div class="ec-meta"><span class="num">${esc(it.code)}</span> · ${this.TYPE[it.type]||''}</div></div>
        <div class="ec-row-r" data-pk="${k}" data-ptype="${it.type}" data-punit="${it.unit||''}">
          <div class="ec-price">${this.fmt(it,q.price)}</div>${this.delta(q.pct)}</div>
      </div>
      <div class="ec-item-bot ec-hbot">
        <label class="ec-fld"><span>수량</span>
        <input class="inp inp-sm num" type="number" inputmode="decimal" step="any" min="0" value="${it.qty ?? ''}"
          onchange="Econ.holdSet('${k}','qty',this.value)"></label>
        <label class="ec-fld"><span>평단${it.type === 'us' ? ' ($)' : ''}</span>
        <input class="inp inp-sm num" type="number" inputmode="decimal" step="any" min="0" value="${it.avg ?? ''}"
          onchange="Econ.holdSet('${k}','avg',this.value)"></label>
        <button class="ec-ib ec-rm" onclick="Econ.holdRemove('${k}')" title="삭제" aria-label="삭제">${this._ic('trash','삭제')}</button>
      </div>
      <div class="ec-hval ${cls}">${val == null ? '<span class="ec-meta">수량·평단을 넣으면 평가액이 계산됩니다</span>' : `<span class="num">${this._won(val)}</span>`}${
          pf == null ? '' : `<span class="num">${pf >= 0 ? '+' : '-'}${this._won(Math.abs(pf))} · ${pct == null ? '—' : (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'}</span>`}</div>
      </div>`;
  },
  // ── 증권사 연동 (한국투자증권 KIS Open API) ──────────────
  // 키는 이 계정의 _link 에만 저장한다(기기에 남지 않음). 조회는 서버(api/broker)가 대신 한다 —
  // KIS 는 브라우저에서 직접 부를 수 없고, 토큰을 하루 한 번만 받아 같이 써야 해서다.
  // 가져온 종목은 캡처 읽기와 같은 미리 보기를 거쳐 담는다(종목 맞추기·덮어쓰기 규칙 동일).
  async showBroker() {
    let k = {};
    try { const l = await FirebaseSync.getLink(); k = (l && l.kis) || {}; } catch {}
    const has = !!k.appkey;
    App.openModal('증권사 연동', `<div class="ecv ecv-sheet">
      <div class="ec-lead"><span class="ec-lead-k">한국투자증권</span><span class="ec-lead-s">${has ? '연동됨' : '연동 전'}</span></div>
      ${has ? '' : `<ol class="ez-steps">
        <li><button type="button" class="ez-chip" onclick="Settings.openExt('https://apiportal.koreainvestment.com/')">KIS Developers 열기 ↗</button> 에서 한국투자 아이디로 로그인합니다</li>
        <li>위쪽 <b>API 신청</b>(KIS Developers 서비스 신청) › 가져올 <b>계좌</b>를 고르고 신청 → <b>앱키</b>·<b>앱시크릿</b>이 나옵니다</li>
        <li>각 값의 <b>복사</b>를 누르고 돌아와 아래 칸 옆 <b>붙여넣기</b>를 누릅니다 (계좌번호도 같은 화면에 있습니다)</li>
      </ol>`}
      <p class="ec-hint">해외 주식은 신청할 때 <b>해외주식</b>도 함께 체크해야 같이 옵니다. 키움·토스증권은 아직 연결할 수 없어 <a href="#" onclick="event.preventDefault();Econ.showHoldScan()">캡처로 채우기</a>를 써 주세요.</p>
      <div class="modal-row"><label class="modal-lbl" for="kisKey">앱키 (App Key)</label><div class="ez-inl"><input id="kisKey" class="inp" autocomplete="off" spellcheck="false" placeholder="${has ? '저장됨 — 바꿀 때만 입력' : 'PS…'}"><button type="button" class="btn-sm" onclick="Econ._kisPaste('kisKey')">붙여넣기</button></div></div>
      <div class="modal-row"><label class="modal-lbl" for="kisSec">앱시크릿 (App Secret)</label><div class="ez-inl"><input id="kisSec" class="inp" type="password" autocomplete="off" spellcheck="false" placeholder="${has ? '저장됨 — 바꿀 때만 입력' : ''}"><button type="button" class="btn-sm" onclick="Econ._kisPaste('kisSec')">붙여넣기</button></div></div>
      <div class="modal-row"><label class="modal-lbl" for="kisAcct">계좌번호</label><div class="ez-inl"><input id="kisAcct" class="inp num" inputmode="numeric" placeholder="12345678-01" value="${k.cano ? esc(k.cano + '-' + (k.prdt || '01')) : ''}"><button type="button" class="btn-sm" onclick="Econ._kisPaste('kisAcct')">붙여넣기</button></div></div>
      <label class="ec-trow"><span>모의투자 계좌</span><span class="ec-sw"><input type="checkbox" id="kisMock" ${k.mock ? 'checked' : ''}><span></span></span></label>
      <div id="kisRes" class="ec-res-box"></div>
      <div class="modal-btns">
        <button class="btn-sm accent" id="kisGo" onclick="Econ.brokerFetch()">${has ? '보유 종목 가져오기' : '저장하고 가져오기'}</button>
        <button class="btn-sm" onclick="Econ.open(\'hold\')">닫기</button>
        ${has ? '<button class="btn-sm ec-forget" onclick="Econ.brokerForget()">연동 해제</button>' : ''}
      </div></div>`);
  },
  // 키 화면에서 복사해 온 값을 그 칸에 넣는다. 앱키(PS…)를 시크릿 칸에 눌렀으면 맞는 칸으로 옮긴다.
  async _kisPaste(id) {
    const t = await Settings.readClip();
    const el = document.getElementById(id);
    if (t == null) { el?.focus(); App.showToast('붙여넣기가 막혀 있습니다 — 칸을 길게 눌러 붙여 넣어 주세요', 'error'); return; }
    if (!t) { App.showToast('클립보드가 비어 있습니다 — KIS 화면에서 복사를 먼저 눌러 주세요', 'error'); return; }
    let v = t.split(/\s+/)[0], to = id;
    if (id !== 'kisAcct' && /^\d{8}-?\d{2}$/.test(v)) to = 'kisAcct';
    else if (id === 'kisSec' && /^PS[A-Za-z0-9]{30,}$/.test(v)) to = 'kisKey';
    else if (id === 'kisAcct' && !/^[\d-]{8,12}$/.test(v)) to = /^PS/.test(v) ? 'kisKey' : 'kisSec';
    const box = document.getElementById(to); if (box) box.value = v;
    if (to !== id) App.showToast((to === 'kisKey' ? '앱키' : to === 'kisSec' ? '앱시크릿' : '계좌번호') + ' 칸에 넣었습니다', 'success');
  },
  async brokerFetch() {
    const box = document.getElementById('kisRes'), go = document.getElementById('kisGo');
    const key = document.getElementById('kisKey')?.value.trim(), sec = document.getElementById('kisSec')?.value.trim();
    const acct = (document.getElementById('kisAcct')?.value || '').replace(/[^0-9]/g, '');
    const mock = !!document.getElementById('kisMock')?.checked;
    try {
      if (go) { go.disabled = true; go.textContent = '가져오는 중…'; }
      const l = await FirebaseSync.getLink(); const cur = (l && l.kis) || {};
      if (acct.length < 8) throw new Error('계좌번호 10자리(앞 8 + 뒤 2)를 넣어 주세요');
      const next = { ...cur, cano: acct.slice(0, 8), prdt: acct.slice(8, 10) || '01', mock };
      if (key) next.appkey = key; if (sec) next.appsecret = sec;
      if (!next.appkey || !next.appsecret) throw new Error('앱키와 앱시크릿을 넣어 주세요');
      if (JSON.stringify(next) !== JSON.stringify(cur) && !(await FirebaseSync.setLink({ kis: next }))) throw new Error('키 저장 실패 — 잠시 뒤 다시');
      const idToken = await firebase.auth().currentUser.getIdToken();
      const r = await fetch(Platform.api('/api/broker'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, act: 'holdings' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (!j.rows || !j.rows.length) throw new Error('보유 종목이 없습니다' + (j.notes?.length ? ' · ' + j.notes.join(' · ') : ''));
      this._hsRows = await this._hsMatch(j.rows);
      go?.classList.remove('accent');
      if (box) box.innerHTML = this._hsPreview() + (j.notes?.length ? `<p class="ec-hint">${esc(j.notes.join(' · '))}</p>` : '');
    } catch (e) {
      if (box) box.innerHTML = `<p class="ec-hint ec-err-msg">${esc(e.message || e)}</p>`;
    }
    if (go) { go.disabled = false; go.textContent = '다시 가져오기'; }
  },
  async brokerForget() {
    if (!confirm('증권사 연동을 해제할까요? 저장된 앱키·시크릿을 지웁니다(담아 둔 보유 종목은 그대로).')) return;
    await FirebaseSync.setLink({ kis: null, kisTok: null });
    App.showToast('연동을 해제했습니다', 'success'); this.open('hold');
  },

  // ── 캡처로 보유 채우기 ──────────────────────────────
  // 삼성증권에는 개인이 쓸 수 있는 트레이딩 Open API 가 없다(2026-08 확인).
  // 오픈뱅킹은 계좌 잔액·이체만이고 주식 보유는 안 준다. 마이데이터는 허가 사업자용이다.
  // 남은 길은 셋이었다 — 다른 증권사 계좌를 새로 열거나, 로그인 정보를 넣고 긁거나, 눈으로 옮기거나.
  //
  // 로그인 정보를 저장하는 길은 처음부터 안 간다. 증권 계좌 비밀번호를 앱에 맡기는 건
  // 얻는 것(수량 자동 입력)에 비해 잃을 것이 너무 크다.
  // 대신 사람이 이미 보고 있는 화면을 그대로 읽는다 — 식단 사진 분석과 같은 방식이다.
  // 캡처는 브라우저 밖으로 나가지 않고, AI 에게는 그림만 보낸다. 로그인 정보는 어디에도 안 남는다.
  showHoldScan() {
    if (!JARVIS._getKey()) {
      JARVIS.needKey('AI 키가 있어야 합니다 — 무료 키로 바로 쓸 수 있습니다'); return;
    }
    App.openModal('@camera 캡처로 보유 종목 채우기', `<div class="ecv ecv-sheet">
      <p class="ec-hint">증권사 앱의 보유 종목 화면을 캡처해 올리면 종목·수량·평단을 읽어 옵니다.
        읽은 값은 확인한 뒤에 담깁니다.</p>
      <div id="hsZone" class="photo-drop-zone hs-zone" onclick="document.getElementById('hsFile').click()">
        <div id="hsPrev" class="hs-prev"><span class="hs-ic">${this._ic('camera')}</span>
          <p class="hs-zt">캡처를 고르거나 끌어다 놓으세요</p><p class="hs-zs">붙여 넣기(Ctrl+V)도 됩니다</p></div>
        <input id="hsFile" type="file" accept="image/*" hidden
          onchange="Econ._hsPick(this)">
      </div>
      <div id="hsRes" class="ec-res-box"></div>
      <div class="modal-btns">
        <button id="hsGo" onclick="Econ._hsScan()" class="btn-sm accent" disabled>읽기</button>
        <button onclick="App.closeModal()" class="btn-sm">닫기</button>
      </div></div>`);
    setTimeout(() => {
      const z = document.getElementById('hsZone'); if (!z) return;
      z.addEventListener('dragover',  e => { e.preventDefault(); z.style.borderColor='var(--accent)'; });
      z.addEventListener('dragleave', () => { z.style.borderColor=''; });
      z.addEventListener('drop', e => { e.preventDefault(); z.style.borderColor='';
        const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) Econ._hsLoad(f); });
      // 캡처는 보통 클립보드에 있다. 파일로 저장하게 만들면 한 단계가 늘어난다.
      z.addEventListener('paste', e => {
        const f = [...(e.clipboardData?.items||[])].find(i => i.type.startsWith('image/'));
        if (f) Econ._hsLoad(f.getAsFile());
      });
      document.addEventListener('paste', Econ._hsPaste = e => {
        if (!document.getElementById('hsZone')) { document.removeEventListener('paste', Econ._hsPaste); return; }
        const f = [...(e.clipboardData?.items||[])].find(i => i.type.startsWith('image/'));
        if (f) Econ._hsLoad(f.getAsFile());
      });
    }, 100);
  },

  _hsB64: null,
  _hsPick(input) { const f = input.files[0]; if (f) this._hsLoad(f); },
  _hsLoad(file) {
    const r = new FileReader();
    r.onload = e => {
      this._hsB64 = e.target.result.split(',')[1];
      const prev = document.getElementById('hsPrev');
      if (prev) prev.innerHTML = `<img src="data:${file.type};base64,${this._hsB64}"
        class="hs-img" alt="캡처 미리 보기">`;
      const g = document.getElementById('hsGo'); if (g) g.disabled = false;
    };
    r.readAsDataURL(file);
  },

  async _hsScan() {
    if (!this._hsB64) return;
    const go = document.getElementById('hsGo'), box = document.getElementById('hsRes');
    if (go) { go.disabled = true; go.textContent = '읽는 중…'; }
    if (box) box.innerHTML = '';
    try {
      const data = await JARVIS.chat({ max_tokens:1200, temperature:0, messages:[{ role:'user', content:[
        { type:'image_url', image_url:{ url:`data:image/jpeg;base64,${this._hsB64}` } },
        { type:'text', text:`증권사 앱의 보유 종목 화면이다. 보이는 종목만 그대로 읽어라.
없는 값은 지어내지 말고 null 로 둔다. 평가금액이나 손익이 아니라 매입 평단가를 avg 에 넣는다.
수량은 주 수다. 미국 주식이면 market 을 "us", 국내면 "kr" 로 한다.
ticker 에는 종목코드를 넣는다 — 화면에 보이면 그대로, 안 보여도 아는 종목이면 표준 코드를 적어라
(예: 삼성전자 → "005930", 엔비디아 → "NVDA"). 정말 모르면 null.
JSON 만 출력. 다른 말 금지.
{"rows":[{"name":"종목명","ticker":"코드 또는 null","qty":숫자 또는 null,"avg":숫자 또는 null,"market":"kr" 또는 "us"}]}` }
      ]}] }, 'vision');
      const ch = data.choices?.[0];
      const txt = ch?.message?.content || '';
      if (!txt.trim()) throw new Error(ch?.finish_reason === 'length'
        ? '답이 길어 잘렸어요. 종목이 많으면 나눠서 캡처해 주세요'
        : 'AI 가 빈 답을 보냈어요. 다시 눌러 주세요');
      let j = null; try { const m = txt.match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch {}
      const rows = (j && Array.isArray(j.rows)) ? j.rows : null;
      if (!rows) throw new Error('AI 답을 읽지 못했어요. 다시 눌러 주세요');
      if (!rows.length) throw new Error('보유 종목을 찾지 못했어요. 종목명과 수량이 보이는 화면인지 확인해 주세요');
      this._hsRows = await this._hsMatch(rows);
      if (box) box.innerHTML = this._hsPreview();
      go?.classList.remove('accent');   // 이제 주 단추는 '고른 종목 담기' 하나
    } catch (e) {
      if (box) box.innerHTML = `<p class="ec-hint ec-err-msg">읽기 실패 · ${esc(e.message)}</p>`;
    }
    if (go) { go.disabled = false; go.textContent = '다시 읽기'; }
  },

  // AI 가 읽은 이름을 실제 종목으로 맞춘다. 못 맞힌 건 버리지 않고 '못 찾음' 으로 남겨서
  // 사람이 보게 한다 — 조용히 빠지면 몇 종목이 빠졌는지도 모른다.
  // 이름만으로 맞추면 미국 주식이 통째로 샌다 — 증권사 앱은 '엔비디아' 라고 쓰는데
  // 우리 목록은 'NVIDIA' 다. 그래서 AI 에게 코드를 같이 물었고, 코드를 먼저 본다.
  async _hsMatch(rows) {
    const list = await this._tickers();
    const num = v => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
    return rows.map(r => {
      const nm  = String(r.name || '').trim();
      const tk  = String(r.ticker || '').trim().toLowerCase();
      const want = (r.market === 'us') ? 'us' : (r.market === 'kr') ? 'kr' : null;
      const q = nm.toLowerCase();
      let best = null, bs = 99;
      for (const e of list) {
        const cd = e.c.toLowerCase(), n = e.n.toLowerCase();
        let sc = -1;
        // 코드가 맞으면 시장 표기가 어긋나도 그게 맞다. 이름은 시장이 맞을 때만 본다.
        if (tk && cd === tk) sc = 0;
        else if (want && e.t !== want) continue;
        else if (n === q) sc = 1; else if (cd === q) sc = 2;
        else if (n.startsWith(q)) sc = 3; else if (n.includes(q)) sc = 4;
        if (sc >= 0 && (sc < bs || (sc === bs && e.n.length < best.n.length))) { bs = sc; best = e; }
      }
      return { raw:nm, qty:num(r.qty), avg:num(r.avg),
               hit: best ? { name:best.n, code:best.c, type:best.t, tv:best.tv,
                             unit:this.unitFor(best.t), floor:null } : null };
    });
  },

  _hsRows: null,
  _hsPreview() {
    const rs = this._hsRows || [];
    const ok = rs.filter(r => r.hit).length;
    const dup = rs.filter(r => r.hit && (this.cfg().holdings||[]).some(h => this.keyOf(h) === this.keyOf(r.hit))).length;
    return `<div class="hs-list">${rs.map((r,i) => {
      const cls = !r.hit ? 'hs-miss' : '';
      return `<label class="hs-row ${cls}">
        <input type="checkbox" ${r.hit?'checked':'disabled'} data-i="${i}">
        <span class="hs-nm">${esc(r.hit ? r.hit.name : r.raw)}${
          r.hit ? '' : ' <i>못 찾음</i>'}</span>
        <span class="hs-q num">${r.qty ?? '—'}주</span>
        <span class="hs-a num">${r.avg == null ? '평단 —'
          : (r.hit && r.hit.type === 'us') ? '$' + r.avg.toLocaleString('en-US',{maximumFractionDigits:2})
          : this._won(r.avg)}</span>
      </label>`; }).join('')}</div>
      <p class="ec-hint hs-note">${ok}종목을 찾았습니다${dup?` · 그중 ${dup}종목은 이미 보유 목록에 있어 값만 덮어씁니다`:''}.
        <b>AI 가 읽은 값이라 틀릴 수 있습니다</b> — 담은 뒤 수량·평단을 한 번 확인해 주세요.</p>
      <button class="btn-sm accent hs-apply" onclick="Econ._hsApply()">고른 종목 담기</button>`;
  },

  _hsApply() {
    const rs = this._hsRows || [];
    const picks = [...document.querySelectorAll('.hs-row input:checked')].map(el => rs[+el.dataset.i]);
    if (!picks.length) { App.showToast('담을 종목을 골라 주세요','error'); return; }
    const c = this.cfg();
    c.holdings = c.holdings || [];
    let added = 0, updated = 0;
    for (const r of picks) {
      if (!r.hit) continue;
      const k = this.keyOf(r.hit);
      const cur = c.holdings.find(h => this.keyOf(h) === k);
      if (cur) { if (r.qty != null) cur.qty = r.qty; if (r.avg != null) cur.avg = r.avg; updated++; }
      else { c.holdings.push(Object.assign({ qty:r.qty ?? 0, avg:r.avg ?? 0 }, r.hit)); added++; }
    }
    this.queueSave(); App.closeModal();
    this._drawHold(); this._paintHold();
    App.showToast(`보유 ${added?`${added}종목 추가`:''}${added&&updated?' · ':''}${updated?`${updated}종목 갱신`:''}`,'success');
  },

  holdSet(k, f, v) {
    const it = (this.cfg().holdings || []).find(x => this.keyOf(x) === k);
    if (!it) return;
    const n = parseFloat(v);
    it[f] = (isNaN(n) || n < 0) ? 0 : n;
    this.queueSave(); this._drawHold(); this._paintHold();
  },
  holdRemove(k) {
    const c = this.cfg();
    c.holdings = (c.holdings || []).filter(x => this.keyOf(x) !== k);
    this.queueSave(); this._drawHold(); this._paintHold();
  },

  // ── 항목 조작 ───────────────────────────────────────
  _find(ctx, k) {
    const c = this.cfg();
    if (ctx === 'F') return c.favorites.find(x => this.keyOf(x) === k);
    return (c.watchlists.find(w => w.id === ctx.slice(2))?.items || []).find(x => this.keyOf(x) === k);
  },
  remove(ctx, k) {
    const c = this.cfg();
    if (ctx === 'F') { c.favorites = c.favorites.filter(x => this.keyOf(x) !== k); this.queueSave(); this._drawMain(); this.render(); return; }
    const w = c.watchlists.find(x => x.id === ctx.slice(2));
    if (w) { w.items = w.items.filter(x => this.keyOf(x) !== k); this.queueSave(); this._drawWatch(); }
  },
  setFloor(ctx, k, v) { const it = this._find(ctx,k); if (it) { it.floor = v === '' ? null : parseFloat(v); this.queueSave(); } },
  cycleDir(ctx, k)    { const it = this._find(ctx,k); if (it) { it.floorDir = it.floorDir === 'above' ? 'below' : 'above'; this.queueSave(); ctx==='F'?this._drawMain():this._drawWatch(); } },
  favAlert(k, on)     { const it = this.cfg().favorites.find(x => this.keyOf(x) === k); if (it) { it.alert = on; this.queueSave(); } },
  listAlert(id, on)   { const w = this.cfg().watchlists.find(x => x.id === id); if (w) { w.alert = on; this.queueSave(); } },
  selList(id)         { this.activeList = id; this._drawWatch(); },
  newList() {
    const name = prompt('새 리스트 이름 (예: 배당주)');
    if (!name || !name.trim()) return;
    const w = { id:this.uid(), name:name.trim(), alert:false, items:[] };
    this.cfg().watchlists.push(w); this.activeList = w.id; this.queueSave(); this._drawWatch();
  },
  renameList(id) {
    const w = this.cfg().watchlists.find(x => x.id === id); if (!w) return;
    const name = prompt('리스트 이름 변경', w.name);
    if (!name || !name.trim()) return;
    w.name = name.trim(); this.queueSave(); this._drawWatch();
  },
  delList(id) {
    const c = this.cfg(), w = c.watchlists.find(x => x.id === id); if (!w) return;
    if (!confirm(`'${w.name}' 리스트를 삭제할까요?`)) return;
    c.watchlists = c.watchlists.filter(x => x.id !== id);
    if (this.activeList === id) this.activeList = c.watchlists[0]?.id || null;
    this.queueSave(); this._drawWatch();
  },

  // ── 알림 설정 ───────────────────────────────────────
  settings() {
    const c = this.cfg();
    this._times = c.report_times.slice();
    this._renderSettings();
  },
  _renderSettings() {
    const c = this.cfg(), ma = c.market_alerts;
    const rows = this._times.map((t,i) =>
      `<div class="ec-time-row"><input type="time" class="inp inp-sm num" value="${t}" onchange="Econ._times[${i}]=this.value" aria-label="리포트 시간 ${i+1}">
       <button class="ec-ib ec-rm" onclick="Econ._times.splice(${i},1);Econ._renderSettings()" title="삭제" aria-label="삭제">${this._ic('close','삭제')}</button></div>`).join('');
    const mk = (k,l,t) => `<label class="ec-toggle-row ec-trow"><span>${l}<i class="num">${t}</i></span>
      <span class="ec-sw"><input type="checkbox" ${ma[k]?'checked':''} onchange="Econ.cfg().market_alerts['${k}']=this.checked"><span></span></span></label>`;
    App.openModal('@bell 시세 알림 설정', `<div class="ecv ecv-sheet">
      <div class="ec-sec ec-sec-top"><span>매일 리포트 시간</span></div>
      <div class="ec-times">${rows || '<p class="ec-hint">시간을 추가하세요</p>'}</div>
      <button class="ec-tb ec-tb-add" onclick="Econ._times.push('08:00');Econ._renderSettings()">${this._ic('plus','＋')}시간 추가</button>
      <div class="ec-sec"><span>장 시작·마감 알림</span></div>
      ${mk('kr_open','한국 장 시작','09:00')}
      ${mk('kr_close','한국 장 마감','15:30')}
      ${mk('us_open','미국 장 시작','밤 22:30경')}
      ${mk('us_close','미국 장 마감','새벽 05:00경')}
      <p class="ec-hint">켜면 그 시각에 담은 종목과 알림 켠 리스트의 시세를 앱 알림으로 보냅니다. (서버가 10분마다 확인 — 최대 10분 늦을 수 있습니다)</p>
      <div class="ec-sec"><span>급변동 알림 기준</span></div>
      <div class="ec-pct"><input id="ecMove" type="number" inputmode="decimal" class="inp inp-sm num" value="${c.move_pct||10}" aria-label="급변동 알림 기준"><span>%</span></div>
      <div class="modal-btns">
        <button class="btn-sm accent" onclick="Econ.saveSettings()">저장</button>
        <button class="btn-sm" onclick="Econ.open('${this.view}')">뒤로</button>
      </div></div>`);
  },
  saveSettings() {
    const c = this.cfg();
    const times = [...new Set(this._times.filter(t => /^\d\d:\d\d$/.test(t)))].sort();
    c.report_times = times.length ? times : ['08:00'];
    delete c.report_time;
    c.move_pct = parseFloat(document.getElementById('ecMove')?.value) || 10;
    this.save();
    App.showToast('설정 저장됨','success');
    this.open(this.view);
  },

  // ── 차트 ────────────────────────────────────────────
  // lightweight-charts 는 200KB 가 넘는다. 카드만 보는 사람에게 매번 받게 하지 않는다.
  _lw() {
    if (window.LightweightCharts) return Promise.resolve(true);
    if (this._lwLoading) return this._lwLoading;
    this._lwLoading = new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';
      s.onload  = () => res(true);
      s.onerror = () => { this._lwLoading = null; res(false); };
      document.head.appendChild(s);
    });
    return this._lwLoading;
  },
  async _history() {
    if (Object.keys(this.HIST.items||{}).length && Date.now() - this.HIST_AT < 60000) return true;
    try {
      const j = await (await fetch(this.raw('history.json'), { cache:'no-store' })).json();
      if (j && j.items) { this.HIST = j; this.HIST_AT = Date.now(); return true; }
    } catch {}
    return false;
  },
  _ser(it) { const h = this.HIST.items[this.keyOf(it)]; return (h && h[this.chartTF]) || null; },

  _drawCharts() {
    const c = this.cfg();
    const TF = [['1','1분'],['30','30분'],['60','1시간'],['d','일'],['w','주'],['mo','월']];
    let h = `<div class="ec-lists"><button class="ec-chip ${this.chartScope==='fav'?'on':''}" onclick="Econ.chScope('fav')">즐겨찾기</button>` +
      c.watchlists.map(w => `<button class="ec-chip ${this.chartScope===w.id?'on':''}" onclick="Econ.chScope('${w.id}')">${esc(w.name)}</button>`).join('') + `</div>
      <div class="ec-seg ec-mode">
        <button class="${this.chartMode==='combined'?'on':''}" onclick="Econ.chMode('combined')">함께 보기</button>
        <button class="${this.chartMode==='separate'?'on':''}" onclick="Econ.chMode('separate')">따로 보기</button></div>
      <div class="ec-seg ec-tf">${TF.map(([v,l]) => `<button class="${this.chartTF===v?'on':''}" onclick="Econ.chTF('${v}')">${l}</button>`).join('')}</div>`;
    const b = this._body(); if (!b) return;
    const items = this.chartScope === 'fav' ? c.favorites : (c.watchlists.find(w => w.id === this.chartScope)?.items || []);
    if (!items.length) { b.innerHTML = h + '<p class="empty">표시할 종목이 없어요</p>'; return; }
    b.innerHTML = h + '<div id="ecChartArea"><p class="empty">차트 불러오는 중…</p></div>';
    Promise.all([this._lw(), this._history()]).then(([lw, hist]) => {
      if (this.view !== 'charts') return;
      const area = document.getElementById('ecChartArea');
      if (!area) return;
      // 조용히 빈 차트를 보여주지 않는다 — 왜 안 나오는지 적는다
      if (!lw)   { area.innerHTML = '<p class="empty">차트 라이브러리를 불러오지 못했습니다</p>'; return; }
      if (!hist) { area.innerHTML = '<p class="empty">차트 데이터를 불러오지 못했습니다</p>'; return; }
      this.chartMode === 'combined' ? this._combined(area, items) : this._separate(area, items);
    });
  },
  chScope(s) { this.chartScope = s; this._drawCharts(); },
  chMode(m)  { this.chartMode  = m; this._drawCharts(); },
  chTF(v)    { this.chartTF    = v; this._drawCharts(); },

  _opts(h) {
    const dark = document.documentElement.classList.contains('dark');
    const v2 = document.documentElement.dataset.ui === 'v2';
    return { height:h, layout:{ background:{color:'transparent'},
             textColor: v2 ? (dark?'#8B8F97':'#7C8088') : (dark?'#94a3b8':'#475569'),
             fontFamily: v2 ? "'Space Grotesk','IBM Plex Sans KR',sans-serif" : 'inherit', fontSize: v2 ? 11 : 12, attributionLogo:false },
      grid:{ vertLines:{visible:false}, horzLines:{ color: v2 ? (dark?'#1E2024':'#ECECE9') : (dark?'#1e293b':'#eef1f6') } },
      rightPriceScale:{ borderVisible:false }, timeScale:{ borderVisible:false },
      crosshair:{ mode:1 }, localization:{ locale:'ko-KR' } };
  },
  UP: '#dc2626', DN: '#3b82f6',
  get _up() { return document.documentElement.dataset.ui === 'v2' ? '#E5484D' : this.UP; },
  get _dn() { return document.documentElement.dataset.ui === 'v2' ? '#4C8DF6' : this.DN; },
  PAL: ['#3b82f6','#dc2626','#059669','#9333ea','#d97706','#0891b2','#db2777','#65a30d','#e11d48','#4f46e5'],
  _candles(a) { return a.map(r => ({ time:r[0], open:r[1], high:r[2], low:r[3], close:r[4] })); },

  _separate(area, items) {
    area.innerHTML = '<div class="ec-cgrid"></div>';
    const grid = area.querySelector('.ec-cgrid');
    items.forEach((it,i) => {
      const q = this.PRICES[this.keyOf(it)] || {};
      const d = document.createElement('div');
      d.className = 'ec-gcard';
      d.innerHTML = `<div class="ec-gtop" onclick='Econ.openChart(${this.attr(it)})'>
          <div><div class="ec-nm">${esc(it.name)}</div><div class="ec-meta">${this.TYPE[it.type]||''}</div></div>
          <div class="ec-row-r"><div class="ec-price">${this.fmt(it,q.price)}</div>${this.delta(q.pct)}</div>
        </div><div class="ec-gtv" id="ecLw${i}"></div>`;
      grid.appendChild(d);
      const ser = this._ser(it), box = document.getElementById('ecLw'+i);
      if (!ser || !ser.length) {
        box.innerHTML = `<div class="ec-miss">${it.type==='metal'?'차트 미지원':'데이터 준비 중 (20분 내 수집)'}</div>`;
        return;
      }
      const ch = LightweightCharts.createChart(box, Object.assign(this._opts(150), { handleScroll:false, handleScale:false }));
      ch.addCandlestickSeries({ upColor:this._up, downColor:this._dn, borderVisible:false,
        wickUpColor:this._up, wickDownColor:this._dn }).setData(this._candles(ser));
      ch.timeScale().fitContent();
    });
  },
  _combined(area, items) {
    const has = it => { const s = this._ser(it); return s && s.length; };
    const groups = [
      { label:'한국 (원)',  list: items.filter(it => it.type==='kr' && has(it)) },
      { label:'해외 ($)',   list: items.filter(it => it.type==='us' && has(it)) },
      { label:'환율·지표',  list: items.filter(it => it.type==='exchange' && has(it)) },
    ].filter(g => g.list.length);
    if (!groups.length) { area.innerHTML = '<p class="empty">차트 데이터 준비 중<br><span class="ec-hint">종목을 담으면 20분 내 자동 수집됩니다</span></p>'; return; }
    area.innerHTML = '';
    groups.forEach((g,gi) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="ec-glabel">${g.label}</div><div class="ec-combo" id="ecCb${gi}"></div><div class="ec-legend" id="ecLg${gi}"></div>`;
      area.appendChild(wrap);
      const ch = LightweightCharts.createChart(document.getElementById('ecCb'+gi), this._opts(320));
      let leg = '';
      g.list.forEach((it,i) => {
        const col = this.PAL[i % this.PAL.length];
        ch.addLineSeries({ color:col, lineWidth:2, priceLineVisible:false, lastValueVisible:true,
          priceFormat:{ type:'price', precision: it.type==='us'?2:0, minMove: it.type==='us'?0.01:1 } })
          .setData(this._ser(it).map(r => ({ time:r[0], value:r[4] })));
        const q = this.PRICES[this.keyOf(it)] || {};
        leg += `<span class="ec-lgi"><i style="background:${col}"></i>${esc(it.name)} <b>${this.fmt(it,q.price)}</b></span>`;
      });
      ch.timeScale().fitContent();
      document.getElementById('ecLg'+gi).innerHTML = leg;
    });
  },

  async openChart(it) {
    App.openModal('@trend ' + it.name, `<div class="ecv ecv-chart"><div class="ec-one-h"><span class="ec-meta"><span class="num">${esc(it.code||'')}</span> · ${this.TYPE[it.type]||''}</span></div><div id="ecOne" class="ec-one"><p class="empty">차트 불러오는 중…</p></div></div>`);
    document.querySelector('#modal .modal-box')?.classList.add('wide');
    const [lw, hist] = await Promise.all([this._lw(), this._history()]);
    const box = document.getElementById('ecOne');
    if (!box) return;
    const ser = this._ser(it);
    if (!lw)              { box.innerHTML = '<p class="empty">차트 라이브러리를 불러오지 못했습니다</p>'; return; }
    if (!hist)            { box.innerHTML = '<p class="empty">차트 데이터를 불러오지 못했습니다</p>'; return; }
    if (!ser || !ser.length) {
      box.innerHTML = `<p class="empty">${it.type==='metal'?'이 항목은 차트를 지원하지 않습니다':'차트 데이터 준비 중입니다 (20분 내 수집)'}</p>`;
      return;
    }
    box.innerHTML = '';
    const ch = LightweightCharts.createChart(box, Object.assign(this._opts(box.clientHeight || 360), { autoSize:true }));
    ch.addCandlestickSeries({ upColor:this._up, downColor:this._dn, borderVisible:false,
      wickUpColor:this._up, wickDownColor:this._dn }).setData(this._candles(ser));
    ch.timeScale().fitContent();
  },
};
