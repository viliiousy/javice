// js/vol-tier.js — 들어 올린 무게 단계(VolTier). workout-mode.js 에서 떼어 냄. vol-tier-data.js 다음에 읽는다.

// ── 들어 올린 무게 티어 ─────────────────────────────
// 지금까지의 총볼륨(무게 × 횟수의 합)을 '무엇을 들어 올린 셈인지' 로 바꿔 보여 준다.
// 단계는 js/vol-tier-data.js 의 300개(Lv.1 성인 남성 → … → 태양), 모두 서로 다른 사물.
// 그림은 img/vt/NNN.webp. 아직 못 간 단계는 물음표와 무게만 보인다(무엇인지는 닿아야 안다).
// 순위·레벨별 인원은 서버(api/hub act: vt → lib/vt-rank.js)에 숫자만 올려 받는다.
const VolTier = {
  get T() { return typeof VT_DATA !== 'undefined' ? VT_DATA : [['고양이', 4.5]]; },
  IMG: 'img/vt/',
  // 한국식 큰 수: 52,000 → '5만 2,000'
  _ko(n) {
    n = Math.floor(n);
    if (n < 10000) return n.toLocaleString('ko-KR');
    const U = [['경', 1e16], ['조', 1e12], ['억', 1e8], ['만', 1e4]];
    let out = [], r = n;
    for (const [u, v] of U) { if (r >= v) { const q = Math.floor(r / v); out.push(q.toLocaleString('ko-KR') + u); r -= q * v; if (out.length >= 2) { r = 0; break; } } }
    if (r && out.length < 2) out.push(r.toLocaleString('ko-KR'));
    return out.join(' ');
  },
  // 무게 글자: 450kg · 6톤 · 1,234톤 560kg · 5만 2,000톤 · 5.97×10²¹톤
  kg(v, short) {
    v = Number(v) || 0;
    if (v < 1000) return (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)).toLocaleString('ko-KR') + 'kg';
    const t = Math.floor(v / 1000), r = Math.round(v - t * 1000);
    if (t >= 1e16) { const e = Math.floor(Math.log10(t)); return (t / 10 ** e).toFixed(2) + '×10' + String(e).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]) + '톤'; }
    if (short && t < 100 && r >= 100) return (Math.floor(v / 100) / 10).toLocaleString('ko-KR') + '톤';   // 짧게 쓸 때 9.5톤처럼(9톤으로 뭉개지지 않게)
    return this._ko(t) + '톤' + (!short && r && t < 100000 ? ' ' + r.toLocaleString('ko-KR') + 'kg' : '');
  },
  // v kg → { lv(1~300, 0=시작 전), now:[이름,kg] | null, next, n(몇 개), pct(다음까지 %) }
  tier(v) {
    const T = this.T; let i = -1;
    for (let k = 0; k < T.length; k++) if (v >= T[k][1]) i = k; else break;
    const now = i >= 0 ? T[i] : null, next = T[i + 1] || null;
    const lo = now ? now[1] : 0;
    return { lv: i + 1, now, next, n: now ? v / now[1] : 0, pct: next ? Math.max(0, Math.min(100, (v - lo) / (next[1] - lo) * 100)) : 100 };
  },
  cnt(n) { return n >= 100 ? Math.round(n).toLocaleString('ko-KR') : n >= 10 ? (Math.round(n * 10) / 10).toString() : (Math.round(n * 100) / 100).toString(); },
  img(lv, cls = 'vt-ic') {
    if (!lv) return `<span class="${cls} vt-ic0"></span>`;
    if (lv === 'q') return `<span class="${cls} vt-q" aria-label="아직 모름">?</span>`;
    const ic = (this.T[lv - 1] && this.T[lv - 1][2]) || lv;
    return `<span class="${cls}"><img src="${this.IMG}${String(ic).padStart(3, '0')}.webp" alt="" loading="lazy" onerror="this.remove()"></span>`;
  },
  // 기간별 볼륨 — 기록 칸(gl_fit_log_날짜)을 한 번에 훑는다(1분 기억)
  // ── 티어에 넣는 볼륨의 상한(기록 자체는 그대로, 레벨 계산에만) ──
  // 레벨만 올리려고 말이 안 되는 무게·횟수를 적는 것을 막는다. 상한을 넘은 부분은 세지 않는다.
  //   기준 = 사람이 할 수 있는 최고치(정상급 보디빌더·역도 기록). 그보다 큰 것은 기록으로만 남고 세지 않는다.
  //   ① 한 세트 무게: 기구마다 최정상 보디빌더가 실제로 다룬 무게까지
  //      (덤벨 91 — 로니 콜먼 200lb 덤벨 프레스 · 바벨 365 — 800lb 스쿼트·데드 · 하체 머신 1,045 — 2,300lb 레그 프레스 · 그 밖 머신 300 · 케이블 180 …)
  //   ② 한 세트 횟수: 50회까지
  //   ③ 갑자기 늘린 무게: 그 종목의 지난 최고 무게 × 1.5 + 10kg 까지만(처음 기록은 ①만)
  //   ④ 하루 40톤 · 한 주(월~일) 150톤까지 — 선수급 훈련도 이 안에 든다
  CAP: { dumbbell: 91, kettlebell: 92, barbell: 365, machine: 300, machineLeg: 1045, cable: 180, bar: 100, band: 60, trx: 50, etc: 120, body: 100 },
  REPS: 50, DAY: 40000, WEEK: 150000,
  // 기록을 저장할 때 미리 알려 준다 — 이 운동의 이 세트들 중 '들어 올린 무게' 에서 빠질 것이 있으면 짧은 안내 한 줄, 없으면 ''
  //   카드 기록 시트·AI 비서·운동 모드 체크에서 부른다. ds 날짜의 다른 기록과 합쳐 하루·한 주 상한도 본다.
  warn(n, sets, ds) {
    try {
      sets = (sets || []).map(x => ({ w: Number(x.w) || 0, r: Number(x.r) || 0 })).filter(x => x.w > 0 && x.r > 0);
      if (!sets.length) return '';
      const cap = this._cap(n), pre = UserStore.key(PlanGen.LOG_PREFIX);
      let best = 0, day = 0, week = 0;
      const mon = Fitness._dateStr(WorkoutHistory._monday(new Date(ds + 'T00:00:00')));
      for (let k = 0; k < localStorage.length; k++) {
        const key = localStorage.key(k); if (!key || !key.startsWith(pre)) continue;
        const d = key.slice(pre.length); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        let L; try { L = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { continue; }
        for (const [m, ss] of Object.entries(L)) for (const x of ss || []) {
          const w = Number(x && x.w) || 0, r = Number(x && x.r) || 0; if (!(w > 0 && r > 0)) continue;
          if (m === n && d < ds) best = Math.max(best, Math.min(w, cap));
          if (m === n && d === ds) continue;   // 이 운동의 그날 기록은 지금 저장하는 것으로 바뀐다
          if (d === ds) day += w * r;
          if (d >= mon && d <= ds) week += w * r;
        }
      }
      const add = sets.reduce((t, x) => t + x.w * x.r, 0), top = Math.max(...sets.map(x => x.w));
      if (top > cap) return `${top}kg 은 사람이 이 기구로 들 수 있는 최고(${cap}kg)를 넘어 들어 올린 무게에는 ${cap}kg 까지만 셉니다`;
      if (best && top > best * 1.5 + 10) return `지난 최고 ${best}kg 에서 갑자기 많이 늘어 들어 올린 무게에는 ${Math.round(best * 1.5 + 10)}kg 까지만 셉니다`;
      if (sets.some(x => x.r > this.REPS)) return `한 세트 ${this.REPS}회를 넘는 부분은 들어 올린 무게에 넣지 않습니다`;
      if (day + add > this.DAY) return `하루 ${this.DAY / 1000}톤(최정상 선수의 하루 훈련량)을 넘는 부분은 들어 올린 무게에 넣지 않습니다`;
      if (week + add > this.WEEK) return `한 주 ${this.WEEK / 1000}톤을 넘는 부분은 들어 올린 무게에 넣지 않습니다`;
      return '';
    } catch (e) { return ''; }
  },
  // 그날 운동 목록에 있는데 체크가 안 된 운동 이름들. CHK_FROM 이전 날짜는 예전처럼 기록만 있으면 센다(지난 기록이 갑자기 빠지지 않게).
  CHK_FROM: '2026-10-26',
  _unchecked(ds) {
    if (ds < this.CHK_FROM) return new Set();
    try {
      const d = new Date(ds + 'T00:00:00'), { list } = Fitness.exercisesFor(d), chk = new Set(Fitness._checked(d));
      const on = new Set(list.filter((_, i) => chk.has(i)).map(x => x.name));
      // 운동 모드로 지금 하는 중이면 세트를 체크한 운동은 (종목을 다 끝내기 전이라도) 센다
      const st = typeof WorkoutMode !== 'undefined' && WorkoutMode.st;
      if (st && st.ds === ds) st.ex.forEach(e => { if (e.rows.some(r => r.ok)) on.add(e.name); });
      return new Set(list.map(x => x.name).filter(n => !on.has(n)));
    } catch (e) { return new Set(); }
  },
  _cap(n) {
    const e = PlanGen.equipOf(n);
    if (e === 'machine' && PlanGen.partOf(n) === '하체') return this.CAP.machineLeg;
    return this.CAP[e] || this.CAP.body;
  },
  sums(base) {
    const key = Fitness._dateStr(base || new Date());
    if (this._c && this._c.key === key && Date.now() - this._c.t < 60000) return this._c.v;
    const pre = UserStore.key(PlanGen.LOG_PREFIX), d0 = base ? new Date(base) : new Date();
    const today = Fitness._dateStr(d0), mon = Fitness._dateStr(WorkoutHistory._monday(d0)), m1 = today.slice(0, 8) + '01';
    const v = { day: 0, week: 0, month: 0, all: 0, allY: 0, days: 0, raw: 0, cut: 0, cutSets: 0 };
    const days = [];
    for (let k = 0; k < localStorage.length; k++) {
      const key2 = localStorage.key(k); if (!key2 || !key2.startsWith(pre)) continue;
      const ds = key2.slice(pre.length); if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || ds > today) continue;
      let L; try { L = JSON.parse(localStorage.getItem(key2) || '{}') || {}; } catch (e) { continue; }
      days.push([ds, L]);
    }
    days.sort((a, b) => a[0] < b[0] ? -1 : 1);   // 지난 최고 무게를 따라가려면 날짜 순서대로
    const best = {}, wk = {}, capOf = {};
    for (const [ds, L] of days) {
      let s = 0, raw = 0; const dayBest = {};
      const off = this._unchecked(ds);   // 그날 목록에서 체크를 푼 운동은 세지 않는다(체크를 풀면 볼륨·레벨도 되돌아간다)
      for (const [n, ss] of Object.entries(L)) {
        if (off.has(n)) continue;
        if (!(n in capOf)) capOf[n] = this._cap(n);
        for (const x of ss || []) {
          const w = Number(x.w) || 0, r = Number(x.r) || 0; if (!(w > 0 && r > 0)) continue;
          raw += w * r;
          let wc = Math.min(w, capOf[n]);
          if (best[n]) wc = Math.min(wc, best[n] * 1.5 + 10);
          const rc = Math.min(r, this.REPS);
          if (wc < w || rc < r) v.cutSets++;
          s += wc * rc; dayBest[n] = Math.max(dayBest[n] || 0, wc);
        }
      }
      for (const n in dayBest) best[n] = Math.max(best[n] || 0, dayBest[n]);
      if (!raw) continue;
      s = Math.min(s, this.DAY);
      const wkey = Fitness._dateStr(WorkoutHistory._monday(new Date(ds + 'T00:00:00')));
      const room = Math.max(0, this.WEEK - (wk[wkey] || 0)); s = Math.min(s, room); wk[wkey] = (wk[wkey] || 0) + s;
      v.raw += raw; v.all += s; v.days++;
      if (ds < today) v.allY += s;   // 어제까지(모두 합친 총볼륨에 쓴다)
      if (ds === today) v.day += s;
      if (ds >= mon) v.week += s;
      if (ds >= m1) v.month += s;
    }
    v.cut = Math.max(0, v.raw - v.all);
    this._c = { key, t: Date.now(), v };
    return v;
  },
  line(v) { const t = this.tier(v); return t.now ? `${t.now[0]} 넘음` : (v > 0 ? `${this.T[0][0]}까지 ${Math.floor(t.pct)}%` : '아직 기록 없음'); },
  // ── 순위 · 레벨별 인원 (서버) ── 열 때마다가 아니라 10분에 한 번, 값이 바뀌었을 때 올린다
  RK: 'gl_vt_rank',
  rank() { try { return JSON.parse(localStorage.getItem(this.RK) || 'null'); } catch (e) { return null; } },
  async sync(force) {
    try {
      const s = this.sums(), t = this.tier(s.all), r0 = this.rank();
      if (!force && r0 && r0.v === Math.round(s.all) && Date.now() - r0.at < 600000) return r0;
      const u = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser; if (!u) return r0;
      const idToken = await u.getIdToken();
      const res = await fetch(Platform.api('/api/hub'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'vt', idToken, v: Math.round(s.all), vy: Math.round(s.allY), lv: t.lv }) });
      const j = await res.json(); if (!j || !j.ok) return r0;
      const r = { rank: j.rank, total: j.total, levels: j.levels || {}, avgLv: j.avgLv, avgV: j.avgV, sumY: j.sumY, v: Math.round(s.all), at: Date.now() };
      try { localStorage.setItem(this.RK, JSON.stringify(r)); } catch (e) {}
      return r;
    } catch (e) { return this.rank(); }
  },
  // 오늘의 운동 카드 아래 진행 칸 — 한 줄(주황 진행줄)이 이전 단계 아이콘 밑에서 다음 단계 아이콘 밑까지 이어진다.
  //   위: 'Lv.N 이름'  가운데: 아이콘(지금 단계는 진행도만큼 오른쪽에)  줄  아래: 무게(지금 단계는 내 총볼륨)
  //   등수는 이 칸을 눌러 여는 '들어 올린 무게' 시트에서 보여 준다.
  // 그날 든 무게(체크한 운동 기준). 하나도 체크 안 했으면 0
  _dayVol(d, s) {
    try {
      if (!(s.day > 0)) return 0;
      const list = Fitness.exercisesFor(d).list, chk = Fitness._checked(d);
      const live = typeof WorkoutMode !== 'undefined' && WorkoutMode.st && WorkoutMode.st.ds === Fitness._dateStr(d);
      return (live || chk.some(i => i < list.length) || !list.length) ? s.day : 0;
    } catch (e) { return 0; }
  },
  // 오늘의 운동 카드 아래 진행 칸 — 한 줄(주황 진행줄)이 이전 단계 아이콘 밑에서 다음 단계 아이콘 밑까지 이어진다.
  //   위: 'Lv.N 이름'  가운데: 아이콘  줄  아래: 무게(지금 단계는 내 총볼륨). 등수는 칸을 눌러 여는 시트에서.
  //   그날 든 무게는 이전↔지금, 지금↔다음 중 넓은 틈 가운데에 '+720kg' 과 그 무게만 한 사물 아이콘으로.
  //   값이 바뀌면(세트·운동 체크) 숫자가 올라가고 줄·아이콘이 미끄러진다 — 직전에 보여 준 값을 기억해 거기서부터.
  _shown: null,
  chip(d) {
    try {
      const s = this.sums(d); if (!s.all) return '';
      const ds = Fitness._dateStr(d);
      const t = this.tier(s.all), prev = t.lv > 1 ? this.T[t.lv - 2] : null;
      const pos = v => { const q = this.tier(v); return 32 + (q.next ? q.pct : 100) * 0.36; };
      const pl = pos(s.all), dv = this._dayVol(d, s);
      const was = this._shown && this._shown.ds === ds ? this._shown : null;
      const same = was && was.lv === t.lv, up = was && t.lv > was.lv;
      const fromPl = same ? was.pl : pl, fromAll = was ? was.all : s.all, fromDay = was ? was.day : dv;
      this._shown = { ds, all: s.all, day: dv, lv: t.lv, pl };
      if (!this._syncing) { this._syncing = true; setTimeout(() => this.sync().finally(() => { this._syncing = false; }), 300); }
      const nm = (lv, name) => {
        const w = [...`Lv.${lv} ${name}`].reduce((a, c) => a + (/[ㄱ-힝]/.test(c) ? 1 : 0.58), 0);
        const fs = Math.max(8.5, Math.min(10.5, 78 / w));
        return `<span class="ftr-nmi" style="font-size:${fs.toFixed(1)}px"><b class="num">Lv.${lv}</b> ${name}</span>`;
      };
      const mid = pl >= 50 ? pl / 2 : (pl + 100) / 2, dt = dv > 0 ? this.tier(dv) : null;
      const gain = was && dv > was.day ? dv - was.day : 0;
      const pop = gain ? `<span class="ftr-float num" style="left:${mid.toFixed(1)}%">+${this.kg(gain, true)}</span>` : '';
      const day = dv > 0 ? `${pop}<span class="ftr-dv num" style="left:${mid.toFixed(1)}%" data-cu="kg" data-from="${fromDay}" data-to="${dv}">+${this.kg(fromDay, true)}</span>
          <span class="ftr-at ftr-dm" style="left:${mid.toFixed(1)}%" title="${dt && dt.now ? esc(dt.now[0]) + '만큼' : ''}">${dt && dt.now ? this.img(dt.lv, 'ftr-ic ftr-dic') : '<span class="ftr-ic ftr-dic ftr-d0"></span>'}</span>` : '';
      if (up) setTimeout(() => { try { App.showToast(`Lv.${t.lv} ${t.now[0]} 달성!`, 'success'); Haptic.success(); } catch (e) {} }, 700);
      return `<button type="button" class="fit-tier${up ? ' ftr-up' : ''}${gain ? ' ftr-gain' : ''}" data-anim="1" onclick="VolTier.open('${ds}')" aria-label="들어 올린 무게 Lv.${t.lv}${dv > 0 ? ', 오늘 ' + this.kg(dv) : ''}">
        <span class="ftr-trk">
          <span class="ftr-nm" style="left:0%">${prev ? nm(t.lv - 1, esc(prev[0])) : '시작'}</span>
          <span class="ftr-nm ftr-cur ftr-mv" style="left:${fromPl.toFixed(1)}%" data-left="${pl.toFixed(1)}">${t.now ? nm(t.lv, esc(t.now[0])) : '시작 전'}</span>
          <span class="ftr-nm" style="left:100%">${t.next ? nm(t.lv + 1, '???') : '끝'}</span>
          <span class="ftr-at" style="left:0%">${prev ? this.img(t.lv - 1, 'ftr-ic ftr-dim') : this.img(0, 'ftr-ic')}</span>
          <span class="ftr-at" style="left:100%">${t.next ? this.img('q', 'ftr-ic') : this.img(t.lv, 'ftr-ic')}</span>
          <span class="ftr-at ftr-me ftr-mv" style="left:${fromPl.toFixed(1)}%" data-left="${pl.toFixed(1)}">${this.img(t.lv, 'ftr-ic')}</span>
          ${day}
          <span class="ftr-bar"><i class="ftr-mv" style="width:${fromPl.toFixed(1)}%" data-width="${pl.toFixed(1)}"></i></span>
          <span class="ftr-v" style="left:0%">${prev ? this.kg(prev[1], true) : '0kg'}</span>
          <span class="ftr-v ftr-cur ftr-mv" style="left:${fromPl.toFixed(1)}%" data-left="${pl.toFixed(1)}" data-cu="kgl" data-from="${fromAll}" data-to="${s.all}">${this.kg(fromAll)}</span>
          <span class="ftr-v" style="left:100%">${t.next ? this.kg(t.next[1], true) : ''}</span>
        </span></button>`;
    } catch (e) { return ''; }
  },
  // 화면에 막 그린 칸을 움직인다: data-left/data-width 로 미끄러지고, data-cu 숫자는 from→to 로 올라간다
  anim(root) {
    const els = (root || document).querySelectorAll('[data-cu],[data-left],[data-width]'); if (!els.length) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      els.forEach(el => { if (el.dataset.left) el.style.left = el.dataset.left + '%'; if (el.dataset.width) el.style.width = el.dataset.width + '%'; delete el.dataset.left; delete el.dataset.width; });
      els.forEach(el => {
        if (!el.dataset.cu) return;
        const a = Number(el.dataset.from) || 0, b = Number(el.dataset.to) || 0, kind = el.dataset.cu; delete el.dataset.cu;
        const fmt = v => kind === 'n' ? Math.round(v).toLocaleString('ko-KR') : kind === 'kg' ? '+' + this.kg(v, true) : this.kg(v);
        if (a === b || reduce) { el.textContent = fmt(b); return; }
        el.classList.add('cu-on'); const t0 = performance.now(), T = 900;
        const step = now => { const k = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(a + (b - a) * e); if (k < 1) requestAnimationFrame(step); else el.classList.remove('cu-on'); };
        requestAnimationFrame(step);
      });
    }));
  },
  // 내 볼륨 · 평균 볼륨 · 모두 합친 볼륨을 아이콘으로 나란히 — 각각 어느 단계 사물만큼인지
  _cmp(mine, r) {
    const card = (lb, v, sub, me) => {
      const t = this.tier(v), got = !me && t.lv > 0;
      return `<div class="vt-cc${me ? ' me' : ''}"><span class="vt-cl">${lb}</span>${this.img(t.lv, 'vt-ic vt-ic-c')}<b class="vt-cn">${t.now ? esc(t.now[0]) : '시작 전'}</b><span class="vt-cv num">${this.kg(v, true)}</span><span class="vt-cs">${sub}</span></div>`;
    };
    return `<div class="vt-cmp">
      ${card('내 볼륨', mine, `Lv.${this.tier(mine).lv}`, true)}
      ${card('평균 볼륨', r.avgV || 0, `운동한 ${r.total.toLocaleString('ko-KR')}명`)}
      ${card('모두 합친 볼륨', Math.max(r.sumY || 0, mine), '지금까지')}
    </div>`;
  },
  open(ds) {
    const d = ds ? new Date(ds + 'T00:00:00') : new Date(); this._c = null;
    const s = this.sums(d), t = this.tier(s.all);
    const body = r => {
      const L = (r && r.levels) || {};
      const ladder = this.T.map(([n, kg], i) => {
        const lv = i + 1, got = lv <= t.lv, ppl = L[lv] || 0;
        return `<li class="${got ? 'got' : 'no'}${lv === t.lv ? ' me' : ''}${lv === t.lv + 1 ? ' nx' : ''}">${got ? this.img(lv, 'vt-ic vt-ic-l') : this.img('q', 'vt-ic vt-ic-l')}<span class="vt-n num">${lv}</span><b>${got ? esc(n) : '???'}</b><span class="vt-ppl num">${ppl ? ppl.toLocaleString('ko-KR') + '명' : ''}</span><em class="num">${this.kg(kg)}</em></li>`;
      }).join('');
      return `<div class="vt-hero">${this.img(t.lv, 'vt-ic vt-ic-h')}<div class="vt-hx"><span class="vt-lv num">Lv.${t.lv} / ${this.T.length}</span><b>${t.now ? esc(t.now[0]) : '시작 전'}</b>${t.now ? `<small class="num">${this.kg(t.now[1])}</small>` : ''}</div></div>
      <div class="vt-tot"><span>지금까지 총볼륨</span><b class="num">${this.kg(s.all)}</b></div>
      <div class="vt-rank">${r && r.rank ? `<b class="num">${r.rank.toLocaleString('ko-KR')}등</b><span>전체 ${r.total.toLocaleString('ko-KR')}명 중 · 이 단계에 ${(L[t.lv] || 1).toLocaleString('ko-KR')}명</span>` : '<span>순위를 불러오는 중…</span>'}</div>
      ${r && r.total && r.avgLv != null ? this._cmp(s.all, r) : ''}
      ${t.next ? `<div class="vt-bar"><i style="width:${t.pct.toFixed(1)}%"></i></div><p class="vt-left">다음 Lv.${t.lv + 1}(${this.kg(t.next[1])})까지 <b class="num">${this.kg(Math.max(0, t.next[1] - s.all))}</b> 남음 — 무엇인지는 닿으면 보입니다</p>` : ''}
      ${s.cut > 0 ? `<p class="vt-cut">비정상적으로 큰 기록(${s.cutSets}세트)의 <b class="num">${this.kg(s.cut)}</b>은 레벨에 넣지 않았습니다. 기록은 그대로 남아 있습니다.</p>` : ''}
      <div class="vt-lh"><span>전체 ${this.T.length}단계</span><span>인원 · 무게</span></div>
      <ol class="vt-ladder">${ladder}</ol>
      <p class="pg-note">총볼륨 = 지금까지 든 무게 × 횟수를 모두 더한 값입니다. 운동 모드든 직접 적은 기록이든 모두 들어가지만, 사람이 할 수 있는 최고치(최정상 보디빌더 기준)를 넘는 것은 빼고 셉니다 — 한 세트 무게(기구별 상한: 덤벨 91·바벨 365·하체 머신 1,045kg 등)·50회·지난 최고의 1.5배+10kg, 하루 40톤·한 주 150톤. 맨몸 운동(무게 0)과 유산소는 들어가지 않습니다. 순위에는 숫자만 올라가고 이름은 공유되지 않습니다. 비교 대상의 무게는 널리 알려진 어림값입니다.</p>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`;
    };
    App.openModal('@dumbbell 들어 올린 무게', `<div class="fz fz-vt" id="vtBody">${body(this.rank())}</div>`);
    // 단계 목록은 내 바로 전 단계가 맨 위에 오게(1단계부터 보이지 않게)
    const scroll = () => { const box = document.querySelector('.vt-ladder'); if (!box) return; const li = box.children[Math.max(0, t.lv - 2)]; box.scrollTop = li ? li.offsetTop - box.offsetTop : 0; };
    setTimeout(scroll, 60);
    this.sync(true).then(r => { const el = document.getElementById('vtBody'); if (el && r) { el.innerHTML = body(r); setTimeout(scroll, 30); } });
  },
};
