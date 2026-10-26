// js/top-info.js — 상단바 오른쪽 묶음에 무엇을 보일지 (설정 › 디자인 › 상단바 정보)
//
// 왼쪽 묶음(습관·할일·체크)은 그대로 두고, 오른쪽 묶음을 사용자가 고른다.
//   몸: 칼로리 · 몸무게 · 체지방 · BMI · 근육량  (+ 추세: 직전 기록보다 오르면 빨간 ▲, 내리면 파란 ▼)
//   주식: 끔 / 담은 종목(카드 순서 앞 2개 오늘 등락 %) / 보유 수익(총 평가손익 · 수익률)
// AI 사용량 고리에 무엇을 보일지도 여기서 고른다(gl_aiu_show — AIUsage 가 읽는다).
const TopInfo = {
  KEY: 'gl_top_info',
  DEF: { kcal: true, steps: true, wt: true, bf: false, bmi: false, ms: false, trend: true, stock: 'off' },
  METRICS: [
    ['kcal', '칼로리'], ['steps', '걸음 수'], ['wt', '몸무게'], ['bf', '체지방'], ['bmi', 'BMI'], ['ms', '근육량'],
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
    let out = '';
    let recs = [];
    try { recs = (typeof InBody !== 'undefined' && InBody.getRecords()) || []; } catch (e) {}
    const last = k => { for (let i = recs.length - 1; i >= 0; i--) if (Number(recs[i][k]) > 0) return recs[i][k]; return null; };
    const unit = { wt: 'kg', bf: '%', bmi: '', ms: 'kg' };
    const lbl = { wt: '', bf: '지방', bmi: 'BMI', ms: '근육' };
    for (const k of ['wt', 'bf', 'bmi', 'ms']) {
      if (!c[k]) continue;
      // BMI 는 가장 최근 체중 기록 기준(없으면 체중·키로 계산) — 인바디 카드와 같은 값을 보인다
      const v = k === 'bmi' && typeof InBody !== 'undefined' && InBody.bmiOf ? (InBody.bmiOf(recs.filter(r => Number(r.wt) > 0).slice(-1)[0]) ?? last(k)) : last(k);
      if (v == null) continue;
      out += `<div class="stat-chip stat-${k}" data-s="inbody" title="최근 기록">${lbl[k] ? `<span class="ti-lb">${lbl[k]}</span>` : ''}<b>${v}</b>${unit[k]}${this._trend(recs, k)}</div>`;
    }
    // 칼로리는 늘 왼쪽, 몸 수치(몸무게·체지방·BMI·근육량)는 한 묶음으로 오른쪽에 모은다
    // 걸음 수(아이폰 건강 앱 — js/steps.js). 오늘 걸음이 있을 때만
    let st = '';
    //   걸음이 늘면 이전 숫자에서 올라가고, 늘어난 만큼 '👣 +320' 이 잠깐 떠올랐다 사라진다(같은 날짜일 때만)
    try { if (c.steps && typeof Steps !== 'undefined') {
      const d = App.S && App.S.selDate ? new Date(App.S.selDate) : new Date(), n = Steps.get(d), ds = Steps._ds(d);
      const was = this._st && this._st.ds === ds ? this._st.n : n, gain = n - was;
      this._st = { ds, n };
      if (n) {
        st = `<div class="stat-chip stat-steps" data-s="diet" title="걸음 수(건강 앱)" aria-label="걸음 수 ${n}"><b class="ti-stn" data-from="${was}" data-to="${n}">${was.toLocaleString('ko-KR')}</b><span class="ti-lb">걸음</span>${gain > 0 ? `<span class="ti-stp">👣 +${gain.toLocaleString('ko-KR')}</span>` : ''}</div>`;
        if (gain) setTimeout(() => this._anim(), 30);
      }
    } } catch (e) {}
    return (c.kcal ? calChip : '') + st + (out ? `<span class="ti-grp">${out}</span>` : '');
  },

  // 걸음 숫자 올라가기(0.9초)
  _anim() {
    document.querySelectorAll('.ti-stn[data-to]').forEach(el => {
      const a = Number(el.dataset.from) || 0, b = Number(el.dataset.to) || 0; delete el.dataset.to;
      if (a === b || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { el.textContent = b.toLocaleString('ko-KR'); return; }
      const t0 = performance.now();
      const step = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(a + (b - a) * e).toLocaleString('ko-KR'); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  },
  // 주식: 오늘 등락. 보유는 평가액 가중 평균, 관심종목은 앞 2개.
  stockChip() {
    const c = this.get();
    if (c.stock === 'off' || typeof Econ === 'undefined') return '';
    let cfg; try { cfg = Econ.cfg(); } catch (e) { return ''; }
    const pc = v => v == null ? '—' : `<b class="${v > 0 ? 'ti-up' : v < 0 ? 'ti-dn' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : ''}${Math.abs(v).toFixed(1)}%</b>`;
    // 칩 크기는 늘 같다(한 줄에 종목 둘 · 폭 고정). 이름 칸(NB×26px)도 고정 —
    // 긴 이름은 두 줄로 나누고(삼성/전자) 그래도 길면 글자를 줄이고, 끝까지 넘치면 그 칸에 들어가는 만큼만 쓴다
    // 이름 칸 폭은 고정(폰 36px · 넓은 화면 56px). 7글자까지는 한 줄 — 글자만 줄이고, 8글자부터 두 줄로 나눈다
    const wide = (() => { try { return matchMedia('(min-width:641px)').matches; } catch (e) { return false; } })();
    const NB = wide ? 56 : 36, MAXF = wide ? 12 : 10.5;
    const wOf = x => { let w = 0; for (const ch of x) w += /[\u3131-\uD79D]/.test(ch) ? 1 : 0.6; return w; };
    const fit = (name) => {
      let t = (typeof Econ.shortName === 'function' ? Econ.shortName(name) : String(name || '')).replace(/\s+/g, '');
      const SH = { '금(국내)': '금', '원/달러': '환율', '달러/원': '환율', '원/엔': '엔화', '원/유로': '유로' };
      t = SH[String(name || '').trim()] || t;
      const ch = [...t];
      if (ch.length <= 7) {
        const fs = Math.max(6.5, Math.min(MAXF, NB / Math.max(1, wOf(t))));
        while (t.length > 1 && wOf(t) * fs > NB + 0.5) t = t.slice(0, -1);
        return `<span class="ti-nmf" style="font-size:${fs.toFixed(1)}px"><i>${esc(t)}</i></span>`;
      }
      // 두 줄: 무게가 반씩 되도록 자른다
      const tot = wOf(t); let i = 0, acc = 0;
      while (i < ch.length - 1 && acc + wOf(ch[i]) <= tot / 2 + 0.01) acc += wOf(ch[i++]);
      if (!i) i = 1;
      let l1 = ch.slice(0, i).join(''), l2 = ch.slice(i).join('');
      let fs = Math.min(MAXF, NB / Math.max(wOf(l1), wOf(l2)));
      if (fs < 6.5) { fs = 6.5; while (l2.length > 1 && wOf(l2) * fs > NB) l2 = l2.slice(0, -1); while (l1.length > 1 && wOf(l1) * fs > NB) l1 = l1.slice(0, -1); }
      return `<span class="ti-nmf ti-nm2" style="font-size:${fs.toFixed(1)}px"><i>${esc(l1)}</i><i>${esc(l2)}</i></span>`;
    };
    const row = (nm, val) => `<span class="ti-sr">${nm}${val}</span>`;
    // 보유: 산 값 대비 지금 총 수익 — 윗줄 수익률, 아랫줄 금액
    if (c.stock === 'hold') {
      const S = Econ.holdSummary();
      if (!S.cost) return S.n ? `<div class="stat-chip stat-stock ti-two" data-s="econ" title="보유 종목의 평단·수량을 넣으면 총 수익이 보입니다">${row(fit('보유'), '<b>—</b>')}</div>` : '';
      const p = S.profit, cls = p > 0 ? 'ti-up' : p < 0 ? 'ti-dn' : '';
      const a = Math.abs(p), won = a >= 1e8 ? (a / 1e8).toFixed(a >= 1e9 ? 0 : 1) + '억' : a >= 1e4 ? Math.round(a / 1e4).toLocaleString('ko-KR') + '만' : Math.round(a).toLocaleString('ko-KR');
      return `<div class="stat-chip stat-stock ti-two" data-s="econ" title="보유 총 수익 (수익률 · 평가손익)">${row(fit('보유'), `<b class="${cls}">${S.pct == null ? '—' : (S.pct > 0 ? '+' : '') + S.pct.toFixed(1) + '%'}</b>`)}${row(fit('손익'), `<b class="${cls}">${p > 0 ? '+' : p < 0 ? '-' : ''}${won}</b>`)}</div>`;
    }
    const favs = Econ.favOrdered().slice(0, wide ? 4 : 2);   // 카드에서 바꾼 순서(별 먼저) 그대로 · 넓은 화면은 넷까지
    if (!favs.length) return '';
    const pc2 = v => v == null ? '<b>—</b>' : `<b class="${v > 0 ? 'ti-up' : v < 0 ? 'ti-dn' : ''}"><i class="ti-ar">${v > 0 ? '▲' : v < 0 ? '▼' : ''}</i>${Math.abs(v).toFixed(1)}%</b>`;
    return `<div class="stat-chip stat-stock ti-two" data-s="econ" title="담은 종목 오늘 등락">${favs.map(it => row(fit(it.name), pc2((Econ.PRICES[Econ.keyOf(it)] || {}).pct))).join('')}</div>`;
  },

  // 설정 화면
  pageHtml() {
    const c = this.get();
    const sw = (k) => Settings._sw(!!c[k], `TopInfo.toggle('${k}')`);
    return `<div class="set-h">상단바 오른쪽에 보일 것</div><p class="pg-note" style="margin:0 0 4px">직전 기록보다 오르면 빨간 ▲, 내리면 파란 ▼ 가 함께 붙습니다.</p>
      ${this.METRICS.map(([k, n]) => Settings._item(n, sw(k), k === 'steps' ? '아이폰 앱에서 건강 앱의 하루 걸음 수를 읽어 옵니다(처음 한 번 허락) · 걸은 만큼 식단에 \'+ 도보\' 열량이 더해집니다' : '')).join('')}
      ${Settings._item('주식·코인', Settings._seg(c.stock, [['off', '끔'], ['watch', '담은 종목'], ['hold', '보유 수익']], 'TopInfo.setStock'), '담은 종목: 경제 카드 맨 위 2개의 오늘 등락 · 보유 수익: 산 값 대비 총 수익(금액·%)')}
      <div class="set-h">AI 사용량 고리</div>
      <div class="set-pad">${typeof AIUsage !== 'undefined' ? AIUsage.trackHtml() : ''}</div>`;
  },
  toggle(k) { this.set({ [k]: !this.get()[k] }); if (k === 'steps' && this.get().steps && typeof Steps !== 'undefined') Steps.refresh(true); Settings._re('topinfo'); },
  setStock(v) { this.set({ stock: v }); Settings._re('topinfo'); },
};
