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

  // ── Hevy 루틴 ─────────────────────────
  // PLAN 은 코드에 박아 둔 기본 계획이다. 정작 사람은 Hevy 에서 루틴을 짜는데
  // 두 곳을 손으로 맞춰 두면 언젠가 반드시 어긋난다. 루틴이 있으면 그쪽이 이긴다.
  ROUTINE_KEY: 'gl_hevy_routines_v1',
  DAYPLAN_KEY: 'gl_fitness_dayplan',     // { 0:'루틴id', 1:'rest', 2:'' … }  0=일

  routines() {
    try {
      const v = JSON.parse(UserStore.get(this.ROUTINE_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  },
  dayPlan() {
    try {
      const v = JSON.parse(UserStore.get(this.DAYPLAN_KEY) || '{}');
      return (v && typeof v === 'object') ? v : {};
    } catch (e) { return {}; }
  },
  saveDayPlan(v) { UserStore.set(this.DAYPLAN_KEY, JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  // 그 요일에 무엇을 할지. 정해 둔 게 없으면 코드의 기본 계획으로 떨어진다 —
  // 루틴을 안 쓰거나 아직 안 받아왔을 때도 카드는 그대로 돌아야 한다.
  planFor(dow) {
    const pick = this.dayPlan()[dow];
    if (pick === 'rest') return { name:'휴식', exercises:[], src:'day' };
    if (pick) {
      const r = this.routines().find(x => x.id === pick);
      if (r) return { name:r.title, exercises:r.items, src:'hevy' };
    }
    return { ...this.PLAN[dow], src:'default' };
  },

  render(date=new Date(), planIdx=null) {
    // 피트니스 카드가 없는 레이아웃에서는 조용히 종료
    if (!document.getElementById('fitnessWrap')) return;
    const d    = new Date(date);
    const dow  = planIdx!==null ? planIdx : d.getDay();
    const plan = this.planFor(dow);
    const chk  = this._checked(d);
    const custom = this.getCustomExercises(d);
    const isToday = this._dateStr(d)===this._dateStr(new Date());
    const allEx = [...plan.exercises, ...custom];

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
      // 어디서 온 계획인지 한 글자로 남긴다. 같은 이름이라도 Hevy 루틴인지
      // 코드의 기본 계획인지 모르면 '왜 안 바뀌지' 를 한참 헤매게 된다.
      badge.textContent=plan.name + (plan.src==='hevy' ? ' · Hevy' : '');
      badge.className=allEx.length?'badge badge-accent':'badge';
    }

    // 탭: 요일별 — 휴식일이어도 반드시 남는다.
    // 예전엔 휴식일이면 탭 없이 return 해서, 일요일(휴무)을 누르는 순간
    // 다른 요일로 돌아갈 방법이 사라졌다. 카드가 막다른 길이 됐다.
    const DOW=['일','월','화','수','목','금','토'];
    const tabs=DOW.map((d,i)=>`<button class="fit-tab${i===dow?' active':''}" onclick="Fitness.render(new Date('${Fitness._dateStr(date)}T00:00:00'),${i})">${d}</button>`).join('')
      + `<button class="fit-tab fit-plan-btn" onclick="Fitness.showDayPlan()" title="요일별 루틴 배정">${
          typeof Icons!=='undefined'?Icons.svg('gear','tf-ic'):'⚙'}</button>`;

    const container = document.getElementById('fitnessWrap');
    if (!allEx.length) {
      container.innerHTML=`
      <div class="fit-tabs">${tabs}</div>
      <div style="text-align:center;padding:20px 16px;color:var(--text2)">
        ${Icons.big('moon')}
        <p>${plan.name} — 휴식일입니다.<br><span style="color:var(--text3);font-size:12px">다른 요일을 눌러 계획을 볼 수 있어요</span></p>
      </div>${isToday?'<div class="habit-add-btn" onclick="Fitness.showInlineAdd()">+ 운동 추가</div>':''}`;
      return;
    }

    // Hevy 에 같은 이름의 기록이 있으면 손으로 안 눌러도 체크된 것으로 본다.
    // 운동하고 와서 앱에 또 체크하는 일이 없어지는 게 연동의 실질적 이득이다.
    // 다만 저장소는 건드리지 않는다 — 자동 판정은 화면에서만 하고, 손으로 누른 것과 구분해 표시한다.
    const ds  = Fitness._dateStr(date);
    const auto = i => !chk.includes(i) && typeof Hevy !== 'undefined' && Hevy.isDone(allEx[i].name, ds);
    const on  = i => chk.includes(i) || auto(i);

    const done=allEx.filter((_,i)=>on(i)).length;
    const pct=Math.round(done/allEx.length*100);

    container.innerHTML=`
      <div class="fit-tabs">${tabs}</div>
      ${allEx.map((ex,i)=>`
        <div class="ex-item${on(i)?' done':''}${auto(i)?' ex-auto':''}" onclick="Fitness.toggle(${i},'${Fitness._dateStr(date)}')">
          <div class="ex-chk"${auto(i)?' title="Hevy 기록에서 자동 체크"':''}>${on(i)?'✓':''}</div>
          <span class="ex-name">${esc(ex.name)}</span>
          <a class="ex-yt" href="${Fitness.ytUrl(ex.name)}" target="_blank" rel="noopener"
             onclick="event.stopPropagation()" title="자세 영상 검색">▶</a>
          <span class="ex-sets">${ex.sets}</span>
          ${i>=plan.exercises.length&&isToday?`<button class="task-del" onclick="event.stopPropagation();Fitness._delCustom(${i-plan.exercises.length},'${Fitness._dateStr(date)}')">✕</button>`:''}
        </div>`).join('')}
      ${isToday?'<div class="habit-add-btn" onclick="Fitness.showInlineAdd()">+ 운동 추가</div>':''}
      ${typeof Hevy!=='undefined'?Hevy.html(ds):''}
      ${typeof Hevy!=='undefined'?Hevy.weeklyHtml(8):''}
      <div class="fit-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-txt">${done}/${allEx.length} (${pct}%)</span>
      </div>`;
  },

  // ── 요일별 루틴 배정 ───────────────────
  showDayPlan() {
    const rs = this.routines(), dp = this.dayPlan();
    const DOW = ['일','월','화','수','목','금','토'];
    const rows = DOW.map((d,i) => {
      const cur = dp[i] || '';
      const opts = [`<option value=""${cur===''?' selected':''}>기본 계획 (${esc(this.PLAN[i].name)})</option>`,
                    `<option value="rest"${cur==='rest'?' selected':''}>휴식</option>`]
        .concat(rs.map(r => `<option value="${esc(r.id)}"${cur===r.id?' selected':''}>${esc(r.title)} (${r.items.length}종목)</option>`));
      return `<div class="dp-row">
        <span class="dp-d${i===0?' dp-sun':''}${i===6?' dp-sat':''}">${d}</span>
        <select class="inp inp-sm dp-sel" data-dow="${i}">${opts.join('')}</select>
      </div>`;
    }).join('');

    const note = rs.length
      ? `Hevy 에서 짠 루틴 ${rs.length}개를 불러왔습니다. 루틴을 고치면 한 시간 안에 여기에도 반영됩니다.`
      : `아직 받아온 루틴이 없습니다. Hevy 에 루틴을 만들어 두면 한 시간 안에 여기 목록에 나타납니다.`;

    App.openModal('@dumbbell 요일별 운동', `
      <div class="dp-note">${note}</div>
      <div class="dp-list">${rows}</div>
      <div class="modal-btns">
        <button onclick="Fitness._saveDayPlan()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },

  _saveDayPlan() {
    const dp = {};
    document.querySelectorAll('.dp-sel').forEach(sel => {
      const v = sel.value;
      if (v) dp[sel.dataset.dow] = v;      // 빈 값(기본 계획)은 저장하지 않는다
    });
    this.saveDayPlan(dp);
    App.closeModal();
    App.showToast('요일별 운동 저장됨 ✓','success');
    this.render(App?.S?.selDate || new Date());
  },

  toggle(idx, dateStr=null) {
    const d = dateStr ? new Date(dateStr+'T00:00:00') : new Date();
    if (this._dateStr(d)!==this._dateStr(new Date())) return;
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
    const src = part && EX_DB[part] ? EX_DB[part].map(n=>[part,n])
              : Object.entries(EX_DB).flatMap(([p,ns])=>ns.map(n=>[p,n]));
    q=String(q||'').trim();
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
      btn.textContent = n ? `추가 (${n}개)` : '고른 운동 없음';
    }
  },
  _pickHtml(){
    const hits=this._search(this._part, this._q);
    this._hits=hits;
    if(!hits.length) return '<div class="ex-empty">결과가 없습니다</div>';
    const favs=this.getFavs();
    return hits.map(([p,n],i)=>{
      const fv=favs.includes(n);
      return `<div class="ex-row">
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
  cartSets(i,v){ const x=(this._cart||[])[i]; if(x) x.sets=String(v||'').trim(); },
  cartRemove(i){ if(this._cart){ this._cart.splice(i,1); this._paintPick(); } },
  setPart(p){ this._part = (this._part===p ? null : p); this._paintPick(); },
  setQ(v){ this._q=v; this._paintPick(); },

  showInlineAdd() {
    this._cart=[]; this._hits=null; this._part=null; this._q='';
    const parts=this._parts();
    const n=parts.reduce((a,p)=>a+EX_DB[p].length,0);
    App.openModal('@dumbbell 운동 추가', `
      <div class="ex-parts">
        ${parts.map(p=>`<button class="ex-part" data-part="${p}" onclick="Fitness.setPart('${p}')">${p}</button>`).join('')}
      </div>
      <input id="exSearch" class="inp" autocomplete="off"
        placeholder="운동 검색 — 초성도 됩니다 (예: ㅅㅋㅌ)" oninput="Fitness.setQ(this.value)">
      <div id="exCart"></div>
      <div id="exResults" class="ex-results"></div>
      <p class="ex-hint">${n}개 종목 · ▶ 를 누르면 자세 영상을 찾아줍니다</p>
      <div class="modal-btns">
        <button id="exCommit" onclick="Fitness.commitCart()" class="btn-sm accent" disabled>고른 운동 없음</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>{ this._paintPick(); document.getElementById('exSearch')?.focus(); },50);
  },

  commitCart() {
    const cart=this._cart||[];
    if(!cart.length){ App.showToast('고른 운동이 없습니다','error'); return; }
    const custom=this.getCustomExercises();
    for(const x of cart) custom.push({ name:x.name, sets:x.sets||this.DEFAULT_SETS });
    this.saveCustomExercises(custom);
    this._cart=[];
    this.render();
    App.closeModal();
    App.showToast(`${cart.length}개 추가됨 ✓`,'success');
  },

  _delCustom(customIdx, dateStr=null) {
    const d=dateStr?new Date(dateStr):new Date();
    const custom=this.getCustomExercises(d);
    custom.splice(customIdx,1);
    this.saveCustomExercises(custom,d);
    this.render(d);
  },
};
