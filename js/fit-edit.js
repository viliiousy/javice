// js/fit-edit.js — 그날만 바꾼 목록 · 플랜 적용 · 카드 수정 모드
// fitness.js 의 Fitness 에서 떼어 낸 부분. fitness.js 다음에 읽는다(같은 객체에 메서드를 더한다).
Object.assign(Fitness, {
  // ── 그날만 바꾼 목록 / 플랜에 적용 ─────────────
  // 수정(카드)이나 운동 모드에서 목록을 바꾸면 '오늘만' 또는 '앞으로 이 플랜에도' 중 하나로 저장한다.
  _dayKey(ds){ return 'gl_fit_day_'+ds; },
  dayOverride(ds){ try{ const v=JSON.parse(UserStore.get(this._dayKey(ds))||'null'); return Array.isArray(v)?v:null; }catch{ return null; } },
  _clean(list){ return list.map(x=>{ const o={ name:x.name, sets:x.sets||this.defSets(x.name) }; if(x.w!==''&&x.w!=null) o.w=x.w; if(x.sess!=null) o.sess=x.sess; if(x.hp!=null) o.hp=x.hp; return o; }); },
  _noSess(list){ return list.map(({ sess, hp, ...o })=>o); },
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
          else { const id='r_'+Date.now().toString(36)+si, lb=(x.src==='free'||x.src==='part') && typeof PlanGen!=='undefined' ? PlanGen.dayLabel(its.map(e=>e.name)) : x.name;
            R[id]={ name: lb&&lb!=='휴식'&&lb!=='계획 없음' ? lb : `${DOWn[dow]}요일 ${si+1}회차`, exercises:its }; ids.push(id); }
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
      UserStore.set(this._xsKey(ds), '');   // 그날만 더한 회차도 이제 플랜(요일)에 들어갔다
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
      this._ed={ ds, list:list.map(x=>({ name:x.name, sets:x.sets||this.defSets(x.name), w:x.w??'', sess:x.sess, ...(x.hp!=null?{hp:x.hp}:{}) })), dirty:false };
      this.render(new Date(ds+'T00:00:00')); return;
    }
    // 바꿀 때마다 이미 저장했으므로 '완료' 는 수정 모드를 닫기만 한다
    const ed=this._ed; this._ed=null; this.render(new Date(ed.ds+'T00:00:00'));
    if(ed.saved) App.showToast('오늘 운동을 저장했습니다','success');
  },
  cancelEdit(){ this.toggleEdit(); },
  // 교체·추가·빼기·순서·세트를 바꾸면 그 자리에서 '오늘만' 으로 저장한다(취소·저장 단추 없이)
  _edPaint(){
    const ed=this._ed; if(!ed) return;
    if(ed.dirty){ try{ this._pruneSessions(ed); this.applyList(ed.ds, ed.list, 'day'); ed.saved=true; ed.dirty=false; }catch(e){ console.warn('[fit auto-save]', e); } }
    this.render(new Date(ed.ds+'T00:00:00'));
  },
  // 지금 목록을 앞으로 이 요일(플랜)에도
  edToPlan(){
    const ed=this._ed; if(!ed) return;
    const msg=this.applyList(ed.ds, ed.list, 'plan');
    this._ed=null; this.render(new Date(ed.ds+'T00:00:00'));
    App.showToast(msg,'success');
  },
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
      onPick:n=>{ if(!x.orig) { x.orig=x.name; x.hp0=x.hp; } if(n===x.orig) { delete x.orig; if(x.hp0!=null) x.hp=x.hp0; } else delete x.hp; if(PlanGen.timed(n)!==PlanGen.timed(x.name)) { x.sets=this.defSets(n); x.w=''; } x.name=n; this._ed.dirty=true; this._edPaint(); } });
  },
  edDel(i){ if(!this._ed) return; this._ed.list.splice(i,1); this._ed.dirty=true; this._edPaint(); },
  edReorder(keys){ const L=this._ed.list; this._ed.list=keys.map(k=>L[+k]).filter(Boolean); this._ed.dirty=true; this._edPaint(); },
  _renderEdit(container, tabs, plan){
    const ed=this._ed;
    container.innerHTML=`
      <div class="fit-days">${tabs}</div>
      <div class="fit-ed-note">꾹 눌러 끌면 순서 · 왼쪽으로 밀면 삭제 · 세트·무게를 누르면 바꿉니다</div>
      <div class="fit-list fit-ed">
      ${(()=>{ let prevS=-1; const ord=this._sessOrd(ed.list), multi=plan&&plan.src==='multi'&&ord.size>=2; return ed.list.map((x,i)=>{ const src=this._thumb(x, plan);
        const head = multi && x.sess!==prevS ? (prevS=x.sess, this._sessHead(plan, x.sess, ed.list, ord)) : '';
        const nx=ed.list[i+1], tail = multi && (!nx || nx.sess!==x.sess) ? `<button type="button" class="habit-add-btn fx-sess-add" onclick="Fitness.edAdd(${x.sess==null?'null':x.sess})">+ ${ord.get(x.sess)||''}회차에 종목 추가</button>` : '';
        return head + `<div class="fx fx-ed" data-row data-i="${i}" data-label="${esc(x.name)}">
          <span class="fx-grip" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="fx-th${src?'':' none'}">${typeof Icons!=='undefined'?Icons.svg('dumbbell','fx-ic'):''}${src?`<span class="fx-img">${ExMedia.poseHtml(src)}</span>`:''}</span>
          <div class="fx-tx"><div class="fx-nm">${esc(x.name)}${x.orig?'<span class="fx-sw">교체됨</span>':''}</div>
            <button type="button" class="fx-cfg num" onclick="event.stopPropagation();Fitness.edSets(${i})">${this._edSetsLabel(x)}</button></div>
          <button type="button" class="fx-act" onclick="event.stopPropagation();Fitness.edSwap(${i})" aria-label="운동 교체">⇄</button>
        </div>` + tail; }).join(''); })() || '<p class="pg-note" style="padding:12px 0">운동이 없습니다. 아래에서 추가해 주세요.</p>'}
      </div>
      <div class="fit-ed-adds">${this._sessOrd(ed.list).size>=2 && plan && plan.src==='multi' ? '' : '<button class="habit-add-btn" onclick="Fitness.edAdd()">+ 종목 추가</button>'}<button class="habit-add-btn" onclick="Fitness.edAddSet()">+ 루틴 추가</button></div>
      <div class="fit-ed-btns"><span class="fit-ed-saved">${ed.saved?'바꾼 내용은 바로 저장됩니다 · 오늘만':'바꾸면 바로 저장됩니다'}</span>${ed.saved?`<button class="btn-sm" onclick="Fitness.edToPlan()">앞으로 이 요일에도</button>`:''}<button class="btn-sm accent" onclick="Fitness.toggleEdit()">완료</button></div>`;
    try { RowUI.paint(container.querySelector('.fit-list'), {
      edit: k => Fitness.edSets(+k), del: k => Fitness.edDel(+k), reorder: order => Fitness.edReorder(order),
    }); } catch(e) { console.warn('RowUI fit-ed', e); }
  },
  _headBtns(editing, dsx, isToday){
    const eb=document.getElementById('fitEditBtn'), sb=document.getElementById('fitStartBtn');
    // 수정은 운동 줄을 꾹 눌러 들어간다 — 단추는 수정 중(완료)과, 꾹 누를 줄이 없는 빈 날(수정)에만
    if(eb){ eb.textContent=editing?'완료':'수정'; eb.hidden=!editing && this._nEx>0; eb.classList.toggle('accent', !!editing); }
    if(sb){
      sb.hidden=!!editing;
      const sv=typeof WorkoutMode!=='undefined'&&WorkoutMode.saved();
      sb.textContent = sv&&sv.ex&&sv.ex.length&&sv.ds===this._dateStr(new Date())&&isToday ? `이어서 ${sv.ex.filter(e=>e.done).length}/${sv.ex.length}` : '시작';
      sb.onclick=()=>WorkoutMode.startFor(dsx);
    }
  },

  // 그날 총 볼륨 · 세트 · 소모 열량 (누르면 추이)
  // 직전에 보여 준 값(같은 날) — 바뀌면 거기서부터 숫자가 올라간다
  _totShown: null,
  // 세 숫자 모두 '오늘 목록을 전부 했을 때' 추정치 — 이미 한 세트는 기록한 무게·횟수, 안 한 세트는 권장 무게·횟수로 센다.
  // 실제로 한 만큼은 작은 글씨(한 것 …)로 같이 보인다. 체크하기 전에도 숫자가 바로 보인다.
  _est(ds){
    const o={ vol:0, sets:0, reps:0 };
    try{
      const ex=WorkoutMode._build(ds), seen=new Set(ex.map(e=>e.name)), L=PlanGen.log(ds);
      ex.forEach(e=>{ if(e.cardio) return; e.rows.forEach(r=>{ const w=Number(r.w)||0, n=Number(r.r)||0; o.sets++; o.reps+=n; o.vol+=w*n; }); });
      Object.entries(L).forEach(([n,ss])=>{ if(seen.has(n)||PlanGen.timed(n)) return; (ss||[]).forEach(x=>{ const w=Number(x.w)||0, r=Number(x.r)||0; o.sets++; o.reps+=r; o.vol+=w*r; }); });
    }catch(e){}
    return o;
  },
  _totHtml(d){ try{ const ds=this._dateStr(d), t=WorkoutHistory.day(ds, true), es=this._est(ds), b={ kcal:this.burn(d, true).kcal };
    const w=this._totShown&&this._totShown.ds===ds?this._totShown:{vol:es.vol,sets:es.sets,kcal:b.kcal}; this._totShown={ds,vol:es.vol,sets:es.sets,kcal:b.kcal};
    const cu=(k,v)=>`data-cu="n" data-from="${Math.round(w[k]||0)}" data-to="${Math.round(v)}"`, K=v=>Math.round(v).toLocaleString('ko-KR');
    // 그날 실제로 든 총 볼륨만 한 사물(들어 올린 무게 단계) 아이콘 — 오른쪽에
    const vt=typeof VolTier!=='undefined'&&t.vol>=70?VolTier.tier(t.vol):null;
    const vic=vt&&vt.now?`<span class="ft-vic" title="${esc(vt.now[0])}만큼">${VolTier.img(vt.lv,'ftr-ic')}<small>${esc(vt.now[0])}</small></span>`:'';
    return (b.kcal||es.sets||t.sets) ? `<button type="button" class="fit-burn fit-tot" onclick="WorkoutHistory.openAll()">
        <span class="ft-c"><b class="num" ${cu('vol',es.vol)}>${K(w.vol||0)}</b><i>kg</i><small>${t.vol>0?`예상 · 한 것 ${K(t.vol)}`:'예상 총 볼륨'}</small></span>
        <span class="ft-c"><b class="num" ${cu('sets',es.sets)}>${w.sets||0}</b><i>세트</i><small>${t.sets>0?`예상 · 한 것 ${t.sets}`:`예상 ${K(es.reps)}회`}</small></span>
        <span class="ft-c"><b class="num" ${cu('kcal',b.kcal)}>${K(w.kcal||0)}</b><i>kcal</i><small>예상 소모</small></span>
        ${vic}<span class="ft-go">추이</span></button>${typeof VolTier!=='undefined'?VolTier.chip(d):''}` : (typeof VolTier!=='undefined'?VolTier.chip(d):''); }catch(e){ return ''; } },
});
