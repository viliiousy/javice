// js/top-info.js — 상단바 오른쪽 묶음에 무엇을 보일지 (설정 › 디자인 › 상단바 정보)
//
// 왼쪽 묶음(습관·할일·체크)은 그대로 두고, 오른쪽 묶음을 사용자가 고른다.
//   몸: 칼로리 · 몸무게 · 체지방 · BMI · 근육량  (+ 추세: 직전 기록보다 오르면 빨간 ▲, 내리면 파란 ▼)
//   주식: 끔 / 보유 주식(오늘 등락 %) / 관심종목(앞 2개 오늘 등락 %)
// AI 사용량 고리에 무엇을 보일지도 여기서 고른다(gl_aiu_show — AIUsage 가 읽는다).
const TopInfo = {
  KEY: 'gl_top_info',
  DEF: { kcal: true, wt: true, bf: false, bmi: false, ms: false, trend: true, stock: 'off' },
  METRICS: [
    ['kcal', '칼로리'], ['wt', '몸무게'], ['bf', '체지방'], ['bmi', 'BMI'], ['ms', '근육량'],
  ],
  get() {
    try { return { ...this.DEF, ...(JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}) }; } catch { return { ...this.DEF }; }
  },
  set(patch) {
    localStorage.setItem(this.KEY, JSON.stringify({ ...this.get(), ...patch }));
    window.FirebaseSync?.scheduleSave?.();
    try { App._updateStatsBanner(); } catch (e) {}
  },

  // 직전 기록 대비 화살표. 무게가 늘면 빨강 ▲, 줄면 파랑 ▼ (사용자가 정한 색)
  _trend(recs, k) {
    const xs = recs.filter(r => Number(r[k]) > 0);
    if (xs.length < 2) return '';
    const a = Number(xs[xs.length - 2][k]), b = Number(xs[xs.length - 1][k]);
    const d = Math.round((b - a) * 10) / 10;
    if (!d) return '<i class="ti-tr ti-flat">–</i>';
    return d > 0 ? `<i class="ti-tr ti-up" title="직전보다 +${d}">▲</i>` : `<i class="ti-tr ti-dn" title="직전보다 ${d}">▼</i>`;
  },

  // 몸 지표 칩들 (칼로리 칩은 app.js 가 만든 것을 그대로 받는다)
  bodyChips(calChip) {
    const c = this.get();
    let out = c.kcal ? calChip : '';
    let recs = [];
    try { recs = (typeof InBody !== 'undefined' && InBody.getRecords()) || []; } catch (e) {}
    const last = k => { for (let i = recs.length - 1; i >= 0; i--) if (Number(recs[i][k]) > 0) return recs[i][k]; return null; };
    const unit = { wt: 'kg', bf: '%', bmi: '', ms: 'kg' };
    const lbl = { wt: '', bf: '지방', bmi: 'BMI', ms: '근육' };
    for (const k of ['wt', 'bf', 'bmi', 'ms']) {
      if (!c[k]) continue;
      const v = last(k); if (v == null) continue;
      out += `<div class="stat-chip stat-${k}" data-s="inbody" title="최근 기록">${lbl[k] ? `<span class="ti-lb">${lbl[k]}</span>` : ''}<b>${v}</b>${unit[k]}${this._trend(recs, k)}</div>`;
    }
    return out;
  },

  // 주식: 오늘 등락. 보유는 평가액 가중 평균, 관심종목은 앞 2개.
  stockChip() {
    const c = this.get();
    if (c.stock === 'off' || typeof Econ === 'undefined') return '';
    let cfg; try { cfg = Econ.cfg(); } catch (e) { return ''; }
    const pc = v => v == null ? '—' : `<b class="${v > 0 ? 'ti-up' : v < 0 ? 'ti-dn' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : ''}${Math.abs(v).toFixed(1)}%</b>`;
    if (c.stock === 'hold') {
      const hs = cfg.holdings || [];
      let now = 0, prev = 0;
      for (const h of hs) {
        const q = Econ.PRICES[Econ.keyOf(h)] || {};
        const cur = Econ.toKRW(h, q.price);
        if (cur == null || !h.qty || q.pct == null) continue;
        now += cur * h.qty; prev += cur * h.qty / (1 + q.pct / 100);
      }
      if (!prev) return '';
      return `<div class="stat-chip stat-stock" data-s="econ" title="보유 주식 오늘 등락"><span class="ti-lb">보유</span>${pc((now / prev - 1) * 100)}</div>`;
    }
    const favs = (cfg.favorites || []).slice(0, 2);
    if (!favs.length) return '';
    return `<div class="stat-chip stat-stock" data-s="econ" title="관심종목 오늘 등락">${favs.map((it, i) =>
      `<span class="ti-st${i ? ' ti-st2' : ''}"><span class="ti-nm">${esc(String(it.name || '').replace(/\s*\(.*$/, '').slice(0, 5))}</span> ${pc((Econ.PRICES[Econ.keyOf(it)] || {}).pct)}</span>`).join(' ')}</div>`;
  },

  // 설정 화면
  pageHtml() {
    const c = this.get();
    const sw = (k) => Settings._sw(!!c[k], `TopInfo.toggle('${k}')`);
    return `<div class="set-h">상단바 오른쪽에 보일 것</div><p class="pg-note" style="margin:0 0 4px">직전 기록보다 오르면 빨간 ▲, 내리면 파란 ▼ 가 함께 붙습니다.</p>
      ${this.METRICS.map(([k, n]) => Settings._item(n, sw(k))).join('')}
      ${Settings._item('주식', Settings._seg(c.stock, [['off', '끔'], ['hold', '보유'], ['watch', '관심']], 'TopInfo.setStock'), '오늘(전날 대비) 등락 %')}
      <div class="set-h">AI 사용량 고리</div>
      <div class="set-pad">${typeof AIUsage !== 'undefined' ? AIUsage.trackHtml() : ''}</div>`;
  },
  toggle(k) { this.set({ [k]: !this.get()[k] }); Settings._re('topinfo'); },
  setStock(v) { this.set({ stock: v }); Settings._re('topinfo'); },
};
