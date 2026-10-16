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

  planFor(dow) {
    let pick = this.dayPlan()[dow];
    if (!['A','B','C','cardio','rest'].includes(pick)) pick = this.DEFAULT_DAY[dow];   // 예전 Hevy 루틴 id 는 무시
    if (pick === 'rest')   return { name:'휴식', exercises:[], src:'day' };
    if (pick === 'cardio') return { ...this.CARDIO, src:'day' };
    return this.homeDay(pick) || { name:'휴식', exercises:[], src:'day' };
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
      badge.textContent=plan.name;
      // 배지를 누르면 그날 플랜의 자세·중량 가이드가 열린다.
      badge.style.cursor='pointer'; badge.title='자세·추천 중량 가이드';
      badge.onclick=()=>HomePlan.open(plan.src==='home'?plan.day:0);
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
    const tabs=DOW.map((d,i)=>`<button class="fit-tab${i===dow?' active':''}" onclick="Fitness.render(Fitness._dowDate(${i}, new Date('${Fitness._dateStr(date)}T00:00:00')))">${d}</button>`).join('')
      + `<button class="fit-tab fit-plan-btn" onclick="Fitness.showDayPlan()" title="요일별 루틴 배정">${
          typeof Icons!=='undefined'?Icons.svg('gear','tf-ic'):'⚙'}</button>`;

    const container = document.getElementById('fitnessWrap');
    const ds = Fitness._dateStr(date);

    if (!allEx.length) {
      // 계획이 휴식일이어도 그날 실제로 운동했으면 기록과 피드백은 보여야 한다.
      // 예전엔 여기서 그냥 빠져나가서, 계획에 없던 날의 운동은 어디서도 볼 수 없었다.
      container.innerHTML=`
      <div class="fit-tabs">${tabs}</div>
      <div style="text-align:center;padding:20px 16px;color:var(--text2)">
        ${Icons.big('moon')}
        <p>휴식일입니다.<br><span style="color:var(--text3);font-size:12px">다른 요일을 눌러 계획을 볼 수 있어요</span></p>
      </div>
      ${isToday?'<div class="habit-add-btn" onclick="Fitness.showInlineAdd()">+ 운동 추가</div>':''}`;
      return;
    }

    const on  = i => chk.includes(i);

    const done=allEx.filter((_,i)=>on(i)).length;
    const pct=Math.round(done/allEx.length*100);

    container.innerHTML=`
      <div class="fit-tabs">${tabs}</div>
      ${allEx.map((ex,i)=>`
        <div class="ex-item${on(i)?' done':''}" onclick="Fitness.toggle(${i},'${Fitness._dateStr(date)}')">
          <div class="ex-chk">${on(i)?'✓':''}</div>
          <span class="ex-name">${esc(ex.name)}</span>
          ${ex.hp!=null&&plan.src==='home'?`<button class="ex-info" onclick="event.stopPropagation();HomePlan.open(${plan.day},${ex.hp})" title="자세·중량 가이드">i</button>`:''}
          <a class="ex-yt" href="${Fitness.ytUrl(ex.name)}" target="_blank" rel="noopener"
             onclick="event.stopPropagation()" title="자세 영상 검색">▶</a>
          <span class="ex-sets">${ex.sets}</span>
          ${i>=plan.exercises.length&&isToday?`<button class="task-del" onclick="event.stopPropagation();Fitness._delCustom(${i-plan.exercises.length},'${Fitness._dateStr(date)}')">✕</button>`:''}
        </div>`).join('')}
      ${isToday?'<div class="habit-add-btn" onclick="Fitness.showInlineAdd()">+ 운동 추가</div>':''}
      <div class="fit-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-txt">${done}/${allEx.length} (${pct}%)</span>
      </div>`;
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
    const DOW = ['일','월','화','수','목','금','토'];
    const OPTS = [['A','DAY A 푸시'],['B','DAY B 풀'],['C','DAY C 하체+코어'],['cardio','유산소'],['rest','휴식']];
    const rows = DOW.map((d,i) => {
      const cur = dp[i] || this.DEFAULT_DAY[i];
      const opts = OPTS.map(([v,l]) => `<option value="${v}"${cur===v?' selected':''}>${l}${this.DEFAULT_DAY[i]===v?' (기본)':''}</option>`);
      return `<div class="dp-row">
        <span class="dp-d${i===0?' dp-sun':''}${i===6?' dp-sat':''}">${d}</span>
        <select class="inp inp-sm dp-sel" data-dow="${i}">${opts.join('')}</select>
      </div>`;
    }).join('');
    App.openModal('@dumbbell 요일별 운동', `
      <div class="dp-note">홈트레이닝 3일 분할 플랜을 요일에 배정합니다. 종목별 자세·추천 중량은 운동 카드의 '가이드' 에서 볼 수 있어요.</div>
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
      if (v && v !== this.DEFAULT_DAY[sel.dataset.dow]) dp[sel.dataset.dow] = v;   // 기본과 같으면 저장하지 않는다
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
