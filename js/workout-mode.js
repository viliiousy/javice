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
    p.places.push({ id, name: name.trim().slice(0, 20), equip: PlanGen.ALL_EQUIP.slice() });
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
  // 기록 보기(카드 아래): 운동한 날들을 최근부터 — 종목을 누르면 그 운동의 그래프
  openAll() {
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
    App.openModal('@chart 운동 기록', days.length ? `
      <div class="wh-stats">
        <div><b class="num">${m30.length}</b><span>최근 30일 운동한 날</span></div>
        <div><b class="num">${k(m30.reduce((t, x) => t + vol(x.L), 0))}</b><span>30일 볼륨 kg</span></div>
        <div><b class="num">${days[0].ds.slice(5).replace('-', '/')}</b><span>마지막</span></div></div>
      <div class="wh-days">${days.map(x => `<div class="wh-day">
        <div class="wh-dh"><b class="num">${x.ds.slice(5).replace('-', '/')}</b><span>${DOW[x.d.getDay()]}</span><i class="num">${k(vol(x.L))}kg</i></div>
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
    return { rest: v.rest >= 0 ? v.rest : (Number(localStorage.getItem('gl_rest_sec')) || this.REST[g] || 90), timer: v.timer !== false, sound: v.sound !== false };
  },
  setPrefs(patch) { UserStore.set(this.PREF_KEY, JSON.stringify({ ...this.prefs(), ...patch })); window.FirebaseSync?.scheduleSave?.(); },
  restSec() { return this.prefs().rest; },
  _nSets(sets) { const m = String(sets || '').match(/^(\d+)\s*[×x]/i); return m ? Math.min(10, +m[1]) : 3; },
  _reps(sets) { const r = PlanGen._range(sets); return r[1] || r[0] || 10; },
  _fmt(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },

  saved() { try { return JSON.parse(UserStore.get(this.SESSION_KEY) || 'null'); } catch { return null; } },
  _persist() {
    const S = this.st; if (!S) return;
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
    this.st = sv; this.st.restEnd = 0;
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
    const x = S.ex[S.cur], pf = this.prefs();
    const em = typeof ExMedia !== 'undefined' ? ExMedia.find(x.name) : null;
    let th = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(x.name) : '';
    if (!th) th = x.th || '';
    const part = PlanGen.partOf(x.name) || (em && em.part) || '';
    const doneN = S.ex.filter(e => e.done).length;
    const A = v => esc(v).replace(/'/g, '&#39;');
    const nowK = x.rows.findIndex(q => !q.ok);
    // 운동 순서: 지금 운동 앞의 것은 위에, 뒤의 것은 아래에 (예: 3번째면 1·2 → 지금 운동 → 4·5·6·7)
    const li = (a, b) => S.ex.slice(a, b).map((e, j) => { const i = a + j; return `<button class="wk-li${e.done ? ' done' : ''}" onclick="WorkoutMode.go(${i})">
          <span>${i + 1}</span><b>${esc(e.name)}</b><i>${e.done ? '완료' : e.rows.filter(r => r.ok).length + '/' + e.rows.length}</i></button>`; }).join('');
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
          <h2>${esc(x.name)}</h2><p>${esc(x.sets || '')}${x.sug ? ` · <em>${esc(x.sug)}</em>` : ''}</p>
          <div class="wk-tools">
            <button class="wk-tool" onclick="WorkoutMode.swap()">⇄ 운동 교체</button>
            <button class="wk-tool" onclick="WorkoutMode.addEx()">+ 운동 추가</button>
            <button class="wk-tool" onclick="WorkoutHistory.open('${A(x.name)}')">기록 · 그래프</button>
            ${em ? `<button class="wk-tool" onclick="ExMedia.open('${A(x.name)}')">자세 요령</button>` : ''}
          </div>
        </div>
        ${x.cardio ? `<p class="wk-note">${esc(x.sets || '시간')} — 세트 없이 시간으로 합니다. 끝나면 아래 ‘완료’ 를 눌러 주세요.</p>` : `
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
    this._bindSwipe(el);
    this._time();
    clearTimeout(this._lt); this._lt = setTimeout(() => this.live(), 300);
  },

  // 세트 줄을 왼쪽으로 밀면 그 세트를 지운다(마지막 세트가 아니라 민 세트)
  _bindSwipe(el) {
    el.querySelectorAll('.wk-sw').forEach(w => {
      const row = w.querySelector('.wk-set'); let sx = 0, sy = 0, dx = 0, on = false;
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
    const e = document.getElementById('wkEl'); if (e) e.textContent = this._fmt((Date.now() - S.t0) / 1000);
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
    if (big) { big.textContent = this._fmt(left); big.classList.toggle('last', sec <= this.COUNT); r.querySelector('.wk-rp').style.width = (pct * 100) + '%'; return; }
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
  // 무게·횟수는 숫자 휠로 고른다 (무게: 정수 + 0.5 단위 두 줄, 횟수: 한 줄)
  pickVal(k, f) {
    const x = this.st.ex[this.st.cur], cur = Number(x.rows[k][f]) || 0;
    if (f === 'w') {
      Wheel.open({ title: `${k + 1}세트 무게`, unit: 'kg',
        cols: [{ vals: Array.from({ length: 301 }, (_, i) => i), cur: Math.floor(cur) },
               { vals: [0, 0.5], cur: cur % 1 >= 0.5 ? 0.5 : 0, fmt: v => v ? '.5' : '.0' }],
        note: '아래 세트도 같은 무게로 바뀝니다 (위 세트는 그대로)',
        done: ([a, b]) => this.setVal(k, 'w', a + b) });
    } else {
      Wheel.open({ title: `${k + 1}세트 횟수`, unit: '회',
        cols: [{ vals: Array.from({ length: 61 }, (_, i) => i), cur: cur || this._reps(x.sets) }],
        note: '아래 세트도 같은 횟수로 바뀝니다 (위 세트는 그대로)',
        done: ([a]) => this.setVal(k, 'r', a) });
    }
  },
  setDone(k) {
    const S = this.st, x = S.ex[S.cur], r = x.rows[k]; if (!r) return;
    r.ok = !r.ok;
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
  _stop() { clearInterval(this._tick); this._cancelNotify(); this.liveEnd(); try { this._lock?.release(); } catch (e) {} this._lastDs = this.st && this.st.ds; },
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
    const min = Math.round((Date.now() - S.t0) / 60000);
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

document.addEventListener('visibilitychange', () => { if (!document.hidden && WorkoutMode.st) WorkoutMode._time(); });

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
  onScroll(col) {
    const sc = col.querySelector('.whl-sc');
    const i = Math.round(sc.scrollTop / this.H);
    if (i !== col._i) { col._i = i; this.tick(); }
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
