// js/fit-dayplan.js — 요일별 루틴 배정 · 루틴 만들기 · 그날 운동 목록
// fitness.js 의 Fitness 에서 떼어 낸 부분. fitness.js 다음에 읽는다(같은 객체에 메서드를 더한다).
Object.assign(Fitness, {
  // ── 요일별 루틴 배정 ───────────────────
  showDayPlan() {
    const dp = this.dayPlan();
    const R = this.routines();
    const DOW = ['일','월','화','수','목','금','토'];
    // 고르는 칸이 길어져 묶음(optgroup)으로 나눈다 — 루틴 만들기의 부위 칩(삼두·이두·전완근·유산소·스포츠)과 같은 범위
    const part = ps => ['part:' + ps.join(','), ps.join(' + ')];
    const SP = (typeof EX_DB !== 'undefined' && EX_DB['스포츠']) || [];
    const OPTS = [
      ['g:기본'], ['none','계획 없음'], ['rest','휴식'],
      ...(Object.keys(R).length ? [['g:내 루틴'], ...Object.entries(R).map(([id,r]) => [id, r.name])] : []),
      ['g:부위 하나'], ...[['가슴'],['등'],['하체'],['어깨'],['팔'],['삼두'],['이두'],['전완근'],['복근'],['전신']].map(part),
      ['g:부위 둘'], ...[['가슴','삼두'],['등','이두'],['가슴','어깨'],['가슴','팔'],['등','팔'],['어깨','팔'],['하체','복근'],['팔','복근'],['가슴','복근'],['등','복근'],['어깨','복근'],['전완근','이두']].map(part),
      ['g:유산소'], ['cardio','유산소'], ...[['전신','유산소'],['하체','유산소'],['복근','유산소']].map(part),
      ['g:홈트'], ['A','홈트 DAY A 푸시'],['B','홈트 DAY B 풀'],['C','홈트 DAY C 하체+코어'],
      ...(SP.length ? [['g:스포츠'], ...SP.map(n => ['sport:' + n, n])] : []),
    ];
    this._dpOpts = OPTS;
    const rows = DOW.map((d,i) => `<div class="dp-row${i===new Date().getDay()?' dp-today':''}" data-dow="${i}">
        <span class="dp-d">${d}</span>
        <div class="dp-ss">${this.picks(i).map((cur,k)=>this._dpSel(cur,k)).join('')}
          <button type="button" class="dp-add" onclick="Fitness._dpAdd(this)">${this._ic('plus')}<span>루틴 추가</span></button>
        </div>
      </div>`).join('');
    const rlist = Object.entries(R).map(([id,r]) => `<div class="rt-row">
        <span class="rt-nm">${esc(r.name)}</span><span class="rt-n"><span class="num">${(r.exercises||[]).length}</span>종목</span>
        <button class="rt-ed" onclick="Fitness.showRoutineEdit('${id}')">편집</button>
        <button class="rt-ed rt-del" onclick="Fitness.delRoutine('${id}','dp')">삭제</button>
      </div>`).join('');
    App.openModal('@dumbbell 요일별 운동', `<div class="fz fz-dp">
      <p class="fz-note">요일을 누르고 부위(여러 개 가능)나 루틴·스포츠를 고릅니다. 하루에 두 번 이상 하면 ‘루틴 추가’ 를 눌러 주세요. <b>종목 추가</b>는 운동 하나, <b>루틴 추가</b>는 부위·루틴·스포츠 한 묶음을 더합니다.</p>
      <div class="dp-list">${rows}</div>
      <div class="rt-box">
        <div class="fz-lbl">내 루틴</div>
        ${rlist || '<div class="rt-empty">아직 만든 루틴이 없습니다</div>'}
        <button class="fz-act" onclick="Fitness.showRoutineEdit()">${this._ic('plus')}<span>새 루틴 만들기</span></button>
        <button class="fz-act" onclick="Settings.open('workout')"><span class="fz-act-tx">루틴 묶음(분할) 관리<small>초보자 3분할 · 어깨 깡패처럼 여러 날을 한 묶음으로</small></span>${this._ic('chev','fz-ic-end')}</button>
        <button class="fz-act" onclick="PlanGen.open()"><span class="fz-act-tx">맞춤 플랜 다시 만들기<small>목표 · 기구 · 요일 · 제외 기구</small></span>${this._ic('chev','fz-ic-end')}</button>
      </div>
      <div class="modal-btns">
        <button onclick="Fitness._saveDayPlan()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
    setTimeout(()=>document.querySelectorAll('.dp-ss').forEach(b=>this._dpNum(b)), 0);
  },
  // 한 회차 = 고른 값 하나(부위 'part:가슴,삼두' · 내 루틴 id · 'sport:축구' · 휴식 …). 누르면 아래에 고르는 칸이 펼쳐진다.
  _dpSel(cur, k) {
    return `<div class="dp-s"><span class="dp-n num">${k+1}</span>`
      + `<button type="button" class="dp-btn" onclick="Fitness._dpOpen(this)"><span class="dp-lbl">${esc(this.pickLabel(cur))}</span>${this._ic('down','dp-chev2')}</button>`
      + `<input type="hidden" class="dp-sel" value="${esc(cur)}">`
      + `<button type="button" class="dp-x" onclick="Fitness._dpDel(this)" aria-label="이 회차 빼기">${this._ic('x') || '✕'}</button></div>`;
  },
  _dpOpen(btn) {
    const s = btn.closest('.dp-s'), was = s.nextElementSibling && s.nextElementSibling.classList.contains('rp');
    document.querySelectorAll('.fz-dp .rp').forEach(x => x.remove()); document.querySelectorAll('.fz-dp .dp-s.open').forEach(x => x.classList.remove('open'));
    if (was) return;
    s.classList.add('open');
    s.insertAdjacentHTML('afterend', this.rpHtml(s.querySelector('.dp-sel').value));
    const rp = s.nextElementSibling;
    rp._set = v => { s.querySelector('.dp-sel').value = v; s.querySelector('.dp-lbl').textContent = this.pickLabel(v); };
  },
  // 고른 값 → 보이는 이름
  pickLabel(v) {
    v = String(v || 'none');
    if (v.startsWith('part:')) return v.slice(5).split(',').join(' + ');
    if (v.startsWith('sport:')) return v.slice(6);
    const R = this._rtRO(); if (R[v]) return R[v].name;
    return { none:'계획 없음', rest:'휴식', cardio:'유산소', A:'홈트 DAY A 푸시', B:'홈트 DAY B 풀', C:'홈트 DAY C 하체+코어' }[v] || v;
  },
  _dpNum(box) {
    const ss = box.querySelectorAll('.dp-s');
    box.classList.toggle('multi', ss.length > 1);
    ss.forEach((el,k)=>{ el.querySelector('.dp-n').textContent = k+1; });
  },
  _dpAdd(btn) {
    const box = btn.closest('.dp-ss'); if (box.querySelectorAll('.dp-s').length >= 4) { App.showToast('하루 4회까지 넣을 수 있습니다'); return; }
    const R = this.routines(), used = [...box.querySelectorAll('.dp-sel')].map(x=>x.value);
    const next = Object.keys(R).find(id => !used.includes(id)) || 'cardio';
    btn.insertAdjacentHTML('beforebegin', this._dpSel(next, 0)); this._dpNum(box);
    const all = box.querySelectorAll('.dp-s'); this._dpOpen(all[all.length - 1].querySelector('.dp-btn'));
  },
  _dpDel(btn) {
    const box = btn.closest('.dp-ss'), ss = box.querySelectorAll('.dp-s');
    const s = btn.closest('.dp-s'), rp = s.nextElementSibling && s.nextElementSibling.classList.contains('rp') ? s.nextElementSibling : null;
    if (ss.length <= 1) { s.querySelector('.dp-sel').value = 'none'; s.querySelector('.dp-lbl').textContent = this.pickLabel('none'); rp?.remove(); return; }
    rp?.remove(); s.remove(); this._dpNum(box);
  },
  _ic(n, c){ return typeof ExMedia!=='undefined' && ExMedia.ic ? ExMedia.ic(n, c) : ''; },

  _saveDayPlan() {
    const dp = {};
    document.querySelectorAll('.dp-row').forEach(row => {
      const dow = row.dataset.dow, vals = [...row.querySelectorAll('.dp-sel')].map(x => x.value);
      this._setPicks(dp, dow, vals);
      if (dp[dow] === this._defaultFor(dow)) delete dp[dow];   // 기본과 같으면 저장하지 않는다
    });
    this.saveDayPlan(dp);
    App.closeModal();
    App.showToast('요일별 운동 저장됨','success');
    this.render(App?.S?.selDate || new Date());
  },

  // ── 루틴 만들기·고치기 ───────────────────
  // 운동 추가 창(종목 고르기)을 그대로 쓰고, 위에 루틴 이름·요일 칸만 얹는다.
  showRoutineEdit(id, fromPg) {
    this._freeDs = null; if (!fromPg) this._progAdd = null;   // 루틴 묶음 편집에서 열었을 때만 저장 뒤 그 묶음으로 돌아간다
    const R = this.routines(), r = id && R[id];
    this._rid = id || null;
    this._cart = r ? (r.exercises||[]).map(x => ({ name:x.name, sets:x.sets||this.DEFAULT_SETS, ...(x.w?{w:x.w}:{}) })) : [];
    const dp = this.dayPlan();
    const DOW = ['일','월','화','수','목','금','토'];
    const days = DOW.map((d,i) => `<label class="day-pick-btn"><input type="checkbox" class="rt-day" value="${i}" ${id && this.picks(i).includes(id)?'checked':''}><span>${d}</span></label>`).join('');
    this._rtMode = 'add';
    this._openPicker(r ? '루틴 편집' : '새 루틴', `
      <div class="modal-row"><label class="modal-lbl" for="rtName">루틴 이름</label>
        <input id="rtName" class="inp" placeholder="예: 상체 A, 하체 데이" value="${r?esc(r.name):''}"></div>
      <div class="modal-row"><label class="modal-lbl">하는 요일</label><div class="day-picker">${days}</div>
        <div class="rt-mode"><span>그 요일에 다른 운동이 있으면</span>
          <button type="button" class="rt-m on" data-m="add" onclick="Fitness._rtSetMode('add')">같은 날 루틴 추가</button>
          <button type="button" class="rt-m" data-m="replace" onclick="Fitness._rtSetMode('replace')">바꾸기</button></div></div>
      <div class="fz-lbl fz-lbl-sec">운동</div>`,
      r ? `<button onclick="Fitness.delRoutine('${id}','set')" class="btn-danger">루틴 삭제</button>` : '');
  },
  _rtSetMode(m) { this._rtMode = m; document.querySelectorAll('.rt-m').forEach(b => b.classList.toggle('on', b.dataset.m === m)); },
  // back: 지운 뒤 돌아갈 화면 — 'dp'(요일별 운동) · 'set'(설정 › 운동·루틴) · 없으면 닫기
  delRoutine(id, back) {
    const R = this.routines(); if (!R[id]) return;
    if (!confirm(`'${R[id].name}' 루틴을 삭제할까요? 배정된 요일은 계획 없음이 되고, 루틴 묶음에서도 빠집니다.`)) return;
    delete R[id]; this.saveRoutines(R);
    const dp = this.dayPlan(); for (let i=0;i<7;i++) { const a = this.picks(i); if (a.includes(id)) this._setPicks(dp, i, a.filter(x => x !== id)); } this.saveDayPlan(dp);
    try { const P = this.progs(); let ch = false; for (const g of Object.values(P)) if ((g.days||[]).includes(id)) { g.days = g.days.filter(x => x !== id); ch = true; } if (ch) this.saveProgs(P); } catch(e) {}
    this.render(App?.S?.selDate || new Date());
    if (back === 'dp') this.showDayPlan(); else if (back === 'set') Settings.open('workout'); else App.closeModal();
    App.showToast('루틴 삭제됨', 'success');
  },
  _commitRoutine() {
    const name = document.getElementById('rtName')?.value.trim();
    if (!name) { App.showToast('루틴 이름을 입력해 주세요', 'error'); return; }
    const cart = this._cart || [];
    if (!cart.length) { App.showToast('운동을 하나 이상 골라 주세요', 'error'); return; }
    const R = this.routines();
    const id = this._rid || ('r_' + Date.now().toString(36));
    R[id] = { name, exercises: cart.map(x => ({ name:x.name, sets:x.sets||this.defSets(x.name), ...(x.w?{w:x.w}:{}) })), named:true };
    this.saveRoutines(R);
    const dp = this.dayPlan();
    const picked = [...document.querySelectorAll('.rt-day:checked')].map(c => c.value);
    for (let i=0;i<7;i++) {
      const a = this.picks(i), has = a.includes(id);
      if (picked.includes(String(i))) {
        if (has) continue;
        const real = a.filter(x => x !== 'rest' && x !== 'none');   // 휴식·계획 없음이면 그냥 바꾼다
        this._setPicks(dp, i, this._rtMode === 'replace' || !real.length ? [id] : [...real, id]);
      } else if (has) this._setPicks(dp, i, a.filter(x => x !== id));
    }
    this.saveDayPlan(dp);
    this._cart = []; this._rid = null;
    // 루틴 묶음(분할) 편집에서 만들거나 고친 루틴이면 그 묶음 편집으로 돌아간다
    if (this._progAdd) { const pg = this._progAdd; this._progAdd = null; if (!pg.days.includes(id)) pg.days.push(id); this._pg = pg; this.render(App?.S?.selDate || new Date()); this._progPaint(); App.showToast(`'${name}' 루틴 저장됨`, 'success'); return; }
    App.closeModal(); this.render(App?.S?.selDate || new Date());
    App.showToast(`'${name}' 루틴 저장됨`, 'success');
  },

  // 그날 할 운동 목록(계획 + 그날만 교체 + 직접 추가) — 카드·운동 모드가 같이 쓴다
  // 그날 할 운동 목록 — 카드·운동 모드가 같이 쓴다.
  //   계획(요일 루틴, 또는 '다른 날 계획을 오늘로' 옮긴 것) + 그날만 교체 + 그날만 빼기 + 직접 추가 + 그날 순서
  // 줄마다 pi(계획 몇 번째) 또는 ci(직접 추가 몇 번째)와 key 를 달아 둔다 — 순서를 바꿔도 교체·삭제가 제자리를 찾게.
  _fromKey(ds){ return 'gl_fit_from_'+ds; },
  _orderKey(ds){ return 'gl_fit_order_'+ds; },
  // 그날만 더한 회차(루틴 추가) — ['part:이두', 'sport:축구' …]
  _xsKey(ds){ return 'gl_fit_xs_'+ds; },
  extraPicks(ds){ const v=UserStore.json(this._xsKey(ds), null); return Array.isArray(v)?v:[]; },
  setExtraPicks(ds, a){ UserStore.set(this._xsKey(ds), a&&a.length?JSON.stringify(a):''); FirebaseSync?.scheduleSave(); },
  planOn(date) {
    const d = new Date(date), ds = this._dateStr(d);
    const from = UserStore.get(this._fromKey(ds));
    const dow = from ? new Date(from+'T00:00:00').getDay() : d.getDay();
    return { ...this.planFor(dow, this.extraPicks(ds)), from: from || null };
  },
  exercisesFor(date) {
    const d = new Date(date), ds = this._dateStr(d);
    const plan = this.planOn(d);
    const ov = this.dayOverride(ds);
    if (ov) return { plan, list: ov.map((x,i)=>({ ...x, di:i, key:'d'+i })) };
    const sw = (typeof PlanGen!=='undefined') ? PlanGen.swapsFor(ds) : {};
    let list = plan.exercises.map((x,i)=> sw[i]==='__skip' ? null : sw[i] ? { ...x, name:sw[i], hp:undefined, pi:i, key:'p'+i } : { ...x, pi:i, key:'p'+i }).filter(Boolean)
      .concat(this.getCustomExercises(d).map((x,i)=>({ ...x, ci:i, key:'c'+i })));
    let ord = []; try { ord = JSON.parse(UserStore.get(this._orderKey(ds))||'[]'); } catch {}
    if (ord.length) list.sort((a,b)=>{ const x=ord.indexOf(a.key), y=ord.indexOf(b.key); return (x<0?999:x)-(y<0?999:y); });
    return { plan, list };
  },
  // 순서 바꾸기·빼기 뒤에 '완료' 표시가 다른 줄로 옮겨 가지 않게 key 로 다시 맞춘다
  _remapChecks(d, before, after, rename = k => k, gone = null) {
    const done = new Set(this._checked(d).map(i => before[i]?.key).filter(k => k && k !== gone).map(rename));
    this._save(after.map((x,i)=> done.has(x.key) ? i : -1).filter(i=>i>=0), d);
  },
  reorder(ds, keys) {
    const d = new Date(ds+'T00:00:00'), before = this.exercisesFor(d).list;
    UserStore.set(this._orderKey(ds), JSON.stringify(keys)); FirebaseSync?.scheduleSave();
    this._remapChecks(d, before, this.exercisesFor(d).list);
    this.render(d);
  },
  removeItem(ds, key) {
    const d = new Date(ds+'T00:00:00'), { plan, list } = this.exercisesFor(d), it = list.find(x=>x.key===key);
    if (!it) return;
    let rename = k => k;   // 빼고 나면 뒤쪽 번호가 하나씩 당겨진다 — 체크·순서·교체 기록도 같이 당긴다
    if (it.ci != null) {
      const c = this.getCustomExercises(d); c.splice(it.ci,1); this.saveCustomExercises(c,d);
      rename = k => /^c\d+$/.test(k) && +k.slice(1) > it.ci ? 'c'+(+k.slice(1)-1) : k;
      let ord=[]; try{ ord=JSON.parse(UserStore.get(this._orderKey(ds))||'[]'); }catch{}
      UserStore.set(this._orderKey(ds), JSON.stringify(ord.filter(k=>k!==key).map(rename)));
    } else if (plan.src==='routine' && confirm(`'${it.name}' 을(를) 루틴에서도 뺄까요?\n확인 = 루틴에서 빼기(앞으로도) · 취소 = 오늘만 빼기`)) {
      const R = this.routines(); R[plan.rid].exercises.splice(it.pi,1); this.saveRoutines(R);
      rename = k => /^p\d+$/.test(k) && +k.slice(1) > it.pi ? 'p'+(+k.slice(1)-1) : k;
      let ord=[]; try{ ord=JSON.parse(UserStore.get(this._orderKey(ds))||'[]'); }catch{}
      UserStore.set(this._orderKey(ds), JSON.stringify(ord.filter(k=>k!==key).map(rename)));
      const sk = PlanGen.SWAP_PREFIX+ds; let m={}; try{ m=JSON.parse(UserStore.get(sk)||'{}')||{}; }catch{}
      const m2={}; Object.entries(m).forEach(([i,v])=>{ i=+i; if(i!==it.pi) m2[i>it.pi?i-1:i]=v; }); UserStore.set(sk, JSON.stringify(m2));
    } else {
      const k = PlanGen.SWAP_PREFIX + ds; let m = {}; try { m = JSON.parse(UserStore.get(k)||'{}')||{}; } catch {}
      m[it.pi] = '__skip'; UserStore.set(k, JSON.stringify(m));
    }
    FirebaseSync?.scheduleSave();
    this._remapChecks(d, list, this.exercisesFor(d).list, rename, key);
    this.render(d);
    App.showToast(`${it.name} 뺐습니다`, 'success');
  },

  toggle(idx, dateStr=null) {
    try { Haptic.light(); } catch(e){}
    const d = dateStr ? new Date(dateStr+'T00:00:00') : new Date();
    // 지난 날짜도 체크할 수 있다(깜빡하고 못 누른 날). 앞으로의 날짜만 막는다.
    if (this._dateStr(d) > this._dateStr(new Date())) { App.showToast('아직 오지 않은 날은 체크할 수 없습니다'); return; }
    const chk=this._checked(d);
    const i=chk.indexOf(idx);
    if (i===-1) chk.push(idx); else chk.splice(i,1);
    this._save(chk,d);
    this._autoLog(idx, d, i===-1);
    if (window.VolTier) VolTier._c = null;   // 체크를 바꾸면 들어 올린 무게도 바로 다시 센다
    this.render(d);
  },

  // 카드에서 운동을 체크했는데 그날 기록(무게×횟수)이 없으면 계획한 세트를 권장 무게로 적어 둔다(a:1 = 자동).
  //   그래야 체크하자마자 총 볼륨·들어 올린 무게가 늘어난다. 체크를 풀면 자동으로 적은 기록만 지운다(손으로 적은 기록은 그대로).
  _autoLog(idx, d, on) {
    try {
      if (typeof PlanGen==='undefined') return;
      const ex = this.exercisesFor(d).list[idx]; if (!ex || PlanGen.timed(ex.name)) return;
      const ds = this._dateStr(d), L = PlanGen.log(ds), cur = L[ex.name];
      if (on) {
        if (cur && cur.length) return;
        const m = String(ex.sets||'').match(/^(\d+)/), n = Math.max(1, Math.min(10, m ? +m[1] : 3)), reps = PlanGen._range(ex.sets)[0] || 10;
        const last = PlanGen.last(ex.name, ds);
        const w = Number(ex.w) > 0 ? Number(ex.w) : (PlanGen.nextWeight(ex.name, ex.sets, ds) ?? (last ? Number(last.sets[0].w) || 0 : 0));
        if (!(w > 0)) return;   // 맨몸·처음 하는 운동은 무게를 모르니 적지 않는다
        L[ex.name] = Array.from({ length: n }, () => ({ w, r: reps, a: 1 }));
        PlanGen.saveLog(ds, L);
      } else if (cur && cur.length && cur.every(x => x && x.a)) {
        delete L[ex.name]; PlanGen.saveLog(ds, L);
      }
    } catch (e) {}
  },
});
