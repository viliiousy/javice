// js/inbody.js — 인바디 (체성분 기록 + 추이 그래프)
// god_life(갓생일지)의 인바디 탭을 javice 모듈 규약으로 이식
// 데이터: [{ dt:'YYYY-MM-DD', wt, ms, bf, bmr, lbm, bmi, msEst? }]  (dt 오름차순 정렬 유지)
// wt/bf/lbm/bmi 는 애플 헬스에서 자동 유입(api/inbody.js), bmr 은 수동 입력
// ms(골격근량)는 헬스에 없어 서버가 과거 실측으로 추정한다. 추정치는 msEst:true 로 표시하고
// 화면에서 실측과 구분한다 — 추정을 실측처럼 보이게 하지 않는다.

const InBody = {
  KEY: 'gl_inbody_v1',
  VIEW_KEY:   'gl_inbody_view',
  PERIOD_KEY: 'gl_inbody_period',
  MAX_POINTS: 60,
  PAGE:       8,          // 목록 한 번에 보여줄 줄 수

  // 제지방량은 뺐다. 체지방량과 함께 체중·체지방률에서 바로 나오는 파생값이라
  // 탭과 타일만 늘리고 새로 알려주는 게 없었다. 지표 4개면 탭이 한 줄에 들어간다.
  // 새 디자인: 체중은 글자색(주인공), 근육량은 주황, 나머지는 조용한 색
  _c(k) {
    if (document.documentElement.dataset.ui !== 'v2') return (this.METRICS[k]||{}).color;
    const t = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#ECEDEE';
    return { wt:t, ms:'#FF6A2B', bf:'#8B8F97', bmi:'#5B9BFF' }[k] || t;
  },
  METRICS: {
    wt: { label:'체중',     unit:'kg', color:'#3b82f6', good:'down' },
    ms: { label:'근육량',   unit:'kg', color:'#059669', good:'up'   },
    bf: { label:'체지방률', unit:'%',  color:'#ea580c', good:'down' },
    bmi:{ label:'BMI',      unit:'',   color:'#0891b2', good:'down' },
  },

  // 기간 대신 '회수'로 자르는 칸을 하나 뒀다.
  // 인바디는 매일 재는 게 아니라서 '일주일'을 고르면 그 안에 기록이 1건뿐이라
  // 추이가 안 그려지는 일이 잦았다. 최근 N회는 언제 재든 항상 선이 그려진다.
  PERIODS: {
    'r5':  { label:'최근',   count: 3  },   // 실제 값은 recentN() 이 정한다 (아래)
    '7d':  { label:'일주일', days: 7   },
    '30d': { label:'한달',   days: 30  },
    'all': { label:'전체',   days: null },
  },

  // ── 데이터 ─────────────────────────────
  getRecords() {
    let v;
    try { v = JSON.parse(UserStore.get(this.KEY) || '[]'); }
    catch { v = []; }
    if (!Array.isArray(v)) v = [];
    return v.slice().sort((a,b) => String(a.dt).localeCompare(String(b.dt)));
  },

  saveRecords(v) {
    const clean = (v || [])
      .filter(r => r && r.dt && (r.wt || r.ms || r.bf || r.bmr || r.lbm || r.bmi))
      .sort((a,b) => String(a.dt).localeCompare(String(b.dt)));
    UserStore.set(this.KEY, JSON.stringify(clean));
    FirebaseSync?.scheduleSave();
  },

  latest() {
    const r = this.getRecords();
    return r.length ? r[r.length-1] : null;
  },

  // 직전 기록 대비 변화량
  _delta(key) {
    const r = this.getRecords().filter(x => Number(x[key]) > 0);
    if (r.length < 2) return null;
    return Number(r[r.length-1][key]) - Number(r[r.length-2][key]);
  },

  // 지표를 여러 개 겹쳐 볼 수 있다. 기본은 체중 하나.
  // 예전엔 하나만 골라졌는데, 체중이 줄었는지 근육이 줄었는지는 둘을 같이 봐야 안다.
  _views() {
    const ks = (UserStore.get(this.VIEW_KEY) || 'wt').split(',').filter(k => this.METRICS[k]);
    return ks.length ? ks : ['wt'];
  },
  toggleView(k) {
    if (!this.METRICS[k]) return;
    let ks = this._views();
    if (ks.includes(k)) {
      if (ks.length === 1) return;      // 마지막 하나는 못 끈다 — 빈 차트가 남는다
      ks = ks.filter(x => x !== k);
    } else {
      // METRICS 정의 순서를 지킨다. 켠 순서대로 넣으면 범례와 색 자리가 매번 달라진다.
      ks = Object.keys(this.METRICS).filter(x => ks.includes(x) || x === k);
    }
    UserStore.set(this.VIEW_KEY, ks.join(','));
    this.render();
  },

  _todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  // ── 렌더 ───────────────────────────────
  init() {
    this._migratePeriod(); this.render();
    // 아이폰 앱: 애플 건강을 켜 두었으면 열 때마다(10분에 한 번) 새 측정을 가져온다
    if (this.healthOn()) setTimeout(() => this.healthSync(false), 1500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.healthOn()) this.healthSync(false); });
  },

  // ── 애플 건강 연동 (아이폰 앱) ─────────────
  // 인바디 앱 → 건강 앱 → Bashy. 체중·체지방률·제지방량·BMI 는 날짜별 마지막 측정값, 키는 프로필로.
  // 골격근량은 건강 앱에 없어 실측 기록으로 추정(msEst)하고, 기초대사량은 손으로 넣은 값을 그대로 둔다.
  HEALTH_KEY: 'gl_health_on',
  healthAvail() { const B = window.Capacitor?.Plugins?.BashyNative; return !!(B && B.healthRead && window.Capacitor?.getPlatform?.() === 'ios'); },
  healthOn() { return this.healthAvail() && localStorage.getItem(this.HEALTH_KEY) === '1'; },
  async healthConnect() {
    localStorage.setItem(this.HEALTH_KEY, '1');
    const n = await this.healthSync(true, 3650);
    if (n == null) return;
    App.closeModal?.();
    App.showToast(n ? `건강 앱에서 ${n}일치 기록을 가져왔습니다` : '건강 앱에 새 체성분 기록이 없습니다', 'success');
  },
  healthOff() { localStorage.removeItem(this.HEALTH_KEY); this.render(); App.showToast('건강 앱 자동 가져오기를 껐습니다'); },
  async healthSync(manual, days) {
    if (!this.healthAvail()) return null;
    if (!manual && Date.now() - (this._hsAt || 0) < 10 * 60000) return 0;
    this._hsAt = Date.now();
    let res;
    try { res = await window.Capacitor.Plugins.BashyNative.healthRead({ days: days || 60 }); } catch (e) { res = { ok: false, error: e.message }; }
    if (!res || !res.ok) {
      if (manual) App.showToast('건강 앱을 읽지 못했습니다 — 설정 › 건강 › 데이터 접근 › Bashy 에서 항목을 허용해 주세요', 'error');
      return null;
    }
    const D = res.data || {};
    const day = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const r1 = v => Math.round(Number(v) * 10) / 10;
    const byDay = {};
    for (const k of ['wt', 'bf', 'lbm', 'bmi']) for (const x of (D[k] || [])) {   // 오래된 것 → 최근 순이라 그날 마지막 값이 남는다
      const v = r1(x.v); if (!(v > 0)) continue;
      (byDay[day(x.t)] ||= {})[k] = v;
    }
    const all = this.getRecords(), map = Object.fromEntries(all.map(r => [r.dt, { ...r }]));
    let changed = 0;
    for (const [dt, v] of Object.entries(byDay)) {
      if (!v.wt && !map[dt]) continue;            // 체중 없는 날은 새로 만들지 않는다
      const r = map[dt] || { dt };
      let ch = false;
      for (const k of ['wt', 'bf', 'lbm', 'bmi']) if (v[k] && Number(r[k]) !== v[k]) { r[k] = v[k]; ch = true; }
      if (ch) { r.src = 'health'; map[dt] = r; changed++; }
    }
    // 골격근량 추정: 실측(msEst 아님)이 있는 기록으로 회귀를 세워, 비어 있는 날만 채운다
    const list = Object.values(map).sort((a, b) => a.dt.localeCompare(b.dt));
    for (const r of list) if (!(Number(r.ms) > 0) || r.msEst) {
      const e = this._estMs(list.filter(x => x.dt < r.dt), r);
      if (e && Number(r.ms) !== e) { r.ms = e; r.msEst = true; }
    }
    // 키 → 프로필
    const ht = (D.ht || [])[0];
    if (ht && ht.v > 100 && ht.v < 250) {
      let pf = {}; try { pf = JSON.parse(UserStore.get('gl_profile') || '{}') || {}; } catch {}
      if (Math.round(pf.ht) !== Math.round(ht.v)) { pf.ht = Math.round(ht.v * 10) / 10; UserStore.set('gl_profile', JSON.stringify(pf)); FirebaseSync?.scheduleSave(); }
    }
    if (changed) {
      this.saveRecords(list); this.render();
      try { App._updateStatsBanner(); } catch (e) {}
    }
    return changed;
  },
  // 골격근량 ≈ a + b·제지방량 + c·체지방률 — 이 사람의 실측 기록(최근 40건)으로 계수를 구한다 (api/inbody.js 와 같은 식)
  _estMs(prev, r) {
    const lbm = Number(r.lbm), bf = Number(r.bf); if (!(lbm > 0) || !(bf > 0)) return null;
    const rows = prev.filter(x => !x.msEst && Number(x.ms) > 0 && Number(x.lbm) > 0 && Number(x.bf) > 0).slice(-40);
    let c = [-2.4377, 0.61375, -0.016172];
    if (rows.length >= 12) {
      const A = [[0,0,0],[0,0,0],[0,0,0]], b = [0,0,0];
      for (const x of rows) { const v = [1, Number(x.lbm), Number(x.bf)]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += v[i]*v[j]; b[i] += v[i]*Number(x.ms); } }
      const m = A.map((row, i) => [...row, b[i]]);
      let okFit = true;
      for (let i = 0; i < 3 && okFit; i++) {
        let p = i; for (let k = i+1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
        if (Math.abs(m[p][i]) < 1e-9) { okFit = false; break; }
        [m[i], m[p]] = [m[p], m[i]];
        for (let k = 0; k < 3; k++) if (k !== i) { const f = m[k][i] / m[i][i]; for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]; }
      }
      if (okFit) { const x = [m[0][3]/m[0][0], m[1][3]/m[1][1], m[2][3]/m[2][2]]; if (x.every(isFinite)) c = x; }
    }
    let ms = c[0] + c[1]*lbm + c[2]*bf;
    if (!isFinite(ms) || ms < 10 || ms > lbm) ms = 0.5691 * lbm;
    return isFinite(ms) && ms >= 10 && ms <= lbm ? Math.round(ms * 10) / 10 : null;
  },
  _healthLink() {
    if (!this.healthAvail()) return '';
    return this.healthOn()
      ? `<div class="ib-import-link" onclick="InBody.healthSync(true,365).then(n=>{ if(n!=null) App.showToast(n?n+'일치 새 기록을 가져왔습니다':'새 기록이 없습니다','success'); })">애플 건강에서 지금 가져오기</div><div class="ib-import-link" onclick="InBody.healthOff()">자동 가져오기 끄기</div>`
      : `<div class="ib-import-link" onclick="InBody.healthConnect()">애플 건강 연결 — 인바디 측정이 자동으로 들어옵니다</div>`;
  },

  // 예전 기본값은 '일주일'이었다. 인바디를 매일 재는 게 아니라 그 안에 기록이
  // 1건뿐인 날이 많았고, 그러면 추이가 아예 안 그려졌다.
  //
  // v2 이사는 init() 에서 한 번만 돌았는데, 파이어베이스 load() 가 그 뒤에 끝나면서
  // 클라우드에 있던 '7d' 와 '이사 완료' 표식을 같이 되돌려 놨다. 그래서 이사가
  // 끝난 것처럼 보이는데 화면은 계속 일주일이었다.
  // 이번엔 (1) 조건 없이 새 기본값으로 맞추고 (2) 읽는 시점마다 확인한다.
  // 파이어베이스가 나중에 덮어써도 다음 읽기에서 다시 잡히고, 저장이 한 번 올라가면 멈춘다.
  _migratePeriod() {
    if (UserStore.get('gl_inbody_period_v3')) return;
    UserStore.set('gl_inbody_period_v3', '1');
    UserStore.set(this.PERIOD_KEY, 'r5');
    try { FirebaseSync?.scheduleSave(); } catch {}
  },

  render() {
    const wrap = document.getElementById('inbodyWrap');
    if (!wrap) return;

    const recs = this.getRecords();
    const la   = this.latest();

    if (!recs.length) {
      wrap.innerHTML = `
        <p class="empty">${Icons.big('chart')}아직 기록이 없습니다<br><span style="font-size:11px">체중만 입력해도 추이를 볼 수 있어요</span></p>
        ${this._footHtml()}`;
      this._renderBadge(null);
      return;
    }

    const views = this._views();
    const inP = this._inPeriod(recs);
    wrap.innerHTML =
      this._summaryHtml(la) +
      this._tabsHtml(views) +
      this._periodHtml() +
      this._chartHtml(inP, views) +
      this._listHtml(inP, recs.length) +
      this._footHtml();

    this._renderBadge(la);
  },

  _renderBadge(la) {
    const b = document.getElementById('inbodyBadge');
    if (!b) return;
    b.textContent = la ? `${la.dt.slice(5).replace('-','/')} 기준` : '';
  },

  _deltaHtml(key) {
    const d = this._delta(key);
    if (d === null || Math.abs(d) < 0.05) return '';
    const m    = this.METRICS[key];
    const up   = d > 0;
    // 목표 방향과 같으면 초록, 반대면 빨강 (근육량은 늘어야 좋음)
    const good = m && ((m.good === 'up' && up) || (m.good === 'down' && !up));
    const cls  = good ? 'ib-delta-good' : 'ib-delta-bad';
    return `<span class="ib-delta ${cls}">${up?'▲':'▼'}${Math.abs(d).toFixed(1)}</span>`;
  },

  // 추정치 표식 — 실측과 섞이지 않도록 항상 눈에 보이게 한다
  _estBadge() {
    return `<span class="ib-est" title="과거 실측 기록으로 계산한 추정값입니다">추정</span>`;
  },

  // ── 최근 몇 회를 볼지 ───────────────────
  // 인바디는 사람마다 재는 간격이 다르다. 매일 재는 사람에게 5회는 닷새고,
  // 분기에 한 번 재는 사람에게는 1년이 넘는다. 그래서 숫자를 열어 뒀다.
  RECENT_KEY: 'gl_ib_recent_n',
  RECENT_MIN: 2,
  RECENT_MAX: 30,
  recentN() {
    const n = parseInt(UserStore.get(this.RECENT_KEY), 10);
    return (n >= this.RECENT_MIN && n <= this.RECENT_MAX) ? n : 3;
  },
  bumpRecent(d) {
    const n = Math.max(this.RECENT_MIN, Math.min(this.RECENT_MAX, this.recentN() + d));
    if (n === this.recentN()) return;
    UserStore.set(this.RECENT_KEY, String(n));
    this._shown = this.PAGE;
    this.render();
    Sounds?.click();
  },
  // 회수형 기간은 저장된 숫자를 입혀서 돌려준다. PERIODS 의 count 는 기본값일 뿐이다.
  _p(k) {
    const p = this.PERIODS[k || this._period()];
    return p.count ? { ...p, count: this.recentN() } : p;
  },

  // ── 기간 ───────────────────────────────
  _period() {
    this._migratePeriod();                    // 읽는 시점에 확인한다 (위 주석 참고)
    const p = UserStore.get(this.PERIOD_KEY);
    return this.PERIODS[p] ? p : 'r5';        // 기본은 최근 5회
  },
  setPeriod(p) {
    if (!this.PERIODS[p]) return;
    UserStore.set(this.PERIOD_KEY, p);
    this._shown = this.PAGE;                  // 기간을 바꾸면 더보기도 처음부터
    this.render();
  },
  // 기간(또는 회수) 안의 기록만. 'all' 이면 그대로.
  _inPeriod(recs) {
    const p = this._p();
    if (p.count) return recs.slice(-p.count);   // recs 는 날짜 오름차순
    if (!p.days) return recs;
    const from = new Date(Date.now() + 9*3600000 - (p.days-1)*86400000)
      .toISOString().slice(0,10);
    return recs.filter(r => r.dt >= from);
  },
  // "일주일 안에" / "최근 5회 중" / "전체 기록 중" — 문장이 어색해지지 않게 한 곳에서 만든다
  _periodPhrase() {
    const p = this._p();
    if (p.count) return `최근 ${p.count}회 중`;
    if (!p.days) return '전체 기록 중';
    return `${p.label} 안에`;
  },
  _periodHtml() {
    const cur = this._period();
    const bar = `<div class="ib-periods">` + Object.entries(this.PERIODS).map(([k,p]) =>
      `<button class="ib-period${k===cur?' active':''}" onclick="InBody.setPeriod('${k}')">${p.label}</button>`
    ).join('') + `</div>`;
    if (!this.PERIODS[cur].count) return bar;
    // '최근' 을 골랐을 때만 몇 회인지 정하는 칸이 나온다.
    // 위아래 화살표 두 개를 세로로 쌓은 옛날 스피너였다. 화살표 하나가 8px 이라
    // 손가락으로는 못 맞히고, 눈으로도 어느 쪽이 '늘리기' 인지 매번 확인해야 했다.
    // 좌우로 편 스테퍼로 바꾼다 — − 와 + 는 방향을 설명할 필요가 없고, 칸도 넓다.
    const n = this.recentN();
    const lo = n <= this.RECENT_MIN, hi = n >= this.RECENT_MAX;
    return bar + `<div class="ib-recent">
      최근
      <span class="ib-step" role="group" aria-label="최근 몇 회를 볼지">
        <button type="button" class="ib-step-b" onclick="InBody.bumpRecent(-1)"
          ${lo?'disabled':''} aria-label="줄이기">−</button>
        <b class="ib-step-v" aria-live="polite">${n}</b>
        <button type="button" class="ib-step-b" onclick="InBody.bumpRecent(1)"
          ${hi?'disabled':''} aria-label="늘리기">+</button>
      </span>
      회 보기
    </div>`;
  },

  _summaryHtml(la) {
    const fatMass = (la.wt && la.bf) ? (la.wt * la.bf / 100) : 0;
    const tile = (label, val, unit, deltaKey, est) => `
      <div class="ib-tile">
        <div class="ib-tile-lbl">${label}${est?this._estBadge():''}</div>
        <div class="ib-tile-val">${val}<span class="ib-tile-unit">${unit}</span>${deltaKey?this._deltaHtml(deltaKey):''}</div>
      </div>`;

    // 한 줄에 다섯 칸. 체지방량·제지방량은 뺐다 (체중·체지방률에서 바로 나오는 값).
    return `<div class="ib-summary">
      ${tile('체중',     la.wt  || '—', 'kg',   'wt')}
      ${tile('근육량',   la.ms  || '—', 'kg',   'ms', la.ms && la.msEst)}
      ${tile('체지방률', la.bf  || '—', '%',    'bf')}
      ${tile('BMI',      la.bmi || '—', '',     'bmi')}
      ${(() => { const b = la.bmr || (this.getRecords().filter(r => r.bmr).slice(-1)[0] || {}).bmr; return b ? tile('기초대사', b, 'kcal', null) : ''; })()}
    </div>`;
  },

  // 여러 개를 켤 수 있으니 라디오가 아니라 토글이다. 앞의 점 색이 차트의 선 색이다.
  _tabsHtml(views) {
    return `<div class="ib-tabs">` + Object.entries(this.METRICS).map(([k,m]) => {
      const on = views.includes(k);
      return `<button class="ib-tab${on?' active':''}" aria-pressed="${on}"
        onclick="InBody.toggleView('${k}')" style="--ib-c:${InBody._c(m.k||k)}"
        ><i class="ib-dot" style="border-color:${InBody._c(m.k||k)};background:${on?InBody._c(k):'transparent'}"></i>${m.label}</button>`;
    }).join('') + `</div>`;
  },

  // ── 인라인 SVG 추이 그래프 (외부 라이브러리 없음) ──
  //
  // 지표를 여러 개 겹쳐 그린다. 다만 kg 과 % 를 같은 눈금에 올릴 수는 없어서
  // 선마다 자기 범위로 정규화한다. 그래서 두 개 이상 켜면 왼쪽 눈금 숫자를 지운다 —
  // 두 단위에 동시에 맞는 눈금은 없고, 있는 척하면 그건 거짓말이 된다.
  // 정확한 값은 짚었을 때 툴팁이 보여준다. 눈금은 '모양', 툴팁은 '값' 을 맡는다.
  _chartHtml(recsAll, keys) {
    const recs = recsAll.slice(-this.MAX_POINTS);
    const n    = recs.length;

    const series = keys.map(k => {
      const m = this.METRICS[k], at = {};
      let cnt = 0;
      recs.forEach((r, i) => {
        const v = Number(r[k]);
        if (v > 0) { at[i] = { v }; cnt++; }
      });
      return { k, m, at, cnt };
    });

    const drawable = series.filter(s => s.cnt >= 2);
    if (!drawable.length) {
      this._chart = null;
      const lbl  = keys.map(k => this.METRICS[k].label).join('·');
      const most = Math.max(0, ...series.map(s => s.cnt));
      return `<div class="ib-chart-empty">${this._periodPhrase()} ${lbl} 기록이 ${most}개입니다 · 2개 이상이면 추이가 표시됩니다</div>`;
    }

    const single = drawable.length === 1;
    const W = 640, H = 150, PX = single ? 46 : 16, PY = 18;
    const step = n > 1 ? (W - PX - 14) / (n - 1) : 0;
    const xOf  = i => PX + i * step;

    let defs = '', fills = '', lines = '', dots = '', axis = '';
    const meta = [];

    for (const s of drawable) {
      const vals = Object.values(s.at).map(p => p.v);
      let min = Math.min(...vals), max = Math.max(...vals);
      if (max - min < 0.1) { min -= 0.5; max += 0.5; }   // 평평한 데이터도 보이게
      const pad = (max - min) * 0.12;
      min -= pad; max += pad;
      const yOf = v => H - PY - (v - min) / (max - min) * (H - PY * 2);

      const idx = Object.keys(s.at).map(Number).sort((a, b) => a - b);
      idx.forEach(i => { s.at[i].y = yOf(s.at[i].v); });

      const line = idx.map((i, j) => `${j?'L':'M'}${xOf(i).toFixed(1)},${s.at[i].y.toFixed(1)}`).join(' ');
      const first = idx[0], last = idx[idx.length-1];

      // 면 채우기와 눈금 숫자는 한 개만 켰을 때만. 겹쳐 그리면 서로를 가린다.
      if (single) {
        const gid = `ibg_${s.k}`;
        defs  = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="${InBody._c(s.k)}" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="${InBody._c(s.k)}" stop-opacity="0"/>
          </linearGradient>`;
        fills = `<path d="${line} L${xOf(last).toFixed(1)},${H-PY} L${xOf(first).toFixed(1)},${H-PY} Z" fill="url(#${gid})"/>`;
        const f = v => (Math.round(v*10)/10).toFixed(1);
        axis  = `<text x="${PX-8}" y="${PY+4}"   class="ib-axis" text-anchor="end">${f(max)}</text>
                 <text x="${PX-8}" y="${H-PY+4}" class="ib-axis" text-anchor="end">${f(min)}</text>`;
      }

      lines += `<path d="${line}" fill="none" stroke="${InBody._c(s.k)}" stroke-width="2"
                 stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;

      // 골격근량은 추정 지점을 속 빈 점으로 따로 찍는다 — 추정을 실측처럼 보이게 하지 않는다
      let est = 0;
      if (s.k === 'ms') {
        idx.forEach(i => {
          if (!recs[i].msEst) return;
          est++;
          dots += `<circle cx="${xOf(i).toFixed(1)}" cy="${s.at[i].y.toFixed(1)}" r="3.5"
                    fill="var(--card)" stroke="${InBody._c(s.k)}" stroke-width="1.5"/>`;
        });
      }
      dots += `<circle cx="${xOf(last).toFixed(1)}" cy="${s.at[last].y.toFixed(1)}" r="5"
                fill="${s.k === 'ms' && recs[last].msEst ? 'var(--card)' : InBody._c(s.k)}"
                stroke="${InBody._c(s.k)}" stroke-width="3"/>`;

      meta.push({ k:s.k, label:s.m.label, unit:s.m.unit, color:InBody._c(s.k), at:s.at, est });
    }

    // 툴팁이 쓸 좌표를 남겨 둔다. 화면을 다시 그릴 때마다 갈아 끼운다.
    this._chart  = { W, H, PX, PY, n, step, series: meta,
                     dts: recs.map(r => r.dt.slice(2).replace(/-/g, '.')) };
    this._hoverI = -1;

    const foot = meta.map(m => `<b style="color:${InBody._c(m.k)}">${m.label}</b>${m.unit?`(${m.unit})`:''}`).join(' · ');
    const estN = meta.reduce((a, m) => a + m.est, 0);

    return `<div class="ib-chart">
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
           aria-label="${meta.map(m => m.label).join(', ')} 추이 그래프">
        <defs>${defs}</defs>
        <line x1="${PX}" y1="${PY}"   x2="${W-14}" y2="${PY}"   class="ib-grid"/>
        <line x1="${PX}" y1="${H/2}"  x2="${W-14}" y2="${H/2}"  class="ib-grid"/>
        <line x1="${PX}" y1="${H-PY}" x2="${W-14}" y2="${H-PY}" class="ib-grid"/>
        ${axis}${fills}${lines}${dots}
        <g id="ibHoverG"></g>
        <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="ib-hit"
              onpointermove="InBody._hover(event)" onpointerdown="InBody._hover(event)"
              onpointerleave="InBody._hoverOut()"/>
      </svg>
      <div class="ib-tip" id="ibTip" hidden></div>
      <div class="ib-chart-foot">
        <span>${this._chart.dts[0]}</span>
        <span>${n}회 · ${foot}${estN?` · <b class="ib-est-note">○ 추정 ${estN}</b>`:''}</span>
        <span>${this._chart.dts[n-1]}</span>
      </div>
    </div>`;
  },

  // ── 차트 툴팁 ──────────────────────────
  // 선만 있으면 "언제 얼마였는지" 를 읽을 수 없다. 짚은 자리의 날짜와 값을 그대로 보여준다.
  // 마우스와 손가락 둘 다 pointer 이벤트 하나로 받는다.
  _hover(e) {
    const c = this._chart;
    if (!c || !c.n) return;
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const vx = (e.clientX - r.left) / r.width * c.W;       // 화면 px → viewBox 좌표
    let i = c.step ? Math.round((vx - c.PX) / c.step) : 0;
    i = Math.max(0, Math.min(c.n - 1, i));
    if (i === this._hoverI) return;                        // 같은 지점이면 다시 그리지 않는다
    this._hoverI = i;
    this._paintHover(i);
  },

  _paintHover(i) {
    const c   = this._chart;
    const g   = document.getElementById('ibHoverG');
    const tip = document.getElementById('ibTip');
    if (!c || !g || !tip) return;

    const x = c.PX + i * c.step;
    let marks = `<line x1="${x.toFixed(1)}" y1="${c.PY}" x2="${x.toFixed(1)}" y2="${c.H-c.PY}" class="ib-guide"/>`;
    const rows = [];
    for (const s of c.series) {
      const pt = s.at[i];
      if (!pt) continue;                                   // 그날 그 지표를 안 쟀으면 건너뛴다
      marks += `<circle cx="${x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5"
                 fill="var(--card)" stroke="${s.color}" stroke-width="2.5"/>`;
      rows.push(`<span><i style="background:${s.color}"></i>${s.label} <b>${this._num(pt.v)}${s.unit}</b></span>`);
    }
    g.innerHTML = marks;
    if (!rows.length) { tip.hidden = true; return; }

    tip.innerHTML = `<em>${c.dts[i]}</em>${rows.join('')}`;
    // 짚은 점 위에 상자를 얹으면 정작 보려던 지점이 가려진다. 반대쪽으로 비켜 세운다.
    const pct  = x / c.W * 100;
    const left = pct < 50;
    tip.style.left      = pct + '%';
    tip.style.transform = left ? 'translateX(10px)' : 'translateX(calc(-100% - 10px))';
    tip.hidden = false;
  },

  _hoverOut() {
    this._hoverI = -1;
    const g = document.getElementById('ibHoverG'); if (g) g.innerHTML = '';
    const t = document.getElementById('ibTip');    if (t) t.hidden = true;
  },

  // 82 는 "82", 82.5 는 "82.5". 소수점 뒤 0 은 붙이지 않는다.
  _num(v) { return String(Math.round(Number(v) * 10) / 10); },

  _shown: 0,
  showMore() { this._shown = (this._shown || this.PAGE) + this.PAGE; this.render(); },

  _listHtml(recs, totalAll) {
    const limit = this._shown || this.PAGE;
    const all   = recs.slice().reverse();
    const rows  = all.slice(0, limit).map(r => `
      <div class="ib-row" onclick="InBody.showEdit('${r.dt}')">
        <span class="ib-row-dt">${r.dt.slice(2).replace(/-/g,'.')}</span>
        <span class="ib-row-v">${r.wt}<i>kg</i></span>
        <span class="ib-row-v${r.ms && r.msEst ? ' ib-est-v' : ''}">${r.ms ? (r.msEst?'~':'')+r.ms+'<i>kg</i>' : '<i>—</i>'}</span>
        <span class="ib-row-v">${r.bf ? r.bf+'<i>%</i>' : '<i>—</i>'}</span>
      </div>`).join('');

    const pl   = this._p().label;
    const rest = all.length - Math.min(limit, all.length);
    if (!all.length) {
      return `<div class="ib-list"><div class="ib-chart-empty">${this._periodPhrase()} 기록이 없습니다${
        totalAll ? ` · 전체 ${totalAll}건` : ''}</div></div>`;
    }
    return `<div class="ib-list">
      <div class="ib-row ib-row-head"><span>날짜</span><span>체중</span><span>근육</span><span>체지방</span></div>
      ${rows}
      ${rest > 0
        ? `<button class="ib-more ib-more-btn" onclick="InBody.showMore()">더보기 (${rest}건 남음)</button>`
        : (this._period() !== 'all' && totalAll > all.length
            ? `<div class="ib-more">${pl} 기록 ${all.length}건 전부 · 전체는 ${totalAll}건</div>` : '')}
    </div>`;
  },

  // ── 입력 ───────────────────────────────
  // 카드 아래: 불러오기 / 직접 입력
  _footHtml() {
    return `<div class="ib-foot">
      <button type="button" class="ib-fb" onclick="InBody.showLoad()">${typeof Icons!=='undefined'?Icons.svg('download','ib-fi'):''}<span>불러오기</span>${this.healthOn()?'<i>자동</i>':''}</button>
      <button type="button" class="ib-fb" onclick="InBody.showAdd()">${typeof Icons!=='undefined'?Icons.svg('pen','ib-fi'):''}<span>직접 입력</span></button>
    </div>`;
  },

  // ── 불러오기 ────────────────────────────
  showLoad() {
    const ios = this.healthAvail(), on = this.healthOn();
    const last = this.getRecords().filter(r => r.src === 'health').slice(-1)[0];
    App.openModal('@download 인바디 기록 불러오기', `
      <div class="ib-src">
        <div class="ib-src-h"><b>애플 건강</b><span>${on ? '자동으로 가져오는 중' : ios ? '연결 안 됨' : '아이폰 앱에서만'}</span></div>
        <p>인바디 앱 › 설정에서 <b>건강 앱 연동</b>을 켜 두면, 인바디에서 잰 체중·체지방률·제지방량·BMI 가 건강 앱을 거쳐 여기로 들어옵니다. 골격근량은 건강 앱에 없어 지난 실측으로 추정합니다.</p>
        ${on ? `<p class="ib-src-m">${last ? `마지막으로 가져온 기록 <b class="num">${last.dt.slice(5).replace('-','/')}</b>` : '아직 가져온 기록이 없습니다'}</p>
          <div class="ib-src-b"><button class="btn-sm" onclick="InBody.healthOff();App.closeModal()">자동 가져오기 끄기</button><button class="btn-sm accent" onclick="InBody._loadNow()">지금 가져오기</button></div>`
        : ios ? `<button class="ib-go" onclick="InBody.healthConnect()">애플 건강 연결</button>`
        : `<p class="ib-src-m">아이폰의 Bashy 앱에서 연결하면, 같은 계정의 웹·태블릿에도 함께 보입니다.</p>`}
      </div>
      <div class="ib-src">
        <div class="ib-src-h"><b>갓생일지</b><span>한 번만</span></div>
        <p>예전 갓생일지 앱에 남긴 인바디 기록을 그대로 옮깁니다. 같은 날짜 기록은 건드리지 않습니다.</p>
        <button class="btn-sm" onclick="InBody.showImport()">갓생일지 기록 붙여넣기</button>
      </div>`);
  },
  async _loadNow() {
    const n = await this.healthSync(true, 365);
    if (n == null) return;
    App.closeModal();
    App.showToast(n ? `${n}일치 새 기록을 가져왔습니다` : '새 기록이 없습니다', 'success');
  },

  // ── 직접 입력 ────────────────────────────
  // 체중이 주인공(크게), 나머지 다섯 칸은 2열로 조용하게. 단위는 칸 안 오른쪽에.
  _formHtml(r) {
    const v = k => (r && r[k]) ? r[k] : '';
    const ht = (() => { try { return Number(JSON.parse(UserStore.get('gl_profile') || '{}').ht) || 0; } catch { return 0; } })();
    const f = (id, lbl, k, unit, step = '0.1', extra = '') => `<label class="ib-f"><span>${lbl}${extra}</span>
      <span class="ib-in"><input id="${id}" type="number" step="${step}" inputmode="decimal" class="num" value="${v(k)}" placeholder="—"><i>${unit}</i></span></label>`;
    return `
      <div class="ib-form" data-ht="${ht}">
        <label class="ib-date"><span>측정한 날</span><input id="ibDt" type="date" value="${r ? r.dt : this._todayStr()}"></label>
        <label class="ib-hero"><span>체중</span>
          <span class="ib-hin"><input id="ibWt" type="number" step="0.1" inputmode="decimal" class="num" value="${v('wt')}" placeholder="0.0" oninput="InBody._autoBmi();InBody._fit(this)"><i>kg</i></span></label>
        <div class="ib-grid">
          ${f('ibMs', '골격근량', 'ms', 'kg', '0.1', r && r.msEst ? '<em>추정</em>' : '')}
          ${f('ibBf', '체지방률', 'bf', '%')}
          ${f('ibLbm', '제지방량', 'lbm', 'kg')}
          ${f('ibBmi', 'BMI', 'bmi', '', '0.1', ht ? '<em>키로 자동</em>' : '')}
          ${f('ibBmr', '기초대사량', 'bmr', 'kcal', '1')}
        </div>
      </div>`;
  },
  // 키를 알면 체중을 넣는 대로 BMI 를 채운다(직접 고친 값은 건드리지 않는다)
  _fit(el) { if (el) el.style.width = (Math.max(3, String(el.value || el.placeholder).length) * 0.6 + 0.1) + 'em'; },
  _autoBmi() {
    const box = document.querySelector('.ib-form'), ht = Number(box?.dataset.ht) / 100;
    const w = parseFloat(document.getElementById('ibWt')?.value), b = document.getElementById('ibBmi');
    if (!ht || !b || !(w > 0) || b.dataset.touched) return;
    b.value = Math.round(w / (ht * ht) * 10) / 10;
  },

  showAdd() {
    App.openModal('@pen 인바디 직접 입력', this._formHtml(null) + `
      <button class="ib-go" onclick="InBody._save(null)">저장</button>`);
    setTimeout(() => { document.getElementById('ibBmi')?.addEventListener('input', e => { e.target.dataset.touched = '1'; }); InBody._fit(document.getElementById('ibWt')); document.getElementById('ibWt')?.focus(); }, 50);
  },

  showEdit(dt) {
    const r = this.getRecords().find(x => x.dt === dt);
    if (!r) return;
    App.openModal('@pen 인바디 기록 고치기', this._formHtml(r) + `
      <button class="ib-go" onclick="InBody._save('${dt}')">저장</button>
      <button class="ib-del" onclick="InBody.remove('${dt}')">이 기록 삭제</button>`);
    setTimeout(() => { const b = document.getElementById('ibBmi'); if (b) b.dataset.touched = '1'; InBody._fit(document.getElementById('ibWt')); }, 50);
  },

  _save(origDt) {
    const num = id => {
      const el = document.getElementById(id);
      const n  = parseFloat(el?.value);
      return isNaN(n) ? 0 : n;
    };
    const dt = document.getElementById('ibDt')?.value || this._todayStr();
    const wt = num('ibWt');
    if (!wt) { App.showToast('체중을 입력해주세요', 'error'); return; }

    const all  = this.getRecords();
    // 새로 추가하는데 날짜가 겹치면, 비워둔 항목은 기존 값을 유지한다.
    // (수정 모드에서는 입력한 그대로 반영 — 값을 비워 지울 수 있어야 하므로)
    const prev = origDt ? null : all.find(r => r.dt === dt);
    const keep = (v, k) => (v > 0 || !prev) ? v : (Number(prev[k]) || 0);

    const base = all.find(r => r.dt === (origDt || dt));
    const ms   = keep(num('ibMs'), 'ms');
    // 추정치를 그대로 두고 저장하면 추정 표시를 유지하고,
    // 값을 바꾸면(=인바디에서 잰 수치를 넣으면) 실측으로 승격한다
    const msEst = !!(base && base.msEst && ms > 0 && Math.abs(ms - Number(base.ms)) < 0.05);

    const recs = all.filter(r => r.dt !== origDt && r.dt !== dt);
    recs.push({
      dt, wt, ms,
      ...(msEst ? { msEst: true } : {}),
      bf:  keep(num('ibBf'),  'bf'),
      bmr: Math.round(keep(num('ibBmr'), 'bmr')),
      lbm: keep(num('ibLbm'), 'lbm'),
      bmi: keep(num('ibBmi'), 'bmi'),
    });
    this.saveRecords(recs);
    this.render();
    App.closeModal();
    App.showToast('인바디 기록됨', 'success');
  },

  remove(dt) {
    if (!confirm(`${dt} 기록을 삭제할까요?`)) return;
    this.saveRecords(this.getRecords().filter(r => r.dt !== dt));
    this.render();
    App.closeModal();
    App.showToast('삭제됨', '');
  },

  // ── 갓생일지 데이터 가져오기 ─────────────
  // god_life는 localStorage 'mft5' 한 키에 전부 저장한다.
  // 다른 도메인이라 자동으로 못 읽으므로 JSON을 붙여넣게 한다.
  showImport() {
    App.openModal('@download 갓생일지 기록 붙여넣기', `
      <ol class="ib-steps">
        <li>갓생일지 사이트를 연 브라우저에서 개발자 도구 › 콘솔을 엽니다.</li>
        <li><code class="ib-code">localStorage.mft5</code> 를 입력하고 나온 값을 통째로 복사합니다.</li>
        <li>아래에 붙여 넣으면 인바디 기록만 골라 옮깁니다. 인바디 배열만 붙여 넣어도 됩니다.</li>
      </ol>
      <textarea id="ibImport" class="inp ib-ta" rows="6" placeholder='{"ib":[{"dt":"2026-01-01","wt":70,...}]}'></textarea>
      <button class="ib-go" onclick="InBody._runImport()">가져오기</button>`);
  },

  _runImport() {
    const raw = document.getElementById('ibImport')?.value.trim();
    if (!raw) { App.showToast('붙여넣은 내용이 없습니다', 'error'); return; }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { App.showToast('JSON 형식이 아닙니다', 'error'); return; }

    const incoming = Array.isArray(parsed) ? parsed
                   : Array.isArray(parsed?.ib) ? parsed.ib
                   : null;
    if (!incoming) { App.showToast('인바디 기록(ib)을 찾지 못했습니다', 'error'); return; }

    const byDate = new Map(this.getRecords().map(r => [r.dt, r]));
    let added = 0;
    incoming.forEach(r => {
      if (!r || !r.dt || !r.wt) return;
      if (byDate.has(r.dt)) return;              // 기존 기록 보존
      byDate.set(r.dt, {
        dt:  String(r.dt),
        wt:  Number(r.wt)  || 0,
        ms:  Number(r.ms)  || 0,
        bf:  Number(r.bf)  || 0,
        bmr: Math.round(Number(r.bmr) || 0),
        lbm: Number(r.lbm) || 0,
        bmi: Number(r.bmi) || 0,
      });
      added++;
    });

    if (!added) { App.showToast('새로 가져올 기록이 없습니다', ''); return; }
    this.saveRecords([...byDate.values()]);
    this.render();
    App.closeModal();
    App.showToast(`${added}건 가져왔습니다`, 'success');
  },
};
