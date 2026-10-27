// js/workout-history.js — 운동 설정 창(FitSettings) · 운동 기록과 그래프(WorkoutHistory). workout-mode.js 에서 떼어 냄.

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
