// js/fitness.js — 운동 트래커 (날짜별 기록 + 인라인 추가)

const Fitness = {
  PLAN: {
    0:{ name:'휴식',        emoji:'😴', exercises:[] },
    1:{ name:'가슴 + 삼두', emoji:'💪', exercises:[
      {name:'벤치프레스',sets:'4×10'},{name:'인클라인 덤벨 프레스',sets:'3×12'},
      {name:'케이블 플라이',sets:'3×15'},{name:'딥스',sets:'3×12'},
      {name:'케이블 푸시다운',sets:'3×15'},{name:'오버헤드 익스텐션',sets:'3×12'}]},
    2:{ name:'등 + 이두',   emoji:'🔙', exercises:[
      {name:'데드리프트',sets:'4×8'},{name:'랫풀다운',sets:'4×12'},
      {name:'시티드 로우',sets:'3×12'},{name:'원암 덤벨 로우',sets:'3×12'},
      {name:'바벨 컬',sets:'3×12'},{name:'해머 컬',sets:'3×12'}]},
    3:{ name:'어깨 + 팔',   emoji:'🦾', exercises:[
      {name:'오버헤드 프레스',sets:'4×10'},{name:'레터럴 레이즈',sets:'4×15'},
      {name:'페이스 풀',sets:'3×15'},{name:'업라이트 로우',sets:'3×12'},
      {name:'케이블 컬',sets:'3×15'},{name:'스컬크러셔',sets:'3×12'}]},
    4:{ name:'하체',        emoji:'🦵', exercises:[
      {name:'스쿼트',sets:'5×8'},{name:'레그 프레스',sets:'4×12'},
      {name:'레그 컬',sets:'3×15'},{name:'레그 익스텐션',sets:'3×15'},
      {name:'카프 레이즈',sets:'4×20'},{name:'힙 쓰러스트',sets:'3×12'}]},
    5:{ name:'크로스핏+복근', emoji:'🔥', exercises:[
      {name:'크로스핏 WOD',sets:'1세션'},{name:'시티드 니업',sets:'50개'},
      {name:'크런치',sets:'50개'},{name:'레그레이즈',sets:'50개'},
      {name:'오블리크 크런치',sets:'50개'},{name:'바이시클 킥',sets:'100개'},
      {name:'플랭크',sets:'1분30초'}]},
    6:{ name:'유산소+주짓수', emoji:'🥋', exercises:[
      {name:'Zone 2 유산소',sets:'30-45분'},{name:'주짓수',sets:'1세션'}]},
  },

  // 날짜별 커스텀 운동 추가 저장
  _customKey(date){ return `gl_fitness_custom_${new Date(date).toDateString()}`; },
  getCustomExercises(date=new Date()){
    return JSON.parse(localStorage.getItem(this._customKey(date))||'[]');
  },
  saveCustomExercises(v,date=new Date()){
    localStorage.setItem(this._customKey(date),JSON.stringify(v));
  },

  _checkKey(date){ return `gl_fitness_${new Date(date).toDateString()}`; },
  _checked(date=new Date()){ return JSON.parse(localStorage.getItem(this._checkKey(date))||'[]'); },
  _save(v,date=new Date()){ localStorage.setItem(this._checkKey(date),JSON.stringify(v)); },

  render(date=new Date(), planIdx=null) {
    // 피트니스 카드가 없는 레이아웃에서는 조용히 종료
    if (!document.getElementById('fitnessWrap')) return;
    const d    = new Date(date);
    const dow  = planIdx!==null ? planIdx : d.getDay();
    const plan = this.PLAN[dow];
    const chk  = this._checked(d);
    const custom = this.getCustomExercises(d);
    const isToday = d.toDateString()===new Date().toDateString();
    const allEx = [...plan.exercises, ...custom];

    // 카드 타이틀
    const titleEl = document.querySelector('.card-fitness .card-title');
    if (titleEl) {
      if (isToday) titleEl.textContent='💪 오늘의 운동';
      else {
        const ds=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
        titleEl.textContent=`💪 ${ds} 운동`;
      }
    }

    const badge = document.getElementById('fitBadge');
    if (badge) {
      badge.textContent=`${plan.emoji} ${plan.name}`;
      badge.className=allEx.length?'badge badge-accent':'badge';
    }

    const container = document.getElementById('fitnessWrap');
    if (!allEx.length) {
      container.innerHTML=`<div style="text-align:center;padding:24px 16px;color:var(--text2)">
        <div style="font-size:48px;margin-bottom:10px">😴</div>
        <p>휴식일입니다.<br><span style="color:var(--text3);font-size:12px">잘 쉬어주세요!</span></p>
      </div>${isToday?'<div class="habit-add-btn" onclick="Fitness.showInlineAdd()">+ 운동 추가</div>':''}`;
      return;
    }

    const DOW=['일','월','화','수','목','금','토'];
    const done=allEx.filter((_,i)=>chk.includes(i)).length;
    const pct=Math.round(done/allEx.length*100);

    // 탭: 요일별
    const tabs=DOW.map((d,i)=>`<button class="fit-tab${i===dow?' active':''}" onclick="Fitness.render(new Date('${new Date(date).toDateString()}'),${i})">${d}</button>`).join('');

    container.innerHTML=`
      <div class="fit-tabs">${tabs}</div>
      ${allEx.map((ex,i)=>`
        <div class="ex-item${chk.includes(i)?' done':''}" onclick="Fitness.toggle(${i},'${new Date(date).toDateString()}')">
          <div class="ex-chk">${chk.includes(i)?'✓':''}</div>
          <span class="ex-name">${esc(ex.name)}</span>
          <span class="ex-sets">${ex.sets}</span>
          ${i>=plan.exercises.length&&isToday?`<button class="task-del" onclick="event.stopPropagation();Fitness._delCustom(${i-plan.exercises.length},'${new Date(date).toDateString()}')">✕</button>`:''}
        </div>`).join('')}
      ${isToday?'<div class="habit-add-btn" onclick="Fitness.showInlineAdd()">+ 운동 추가</div>':''}
      <div class="fit-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-txt">${done}/${allEx.length} (${pct}%)</span>
      </div>`;
  },

  toggle(idx, dateStr=null) {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (d.toDateString()!==new Date().toDateString()) return;
    const chk=this._checked(d);
    const i=chk.indexOf(idx);
    if (i===-1) chk.push(idx); else chk.splice(i,1);
    this._save(chk,d);
    this.render(d);
  },

  showInlineAdd() {
    App.openModal('💪 운동 추가', `
      <div class="modal-row">
        <label class="modal-lbl">운동 이름 *</label>
        <input id="exName" type="text" placeholder="예: 덤벨 컬" class="inp">
      </div>
      <div class="modal-row">
        <label class="modal-lbl">세트 / 횟수</label>
        <input id="exSets" type="text" placeholder="예: 3×12" class="inp inp-sm">
      </div>
      <div class="modal-btns">
        <button onclick="Fitness._saveNew()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('exName')?.focus(),50);
  },

  _saveNew() {
    const name=document.getElementById('exName')?.value.trim();
    if (!name) { App.showToast('운동 이름을 입력해주세요','error'); return; }
    const sets=document.getElementById('exSets')?.value.trim()||'';
    const custom=this.getCustomExercises();
    custom.push({name,sets});
    this.saveCustomExercises(custom);
    this.render();
    App.closeModal();
    App.showToast('운동 추가됨 ✓','success');
  },

  _delCustom(customIdx, dateStr=null) {
    const d=dateStr?new Date(dateStr):new Date();
    const custom=this.getCustomExercises(d);
    custom.splice(customIdx,1);
    this.saveCustomExercises(custom,d);
    this.render(d);
  },
};
