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

  // 하루에 여러 번: 요일 값이 문자열이면 한 번, 배열이면 여러 번(예: ['r_웨이트','r_주짓수']).
  picks(dow) {
    const v = this.dayPlan()[dow], R = this.routines();
    const ok = p => ['A','B','C','cardio','rest','none'].includes(p) || R[p];   // 예전 Hevy 루틴 id 는 무시
    let a = (Array.isArray(v) ? v : [v]).filter(p => p && ok(p));
    if (a.length > 1) a = a.filter(p => p !== 'rest' && p !== 'none');
    return a.length ? a : [this._defaultFor(dow)];
  },
  // 요일 값 고치기 — 하나면 문자열, 여럿이면 배열로 저장(예전 데이터와 그대로 맞물린다)
  _setPicks(dp, dow, arr) {
    let a = [...new Set((arr || []).filter(Boolean))];
    if (a.length > 1) a = a.filter(p => p !== 'rest' && p !== 'none');
    dp[dow] = !a.length ? 'none' : a.length === 1 ? a[0] : a;
  },
  planFor(dow) {
    const ps = this.picks(dow);
    if (ps.length === 1) return this._planOne(ps[0], dow);
    const ss = ps.map(p => this._planOne(p, dow));
    return { name: ss.map(x => x.name).join(' + '), src:'multi',
      sessions: ss.map(x => ({ name:x.name, src:x.src, rid:x.rid, day:x.day, pick:x.pick })),
      exercises: ss.flatMap((x, si) => x.exercises.map(e => ({ ...e, sess:si }))) };
  },
  // 한 회차의 계획
  _planOne(pick, dow) {
    const R = this.routines();
    if (!['A','B','C','cardio','rest','none'].includes(pick) && !R[pick]) pick = this._defaultFor(dow);
    const P = this._planOne0(pick, R); P.pick = pick; return P;
  },
  _planOne0(pick, R) {
    if (R[pick]) return { name:R[pick].name, exercises:(R[pick].exercises||[]).map(x=>({ name:x.name, sets:x.sets||'', ...(x.w?{w:x.w}:{}) })), src:'routine', rid:pick };
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
      badge.textContent=plan.src==='multi' ? `하루 ${plan.sessions.length}회` : plan.name;
      // 배지를 누르면 그날 플랜의 자세·중량 가이드가 열린다.
      badge.style.cursor='pointer'; badge.title='자세·추천 중량 가이드';
      badge.onclick=()=> plan.src==='multi' ? Fitness.showDayPlan() : plan.src==='home' ? HomePlan.open(plan.day) : plan.src==='routine' ? Fitness.showRoutineEdit(plan.rid) : Fitness.showDayPlan();
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
    const shortNm = p => p.src==='multi' ? `${p.sessions.length}회` : p.src==='none' ? '—' : String(p.name||'').replace(/^DAY\s*[ABC]\s*/,'').replace(/^내 루틴 · /,'').slice(0,4) || '—';
    const tabs = DOW.map((dn,i)=>`<button class="fit-day${i===dow?' on':''}${i===0?' sun':''}" onclick="Fitness.pickDay(${i}, '${Fitness._dateStr(date)}')"><b>${dn}</b><span>${esc(shortNm(this.planFor(i)))}</span></button>`).join('');
    const container = document.getElementById('fitnessWrap');
    const ds = Fitness._dateStr(date);
    if (this._ed && this._ed.ds !== ds) this._ed = null;   // 다른 날로 옮기면 수정은 접는다
    this._headBtns(!!this._ed, ds, isToday);
    if (this._ed) { this._renderEdit(container, tabs, plan); return; }

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
      <button class="habit-add-btn" onclick="WorkoutHistory.openAll()">기록 보기</button>`;
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
      ${(()=>{ var prevS=-1; return allEx.map((ex,i)=>{
        const A = v => esc(v).replace(/'/g,'&#39;');
        const src = this._thumb(ex, plan);
        const sp = this._sessOf(ex, plan);
        const head = plan.src==='multi' && ex.sess!==prevS ? (prevS=ex.sess, `<div class="fx-sess"><span class="num">${ex.sess!=null?ex.sess+1:'+'}</span><b>${esc(ex.sess!=null?(plan.sessions[ex.sess]?.name||''):'추가한 운동')}</b></div>`) : '';
        const info = ex.hp!=null&&sp.src==='home' ? `HomePlan.open(${sp.day},${ex.hp})`
                   : (typeof ExMedia!=='undefined'&&ExMedia.find(ex.name)) ? `ExMedia.open('${esc(ex.name).replace(/'/g,'&#39;')}')` : '';
        const custom = ex.ci!=null;
        return head + `<div class="fx${on(i)?' done':''}${i===nextI&&(isToday||isPast)&&!on(i)?' next':''}" data-row data-i="${ex.key}" data-label="${esc(ex.name)}" onclick="Fitness.toggle(${i},'${dsx}')">
          <button type="button" class="fx-th${src?'':' none'}" ${info?`onclick="event.stopPropagation();${info}"`:'tabindex="-1"'} aria-label="${esc(ex.name)} 자세 보기">
            ${typeof Icons!=='undefined'?Icons.svg('dumbbell','fx-ic'):''}${src?`<span class="fx-img">${ExMedia.poseHtml(src)}</span>`:''}
          </button>
          <div class="fx-tx"><div class="fx-nm">${esc(ex.name)}</div><div class="fx-sets num">${esc(ex.sets||'')}</div>${this._logLine(ex, dsx)}</div>
          <button type="button" class="fx-act" onclick="event.stopPropagation();PlanGen.openLog('${A(ex.name)}','${A(ex.sets||'')}','${dsx}')" aria-label="무게 기록">${typeof Icons!=='undefined'?Icons.svg('pen','fx-aic'):'기록'}</button>
        </div>`;}).join(''); })()}
      </div>
      ${plan.from ? `<p class="fit-from">${plan.from.slice(5).replace('-','/')} 계획을 오늘 하는 중 · <a href="javascript:Fitness.undoFrom('${dsx}')">되돌리기</a></p>` : ''}
      ${(()=>{ const b=this.burn(d); return b.kcal ? `<div class="fit-burn"><span>운동으로 쓴 열량</span><b class="num">약 ${b.kcal.toLocaleString('ko-KR')}</b><i>kcal</i></div>` : ''; })()}
      <div class="fit-foot">
        <button class="habit-add-btn" onclick="WorkoutHistory.openAll()">기록 보기</button>
      </div>`;
    // 운동 체크가 바뀌면 식단 카드의 '더 먹어도 되는 열량' 도 같이 바뀐다
    try { if (typeof Diet!=='undefined' && document.getElementById('dietWrap')) Diet.render(d); } catch(e) {}
    // 평소에는 보기·체크만 — 교체·순서·빼기는 '수정' 에서
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
  _sessOf(ex, plan) { return plan && plan.src==='multi' ? (plan.sessions[ex.sess] || {}) : (plan || {}); },
  _thumb(ex, plan) {
    plan = this._sessOf(ex, plan);
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
    this._dpOpts = OPTS;
    const rows = DOW.map((d,i) => `<div class="dp-row${i===new Date().getDay()?' dp-today':''}" data-dow="${i}">
        <span class="dp-d">${d}</span>
        <div class="dp-ss">${this.picks(i).map((cur,k)=>this._dpSel(cur,k)).join('')}
          <button type="button" class="dp-add" onclick="Fitness._dpAdd(this)">${this._ic('plus')}<span>한 번 더</span></button>
        </div>
      </div>`).join('');
    const rlist = Object.entries(R).map(([id,r]) => `<div class="rt-row">
        <span class="rt-nm">${esc(r.name)}</span><span class="rt-n"><span class="num">${(r.exercises||[]).length}</span>종목</span>
        <button class="rt-ed" onclick="Fitness.showRoutineEdit('${id}')">편집</button>
      </div>`).join('');
    App.openModal('@dumbbell 요일별 운동', `<div class="fz fz-dp">
      <p class="fz-note">요일마다 할 루틴을 고릅니다. 웨이트 + 주짓수처럼 하루에 두 번 이상 하면 ‘한 번 더’ 를 눌러 주세요.</p>
      <div class="dp-list">${rows}</div>
      <div class="rt-box">
        <div class="fz-lbl">내 루틴</div>
        ${rlist || '<div class="rt-empty">아직 만든 루틴이 없습니다</div>'}
        <button class="fz-act" onclick="Fitness.showRoutineEdit()">${this._ic('plus')}<span>새 루틴 만들기</span></button>
        <button class="fz-act" onclick="PlanGen.open()"><span class="fz-act-tx">맞춤 플랜 다시 만들기<small>목표 · 기구 · 요일 · 제외 기구</small></span>${this._ic('chev','fz-ic-end')}</button>
      </div>
      <div class="modal-btns">
        <button onclick="Fitness._saveDayPlan()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
    setTimeout(()=>document.querySelectorAll('.dp-ss').forEach(b=>this._dpNum(b)), 0);
  },
  _dpSel(cur, k) {
    const opts = (this._dpOpts||[]).map(([v,l]) => `<option value="${v}"${cur===v?' selected':''}>${esc(l)}</option>`).join('');
    return `<div class="dp-s"><span class="dp-n num">${k+1}</span><label class="dp-sw"><select class="inp inp-sm dp-sel">${opts}</select>${this._ic('down','dp-chev')}</label>`
      + `<button type="button" class="dp-x" onclick="Fitness._dpDel(this)" aria-label="이 회차 빼기">${this._ic('x') || '✕'}</button></div>`;
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
  },
  _dpDel(btn) {
    const box = btn.closest('.dp-ss'), ss = box.querySelectorAll('.dp-s');
    if (ss.length <= 1) { const sel = ss[0]?.querySelector('select'); if (sel) sel.value = 'none'; return; }
    btn.closest('.dp-s').remove(); this._dpNum(box);
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
  showRoutineEdit(id) {
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
          <button type="button" class="rt-m on" data-m="add" onclick="Fitness._rtSetMode('add')">같은 날 한 번 더</button>
          <button type="button" class="rt-m" data-m="replace" onclick="Fitness._rtSetMode('replace')">바꾸기</button></div></div>
      <div class="fz-lbl fz-lbl-sec">운동</div>`,
      r ? `<button onclick="Fitness.delRoutine('${id}')" class="btn-danger">루틴 삭제</button>` : '');
  },
  _rtSetMode(m) { this._rtMode = m; document.querySelectorAll('.rt-m').forEach(b => b.classList.toggle('on', b.dataset.m === m)); },
  delRoutine(id) {
    if (!confirm('이 루틴을 삭제할까요? 배정된 요일은 계획 없음이 됩니다.')) return;
    const R = this.routines(); delete R[id]; this.saveRoutines(R);
    const dp = this.dayPlan(); for (let i=0;i<7;i++) { const a = this.picks(i); if (a.includes(id)) this._setPicks(dp, i, a.filter(x => x !== id)); } this.saveDayPlan(dp);
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
    R[id] = { name, exercises: cart.map(x => ({ name:x.name, sets:x.sets||this.defSets(x.name), ...(x.w?{w:x.w}:{}) })) };
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
    App.closeModal(); this.render(App?.S?.selDate || new Date());
    App.showToast(`'${name}' 루틴 저장됨`, 'success');
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
  _parts(){ this._syncMyEx(); const k=Object.keys(typeof EX_DB!=='undefined' ? EX_DB : {}); return k.includes('내 운동') ? ['내 운동', ...k.filter(x=>x!=='내 운동')] : k; },
  _search(part, q){
    if(typeof EX_DB==='undefined') return [];
    this._syncMyEx();
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
    // 띄어쓰기는 보지 않는다 — '원암덤벨' 과 '원 암 덤벨' 이 같은 운동을 찾는다
    const sp=v=>String(v).replace(/\s+/g,'');
    const lower=sp(q.toLowerCase()), qc=sp(q), isCho=/^[ㄱ-ㅎ]+$/.test(qc);
    const out=[];
    for(const [p,n] of src){
      const nm=sp(n.toLowerCase());
      let rank=-1;
      if(isCho){
        const ch=sp(this._cho(n));
        if(ch.startsWith(qc)) rank=1; else if(ch.includes(qc)) rank=3;
      } else {
        if(nm===lower) rank=0;
        else if(nm.startsWith(lower)) rank=1;
        else if(nm.includes(lower)) rank=2;
        else if(sp(this._cho(n)).includes(qc)) rank=4;
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
      btn.textContent = n ? (this._rid !== undefined ? `루틴 저장 · ${n}종목` : `${n}개 추가`) : '운동을 골라 주세요';
    }
  },
  _pickHtml(){
    const hits=this._search(this._part, this._q);
    this._hits=hits;
    const q=String(this._q||'').trim();
    // 목록에 없는 운동도 이름만 쳐서 바로 넣을 수 있다.
    const own = q && !hits.some(h=>h[1].replace(/\s+/g,'')===q.replace(/\s+/g,''))
      ? `<div class="ex-row ex-own" onclick="Fitness.pickOwn()"><span class="ex-th ex-th-own">${this._ic('plus')}</span><span class="ex-row-main"><span class="ex-row-nm">'${esc(q)}' 직접 만들기</span><span class="ex-row-part">목록에 없는 운동</span></span></div>` : '';
    if(!hits.length) return own || '<div class="ex-empty">결과가 없습니다</div>';
    const favs=this.getFavs(), inCart=new Set((this._cart||[]).map(x=>x.name));
    return own + hits.map(([p,n],i)=>{
      const fv=favs.includes(n), got=inCart.has(n);
      const th=typeof ExMedia!=='undefined'?ExMedia.thumbFor(n):'';
      return `<div class="ex-row${th?' has-th':''}${got?' got':''}">
        <span class="ex-th${th?'':' none'}" onclick="Fitness.pick(${i})">${th?ExMedia.poseHtml(th):''}</span>
        <span class="ex-row-main" onclick="Fitness.pick(${i})">
          <span class="ex-row-nm">${esc(n)}</span><span class="ex-row-part">${esc(p)}${got?' · 담음':''}</span>
        </span>
        <button class="ex-fav${fv?' on':''}" title="즐겨찾기" aria-label="즐겨찾기" aria-pressed="${fv}"
          onclick="event.stopPropagation();Fitness.toggleFav('${n.replace(/'/g,'&#39;')}')">${this._ic('star') || (fv?'★':'☆')}</button>
        <a class="ex-yt" href="${this.ytUrl(n)}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()" title="자세 영상" aria-label="자세 영상">${this._ic('play') || '▶'}</a>
      </div>`;
    }).join('');
  },
  _cartHtml(){
    const c=this._cart||[];
    if(!c.length) return '';
    return `<div class="ex-cart"><div class="ex-cart-hd">고른 운동 <span class="num">${c.length}</span></div>` +
      c.map((x,i)=>`<div class="ex-cart-row">
        <span class="ex-cart-nm">${esc(x.name)}</span>
        <input class="inp inp-sm ex-cart-sets num" value="${esc(x.sets)}"
          onchange="Fitness.cartSets(${i}, this.value)" aria-label="세트">
        <button class="ex-cart-del" onclick="Fitness.cartRemove(${i})" aria-label="빼기">${this._ic('x') || '✕'}</button>
      </div>`).join('') + '</div>';
  },
  pick(i){
    const hit=(this._hits||[])[i]; if(!hit) return;
    const name=hit[1];
    if(!this._cart) this._cart=[];
    if(this._cart.some(x=>x.name===name)){ App.showToast('이미 골랐어요'); return; }
    this._cart.push({ name, sets:this.defSets(name) });
    this._paintPick();
  },
  pickOwn(prefill){
    const q = prefill!=null ? prefill : String(this._q||'').trim().slice(0,40);
    this.makeEx(q, name=>{
      if(!this._cart) this._cart=[];
      if(this._cart.some(x=>x.name===name)){ App.showToast('이미 골랐어요'); return; }
      this._cart.push({ name, sets:this.defSets(name) });
      this._paintPick();
    });
  },

  // ── 직접 만든 운동 ─────────────────────
  // 목록에 없는 운동을 이름 + 종류(근력 부위 / 유산소 / 스포츠)로 저장해 두고, 다음부터 검색·교체·추가에 같이 나온다.
  MYEX_KEY: 'gl_fit_myex',   // [{ n:'주짓수 드릴', p:'스포츠' }]
  myEx(){ try{ const v=JSON.parse(UserStore.get(this.MYEX_KEY)||'[]'); return Array.isArray(v)?v.filter(x=>x&&x.n):[]; }catch{ return []; } },
  myPart(n){ const x=this.myEx().find(e=>e.n===n); return x ? x.p : null; },
  _syncMyEx(){
    if(typeof EX_DB==='undefined') return;
    const l=this.myEx(); if(l.length) EX_DB['내 운동']=l.map(x=>x.n); else delete EX_DB['내 운동'];
  },
  saveMyEx(n, p){
    const l=this.myEx().filter(x=>x.n!==n); l.unshift({ n, p }); UserStore.set(this.MYEX_KEY, JSON.stringify(l.slice(0,200)));
    FirebaseSync?.scheduleSave(); this._syncMyEx();
  },
  delMyEx(n){ UserStore.set(this.MYEX_KEY, JSON.stringify(this.myEx().filter(x=>x.n!==n))); FirebaseSync?.scheduleSave(); this._syncMyEx(); },
  defSets(n){ const p=typeof PlanGen!=='undefined'?PlanGen.partOf(n):null; return p==='스포츠' ? '60분' : p==='유산소' ? '30분' : this.DEFAULT_SETS; },
  // 운동 만들기 시트 — 지금 열린 창(고르기·교체) 위에 얹어서, 고르던 목록이 날아가지 않게 한다
  makeEx(name, done){
    document.getElementById('myExSheet')?.remove();
    const PARTS=['가슴','등','어깨','하체','이두','삼두','복근','전완근','전신'];
    this._mx={ done, kind:'str', part:'전신' };
    const old = name ? this.myEx().find(x=>x.n===name) : null;
    if(old){ this._mx.kind = old.p==='스포츠'?'sport':old.p==='유산소'?'cardio':'str'; if(this._mx.kind==='str') this._mx.part=old.p; }
    else if(name && typeof PlanGen!=='undefined'){ const g=(EX_DB['스포츠']||[]).some(x=>name.includes(x)) ? '스포츠' : PlanGen.partOf(name); if(g==='스포츠') this._mx.kind='sport'; else if(g==='유산소') this._mx.kind='cardio'; else if(PARTS.includes(g)) this._mx.part=g; }
    const el=document.createElement('div'); el.id='myExSheet'; el.className='mx-ov';
    el.innerHTML=`<div class="mx-sh" role="dialog" aria-label="운동 직접 만들기">
      <div class="mx-hd"><b>운동 직접 만들기</b><button class="mx-x" onclick="Fitness._mxClose()" aria-label="닫기">${this._ic('x')||'✕'}</button></div>
      <label class="mx-lbl" for="mxName">이름</label>
      <input id="mxName" class="inp" maxlength="40" placeholder="예: 주짓수 드릴, 케이블 크로스오버" value="${esc(name||'')}">
      <div class="mx-lbl">어떻게 하나요</div>
      <div class="mx-seg">
        <button type="button" data-k="str">근력<small>세트 · 횟수 · 무게</small></button>
        <button type="button" data-k="cardio">유산소<small>분</small></button>
        <button type="button" data-k="sport">스포츠<small>분</small></button>
      </div>
      <div class="mx-parts"><div class="mx-lbl">주로 쓰는 부위</div><div class="mx-chips">${PARTS.map(p=>`<button type="button" data-p="${p}">${p}</button>`).join('')}</div></div>
      <button class="mx-go" onclick="Fitness._mxSave()">추가</button>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e=>{
      if(e.target===el) return this._mxClose();
      const k=e.target.closest('[data-k]'), p=e.target.closest('[data-p]');
      if(k){ this._mx.kind=k.dataset.k; this._mxPaint(); }
      if(p){ this._mx.part=p.dataset.p; this._mxPaint(); }
    });
    this._mxPaint();
    requestAnimationFrame(()=>{ el.classList.add('on'); if(!name) document.getElementById('mxName')?.focus(); });
  },
  _mxPaint(){
    const el=document.getElementById('myExSheet'), m=this._mx; if(!el||!m) return;
    el.querySelectorAll('[data-k]').forEach(b=>b.classList.toggle('on', b.dataset.k===m.kind));
    el.querySelectorAll('[data-p]').forEach(b=>b.classList.toggle('on', b.dataset.p===m.part));
    el.querySelector('.mx-parts').hidden = m.kind!=='str';
  },
  _mxClose(){ const el=document.getElementById('myExSheet'); if(el){ el.classList.remove('on'); setTimeout(()=>el.remove(), 200); } this._mx=null; },
  _mxSave(){
    const m=this._mx, n=(document.getElementById('mxName')?.value||'').trim().replace(/\s+/g,' ').slice(0,40);
    if(!m) return;
    if(!n){ App.showToast('운동 이름을 입력해 주세요','error'); return; }
    const p = m.kind==='sport' ? '스포츠' : m.kind==='cardio' ? '유산소' : m.part;
    const inDb = typeof EX_DB!=='undefined' && Object.entries(EX_DB).some(([k,v])=>k!=='내 운동' && v.includes(n));
    if(!inDb) this.saveMyEx(n, p);
    const done=m.done; this._mxClose();
    App.showToast(inDb ? `${n} 을(를) 넣었습니다` : `'${n}' 을(를) 내 운동에 저장했습니다`, 'success');
    try{ done && done(n); }catch(e){ console.warn(e); }
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
    App.openModal('@dumbbell '+title, `<div class="fz fz-pick">${head}
      <input id="exSearch" class="inp" type="search" autocomplete="off"
        placeholder="${n}개 종목에서 검색 · 초성 가능 (ㅅㅋㅌ)" oninput="Fitness.setQ(this.value)">
      <div class="ex-parts">
        ${parts.map(p=>`<button class="ex-part" data-part="${p}" onclick="Fitness.setPart('${p}')">${p}</button>`).join('')}
      </div>
      <button type="button" class="ex-make" onclick="Fitness.pickOwn('')">${this._ic('plus')}<span>목록에 없는 운동 직접 만들기</span></button>
      <div id="exCart"></div>
      <div id="exResults" class="ex-results"></div>
      <div class="modal-btns">
        <button id="exCommit" onclick="${routine?'Fitness._commitRoutine()':'Fitness.commitCart()'}" class="btn-sm accent" disabled>운동을 골라 주세요</button>
        ${extraBtn}
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
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
    App.showToast(`${cart.length}개 추가됨`,'success');
  },

  // ── 운동 하나 고르기(교체·추가 공용) ─────────────
  // 검색어가 없으면 추천(o.recommend), 있으면 전체 종목에서 찾는다(띄어쓰기·초성 상관없이). 목록에 없으면 직접 입력.
  pickOne(o) {
    this._po = o;
    App.openModal('@dumbbell ' + o.title, `<div class="fz fz-po">${o.head||''}
      <input id="poQ" class="inp" type="search" autocomplete="off" placeholder="운동 검색 · 초성 가능" oninput="Fitness._poPaint()">
      <button type="button" class="ex-make" onclick="Fitness._poMake('')">${this._ic('plus')}<span>목록에 없는 운동 직접 만들기</span></button>
      <div id="poList" class="sw-list po-list"></div>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div></div>`);
    setTimeout(()=>this._poPaint(), 0);
  },
  _poRow(n, i, small='') {
    const th = typeof ExMedia!=='undefined' ? ExMedia.thumbFor(n) : '';
    return `<button class="sw-row" onclick="Fitness._poPick(${i})">${th?`<span class="ex-th">${ExMedia.poseHtml(th)}</span>`:`<span class="ex-th none">${typeof Icons!=='undefined'?Icons.svg('dumbbell'):''}</span>`}<span class="sw-nm">${esc(n)}${small?`<small>${small}</small>`:''}</span>${this._ic('chev','fz-ic-end')}</button>`;
  },
  _poPaint() {
    const o=this._po, box=document.getElementById('poList'); if(!o||!box) return;
    const q=(document.getElementById('poQ')?.value||'').trim();
    if(!q){
      const rec=o.recommend||[];
      this._poOwn=-1; this._poNames=rec.map(r=>r.n);
      box.innerHTML = rec.length ? (o.recLabel?`<div class="sw-h">${esc(o.recLabel)}</div>`:'') + rec.map((r,i)=>this._poRow(r.n,i,r.small||'')).join('')
        : '<p class="pg-note">위에 운동 이름을 검색해 주세요.</p>';
      return;
    }
    const hits=this._search(null,q).filter(([,n])=>!(o.exclude||[]).includes(n)).slice(0,40);
    this._poNames=hits.map(h=>h[1]);
    this._poOwn=-1;
    const own = !hits.some(h=>h[1].replace(/\s+/g,'')===q.replace(/\s+/g,'')) ? (this._poNames.push(q.slice(0,40)), this._poOwn=this._poNames.length-1, this._poRow(q.slice(0,40), this._poNames.length-1, '목록에 없는 운동 · 직접 만들기')) : '';
    box.innerHTML = hits.map(([p,n],i)=>this._poRow(n,i,esc(p))).join('') + own || '<p class="pg-note">결과가 없습니다</p>';
  },
  _poPick(i) {
    const n=(this._poNames||[])[i], o=this._po; if(!n||!o) return;
    if(this._poOwn===i) return this._poMake(n);   // 목록에 없는 이름 → 종류를 묻고 저장
    App.closeModal(); this._po=null; o.onPick(n);
  },
  _poMake(name) { const o=this._po; if(!o) return; this.makeEx(name, n=>{ App.closeModal(); this._po=null; o.onPick(n); }); },

  // ── 그날만 바꾼 목록 / 플랜에 적용 ─────────────
  // 수정(카드)이나 운동 모드에서 목록을 바꾸면 '오늘만' 또는 '앞으로 이 플랜에도' 중 하나로 저장한다.
  _dayKey(ds){ return 'gl_fit_day_'+ds; },
  dayOverride(ds){ try{ const v=JSON.parse(UserStore.get(this._dayKey(ds))||'null'); return Array.isArray(v)?v:null; }catch{ return null; } },
  _clean(list){ return list.map(x=>{ const o={ name:x.name, sets:x.sets||this.defSets(x.name) }; if(x.w!==''&&x.w!=null) o.w=x.w; if(x.sess!=null) o.sess=x.sess; return o; }); },
  _noSess(list){ return list.map(({ sess, ...o })=>o); },
  applyList(ds, list, scope) {
    const d=new Date(ds+'T00:00:00'), before=this.exercisesFor(d).list;
    const doneNames=new Set(this._checked(d).map(i=>before[i]?.name).filter(Boolean));
    const items=this._clean(list);
    let msg='오늘 운동만 바꿨습니다';
    if(scope==='plan'){
      const plan=this.planOn(d), dow=plan.from ? new Date(plan.from+'T00:00:00').getDay() : d.getDay();
      const R=this.routines();
      if(plan.src==='multi'){
        // 하루 여러 번: 회차마다 그 회차 루틴에 넣는다(새로 넣은 운동은 마지막 회차로)
        const ss=plan.sessions, ids=[], DOWn='일월화수목금토';
        ss.forEach((x,si)=>{
          const its=this._noSess(items.filter(e=>(e.sess??ss.length-1)===si));
          if(!its.length) return;
          if(x.src==='routine' && R[x.rid]){ R[x.rid].exercises=its; ids.push(x.rid); }
          else { const id='r_'+Date.now().toString(36)+si; R[id]={ name: x.name&&x.name!=='휴식'&&x.name!=='계획 없음' ? x.name : `${DOWn[dow]}요일 ${si+1}회차`, exercises:its }; ids.push(id); }
        });
        this.saveRoutines(R);
        const dp=this.dayPlan(); this._setPicks(dp, dow, ids); this.saveDayPlan(dp);
        msg=`앞으로 ${DOWn[dow]}요일 ${ids.length}회 운동에 적용했습니다`;
      }
      else if(plan.src==='routine' && R[plan.rid]){ R[plan.rid].exercises=this._noSess(items); this.saveRoutines(R); msg=`'${R[plan.rid].name}' 플랜에 적용했습니다`; }
      else {
        const id='r_'+Date.now().toString(36), DOW='일월화수목금토';
        const name = plan.src==='none'||!plan.name||plan.name==='휴식' ? `${DOW[dow]}요일 운동` : plan.name;
        R[id]={ name, exercises:this._noSess(items) }; this.saveRoutines(R);
        const dp=this.dayPlan(); dp[dow]=id; this.saveDayPlan(dp);
        msg=`앞으로 ${DOW[dow]}요일에 '${name}' 으로 합니다`;
      }
      UserStore.set(this._dayKey(ds), '');
    } else UserStore.set(this._dayKey(ds), JSON.stringify(items));
    // 그날 걸어 둔 교체·추가·순서는 이제 목록에 다 들어갔다
    UserStore.set(this._orderKey(ds), '[]');
    if(typeof PlanGen!=='undefined') UserStore.set(PlanGen.SWAP_PREFIX+ds, '{}');
    UserStore.set(this._customKey(d), '[]');
    FirebaseSync?.scheduleSave();
    const after=this.exercisesFor(d).list;
    this._save(after.map((x,i)=>doneNames.has(x.name)?i:-1).filter(i=>i>=0), d);
    return msg;
  },
  // '오늘만 / 앞으로도' 묻기
  askScope(ds, done) {
    const d=new Date(ds+'T00:00:00'), plan=this.planOn(d), DOW='일월화수목금토';
    const dow=plan.from ? new Date(plan.from+'T00:00:00').getDay() : d.getDay();
    const pname = plan.src==='routine' ? `'${plan.name}' 플랜` : plan.src==='home' ? `'${plan.name}'` : `매주 ${DOW[dow]}요일`;
    this._scopeCb=done;
    App.openModal('@dumbbell 바뀐 운동을 어떻게 저장할까요?', `
      <div class="wk-pick">
        <button class="sw-row" onclick="Fitness._scope('day')"><span class="sw-nm"><b>${ds.slice(5).replace('-','/')} 오늘만</b><small>플랜은 그대로 두고 이날 목록만 바꿉니다</small></span></button>
        <button class="sw-row" onclick="Fitness._scope('plan')"><span class="sw-nm"><b>앞으로 ${esc(pname)}에도</b><small>다음부터 이 요일 운동이 이 목록으로 나옵니다</small></span></button>
      </div>
      <div class="modal-btns"><button class="btn-sm" onclick="Fitness._scope(null)">취소</button></div>`);
  },
  _scope(v){ const cb=this._scopeCb; this._scopeCb=null; App.closeModal(); if(cb) cb(v); },

  // ── 카드 수정 모드 ─────────────────────────
  // 평소 카드는 보기·체크만. '수정' 을 눌러야 교체·순서(꾹 눌러 끌기)·세트/무게·빼기·추가가 나온다.
  toggleEdit() {
    const ds=this._dateStr(App?.S?.selDate||new Date());
    if(!this._ed){
      const { list }=this.exercisesFor(new Date(ds+'T00:00:00'));
      this._ed={ ds, list:list.map(x=>({ name:x.name, sets:x.sets||this.defSets(x.name), w:x.w??'', sess:x.sess })), dirty:false };
      this.render(new Date(ds+'T00:00:00')); return;
    }
    const ed=this._ed;
    if(!ed.dirty){ this._ed=null; this.render(new Date(ed.ds+'T00:00:00')); return; }
    this.askScope(ed.ds, scope=>{
      if(!scope) return;   // 취소 — 수정 모드 그대로
      const msg=this.applyList(ed.ds, ed.list, scope);
      this._ed=null; this.render(new Date(ed.ds+'T00:00:00'));
      App.showToast(msg,'success');
    });
  },
  cancelEdit(){ const ed=this._ed; this._ed=null; if(ed) this.render(new Date(ed.ds+'T00:00:00')); },
  _edPaint(){ if(this._ed) this.render(new Date(this._ed.ds+'T00:00:00')); },
  _edSetsLabel(x){
    if(PlanGen.timed(x.name)) return x.sets||'시간';
    const n=WorkoutMode._nSets(x.sets), r=WorkoutMode._reps(x.sets);
    return `${n}세트 × ${r}회${x.w!==''&&x.w!=null&&Number(x.w)>0?` · ${x.w}kg`:''}`;
  },
  edSets(i){
    const x=this._ed?.list[i]; if(!x) return;
    if(PlanGen.timed(x.name)){
      const M=[]; for(let v=5; v<=240; v+=5) M.push(v);
      const cm=+(String(x.sets).match(/(\d+)\s*분/)||[])[1]||60;
      Wheel.open({ title:x.name, cols:[{ vals:M, cur:M.reduce((a,b)=>Math.abs(b-cm)<Math.abs(a-cm)?b:a,60), fmt:v=>v+'분' }],
        done:([m])=>{ x.sets=`${m}분`; x.w=''; this._ed.dirty=true; this._edPaint(); } });
      return;
    }
    const W=[]; for(let v=0; v<=200; v+=2.5) W.push(v);
    const cw=Number(x.w)||0;
    Wheel.open({ title:x.name, cols:[
      { vals:Array.from({length:10},(_,k)=>k+1), cur:WorkoutMode._nSets(x.sets), fmt:v=>v+'세트' },
      { vals:Array.from({length:30},(_,k)=>k+1), cur:WorkoutMode._reps(x.sets), fmt:v=>v+'회' },
      { vals:W, cur:W.reduce((a,b)=>Math.abs(b-cw)<Math.abs(a-cw)?b:a,0), fmt:v=>v?v+'kg':'맨몸' },
    ], done:([n,r,w])=>{ x.sets=`${n}×${r}`; x.w=w||''; this._ed.dirty=true; this._edPaint(); } });
  },
  edSwap(i){
    const x=this._ed?.list[i]; if(!x) return;
    const orig = x.orig && x.orig!==x.name ? x.orig : '';
    const alts = typeof PlanGen!=='undefined' ? PlanGen.alternatives(orig||x.name).filter(a=>a.n!==x.name&&a.n!==orig) : [];
    const eqn = a => ((PlanGen.EQUIP.find(([e])=>e===PlanGen.equipOf(a.n))||[])[1]||'기구')+' 필요';
    this.pickOne({ title:'운동 교체', recLabel:`${x.name} 대신 — 추천`,
      head: orig ? `<p class="pg-note">원래 추천 운동은 <b>${esc(orig)}</b> 입니다. 맨 위에서 되돌릴 수 있습니다.</p>` : '',
      recommend: [...(orig?[{ n:orig, small:'원래 추천 운동 · 되돌리기' }]:[]), ...alts.map(a=>({ n:a.n, small:a.need?eqn(a):'' }))],
      exclude:[x.name],
      onPick:n=>{ if(!x.orig) x.orig=x.name; if(n===x.orig) delete x.orig; if(PlanGen.timed(n)!==PlanGen.timed(x.name)) { x.sets=this.defSets(n); x.w=''; } x.name=n; this._ed.dirty=true; this._edPaint(); } });
  },
  edDel(i){ if(!this._ed) return; this._ed.list.splice(i,1); this._ed.dirty=true; this._edPaint(); },
  edAdd(){
    const favs=this.getFavs();
    this.pickOne({ title:'운동 추가', recLabel: favs.length?'즐겨찾기':'', recommend:favs.map(n=>({ n })),
      onPick:n=>{ this._ed.list.push({ name:n, sets:this.defSets(n), w:'' }); this._ed.dirty=true; this._edPaint(); } });
  },
  edReorder(keys){ const L=this._ed.list; this._ed.list=keys.map(k=>L[+k]).filter(Boolean); this._ed.dirty=true; this._edPaint(); },
  _renderEdit(container, tabs, plan){
    const ed=this._ed;
    container.innerHTML=`
      <div class="fit-days">${tabs}</div>
      <div class="fit-ed-note">꾹 눌러 끌면 순서가 바뀝니다 · 세트·무게를 누르면 바꿉니다</div>
      <div class="fit-list fit-ed">
      ${ed.list.map((x,i)=>{ const src=this._thumb(x, plan); return `<div class="fx fx-ed" data-row data-i="${i}" data-label="${esc(x.name)}">
          <span class="fx-grip" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="fx-th${src?'':' none'}">${typeof Icons!=='undefined'?Icons.svg('dumbbell','fx-ic'):''}${src?`<span class="fx-img">${ExMedia.poseHtml(src)}</span>`:''}</span>
          <div class="fx-tx"><div class="fx-nm">${esc(x.name)}${x.orig?'<span class="fx-sw">교체됨</span>':''}</div>
            <button type="button" class="fx-cfg num" onclick="event.stopPropagation();Fitness.edSets(${i})">${this._edSetsLabel(x)}</button></div>
          <button type="button" class="fx-act" onclick="event.stopPropagation();Fitness.edSwap(${i})" aria-label="운동 교체">⇄</button>
          <button type="button" class="fx-act fx-x" onclick="event.stopPropagation();Fitness.edDel(${i})" aria-label="빼기">✕</button>
        </div>`; }).join('') || '<p class="pg-note" style="padding:12px 0">운동이 없습니다. 아래에서 추가해 주세요.</p>'}
      </div>
      <button class="habit-add-btn" onclick="Fitness.edAdd()">+ 운동 추가</button>
      <div class="fit-ed-btns"><button class="btn-sm" onclick="Fitness.cancelEdit()">취소</button><button class="btn-sm accent" onclick="Fitness.toggleEdit()">${ed.dirty?'저장':'완료'}</button></div>`;
    try { RowUI.paint(container.querySelector('.fit-list'), {
      edit: k => Fitness.edSets(+k), del: k => Fitness.edDel(+k), reorder: order => Fitness.edReorder(order),
    }); } catch(e) { console.warn('RowUI fit-ed', e); }
  },
  _headBtns(editing, dsx, isToday){
    const eb=document.getElementById('fitEditBtn'), sb=document.getElementById('fitStartBtn');
    if(eb){ eb.textContent=editing?'완료':'수정'; eb.classList.toggle('accent', !!editing); }
    if(sb){
      sb.hidden=!!editing;
      const sv=typeof WorkoutMode!=='undefined'&&WorkoutMode.saved();
      sb.textContent = sv&&sv.ex&&sv.ex.length&&sv.ds===this._dateStr(new Date())&&isToday ? `이어서 ${sv.ex.filter(e=>e.done).length}/${sv.ex.length}` : '시작';
      sb.onclick=()=>WorkoutMode.startFor(dsx);
    }
  },

  // ── 운동 소모 열량(추정) ─────────────────
  // 그날 한 운동만 센다: 체크했거나 무게 기록이 있는 종목.
  //   시간 운동(스포츠·유산소): (MET−1) × 몸무게 × 시간.  분은 기록 → 계획(‘60분’) 순.
  //   근력: 한 세트 + 쉬는 시간을 2.5분으로 보고 MET 5. 세트 수는 기록 → 계획 순.
  // 몸무게는 인바디 최근 기록, 없으면 70kg.
  weightKg() {
    try { const r = typeof InBody!=='undefined' && InBody.getRecords().filter(x=>Number(x.wt)>25).pop(); const w = Number(r && r.wt); if (w > 25) return w; } catch(e) {}
    return 70;
  },
  burn(date=new Date()) {
    const d=new Date(date), ds=this._dateStr(d);
    let list=[]; try { list=this.exercisesFor(d).list; } catch(e) { return { kcal:0, items:[], kg:this.weightKg() }; }
    const chk=this._checked(d), log=typeof PlanGen!=='undefined' ? PlanGen.log(ds) : {}, kg=this.weightKg();
    const items=[];
    list.forEach((x,i)=>{
      const L=log[x.name]||[], done=chk.includes(i);
      if(!done && !L.length) return;
      const timed=typeof PlanGen!=='undefined' && PlanGen.timed(x.name);
      let kcal, info;
      if(timed){
        const min=+(String(x.sets||'').match(/(\d+)\s*분/)||[])[1] || (PlanGen.partOf(x.name)==='스포츠'?60:30);
        const met=(typeof EX_MET!=='undefined' && EX_MET[x.name]) || (PlanGen.partOf(x.name)==='스포츠'?6:6);
        kcal=(met-1)*kg*min/60; info=`${min}분`;
      } else {
        const n=L.length || (typeof WorkoutMode!=='undefined' ? WorkoutMode._nSets(x.sets) : 3);
        kcal=(5-1)*kg*(n*2.5)/60; info=`${n}세트`;
      }
      items.push({ name:x.name, kcal:Math.round(kcal), info });
    });
    return { kcal:items.reduce((t,x)=>t+x.kcal,0), items, kg };
  },

  _delCustom(customIdx, dateStr=null) {
    const d=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const custom=this.getCustomExercises(d);
    custom.splice(customIdx,1);
    this.saveCustomExercises(custom,d);
    this.render(d);
  },
};
