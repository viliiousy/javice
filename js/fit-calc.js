// js/fit-calc.js — 운동 소모 열량 · 유산소 시간·속도 · 오늘 부위 바꾸기
// fitness.js 의 Fitness 에서 떼어 낸 부분. fitness.js 다음에 읽는다(같은 객체에 메서드를 더한다).
Object.assign(Fitness, {
  // ── 운동 소모 열량(추정) ─────────────────
  // 그날 한 운동만 센다: 체크했거나 무게 기록이 있는 종목.
  //   시간 운동(스포츠·유산소): (MET−1) × 몸무게 × 시간.  분은 기록 → 계획(‘60분’) 순.
  //   근력: 한 세트 + 쉬는 시간을 2.5분으로 보고 MET 5. 세트 수는 기록 → 계획 순.
  // 몸무게는 인바디 최근 기록, 없으면 70kg.
  weightKg() {
    try { const r = typeof InBody!=='undefined' && InBody.getRecords().filter(x=>Number(x.wt)>25).pop(); const w = Number(r && r.wt); if (w > 25) return w; } catch(e) {}
    return 70;
  },
  // all=true: 체크와 상관없이 그날 목록을 전부 했을 때(오늘의 운동 '소모 열량(추정)' 에 보인다).
  //   식단의 '+ 운동' 은 실제로 한 것만(all=false) 센다.
  burn(date=new Date(), all=false) {
    const d=new Date(date), ds=this._dateStr(d);
    let list=[]; try { list=this.exercisesFor(d).list; } catch(e) { return { kcal:0, items:[], kg:this.weightKg() }; }
    const chk=this._checked(d), log=typeof PlanGen!=='undefined' ? PlanGen.log(ds) : {}, kg=this.weightKg();
    const items=[], seen=new Set(list.map(x=>x.name));
    // 목록에 없는데 기록만 있는 운동(운동 모드에서 추가·교체한 것)도 센다
    Object.keys(log).forEach(n=>{ if(!seen.has(n)&&(log[n]||[]).length) list=list.concat([{ name:n, sets:'' }]); });
    list.forEach((x,i)=>{
      const L=log[x.name]||[], done=all||chk.includes(i);
      if(!done && !L.length) return;
      const timed=typeof PlanGen!=='undefined' && PlanGen.timed(x.name);
      let kcal, info, min=0, kmh=null;
      if(timed){
        const c=this.cardio(x.sets, x.name); min=c.min; kmh=c.kmh;
        // 달리기·트레드밀은 속도(페이스)로 MET 를 정한다. 없으면 종목 MET
        const met = kmh ? this.speedMet(kmh) : ((typeof EX_MET!=='undefined' && EX_MET[x.name]) || 6);
        kcal=(met-1)*kg*min/60; info=`${min}분${kmh?` · ${this.speedTxt(x.name, kmh)}`:''}`;
      } else {
        // 근력·맨몸: (MET−1) × 몸무게 × 시간. 한 세트 + 쉬는 시간 = 2.5분. 종목 MET(버피·풀업 등)가 있으면 그것, 없으면 5
        const n=L.length || (typeof WorkoutMode!=='undefined' ? WorkoutMode._nSets(x.sets) : 3);
        const met=(typeof EX_MET!=='undefined' && EX_MET[x.name]) || 5;
        kcal=(met-1)*kg*(n*2.5)/60; info=`${n}세트`;
      }
      items.push({ name:x.name, kcal:Math.round(kcal), info, min, kmh });
    });
    return { kcal:items.reduce((t,x)=>t+x.kcal,0), items, kg };
  },
  // 식단에 더해 줄 열량: 운동(한 것만) + 도보(걸음, 유산소와 겹치는 걸음 뺌). 설정의 반영 방식(절반·전부·안 함)을 둘 다에 쓴다
  bonus(date=new Date(), s=null) {
    try { s = s || Diet.getSettings(); } catch(e) { s = {}; }
    const bm=s.burnMode||'half', f=v=>bm==='off'?0:bm==='full'?v:Math.round(v/2/10)*10;
    const b=this.burn(date), w=typeof Steps!=='undefined' ? Steps.kcal(date) : { steps:0, kcal:0 };
    const ex=f(b.kcal), walk=f(w.kcal);
    return { burn:b, walk:w, ex, walkB:walk, total:ex+walk, mode:bm };
  },
  // ── 유산소 시간·속도 ── sets 예: '30분' · '30분 · 5\'30"/km' · '30분 · 10km/h'
  isTread(n){ return /트레드밀|런닝머신|러닝머신/.test(String(n||'')); },
  isRun(n){ return !this.isTread(n) && /러닝|달리기|조깅|마라톤/.test(String(n||'')); },
  cardio(sets, name){
    const t=String(sets||''), min=+(t.match(/(\d+)\s*분/)||[])[1] || this.defMin(name);
    let kmh=null; const k=t.match(/([\d.]+)\s*km\/h/); const p=t.match(/(\d+)['′:](\d{1,2})["″]?\s*\/\s*km/);
    if(k) kmh=Number(k[1]); else if(p){ const sec=(+p[1])*60+(+p[2]); if(sec>0) kmh=Math.round(3600/sec*100)/100; }
    return { min, kmh: kmh>0 ? kmh : null };
  },
  // 속도 → MET (걷기 4km/h 3.0 · 5km/h 3.5 · 6km/h 4.3 · 달리기는 대략 km/h × 1.0)
  speedMet(v){
    if(v>=7.5) return Math.max(7, Math.min(23, v*1.0+0.5));
    const T=[[3,2.5],[4,3.0],[5,3.5],[6,4.3],[7.5,7.5]];
    for(let i=1;i<T.length;i++) if(v<=T[i][0]){ const [a,ma]=T[i-1],[b,mb]=T[i]; return ma+(mb-ma)*(v-a)/(b-a); }
    return 2.5;
  },
  paceTxt(kmh){ const sec=Math.round(3600/kmh); return `${Math.floor(sec/60)}'${String(sec%60).padStart(2,'0')}"/km`; },
  speedTxt(name, kmh){ return this.isTread(name) ? `${kmh}km/h` : this.paceTxt(kmh); },
  // '4×10-12' → '4세트 10-12회', '3×12' → '3세트 12회'(시간 운동은 그대로)
  setsLabel(sets){
    const t=String(sets||'').trim(), m=t.match(/^(\d+)\s*[×xX*]\s*([\d\-~–]+)\s*(회)?$/);
    return m ? `${m[1]}세트 ${m[2].replace(/[~–]/g,'-')}회` : t;
  },
  // 세트 기록 한 줄: 같은 무게·횟수가 이어지면 묶는다 — '18kg 10회 × 4세트' / '20kg 8회 × 2세트 · 18kg 10회'
  setsLine(L){
    const g=[]; for(const s of L||[]){ const w=Number(s.w)||0, r=Number(s.r)||0, last=g[g.length-1]; if(last&&last.w===w&&last.r===r) last.n++; else g.push({ w, r, n:1 }); }
    return g.map(x=>`${x.w?x.w+'kg ':''}${x.r}회${x.n>1?` × ${x.n}세트`:''}`).join(' · ');
  },

  // ── 오늘 부위 바꾸기: 부위를 고르면 그날 운동을 그 부위로 다시 짠다(오늘만 / 앞으로 이 요일도) ──
  partSheet(ds) {
    this._pt = { ds, parts: [] };
    const P = ['가슴', '등', '하체', '어깨', '팔', '복근', '전신', '유산소'];
    App.openModal('@dumbbell 오늘 부위 바꾸기', `<div class="fz fz-pt">
      <p class="fz-note">할 부위를 고르세요. 여러 개 고르면 번갈아 섞고, 유산소를 같이 고르면 끝에 유산소를 붙입니다. 기구·아픈 곳 설정은 맞춤 플랜과 같습니다.</p>
      <div class="pt-chips">${P.map(x => `<button type="button" class="pt-chip" data-p="${x}" onclick="Fitness._ptToggle('${x}')">${x}</button>`).join('')}</div>
      <div id="ptPrev" class="pt-prev"><p class="pg-note">부위를 고르면 미리 보기가 나옵니다.</p></div>
      <p class="fz-note pt-auto">운동을 고르면 알아서 부위를 판단해서 그날 어떤 부위 운동을 했는지 알려 줍니다. 수정에서 운동을 바꾸거나 더해도 카드 위 이름이 그대로 따라 바뀝니다(예: 등·팔, 전신, 가슴·유산소).</p>
      <div class="modal-btns pt-btns">
        <button class="btn-sm" onclick="Fitness._ptApply('plan')" id="ptPlan" disabled>앞으로 이 요일도</button>
        <button class="btn-sm accent" onclick="Fitness._ptApply('day')" id="ptDay" disabled>오늘만 바꾸기</button>
      </div></div>`);
  },
  _ptToggle(x) {
    const t = this._pt; if (!t) return;
    t.parts = t.parts.includes(x) ? t.parts.filter(y => y !== x) : [...t.parts, x];
    document.querySelectorAll('.pt-chip').forEach(b => b.classList.toggle('on', t.parts.includes(b.dataset.p)));
    t.list = t.parts.length ? PlanGen.dayFor(t.parts) : [];
    const box = document.getElementById('ptPrev');
    if (box) box.innerHTML = t.list.length ? `<div class="pt-h">${esc(t.parts.join(' + '))} · <span class="num">${t.list.length}</span>종목</div>` + t.list.map(e => {
      const th = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(e.name) : '';
      return `<div class="pt-row"><span class="ex-th${th ? '' : ' none'}">${th ? ExMedia.poseHtml(th) : ''}</span><span class="pt-nm">${esc(e.name)}</span><span class="pt-s num">${esc(e.sets)}</span></div>`;
    }).join('') : '<p class="pg-note">부위를 고르면 미리 보기가 나옵니다.</p>';
    ['ptDay', 'ptPlan'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !t.list.length; });
    try { Haptic.light(); } catch (e) {}
  },
  // 부위 대신 직접 고르기 — 지금 목록을 담아 둔 채로 열어, 넣고 빼서 그날 운동을 정한다
  freeDay(ds, scope='day') {
    const { list } = this.exercisesFor(new Date(ds+'T00:00:00'));
    App.closeModal();
    this._rid = undefined; this._freeDs = ds; this._freeScope = scope;
    this._cart = list.map(x=>({ name:x.name, sets:x.sets||this.defSets(x.name) }));
    this._addDate = new Date(ds+'T00:00:00');
    this._openPicker('운동 직접 고르기', `<p class="fz-note">부위 상관없이 넣고 빼서 ${scope==='day'?'오늘':'이 요일'} 운동을 정합니다. 위 ‘고른 운동’ 에서 ✕ 로 뺄 수 있습니다.</p>`, '');
    setTimeout(()=>{ const b=document.getElementById('exCommit'); if(b) b.dataset.free='1'; this._paintPick(); }, 60);
  },
  _ptApply(scope) {
    const t = this._pt; if (!t || !t.list?.length) return;
    const msg = this.applyList(t.ds, t.list, scope);
    App.closeModal(); this._pt = null;
    this.render(new Date(t.ds + 'T00:00:00'));
    App.showToast(scope === 'day' ? `오늘은 ${t.parts.join(' + ')} 운동으로 바꿨습니다` : msg, 'success');
  },
});
