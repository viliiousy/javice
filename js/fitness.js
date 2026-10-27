// js/fitness.js — 운동 트래커 (날짜별 기록 + 인라인 추가)

const Fitness = {
  // 날짜별 커스텀 운동 추가 저장
  _dateStr(date) {
    const d=new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _customKey(date){ return `gl_fitness_custom_${this._dateStr(date)}`; },
  getCustomExercises(date=new Date()){
    const v=UserStore.parse(this._customKey(date), []); return Array.isArray(v)?v:[];
  },
  saveCustomExercises(v,date=new Date()){
    UserStore.set(this._customKey(date),JSON.stringify(v));
    FirebaseSync?.scheduleSave();
  },

  _checkKey(date){ return `gl_fitness_${this._dateStr(date)}`; },
  _checked(date=new Date()){ const v=UserStore.parse(this._checkKey(date), []); return Array.isArray(v)?v:[]; },
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
  // 읽기 전용(고치지 말 것) — 카드 한 번 그릴 때 요일 7개 × 여러 번 부른다
  _dpRO() { const v = UserStore.json(this.DAYPLAN_KEY, null); return (v && typeof v === 'object') ? v : {}; },
  _rtRO() { const v = UserStore.json(this.ROUTINE_KEY, null); return (v && typeof v === 'object') ? v : {}; },
  picks(dow) {
    const v = this._dpRO()[dow], R = this._rtRO();
    const ok = p => ['A','B','C','cardio','rest','none'].includes(p) || R[p] || String(p).startsWith('part:') || String(p).startsWith('sport:');   // 예전 Hevy 루틴 id 는 무시
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
  planFor(dow, extra) {
    let ps = this.picks(dow);
    // 그날만 더한 회차(오늘의 운동 › 루틴 추가) — 휴식·계획 없음 위에 더하면 그 회차만 남는다
    if (extra && extra.length) { ps = [...ps, ...extra]; if (ps.length > 1) ps = ps.filter(p => p !== 'rest' && p !== 'none'); }
    if (ps.length === 1) return this._planOne(ps[0], dow);
    const ss = ps.map(p => this._planOne(p, dow));
    return { name: ss.map(x => x.name).join(' + '), src:'multi',
      sessions: ss.map(x => ({ name:x.name, src:x.src, rid:x.rid, day:x.day, pick:x.pick })),
      exercises: ss.flatMap((x, si) => x.exercises.map(e => ({ ...e, sess:si }))) };
  },
  // 한 회차의 계획
  _planOne(pick, dow) {
    const R = this._rtRO();
    if (!['A','B','C','cardio','rest','none'].includes(pick) && !R[pick] && !String(pick).startsWith('part:') && !String(pick).startsWith('sport:') && pick !== 'free') pick = this._defaultFor(dow);
    const P = this._planOne0(pick, R); P.pick = pick; return P;
  },
  _planOne0(pick, R) {
    // 부위로 고른 날: '가슴', '가슴,어깨' — 맞춤 플랜 규칙으로 그 부위 운동을 짠다
    if (String(pick).startsWith('part:') && typeof PlanGen !== 'undefined') {
      const parts = pick.slice(5).split(',').filter(Boolean);
      return { name: parts.join('·'), exercises: PlanGen.dayFor(parts), src: 'part', parts };
    }
    // 그날만 직접 고른 종목 묶음(루틴 추가 › 부위에서 종목 고르기) — 운동은 그날 목록에 들어 있고, 이름은 운동으로 정한다
    if (pick === 'free') return { name:'', exercises:[], src:'free' };
    // 스포츠 하나로 고른 날: 그 종목 한 줄(시간 운동)
    if (String(pick).startsWith('sport:')) { const n = pick.slice(6); return { name:n, exercises:[{ name:n, sets:this.defSets(n) }], src:'day' }; }
    if (R[pick]) return { name:R[pick].name, exercises:(R[pick].exercises||[]).map(x=>({ name:x.name, sets:x.sets||'', ...(x.w?{w:x.w}:{}) })), src:'routine', rid:pick };
    if (pick === 'none')   return { name:'계획 없음', exercises:[], src:'none' };
    if (pick === 'rest')   return { name:'휴식', exercises:[], src:'day' };
    if (pick === 'cardio') return { ...this.CARDIO, src:'day' };
    return this.homeDay(pick) || { name:'휴식', exercises:[], src:'day' };
  },

  render(date=new Date(), planIdx=null) {
    // 피트니스 카드가 없는 레이아웃에서는 조용히 종료
    if (!document.getElementById('fitnessWrap')) return;
    this._renameAuto();
    try { if (typeof WorkoutMode!=='undefined') WorkoutMode.staleCheck(); } catch(e) {}
    const d    = new Date(date);
    // 다 그린 뒤 들어 올린 무게·총 볼륨 숫자가 올라가고 줄이 미끄러지게
    setTimeout(()=>{ try{ if(typeof VolTier!=='undefined') VolTier.anim(document.getElementById('fitnessWrap')); }catch(e){} }, 0);
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
      // 이름 대신 실제 운동으로 부위를 판단해 보여 준다 — 한 게 있으면 한 운동, 없으면 계획한 운동 기준
      const lg=typeof PlanGen!=='undefined'?PlanGen.log(this._dateStr(d)):{}, doneNm=[...new Set(allEx.filter((_,i)=>chk.includes(i)).map(x=>x.name).concat(Object.keys(lg).filter(n=>(lg[n]||[]).length)))];
      const auto=typeof PlanGen!=='undefined' ? PlanGen.dayLabel(doneNm.length?doneNm:allEx.map(x=>x.name)) : '';
      const nS=this._nSess(allEx);
      badge.textContent=(nS>=2 ? `하루 ${nS}회 · ` : '')+(auto || (plan.src==='multi' ? '' : plan.name));
      badge.dataset.done=doneNm.length?'1':'';
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
    // 한 주는 월요일부터(월 화 수 목 금 토 일) — 토요일은 파랑, 일요일은 빨강
    const tabs = [1,2,3,4,5,6,0].map(i=>`<button class="fit-day${i===dow?' on':''}${i===0?' sun':''}${i===6?' sat':''}" onclick="Fitness.pickDay(${i}, '${Fitness._dateStr(date)}')"><b>${DOW[i]}</b><span>${esc(shortNm(this.planFor(i)))}</span></button>`).join('');
    const container = document.getElementById('fitnessWrap');
    const ds = Fitness._dateStr(date);
    if (this._ed && this._ed.ds !== ds) this._ed = null;   // 다른 날로 옮기면 수정은 접는다
    this._nEx = allEx.length; this._headBtns(!!this._ed, ds, isToday);
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
      ${this._totHtml(d)}
      <button class="habit-add-btn" onclick="WorkoutHistory.openAll()">기록 · 추이 보기</button>`;
      return;
    }

    const on  = i => chk.includes(i);

    const done=allEx.filter((_,i)=>on(i)).length;
    const pct=Math.round(done/allEx.length*100);

    const dsx = Fitness._dateStr(date);
    // 다음에 할 운동 = 아직 안 한 것 중 첫 번째
    const nextI = allEx.findIndex((_,i)=>!on(i));
    // 종목마다 예상 소모 열량(전부 했을 때) — 끝낸 종목은 기록한 세트로
    let bk = {}; try { bk = Object.fromEntries(this.burn(d, true).items.map(x=>[x.name, x.kcal])); } catch(e) {}
    container.innerHTML=`
      <div class="fit-days">${tabs}</div>
      <div class="fit-prog"><div class="fit-prog-bar"><i style="width:${pct}%"></i></div><span class="num">${done} / ${allEx.length}</span></div>
      <div class="fit-list">
      ${(()=>{ var prevS=-1; const ord=this._sessOrd(allEx), multi=plan.src==='multi'&&ord.size>=2; return allEx.map((ex,i)=>{
        const A = v => esc(v).replace(/'/g,'&#39;');
        const src = this._thumb(ex, plan);
        const sp = this._sessOf(ex, plan);
        const head = multi && ex.sess!==prevS ? (prevS=ex.sess, this._sessHead(plan, ex.sess, allEx, ord)) : '';
        const info = ex.hp!=null&&sp.src==='home' ? `HomePlan.open(${sp.day},${ex.hp})`
                   : (typeof ExMedia!=='undefined'&&ExMedia.find(ex.name)) ? `ExMedia.open('${esc(ex.name).replace(/'/g,'&#39;')}')` : '';
        const custom = ex.ci!=null;
        return head + `<div class="fx${on(i)?' done':''}${i===nextI&&(isToday||isPast)&&!on(i)?' next':''}" data-row data-i="${ex.key}" data-label="${esc(ex.name)}" onclick="Fitness.toggle(${i},'${dsx}')">
          <button type="button" class="fx-th${src?'':' none'}" ${info?`onclick="event.stopPropagation();${info}"`:'tabindex="-1"'} aria-label="${esc(ex.name)} 자세 보기">
            ${typeof Icons!=='undefined'?Icons.svg('dumbbell','fx-ic'):''}${src?`<span class="fx-img">${ExMedia.poseHtml(src)}</span>`:''}
          </button>
          <div class="fx-tx"><div class="fx-nm">${esc(ex.name)}</div><div class="fx-sets num">${esc(this.setsLabel(ex.sets||''))}${bk[ex.name]?`<span class="fx-kc"> · 약 ${bk[ex.name].toLocaleString('ko-KR')}kcal</span>`:''}</div>${this._logLine(ex, dsx)}</div>
          ${typeof PlanGen!=='undefined' && PlanGen.timed(ex.name)
            ? `<button type="button" class="fx-act" onclick="event.stopPropagation();Fitness.timeSheet('${A(ex.name)}','${dsx}')" aria-label="운동 시간 고치기">${typeof Icons!=='undefined'?Icons.svg('pen','fx-aic'):'시간'}</button>`
            : `<button type="button" class="fx-act" onclick="event.stopPropagation();PlanGen.openLog('${A(ex.name)}','${A(ex.sets||'')}','${dsx}')" aria-label="무게 기록">${typeof Icons!=='undefined'?Icons.svg('pen','fx-aic'):'기록'}</button>`}
        </div>`;}).join(''); })()}
      </div>
      ${plan.from ? `<p class="fit-from">${plan.from.slice(5).replace('-','/')} 계획을 오늘 하는 중 · <a href="javascript:Fitness.undoFrom('${dsx}')">되돌리기</a></p>` : ''}
      ${this._totHtml(d)}
      <div class="fit-foot">
        <button class="habit-add-btn" onclick="Fitness.partSheet('${dsx}')">오늘 부위 바꾸기</button>
        <button class="habit-add-btn" onclick="WorkoutHistory.openAll()">기록 · 추이 보기</button>
      </div>`;
    // 운동 체크가 바뀌면 식단 카드의 '더 먹어도 되는 열량' 도 같이 바뀐다
    try { if (typeof Diet!=='undefined' && document.getElementById('dietWrap')) Diet.render(d); } catch(e) {}
    // 평소에는 보기·체크만 — 운동 줄을 꾹 누르면 수정(교체·순서·세트·빼기·추가)으로 들어간다
    this._bindHoldEdit(container);
  },
  _bindHoldEdit(container) {
    container.querySelectorAll('.fit-list .fx[data-row]').forEach(row => {
      let t = null, sx = 0, sy = 0;
      const clear = () => { clearTimeout(t); t = null; };
      row.addEventListener('pointerdown', e => { if (e.button > 0 || e.target.closest('.fx-th,.fx-edit,button')) return; sx = e.clientX; sy = e.clientY; clear();
        t = setTimeout(() => { t = null; this._holdFired = Date.now(); try { Haptic.medium(); } catch (er) {} this.toggleEdit(); }, 450); });
      row.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
      row.addEventListener('pointerup', clear); row.addEventListener('pointercancel', clear); row.addEventListener('pointerleave', clear);
      row.addEventListener('contextmenu', e => e.preventDefault());
      // 꾹 누른 뒤 손을 떼며 생기는 '누름' 이 체크로 이어지지 않게
      row.addEventListener('click', e => { if (this._holdFired && Date.now() - this._holdFired < 800) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    });
  },

  undoFrom(ds) { const d=new Date(ds+'T00:00:00'); this._save([], d); UserStore.set(this._orderKey(ds), '[]'); UserStore.set(PlanGen.SWAP_PREFIX+ds, '{}'); UserStore.set(this._fromKey(ds), ''); UserStore.set(this._xsKey(ds), ''); FirebaseSync?.scheduleSave(); this.render(new Date(ds+'T00:00:00')); },

  // 그날 기록(무게×횟수)이 있으면 그것을, 없으면 지난 기록으로 본 오늘 권장 무게를 한 줄로
  _logLine(ex, ds) {
    if (typeof PlanGen==='undefined') return '';
    if (PlanGen.timed(ex.name)) return '';   // 유산소·스포츠는 시간만(위 줄) — 무게 권장·기록 줄 없음
    const L = PlanGen.log(ds)[ex.name];
    if (L && L.length) return `<div class="fx-log num">${esc(this.setsLine(L))}</div>`;
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
  // 예전 자동 플랜 이름(푸시·풀·상체 A …)을 부위 이름으로 한 번 바꾼다 — 사용자가 직접 지은 이름은 건드리지 않는다
  _renameAuto() {
    if (this._renamed || typeof PlanGen === 'undefined' || !PlanGen.partLabel) return; this._renamed = true;
    const R = this.routines(); let ch = false; const seen = {};
    for (const [id, r] of Object.entries(R)) {
      if (!r.auto || r.named || !/^(푸시|풀|하체|상체|전신)( [AB])?( \d)?$/.test(r.name)) continue;
      const lb = PlanGen.partLabel(r.exercises); if (!lb) continue;
      seen[lb] = (seen[lb] || 0) + 1; r.name = seen[lb] > 1 ? `${lb} ${seen[lb]}` : lb; ch = true;
    }
    if (ch) this.saveRoutines(R);
  },
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
  // 그 주(월요일 시작)의 i 요일(0=일 … 6=토) 날짜 — 일요일은 그 주의 마지막 날
  _dowDate(i, base) {
    const d = new Date(base);
    d.setDate(d.getDate() + (((i + 6) % 7) - ((d.getDay() + 6) % 7)));
    return d;
  },


  _delCustom(customIdx, dateStr=null) {
    const d=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const custom=this.getCustomExercises(d);
    custom.splice(customIdx,1);
    this.saveCustomExercises(custom,d);
    this.render(d);
  },
};
