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
    'r5':  { label:'기본',   count: 5  },
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

  _view() { return UserStore.get(this.VIEW_KEY) || 'wt'; },
  setView(k) {
    if (!this.METRICS[k]) return;
    UserStore.set(this.VIEW_KEY, k);
    this.render();
  },

  _todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  // ── 렌더 ───────────────────────────────
  init() { this._migratePeriod(); this.render(); },

  // 예전 기본값은 '일주일'이었다. 인바디를 매일 재는 게 아니라 그 안에 기록이
  // 1건뿐인 날이 많았고, 그러면 추이가 아예 안 그려졌다. 새 기본값('최근 5회')으로
  // 한 번만 옮겨준다. 직접 '일주일'을 고른 사람과 구분할 방법이 없어서 이사는 딱 한 번이다.
  _migratePeriod() {
    if (UserStore.get('gl_inbody_period_v2')) return;
    UserStore.set('gl_inbody_period_v2', '1');
    if (UserStore.get(this.PERIOD_KEY) === '7d') UserStore.set(this.PERIOD_KEY, 'r5');
  },

  render() {
    const wrap = document.getElementById('inbodyWrap');
    if (!wrap) return;

    const recs = this.getRecords();
    const la   = this.latest();

    if (!recs.length) {
      wrap.innerHTML = `
        <p class="empty">아직 기록이 없습니다<br><span style="font-size:11px">체중만 입력해도 추이를 볼 수 있어요</span></p>
        <div class="habit-add-btn" onclick="InBody.showAdd()">+ 인바디 기록</div>`;
      this._renderBadge(null);
      return;
    }

    const view = this._view();
    const inP = this._inPeriod(recs);
    wrap.innerHTML =
      this._summaryHtml(la) +
      this._tabsHtml(view) +
      this._periodHtml() +
      this._chartHtml(inP, view) +
      this._listHtml(inP, recs.length) +
      `<div class="habit-add-btn" onclick="InBody.showAdd()">+ 인바디 기록</div>`;

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

  // ── 기간 ───────────────────────────────
  _period() {
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
    const p = this.PERIODS[this._period()];
    if (p.count) return recs.slice(-p.count);   // recs 는 날짜 오름차순
    if (!p.days) return recs;
    const from = new Date(Date.now() + 9*3600000 - (p.days-1)*86400000)
      .toISOString().slice(0,10);
    return recs.filter(r => r.dt >= from);
  },
  // "일주일 안에" / "최근 5회 중" / "전체 기록 중" — 문장이 어색해지지 않게 한 곳에서 만든다
  _periodPhrase() {
    const k = this._period(), p = this.PERIODS[k];
    if (p.count) return `최근 ${p.count}회 중`;
    if (!p.days) return '전체 기록 중';
    return `${p.label} 안에`;
  },
  _periodHtml() {
    const cur = this._period();
    return `<div class="ib-periods">` + Object.entries(this.PERIODS).map(([k,p]) =>
      `<button class="ib-period${k===cur?' active':''}" onclick="InBody.setPeriod('${k}')">${p.label}</button>`
    ).join('') + `</div>`;
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
      ${tile('기초대사', la.bmr || '—', 'kcal', null)}
    </div>`;
  },

  _tabsHtml(view) {
    return `<div class="ib-tabs">` + Object.entries(this.METRICS).map(([k,m]) =>
      `<button class="ib-tab${k===view?' active':''}" onclick="InBody.setView('${k}')"
        style="${k===view?`--ib-c:${m.color}`:''}">${m.label}</button>`
    ).join('') + `</div>`;
  },

  // ── 인라인 SVG 추이 그래프 (외부 라이브러리 없음) ──
  _chartHtml(recs, key) {
    const m    = this.METRICS[key];
    const pts  = recs.filter(r => Number(r[key]) > 0).slice(-this.MAX_POINTS);

    if (pts.length < 2) {
      return `<div class="ib-chart-empty">${this._periodPhrase()} ${m.label} 기록이 ${pts.length}개입니다 · 2개 이상이면 추이가 표시됩니다</div>`;
    }

    const W = 640, H = 150, PX = 46, PY = 18;
    const vals = pts.map(r => Number(r[key]));
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 0.1) { min -= 0.5; max += 0.5; }   // 평평한 데이터도 보이게
    const pad  = (max - min) * 0.12;
    min -= pad; max += pad;

    const x = i => PX + i * (W - PX - 14) / (pts.length - 1);
    const y = v => H - PY - (v - min) / (max - min) * (H - PY * 2);

    const line = vals.map((v,i) => `${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(pts.length-1).toFixed(1)},${H-PY} L${x(0).toFixed(1)},${H-PY} Z`;
    const gid  = `ibg_${key}`;

    const lastV = vals[vals.length-1];
    const fmt   = n => (Math.round(n*10)/10).toFixed(1);

    // 골격근량 그래프에서는 추정 지점을 속 빈 점으로 따로 찍는다
    const estIdx  = key === 'ms' ? pts.map((r,i) => r.msEst ? i : -1).filter(i => i >= 0) : [];
    const estDots = estIdx.map(i =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="3.5"
               fill="var(--card)" stroke="${m.color}" stroke-width="1.5"/>`).join('');

    return `<div class="ib-chart">
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
           aria-label="${m.label} 추이 그래프">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="${m.color}" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="${m.color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${PX}" y1="${PY}"     x2="${W-14}" y2="${PY}"     class="ib-grid"/>
        <line x1="${PX}" y1="${(PY+H-PY)/2}" x2="${W-14}" y2="${(PY+H-PY)/2}" class="ib-grid"/>
        <line x1="${PX}" y1="${H-PY}"   x2="${W-14}" y2="${H-PY}"   class="ib-grid"/>
        <text x="${PX-8}" y="${PY+4}"   class="ib-axis" text-anchor="end">${fmt(max)}</text>
        <text x="${PX-8}" y="${H-PY+4}" class="ib-axis" text-anchor="end">${fmt(min)}</text>
        <path d="${area}" fill="url(#${gid})"/>
        <path d="${line}" fill="none" stroke="${m.color}" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        ${estDots}
        <circle cx="${x(pts.length-1).toFixed(1)}" cy="${y(lastV).toFixed(1)}" r="5"
                fill="${estIdx.includes(pts.length-1) ? 'var(--card)' : m.color}"
                stroke="${m.color}" stroke-width="3"/>
      </svg>
      <div class="ib-chart-foot">
        <span>${pts[0].dt.slice(5).replace('-','/')}</span>
        <span>${pts.length}회 · ${m.label}(${m.unit})${estIdx.length?` · <b class="ib-est-note">○ 추정 ${estIdx.length}</b>`:''}</span>
        <span>${pts[pts.length-1].dt.slice(5).replace('-','/')}</span>
      </div>
    </div>`;
  },

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

    const pl   = this.PERIODS[this._period()].label;
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
  _formHtml(r) {
    const v = k => (r && r[k]) ? r[k] : '';
    return `
      <div class="modal-row"><label class="modal-lbl">날짜 *</label>
        <input id="ibDt" type="date" class="inp" value="${r ? r.dt : this._todayStr()}"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">체중 * (kg)</label>
          <input id="ibWt" type="number" step="0.1" inputmode="decimal" class="inp" value="${v('wt')}"></div>
        <div><label class="modal-lbl">근육량 (kg)${r && r.msEst ? this._estBadge() : ''}</label>
          <input id="ibMs" type="number" step="0.1" inputmode="decimal" class="inp" value="${v('ms')}"
                 ${r && r.msEst ? 'title="추정값입니다. 인바디에서 잰 수치를 넣으면 실측으로 바뀝니다."' : ''}></div>
      </div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">체지방률 (%)</label>
          <input id="ibBf" type="number" step="0.1" inputmode="decimal" class="inp" value="${v('bf')}"></div>
        <div><label class="modal-lbl">기초대사량 (kcal)</label>
          <input id="ibBmr" type="number" inputmode="numeric" class="inp" value="${v('bmr')}"></div>
      </div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">제지방량 (kg)</label>
          <input id="ibLbm" type="number" step="0.1" inputmode="decimal" class="inp" value="${v('lbm')}"></div>
        <div><label class="modal-lbl">BMI</label>
          <input id="ibBmi" type="number" step="0.1" inputmode="decimal" class="inp" value="${v('bmi')}"></div>
      </div>`;
  },

  showAdd() {
    App.openModal('📊 인바디 기록', this._formHtml(null) + `
      <div class="modal-btns">
        <button onclick="InBody._save(null)" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>
      <div class="ib-import-link" onclick="InBody.showImport()">갓생일지에서 가져오기</div>`);
    setTimeout(() => document.getElementById('ibWt')?.focus(), 50);
  },

  showEdit(dt) {
    const r = this.getRecords().find(x => x.dt === dt);
    if (!r) return;
    App.openModal('📊 인바디 수정', this._formHtml(r) + `
      <div class="modal-btns">
        <button onclick="InBody._save('${dt}')" class="btn-sm accent">저장</button>
        <button onclick="InBody.remove('${dt}')" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
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
    App.showToast('인바디 기록됨 ✓', 'success');
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
    App.openModal('📥 갓생일지 인바디 가져오기', `
      <p class="modal-lbl" style="line-height:1.6">
        갓생일지 사이트에서 개발자도구 콘솔을 열고
        <code class="ib-code">localStorage.mft5</code> 를 입력해 나온 값을
        통째로 붙여넣으세요. 인바디 기록만 추출합니다.<br>
        <span style="color:var(--text3)">인바디 배열만 붙여넣어도 됩니다.</span>
      </p>
      <textarea id="ibImport" class="inp" rows="7" placeholder='{"ib":[{"dt":"2026-01-01","wt":70,...}]}'></textarea>
      <div class="modal-btns">
        <button onclick="InBody._runImport()" class="btn-sm accent">가져오기</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
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
    App.showToast(`${added}건 가져왔습니다 ✓`, 'success');
  },
};
