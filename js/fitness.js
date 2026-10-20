// js/fitness.js — 운동 트래커 (날짜별 기록 + 인라인 추가)

const Fitness = {
  // 날짜별 커스텀 운동 추가 저장
  _dateStr(date) {
    const d=new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _customKey(date){ return `gl_fitness_custom_${this._dateStr(date)}`; },
  getCustomExercises(date=new Date()){
    return JSON.parse(UserStore.get(this._customKey(date))||'[]');
  },
  saveCustomExercises(v,date=new Date()){
    UserStore.set(this._customKey(date),JSON.stringify(v));
    FirebaseSync?.scheduleSave();
  },

  _checkKey(date){ return `gl_fitness_${this._dateStr(date)}`; },
  _checked(date=new Date()){ return JSON.parse(UserStore.get(this._checkKey(date))||'[]'); },
  _save(v,date=new Date()){ UserStore.set(this._checkKey(date),JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  // ── 요일별 계획 ─────────────────────────
  // 기본은 홈트레이닝 3일 분할(js/home-plan.js): 월=DAY A 푸시, 수=DAY B 풀, 금=DAY C 하체+코어,
  // 화·목·토는 가벼운 유산소, 일요일은 휴식. 요일마다 ⚙ 에서 바꿀 수 있다.
  // (예전엔 Hevy 루틴을 받아 썼는데, Hevy 를 더 쓰지 않아 걷어냈다.)
  DAYPLAN_KEY: 'gl_fitness_dayplan',     // { 0:'rest', 1:'A', 2:'cardio' … }  0=일
  DEFAULT_DAY: { 0:'rest', 1:'A', 2:'cardio', 3:'B', 4:'cardio', 5:'C', 6:'cardio' },
  CARDIO: { name:'유산소', exercises:[{ name:'걷기 또는 Zone2 자전거', sets:'30-40분', note:'심박 120~130, 회복 위주' }] },

  dayPlan() {
    try {
      const v = JSON.parse(UserStore.get(this.DAYPLAN_KEY) || '{}');
      return (v && typeof v === 'object') ? v : {};
    } catch (e) { return {}; }
  },
  saveDayPlan(v) { UserStore.set(this.DAYPLAN_KEY, JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  // 홈트 플랜의 한 날(A/B/C)을 카드가 쓰는 모양으로. 세트는 태그 중 's'(4×10-12 같은 것)를 쓴다.
  homeDay(key) {
    const i = { A:0, B:1, C:2 }[key];
    if (i == null || typeof HomePlan === 'undefined') return null;
    const lb = HomePlan.DAY_LABELS[i];
    return {
      name: `${lb.name} ${lb.sub}`, src:'home', day:i,
      exercises: HomePlan.EX[i].map((x, j) => ({
        name: x.n, sets: ((x.tg || []).find(t => t.c === 's') || {}).t || '', hp: j,
      })),
    };
  },

  // ── 내 루틴 ────────────────────────────
  // 처음 가입한 사람에게는 아무것도 미리 정해 두지 않는다. 직접 루틴을 만들어 요일에 붙인다.
  ROUTINE_KEY: 'gl_fitness_routines',     // { r_xxx: { name, exercises:[{name,sets}] } }
  routines() {
    try { const v = JSON.parse(UserStore.get(this.ROUTINE_KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; }
    catch { return {}; }
  },
  saveRoutines(v) { UserStore.set(this.ROUTINE_KEY, JSON.stringify(v)); FirebaseSync?.scheduleSave(); },
  // 새 사용자(도우미가 표시)는 기본 배정이 '계획 없음' 이다.
  _defaultFor(dow) { return UserStore.get('gl_fit_blank') === '1' ? 'none' : this.DEFAULT_DAY[dow]; },

  planFor(dow) {
    let pick = this.dayPlan()[dow];
    const R = this.routines();
    if (!['A','B','C','cardio','rest','none'].includes(pick) && !R[pick]) pick = this._defaultFor(dow);   // 예전 Hevy 루틴 id 는 무시
    if (R[pick]) return { name:R[pick].name, exercises:(R[pick].exercises||[]).map(x=>({ name:x.name, sets:x.sets||'' })), src:'routine', rid:pick };
    if (pick === 'none')   return { name:'계획 없음', exercises:[], src:'none' };
    if (pick === 'rest')   return { name:'휴식', exercises:[], src:'day' };
    if (pick === 'cardio') return { ...this.CARDIO, src:'day' };
    return this.homeDay(pick) || { name:'휴식', exercises:[], src:'day' };
  },

  render(date=new Date(), planIdx=null) {
    // 피트니스 카드가 없는 레이아웃에서는 조용히 종료
    if (!document.getElementById('fitnessWrap')) return;
    const d    = new Date(date);
    const dow  = planIdx!==null ? planIdx : d.getDay();
    const { plan, list:allEx } = planIdx!==null && planIdx!==d.getDay() ? { plan:this.planFor(dow), list:this.planFor(dow).exercises.map((x,i)=>({...x,pi:i,key:'p'+i})) } : this.exercisesFor(d);
    const chk  = this._checked(d);
    const isToday = this._dateStr(d)===this._dateStr(new Date());
    const isPast = this._dateStr(d) < this._dateStr(new Date());

    // 카드 타이틀
    const titleEl = document.querySelector('.card-fitness .card-title');
    if (titleEl) {
      // textContent 로 쓰면 머리글 아이콘까지 지워진다. Icons.title 로 통일한다.
      if (isToday) Icons.title(titleEl,'dumbbell','오늘의 운동');
      else {
        const ds=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
        Icons.title(titleEl,'dumbbell',`${ds} 운동`);
      }
    }

    const badge = document.getElementById('fitBadge');
    if (badge) {
      // 배지에 있던 이모지는 뺐다. 바로 옆 머리글이 이미 선 아이콘이라 둘이 부딪혔다.
      badge.textContent=plan.name;
      // 배지를 누르면 그날 플랜의 자세·중량 가이드가 열린다.
      badge.style.cursor='pointer'; badge.title='자세·추천 중량 가이드';
      badge.onclick=()=> plan.src==='home' ? HomePlan.open(plan.day) : plan.src==='routine' ? Fitness.showRoutineEdit(plan.rid) : Fitness.showDayPlan();
      if(plan.src!=='home') badge.title='루틴 보기·바꾸기';
      badge.className=allEx.length?'badge badge-accent':'badge';
    }

    // 탭: 요일별 — 휴식일이어도 반드시 남는다.
    // 예전엔 휴식일이면 탭 없이 return 해서, 일요일(휴무)을 누르는 순간
    // 다른 요일로 돌아갈 방법이 사라졌다. 카드가 막다른 길이 됐다.
    const DOW=['일','월','화','수','목','금','토'];
    // 요일 단추는 '그 주의 그 요일' 로 날짜째 옮긴다.
    // 예전에는 날짜는 그대로 두고 계획만 바꿨다. 그래서 화요일에 '월' 을 누르면
    // 월요일 계획이 뜨는데 아래 실제 운동 기록과 체크는 화요일 것이었다 —
    // 제목도 '오늘의 운동' 그대로여서, 지금 보고 있는 게 언제인지 알 수가 없었다.
    // 요일 줄: 요일 아래에 그날 루틴 이름을 작게 적는다 (시안 06)
    const shortNm = p => p.src==='none' ? '—' : String(p.name||'').replace(/^DAY\s*[ABC]\s*/,'').replace(/^내 루틴 · /,'').slice(0,4) || '—';
    const tabs = DOW.map((dn,i)=>`<button class="fit-day${i===dow?' on':''}${i===0?' sun':''}" onclick="Fitness.pickDay(${i}, '${Fitness._dateStr(date)}')"><b>${dn}</b><span>${esc(shortNm(this.planFor(i)))}</span></button>`).join('');
    const container = document.getElementById('fitnessWrap');
    const ds = Fitness._dateStr(date);

    if (!allEx.length) {
      // 계획이 휴식일이어도 그날 실제로 운동했으면 기록과 피드백은 보여야 한다.
      // 예전엔 여기서 그냥 빠져나가서, 계획에 없던 날의 운동은 어디서도 볼 수 없었다.
      const none = plan.src==='none';
      container.innerHTML=`
      <div class="fit-days">${tabs}</div>
      ${none ? `<div class="fit-empty">
        ${Icons.big('dumbbell')}
        <p><b>아직 이 요일의 운동 계획이 없어요</b><br><span>내 루틴을 만들어 요일에 붙이거나, 그날 한 운동만 바로 기록해도 됩니다.</span></p>
        <div class="fit-empty-btns">
          <button class="btn-sm accent" onclick="PlanGen.open()">맞춤 플랜 만들기</button>
          <button class="btn-sm" onclick="Fitness.showRoutineEdit()">루틴 직접 만들기</button>
          <button class="btn-sm" onclick="Fitness.showDayPlan()">요일에 배정</button>
        </div>
      </div>` : `<div style="text-align:center;padding:20px 16px;color:var(--text2)">
        ${Icons.big('moon')}
        <p>휴식일입니다.<br><span style="color:var(--text3);font-size:12px">다른 요일을 눌러 계획을 볼 수 있어요</span></p>
      </div>`}
      <div class="habit-add-btn" onclick="Fitness.showInlineAdd(new Date('${Fitness._dateStr(date)}T00:00:00'))">+ 운동 추가</div>`;
      return;
    }

    const on  = i => chk.includes(i);

    const done=allEx.filter((_,i)=>on(i)).length;
    const pct=Math.round(done/allEx.length*100);

    const dsx = Fitness._dateStr(date);
    // 다음에 할 운동 = 아직 안 한 것 중 첫 번째
    const nextI = allEx.findIndex((_,i)=>!on(i));
    container.innerHTML=`
      <div class="fit-days">${tabs}</div>
      <div class="fit-prog"><div class="fit-prog-bar"><i style="width:${pct}%"></i></div><span class="num">${done} / ${allEx.length}</span></div>
      <div class="fit-list">
      ${allEx.map((ex,i)=>{
        const A = v => esc(v).replace(/'/g,'&#39;');
        const src = this._thumb(ex, plan);
        const info = ex.hp!=null&&plan.src==='home' ? `HomePlan.open(${plan.day},${ex.hp})`
                   : (typeof ExMedia!=='undefined'&&ExMedia.find(ex.name)) ? `ExMedia.open('${esc(ex.name).replace(/'/g,'&#39;')}')` : '';
        const custom = ex.ci!=null;
        return `<div class="fx${on(i)?' done':''}${i===nextI&&(isToday||isPast)&&!on(i)?' next':''}" data-row data-i="${ex.key}" data-label="${esc(ex.name)}" onclick="Fitness.toggle(${i},'${dsx}')">
          <button type="button" class="fx-th${src?'':' none'}" ${info?`onclick="event.stopPropagation();${info}"`:'tabindex="-1"'} aria-label="${esc(ex.name)} 자세 보기">
            ${typeof Icons!=='undefined'?Icons.svg('dumbbell','fx-ic'):''}${src?`<span class="fx-img">${ExMedia.poseHtml(src)}</span>`:''}
          </button>
          <div class="fx-tx"><div class="fx-nm">${esc(ex.name)}</div><div class="fx-sets num">${esc(ex.sets||'')}</div>${this._logLine(ex, dsx)}</div>
          <button type="button" class="fx-act" onclick="event.stopPropagation();PlanGen.openLog('${A(ex.name)}','${A(ex.sets||'')}','${dsx}')" aria-label="무게 기록">${typeof Icons!=='undefined'?Icons.svg('pen','fx-aic'):'기록'}</button>
          ${!custom?`<button type="button" class="fx-act" onclick="event.stopPropagation();PlanGen.openSwap(${ex.pi},'${A(ex.name)}','${dsx}',${plan.src==='routine'&&!plan.from?`'${plan.rid}'`:'null'})" aria-label="운동 교체">⇄</button>`:''}
        </div>`;}).join('')}
      </div>
      ${plan.from ? `<p class="fit-from">${plan.from.slice(5).replace('-','/')} 계획을 오늘 하는 중 · <a href="javascript:Fitness.undoFrom('${dsx}')">되돌리기</a></p>` : ''}
      <div class="fit-foot">
        ${(()=>{ const sv = typeof WorkoutMode!=='undefined' && WorkoutMode.saved(); if (sv && sv.ex && sv.ex.length) return `<button class="btn-sm accent fit-start" onclick="WorkoutMode.startFor('${dsx}')">이어서 운동하기 · ${sv.ex.filter(e=>e.done).length}/${sv.ex.length} 종목</button>`; return (isToday||isPast) && done<allEx.length ? `<button class="btn-sm accent fit-start" onclick="WorkoutMode.startFor('${dsx}')">운동 시작 · 세트와 쉬는 시간 타이머</button>` : ''; })()}
        <div class="habit-add-btn" onclick="Fitness.showInlineAdd(new Date('${dsx}T00:00:00'))">+ 운동 추가</div>
      </div>`;
    try { RowUI.paint(container.querySelector('.fit-list'), {
      edit: key => { const it = allEx.find(x=>x.key===key); if (it) PlanGen.openLog(it.name, it.sets||'', dsx); },
      del:  key => Fitness.removeItem(dsx, key),
      reorder: order => Fitness.reorder(dsx, order),
    }); } catch(e) { console.warn('RowUI fit', e); }
  },

  undoFrom(ds) { const d=new Date(ds+'T00:00:00'); this._save([], d); UserStore.set(this._orderKey(ds), '[]'); UserStore.set(PlanGen.SWAP_PREFIX+ds, '{}'); UserStore.set(this._fromKey(ds), ''); FirebaseSync?.scheduleSave(); this.render(new Date(ds+'T00:00:00')); },

  // 그날 기록(무게×횟수)이 있으면 그것을, 없으면 지난 기록으로 본 오늘 권장 무게를 한 줄로
  _logLine(ex, ds) {
    if (typeof PlanGen==='undefined') return '';
    const L = PlanGen.log(ds)[ex.name];
    if (L && L.length) return `<div class="fx-log num">${L.map(s=>s.w?`${s.w}kg×${s.r}`:`${s.r}회`).join(' · ')}</div>`;
    const sg = PlanGen.suggest(ex.name, ex.sets, ds);
    return sg ? `<div class="fx-log fx-sug">${esc(sg)}</div>` : '';
  },

  // 요일을 누르면 앱 전체의 날짜가 그날로 바뀐다 — 상단 날짜·요약·식단·습관이 함께 따라온다
  pickDay(i, base) {
    const d = this._dowDate(i, new Date(base+'T00:00:00'));
    if (typeof App!=='undefined' && App.selectCalDate) {
      if (App.S) App.S.calDate = new Date(d.getFullYear(), d.getMonth(), 1);
      App.selectCalDate(d);
    } else this.render(d);
  },

  // 운동 줄 썸네일: 홈트 플랜 그림 → 전체 종목 그림 순으로 찾는다
  _thumb(ex, plan) {
    try {
      if (ex.hp!=null && plan.src==='home' && typeof HomePlan!=='undefined') {
        const x = HomePlan.EX?.[plan.day]?.[ex.hp];
        if (x && HomePlan.IMG[x.img]) return HomePlan.IMG[x.img].replace('img/ex/','img/exf/');
      }
      if (typeof ExMedia!=='undefined') return ExMedia.thumbFor(ex.name);
    } catch(e){}
    return '';
  },

  // 같은 주(일요일 시작)의 i 요일 날짜. DOW[0] 이 '일' 이므로 getDay() 와 자리가 같다.
  _dowDate(i, base) {
    const d = new Date(base);
    d.setDate(d.getDate() + (i - d.getDay()));
    return d;
  },

  // ── 요일별 루틴 배정 ───────────────────
  showDayPlan() {
    const dp = this.dayPlan();
    const R = this.routines();
    const DOW = ['일','월','화','수','목','금','토'];
    const OPTS = [
      ...Object.entries(R).map(([id,r]) => [id, '내 루틴 · ' + r.name]),
      ['none','계획 없음'], ['rest','휴식'], ['cardio','유산소'],
      ['A','홈트 DAY A 푸시'],['B','홈트 DAY B 풀'],['C','홈트 DAY C 하체+코어'],
    ];
    const rows = DOW.map((d,i) => {
      let cur = dp[i]; if (!cur || (!R[cur] && !OPTS.some(o=>o[0]===cur))) cur = this._defaultFor(i);
      const opts = OPTS.map(([v,l]) => `<option value="${v}"${cur===v?' selected':''}>${esc(l)}</option>`);
      return `<div class="dp-row">
        <span class="dp-d${i===0?' dp-sun':''}${i===6?' dp-sat':''}">${d}</span>
        <select class="inp inp-sm dp-sel" data-dow="${i}">${opts.join('')}</select>
      </div>`;
    }).join('');
    const rlist = Object.entries(R).map(([id,r]) => `<div class="rt-row">
        <span class="rt-nm">${esc(r.name)}</span><span class="rt-n">${(r.exercises||[]).length}종목</span>
        <button class="btn-sm" onclick="Fitness.showRoutineEdit('${id}')">편집</button>
      </div>`).join('');
    App.openModal('@dumbbell 요일별 운동', `
      <div class="dp-note">요일마다 할 루틴을 고릅니다. 내 루틴은 아래에서 만들 수 있고, 홈트 3분할 플랜도 그대로 쓸 수 있어요.</div>
      <div class="dp-list">${rows}</div>
      <div class="rt-box">
        <div class="rt-hd">내 루틴</div>
        ${rlist || '<div class="rt-empty">아직 만든 루틴이 없습니다</div>'}
        <button class="habit-add-btn" onclick="Fitness.showRoutineEdit()">+ 새 루틴 만들기</button>
        <button class="habit-add-btn" onclick="PlanGen.open()">맞춤 플랜 다시 만들기 (목표·기구·요일·제외 기구)</button>
      </div>
      <div class="modal-btns">
        <button onclick="Fitness._saveDayPlan()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },

  _saveDayPlan() {
    const dp = {};
    document.querySelectorAll('.dp-sel').forEach(sel => {
      const v = sel.value;
      if (v && v !== this._defaultFor(sel.dataset.dow)) dp[sel.dataset.dow] = v;   // 기본과 같으면 저장하지 않는다
    });
    this.saveDayPlan(dp);
    App.closeModal();
    App.showToast('요일별 운동 저장됨 ✓','success');
    this.render(App?.S?.selDate || new Date());
  },

  // ── 루틴 만들기·고치기 ───────────────────
  // 운동 추가 창(종목 고르기)을 그대로 쓰고, 위에 루틴 이름·요일 칸만 얹는다.
  showRoutineEdit(id) {
    const R = this.routines(), r = id && R[id];
    this._rid = id || null;
    this._cart = r ? (r.exercises||[]).map(x => ({ name:x.name, sets:x.sets||this.DEFAULT_SETS })) : [];
    const dp = this.dayPlan();
    const DOW = ['일','월','화','수','목','금','토'];
    const days = DOW.map((d,i) => `<label class="day-pick-btn"><input type="checkbox" class="rt-day" value="${i}" ${id && dp[i]===id?'checked':''}><span>${d}</span></label>`).join('');
    this._openPicker(r ? '루틴 편집' : '새 루틴', `
      <div class="modal-row"><label class="modal-lbl">루틴 이름</label>
        <input id="rtName" class="inp" placeholder="예: 상체 A, 하체 데이" value="${r?esc(r.name):''}"></div>
      <div class="modal-row"><label class="modal-lbl">이 루틴을 하는 요일</label><div class="day-picker">${days}</div></div>`,
      r ? `<button onclick="Fitness.delRoutine('${id}')" class="btn-danger">삭제</button>` : '');
  },
  delRoutine(id) {
    if (!confirm('이 루틴을 삭제할까요? 배정된 요일은 계획 없음이 됩니다.')) return;
    const R = this.routines(); delete R[id]; this.saveRoutines(R);
    const dp = this.dayPlan(); Object.keys(dp).forEach(k => { if (dp[k] === id) dp[k] = 'none'; }); this.saveDayPlan(dp);
    App.closeModal(); this.render(App?.S?.selDate || new Date());
    App.showToast('루틴 삭제됨', 'success');
  },
  _commitRoutine() {
    const name = document.getElementById('rtName')?.value.trim();
    if (!name) { App.showToast('루틴 이름을 입력해 주세요', 'error'); return; }
    const cart = this._cart || [];
    if (!cart.length) { App.showToast('운동을 하나 이상 골라 주세요', 'error'); return; }
    const R = this.routines();
    const id = this._rid || ('r_' + Date.now().toString(36));
    R[id] = { name, exercises: cart.map(x => ({ name:x.name, sets:x.sets||this.DEFAULT_SETS })) };
    this.saveRoutines(R);
    const dp = this.dayPlan();
    const picked = [...document.querySelectorAll('.rt-day:checked')].map(c => c.value);
    for (let i=0;i<7;i++) {
      if (picked.includes(String(i))) dp[i] = id;
      else if (dp[i] === id) dp[i] = 'none';
    }
    this.saveDayPlan(dp);
    this._cart = []; this._rid = null;
    App.closeModal(); this.render(App?.S?.selDate || new Date());
    App.showToast(`'${name}' 루틴 저장됨 ✓`, 'success');
  },

  // 그날 할 운동 목록(계획 + 그날만 교체 + 직접 추가) — 카드·운동 모드가 같이 쓴다
  // 그날 할 운동 목록 — 카드·운동 모드가 같이 쓴다.
  //   계획(요일 루틴, 또는 '다른 날 계획을 오늘로' 옮긴 것) + 그날만 교체 + 그날만 빼기 + 직접 추가 + 그날 순서
  // 줄마다 pi(계획 몇 번째) 또는 ci(직접 추가 몇 번째)와 key 를 달아 둔다 — 순서를 바꿔도 교체·삭제가 제자리를 찾게.
  _fromKey(ds){ return 'gl_fit_from_'+ds; },
  _orderKey(ds){ return 'gl_fit_order_'+ds; },
  planOn(date) {
    const d = new Date(date), ds = this._dateStr(d);
    const from = UserStore.get(this._fromKey(ds));
    const dow = from ? new Date(from+'T00:00:00').getDay() : d.getDay();
    return { ...this.planFor(dow), from: from || null };
  },
  exercisesFor(date) {
    const d = new Date(date), ds = this._dateStr(d);
    const plan = this.planOn(d);
    const sw = (typeof PlanGen!=='undefined') ? PlanGen.swapsFor(ds) : {};
    let list = plan.exercises.map((x,i)=> sw[i]==='__skip' ? null : sw[i] ? { ...x, name:sw[i], hp:undefined, pi:i, key:'p'+i } : { ...x, pi:i, key:'p'+i }).filter(Boolean)
      .concat(this.getCustomExercises(d).map((x,i)=>({ ...x, ci:i, key:'c'+i })));
    let ord = []; try { ord = JSON.parse(UserStore.get(this._orderKey(ds))||'[]'); } catch {}
    if (ord.length) list.sort((a,b)=>{ const x=ord.indexOf(a.key), y=ord.indexOf(b.key); return (x<0?999:x)-(y<0?999:y); });
    return { plan, list };
  },
  // 순서 바꾸기·빼기 뒤에 '완료' 표시가 다른 줄로 옮겨 가지 않게 key 로 다시 맞춘다
  _remapChecks(d, before, after) {
    const done = new Set(this._checked(d).map(i => before[i]?.key).filter(Boolean));
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
    if (it.ci != null) {
      const c = this.getCustomExercises(d); c.splice(it.ci,1); this.saveCustomExercises(c,d);
      // 직접 추가 번호가 당겨지니 순서 기록의 c 번호도 고친다
      let ord=[]; try{ ord=JSON.parse(UserStore.get(this._orderKey(ds))||'[]'); }catch{}
      ord = ord.filter(k=>k!==key).map(k=>/^c\d+$/.test(k)&&+k.slice(1)>it.ci?'c'+(+k.slice(1)-1):k);
      UserStore.set(this._orderKey(ds), JSON.stringify(ord));
    } else if (plan.src==='routine' && confirm(`'${it.name}' 을(를) 루틴에서도 뺄까요?\n확인 = 루틴에서 빼기(앞으로도) · 취소 = 오늘만 빼기`)) {
      const R = this.routines(); R[plan.rid].exercises.splice(it.pi,1); this.saveRoutines(R);
    } else {
      const k = PlanGen.SWAP_PREFIX + ds; let m = {}; try { m = JSON.parse(UserStore.get(k)||'{}')||{}; } catch {}
      m[it.pi] = '__skip'; UserStore.set(k, JSON.stringify(m));
    }
    FirebaseSync?.scheduleSave();
    this._remapChecks(d, list, this.exercisesFor(d).list);
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
    this.render(d);
  },

  // ── 종목 고르기 ───────────────────────
  // god_life 에 있던 종목 659개를 되살렸다. 예전엔 이름을 매번 손으로 쳐야 했다.
  DEFAULT_SETS: '3×12',
  ytUrl(name){
    // 원본 EX_DB 의 3번째 필드가 659개 전부 이 규칙과 일치해서 저장하지 않고 만든다
    return 'https://www.youtube.com/results?search_query=' +
      encodeURIComponent(String(name).replace(/ /g,'+') + '+운동+자세');
  },
  // 초성 테이블 — js/diet.js 에도 같은 게 있다. 두 모듈을 엮지 않으려고 따로 둔다.
  CHO: ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'],
  _cho(str){
    let out='';
    for(const ch of String(str)){
      const c=ch.charCodeAt(0)-0xAC00;
      out += (c>=0 && c<11172) ? this.CHO[Math.floor(c/588)] : ch;
    }
    return out;
  },
  _favKey(){ return 'gl_fitness_favs'; },
  getFavs(){ try{ return JSON.parse(UserStore.get(this._favKey())||'[]'); }catch{ return []; } },
  toggleFav(name){
    const f=this.getFavs(); const i=f.indexOf(name);
    if(i===-1) f.push(name); else f.splice(i,1);
    UserStore.set(this._favKey(), JSON.stringify(f));
    FirebaseSync?.scheduleSave();
    this._paintPick();
  },
  _parts(){ return Object.keys(typeof EX_DB!=='undefined' ? EX_DB : {}); },
  _search(part, q){
    if(typeof EX_DB==='undefined') return [];
    let src = part && EX_DB[part] ? EX_DB[part].map(n=>[part,n])
              : Object.entries(EX_DB).flatMap(([p,ns])=>ns.map(n=>[p,n]));
    q=String(q||'').trim();
    // 추천하지 않을 기구·운동은 목록에서 뺀다(설정 › 맞춤 플랜)
    if(typeof PlanGen!=='undefined') src=src.filter(([,n])=>PlanGen.pickerOk(n));
    const favs=this.getFavs();
    if(!q){
      // 검색어가 없으면 즐겨찾기를 위로 올려 그대로 보여준다 (god_life 와 같은 규칙)
      const fav=src.filter(([,n])=>favs.includes(n));
      const rest=src.filter(([,n])=>!favs.includes(n));
      return fav.concat(rest).slice(0,60);
    }
    const lower=q.toLowerCase(), isCho=/^[ㄱ-ㅎ]+$/.test(q);
    const out=[];
    for(const [p,n] of src){
      const nm=n.toLowerCase();
      let rank=-1;
      if(isCho){
        const ch=this._cho(n);
        if(ch.startsWith(q)) rank=1; else if(ch.includes(q)) rank=3;
      } else {
        if(nm===lower) rank=0;
        else if(nm.startsWith(lower)) rank=1;
        else if(nm.includes(lower)) rank=2;
        else if(this._cho(n).includes(q)) rank=4;
      }
      if(rank<0) continue;
      out.push([favs.includes(n)?-1:rank, n.length, p, n]);
    }
    out.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    return out.slice(0,60).map(x=>[x[2],x[3]]);
  },
  _paintPick(){
    document.querySelectorAll('.ex-part').forEach(b=>
      b.classList.toggle('on', b.dataset.part === this._part));
    const box=document.getElementById('exResults');
    if(box) box.innerHTML=this._pickHtml();
    const cart=document.getElementById('exCart');
    if(cart) cart.innerHTML=this._cartHtml();
    const btn=document.getElementById('exCommit');
    if(btn){
      const n=(this._cart||[]).length;
      btn.disabled=!n;
      btn.textContent = n ? (this._rid !== undefined ? `루틴 저장 (${n}종목)` : `추가 (${n}개)`) : '고른 운동 없음';
    }
  },
  _pickHtml(){
    const hits=this._search(this._part, this._q);
    this._hits=hits;
    const q=String(this._q||'').trim();
    // 목록에 없는 운동도 이름만 쳐서 바로 넣을 수 있다.
    const own = q && !hits.some(h=>h[1]===q)
      ? `<div class="ex-row ex-own" onclick="Fitness.pickOwn()"><span class="ex-row-main"><span class="ex-row-nm">＋ '${esc(q)}' 직접 추가</span><span class="ex-row-part">목록에 없는 운동</span></span></div>` : '';
    if(!hits.length) return own || '<div class="ex-empty">결과가 없습니다</div>';
    const favs=this.getFavs();
    return own + hits.map(([p,n],i)=>{
      const fv=favs.includes(n);
      const th=typeof ExMedia!=='undefined'?ExMedia.thumbFor(n):'';
      return `<div class="ex-row${th?' has-th':''}">
        ${th?`<span class="ex-th" onclick="Fitness.pick(${i})">${ExMedia.poseHtml(th)}</span>`:''}
        <button class="ex-fav${fv?' on':''}" title="즐겨찾기"
          onclick="event.stopPropagation();Fitness.toggleFav('${n.replace(/'/g,'&#39;')}')">${fv?'★':'☆'}</button>
        <span class="ex-row-main" onclick="Fitness.pick(${i})">
          <span class="ex-row-nm">${esc(n)}</span><span class="ex-row-part">${esc(p)}</span>
        </span>
        <a class="ex-yt" href="${this.ytUrl(n)}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()" title="자세 영상">▶</a>
      </div>`;
    }).join('');
  },
  _cartHtml(){
    const c=this._cart||[];
    if(!c.length) return '';
    return `<div class="ex-cart"><div class="ex-cart-hd">고른 운동 ${c.length}개</div>` +
      c.map((x,i)=>`<div class="ex-cart-row">
        <span class="ex-cart-nm">${esc(x.name)}</span>
        <input class="inp inp-sm ex-cart-sets" value="${esc(x.sets)}"
          onchange="Fitness.cartSets(${i}, this.value)" aria-label="세트">
        <button class="ex-cart-del" onclick="Fitness.cartRemove(${i})" aria-label="빼기">✕</button>
      </div>`).join('') + '</div>';
  },
  pick(i){
    const hit=(this._hits||[])[i]; if(!hit) return;
    const name=hit[1];
    if(!this._cart) this._cart=[];
    if(this._cart.some(x=>x.name===name)){ App.showToast('이미 골랐어요'); return; }
    this._cart.push({ name, sets:this.DEFAULT_SETS });
    this._paintPick();
  },
  pickOwn(){
    const name=String(this._q||'').trim().slice(0,40); if(!name) return;
    if(!this._cart) this._cart=[];
    if(this._cart.some(x=>x.name===name)){ App.showToast('이미 골랐어요'); return; }
    this._cart.push({ name, sets:this.DEFAULT_SETS });
    this._paintPick();
  },
  cartSets(i,v){ const x=(this._cart||[])[i]; if(x) x.sets=String(v||'').trim(); },
  cartRemove(i){ if(this._cart){ this._cart.splice(i,1); this._paintPick(); } },
  setPart(p){ this._part = (this._part===p ? null : p); this._paintPick(); },
  setQ(v){ this._q=v; this._paintPick(); },

  showInlineAdd(date) {
    this._cart=[]; this._rid=undefined;
    this._addDate = date ? new Date(date) : new Date();
    const same=this._dateStr(this._addDate)===this._dateStr(new Date());
    this._openPicker(same?'오늘 한 운동 추가':`${this._addDate.getMonth()+1}/${this._addDate.getDate()} 운동 추가`, '', '');
  },
  _openPicker(title, head, extraBtn) {
    this._hits=null; this._part=null; this._q='';
    const routine = this._rid !== undefined;
    const parts=this._parts();
    const n=parts.reduce((a,p)=>a+EX_DB[p].length,0);
    App.openModal('@dumbbell '+title, `${head}
      <div class="ex-parts">
        ${parts.map(p=>`<button class="ex-part" data-part="${p}" onclick="Fitness.setPart('${p}')">${p}</button>`).join('')}
      </div>
      <input id="exSearch" class="inp" autocomplete="off"
        placeholder="운동 검색 — 초성도 됩니다 (예: ㅅㅋㅌ)" oninput="Fitness.setQ(this.value)">
      <div id="exCart"></div>
      <div id="exResults" class="ex-results"></div>
      <p class="ex-hint">${n}개 종목 · ▶ 를 누르면 자세 영상을 찾아줍니다</p>
      <div class="modal-btns">
        <button id="exCommit" onclick="${routine?'Fitness._commitRoutine()':'Fitness.commitCart()'}" class="btn-sm accent" disabled>고른 운동 없음</button>
        ${extraBtn}
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>{ this._paintPick(); if(!routine) document.getElementById('exSearch')?.focus(); },50);
  },

  commitCart() {
    const cart=this._cart||[];
    if(!cart.length){ App.showToast('고른 운동이 없습니다','error'); return; }
    const d=this._addDate||new Date();
    const custom=this.getCustomExercises(d);
    for(const x of cart) custom.push({ name:x.name, sets:x.sets||this.DEFAULT_SETS });
    this.saveCustomExercises(custom,d);
    this._cart=[];
    this.render(d);
    App.closeModal();
    App.showToast(`${cart.length}개 추가됨 ✓`,'success');
  },

  _delCustom(customIdx, dateStr=null) {
    const d=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const custom=this.getCustomExercises(d);
    custom.splice(customIdx,1);
    this.saveCustomExercises(custom,d);
    this.render(d);
  },
};
