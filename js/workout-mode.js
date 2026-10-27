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
      try { Fitness.applyList(S.ds, this._fullList(), 'day'); } catch (e) {}
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
    // 운동 중에 종목을 더하거나 빼거나 바꾸거나 순서를 바꾸면 그날 목록(오늘의 운동 카드)에 바로 반영한다.
    // 예전엔 '끝내기' 에서 '오늘만/플랜에도' 를 고른 뒤에야 반영돼서, 운동 모드에서 더한 종목은 카드에 없고 완료 표시도 붙을 자리가 없었다.
    const sig = S.ex.map(e => e.name + '|' + (e.sets || '')).join('\n');
    if (S._listSig == null) S._listSig = (S.planSig != null ? S.planSig : sig);
    if (sig !== S._listSig) { S._listSig = sig; try { Fitness.applyList(S.ds, this._fullList(), 'day'); this._check(); } catch (e) { console.warn('[wk sync]', e); } }
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
  // 하루에 루틴(회차)이 둘 이상이면 회차별로 나눠 보여 주고, 아직 안 끝난 첫 회차를 골라 둔다(눌러서 바꿀 수 있음)
  _sessions(ex) {
    const ss = [...new Set(ex.map(e => e.sess).filter(v => v != null))];
    if (ss.length < 2) return null;
    let plan = {}; try { plan = Fitness.exercisesFor(new Date(this._cfDs + 'T00:00:00')).plan || {}; } catch (e) {}
    ss.sort((a, b) => a - b);
    return ss.map((si, k) => ({ si, k, name: (Fitness.sessName ? Fitness.sessName(plan, si, ex) : '') || (plan.sessions && plan.sessions[si] && plan.sessions[si].name) || `${k + 1}회차`, ex: ex.filter(e => e.sess === si) }));
  },
  confirmStart(ds, pick) {
    ds = ds || Fitness._dateStr(new Date()); this._cfDs = ds;
    const all = this._build(ds);
    if (!all.length) { App.showToast('계획된 운동이 없습니다 — ‘+ 종목 추가’ 나 루틴을 먼저 정해 주세요'); return; }
    const SS = this._sessions(all);
    let sel = null;
    if (SS) {
      sel = pick != null ? Number(pick) : (SS.find(x => x.ex.some(e => !e.done)) || SS[SS.length - 1]).si;
      // 회차가 없는 운동(그날 따로 넣은 것)은 마지막 회차와 같이 한다
      const last = SS[SS.length - 1].si;
      all.forEach(e => { if (e.sess == null) e._lastSess = last; });
    }
    const inSel = e => sel == null || e.sess === sel || (e.sess == null && e._lastSess === sel);
    const todo = all.filter(e => inSel(e) && !e.done);
    const sets = todo.reduce((t, e) => t + (e.cardio ? 0 : e.rows.length), 0);
    const cardioMin = todo.filter(e => e.cardio).reduce((t, e) => t + (+(String(e.sets || '').match(/(\d+)\s*분/) || [])[1] || 30), 0);
    const pf = this.prefs();
    const mins = Math.round((sets * 45 + Math.max(0, sets - 1) * (pf.timer ? pf.rest : 30)) / 60) + cardioMin;
    const vol = todo.reduce((t, e) => t + e.rows.reduce((a, r) => a + (Number(r.w) || 0) * (Number(r.r) || 0), 0), 0);
    const k = n => Math.round(n).toLocaleString('ko-KR');
    const li = e => `<li class="${e.done ? 'done' : ''}"><b>${esc(e.name)}</b><span>${e.done ? '완료' : e.cardio ? esc(e.sets || '시간') : `${e.rows.length}세트 · ${e.rows[0].w ? e.rows[0].w + 'kg × ' : ''}${e.rows[0].r}회`}</span></li>`;
    const list = SS ? SS.map(x => { const ex = all.filter(e => e.sess === x.si || (e.sess == null && e._lastSess === x.si)), dn = ex.every(e => e.done);
        return `<button type="button" class="wk-cf-ss${x.si === sel ? ' on' : ''}${dn ? ' fin' : ''}" onclick="WorkoutMode.confirmStart('${ds}', ${x.si})">
          <span class="wk-cf-ck">${x.si === sel ? '✓' : ''}</span><b>${x.k + 1}회차 · ${esc(x.name)}</b><small>${dn ? '완료' : ex.filter(e => e.done).length + '/' + ex.length}</small></button>
          <ol class="wk-cf-list${x.si === sel ? '' : ' off'}">${ex.map(li).join('')}</ol>`; }).join('')
      : `<ol class="wk-cf-list">${todo.map(li).join('')}</ol>`;
    App.openModal('@dumbbell 운동을 시작하시겠습니까?', `
      <div class="wk-cf">
        <div><b class="num">${todo.length}</b><span>종목</span></div>
        <div><b class="num">${sets}</b><span>세트</span></div>
        <div><b class="num">${mins}</b><span>예상 분</span></div>
        <div><b class="num">${vol ? k(vol) : '—'}</b><span>예상 볼륨 kg</span></div>
      </div>
      ${SS ? '<p class="pg-note">오늘 루틴이 둘 이상입니다 — 할 회차를 눌러 고르세요.</p>' : ''}
      ${list}
      <p class="pg-note">쉬는 시간 ${pf.timer ? this._fmt(pf.rest) : '타이머 끔'} · 소리 ${pf.sound ? '켬' : '끔'} — 운동 중 위쪽 단추에서 바꿀 수 있습니다.</p>
      <div class="modal-btns"><button class="btn-sm accent" onclick="WorkoutMode.start('${ds}'${sel != null ? ', ' + sel : ''})">예, ${sel != null ? ((SS.find(x => x.si === sel) || {}).k + 1) + '회차 ' : ''}시작</button><button class="btn-sm" onclick="App.closeModal()">아니오</button></div>`);
  },

  start(ds, only) {
    ds = ds || Fitness._dateStr(new Date()); this._cfDs = ds;
    let ex = this._build(ds);
    if (!ex.length) return;
    // 회차를 골랐으면 그 회차 운동만(회차 없는 운동은 마지막 회차와 함께)
    if (only != null) { const SS = this._sessions(ex), last = SS ? SS[SS.length - 1].si : null; ex = ex.filter(e => e.sess === only || (e.sess == null && only === last)); if (!ex.length) return; }
    this.st = { ds, t0: Date.now(), cur: Math.max(0, ex.findIndex(e => !e.done)), restEnd: 0, ex, only: only ?? null,
      snapLog: PlanGen.log(ds), snapChk: Fitness._checked(new Date(ds + 'T00:00:00')), snapSwap: UserStore.get(PlanGen.SWAP_PREFIX + ds) || '{}',
      snapDay: UserStore.get(Fitness._dayKey(ds)) || '', planNames: ex.map(e => e.name), planSig: ex.map(e => e.name + '|' + (e.sets || '')).join('\n'),
      snapCustom: UserStore.get(Fitness._customKey(new Date(ds + 'T00:00:00'))) || '', snapOrder: UserStore.get(Fitness._orderKey(ds)) || '' };
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
            <button class="wk-tool" onclick="WorkoutMode.addEx()">+ 종목 추가</button>
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
    NumIn.open({ title: x.name + ' 시간', unit: '분', dec: false, hm: true, cur: c.min,
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
    const th = (n, f) => { let t = (typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(n) : '') || f || ''; return t ? `<span class="wko-th">${ExMedia.poseHtml(t, '')}</span>` : `<span class="wko-th none">${typeof Icons !== 'undefined' ? Icons.svg('dumbbell') : ''}</span>`; };
    const row = (e, k) => `<div class="wko-r${e.done ? ' done' : ''}${k === S.cur ? ' cur' : ''}" data-i="${k}">
        <span class="wko-n num">${k + 1}</span>${th(e.name, e.th)}<b>${esc(e.name)}</b>
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
  // 저장할 그날 전체 목록 — 한 회차만 했으면 다른 회차는 그대로 두고 이 회차 자리만 바꾼다
  _fullList() {
    const S = this.st, mine = S.ex.map(e => ({ name: e.name, sets: e.sets, sess: e.sess }));
    if (S.only == null) return mine;
    const full = Fitness.exercisesFor(new Date(S.ds + 'T00:00:00')).list.map(x => ({ name: x.name, sets: x.sets, sess: x.sess, ...(x.w != null && x.w !== '' ? { w: x.w } : {}) }));
    const at = full.findIndex(x => x.sess === S.only), rest = full.filter(x => x.sess !== S.only);
    rest.splice(at < 0 ? rest.length : at, 0, ...mine);
    return rest;
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
    if (S.snapCustom != null) UserStore.set(Fitness._customKey(new Date(S.ds + 'T00:00:00')), S.snapCustom);   // 운동 중 바로 반영한 목록도 되돌린다
    if (S.snapOrder != null) UserStore.set(Fitness._orderKey(S.ds), S.snapOrder);
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
        App.showToast(Fitness.applyList(S.ds, this._fullList(), scope), 'success');
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
