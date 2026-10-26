// js/workout-mode.js — 운동 설정 창 · 운동 모드(세트 기록 · 쉬는 시간 타이머) · 운동 기록(그래프)
//
// 운동 모드는 Hevy·플랜핏의 '운동 중 화면' 을 따랐다.
//   · 시작 전에 한 번 묻는다: 종목·세트·예상 시간·예상 볼륨을 보여 주고 '예 / 아니오'
//   · 지금 할 운동 하나만 크게 — 움직이는 자세 그림, 자극 부위, 지난번 기록과 오늘 권장 무게, 교체·기록 단추
//   · 세트마다 무게·횟수. 한 세트를 고치면 그 아래(아직 안 한) 세트도 같이 바뀐다 — 위 세트는 그대로
//   · 세트 추가는 마지막 세트 값 그대로, 빼기는 그 세트를 왼쪽으로 밀어서
//   · 세트를 끝내면 쉬는 시간 타이머(끌 수 있음). 3초 전부터 째깍, 끝나면 2초 알림음(무음 가능)
//   · 쉬는 시간·타이머·소리 설정은 계정에 저장되어 다음 운동에도 그대로
//   · 도중에 나가도 진행 상황을 계정에 남겨 두고, 다시 '운동 시작' 을 누르면 시간이 이어서 간다
//   · 끝낼 때 '저장하고 끝내기 / 저장하지 않고 끝내기 / 계속하기'
// 화면을 켜 둔다(Wake Lock). 타이머는 끝나는 시각으로 계산해 다른 앱에 갔다 와도 어긋나지 않는다.

// ── 운동 설정 ─────────────────────────────────────
const FitSettings = {
  _p() {
    const p = { goal: 'muscle', level: 'beg', days: 3, mins: 60, focus: [], cardio: false, injury: [], exclude: [], ...(PlanGen.profile() || {}) };
    if (!Array.isArray(p.places) || !p.places.length) { p.places = PlanGen.places(p); p.place = p.places[0].id; }
    if (!p.places.some(x => x.id === p.place)) p.place = p.places[0].id;
    return p;
  },
  open() {
    App.openModal('@dumbbell 운동 설정', `<div id="fsBody"></div>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`);
    this.paint();
  },
  paint() {
    const b = document.getElementById('fsBody'); if (!b) return;
    const p = this._p(), pl = p.places.find(x => x.id === p.place);
    const ex = p.exclude || [], bans = PlanGen.bans();
    const chip = (on, label, fn, cls = '') => `<button type="button" class="pg-c${on ? ' on' : ''} ${cls}" onclick="${fn}">${label}</button>`;
    b.innerHTML = `
      <div class="pg-q"><div class="pg-t">루틴</div><div class="pg-cs">
        ${chip(false, '요일별 루틴 보기·바꾸기', 'App.closeModal();Fitness.showDayPlan()')}
        ${chip(false, '맞춤 플랜 다시 만들기', 'App.closeModal();PlanGen.open()')}
        ${chip(false, '루틴 직접 만들기', 'App.closeModal();Fitness.showRoutineEdit()')}</div></div>
      <div class="pg-q"><div class="pg-t">운동 장소<small>지금 고른 장소의 기구로 플랜·교체를 짭니다</small></div><div class="pg-cs">
        ${p.places.map(x => chip(x.id === p.place, esc(x.name), `FitSettings.pick('${x.id}')`)).join('')}
        ${chip(false, '+ 장소 추가', 'FitSettings.addPlace()', 'pg-add')}</div>
        <div class="fs-pl-acts"><button class="fs-lnk" onclick="FitSettings.renamePlace()">이름 바꾸기</button>${p.places.length > 1 ? '<button class="fs-lnk" onclick="FitSettings.delPlace()">이 장소 지우기</button>' : ''}</div></div>
      <div class="pg-q"><div class="pg-t">보유 운동기구 · ${esc(pl.name)}<small>눌러서 있음/없음 — 장소마다 따로 저장됩니다. 맨몸 운동은 늘 들어갑니다</small></div><div class="pg-cs">
        ${PlanGen.EQUIP.map(([e, l]) => chip((pl.equip || []).includes(e), l, `FitSettings.toggleEq('${e}')`)).join('')}</div></div>
      <div class="pg-q"><div class="pg-t">추천하지 않을 기구<small>장소와 상관없이 나에게 적용 — 있어도 쓰기 싫은 기구를 플랜·교체·추가 목록에서 뺍니다</small></div><div class="pg-cs">
        ${PlanGen.EQUIP.map(([e, l]) => chip(ex.includes(e), l, `FitSettings.toggleEx('${e}')`)).join('')}</div></div>
      <div class="pg-q"><div class="pg-t">추천하지 않는 운동<small>${bans.length ? '눌러서 다시 추천받기' : '운동 교체 창에서 ‘앞으로 추천하지 않기’ 를 고르면 여기에 모입니다'}</small></div><div class="pg-cs">
        ${bans.map((n, i) => chip(true, esc(n) + ' ✕', `FitSettings.unban(${i})`)).join('')}</div></div>
      <p class="pg-note">바꾼 설정은 다음 플랜·교체·운동 추가부터 적용됩니다. 지금 루틴에 바로 반영하려면 ‘맞춤 플랜 다시 만들기’ 를 눌러 주세요.</p>`;
  },
  _save(p) { PlanGen.saveProfile(p); this.paint(); },
  pick(id) { const p = this._p(); p.place = id; this._save(p); },
  addPlace() {
    const name = prompt('운동 장소 이름 (예: 회사 헬스장, 동네 헬스장, 집)'); if (!name || !name.trim()) return;
    const p = this._p(), id = 'pl_' + Date.now().toString(36);
    p.places.push({ id, name: name.trim().slice(0, 20), equip: PlanGen.ALL_EQUIP.slice(), v2: 1 });
    p.place = id; this._save(p);
    App.showToast('새 장소를 만들었습니다 — 없는 기구를 눌러 꺼 주세요');
  },
  renamePlace() {
    const p = this._p(), pl = p.places.find(x => x.id === p.place);
    const name = prompt('장소 이름', pl.name); if (!name || !name.trim()) return;
    pl.name = name.trim().slice(0, 20); this._save(p);
  },
  delPlace() {
    const p = this._p(); if (p.places.length < 2) return;
    const pl = p.places.find(x => x.id === p.place);
    if (!confirm(`'${pl.name}' 장소를 지울까요?`)) return;
    p.places = p.places.filter(x => x.id !== p.place); p.place = p.places[0].id; this._save(p);
  },
  toggleEq(e) {
    const p = this._p(), pl = p.places.find(x => x.id === p.place);
    pl.equip = (pl.equip || []).includes(e) ? pl.equip.filter(x => x !== e) : (pl.equip || []).concat(e);
    this._save(p);
  },
  toggleEx(e) { const p = this._p(), ex = p.exclude || []; p.exclude = ex.includes(e) ? ex.filter(x => x !== e) : ex.concat(e); this._save(p); },
  unban(i) {
    const b = PlanGen.bans(); const n = b.splice(i, 1)[0];
    UserStore.set(PlanGen.BAN_KEY, JSON.stringify(b)); window.FirebaseSync?.scheduleSave?.();
    App.showToast(`${n} — 다시 추천합니다`, 'success'); this.paint();
  },
};

// ── 운동 기록 (언제·몇 번·몇 kg·볼륨 + 그래프) ─────────────────
const WorkoutHistory = {
  // 이 운동을 한 날들(최근 → 예전)
  sessions(name, days = 365) {
    const out = [];
    for (let i = 0; i <= days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = Fitness._dateStr(d);
      const L = PlanGen.log(ds)[name];
      if (L && L.length) {
        const top = Math.max(...L.map(s => Number(s.w) || 0));
        const vol = L.reduce((t, s) => t + (Number(s.w) || 0) * (Number(s.r) || 0), 0);
        const e1 = Math.max(...L.map(s => (Number(s.w) || 0) * (1 + (Number(s.r) || 0) / 30)));
        out.push({ ds, sets: L, top, vol, e1, reps: L.reduce((t, s) => t + (Number(s.r) || 0), 0) });
      }
    }
    return out;
  },
  _chart(ss) {
    const pts = ss.slice(0, 12).reverse();
    if (pts.length < 2) return '<p class="pg-note">기록이 두 번 이상 쌓이면 그래프가 그려집니다.</p>';
    const W = 320, H = 140, P = 24;
    const maxV = Math.max(...pts.map(p => p.vol)) || 1, maxT = Math.max(...pts.map(p => p.top)) || 1, minT = Math.min(...pts.map(p => p.top));
    const x = i => P + i * (W - P * 2) / (pts.length - 1);
    const yT = t => maxT === minT ? H / 2 : H - P - (t - minT) / (maxT - minT) * (H - P * 2);
    const bw = Math.max(6, (W - P * 2) / pts.length * 0.5);
    const bars = pts.map((p, i) => `<rect x="${x(i) - bw / 2}" y="${H - P - (p.vol / maxV) * (H - P * 2)}" width="${bw}" height="${(p.vol / maxV) * (H - P * 2)}" rx="2" class="wh-bar"/>`).join('');
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${yT(p.top)}`).join(' ');
    const dots = pts.map((p, i) => `<circle cx="${x(i)}" cy="${yT(p.top)}" r="3" class="wh-dot"/>`).join('');
    const lbl = pts.map((p, i) => (i === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${i ? 'end' : 'start'}" class="wh-t">${p.ds.slice(5).replace('-', '/')}</text>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="wh-svg" role="img" aria-label="최고 무게와 볼륨 추이">${bars}<path d="${line}" class="wh-line"/>${dots}${lbl}
      <text x="${P}" y="14" class="wh-t">최고 ${maxT}kg</text><text x="${W - P}" y="14" text-anchor="end" class="wh-t wh-tv">볼륨 막대</text></svg>`;
  },
  html(name) {
    const ss = this.sessions(name);
    if (!ss.length) return `<p class="pg-note">아직 이 운동의 무게·횟수 기록이 없습니다. 운동 모드나 연필 단추로 남기면 여기에 쌓입니다.</p>`;
    const m30 = ss.filter(s => (Date.now() - new Date(s.ds + 'T00:00:00')) / 864e5 <= 30);
    const best = ss.reduce((a, b) => b.e1 > a.e1 ? b : a);
    const k = n => Math.round(n).toLocaleString('ko-KR');
    return `<div class="wh-stats">
        <div><b class="num">${ss[0].ds.slice(5).replace('-', '/')}</b><span>마지막</span></div>
        <div><b class="num">${m30.length}</b><span>최근 30일 횟수</span></div>
        <div><b class="num">${k(m30.reduce((t, s) => t + s.vol, 0))}</b><span>30일 볼륨 kg</span></div>
        <div><b class="num">${Math.round(best.e1)}</b><span>추정 1RM kg</span></div></div>
      ${this._chart(ss)}
      <div class="wh-list">${ss.slice(0, 10).map(s => `<div class="wh-row"><span class="num">${s.ds.slice(2).replace(/-/g, '.')}</span>
        <span>${s.sets.map(x => x.w ? `${x.w}×${x.r}` : `${x.r}회`).join(' · ')}</span><b class="num">${k(s.vol)}</b></div>`).join('')}</div>`;
  },
  // ── 하루 · 주 단위 합계 (볼륨 · 세트 · 열량 · 부위) ──
  _part(n) { const p = PlanGen.partOf(n) || ''; return /이두|삼두|전완/.test(p) ? '팔' : (p || '기타'); },
  // 추이 창 하나를 그리는 동안 같은 날을 여러 번 계산하지 않게 잠깐 기억해 둔다(창을 열 때마다 비운다)
  _dc: null,
  day(ds, fresh) {
    if (!fresh && this._dc && this._dc[ds]) return this._dc[ds];
    const o = this._day(ds); if (this._dc) this._dc[ds] = o; return o;
  },
  _day(ds) {
    const L = PlanGen.log(ds), o = { ds, vol: 0, sets: 0, reps: 0, kcal: 0, parts: {}, top: {} };
    Object.entries(L).forEach(([n, ss]) => (ss || []).forEach(x => {
      const v = (Number(x.w) || 0) * (Number(x.r) || 0);
      o.vol += v; o.sets++; o.reps += Number(x.r) || 0;
      const pt = this._part(n); o.parts[pt] = (o.parts[pt] || 0) + v;
      o.top[n] = Math.max(o.top[n] || 0, Number(x.w) || 0);
    }));
    try { o.kcal = Fitness.burn(new Date(ds + 'T00:00:00')).kcal || 0; } catch (e) {}
    return o;
  },
  _monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; },
  // 주(월~일) 합계. upto: 그 주의 몇째 날까지(0=월) 셀지 — 이번 주와 '지난주 같은 기간' 을 맞대기 위해
  week(mon, upto = 6) {
    const w = { mon, vol: 0, sets: 0, kcal: 0, days: 0, parts: {}, top: {} };
    for (let i = 0; i <= upto; i++) {
      const d = new Date(mon); d.setDate(d.getDate() + i);
      if (d > new Date()) break;
      const x = this.day(Fitness._dateStr(d));
      if (x.sets || x.kcal) w.days++;
      w.vol += x.vol; w.sets += x.sets; w.kcal += x.kcal;
      Object.entries(x.parts).forEach(([k, v]) => { w.parts[k] = (w.parts[k] || 0) + v; });
      Object.entries(x.top).forEach(([k, v]) => { w.top[k] = Math.max(w.top[k] || 0, v); });
    }
    return w;
  },
  _delta(a, b, unit = '') {
    if (!b) return a ? '<em class="wt-d up">지난주 0</em>' : '<em class="wt-d">—</em>';
    const p = Math.round((a - b) / b * 100);
    return `<em class="wt-d ${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${p > 0 ? '▲' : p < 0 ? '▼' : ''}${Math.abs(p)}%</em>`;
  },
  // 추이: 이번 주 vs 지난주(같은 요일까지) · 8주 / 14일 그래프 · 부위별 · 종목별 무게 변화
  trendHtml() {
    const k = n => Math.round(n).toLocaleString('ko-KR');
    const mon = this._monday(new Date()), upto = (new Date().getDay() + 6) % 7;
    const lmon = new Date(mon); lmon.setDate(lmon.getDate() - 7);
    const cur = this.week(mon, upto), prev = this.week(lmon, upto), prevAll = this.week(lmon, 6);
    const DOW = '월화수목금토일';
    const stat = (v, pv, lbl, u) => `<div><b class="num">${k(v)}<small>${u}</small></b><span>${lbl}</span>${this._delta(v, pv)}</div>`;
    // 부위별(이번 주 vs 지난주 같은 기간)
    const parts = [...new Set([...Object.keys(cur.parts), ...Object.keys(prev.parts)])].filter(p => cur.parts[p] || prev.parts[p])
      .sort((a, b) => (cur.parts[b] || 0) - (cur.parts[a] || 0));
    const pmax = Math.max(1, ...parts.map(p => Math.max(cur.parts[p] || 0, prev.parts[p] || 0)));
    // 종목별 최고 무게(이번 주 vs 지난주 전체)
    const exs = Object.keys(cur.top).filter(n => prevAll.top[n] && cur.top[n]).map(n => ({ n, a: cur.top[n], b: prevAll.top[n] }))
      .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, 8);
    return `<div class="wt">
      <div class="wt-h"><b>이번 주</b><span>월~${DOW[upto]} · 지난주 같은 기간과 비교</span></div>
      <div class="wh-stats wt-stats">
        ${stat(cur.vol, prev.vol, '총 볼륨', 'kg')}${stat(cur.sets, prev.sets, '세트', '')}${stat(cur.kcal, prev.kcal, '소모 열량', 'kcal')}${stat(cur.days, prev.days, '운동한 날', '일')}</div>
      <div class="wt-seg"><button type="button" class="on" data-v="w" onclick="WorkoutHistory._seg('w')">주별 · 8주</button><button type="button" data-v="d" onclick="WorkoutHistory._seg('d')">일별 · 14일</button></div>
      <div id="wtChart">${this._chartWeeks()}</div>
      ${parts.length ? `<div class="wt-h"><b>부위별 볼륨</b><span><i class="wt-key cur"></i>이번 주 <i class="wt-key prev"></i>지난주 같은 기간</span></div>
      <div class="wt-parts">${parts.map(p => `<div class="wt-pr"><span>${esc(p)}</span><div class="wt-bars">
          <i class="cur" style="width:${(cur.parts[p] || 0) / pmax * 100}%"></i><i class="prev" style="width:${(prev.parts[p] || 0) / pmax * 100}%"></i></div>
          <b class="num">${k(cur.parts[p] || 0)}</b>${this._delta(cur.parts[p] || 0, prev.parts[p] || 0)}</div>`).join('')}</div>` : ''}
      ${exs.length ? `<div class="wt-h"><b>종목별 최고 무게</b><span>지난주 → 이번 주</span></div>
      <div class="wt-ex">${exs.map(x => { const d = +(x.a - x.b).toFixed(2); return `<button type="button" class="wt-er" onclick="WorkoutHistory.open('${esc(x.n).replace(/'/g, '&#39;')}')">
          <span>${esc(x.n)}</span><em class="num">${x.b} → <b>${x.a}</b>kg</em><i class="wt-d ${d > 0 ? 'up' : d < 0 ? 'down' : ''} num">${d > 0 ? '+' : ''}${d || '±0'}</i></button>`; }).join('')}</div>` : ''}
    </div>`;
  },
  _seg(v) {
    document.querySelectorAll('.wt-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const c = document.getElementById('wtChart'); if (c) c.innerHTML = v === 'w' ? this._chartWeeks() : this._chartDays();
    try { Haptic.light(); } catch (e) {}
  },
  // 막대 = 볼륨, 선 = 소모 열량. 마지막(이번) 칸만 주황.
  _bars(pts, lbl) {
    const W = 320, H = 150, P = 20, T = 18;
    const mv = Math.max(1, ...pts.map(p => p.vol)), mk = Math.max(1, ...pts.map(p => p.kcal));
    const cw = (W - P * 2) / pts.length, bw = Math.max(6, cw * 0.56), base = H - 22, ht = base - T;
    const cx = i => P + cw * i + cw / 2;
    const bars = pts.map((p, i) => `<rect x="${cx(i) - bw / 2}" y="${base - p.vol / mv * ht}" width="${bw}" height="${Math.max(p.vol ? 2 : 0, p.vol / mv * ht)}" rx="2" class="wt-b${i === pts.length - 1 ? ' now' : ''}"><title>${lbl(p)} · ${Math.round(p.vol).toLocaleString('ko-KR')}kg · ${p.kcal}kcal</title></rect>`).join('');
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${cx(i)},${base - p.kcal / mk * ht}`).join(' ');
    const dots = pts.map((p, i) => `<circle cx="${cx(i)}" cy="${base - p.kcal / mk * ht}" r="2.5" class="wt-kd"/>`).join('');
    const xs = pts.map((p, i) => (pts.length <= 8 || i % 2 === pts.length % 2 - 1 + 1 || i === pts.length - 1) ? `<text x="${cx(i)}" y="${H - 6}" text-anchor="middle" class="wh-t${i === pts.length - 1 ? ' wt-now' : ''}">${lbl(p)}</text>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="wh-svg" role="img" aria-label="볼륨과 소모 열량 추이">${bars}<path d="${line}" class="wt-kl"/>${dots}${xs}
      <text x="${P}" y="12" class="wh-t">최대 ${Math.round(mv).toLocaleString('ko-KR')}kg</text><text x="${W - P}" y="12" text-anchor="end" class="wh-t">점선 열량 · 최대 ${Math.round(mk)}kcal</text></svg>`;
  },
  _chartWeeks() {
    const mon = this._monday(new Date()), pts = [];
    for (let i = 7; i >= 0; i--) { const m = new Date(mon); m.setDate(m.getDate() - 7 * i); pts.push(this.week(m)); }
    if (!pts.some(p => p.vol || p.kcal)) return '<p class="pg-note">운동 기록이 쌓이면 주별 그래프가 그려집니다.</p>';
    return this._bars(pts, p => `${p.mon.getMonth() + 1}/${p.mon.getDate()}`);
  },
  _chartDays() {
    const pts = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); pts.push(this.day(Fitness._dateStr(d))); }
    if (!pts.some(p => p.vol || p.kcal)) return '<p class="pg-note">운동 기록이 쌓이면 일별 그래프가 그려집니다.</p>';
    return this._bars(pts, p => p.ds.slice(8).replace(/^0/, ''));
  },
  // 기록 보기(카드 아래): 추이 + 운동한 날들을 최근부터 — 종목을 누르면 그 운동의 그래프
  openAll() {
    this._dc = {}; clearTimeout(this._dct); this._dct = setTimeout(() => { this._dc = null; }, 60000);
    const days = [];
    for (let i = 0; i <= 120 && days.length < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = Fitness._dateStr(d), L = PlanGen.log(ds), names = Object.keys(L).filter(n => (L[n] || []).length);
      if (names.length) days.push({ ds, d, L, names });
    }
    const m30 = days.filter(x => (Date.now() - x.d) / 864e5 <= 30);
    const vol = L => Object.values(L).flat().reduce((t, s) => t + (Number(s.w) || 0) * (Number(s.r) || 0), 0);
    const k = n => Math.round(n).toLocaleString('ko-KR'), DOW = '일월화수목금토';
    const A = v => esc(v).replace(/'/g, '&#39;');
    App.openModal('@chart 운동 기록 · 추이', days.length ? `
      ${this.trendHtml()}
      <div class="wt-h"><b>최근 30일</b><span>날짜별 총 볼륨 · 소모 열량</span></div>
      <div class="wh-stats">
        <div><b class="num">${m30.length}</b><span>최근 30일 운동한 날</span></div>
        <div><b class="num">${k(m30.reduce((t, x) => t + vol(x.L), 0))}</b><span>30일 볼륨 kg</span></div>
        <div><b class="num">${days[0].ds.slice(5).replace('-', '/')}</b><span>마지막</span></div></div>
      <div class="wh-days">${days.map(x => `<div class="wh-day">
        <div class="wh-dh"><b class="num">${x.ds.slice(5).replace('-', '/')}</b><span>${DOW[x.d.getDay()]}${(() => { const l = PlanGen.dayLabel(x.names); return l ? ' · <em class="wh-pt">' + esc(l) + '</em>' : ''; })()}</span><i class="num">${k(vol(x.L))}kg · ${k(this.day(x.ds).kcal)}kcal</i></div>
        ${x.names.map(n => `<button class="wh-ex" onclick="WorkoutHistory.open('${A(n)}')"><span>${esc(n)}</span><em class="num">${x.L[n].map(s => s.w ? `${s.w}×${s.r}` : `${s.r}회`).join(' · ')}</em></button>`).join('')}
      </div>`).join('')}</div>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`
      : `<p class="pg-note">아직 남긴 운동 기록이 없습니다. 운동 모드에서 세트를 완료하거나 연필 단추로 무게·횟수를 남기면 여기에 쌓입니다.</p>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`);
  },
  open(name) {
    App.openModal('@chart ' + name + ' 기록', `<div class="wh">${this.html(name)}</div>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`);
  },
};

// ── 운동 모드 ──────────────────────────────────────
const WorkoutMode = {
  REST: { strength: 150, muscle: 90, lose: 45, health: 60 },
  PREF_KEY: 'gl_wk_prefs',      // { rest, timer, sound } — 계정에 저장(다음 운동에도 그대로)
  SESSION_KEY: 'gl_wk_session', // 진행 중인 운동(끝내지 않고 나간 것)
  st: null,

  prefs() {
    let v = {}; try { v = JSON.parse(UserStore.get(this.PREF_KEY) || '{}') || {}; } catch {}
    const g = (PlanGen.profile() || {}).goal;
    return { rest: v.rest >= 0 ? v.rest : (Number(localStorage.getItem('gl_rest_sec')) || this.REST[g] || 90), timer: v.timer !== false, sound: v.sound !== false, numIn: v.numIn === 'wheel' ? 'wheel' : 'pad' };
  },
  setPrefs(patch) { UserStore.set(this.PREF_KEY, JSON.stringify({ ...this.prefs(), ...patch })); window.FirebaseSync?.scheduleSave?.(); },
  restSec() { return this.prefs().rest; },
  _nSets(sets) { const m = String(sets || '').match(/^(\d+)\s*[×x]/i); return m ? Math.min(10, +m[1]) : 3; },
  _reps(sets) { const r = PlanGen._range(sets); return r[1] || r[0] || 10; },
  _fmt(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },

  saved() { try { return JSON.parse(UserStore.get(this.SESSION_KEY) || 'null'); } catch { return null; } },
  // ── 오래 손대지 않으면 ─────────────────────
  // 세트 완료·무게 바꾸기·교체 같은 손길이 30분 없으면 '아직 운동 중이신가요?', 1시간이면 저장하고 끝낸다.
  // 앱이 백그라운드여도 울리게 기기 알림을 미리 걸어 두고, 손길이 있을 때마다 다시 건다.
  IDLE_ASK: 30 * 60e3, IDLE_END: 60 * 60e3,
  _touch() {
    const S = this.st; if (!S) return;
    S.lastAct = Date.now(); S.idleAsked = false; S.autoEnded = false;
    document.getElementById('wkIdle')?.remove();
    if (Date.now() - (this._idleSet || 0) < 15000) return;   // 연달아 누를 때는 15초에 한 번만 다시 건다
    this._idleSet = Date.now();
    const P = typeof LocalNotify !== 'undefined' && LocalNotify.P;
    if (!P) return;
    const ex = S.ex[S.cur]?.name || '운동';
    P.cancel({ notifications: [{ id: 7995 }, { id: 7994 }] }).catch(() => {}).then(() => P.schedule({ notifications: [
      { id: 7995, title: '아직도 운동 중이신가요?', body: `30분 동안 기록이 없습니다 · ${ex}. 계속하시려면 앱을 열어 주세요.`, schedule: { at: new Date(S.lastAct + this.IDLE_ASK), allowWhileIdle: true } },
      { id: 7994, title: '운동을 저장하고 끝냈습니다', body: '1시간 동안 기록이 없어 지금까지 한 운동을 저장했습니다.', schedule: { at: new Date(S.lastAct + this.IDLE_END), allowWhileIdle: true } },
    ] })).catch(() => {});
  },
  _idleCancel() { const P = typeof LocalNotify !== 'undefined' && LocalNotify.P; if (P) P.cancel({ notifications: [{ id: 7995 }, { id: 7994 }] }).catch(() => {}); this._idleSet = 0; },
  _idleCheck() {
    const S = this.st; if (!S || !S.lastAct) return;
    const idle = Date.now() - S.lastAct;
    if (idle >= this.IDLE_END) return this._autoEnd();
    if (idle >= this.IDLE_ASK && !S.idleAsked && !S.restEnd) {
      S.idleAsked = true;
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted' && !(typeof LocalNotify !== 'undefined' && LocalNotify.P)) {
        try { new Notification('아직도 운동 중이신가요?', { body: '30분 동안 기록이 없습니다. 1시간이 되면 저장하고 끝냅니다.' }); } catch (e) {}
      }
      document.getElementById('wkIdle')?.remove();
      const el = document.createElement('div'); el.id = 'wkIdle'; el.className = 'wk-end';
      el.innerHTML = `<div class="wk-end-bg"></div><div class="wk-end-sh" role="dialog" aria-label="아직 운동 중인지 확인">
        <div class="wk-end-t">아직도 운동 중이신가요?</div>
        <p class="wk-idle-p">30분 동안 세트 완료나 변경이 없었습니다. 1시간이 되면 지금까지 한 운동을 저장하고 운동 모드를 끝냅니다.</p>
        <button class="wk-end-go" onclick="WorkoutMode._touch();WorkoutMode._persist()">계속 운동하기</button>
        <div class="wk-end-row"><button class="wk-end-ghost" onclick="document.getElementById('wkIdle')?.remove();WorkoutMode._finishSave()">저장하고 끝내기</button></div>
      </div>`;
      document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
      try { Haptic.medium(); } catch (e) {}
    }
  },
  // 1시간 손길이 없었다 — 목록이 바뀌었으면 '오늘만' 으로 두고, 지금까지 한 것을 저장하고 끝낸다
  _autoEnd() {
    const S = this.st; if (!S) return;
    document.getElementById('wkIdle')?.remove(); document.getElementById('wkEnd')?.remove();
    S._scoped = true; S.endAt = S.lastAct;
    if (S.planNames && S.ex.map(e => e.name).join('|') !== S.planNames.join('|')) {
      try { Fitness.applyList(S.ds, S.ex.map(e => ({ name: e.name, sets: e.sets, sess: e.sess })), 'day'); } catch (e) {}
    }
    S.autoEnded = true;
    this._finishSave();
    App.showToast('1시간 동안 기록이 없어 지금까지 한 운동을 저장하고 끝냈습니다', 'success');
  },
  // 앱을 다시 열었을 때: 끝내지 않은 운동이 1시간 넘게 그대로면 저장하고 정리한다
  staleCheck() {
    if (this.st) return;
    const sv = this.saved(); if (!sv || !sv.lastAct || sv.autoEnded) return;
    if (Date.now() - sv.lastAct < this.IDLE_END) return;
    this.st = sv; this._autoEnd();
  },
  _persist() {
    const S = this.st; if (!S) return;
    if (!S.autoEnded) this._touch();
    const { ...keep } = S;
    UserStore.set(this.SESSION_KEY, JSON.stringify(keep)); window.FirebaseSync?.scheduleSave?.();
  },
  _clearSaved() { UserStore.set(this.SESSION_KEY, ''); window.FirebaseSync?.scheduleSave?.(); },

  // 시작 단추: 끝내지 않은 운동이 있으면 바로 이어서. 지난 날이면 어떻게 남길지 묻는다. 아니면 '시작할까요?'
  startFor(ds) {
    const sv = this.saved();
    if (sv && sv.ex && sv.ex.length) {
      if (sv.ds === Fitness._dateStr(new Date())) return this._resume(sv);
      this._clearSaved();   // 지난 날에 남겨 둔 것은 이미 기록에 저장되어 있다
    }
    const today = Fitness._dateStr(new Date());
    ds = ds || Fitness._dateStr((App?.S?.selDate) || new Date());
    if (ds > today) { App.showToast('아직 오지 않은 날입니다 — 오늘이나 지난 날을 골라 주세요'); return; }
    if (ds === today) return this.confirmStart(ds);
    const from = new Date(ds + 'T00:00:00'), DOW = '일월화수목금토';
    const { list } = Fitness.exercisesFor(from);
    if (!list.length) { App.showToast(`${ds.slice(5).replace('-', '/')} 에는 계획된 운동이 없습니다`); return; }
    const tp = Fitness.planOn(new Date());
    const md = ds.slice(5).replace('-', '/');
    App.openModal('@dumbbell 지난 운동 하기', `
      <p class="pg-note"><b>${md}(${DOW[from.getDay()]}) ${esc(Fitness.planFor(from.getDay()).name)}</b> 을(를) 지금 합니다. 어떻게 남길까요?</p>
      <div class="wk-pick">
        <button class="sw-row" onclick="WorkoutMode.bring('${ds}', false)"><span class="sw-nm"><b>오늘 기록으로 (이번만)</b><small>오늘 계획(${esc(tp.name)}) 대신 이 운동을 오늘 합니다. 앞으로의 요일 계획은 그대로</small></span></button>
        <button class="sw-row" onclick="WorkoutMode.bring('${ds}', true)"><span class="sw-nm"><b>오늘 기록 + 앞으로 요일도 바꾸기</b><small>${DOW[from.getDay()]}요일 계획과 ${DOW[new Date().getDay()]}요일 계획을 서로 바꿉니다</small></span></button>
        <button class="sw-row" onclick="WorkoutMode.confirmStart('${ds}')"><span class="sw-nm"><b>${md} 기록으로</b><small>그날 한 것으로 남깁니다(깜빡하고 못 남긴 경우)</small></span></button>
      </div>`);
  },
  bring(ds, swapDays) {
    const today = Fitness._dateStr(new Date());
    // 오늘 목록이 통째로 바뀌므로, 오늘 계획에 걸어 둔 체크·순서·교체는 비운다(직접 추가한 운동과 기록은 그대로)
    Fitness._save([], new Date()); UserStore.set(Fitness._orderKey(today), '[]'); UserStore.set(PlanGen.SWAP_PREFIX + today, '{}');
    UserStore.set(Fitness._fromKey(today), ds);
    if (swapDays) {
      const a = new Date(ds + 'T00:00:00').getDay(), b = new Date().getDay();
      const dp = Fitness.dayPlan(), pa = dp[a] ?? Fitness._defaultFor(a), pb = dp[b] ?? Fitness._defaultFor(b);
      dp[a] = pb; dp[b] = pa; Fitness.saveDayPlan(dp);
      UserStore.set(Fitness._fromKey(today), '');   // 요일을 바꿨으니 오늘 계획이 곧 그 운동이다
    }
    window.FirebaseSync?.scheduleSave?.();
    try { App.selectCalDate ? App.selectCalDate(new Date()) : Fitness.render(new Date()); } catch (e) {}
    this.confirmStart(today);
  },

  // 시작 전 한 번 묻기 — 종목·세트·예상 시간·예상 볼륨
  _build(ds) {
    const { list, plan } = Fitness.exercisesFor(new Date(ds + 'T00:00:00'));
    const done = Fitness._checked(new Date(ds + 'T00:00:00'));
    const log = PlanGen.log(ds);
    return list.map((x, i) => {
      const prev = PlanGen.last(x.name, ds);
      const n = Math.max(this._nSets(x.sets), (log[x.name] || []).length);
      const cardio = PlanGen.timed(x.name);
      const nw = x.w !== '' && x.w != null && Number(x.w) > 0 ? Number(x.w) : PlanGen.nextWeight(x.name, x.sets, ds);
      let th = ''; try { th = Fitness._thumb(x, plan || {}); } catch (e) {}
      return { name: x.name, sets: x.sets, key: x.key, sess: x.sess, th, cardio, done: done.includes(i), sug: PlanGen.suggest(x.name, x.sets, ds),
        rows: Array.from({ length: cardio ? 1 : n }, (_, k) => {
          const L = (log[x.name] || [])[k], P = prev && prev.sets[Math.min(k, prev.sets.length - 1)];
          return L ? { w: L.w, r: L.r, ok: true } : { w: nw ?? (P ? P.w : ''), r: nw != null ? this._reps(x.sets) : (P ? P.r : this._reps(x.sets)), ok: false };
        }) };
    });
  },
  confirmStart(ds) {
    ds = ds || Fitness._dateStr(new Date());
    const ex = this._build(ds);
    if (!ex.length) { App.showToast('계획된 운동이 없습니다 — ‘+ 운동 추가’ 나 루틴을 먼저 정해 주세요'); return; }
    const todo = ex.filter(e => !e.done);
    const sets = todo.reduce((t, e) => t + (e.cardio ? 0 : e.rows.length), 0);
    const cardioMin = todo.filter(e => e.cardio).reduce((t, e) => t + (+(String(e.sets || '').match(/(\d+)\s*분/) || [])[1] || 30), 0);
    const pf = this.prefs();
    const mins = Math.round((sets * 45 + Math.max(0, sets - 1) * (pf.timer ? pf.rest : 30)) / 60) + cardioMin;
    const vol = todo.reduce((t, e) => t + e.rows.reduce((a, r) => a + (Number(r.w) || 0) * (Number(r.r) || 0), 0), 0);
    const k = n => Math.round(n).toLocaleString('ko-KR');
    App.openModal('@dumbbell 운동을 시작하시겠습니까?', `
      <div class="wk-cf">
        <div><b class="num">${todo.length}</b><span>종목</span></div>
        <div><b class="num">${sets}</b><span>세트</span></div>
        <div><b class="num">${mins}</b><span>예상 분</span></div>
        <div><b class="num">${vol ? k(vol) : '—'}</b><span>예상 볼륨 kg</span></div>
      </div>
      <ol class="wk-cf-list">${todo.map(e => `<li><b>${esc(e.name)}</b><span>${e.cardio ? esc(e.sets || '시간') : `${e.rows.length}세트 · ${e.rows[0].w ? e.rows[0].w + 'kg × ' : ''}${e.rows[0].r}회`}</span></li>`).join('')}</ol>
      <p class="pg-note">쉬는 시간 ${pf.timer ? this._fmt(pf.rest) : '타이머 끔'} · 소리 ${pf.sound ? '켬' : '끔'} — 운동 중 위쪽 단추에서 바꿀 수 있습니다.</p>
      <div class="modal-btns"><button class="btn-sm accent" onclick="WorkoutMode.start('${ds}')">예, 시작</button><button class="btn-sm" onclick="App.closeModal()">아니오</button></div>`);
  },

  start(ds) {
    ds = ds || Fitness._dateStr(new Date());
    const ex = this._build(ds);
    if (!ex.length) return;
    this.st = { ds, t0: Date.now(), cur: Math.max(0, ex.findIndex(e => !e.done)), restEnd: 0, ex,
      snapLog: PlanGen.log(ds), snapChk: Fitness._checked(new Date(ds + 'T00:00:00')), snapSwap: UserStore.get(PlanGen.SWAP_PREFIX + ds) || '{}',
      snapDay: UserStore.get(Fitness._dayKey(ds)) || '', planNames: ex.map(e => e.name) };
    this._open();
  },
  _resume(sv) {
    this.st = sv; this.st.restEnd = 0; this.st.autoEnded = false; this.st.lastAct = Date.now();
    App.showToast(`이어서 합니다 — ${this._fmt((Date.now() - sv.t0) / 1000)} 지남`);
    this._open();
  },
  _open() {
    App.closeModal?.();
    this._mount(); this.paint(); this._persist();
    clearInterval(this._tick); this._tick = setInterval(() => this._time(), 250);
    try { navigator.wakeLock?.request('screen').then(l => { this._lock = l; }).catch(() => {}); } catch (e) {}
    try { Haptic.medium(); } catch (e) {}
    this._audio();
    try { if (typeof LocalNotify !== 'undefined' && LocalNotify.P) LocalNotify.permission(true); } catch (e) {}
    try { const P = LocalNotify.P; if (P && P.createChannel && window.Capacitor?.getPlatform?.() === 'android') P.createChannel({ id: 'workout', name: '운동 중', importance: 2, visibility: 1 }).catch(() => {}); } catch (e) {}
  },
  _mount() {
    let el = document.getElementById('wkMode');
    if (!el) { el = document.createElement('div'); el.id = 'wkMode'; el.className = 'wk'; document.body.appendChild(el); }
    el.hidden = false; document.body.classList.add('wk-on');
  },

  paint() {
    const S = this.st, el = document.getElementById('wkMode'); if (!S || !el) return;
    // 같은 운동 안에서 세트 체크·무게·횟수를 바꿀 때는 보던 자리 그대로(맨 위로 튀지 않게)
    const b0 = el.querySelector('.wk-body'), keep = b0 && this._pc === S.cur ? b0.scrollTop : 0; this._pc = S.cur;
    const x = S.ex[S.cur], pf = this.prefs();
    const em = typeof ExMedia !== 'undefined' ? ExMedia.find(x.name) : null;
    let th = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(x.name) : '';
    if (!th) th = x.th || '';
    const part = PlanGen.partOf(x.name) || (em && em.part) || '';
    const doneN = S.ex.filter(e => e.done).length;
    const A = v => esc(v).replace(/'/g, '&#39;');
    const nowK = x.rows.findIndex(q => !q.ok);
    // 운동 순서: 지금 운동 앞의 것은 위에, 뒤의 것은 아래에 (예: 3번째면 1·2 → 지금 운동 → 4·5·6·7)
    // 목록 줄을 왼쪽으로 밀면 '삭제' 가 나온다(세트 줄과 같은 손짓)
    const li = (a, b) => S.ex.slice(a, b).map((e, j) => { const i = a + j; return `<div class="wk-sw wk-lsw"><button class="wk-li${e.done ? ' done' : ''}" data-i="${i}" onclick="WorkoutMode.go(${i})">
          <span>${i + 1}</span><b>${esc(e.name)}</b><i>${e.done ? '완료' : e.rows.filter(r => r.ok).length + '/' + e.rows.length}</i></button><button class="wk-sdel" onclick="WorkoutMode.delEx(${i})">삭제</button></div>`; }).join('');
    el.innerHTML = `
      <div class="wk-top">
        <button class="wk-x" onclick="WorkoutMode.finish()">끝내기</button>
        <div class="wk-clock"><b id="wkEl" class="num">0:00</b><span>${doneN} / ${S.ex.length} 종목</span></div>
        <button class="wk-x" onclick="WorkoutMode.restSetting()">${pf.timer ? '휴식 ' + this._fmt(pf.rest) : '휴식 끔'}${pf.sound ? '' : ' · 무음'}</button>
      </div>
      <div class="wk-body">
        ${S.cur > 0 ? `<div class="wk-list wk-before">${li(0, S.cur)}</div>` : ''}
        <div class="wk-stage">${th ? `<div class="wk-pose">${ExMedia.poseHtml(th, esc(x.name))}</div>` : `<div class="wk-pose none">${typeof Icons !== 'undefined' ? Icons.svg('dumbbell') : ''}<span>자세 그림 준비 중</span></div>`}</div>
        <div class="wk-ex-tx">
          <div class="wk-n">${S.cur + 1}<i>/${S.ex.length}</i>${part ? `<span class="wk-part">${esc(part)}</span>` : ''}</div>
          <h2>${esc(x.name)}</h2><p>${esc(Fitness.setsLabel(x.sets || ''))}${x.sug ? ` · <em>${esc(x.sug)}</em>` : ''}</p>
          <div class="wk-tools">
            <button class="wk-tool" onclick="WorkoutMode.swap()">⇄ 운동 교체</button>
            <button class="wk-tool" onclick="WorkoutMode.addEx()">+ 운동 추가</button>
            <button class="wk-tool" onclick="WorkoutHistory.open('${A(x.name)}')">기록 · 그래프</button>
            ${em ? `<button class="wk-tool" onclick="ExMedia.open('${A(x.name)}')">자세 요령</button>` : ''}
            ${S.ex.length > 1 ? `<button class="wk-tool wk-tool-del" onclick="WorkoutMode.delEx(${S.cur}, this)">삭제</button>` : ''}
          </div>
        </div>
        ${x.cardio ? `<div class="wk-time"><button type="button" class="inp wk-num wk-tnum" onclick="WorkoutMode.pickTime()" aria-label="운동 시간 바꾸기"><b class="num">${Fitness.cardio(x.sets, x.name).min}</b><i>분</i></button>${(() => { const c = Fitness.cardio(x.sets, x.name); return (Fitness.isRun(x.name) || Fitness.isTread(x.name)) ? `<button type="button" class="inp wk-num wk-tnum" onclick="WorkoutMode.pickSpeed()" aria-label="속도 바꾸기"><b class="num">${c.kmh ? Fitness.speedTxt(x.name, c.kmh) : (Fitness.isTread(x.name) ? '속도' : '페이스')}</b></button>` : ''; })()}
          <p class="wk-note">세트 없이 시간으로 합니다. 숫자를 눌러 한 시간을 고치고, 끝나면 아래 ‘완료’ 를 눌러 주세요.</p></div>` : `
        <div class="wk-sets">
          <div class="wk-sh"><span>세트</span><span>kg</span><span>회</span><span></span></div>
          ${x.rows.map((r, k) => `<div class="wk-sw" data-k="${k}"><div class="wk-set${r.ok ? ' ok' : ''}${k === nowK ? ' now' : ''}">
            <span class="wk-k">${k + 1}</span>
            <button type="button" class="inp wk-num" onclick="WorkoutMode.pickVal(${k},'w')">${r.w !== '' && r.w != null ? r.w : '—'}</button>
            <button type="button" class="inp wk-num" onclick="WorkoutMode.pickVal(${k},'r')">${r.r !== '' && r.r != null ? r.r : '—'}</button>
            <button class="wk-ck" onclick="WorkoutMode.setDone(${k})" aria-label="${k + 1}세트 완료">${r.ok ? '✓' : ''}</button>
          </div><button class="wk-sdel" onclick="WorkoutMode.delSet(${k})">삭제</button></div>`).join('')}
          <div class="wk-row-btns"><button class="btn-sm" onclick="WorkoutMode.addSet()">+ 세트</button><span class="wk-hint">세트를 왼쪽으로 밀면 삭제</span></div>
        </div>`}
        ${S.cur < S.ex.length - 1 ? `<div class="wk-list wk-after">${li(S.cur + 1, S.ex.length)}</div>` : ''}
      </div>
      <div class="wk-bar">
        ${x.cardio || nowK < 0
          ? `<button class="wk-main" onclick="WorkoutMode.nextEx()">${S.ex.some((e, i) => i !== S.cur && !e.done) ? '이 운동 완료 · 다음 운동' : '마지막 운동 완료'}</button>`
          : `<button class="wk-main" onclick="WorkoutMode.setDone(${nowK})">${nowK + 1}세트 완료</button>`}
      </div>
      <div id="wkRest" class="wk-rest" hidden></div>`;
    if (keep) { const b1 = el.querySelector('.wk-body'); if (b1) b1.scrollTop = keep; }
    this._bindSwipe(el);
    this._bindHold(el);
    this._time();
    clearTimeout(this._lt); this._lt = setTimeout(() => this.live(), 300);
  },

  // 세트 줄을 왼쪽으로 밀면 그 세트를 지운다(마지막 세트가 아니라 민 세트)
  _bindSwipe(el) {
    el.querySelectorAll('.wk-sw').forEach(w => {
      const row = w.querySelector('.wk-set, .wk-li'); if (!row) return; let sx = 0, sy = 0, dx = 0, on = false;
      row.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; on = false; }, { passive: true });
      row.addEventListener('touchmove', e => {
        const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
        if (!on && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) on = true;
        if (!on) return;
        e.preventDefault(); dx = Math.min(0, Math.max(-96, mx)); row.style.transform = `translateX(${dx}px)`;
      }, { passive: false });
      row.addEventListener('touchend', () => {
        if (!on) return;
        if (dx < -48) { w.classList.add('open'); row.style.transform = 'translateX(-72px)'; } else { w.classList.remove('open'); row.style.transform = ''; }
      });
    });
  },

  _time() {
    const S = this.st; if (!S) return;
    if (!this._ic || Date.now() - this._ic > 5000) { this._ic = Date.now(); this._idleCheck(); if (!this.st) return; }
    const e = document.getElementById('wkEl'); if (e) { const t = this._fmt((Date.now() - S.t0) / 1000); if (e.textContent !== t) e.textContent = t; }   // 0.25초마다 돈다 — 바뀐 때만 쓴다
    const r = document.getElementById('wkRest');
    if (!r || !S.restEnd) return;
    const left = (S.restEnd - Date.now()) / 1000;
    if (left <= 0) { S.restEnd = 0; r.hidden = true; r.innerHTML = ''; this._end(); this.live(); return; }
    const sec = Math.ceil(left);
    if (left < 1.5 && !document.hidden && !this._nc && !this._nr) { this._nc = 1; this._cancelNotify(); }   // 화면이 켜져 있으면 앱이 직접 울린다(두 번 울리지 않게)
    if (sec <= this.COUNT && sec !== this._lastTick) { this._lastTick = sec; this._tickSound(); }
    r.hidden = false;
    const pct = Math.max(0, Math.min(1, left / (S.restTot || 1)));
    const big = r.querySelector('.wk-rb');
    if (big) { const t = this._fmt(left); if (big.textContent !== t) big.textContent = t; big.classList.toggle('last', sec <= this.COUNT); r.querySelector('.wk-rp').style.width = (pct * 100) + '%'; return; }
    r.innerHTML = `<div class="wk-rt">쉬는 시간</div><div class="wk-rb num">${this._fmt(left)}</div>
      <div class="wk-rtrack"><i class="wk-rp" style="width:${pct * 100}%"></i></div>
      <div class="wk-rnext">다음: ${esc(this._nextLabel())}</div>
      <div class="wk-rbtns"><button class="btn-sm" onclick="WorkoutMode.addRest(-10)">−10초</button>
        <button class="btn-sm accent" onclick="WorkoutMode.skipRest()">건너뛰기</button>
        <button class="btn-sm" onclick="WorkoutMode.addRest(10)">+10초</button></div>`;
  },
  _nextLabel() {
    const S = this.st, x = S.ex[S.cur], k = x.rows.findIndex(r => !r.ok);
    if (k >= 0) return `${x.name} ${k + 1}세트 · ${x.rows[k].w || '—'}kg × ${x.rows[k].r || '—'}회`;
    const n = S.ex.findIndex((e, i) => i > S.cur && !e.done);
    return n >= 0 ? S.ex[n].name : '마무리';
  },

  // 고친 세트와 그 아래 '아직 안 한' 세트를 같은 값으로. 위 세트는 건드리지 않는다.
  setVal(k, f, v) {
    const x = this.st.ex[this.st.cur], val = v === '' ? '' : Number(v);
    x.rows[k][f] = val;
    for (let j = k + 1; j < x.rows.length; j++) { if (!x.rows[j].ok) x.rows[j][f] = val; }
    this.paint(); this._persist();
  },
  // 무게·횟수: 키패드(소수점 포함) 또는 자릿수별 스크롤. 고른 방식은 계정에 남아 다음에도 그 방식으로 열린다.
  // 유산소·스포츠: 세트 대신 '몇 분' — 숫자판으로 고친다
  pickTime() {
    if (!this.st) return;
    const x = this.st.ex[this.st.cur];
    const c = Fitness.cardio(x.sets, x.name);
    const save = (m, kmh) => { x.sets = Fitness.cardioSets(x.name, m, kmh); this.paint(); this._persist(); };
    NumIn.open({ title: x.name + ' 시간', unit: '분', dec: false, cur: c.min,
      done: val => { const m = Math.max(1, Math.min(600, Math.round(Number(val) || 0))); if (!m) return;
        if (Fitness.isRun(x.name) || Fitness.isTread(x.name)) setTimeout(() => Fitness.speedSheet(x.name, c.kmh, k => save(m, k), () => save(m, c.kmh)), 250); else save(m, null); } });
  },
  pickSpeed() {
    if (!this.st) return;
    const x = this.st.ex[this.st.cur], c = Fitness.cardio(x.sets, x.name);
    Fitness.speedSheet(x.name, c.kmh, k => { x.sets = Fitness.cardioSets(x.name, c.min, k); this.paint(); this._persist(); }, () => {});
  },
  pickVal(k, f) {
    if (!this.st) return;
    const x = this.st.ex[this.st.cur], v = x.rows[k][f];
    NumIn.open({ title: `${k + 1}세트 ${f === 'w' ? '무게' : '횟수'}`, unit: f === 'w' ? 'kg' : '회', dec: f === 'w',
      cur: v !== '' && v != null ? v : (f === 'r' ? this._reps(x.sets) : ''),
      note: `아래 세트도 같은 ${f === 'w' ? '무게' : '횟수'}로 바뀝니다 (위 세트는 그대로)`,
      done: val => this.setVal(k, f, val) });
  },
  setDone(k) {
    const S = this.st, x = S.ex[S.cur], r = x.rows[k]; if (!r) return;
    r.ok = !r.ok;
    if (r.ok) { const m = VolTier.warn(x.name, x.rows.filter(q => q.ok), S.ds); if (m) App.showToast(m); }
    try { Haptic.success(); } catch (e) {}
    this._saveLog();
    if (r.ok) {
      if (x.rows.every(q => q.ok)) { this.nextEx(true); return; }
      this._rest();
    }
    this.paint(); this._persist();
  },
  addSet() {
    const x = this.st.ex[this.st.cur], l = x.rows[x.rows.length - 1] || {};
    x.rows.push({ w: l.w ?? '', r: l.r ?? '', ok: false }); this.paint(); this._persist();
  },
  // 운동 순서 바꾸기 — 목록의 운동을 꾹 누르면(0.4초) 진동과 함께 순서 창이 열리고, 그 운동이 이미 들려 있다.
  // 손을 떼지 않고 위아래로 끌어 옮기고, 떼면 그 자리로 저장하고 창이 닫힌다. 끝낸 운동도 옮길 수 있다.
  // 화면 목록은 지금 운동의 그림을 사이에 두고 위·아래로 나뉘어 있어서, 옮기는 건 한 줄로 이어진 창에서 한다.
  // 지금 하던 운동은 그대로 지금 운동으로 남는다. 끝낼 때 '오늘만 / 플랜에도' 를 묻는 건 기존 그대로.
  HOLD: 400,
  _bindHold(el) {
    el.querySelectorAll('.wk-li[data-i]').forEach(b => {
      let t = null, sx = 0, sy = 0, on = false;
      const clear = () => { clearTimeout(t); t = null; };
      b.addEventListener('pointerdown', e => {
        if (e.button > 0 || (this.st && this.st.ex.length < 2)) return;
        sx = e.clientX; sy = e.clientY; on = false; clear();
        t = setTimeout(() => { t = null; on = true; this._holdOn = true; this.order(Number(b.dataset.i), e.clientY); }, this.HOLD);
      });
      b.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
      b.addEventListener('pointerup', clear); b.addEventListener('pointercancel', clear);
      b.addEventListener('contextmenu', e => e.preventDefault());
      // 들고 있는 동안은 화면이 스크롤되지 않게, 손을 뗀 뒤의 '누름'(그 운동으로 가기)도 막는다
      b.addEventListener('touchmove', e => { if (on) e.preventDefault(); }, { passive: false });
      b.addEventListener('touchend', e => { if (on) { e.preventDefault(); on = false; } });
      b.addEventListener('click', e => { if (this._holdOn) { e.preventDefault(); e.stopImmediatePropagation(); this._holdOn = false; } }, true);
    });
  },
  order(i, y) {
    const S = this.st; if (!S || S.ex.length < 2) return;
    const th = n => { let t = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(n) : ''; return t ? `<span class="wko-th">${ExMedia.poseHtml(t, '')}</span>` : `<span class="wko-th none">${typeof Icons !== 'undefined' ? Icons.svg('dumbbell') : ''}</span>`; };
    const row = (e, k) => `<div class="wko-r${e.done ? ' done' : ''}${k === S.cur ? ' cur' : ''}" data-i="${k}">
        <span class="wko-n num">${k + 1}</span>${th(e.name)}<b>${esc(e.name)}</b>
        <i>${k === S.cur ? '지금' : e.done ? '완료' : e.rows.filter(r => r.ok).length + '/' + e.rows.length}</i>
        <span class="wko-h" aria-hidden="true">≡</span></div>`;
    // 팝업 창이 아니라 운동 화면 위에 바로 순서 화면을 깐다
    const host = document.getElementById('wkMode'); if (!host) return;
    host.querySelector('.wko-ov')?.remove();
    const ov = document.createElement('div'); ov.className = 'wko-ov';
    ov.innerHTML = `<div class="wko-hd"><b>순서 바꾸기</b><span>끌어서 옮기고 손을 떼면 저장됩니다</span></div>
      <div class="wko" id="wkOrd">${S.ex.map(row).join('')}</div>`;
    host.appendChild(ov);
    const box = ov.querySelector('#wkOrd');
    try { Haptic.medium(); } catch (er) {}
    const num = () => box.querySelectorAll('.wko-r').forEach((r, k) => { r.querySelector('.wko-n').textContent = k + 1; });
    const drag = box.querySelector(`.wko-r[data-i="${i}"]`); if (!drag) return;
    let sy = y, base = 0;
    drag.classList.add('drag'); box.classList.add('dragging');
    const move = e => {
      e.preventDefault();
      let dy = e.clientY - sy - base;
      const hgt = drag.offsetHeight, prev = drag.previousElementSibling, next = drag.nextElementSibling;
      if ((dy < -hgt / 2 && prev) || (dy > hgt / 2 && next)) {
        const t0 = drag.offsetTop;
        if (dy < 0) box.insertBefore(drag, prev); else box.insertBefore(next, drag);
        const sh = drag.offsetTop - t0; base += sh; dy -= sh; num();   // 실제로 옮겨 간 거리만큼(줄 사이 간격 포함) 기준을 옮긴다
        try { Haptic.light(); } catch (er) {}
      }
      drag.style.transform = `translateY(${dy}px)`;
    };
    const tmove = e => { if (e.touches && e.touches[0]) move({ clientY: e.touches[0].clientY, preventDefault: () => e.preventDefault() }); };
    let fin = false;
    const pmove = e => { if (e.pointerType !== 'touch') move(e); }, pup = e => { if (e.pointerType !== 'touch') up(); };
    const up = () => {
      if (fin) return; fin = true;
      setTimeout(() => { this._holdOn = false; }, 400);
      document.removeEventListener('pointermove', pmove); document.removeEventListener('pointerup', pup); document.removeEventListener('pointercancel', pup);
      document.removeEventListener('touchmove', tmove); document.removeEventListener('touchend', up); document.removeEventListener('touchcancel', up);
      drag.style.transform = ''; drag.classList.remove('drag'); box.classList.remove('dragging');
      setTimeout(() => this._orderSave(), 120);
    };
    // 창이 열리는 동안 손가락은 원래 줄 위에 있다 — 문서 전체에서 따라간다(터치는 touchmove 로, 마우스는 pointermove 로)
    document.addEventListener('pointermove', pmove, { passive: false }); document.addEventListener('pointerup', pup); document.addEventListener('pointercancel', pup);
    document.addEventListener('touchmove', tmove, { passive: false }); document.addEventListener('touchend', up); document.addEventListener('touchcancel', up);
  },
  _orderSave() {
    const S = this.st, box = document.getElementById('wkOrd'); if (!S || !box) return;
    const idx = [...box.querySelectorAll('.wko-r')].map(r => Number(r.dataset.i));
    box.closest('.wko-ov')?.remove();
    if (idx.length === S.ex.length && idx.some((v, k) => v !== k)) {
      const curEx = S.ex[S.cur];
      S.ex = idx.map(i => S.ex[i]);
      S.cur = Math.max(0, S.ex.indexOf(curEx));
      this._persist(); this.paint();
      App.showToast('운동 순서를 바꿨습니다');
    }
  },
  // 운동 종목 빼기 — 목록에서 밀어서 '삭제', 또는 지금 운동의 '삭제' 단추(한 번 더 눌러 확인)
  delEx(i, btn) {
    const S = this.st; if (!S || !S.ex[i]) return;
    if (S.ex.length <= 1) { App.showToast('운동이 하나뿐이라 지울 수 없습니다 — 끝내기를 눌러 주세요'); this.paint(); return; }
    if (btn && !btn.classList.contains('arm')) {
      btn.classList.add('arm'); btn.textContent = '한 번 더 누르면 삭제';
      clearTimeout(this._dxT); this._dxT = setTimeout(() => { btn.classList.remove('arm'); btn.textContent = '삭제'; }, 3000);
      try { Haptic.light(); } catch (e) {} return;
    }
    const e = S.ex[i];
    S.ex.splice(i, 1);
    // 오늘 이 운동으로 남긴 기록도 지운다(운동 모드 들어오기 전부터 있던 기록은 그대로)
    { const L = PlanGen.log(S.ds); if (L[e.name] && !(S.snapLog || {})[e.name]) { delete L[e.name]; PlanGen.saveLog(S.ds, L); } }
    if (i < S.cur) S.cur--;
    else if (i === S.cur) { const n = S.ex.findIndex((q, k) => !q.done && k >= i); S.cur = n >= 0 ? n : Math.min(i, S.ex.length - 1); }
    try { Haptic.medium(); } catch (er) {}
    this.paint(); this._persist();
    App.showToast(`${e.name} 을(를) 뺐습니다`);
  },
  delSet(k) {
    const x = this.st.ex[this.st.cur];
    if (x.rows.length <= 1) { App.showToast('세트가 하나뿐이라 지울 수 없습니다'); this.paint(); return; }
    x.rows.splice(k, 1); this._saveLog(); this.paint(); this._persist();
  },

  _rest() {
    const S = this.st, pf = this.prefs();
    if (!pf.timer || !pf.rest) return;
    S.restEnd = Date.now() + pf.rest * 1000; S.restTot = pf.rest; this._lastTick = null; this._nc = 0;
    this._notify(pf.rest);
  },
  addRest(d) { const S = this.st; if (!S.restEnd) return; S.restEnd += d * 1000; S.restTot = Math.max(S.restTot + d, 1); this._notify((S.restEnd - Date.now()) / 1000); },
  skipRest() { const S = this.st; if (!S) return; S.restEnd = 0; const r = document.getElementById('wkRest'); if (r) { r.hidden = true; r.innerHTML = ''; } this._cancelNotify(); this.live(); },

  // 쉬는 시간 설정: 분 · 초(10초 단위) 두 줄 휠 + 타이머·소리 켜고 끄기 (계정에 저장)
  restSetting() {
    const pf = this.prefs();
    Wheel.open({ title: '쉬는 시간', unit: '',
      cols: [{ vals: Array.from({ length: 11 }, (_, i) => i), cur: Math.floor(pf.rest / 60), fmt: v => v + '분' },
             { vals: [0, 10, 20, 30, 40, 50], cur: Math.round((pf.rest % 60) / 10) * 10, fmt: v => String(v).padStart(2, '0') + '초' }],
      extra: `<div class="set-item"><span class="set-tx"><b>쉬는 시간 타이머</b><small>세트를 끝내면 바로 카운트다운</small></span>${Settings._sw(pf.timer, "WorkoutMode._pref('timer')")}</div>
        <div class="set-item"><span class="set-tx"><b>타이머 소리</b><small>3초 전 째깍 · 끝나면 2초 알림음 (앱을 내려 둬도)</small></span>${Settings._sw(pf.sound, "WorkoutMode._pref('sound')")}</div>`,
      done: ([m, sec]) => { this.setPrefs({ rest: Math.max(10, m * 60 + sec) }); this.paint(); } });
  },
  _pref(k) {
    this.setPrefs({ [k]: !this.prefs()[k] });
    const sw = [...document.querySelectorAll('#modal .set-sw')][k === 'timer' ? 0 : 1];
    if (sw) { sw.classList.toggle('on'); sw.setAttribute('aria-checked', sw.classList.contains('on')); }
    if (k === 'timer' && !this.prefs().timer) this.skipRest();
    this.paint();
  },

  // ── 소리 ───────────────────────────────────
  _audio() { try { const C = window.AudioContext || window.webkitAudioContext; this._ac = this._ac || new C(); if (this._ac.state === 'suspended') this._ac.resume(); } catch (e) {} },
  _beep(f, dur, vol = 0.3, at = 0) {
    try {
      const ctx = this._ac; if (!ctx) return; const t = ctx.currentTime + at;
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  },
  // 아이폰은 앱이 직접 소리를 낸다(무음 스위치를 켜도 들리고, 듣던 음악과 같이 나온다). 그 밖은 웹 소리.
  _native(name) {
    const B = window.Capacitor?.Plugins?.BashyNative;
    if (!B || !B.playSound || window.Capacitor?.getPlatform?.() !== 'ios') return false;
    B.playSound({ name }).catch(() => {});
    return true;
  },
  _tickSound() {
    try { Haptic.light(); } catch (e) {}
    if (!this.prefs().sound || this._nr) return;   // 아이폰은 예약해 둔 소리가 울린다
    if (this._native('tick')) return;
    this._audio(); this._beep(1046, 0.08, 0.25);
  },
  _end() {
    try { Haptic.warn(); navigator.vibrate?.([300, 150, 300, 150, 300]); } catch (e) {}
    if (this.prefs().sound && !this._nr && !this._native('rest_end')) {   // 약 2초: 두 음을 네 번
      this._audio();
      for (let i = 0; i < 4; i++) { this._beep(880, 0.18, 0.35, i * 0.5); this._beep(1318, 0.22, 0.35, i * 0.5 + 0.2); }
    }
  },
  // 앱을 내려 둬도 쉬는 시간이 끝나면 울리게 기기 알림을 예약한다 (2초 알림음 · 무음이면 소리 없이)
  // 쉬는 시간 끝 소리
  //  · 아이폰: 앱이 오디오 엔진에 '3초 째깍 + 끝 알림음'을 예약한다 → 앱을 내려 둬도 알림 없이 소리만,
  //    끝나는 순간 잠금 화면·아일랜드도 흰 운동 시간으로 바뀐다. 이때는 화면 쪽 소리는 내지 않는다(두 번 울리지 않게).
  //  · 그 밖(안드로이드 등): 끝나는 시각에 알림 하나(끝 알림음). 화면이 켜져 있으면 앱이 직접 째깍·끝 소리를 낸다.
  COUNT: 3,
  async _notify(sec) {
    this._cancelNotify(); this._nc = 0; this._nr = false;
    const snd = this.prefs().sound;
    const B = window.Capacitor?.Plugins?.BashyNative;
    if (B && B.restSchedule && window.Capacitor?.getPlatform?.() === 'ios') {
      try { const r = await B.restSchedule({ endAt: Date.now() + sec * 1000, sound: snd }); this._nr = !!(r && r.ok); } catch (e) {}
      if (this._nr) { this.live(); return; }
    }
    const P = typeof LocalNotify !== 'undefined' && LocalNotify.P;
    if (P) {
      try {
        if (!this._chan && P.createChannel) { this._chan = 1; await P.createChannel({ id: 'rest', name: '쉬는 시간', importance: 5, sound: 'rest_end.wav', vibration: true, visibility: 1 }).catch(() => {}); }
        await P.schedule({ notifications: [{ id: 7997, title: '쉬는 시간 끝', body: this._nextLabel(), channelId: 'rest',
          sound: snd ? 'rest_end.wav' : undefined, schedule: { at: new Date(Date.now() + sec * 1000), allowWhileIdle: true } }] });
      } catch (e) {}
    }
    this.live();
  },
  _cancelNotify() {
    const P = typeof LocalNotify !== 'undefined' && LocalNotify.P; if (P) P.cancel({ notifications: [{ id: 7997 }] }).catch(() => {});
    const B = window.Capacitor?.Plugins?.BashyNative; if (this._nr && B && B.restCancel) B.restCancel().catch(() => {});
    this._nr = false;
  },

  // ── 잠금 화면 표시 ───────────────────────────
  // 아이폰: 라이브 액티비티(잠금 화면·다이내믹 아일랜드에 지금 운동 + 쉬는 시간 카운트다운)
  // 안드로이드: 상단 알림을 고정해 두고 운동이 바뀔 때마다 고쳐 쓴다
  _liveInfo() {
    const S = this.st; if (!S) return null;
    const x = S.ex[S.cur], k = x.rows.findIndex(r => !r.ok), r = x.rows[k >= 0 ? k : x.rows.length - 1] || {};
    const doneN = S.ex.filter(e => e.done).length;
    return { title: x.name, step: k >= 0 ? `${k + 1} / ${x.rows.length}세트` : '이 운동 끝',
      sub: `${r.w ? r.w + 'kg × ' : ''}${r.r || '—'}회 · ${doneN + 1}/${S.ex.length} 종목`,
      restEnd: S.restEnd || 0, startedAt: S.t0 };
  },
  live() {
    const info = this._liveInfo(); if (!info) return;
    const B = window.Capacitor?.Plugins?.BashyNative;
    if (B && B.liveStart && window.Capacitor?.getPlatform?.() === 'ios') {
      (this._liveOn ? B.liveUpdate(info) : B.liveStart(info).then(r => { this._liveOn = !!(r && r.ok); })).catch(() => {});
      return;
    }
    const P = typeof LocalNotify !== 'undefined' && LocalNotify.P;
    if (P && window.Capacitor?.getPlatform?.() === 'android') {
      const left = info.restEnd > Date.now() ? ` · 쉬는 시간 ${this._fmt((info.restEnd - Date.now()) / 1000)} 남음` : '';
      P.schedule({ notifications: [{ id: 7996, title: `${info.title} · ${info.step}`, body: info.sub + left, ongoing: true, autoCancel: false, channelId: 'workout', silent: true }] }).catch(() => {});
    }
  },
  liveEnd() {
    this._liveOn = false;
    const B = window.Capacitor?.Plugins?.BashyNative;
    if (B && B.liveEnd) B.liveEnd().catch(() => {});
    const P = typeof LocalNotify !== 'undefined' && LocalNotify.P;
    if (P) P.cancel({ notifications: [{ id: 7996 }] }).catch(() => {});
  },

  // ── 이동 · 교체 ─────────────────────────────
  go(i) { this.st.cur = i; this.skipRest(); this.paint(); this._persist(); },
  swap() {
    const S = this.st, x = S.ex[S.cur];
    const orig = x.orig && x.orig !== x.name ? x.orig : '';
    const alts = PlanGen.alternatives(orig || x.name).filter(a => a.n !== x.name && a.n !== orig);
    const eqn = a => ((PlanGen.EQUIP.find(([e]) => e === PlanGen.equipOf(a.n)) || [])[1] || '기구') + ' 필요';
    Fitness.pickOne({ title: '운동 교체', recLabel: `${x.name} 대신 — 추천`,
      head: orig ? `<p class="pg-note">원래 추천 운동은 <b>${esc(orig)}</b> 입니다. 맨 위에서 되돌릴 수 있습니다.</p>` : '',
      recommend: [...(orig ? [{ n: orig, small: '원래 추천 운동 · 되돌리기' }] : []), ...alts.map(a => ({ n: a.n, small: a.need ? eqn(a) : '' }))],
      exclude: [x.name], onPick: n => this._swapTo(n) });
  },
  _swapTo(n) {
    const S = this.st, x = S.ex[S.cur];
    if (!x.orig) x.orig = x.name;            // 처음 추천된 운동을 기억해 두었다가 되돌릴 수 있게
    const back = n === x.orig;
    const nw = PlanGen.nextWeight(n, x.sets, S.ds), prev = PlanGen.last(n, S.ds);
    { const L = PlanGen.log(S.ds); if (L[x.name] && !(S.snapLog || {})[x.name]) { delete L[x.name]; PlanGen.saveLog(S.ds, L); } }   // 바꾸기 전 이름으로 남은 기록은 지운다(새 이름으로 다시 저장)
    const wasT = !!x.cardio; x.cardio = PlanGen.timed(n); if (x.cardio !== wasT) { x.sets = Fitness.defSets(n); x.rows = x.cardio ? x.rows.slice(0, 1) : Array.from({ length: this._nSets(x.sets) }, () => ({ w: '', r: this._reps(x.sets), ok: false })); }
    x.name = n; x.th = ''; x.sug = PlanGen.suggest(n, x.sets, S.ds);
    x.rows = x.rows.map(r => r.ok ? r : { w: nw ?? (prev ? prev.sets[0].w : ''), r: r.r, ok: false });
    if (back) delete x.orig;
    this._saveLog();
    this.paint(); this._persist();
    App.showToast(back ? `원래 운동(${n})으로 되돌렸습니다` : `${n} 으로 바꿨습니다`, 'success');
  },
  // 운동 중에 종목 하나 더 — 지금 운동 바로 뒤에 넣는다
  addEx() {
    const favs = Fitness.getFavs();
    Fitness.pickOne({ title: '운동 추가', recLabel: favs.length ? '즐겨찾기' : '', recommend: favs.map(n => ({ n })), onPick: n => {
      const S = this.st, ds = S.ds, sets = Fitness.defSets(n);
      const prev = PlanGen.last(n, ds), nw = PlanGen.nextWeight(n, sets, ds), cardio = PlanGen.timed(n);
      const e = { name: n, sets, key: 'n' + Date.now().toString(36), sess: S.ex[S.cur]?.sess, th: '', cardio, done: false, sug: PlanGen.suggest(n, sets, ds),
        rows: Array.from({ length: cardio ? 1 : this._nSets(sets) }, (_, k) => { const P = prev && prev.sets[Math.min(k, prev.sets.length - 1)];
          return { w: nw ?? (P ? P.w : ''), r: nw != null ? this._reps(sets) : (P ? P.r : this._reps(sets)), ok: false }; }) };
      S.ex.splice(S.cur + 1, 0, e);
      this.paint(); this._persist();
      App.showToast(`${n} 을(를) 다음 운동으로 넣었습니다`, 'success');
    } });
  },
  nextEx(auto) {
    const S = this.st, x = S.ex[S.cur];
    x.done = true; this._saveLog(); this._check();
    const n = S.ex.findIndex((e, i) => !e.done && i > S.cur), m = n >= 0 ? n : S.ex.findIndex(e => !e.done);
    if (m < 0) { this._finishSave(); return; }
    S.cur = m;
    if (auto) this._rest();
    this.paint(); this._persist();
  },

  _saveLog() {
    const S = this.st, L = PlanGen.log(S.ds);
    S.ex.forEach(e => {
      if (e.cardio) return;
      const ok = e.rows.filter(r => r.ok && Number(r.r) > 0).map(r => ({ w: Number(r.w) || 0, r: Number(r.r) }));
      if (ok.length) L[e.name] = ok; else if (!(S.snapLog || {})[e.name]) delete L[e.name];
    });
    PlanGen.saveLog(S.ds, L);
  },
  _check() {
    const S = this.st, d = new Date(S.ds + 'T00:00:00');
    const list = Fitness.exercisesFor(d).list;
    const chk = new Set(Fitness._checked(d));
    S.ex.forEach(e => { if (!e.done) return; const i = list.findIndex(x => x.key === e.key || x.name === e.name); if (i >= 0) chk.add(i); });
    Fitness._save([...chk], d);
  },

  // ── 끝내기 ─────────────────────────────────
  // 끝내기: 아래에서 올라오는 작은 시트 하나 — 저장이 기본, 지우기는 한 번 더 눌러야 한다
  finish() {
    const S = this.st; if (!S) return;
    const sets = S.ex.reduce((t, e) => t + e.rows.filter(r => r.ok).length, 0);
    const done = S.ex.filter(e => e.done).length;
    document.getElementById('wkEnd')?.remove();
    const el = document.createElement('div');
    el.id = 'wkEnd'; el.className = 'wk-end';
    el.innerHTML = `<div class="wk-end-bg" onclick="WorkoutMode._endClose()"></div>
      <div class="wk-end-sh" role="dialog" aria-label="운동 끝내기">
        <div class="wk-end-t">운동을 끝낼까요?</div>
        <div class="wk-end-m"><span class="num">${this._fmt((Date.now() - S.t0) / 1000)}</span><i></i><span><b class="num">${sets}</b>세트</span><i></i><span><b class="num">${done}/${S.ex.length}</b>종목</span></div>
        <button class="wk-end-go" onclick="WorkoutMode._endClose();WorkoutMode._finishSave()">저장하고 끝내기</button>
        <div class="wk-end-row">
          <button class="wk-end-ghost" onclick="WorkoutMode._endClose()">계속하기</button>
          <button class="wk-end-del" id="wkEndDel" onclick="WorkoutMode._endDiscard(this)">기록 지우고 끝내기</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
  },
  _endClose() { const el = document.getElementById('wkEnd'); if (!el) return; el.classList.remove('on'); setTimeout(() => el.remove(), 200); },
  _endDiscard(b) {
    if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = '한 번 더 누르면 지웁니다'; clearTimeout(this._armT); this._armT = setTimeout(() => { b.classList.remove('arm'); b.textContent = '기록 지우고 끝내기'; }, 3000); return; }
    this._endClose(); this._finishDiscard();
  },
  pause() { this._persist(); this._stop(); this.close(); App.showToast('운동을 남겨 두었습니다 — ‘운동 시작’ 으로 이어 하기'); try { Fitness.render(new Date(this._lastDs + 'T00:00:00')); } catch (e) {} },
  _stop() { clearInterval(this._tick); this._cancelNotify(); this._idleCancel(); this.liveEnd(); try { this._lock?.release(); } catch (e) {} this._lastDs = this.st && this.st.ds; },
  _finishDiscard() {
    const S = this.st; if (!S) return;
    PlanGen.saveLog(S.ds, S.snapLog || {});
    Fitness._save(S.snapChk || [], new Date(S.ds + 'T00:00:00'));
    if (S.snapSwap != null) UserStore.set(PlanGen.SWAP_PREFIX + S.ds, S.snapSwap);   // 이번에 바꾼 운동도 되돌린다
    if (S.snapDay != null) UserStore.set(Fitness._dayKey(S.ds), S.snapDay);
    window.FirebaseSync?.scheduleSave?.();
    this._clearSaved(); this._stop(); this.st = null; this.close();
    try { Fitness.render(new Date(S.ds + 'T00:00:00')); } catch (e) {}
    App.showToast('이번 운동은 저장하지 않았습니다');
  },
  // 시작할 때와 목록(종목·순서)이 달라졌으면 '오늘만 / 플랜에도' 를 먼저 묻는다
  _finishSave() {
    const S = this.st; if (!S) return;
    const now = S.ex.map(e => e.name);
    if (!S._scoped && S.planNames && now.join('|') !== S.planNames.join('|')) {
      Fitness.askScope(S.ds, scope => {
        if (!scope) return;   // 취소 — 운동 화면 그대로
        S._scoped = true;
        App.showToast(Fitness.applyList(S.ds, S.ex.map(e => ({ name: e.name, sets: e.sets, sess: e.sess })), scope), 'success');
        this._finishSave();
      });
      return;
    }
    this._saveLog(); this._check();
    // 다 못 끝냈으면 진행 상황을 남겨 둔다 — 같은 날 '운동 시작' 을 다시 누르면 이어서(시간도 이어서) 한다
    const left = S.ex.some(e => !e.done && e.rows.some(r => !r.ok));
    if (left) { S.restEnd = 0; this._persist(); } else this._clearSaved();
    this._stop();
    const min = Math.round(((S.endAt || Date.now()) - S.t0) / 60000);
    const vol = S.ex.reduce((t, e) => t + e.rows.filter(r => r.ok).reduce((a, r) => a + (Number(r.w) || 0) * (Number(r.r) || 0), 0), 0);
    const sets = S.ex.reduce((t, e) => t + e.rows.filter(r => r.ok).length, 0);
    const el = document.getElementById('wkMode');
    if (el) el.innerHTML = `<div class="wk-done">
      <div class="wk-dt">오늘 운동 끝</div>
      <div class="wk-dn"><div><b class="num">${min}</b><span>분</span></div><div><b class="num">${sets}</b><span>세트</span></div><div><b class="num">${Math.round(vol).toLocaleString('ko-KR')}</b><span>kg 볼륨</span></div></div>
      <p>${S.ex.filter(e => e.done).length} / ${S.ex.length} 종목 완료 · 무게와 횟수는 기록에 남았고, 다음 운동에서 권장 무게로 이어집니다.${S.ex.some(e => !e.done) ? ' 남은 운동은 오늘 ‘운동 시작’ 을 누르면 이어서 할 수 있습니다.' : ''}</p>
      <button class="wk-main" onclick="WorkoutMode.close()">닫기</button></div>`;
    try { Haptic.success(); } catch (e) {}
    this.st = null;
    try { Fitness.render(new Date(S.ds + 'T00:00:00')); } catch (e) {}
  },
  close() { const el = document.getElementById('wkMode'); if (el) { el.hidden = true; el.innerHTML = ''; } document.body.classList.remove('wk-on'); },
};

// 앱을 내렸다 올리면 아이폰 웹뷰가 고정 화면(운동 모드)을 배경색만 남기고 비워 두는 일이 있다(검은 화면).
// 돌아올 때마다 운동 화면을 다시 띄우고 다시 그린다 — 보던 자리는 그대로.
WorkoutMode._wake = function () {
  if (!this.st) return;
  const el = document.getElementById('wkMode'); if (!el) return;
  if (el.hidden) return;
  document.body.classList.add('wk-on');
  this.paint();
  el.style.transform = 'translateZ(0)'; requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = ''; }));
  clearInterval(this._tick); this._tick = setInterval(() => this._time(), 250);
  try { navigator.wakeLock?.request('screen').then(l => { this._lock = l; }).catch(() => {}); } catch (e) {}
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && WorkoutMode.st) { WorkoutMode._time(); setTimeout(() => WorkoutMode._wake(), 60); } });
window.addEventListener('pageshow', () => setTimeout(() => WorkoutMode._wake(), 60));
try { window.Capacitor?.Plugins?.App?.addListener?.('appStateChange', s => { if (s && s.isActive) setTimeout(() => WorkoutMode._wake(), 120); }); } catch (e) {}

// 잠금 화면·다이내믹 아일랜드·애플 워치의 운동 단추 (아이폰 앱) — 세트 완료 / +30초 / 쉬는 시간 건너뛰기
WorkoutMode.remote = function (act) {
  const S = this.st; if (!S) return;
  try {
    if (act === 'skip') return this.skipRest();
    if (act === 'add30' || act === 'add10') return S.restEnd ? this.addRest(10) : undefined;
    if (act === 'sub10') return S.restEnd ? this.addRest(-10) : undefined;
    if (act === 'done') {
      const x = S.ex[S.cur], k = x.rows.findIndex(r => !r.ok);
      if (x.cardio || k < 0) this.nextEx(true); else this.setDone(k);
    }
  } catch (e) { console.warn('[운동 단추]', e); }
};
(function bindWorkoutRemote() {
  const B = window.Capacitor?.Plugins?.BashyNative;
  if (!B || !B.addListener || window.Capacitor?.getPlatform?.() !== 'ios') return;
  B.addListener('workoutAction', d => WorkoutMode.remote(d && d.act));
})();


// ── 숫자 휠 (아이폰 시간 고르기처럼 굴려서 고르기) ─────────────────
// 칸마다 따로 굴린다. 가운데 줄이 고른 값. 한 칸 넘어갈 때마다 '틱' 진동과 짧은 소리.
// 위아래로 갈수록 원통에 감긴 것처럼 기울고 흐려진다(rotateX).
const Wheel = {
  H: 40,   // 한 줄 높이
  open(o) {
    this.o = o;
    const cols = o.cols.map((c, ci) => `<div class="whl-col" data-c="${ci}"><div class="whl-sc">
        <div class="whl-pad"></div>${c.vals.map((v, i) => `<div class="whl-it" data-i="${i}">${esc(c.fmt ? c.fmt(v) : String(v))}</div>`).join('')}<div class="whl-pad"></div>
      </div></div>`).join('');
    App.openModal('@clock ' + o.title, `
      <div class="whl">${cols}${o.unit ? `<div class="whl-unit">${esc(o.unit)}</div>` : ''}<div class="whl-sel" aria-hidden="true"></div></div>
      ${o.note ? `<p class="pg-note whl-note">${esc(o.note)}</p>` : ''}
      ${o.extra || ''}
      <div class="modal-btns"><button class="btn-sm" onclick="Wheel.cancel()">취소</button><button class="btn-sm accent" onclick="Wheel.ok()">확인</button></div>`);
    requestAnimationFrame(() => {
      document.querySelectorAll('.whl-col').forEach((col, ci) => {
        const c = o.cols[ci], sc = col.querySelector('.whl-sc');
        let idx = Math.max(0, c.vals.indexOf(c.cur)); if (idx < 0) idx = 0;
        sc.scrollTop = idx * this.H; col._i = idx; this.paint(col);
        sc.addEventListener('scroll', () => this.onScroll(col), { passive: true });
      });
    });
  },
  // 창을 새로 띄우지 않고 지금 화면 안에 휠을 그린다(습관 알림 시각처럼 폼 안에서 고를 때)
  inline(box, cols, onChange) {
    box.innerHTML = `<div class="whl whl-inline">${cols.map((c, ci) => `<div class="whl-col" data-c="${ci}"><div class="whl-sc">
        <div class="whl-pad"></div>${c.vals.map((v, i) => `<div class="whl-it" data-i="${i}">${esc(c.fmt ? c.fmt(v) : String(v))}</div>`).join('')}<div class="whl-pad"></div>
      </div></div>`).join('')}<div class="whl-sel" aria-hidden="true"></div></div>`;
    const read = () => [...box.querySelectorAll('.whl-col')].map((col, ci) => { const c = cols[ci]; return c.vals[Math.max(0, Math.min(c.vals.length - 1, Math.round(col.querySelector('.whl-sc').scrollTop / this.H)))]; });
    requestAnimationFrame(() => box.querySelectorAll('.whl-col').forEach((col, ci) => {
      const c = cols[ci], sc = col.querySelector('.whl-sc');
      const idx = Math.max(0, c.vals.indexOf(c.cur));
      sc.scrollTop = idx * this.H; col._i = idx; this.paint(col);
      col._cb = () => onChange && onChange(read());
      sc.addEventListener('scroll', () => this.onScroll(col), { passive: true });
    }));
    return read;
  },
  onScroll(col) {
    const sc = col.querySelector('.whl-sc');
    const i = Math.round(sc.scrollTop / this.H);
    if (i !== col._i) { col._i = i; this.tick(); if (col._cb) col._cb(); }
    if (!col._raf) col._raf = requestAnimationFrame(() => { col._raf = 0; this.paint(col); });
  },
  // 가운데에서 멀수록 기울이고 흐리게 — 원통(드럼)이 도는 느낌
  paint(col) {
    const sc = col.querySelector('.whl-sc'), pos = sc.scrollTop / this.H;
    col.querySelectorAll('.whl-it').forEach(el => {
      const d = Number(el.dataset.i) - pos, ad = Math.min(Math.abs(d), 3);
      el.style.transform = `rotateX(${Math.max(-75, Math.min(75, -d * 22))}deg) scale(${1 - ad * 0.06})`;
      el.style.opacity = String(Math.max(0.12, 1 - ad * 0.32));
      el.classList.toggle('on', Math.abs(d) < 0.5);
    });
  },
  tick() {
    try { Haptic.select(); } catch (e) {}
    try {
      const W = WorkoutMode; if (!W.prefs().sound) return;
      W._audio(); const ctx = W._ac; if (!ctx) return;
      // 짧은 딸깍: 아주 짧은 잡음 + 높은 음
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.03);
    } catch (e) {}
  },
  cancel() { App.closeModal(); if (this.o && this.o.cancel) this.o.cancel(); },
  ok() {
    const vals = [...document.querySelectorAll('.whl-col')].map((col, ci) => {
      const c = this.o.cols[ci], i = Math.max(0, Math.min(c.vals.length - 1, Math.round(col.querySelector('.whl-sc').scrollTop / this.H)));
      return c.vals[i];
    });
    try { Haptic.light(); } catch (e) {}
    App.closeModal();
    try { this.o.done(vals); } catch (e) { console.warn(e); }
  },
};


// ── 숫자 입력 (무게·횟수) ──────────────────────────
// 키패드: 1~9 · 0 · 소수점 · 지우기. 처음 누르면 원래 값을 바꿔 쓴다.
// 스크롤: 자릿수마다 따로 굴린다 — 무게는 100 · 10 · 1 · 소수점, 횟수는 10 · 1.
// 위의 '키패드 / 스크롤' 을 바꾸면 그 사람은 다음부터 그 방식으로 열린다(계정에 저장).
const NumIn = {
  DEC: [0, 0.25, 0.5, 0.75],
  open(o) {
    this.o = o; this.s = o.cur !== '' && o.cur != null ? String(+o.cur) : ''; this.fresh = true;
    this.mode = WorkoutMode.prefs().numIn === 'wheel' ? 'wheel' : 'pad';
    // 다른 창(식단 담기 등) 위에서도 열리도록 자기 시트로 띄운다 — 아래 창은 그대로 남는다
    document.getElementById('niOv')?.remove();
    const ov = document.createElement('div'); ov.id = 'niOv'; ov.className = 'mx-ov ni-ov';
    ov.innerHTML = `<div class="mx-sh ni-sh" role="dialog" aria-label="${esc(o.title)}"><div class="ni-hd"><b>${esc(o.title)}</b></div><div class="ni">
      <div class="ni-seg"><button type="button" data-m="pad">키패드</button><button type="button" data-m="wheel">스크롤</button></div>
      <div class="ni-disp"><b class="num" id="niV"></b><span>${esc(o.unit || '')}</span></div>
      <div id="niBody"></div>
      ${o.note ? `<p class="pg-note ni-note">${esc(o.note)}</p>` : ''}
      <div class="modal-btns"><button class="btn-sm" onclick="NumIn.close()">취소</button><button class="btn-sm accent" onclick="NumIn.ok()">확인</button></div></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) this.close(); });
    requestAnimationFrame(() => ov.classList.add('on'));
    document.querySelectorAll('.ni-seg button').forEach(b => { b.onclick = () => this.setMode(b.dataset.m); });
    this.paint();
  },
  setMode(m) {
    if (m === this.mode) return;
    this.mode = m; this.fresh = true; WorkoutMode.setPrefs({ numIn: m });
    try { Haptic.light(); } catch (e) {}
    this.paint();
  },
  _show() { const v = document.getElementById('niV'); if (v) { v.textContent = this.s === '' ? '0' : this.s; v.classList.toggle('dim', this.s === ''); } },
  paint() {
    document.querySelectorAll('.ni-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === this.mode));
    const box = document.getElementById('niBody'); if (!box) return;
    this._show();
    if (this.mode === 'pad') {
      const K = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
      box.innerHTML = `<div class="ni-pad">${K.map(k => `<button type="button" class="ni-k${k === '⌫' ? ' fn' : ''}" ${k === '.' && !this.o.dec ? 'disabled' : ''} data-k="${k}" aria-label="${k === '⌫' ? '지우기' : k === '.' ? '소수점' : k}">${k}</button>`).join('')}</div>`;
      box.querySelectorAll('.ni-k').forEach(b => { b.onclick = () => this.key(b.dataset.k); });
      return;
    }
    const v = Math.max(0, Number(this.s) || 0), I = Math.floor(v), D = v - I;
    const dg = (n) => Array.from({ length: 10 }, (_, i) => i);
    const cols = this.o.dec
      ? [{ vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], cur: Math.floor(I / 100) % 10, fmt: x => x + '' },
         { vals: dg(), cur: Math.floor(I / 10) % 10 },
         { vals: dg(), cur: I % 10 },
         { vals: this.DEC, cur: this.DEC.reduce((a, b) => Math.abs(b - D) < Math.abs(a - D) ? b : a, 0), fmt: x => '.' + String(x).slice(2).padEnd(1, '0') }]
      : [{ vals: dg(), cur: Math.floor(I / 10) % 10 }, { vals: dg(), cur: I % 10 }];
    box.innerHTML = `<div class="ni-wh${this.o.dec ? ' w4' : ''}"></div><div class="ni-lab${this.o.dec ? ' w4' : ''}">${(this.o.dec ? ['100', '10', '1', '소수점'] : ['10', '1']).map(t => `<span>${t}</span>`).join('')}</div>`;
    Wheel.inline(box.querySelector('.ni-wh'), cols, vals => {
      const n = this.o.dec ? vals[0] * 100 + vals[1] * 10 + vals[2] + vals[3] : vals[0] * 10 + vals[1];
      this.s = String(+n.toFixed(2)); this._show();
    });
  },
  key(k) {
    if (k === '⌫') { this.fresh = false; this.s = this.s.slice(0, -1); this._show(); try { Haptic.select(); } catch (e) {} return; }
    let s = this.fresh ? '' : this.s; this.fresh = false;
    if (k === '.') { if (!this.o.dec || s.includes('.')) return; s = (s || '0') + '.'; }
    else {
      if (s.includes('.') && s.split('.')[1].length >= 2) return;
      if (!s.includes('.') && s.replace(/^0/, '').length >= 3) return;
      s = s === '0' ? k : s + k;
    }
    this.s = s; this._show();
    try { Haptic.select(); } catch (e) {}
  },
  close() { const ov = document.getElementById('niOv'); if (!ov) return; ov.classList.remove('on'); setTimeout(() => ov.remove(), 200); },
  ok() {
    let v = this.s.replace(/\.$/, ''); v = v === '' ? '' : Number(v);
    if (v !== '' && !(v >= 0)) v = '';
    this.close();
    try { Haptic.light(); } catch (e) {}
    try { this.o.done(v); } catch (e) { console.warn(e); }
  },
};

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
