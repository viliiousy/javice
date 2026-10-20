// js/workout-mode.js — 운동 설정 창 + 운동 모드(세트 기록 · 쉬는 시간 타이머)
//
// 운동 모드는 Hevy·플랜핏의 '운동 중 화면' 을 따랐다.
//   · 지금 할 운동 하나만 크게(자세 그림 · 목표 세트 · 지난번 기록과 오늘 권장 무게)
//   · 세트마다 무게·횟수 칸, 지난번 값이 미리 들어 있다 → 그대로면 '세트 완료' 만 누르면 된다
//   · 세트를 끝내면 쉬는 시간 타이머가 바로 돈다(±15초 · 건너뛰기). 끝나면 진동·소리, 앱이 뒤로 가 있으면 알림
//   · 위에는 전체 경과 시간, 아래에는 운동 목록(눌러서 건너뛰기)
//   · 끝내면 무게·횟수는 기록(PlanGen.log)에, 다 한 운동은 카드 체크에 들어간다
// 화면을 켜 둔다(Wake Lock). 다른 앱에 갔다 와도 타이머는 끝나는 시각으로 계산해 어긋나지 않는다.

const FitSettings = {
  open() {
    App.openModal('@dumbbell 운동 설정', `<div id="fsBody"></div>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`);
    this.paint();
  },
  paint() {
    const b = document.getElementById('fsBody'); if (!b) return;
    const p = PlanGen.profile() || { loc: 'gym', equip: [], exclude: [] };
    const have = new Set(PlanGen.have(p));
    const ex = p.exclude || [];
    const bans = PlanGen.bans();
    const chip = (on, label, fn) => `<button type="button" class="pg-c${on ? ' on' : ''}" onclick="${fn}">${label}</button>`;
    b.innerHTML = `
      <div class="pg-q"><div class="pg-t">루틴</div><div class="pg-cs">
        ${chip(false, '요일별 루틴 보기·바꾸기', 'App.closeModal();Fitness.showDayPlan()')}
        ${chip(false, '맞춤 플랜 다시 만들기', 'App.closeModal();PlanGen.open()')}
        ${chip(false, '루틴 직접 만들기', 'App.closeModal();Fitness.showRoutineEdit()')}</div></div>
      <div class="pg-q"><div class="pg-t">운동하는 곳</div><div class="pg-cs">
        ${[['gym', '헬스장'], ['home', '집 (기구 있음)'], ['body', '집 (맨몸)']].map(([v, l]) => chip((p.loc || 'gym') === v, l, `FitSettings.setLoc('${v}')`)).join('')}</div></div>
      <div class="pg-q"><div class="pg-t">가진 기구<small>${p.loc === 'gym' || !p.loc ? '헬스장은 모든 기구가 있는 것으로 봅니다' : '눌러서 있음/없음을 바꿉니다'}</small></div><div class="pg-cs">
        ${PlanGen.EQUIP.map(([e, l]) => chip(have.has(e) || ex.includes(e) && (p.loc === 'gym' || !p.loc), l, `FitSettings.toggleHave('${e}')`)).join('')}</div></div>
      <div class="pg-q"><div class="pg-t">추천하지 않을 기구<small>있어도 쓰기 싫은 기구 — 플랜·교체·운동 추가 목록에서 뺍니다</small></div><div class="pg-cs">
        ${PlanGen.EQUIP.map(([e, l]) => chip(ex.includes(e), l, `FitSettings.toggleEx('${e}')`)).join('')}</div></div>
      <div class="pg-q"><div class="pg-t">추천하지 않는 운동<small>${bans.length ? '눌러서 다시 추천받기' : '운동 교체 창에서 ‘앞으로 추천하지 않기’ 를 고르면 여기에 모입니다'}</small></div><div class="pg-cs">
        ${bans.map((n, i) => chip(true, esc(n) + ' ✕', `FitSettings.unban(${i})`)).join('')}</div></div>
      <p class="pg-note">바꾼 기구 설정은 다음 플랜·교체·운동 추가부터 적용됩니다. 지금 루틴에 바로 반영하려면 ‘맞춤 플랜 다시 만들기’ 를 눌러 주세요.</p>`;
  },
  _save(patch) {
    const p = { goal: 'muscle', level: 'beg', loc: 'gym', days: 3, mins: 60, equip: [], focus: [], cardio: false, injury: [], exclude: [], ...(PlanGen.profile() || {}), ...patch };
    PlanGen.saveProfile(p); this.paint();
  },
  setLoc(v) { this._save({ loc: v }); },
  toggleHave(e) {
    const p = PlanGen.profile() || {};
    if (!p.loc || p.loc === 'gym') { App.showToast('헬스장은 모든 기구가 있습니다 — 쓰기 싫은 기구는 아래 ‘추천하지 않을 기구’ 에서 빼 주세요'); return; }
    const eq = p.equip || [];
    this._save({ equip: eq.includes(e) ? eq.filter(x => x !== e) : eq.concat(e) });
  },
  toggleEx(e) { const ex = (PlanGen.profile() || {}).exclude || []; this._save({ exclude: ex.includes(e) ? ex.filter(x => x !== e) : ex.concat(e) }); },
  unban(i) {
    const b = PlanGen.bans(); const n = b.splice(i, 1)[0];
    UserStore.set(PlanGen.BAN_KEY, JSON.stringify(b)); window.FirebaseSync?.scheduleSave?.();
    App.showToast(`${n} — 다시 추천합니다`, 'success'); this.paint();
  },
};

const WorkoutMode = {
  REST: { strength: 150, muscle: 90, lose: 45, health: 60 },
  st: null,

  restSec() {
    const v = Number(localStorage.getItem('gl_rest_sec'));
    if (v >= 15) return v;
    const g = (PlanGen.profile() || {}).goal;
    return this.REST[g] || 90;
  },
  _nSets(sets) { const m = String(sets || '').match(/^(\d+)\s*[×x]/i); return m ? Math.min(10, +m[1]) : 3; },
  _reps(sets) { const r = PlanGen._range(sets); return r[1] || r[0] || 10; },

  // 고른 날짜로 시작. 지난 날 계획이면 오늘 기록으로 할지, 앞으로 요일까지 옮길지 묻는다.
  startFor(ds) {
    const today = Fitness._dateStr(new Date());
    ds = ds || Fitness._dateStr((App?.S?.selDate) || new Date());
    if (ds > today) { App.showToast('아직 오지 않은 날입니다 — 오늘이나 지난 날을 골라 주세요'); return; }
    if (ds === today) return this.start(ds);
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
        <button class="sw-row" onclick="App.closeModal();WorkoutMode.start('${ds}')"><span class="sw-nm"><b>${md} 기록으로</b><small>그날 한 것으로 남깁니다(깜빡하고 못 남긴 경우)</small></span></button>
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
    App.closeModal();
    try { App.selectCalDate ? App.selectCalDate(new Date()) : Fitness.render(new Date()); } catch (e) {}
    this.start(today);
  },

  start(ds) {
    ds = ds || Fitness._dateStr(new Date());
    const { list } = Fitness.exercisesFor(new Date(ds + 'T00:00:00'));
    if (!list.length) { App.showToast('오늘 계획된 운동이 없습니다 — ‘+ 운동 추가’ 나 루틴을 먼저 정해 주세요'); return; }
    const done = Fitness._checked(new Date(ds + 'T00:00:00'));
    const log = PlanGen.log(ds);
    this.st = {
      ds, t0: Date.now(), cur: Math.max(0, list.findIndex((_, i) => !done.includes(i))), restEnd: 0,
      ex: list.map((x, i) => {
        const prev = PlanGen.last(x.name, ds);
        const n = Math.max(this._nSets(x.sets), (log[x.name] || []).length);
        const cardio = PlanGen.partOf(x.name) === '유산소';
        const nw = PlanGen.nextWeight(x.name, x.sets, ds);
        return { name: x.name, sets: x.sets, cardio, done: done.includes(i), sug: PlanGen.suggest(x.name, x.sets, ds),
          rows: Array.from({ length: cardio ? 1 : n }, (_, k) => {
            const L = (log[x.name] || [])[k], P = prev && prev.sets[Math.min(k, prev.sets.length - 1)];
            return L ? { w: L.w, r: L.r, ok: true } : { w: nw ?? (P ? P.w : ''), r: nw != null ? this._reps(x.sets) : (P ? P.r : this._reps(x.sets)), ok: false };
          }) };
      }),
    };
    App.closeModal?.();
    this._mount(); this.paint();
    this._tick = setInterval(() => this._time(), 250);
    try { navigator.wakeLock?.request('screen').then(l => { this._lock = l; }).catch(() => {}); } catch (e) {}
    try { Haptic.medium(); } catch (e) {}
  },

  _mount() {
    let el = document.getElementById('wkMode');
    if (!el) { el = document.createElement('div'); el.id = 'wkMode'; el.className = 'wk'; document.body.appendChild(el); }
    el.hidden = false; document.body.classList.add('wk-on');
  },
  _fmt(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },

  paint() {
    const S = this.st, el = document.getElementById('wkMode'); if (!S || !el) return;
    const x = S.ex[S.cur];
    const th = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(x.name) : '';
    const doneN = S.ex.filter(e => e.done).length;
    el.innerHTML = `
      <div class="wk-top">
        <button class="wk-x" onclick="WorkoutMode.finish()">끝내기</button>
        <div class="wk-clock"><b id="wkEl" class="num">0:00</b><span>${doneN} / ${S.ex.length} 종목</span></div>
        <button class="wk-x" onclick="WorkoutMode.restSetting()">휴식 ${this._fmt(this.restSec())}</button>
      </div>
      <div class="wk-body">
        <div class="wk-ex">
          ${th ? `<div class="wk-pose">${ExMedia.poseHtml(th)}</div>` : ''}
          <div class="wk-ex-tx"><div class="wk-n">${S.cur + 1}<i>/${S.ex.length}</i></div>
            <h2>${esc(x.name)}</h2><p>${esc(x.sets || '')}${x.sug ? ` · <em>${esc(x.sug)}</em>` : ''}</p></div>
        </div>
        ${x.cardio ? `<p class="wk-note">유산소는 시간만 재면 됩니다. 끝나면 아래 ‘완료’ 를 눌러 주세요.</p>` : `
        <div class="wk-sets">
          <div class="wk-sh"><span>세트</span><span>kg</span><span>회</span><span></span></div>
          ${x.rows.map((r, k) => `<div class="wk-set${r.ok ? ' ok' : ''}${!r.ok && k === x.rows.findIndex(q => !q.ok) ? ' now' : ''}">
            <span class="wk-k">${k + 1}</span>
            <input class="inp" type="number" inputmode="decimal" step="0.5" value="${r.w ?? ''}" placeholder="—" onchange="WorkoutMode.setVal(${k},'w',this.value)">
            <input class="inp" type="number" inputmode="numeric" value="${r.r ?? ''}" placeholder="—" onchange="WorkoutMode.setVal(${k},'r',this.value)">
            <button class="wk-ck" onclick="WorkoutMode.setDone(${k})" aria-label="${k + 1}세트 완료">${r.ok ? '✓' : ''}</button>
          </div>`).join('')}
          <div class="wk-row-btns"><button class="btn-sm" onclick="WorkoutMode.addSet()">+ 세트</button>${x.rows.length > 1 ? '<button class="btn-sm" onclick="WorkoutMode.delSet()">− 세트</button>' : ''}</div>
        </div>`}
        <div class="wk-list">${S.ex.map((e, i) => `<button class="wk-li${i === S.cur ? ' cur' : ''}${e.done ? ' done' : ''}" onclick="WorkoutMode.go(${i})">
          <span>${i + 1}</span><b>${esc(e.name)}</b><i>${e.done ? '완료' : e.rows.filter(r => r.ok).length + '/' + e.rows.length}</i></button>`).join('')}</div>
      </div>
      <div class="wk-bar">
        ${x.cardio || x.rows.every(r => r.ok)
          ? `<button class="wk-main" onclick="WorkoutMode.nextEx()">${S.cur < S.ex.length - 1 ? '이 운동 완료 · 다음 운동' : '마지막 운동 완료'}</button>`
          : `<button class="wk-main" onclick="WorkoutMode.setDone(${x.rows.findIndex(r => !r.ok)})">${x.rows.findIndex(r => !r.ok) + 1}세트 완료</button>`}
      </div>
      <div id="wkRest" class="wk-rest" hidden></div>`;
    this._time();
  },

  _time() {
    const S = this.st; if (!S) return;
    const e = document.getElementById('wkEl'); if (e) e.textContent = this._fmt((Date.now() - S.t0) / 1000);
    const r = document.getElementById('wkRest');
    if (r && S.restEnd) {
      const left = (S.restEnd - Date.now()) / 1000;
      if (left <= 0) { S.restEnd = 0; r.hidden = true; this._ding(); return; }
      r.hidden = false;
      const tot = S.restTot || 1, pct = Math.max(0, Math.min(1, left / tot));
      const big = r.querySelector('.wk-rb');
      if (big) { big.textContent = this._fmt(left); r.querySelector('.wk-rp').style.width = (pct * 100) + '%'; }
      else r.innerHTML = `<div class="wk-rt">쉬는 시간</div><div class="wk-rb num">${this._fmt(left)}</div>
        <div class="wk-rtrack"><i class="wk-rp" style="width:${pct * 100}%"></i></div>
        <div class="wk-rnext">다음: ${esc(this._nextLabel())}</div>
        <div class="wk-rbtns"><button class="btn-sm" onclick="WorkoutMode.addRest(-15)">−15초</button>
          <button class="btn-sm accent" onclick="WorkoutMode.skipRest()">건너뛰기</button>
          <button class="btn-sm" onclick="WorkoutMode.addRest(15)">+15초</button></div>`;
    }
  },
  _nextLabel() {
    const S = this.st, x = S.ex[S.cur], k = x.rows.findIndex(r => !r.ok);
    if (k >= 0) return `${x.name} ${k + 1}세트 · ${x.rows[k].w || '—'}kg × ${x.rows[k].r || '—'}회`;
    const n = S.ex.findIndex((e, i) => i > S.cur && !e.done);
    return n >= 0 ? S.ex[n].name : '마무리';
  },

  setVal(k, f, v) { const r = this.st.ex[this.st.cur].rows[k]; if (r) r[f] = v === '' ? '' : Number(v); },
  setDone(k) {
    const S = this.st, x = S.ex[S.cur], r = x.rows[k]; if (!r) return;
    // 입력 칸에 막 쓴 값도 반영
    const row = document.querySelectorAll('#wkMode .wk-set')[k];
    if (row) { const [w, rr] = row.querySelectorAll('input'); if (w.value !== '') r.w = Number(w.value); if (rr.value !== '') r.r = Number(rr.value); }
    r.ok = !r.ok;
    try { Haptic.success(); } catch (e) {}
    this._saveLog();
    if (r.ok) {
      if (x.rows.every(q => q.ok)) { this.nextEx(true); return; }
      this._rest();
    }
    this.paint();
  },
  addSet() { const x = this.st.ex[this.st.cur], l = x.rows[x.rows.length - 1] || {}; x.rows.push({ w: l.w ?? '', r: l.r ?? '', ok: false }); this.paint(); },
  delSet() { const x = this.st.ex[this.st.cur]; if (x.rows.length > 1) x.rows.pop(); this.paint(); },

  _rest() {
    const S = this.st, sec = this.restSec();
    S.restEnd = Date.now() + sec * 1000; S.restTot = sec;
    this._notify(sec);
  },
  addRest(d) { const S = this.st; if (!S.restEnd) return; S.restEnd += d * 1000; S.restTot = Math.max(S.restTot + d, 1); this._notify((S.restEnd - Date.now()) / 1000); },
  skipRest() { const S = this.st; S.restEnd = 0; const r = document.getElementById('wkRest'); if (r) { r.hidden = true; r.innerHTML = ''; } this._cancelNotify(); },
  restSetting() {
    const v = prompt('세트 사이 쉬는 시간(초)', String(this.restSec()));
    if (v == null) return; const n = Math.round(Number(v));
    if (n >= 15 && n <= 600) { localStorage.setItem('gl_rest_sec', String(n)); this.paint(); }
  },

  // 쉬는 시간이 끝나면: 진동 + 짧은 소리. 앱이 뒤에 있으면 기기 알림(앱에서만)
  _ding() {
    try { Haptic.warn(); navigator.vibrate?.([200, 100, 200]); } catch (e) {}
    try {
      const C = window.AudioContext || window.webkitAudioContext; const ctx = this._ac || (this._ac = new C());
      const t = ctx.currentTime;
      [[880, 0], [1175, 0.15]].forEach(([f, d]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3);
        o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.32); });
    } catch (e) {}
    const r = document.getElementById('wkRest'); if (r) r.innerHTML = '';
  },
  _notify(sec) {
    this._cancelNotify();
    const P = typeof LocalNotify !== 'undefined' && LocalNotify.P; if (!P) return;
    P.schedule({ notifications: [{ id: 7997, title: '쉬는 시간 끝', body: this._nextLabel(), schedule: { at: new Date(Date.now() + sec * 1000), allowWhileIdle: true } }] }).catch(() => {});
  },
  _cancelNotify() { const P = typeof LocalNotify !== 'undefined' && LocalNotify.P; if (P) P.cancel({ notifications: [{ id: 7997 }] }).catch(() => {}); },

  go(i) { this.st.cur = i; this.skipRest(); this.paint(); },
  nextEx(auto) {
    const S = this.st, x = S.ex[S.cur];
    x.done = true; this._saveLog(); this._check();
    const n = S.ex.findIndex((e, i) => !e.done && i > S.cur), m = n >= 0 ? n : S.ex.findIndex(e => !e.done);
    if (m < 0) { this.finish(true); return; }
    S.cur = m;
    if (auto) this._rest();
    this.paint();
  },

  _saveLog() {
    const S = this.st, L = PlanGen.log(S.ds);
    S.ex.forEach(e => { if (e.cardio) return; const ok = e.rows.filter(r => r.ok && Number(r.r) > 0).map(r => ({ w: Number(r.w) || 0, r: Number(r.r) })); if (ok.length) L[e.name] = ok; });
    PlanGen.saveLog(S.ds, L);
  },
  _check() {
    const S = this.st, d = new Date(S.ds + 'T00:00:00');
    const chk = new Set(Fitness._checked(d));
    S.ex.forEach((e, i) => { if (e.done) chk.add(i); });
    Fitness._save([...chk], d);
  },

  finish(all) {
    const S = this.st; if (!S) return;
    if (!all && !confirm('운동을 끝낼까요? 지금까지 한 세트는 저장됩니다.')) return;
    this._saveLog(); this._check(); this._cancelNotify();
    clearInterval(this._tick); try { this._lock?.release(); } catch (e) {}
    const min = Math.round((Date.now() - S.t0) / 60000);
    const vol = S.ex.reduce((t, e) => t + e.rows.filter(r => r.ok).reduce((a, r) => a + (Number(r.w) || 0) * (Number(r.r) || 0), 0), 0);
    const sets = S.ex.reduce((t, e) => t + e.rows.filter(r => r.ok).length, 0);
    const el = document.getElementById('wkMode');
    if (el) el.innerHTML = `<div class="wk-done">
      <div class="wk-dt">오늘 운동 끝</div>
      <div class="wk-dn"><div><b class="num">${min}</b><span>분</span></div><div><b class="num">${sets}</b><span>세트</span></div><div><b class="num">${Math.round(vol).toLocaleString('ko-KR')}</b><span>kg 볼륨</span></div></div>
      <p>${S.ex.filter(e => e.done).length} / ${S.ex.length} 종목 완료 · 무게와 횟수는 기록에 남았고, 다음 운동에서 권장 무게로 이어집니다.</p>
      <button class="wk-main" onclick="WorkoutMode.close()">닫기</button></div>`;
    try { Haptic.success(); } catch (e) {}
    this.st = null;
    try { Fitness.render(new Date(S.ds + 'T00:00:00')); } catch (e) {}
  },
  close() { const el = document.getElementById('wkMode'); if (el) { el.hidden = true; el.innerHTML = ''; } document.body.classList.remove('wk-on'); },
};

document.addEventListener('visibilitychange', () => { if (!document.hidden && WorkoutMode.st) WorkoutMode._time(); });
