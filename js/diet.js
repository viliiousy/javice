// js/diet.js — 식단 기록 (날짜별 + 즐겨찾기 + 최근 10개 + 빈도)

const Diet = {
  MEALS:  ['아침','점심','저녁','간식'],

  // 현재 시간 + 기록 상태 기반 default 식사 추천
  _suggestMeal(date=new Date()) {
    const data = this.getData(date);
    const h = new Date().getHours();
    // 아직 안 먹은 끼니 순서대로 추천
    if (!data['아침'].length) return '아침';
    if (!data['점심'].length) return '점심';
    if (!data['저녁'].length) return '저녁';
    // 다 먹었으면 시간대 기반
    if (h < 10) return '아침';
    if (h < 14) return '점심';
    if (h < 20) return '저녁';
    return '간식';
  },
  EMOJIS: { 아침:'🌅', 점심:'🌞', 저녁:'🌙', 간식:'🍪' },

  // ── 날짜별 키 ─────────────────────────
  _localDateStr(date=new Date()){
    const d=new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _key(date=new Date()){ return `gl_diet_${this._localDateStr(date)}`; },
  _setKey()            { return 'gl_diet_settings'; },
  _favKey()            { return 'gl_diet_favs'; },
  _histKey()           { return 'gl_diet_history'; },

  getSettings(){
    // 저장값이 깨져 있어도 카드가 비지 않게 기본 목표로 돌아간다
    const v=UserStore.parse(this._setKey(), null);
    return (v && typeof v==='object') ? v : {calorieGoal:2200,proteinGoal:160,carbGoal:220,fatGoal:60};
  },
  getGoalsForDate(date=new Date()) {
    const s   = this.getSettings();
    const dow = new Date(date).getDay();
    const isRest = (s.restDays||[0,6]).includes(dow);
    return isRest ? {
      cal: s.restCalGoal     || s.calorieGoal,
      pro: s.restProteinGoal || s.proteinGoal,
      carb:s.restCarbGoal    || s.carbGoal,
      fat: s.restFatGoal     || s.fatGoal,
    } : {
      cal: s.calorieGoal, pro: s.proteinGoal,
      carb:s.carbGoal,    fat: s.fatGoal,
    };
  },
  getCalorieGoalForDate(date=new Date()) {
    return this.getGoalsForDate(date).cal;
  },

  getData(date=new Date()){
    const v=UserStore.parse(this._key(date), null);
    return (v && typeof v==='object') ? v : {아침:[],점심:[],저녁:[],간식:[]};
  },
  saveData(d,date=new Date()){ UserStore.set(this._key(date),JSON.stringify(d)); FirebaseSync?.scheduleSave(); try{ LocalNotify?.reschedule(); }catch(e){} },   // 끼니를 적으면 그 끼니 알림을 뺀다

  // ── 즐겨찾기 ──────────────────────────
  getFavs(){ const v=UserStore.parse(this._favKey(), []); return Array.isArray(v)?v:[]; },
  saveFavs(v){ UserStore.set(this._favKey(),JSON.stringify(v)); FirebaseSync?.scheduleSave(); },
  toggleFav(name){
    const favs=this.getFavs();
    const idx=favs.indexOf(name);
    if(idx===-1) favs.push(name); else favs.splice(idx,1);
    this.saveFavs(favs);
  },
  // 끼니 줄마다 부른다 — 읽기만 하므로 파싱해 둔 값을 쓴다
  isFav(name){ const v=UserStore.json(this._favKey(), null); return Array.isArray(v) && v.includes(name); },

  // ── 음식 히스토리 (최근 10개 + 빈도) ──
  getHistory(){ const v=UserStore.parse(this._histKey(), []); return Array.isArray(v)?v:[]; },
  saveHistory(v){ UserStore.set(this._histKey(),JSON.stringify(v.slice(0,200))); FirebaseSync?.scheduleSave(); },
  addToHistory(food){
    const h=this.getHistory();
    const i=h.findIndex(f=>f&&f.name===food.name);
    // 예전 기록에는 n 이 없다. 목록에 있다는 건 최소 한 번은 먹었다는 뜻이므로 1 로 친다.
    const n=i>=0 ? (Number(h[i].n)||1)+1 : 1;
    if(i>=0) h.splice(i,1);
    h.unshift({...food, n, lastAdded:new Date().toISOString()});
    this._hIdx=null;                       // 아래 색인을 무효화한다
    this.saveHistory(h);
  },
  getRecentUnique(n=10){
    return this.getHistory().slice(0,n);
  },

  // 이름 → {n, last} 색인.
  // getFreqLast30 은 이름 하나당 30일치를 다시 읽는다. 목록 서른 줄을 정렬하려면
  // 900번을 읽어야 해서 쓸 수가 없다. 히스토리에 세어 둔 값을 한 번만 훑는다.
  _histIndex(){
    if(this._hIdx) return this._hIdx;
    const m=new Map();
    for(const f of this.getHistory()){
      if(f&&f.name) m.set(f.name,{ n:Number(f.n)||1, last:f.lastAdded||'' });
    }
    this._hIdx=m;
    return m;
  },
  eaten(name){ return this._histIndex().get(name)||null; },
  getFreqLast30(name){
    // 최근 30일간 해당 음식 추가 횟수
    const now=new Date();
    let count=0;
    for(let i=0;i<30;i++){
      const d=new Date(now); d.setDate(now.getDate()-i);
      const data=this.getData(d);
      Object.values(data).forEach(meal=>{
        count+=meal.filter(f=>f.name===name).length;
      });
    }
    return count;
  },

  // 칼로리는 있는데 단·탄·지가 전부 0 인 항목은 '0' 이 아니라 '모름' 이다.
  // 예전 프리셋으로 담아 둔 기록이 이 모양이다 (칼로리만 있고 매크로가 0).
  // 그걸 0 으로 보여 주면 닭가슴살 단백질이 0g 이라고 말하는 셈이고, 그건 정반대다.
  // (칼로리가 0 인 것은 물·블랙커피처럼 실제로 0 일 수 있으므로 건드리지 않는다.)
  isUnknown(i){
    return (Number(i.cal)||0) > 0 &&
           !((Number(i.protein)||0) || (Number(i.carb)||0) || (Number(i.fat)||0));
  },
  // 아는 것만 더한다. 모르는 개수는 따로 들고 나가서 화면이 '+' 로 알린다.
  sumMacros(items){
    let cal=0,protein=0,carb=0,fat=0,unknown=0,known=0;
    (items||[]).forEach(i=>{
      cal+=i.cal||0;
      if(this.isUnknown(i)){ unknown++; return; }
      known++;
      protein+=i.protein||0; carb+=i.carb||0; fat+=i.fat||0;
    });
    return {cal,protein,carb,fat,unknown,known};
  },
  totals(data){
    return this.sumMacros(Object.values(data||{}).flat());
  },

  // 모르는 게 섞였는지에 따라 다르게 쓴다.
  //   아는 게 하나도 없으면 '—'  (0 이라고 말하지 않는다)
  //   일부만 알면 '12+'          (적어도 이만큼, 더 있을 수 있다)
  macroTxt(v, t, unit='g'){
    if(t.known===0 && t.unknown>0) return '—';
    return Math.round(v) + (unit?`<i>${unit}</i>`:'') + (t.unknown?'<sup class="macro-plus">+</sup>':'');
  },

  // 한 팩을 '1개' 로 담아 둔 지난 기록 바로잡기(광어초밥 200g 한 팩 × 12 = 3,840kcal 처럼) — 낱개 무게로 다시 계산한다.
  // 이미 고친 줄은 단위가 '1개(25g)' 라 다시 걸리지 않는다. 최근 목록과 지난 30일 기록만 본다.
  _pieceOf(name, W){
    const cnt = /(\d+)\s*(?:p|P|pcs|PCS|개입|입|피스|알)(?![a-zA-Z가-힣])/.exec(String(name)), N = cnt ? Number(cnt[1]) : 0;
    if (N >= 2 && N <= 100) return Math.round(W / N * 10) / 10;
    const pp = !this.PIECE_NOT.test(String(name)) && this.PIECEP.find(([re]) => re.test(String(name)));
    return pp && W >= pp[1] * 2.5 ? pp[1] : 0;
  },
  _migPiece(){
    if (Date.now() - (this._migAt || 0) < 60000) return; this._migAt = Date.now();   // 고친 줄은 다시 안 걸리므로 여러 번 돌아도 된다(동기화로 옛 값이 다시 내려와도 다음에 바로잡힌다)
    const fix = (name, unit) => { const m = /^1개\((\d+(?:\.\d+)?)(g|mL)\)$/.exec(unit || ''); if (!m) return null;
      const W = Number(m[1]), pc = this._pieceOf(name, W); if (!pc || pc >= W) return null; return { f: pc / W, u: `1개(${pc}${m[2]})` }; };
    let n = 0;
    try {
      const h = this.getHistory(); let hc = false;
      for (const x of h) { const r = x && fix(x.name, x.unit); if (!r) continue;
        x.unit = r.u; x.cal = Math.round((x.cal || 0) * r.f); x.protein = +((x.protein || 0) * r.f).toFixed(1); x.carb = +((x.carb || 0) * r.f).toFixed(1); x.fat = +((x.fat || 0) * r.f).toFixed(1); hc = true; n++; }
      if (hc) this.saveHistory(h);
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const data = this.getData(d); let ch = false;
        for (const meal of Object.keys(data || {})) for (const e of (Array.isArray(data[meal]) ? data[meal] : [])) {
          const r = e && fix(e.base || e.name, e.unit); if (!r) continue;
          const q = Number(e.qty) || 1;
          e.unit = r.u; e.name = `${e.base || e.name} ${this._scaleUnit(r.u, q)}`;
          e.cal = Math.round((e.cal || 0) * r.f); e.protein = +((e.protein || 0) * r.f).toFixed(1); e.carb = +((e.carb || 0) * r.f).toFixed(1); e.fat = +((e.fat || 0) * r.f).toFixed(1);
          ch = true; n++;
        }
        if (ch) this.saveData(data, d);
      }
    } catch (e) { console.warn('[diet] 낱개 바로잡기', e); }
    if (n) setTimeout(() => { try { App.showToast(`한 팩을 1개로 잘못 센 기록 ${n}줄을 낱개 기준으로 바로잡았습니다`, 'success'); this.render(App.S.selDate || new Date()); } catch (e) {} }, 300);
  },
  render(date=new Date()){
    this._migPiece();
    if(!document.getElementById('dietWrap')) return;
    const data=this.getData(date);
    const s=this.getSettings();
    const t=this.totals(data);
    const pct=Math.min(100,Math.round(t.cal/s.calorieGoal*100));
    const C=2*Math.PI*22;
    const col=pct<80?'var(--accent)':pct<105?'var(--yellow)':'var(--red)';
    const isToday=new Date(date).toDateString()===new Date().toDateString();
    const ds=this._localDateStr(date);

    // 배지 하나에 '얼마나 먹었고 목표 대비 몇 퍼센트인지' 를 다 적는다.
    // 아래 요약에 같은 말을 또 쓰면 카드가 한 줄을 공짜로 잃는다.
    { const bd=document.getElementById('dietBadge'); if(bd) bd.textContent=`${t.cal.toLocaleString()} / ${Number(s.calorieGoal||0).toLocaleString()} kcal · ${pct}%`; }

    // ── 시안 05: 남은 열량을 크게, 단·탄·지는 세 칸 막대, 끼니는 한 줄씩 ──
    const won=v=>Math.round(v).toLocaleString('ko-KR');
    // 운동으로 쓴 열량 — 설정(목표 › 운동 열량 반영)에 따라 절반(기본)·전부·안 함만큼 목표에 더한다
    //   걸음(건강 앱)으로 쓴 열량도 같은 규칙으로 '+ 도보' 에 더한다(그날 유산소와 겹치는 걸음은 뺀다 — js/steps.js)
    const B=(typeof Fitness!=='undefined'&&Fitness.bonus) ? Fitness.bonus(date, s) : { burn:{ kcal:0, items:[] }, walk:{ steps:0, kcal:0 }, ex:0, walkB:0, total:0 };
    const burn=B.burn, walk=B.walk, bonus=B.total;
    const left=s.calorieGoal+bonus-t.cal, over=left<0;
    const mpct=(v,g)=>g?Math.min(100,Math.round(v/g*100)):0;
    const hour=new Date().getHours();
    const nowMeal=hour<10?'아침':hour<15?'점심':hour<21?'저녁':'간식';
    const mealsHTML=this.MEALS.map(meal=>{
      const items=data[meal]||[];
      const mealCal=items.reduce((s,i)=>s+(i.cal||0),0);
      const open=!!this._open[meal];
      const names=items.map(i=>i.name);
      return `<div class="dm${open?' open':''}">
        <div class="dm-hd" onclick="${items.length?`Diet.toggleMeal('${meal}','${ds}')`:`Diet.showAdd('${meal}','${ds}')`}">
          <div class="dm-tx"><div class="dm-nm">${meal}</div>${items.length?`<div class="dm-sub">${esc(names.slice(0,3).join(' · '))}${names.length>3?` 외 ${names.length-3}`:''}</div>`:''}</div>
          ${items.length?`<span class="dm-cal num">${won(mealCal)}</span>`:`<span class="dm-add">+ 기록</span>`}
        </div>
        ${items.length?`<div class="dm-items">
          ${items.map((item,idx)=>`
            <div class="dm-food" data-meal="${meal}" data-idx="${idx}">
              <button class="diet-fav-btn${this.isFav(item.base||item.name)?' is-fav':''}"
                onclick="Diet._clickFav('${(item.base||item.name).replace(/'/g,'&#39;')}','${meal}','${ds}')" title="즐겨찾기" aria-label="즐겨찾기">★</button>
              <span class="dm-fn">${esc(item.name)}</span>
              <span class="dm-fc num">${item.cal}</span>
              <button class="dm-del" onclick="Diet.remove('${meal}',${idx},'${ds}')" aria-label="${esc(item.name)} 삭제">✕</button>
            </div>`).join('')}
          <button type="button" class="dm-more" onclick="Diet.showAdd('${meal}','${ds}')">+ ${meal}에 더하기</button>
          <div class="dm-hint">음식을 꾹 눌러 다른 끼니로 끌어 옮길 수 있어요</div>
        </div>`:''}
      </div>`;
    }).join('');

    document.getElementById('dietWrap').innerHTML=`
      <div class="dk">
        <div class="dk-sub">${isToday?'오늘 ':ds+' '}${over?'초과한 열량':'남은 열량'} · 목표 ${won(s.calorieGoal)}${B.ex?` + 운동 ${won(B.ex)}`:''}${B.walkB?` + 도보 ${won(B.walkB)}`:''}</div>
        <div class="dk-big"><span class="num${over?' over':''}">${won(Math.abs(left))}</span><span class="dk-u">kcal</span>
          <span class="dk-eat">먹음 <b class="num">${won(t.cal)}</b></span></div>
        <div class="dk-bar"><i style="width:${Math.min(100,pct)}%"${over?' class="over"':''}></i></div>
        <div class="dk-mac">
          <div><span>단백질</span><b class="num">${this.macroTxt(t.protein,t,'')}<small> / ${s.proteinGoal}g</small></b><em><i class="acc" style="width:${mpct(t.protein,s.proteinGoal)}%"></i></em></div>
          <div><span>탄수화물</span><b class="num">${this.macroTxt(t.carb,t,'')}<small> / ${s.carbGoal}g</small></b><em><i style="width:${mpct(t.carb,s.carbGoal)}%"></i></em></div>
          <div><span>지방</span><b class="num">${this.macroTxt(t.fat,t,'')}<small> / ${s.fatGoal}g</small></b><em><i style="width:${mpct(t.fat,s.fatGoal)}%"></i></em></div>
        </div>
        ${burn.kcal||walk.kcal?`<button type="button" class="dk-burn" onclick="Diet.showBurn('${ds}')"><span>${burn.kcal?`운동 <b class="num">−${won(burn.kcal)}</b>`:''}${burn.kcal&&walk.kcal?' · ':''}${walk.kcal?`도보 <b class="num">−${won(walk.kcal)}</b>`:''} kcal</span>${bonus?`<span class="dk-burn-plus"><b class="num">+${won(bonus)}</b> kcal 더 드셔도 됩니다</span>`:'<span class="dk-burn-plus">목표에 반영 안 함</span>'}</button>`:''}
        ${t.unknown?`<div class="diet-macro-note">${t.unknown}개 음식은 영양정보가 없어 빠져 있어요 — 눌러서 채울 수 있어요</div>`:''}
      </div>
      <div class="dk-acts">
        <button type="button" class="dk-act on" onclick="Diet.showPhotoAnalysis('${ds}')">${typeof Icons!=='undefined'?Icons.svg('camera'):''}사진</button>
        <button type="button" class="dk-act" onclick="Diet.showAdd('${nowMeal}','${ds}')">검색</button>
        <button type="button" class="dk-act" onclick="Diet.showSettings()">목표</button>
      </div>
      <div class="dm-list">${mealsHTML}</div>`;
    this._bindMove(ds);

    if(typeof App!=='undefined') App._updateStatsBanner();
  },

  // 어느 끼니를 펼쳐 뒀는지. 화면을 새로 열면 다시 다 접힌다 —
  // 접힌 줄만으로도 그 끼니가 다 읽히기 때문에 굳이 저장할 값이 아니다.
  _open: {},
  toggleMeal(meal, dateStr){
    this._open[meal] = !this._open[meal];
    this.render(new Date(dateStr+'T00:00:00'));
  },

  _clickFav(name,meal,dateStr){
    this.toggleFav(name);
    const date=new Date(dateStr+'T00:00:00');
    this.render(date);
  },

  // ── 음식 검색 ─────────────────────────
  // 초성 테이블. god_life 에는 초성 검색이 없었다 — 새로 넣는다.
  CHO: ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'],
  _cho(str){
    let out='';
    for(const ch of String(str)){
      const c=ch.charCodeAt(0)-0xAC00;
      out += (c>=0 && c<11172) ? this.CHO[Math.floor(c/588)] : ch;
    }
    return out;
  },
  // 내 사전 + 히스토리. 프리셋(FOOD_DB 316개)은 2026-09-08 에 뺐다 —
  // 이름과 칼로리만 있고 단·탄·지가 없어서, 담을 때마다 매크로가 0 으로 들어갔다.
  // 이제 모르는 음식은 식약처 실측 DB 에서 받아 오고, 받아 온 것만 여기 쌓인다.
  // 쌓인 것은 오프라인에서도 검색된다.
  _allFoods(){
    const seen = new Set();
    // 사전이 히스토리보다 앞이다 — 영양소가 전부 들어 있다.
    const ai = [];
    for(const f of this.getAiFoods()){
      if(!f || !f.n || seen.has(f.n)) continue;
      seen.add(f.n);
      // 🥗 는 식약처 실측, 🤖 는 AI 추정. 목록에서 둘을 구분할 수 있어야 한다.
      // 🥗 식약처 실측 · 🌍 Open Food Facts · 📋 포장 영양성분표 · 🤖 AI 추정.
      // 어디서 온 숫자인지 보여야 한다 — 앞의 셋은 읽은 것이고 마지막만 지어낸 것이다.
      const em = f.src==='db' ? '🥗' : f.src==='off' ? '🌍' : f.src==='label' ? '📋' : '🤖';
      ai.push({ e:em, n:f.n, u:f.u||'', c:f.c||0, p:f.p||0, cb:f.cb||0, ft:f.ft||0 });
    }
    const hist = this.getHistory()
      .filter(f => f && f.name && !seen.has(f.name))
      .map(f => ({ e:'🍴', n:f.name, u:'', c:f.cal||0, p:f.protein||0, cb:f.carb||0, ft:f.fat||0 }));
    return ai.concat(hist);
  },
  // ── 띄어쓰기·순서·표기가 달라도 찾기 (서버 lib/mfds.js 와 같은 규칙) ──
  _VAR: [['써브웨이','서브웨이'],['맥도날드','맥도널드','맥날'],['bbq','비비큐'],['kfc','케이에프씨'],['bhc','비에이치씨'],['쉐이크쉑','쉑쉑'],['배스킨라빈스','베스킨라빈스'],['파리바게뜨','파리바게트','빠리바게뜨'],['달걀','계란'],['마끼아또','마키아또','마키아토','마끼야또','마키야또','마끼아토'],['프라푸치노','프라프치노','프라푸찌노'],
    ['카라멜','캐러멜','캬라멜'],['라떼','라테'],['요거트','요구르트'],['치즈케이크','치즈케익']],
  _MODS: ['제로','라이트','무설탕','저당','디카페인','슈거프리','로우슈거'],
  _canon(s){ let t=String(s||'').toLowerCase().replace(/[\s_()\[\]·.,/-]+/g,''); for(const g of this._VAR) for(const v of g.slice(1)) t=t.split(v).join(g[0]); return t; },
  _tokens(q){
    const out=[];
    for(let w of String(q||'').trim().split(/\s+/)){ w=this._canon(w); if(!w) continue;
      for(const m of this._MODS) if(w!==m && w.includes(m)){ out.push(m); w=w.split(m).join(''); }
      if(w) out.push(w); }
    return [...new Set(out)];
  },
  // 브랜드 없는 기본 음료(대표값, 톨 355mL 기준 대략) — 내 기록에도 식약처 DB 에도 기본형이 없을 때 먼저 권한다
  GENERIC: [
    ['☕','아메리카노','1잔(355mL)',10,1,2,0], ['☕','카페라떼','1잔(355mL)',180,10,14,9], ['☕','바닐라라떼','1잔(355mL)',230,9,31,8],
    ['☕','카라멜마끼아또','1잔(355mL)',230,9,32,7], ['☕','카푸치노','1잔(355mL)',120,7,10,6], ['☕','카페모카','1잔(355mL)',290,10,36,12],
    ['☕','돌체라떼','1잔(355mL)',300,10,38,11], ['☕','콜드브루','1잔(355mL)',5,0,1,0], ['☕','아인슈페너','1잔(355mL)',200,3,18,13],
    ['🍵','녹차라떼','1잔(355mL)',240,9,35,7], ['🍫','초코라떼','1잔(355mL)',320,11,45,11], ['🍋','레몬에이드','1잔(355mL)',150,0,38,0],
    ['🍊','자몽에이드','1잔(355mL)',160,0,40,0], ['🧋','복숭아 아이스티','1잔(355mL)',150,0,37,0],
    // 자주 먹는 기본 음식(식약처 대표값 근처) — 검색하자마자 바로 보이게. 1개·1공기처럼 먹는 단위로.
    ['🥚','계란(달걀) 삶은 것','1개(50g)',75,6.3,0.6,5], ['🥚','계란(달걀) 후라이','1개(50g)',90,6.3,0.4,7], ['🥚','날계란(달걀)','1개(50g)',72,6.2,0.4,4.8],
    ['🥚','계란(달걀) 흰자','1개(33g)',17,3.6,0.2,0.1], ['🥚','계란(달걀) 스크램블','2개(100g)',170,12,1.5,13],
    ['🍚','흰쌀밥','1공기(210g)',315,5.7,69,0.6], ['🍚','현미밥','1공기(210g)',300,6.3,64,2], ['🍠','고구마','1개(150g)',195,2.1,46,0.2],
    ['🍗','닭가슴살(익힌 것)','100g',165,31,0,3.6], ['🍌','바나나','1개(120g)',105,1.3,27,0.4], ['🍎','사과','1개(200g)',104,0.5,28,0.3],
    ['🥛','우유','1컵(200mL)',130,6.4,9.6,7.6], ['🥣','오트밀','40g',150,5,27,2.8], ['🥛','그릭요거트(플레인)','100g',97,9,4,5],
    ['🧈','두부','1/2모(150g)',126,13,3,7.5], ['🥑','아보카도','1/2개(70g)',112,1.4,6,10], ['🥤','프로틴 쉐이크','1스쿱(30g)',120,24,3,1.5],
  ],
  _generic(q){
    const tk=this._tokens(q), cq=this._canon(q); if(!cq) return [];
    return this.GENERIC.filter(([,n])=>{ const cn=this._canon(n); return cn.includes(cq) || (tk.length && tk.every(t=>cn.includes(t))); })
      .map(([e,n,u,c,p,cb,ft])=>({ e, n, u, c, p, cb, ft, gen:true }));
  },
  _search(q){
    q = String(q||'').trim();
    if(!q) return [];
    const lower  = q.toLowerCase(), cq = this._canon(q), tk = this._tokens(q), core = tk.filter(t=>!this._MODS.includes(t));
    const isCho  = /^[ㄱ-ㅎ]+$/.test(q);          // 전부 초성이면 초성 검색
    const favs   = this.getFavs();
    const scored = [];
    for(const f of this._allFoods()){
      const nm = f.n.toLowerCase();
      let rank = -1;
      if(isCho){
        const ch = this._cho(f.n);
        if(ch.startsWith(q))      rank = 1;
        else if(ch.includes(q))   rank = 3;
      } else {
        const cn = this._canon(f.n);
        if(nm === lower || cn === cq)          rank = 0;
        else if(nm.startsWith(lower) || cn.startsWith(cq)) rank = 1;
        else if(nm.includes(lower) || cn.includes(cq))   rank = 2;
        else if(core.length && core.every(t=>cn.includes(t))) rank = tk.every(t=>cn.includes(t)) ? 2 : 3;   // 띄어쓰기·순서가 달라도
        else if(this._cho(f.n).includes(q)) rank = 4;   // 한글 자모가 섞여도 잡아준다
      }
      if(rank < 0) continue;
      // 층을 나눈다. 같은 층 안에서만 관련도·횟수로 겨룬다.
      //   -2 즐겨찾기 / -1 이름이 정확히 같음 / 0 내가 먹어 본 것 / 1 나머지
      // '닭가슴살' 을 치면 닭가슴살 제품이 수십 개 나온다. 그중 내가 실제로 먹은 게
      // 맨 위로 와야 한다 — 다만 이름이 딱 맞는 것보다 위로 갈 수는 없다.
      const ate = this.eaten(f.n);
      const tier = favs.includes(f.n) ? -2 : (rank===0 ? -1 : (ate ? 0 : 1));
      scored.push([tier, rank, -(ate ? ate.n : 0), f.n.length, f]);
    }
    scored.sort((a,b)=>a[0]-b[0] || a[1]-b[1] || a[2]-b[2] || a[3]-b[3]);
    return scored.slice(0,30).map(x=>x[4]);
  },
  // 최근 먹은 것. 히스토리에는 이름과 값만 있으므로, 같은 이름이 사전에
  // 있으면 그쪽을 쓴다 — 이모지와 단위가 붙어 있어 목록에서 알아보기 쉽다.
  _recent(limit=8){
    const idx=new Map(this._allFoods().map(f=>[f.n,f]));
    const out=[];
    for(const h of this.getHistory()){
      if(!h||!h.name) continue;
      out.push(idx.get(h.name) || { e:'🍴', n:h.name, u:h.unit||'', c:h.cal||0,
                                     p:h.protein||0, cb:h.carb||0, ft:h.fat||0 });
      if(out.length>=limit) break;
    }
    return out;
  },
  // ── 검색창이 비었을 때의 목록: 최근 / 즐겨찾기 (고른 쪽은 계정에 남는다) ──
  //   최근     — 즐겨찾기한 것 먼저, 그 안에서도 최근에 먹은 순 → 나머지 최근 순
  //   즐겨찾기 — 즐겨찾기만, 최근에 먹은 순(한 번도 안 먹은 건 뒤로)
  //   줄을 왼쪽으로 밀면 삭제: 최근에서는 기록에서 빼고, 즐겨찾기에서는 별을 뗀다
  LIST_KEY: 'gl_diet_list_tab',
  listTab(){ return UserStore.get(this.LIST_KEY)==='fav' ? 'fav' : 'recent'; },
  setListTab(v, meal, ds){
    UserStore.set(this.LIST_KEY, v); FirebaseSync?.scheduleSave();
    try{ Haptic.light(); }catch(e){}
    const inp=document.getElementById('dietSearch'); if(inp && inp.value){ inp.value=''; }
    this.searchFood('', meal, ds);
  },
  _listItems(tab){
    const favs=this.getFavs(), H=this.getHistory().filter(h=>h&&h.name);
    const idx=new Map(this._allFoods().map(f=>[f.n,f]));
    const fromH=h=>idx.get(h.name) || { e:'🍴', n:h.name, u:h.unit||'', c:h.cal||0, p:h.protein||0, cb:h.carb||0, ft:h.fat||0 };
    if(tab==='fav'){
      const eatenFav=H.filter(h=>favs.includes(h.name)).map(fromH);
      const never=favs.filter(n=>!H.some(h=>h.name===n)).map(n=>idx.get(n) || { e:'🍴', n, u:'', c:0, p:0, cb:0, ft:0 });
      return eatenFav.concat(never);
    }
    const all=H.slice(0,40).map(fromH);
    return all.filter(f=>favs.includes(f.n)).concat(all.filter(f=>!favs.includes(f.n)));
  },
  _paintList(meal, ds){
    const box=document.getElementById('dietSearchRes'); if(!box) return;
    const tab=this.listTab(), favs=this.getFavs(), list=this._listItems(tab);
    document.querySelectorAll('.dq-tabs button').forEach(b=>b.classList.toggle('on', b.dataset.v===tab));
    document.querySelector('.dq-tabs')?.classList.remove('dq-dim');
    this._hits=list;
    box.innerHTML = list.length
      ? `<div class="diet-rec-hd">${tab==='fav'?'즐겨찾기 · 최근에 먹은 순':'최근 먹은 것 · 즐겨찾기 먼저'}<i>← 밀어 ${tab==='fav'?'해제':'삭제'} · 밀어 즐겨찾기 →</i></div>
         <div class="dq-list">${list.map((f,i)=>this._foodRowHtml(f,i,meal,ds,favs).replace('<div class="diet-food">', `<div class="diet-food" data-row data-i="${i}" data-label="${esc(f.n)}">`)).join('')}</div>`
      : `<div class="diet-empty-hint">${tab==='fav'?'즐겨찾기한 음식이 없습니다. 검색 결과의 ☆ 를 누르면 여기에 모입니다.':'아직 먹은 기록이 없습니다. 위에서 검색해 담아 보세요.'}</div>`;
    try{ RowUI.paint(box.querySelector('.dq-list'), { full:true, edit:()=>{}, del:k=>this._listDel(+k, tab, meal, ds), fav:k=>{ const f=(this._hits||[])[+k]; if(!f) return; this.toggleFav(f.n); App.showToast(this.getFavs().includes(f.n)?`${f.n} 즐겨찾기`:`${f.n} 즐겨찾기 해제`,'success'); this._paintList(meal, ds); } }); }catch(e){}
  },
  _listDel(i, tab, meal, ds){
    const f=(this._hits||[])[i]; if(!f) return;
    if(tab==='fav'){ const fv=this.getFavs().filter(n=>n!==f.n); this.saveFavs(fv); App.showToast(`${f.n} 즐겨찾기 해제`); }
    else { this.saveHistory(this.getHistory().filter(h=>h&&h.name!==f.n)); this._hIdx=null; App.showToast(`${f.n} 최근 기록에서 뺐습니다`); }
    this._paintList(meal, ds);
  },
  // 검색 결과와 '최근 먹은 것' 이 같은 줄 모양을 쓴다. 둘이 달라 보이면
  // 위에 있는 게 눌러도 되는 것인지 사람이 한 번 더 생각하게 된다.
  _foodRowHtml(f, i, meal, ds, favs){
    const fv=favs.includes(f.n);
    const ate=this.eaten(f.n);
    return `<div class="diet-food">
      <button class="diet-food-fav${fv?' on':''}" title="즐겨찾기"
        onclick="event.stopPropagation();Diet.favFromSearch(${i},'${meal}','${ds}')">${fv?'★':'☆'}</button>
      <div class="diet-food-main" onclick="Diet.selectFood(${i},'${meal}','${ds}')">
        <span class="diet-food-nm">${this._em(f.e)}${esc(f.n)}</span>
        <span class="dt-meta">${f.u?`<span class="diet-food-u">${esc(f.u)}</span>`:''}${f.gen?'<span class="dt-src">브랜드 없는 기본 · 대략</span>':this._srcTag(f.e)}${ate?`<span class="diet-food-n" title="지금까지 담은 횟수">${ate.n}회</span>`:''}</span>
      </div>
      <span class="diet-food-cal num">${f.c}<i>kcal</i></span>
    </div>`;
  },
  searchFood(q, meal, ds){
    const box=document.getElementById('dietSearchRes'); if(!box) return;
    const favs=this.getFavs();
    // 검색어가 없으면 빈 화면 대신 최근 먹은 것을 보여 준다.
    // 매일 먹는 게 대체로 비슷해서, 대부분은 여기서 바로 끝난다.
    if(!String(q||'').trim()){
      clearTimeout(this._dbTimer);
      const empty=document.getElementById('dietDbRes'); if(empty) empty.innerHTML='';
      this._paintList(meal, ds);
      return;
    }
    document.querySelector('.dq-tabs')?.classList.add('dq-dim');
    let hits=this._search(q);
    // 내 기록에 없으면 브랜드 없는 기본형을 먼저 권한다(이름이 겹치면 내 것만)
    const gen=this._generic(q).filter(g=>!hits.some(h=>this._canon(h.n)===this._canon(g.n)));
    hits=hits.concat(gen);
    this._hits=hits;
    // 내 목록이 비어도 부정 문구를 띄우지 않는다. 프리셋을 뺀 뒤로는 그게 기본 상태다 —
    // 매번 '없어요' 를 읽게 하는 대신, 아래 식약처 칸이 무슨 일이 벌어지는지 말한다.
    box.innerHTML = hits.length
      ? hits.map((f,i)=>this._foodRowHtml(f,i,meal,ds,favs)).join('')
      : '';
    // 이름이 딱 맞는 게 내 목록에 있으면 굳이 바깥을 뒤지지 않는다.
    // 그 외에는 식약처 DB 를 본다 — 타자 한 글자마다 부르지 않도록 잠시 기다린다.
    // 이름이 맞아도 영양정보가 비어 있으면 바깥을 봐야 한다.
    // 예전 프리셋에는 매크로 칸이 없어서 '닭가슴살' 이 정확히 있는데도
    // 단·탄·지를 못 채웠다 — 이름이 맞는다는 이유로 실측을 막고 있었다.
    const lower = String(q).trim().toLowerCase();
    const hit   = hits.find(f=>!f.gen && f.n.toLowerCase()===lower);
    const full  = hit && ((Number(hit.p)||0) || (Number(hit.cb)||0) || (Number(hit.ft)||0));
    const dbBox = document.getElementById('dietDbRes');
    clearTimeout(this._dbTimer);
    if(full){ if(dbBox) dbBox.innerHTML=''; return; }
    if(dbBox) dbBox.innerHTML='';
    const term = String(q).trim();
    if(term.length >= 2) this._dbTimer = setTimeout(()=>this._dbSearch(term, meal, ds), 250);
    else if(dbBox) dbBox.innerHTML = `<div class="diet-empty-hint">두 글자 이상 입력하면 식약처 DB 에서 찾아요</div>`;
  },
  // ── 담은 목록 (장바구니) ───────────────
  // 누르면 바로 담기지 않는다. 여러 개를 담아 두고 맨 아래 「추가」로 한 번에 넣는다.
  // 예전엔 하나를 고르면 이전 선택이 사라져서 닭가슴살+햇반을 같이 못 넣었다.
  //
  // 단위에 붙은 숫자를 수량만큼 곱한다. "100g"×2 → "200g", "1인분"×2 → "2인분".
  // 숫자로 시작하지 않으면(예: "반개", "M") 곱하지 않고 ×N 을 붙인다.
  _scaleUnit(u, q){
    q = Math.round(q*100)/100;
    if(q === 1) return u || '';
    // '1개(50g)' × 1.5 → '1.5개(75g)'
    const pm = /^(\d+(?:\.\d+)?)([^(]*)\((\d+(?:\.\d+)?)(g|mL)\)$/.exec(u||'');
    if(pm){ const f=v=>{ const n=Math.round(v*10)/10; return Number.isInteger(n)?n:n.toFixed(1); }; return `${f(Number(pm[1])*q)}${pm[2]}(${f(Number(pm[3])*q)}${pm[4]})`; }
    if(!u) return `×${q}`;
    const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(u);
    if(!m) return `${u} ×${q}`;
    const n = Number(m[1]) * q;
    return `${Number.isInteger(n) ? n : n.toFixed(1)}${m[2]}`;
  },
  // 단위가 무게(100g, 1개(138g))면 g 으로 직접 넣을 수 있게 그 무게를 알아 둔다
  _gBase(u){
    const a=/^(\d+(?:\.\d+)?)\s*(g|mL)$/.exec(u||''); if(a) return { g:Number(a[1]), unit:a[2], pure:true };
    const b=/\((\d+(?:\.\d+)?)\s*(g|mL)\)/.exec(u||''); if(b) return { g:Number(b[1]), unit:b[2], pure:false };
    return null;
  },
  _qtyLabel(s){
    const gb=this._gBase(s.u), q=Math.round(s.qty*100)/100;
    if(gb && gb.pure) return `${Math.round(gb.g*q)}${gb.unit}`;
    return String(q);
  },
  // 수량 칸을 누르면 키패드/스크롤로 직접 — 무게 단위면 g, 아니면 개수(0.5개도)
  cartAmt(i, meal, ds){
    const s=(this._cart||[])[i]; if(!s || typeof NumIn==='undefined') return;
    const gb=this._gBase(s.u);
    if(gb){
      NumIn.open({ title:`${s.n} · 먹은 양`, unit:gb.unit, dec:true, cur:Math.round(gb.g*s.qty*10)/10,
        note:`기준 ${s.u} = ${s.c}kcal · 넣은 양만큼 열량·영양소를 다시 계산합니다`,
        done:v=>{ if(!(v>0)) return; s.qty=Math.round(v/gb.g*1000)/1000; this._paintCart(meal, ds); } });
    } else {
      NumIn.open({ title:`${s.n} · 몇 ${s.u?'번':'개'}`, unit:s.u?`× ${s.u}`:'개', dec:true, cur:s.qty,
        note:'0.5 처럼 반만 먹은 것도 넣을 수 있습니다',
        done:v=>{ if(!(v>0)) return; s.qty=Math.round(v*100)/100; this._paintCart(meal, ds); } });
    }
  },
  _cartCal(){ return (this._cart||[]).reduce((a,s)=>a+Math.round(s.c*s.qty),0); },
  _paintCart(meal, ds){
    const box=document.getElementById('dietCart');
    if(box) box.innerHTML=this._cartHtml(meal, ds);
    const btn=document.getElementById('dietCommit');
    if(btn){
      const n=(this._cart||[]).length;
      btn.disabled = !n;
      btn.textContent = n ? `추가 (${n}개 · ${this._cartCal()}kcal)` : '담은 음식 없음';
    }
  },
  _cartHtml(meal, ds){
    const cart=this._cart||[];
    if(!cart.length) return '';
    return `<div class="diet-cart">
      <div class="diet-cart-hd">담은 것 <b class="num">${cart.length}</b></div>
      ${cart.map((s,i)=>{
        const gb=this._gBase(s.u), u=gb&&gb.pure ? '' : this._scaleUnit(s.u, s.qty);   // 무게 단위는 오른쪽 양 칸에 g 으로 보인다
        return `<div class="diet-cart-row">
          <span class="diet-cart-nm">${this._em(s.e)}${esc(s.n)}${u?` <i>${esc(u)}</i>`:''}</span>
          <div class="diet-qty">
            <button onclick="Diet.cartQty(${i},-1,'${meal}','${ds}')" ${s.qty<=this._qStep(s)+1e-9?'disabled':''} aria-label="줄이기">−</button>
            <button type="button" class="diet-qty-n num" onclick="Diet.cartAmt(${i},'${meal}','${ds}')" aria-label="양 직접 입력">${this._qtyLabel(s)}</button>
            <button onclick="Diet.cartQty(${i},1,'${meal}','${ds}')" aria-label="늘리기">+</button>
          </div>
          <span class="diet-cart-cal num">${Math.round(s.c*s.qty)}<i>kcal</i></span>
          <button class="diet-cart-del" onclick="Diet.cartRemove(${i},'${meal}','${ds}')" aria-label="빼기">✕</button>
        </div>`;
      }).join('')}
      <div class="diet-cart-sum">합계 <b class="num">${this._cartCal()}</b>kcal</div>
    </div>`;
  },
  // 같은 음식을 또 누르면 줄을 늘리지 않고 수량만 올린다
  addToCart(food, meal, ds){
    if(!this._cart) this._cart=[];
    const hit=this._cart.find(x=>x.n===food.n && x.u===food.u);
    if(hit) hit.qty++;
    else this._cart.push({ ...food, qty:1 });
    this._paintCart(meal, ds);
  },
  cartQty(i, d, meal, ds){
    const s=(this._cart||[])[i]; if(!s) return;
    const st=this._qStep(s);
    s.qty=Math.round(Math.min(99, Math.max(st, s.qty+d*st))*1000)/1000;
    this._paintCart(meal, ds);
  },
  // −/+ 한 번: 100g 같은 무게 단위는 10g, 나머지는 1개(1보다 작으면 0.5)
  _qStep(s){ const gb=this._gBase(s.u); if(gb && gb.pure) return 10/gb.g; return s.qty<1 || s.qty%1 ? 0.5 : 1; },
  cartRemove(i, meal, ds){
    if(!this._cart) return;
    this._cart.splice(i,1);
    this._paintCart(meal, ds);
  },
  selectFood(i, meal, ds){
    const f=(this._hits||[])[i]; if(!f) return;
    this.addToCart({ e:f.e, n:f.n, u:f.u, c:f.c, p:f.p, cb:f.cb, ft:f.ft }, meal, ds);
  },
  selectRecent(name, meal, ds){
    const f=this.getHistory().find(x=>x.name===name); if(!f) return;
    this.addToCart({ e:'🍴', n:f.name, u:f.unit||'', c:f.cal||0,
                     p:f.protein||0, cb:f.carb||0, ft:f.fat||0 }, meal, ds);
  },
  // 직접 입력은 기본으로 접어 둔다 — 대부분은 식약처 DB 에서 해결된다
  toggleManual(){
    const box=document.getElementById('dietManual');
    const btn=document.getElementById('dietManualBtn');
    if(!box) return;
    const open = box.style.display==='none';
    box.style.display = open ? '' : 'none';
    if(btn) btn.textContent = open ? '직접 입력 닫기' : '직접 입력';
    if(open) setTimeout(()=>document.getElementById('fName')?.focus(),50);
  },
  addManualToCart(meal, ds){
    const name=(document.getElementById('fName')?.value||'').trim();
    if(!name){ App.showToast('음식 이름을 입력해주세요','error'); return; }
    const num=id=>{ const e=document.getElementById(id); return e ? (parseFloat(e.value)||0) : 0; };
    this.addToCart({ e:'🍴', n:name, u:'', c:Math.round(num('fCal')),
                     p:num('fProt'), cb:num('fCarb'), ft:num('fFat') }, meal, ds);
    ['fName','fCal','fProt','fCarb','fFat'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
    document.getElementById('fName')?.focus();
  },
  commitCart(meal, ds){
    const cart=this._cart||[];
    if(!cart.length){ App.showToast('담은 음식이 없습니다','error'); return; }
    const date=new Date(ds+'T00:00:00');
    const data=this.getData(date);
    if(!data[meal]) data[meal]=[];
    for(const s of cart){
      const u=this._scaleUnit(s.u, s.qty);
      data[meal].push({
        name:    u ? `${s.n} ${u}` : s.n,   // 목록에 보이는 이름 — 수량이 반영된다
        base:    s.n,                        // 즐겨찾기·히스토리 키는 항상 기본 이름
        unit:    s.u || '',
        qty:     s.qty,
        cal:     Math.round(s.c * s.qty),
        protein: +(s.p  * s.qty).toFixed(1),
        carb:    +(s.cb * s.qty).toFixed(1),
        fat:     +(s.ft * s.qty).toFixed(1),
      });
      // 히스토리는 1개분으로 남긴다. 그래야 다음에 꺼낼 때 수량을 다시 고를 수 있다.
      this.addToHistory({ name:s.n, unit:s.u||'', cal:s.c, protein:s.p, carb:s.cb, fat:s.ft });
    }
    this.saveData(data, date);
    const n=cart.length, kcal=this._cartCal();
    this._cart=[];
    App.closeModal();
    App.showToast(`${n}개 · ${kcal}kcal 추가됨`,'success');
    this.render(date);
  },

  // ── 음식 추가 모달 ─────────────────────
  showAdd(meal=null,dateStr=null){
    this._cart=[]; this._hits=null;   // 지난번에 담아둔 게 남아 있으면 안 된다
    if(!meal) meal=this._suggestMeal();
    const ds=dateStr||this._localDateStr();
    const favs=this.getFavs();
    const recent=this.getRecentUnique(10);

    // 즐겨찾기 + 최근 목록 (즐찾 먼저)
    const favItems=recent.filter(f=>favs.includes(f.name));
    const otherItems=recent.filter(f=>!favs.includes(f.name));
    const quickList=[...favItems,...otherItems];

    // v2 에서는 숨는다(css/v2-diet.css) — 검색창이 비어 있을 때 '최근 먹은 것' 이 같은 목록을
    // 즐겨찾기·횟수까지 붙여 이미 보여 준다. 두 번 보이면 어느 쪽을 눌러야 하는지 헷갈린다.
    const quickHTML=quickList.length?`
      <div class="diet-quick">
        <div class="diet-quick-hd">빠른 추가</div>
        <div class="diet-quick-list">
          ${quickList.map(f=>{
            const freq=this.getFreqLast30(f.name);
            const isFv=favs.includes(f.name);
            return `<div class="diet-quick-item${isFv?' diet-quick-fav':''}" onclick="Diet._quickAdd('${f.name.replace(/'/g,'&#39;')}','${meal}','${ds}')">
              ${isFv?'★ ':''}${esc(f.name)}
              <span class="diet-quick-cal">${f.cal}kcal${freq>1?` · ${freq}회`:''}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`:'';

    App.openModal(`@diet ${meal} 추가`,`<div class="dt dt-add">
      <input id="dietSearch" class="inp diet-search" autocomplete="off" enterkeyhint="search"
        placeholder="음식 이름 · 초성도 돼요 (ㄷㄱㅅㅅ)"
        oninput="Diet.searchFood(this.value,'${meal}','${ds}')">
      <button class="scan-btn" onclick="Scan.open('${meal}','${ds}')">
        바코드 스캔<i>제품 하나로 바로 찾아요</i></button>
      <div class="dq-tabs" role="tablist">
        <button type="button" data-v="recent" onclick="Diet.setListTab('recent','${meal}','${ds}')">최근</button>
        <button type="button" data-v="fav" onclick="Diet.setListTab('fav','${meal}','${ds}')">즐겨찾기</button>
      </div>
      <div id="dietCart"></div>
      <div id="dietSearchRes"></div>
      <div id="dietDbRes"></div>
      ${quickHTML}
      <button id="dietManualBtn" class="diet-manual-btn" onclick="Diet.toggleManual()">직접 입력</button>
      <div id="dietManual" class="dt-manual" style="display:none">
        <div class="dt-note">식약처 DB 에도 없는 음식 — 포장의 영양성분표를 보고 적어 주세요</div>
        <div class="modal-row"><label class="modal-lbl" for="fName">음식 이름</label>
          <input id="fName" type="text" placeholder="예: 엄마표 된장찌개" class="inp"></div>
        <div class="modal-grid2 dt-grid">
          <div><label class="modal-lbl" for="fCal">열량 (kcal)</label><input id="fCal" type="number" inputmode="decimal" min="0" placeholder="0" class="inp inp-sm"></div>
          <div><label class="modal-lbl" for="fProt">단백질 (g)</label><input id="fProt" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
          <div><label class="modal-lbl" for="fCarb">탄수화물 (g)</label><input id="fCarb" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
          <div><label class="modal-lbl" for="fFat">지방 (g)</label><input id="fFat" type="number" inputmode="decimal" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
        </div>
        <button class="btn-sm dt-ghost dt-wide" onclick="Diet.addManualToCart('${meal}','${ds}')">담기</button>
      </div>
      <div class="modal-btns dt-foot">
        <button id="dietCommit" onclick="Diet.commitCart('${meal}','${ds}')" class="btn-sm accent" disabled>담은 음식 없음</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
    setTimeout(()=>{ this._paintCart(meal, ds); this.searchFood('', meal, ds);
                     document.getElementById('dietSearch')?.focus(); },50);
  },

  // 빠른 추가도 검색과 같은 흐름을 탄다 — 누르면 선택되고, 수량을 정한 뒤 추가한다.
  _quickAdd(name,meal,dateStr){ this.selectRecent(name, meal, dateStr); },

  // saveFood 는 장바구니(commitCart)로 대체됐다. 호출하는 곳이 없어 지운다.

  // ── 끼니 옮기기: 음식을 꾹 눌러(0.4초) 다른 끼니 위로 끌어 놓는다 ──
  // 접힌 끼니(머리줄)에도 놓을 수 있다. 놓은 끼니는 펼쳐서 옮겨진 게 바로 보이게 한다.
  _bindMove(ds){
    const list=document.querySelector('#dietWrap .dm-list'); if(!list) return;
    list.querySelectorAll('.dm-food').forEach(el=>{
      let timer=0, sx=0, sy=0;
      const start=(x,y)=>{ timer=setTimeout(()=>this._dragStart(el, x, y, ds), 400); sx=x; sy=y; };
      const cancel=()=>{ clearTimeout(timer); timer=0; };
      el.addEventListener('touchstart', e=>{ if(e.target.closest('button')) return; const t=e.touches[0]; start(t.clientX, t.clientY); }, { passive:true });
      el.addEventListener('touchmove', e=>{ const t=e.touches[0]; if(timer && (Math.abs(t.clientX-sx)>8 || Math.abs(t.clientY-sy)>8)) cancel(); }, { passive:true });
      el.addEventListener('touchend', cancel); el.addEventListener('touchcancel', cancel);
      el.addEventListener('mousedown', e=>{ if(e.button || e.target.closest('button')) return; start(e.clientX, e.clientY);
        const up=()=>{ cancel(); document.removeEventListener('mouseup', up); }; document.addEventListener('mouseup', up); });
      el.addEventListener('mousemove', e=>{ if(timer && (Math.abs(e.clientX-sx)>8 || Math.abs(e.clientY-sy)>8)) cancel(); });
      el.addEventListener('contextmenu', e=>{ if(this._drag) e.preventDefault(); });
    });
  },
  _dragStart(el, x, y, ds){
    const from=el.dataset.meal, idx=+el.dataset.idx, r=el.getBoundingClientRect();
    const ghost=el.cloneNode(true); ghost.className='dm-food dm-ghost';
    Object.assign(ghost.style, { left:r.left+'px', top:r.top+'px', width:r.width+'px' });
    document.body.appendChild(ghost); el.classList.add('dm-lifted');
    document.querySelectorAll('#dietWrap .dm').forEach(m=>m.classList.add('dm-drop'));
    try{ Haptic.medium(); }catch(e){}
    const dx=x-r.left, dy=y-r.top;
    let over=null;
    const target=(cx,cy)=>{ ghost.style.visibility='hidden'; const t=document.elementFromPoint(cx,cy); ghost.style.visibility=''; return t && t.closest('#dietWrap .dm'); };
    const move=(cx,cy)=>{
      ghost.style.left=(cx-dx)+'px'; ghost.style.top=(cy-dy)+'px';
      const m=target(cx,cy);
      if(m!==over){ over?.classList.remove('dm-over'); over=m; if(m){ m.classList.add('dm-over'); try{ Haptic.select(); }catch(e){} } }
    };
    const end=()=>{
      document.removeEventListener('touchmove', tm, { passive:false }); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
      document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', end);
      ghost.remove(); this._drag=false;
      document.querySelectorAll('#dietWrap .dm').forEach(m=>m.classList.remove('dm-drop','dm-over'));
      el.classList.remove('dm-lifted');
      const to=over && over.querySelector('.dm-nm')?.textContent.trim();
      if(to && to!==from && this.MEALS.includes(to)) this.moveItem(from, idx, to, ds);
    };
    const tm=e=>{ e.preventDefault(); const t=e.touches[0]; move(t.clientX, t.clientY); };
    const mm=e=>move(e.clientX, e.clientY);
    this._drag=true;
    document.addEventListener('touchmove', tm, { passive:false }); document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', end);
  },
  moveItem(from, idx, to, ds){
    const date=new Date(ds+'T00:00:00'), data=this.getData(date);
    const it=(data[from]||[]).splice(idx,1)[0]; if(!it) return;
    (data[to]=data[to]||[]).push(it);
    this.saveData(data,date);
    this._open[to]=true;
    this.render(date);
    try{ Haptic.success(); }catch(e){}
    App.showToast(`${it.base||it.name} → ${to}로 옮겼습니다`,'success');
  },
  remove(meal,idx,dateStr=null){
    const date=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const data=this.getData(date);
    data[meal].splice(idx,1);
    this.saveData(data,date);
    this.render(date);
  },

  // ── 설정 ──────────────────────────────
  showSettings(){
    const s=this.getSettings();
    const rest=s.restDays||[0,6]; // 기본: 일,토
    const days=['일','월','화','수','목','금','토'];
    const row=(p,g)=>`<div class="dt-goal">
        <label class="dt-goal-k"><span>열량</span><span class="dt-in"><input id="${p}CalG" type="number" inputmode="numeric" value="${g.cal}" class="inp inp-sm"><i>kcal</i></span></label>
        <label><span>단백질</span><span class="dt-in"><input id="${p}ProtG" type="number" inputmode="numeric" value="${g.pro}" class="inp inp-sm"><i>g</i></span></label>
        <label><span>탄수화물</span><span class="dt-in"><input id="${p}CarbG" type="number" inputmode="numeric" value="${g.carb}" class="inp inp-sm"><i>g</i></span></label>
        <label><span>지방</span><span class="dt-in"><input id="${p}FatG" type="number" inputmode="numeric" value="${g.fat}" class="inp inp-sm"><i>g</i></span></label>
      </div>`;
    App.openModal('@gear 식단 목표',`<div class="dt dt-set">
      <section class="dt-sec">
        <div class="dt-sec-hd">평일</div>
        ${row('s',{cal:s.calorieGoal,pro:s.proteinGoal,carb:s.carbGoal,fat:s.fatGoal})}
      </section>
      <section class="dt-sec">
        <div class="dt-sec-hd">휴일</div>
        <div class="modal-lbl">휴일로 쓸 요일</div>
        <div class="dt-days">
          ${days.map((d,i)=>`<label class="dt-day${rest.includes(i)?' on':''}${i===0?' sun':i===6?' sat':''}">
            <input type="checkbox" value="${i}" ${rest.includes(i)?'checked':''} class="rest-day-chk">${d}</label>`).join('')}
        </div>
        ${row('r',{cal:s.restCalGoal||s.calorieGoal,pro:s.restProteinGoal||s.proteinGoal,carb:s.restCarbGoal||s.carbGoal,fat:s.restFatGoal||s.fatGoal})}
      </section>
      <div class="modal-btns">
        <button onclick="Diet.saveSettings()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
    // 휴일 버튼 토글
    setTimeout(()=>{
      document.querySelectorAll('.rest-day-chk').forEach(cb=>{
        const lbl=cb.closest('label');
        cb.addEventListener('change',()=>lbl.classList.toggle('on',cb.checked));
      });
    },50);
  },
  // 운동 소모 열량 자세히
  showBurn(ds){
    const d=new Date(ds+'T00:00:00'), b=Fitness.burn(d), s=this.getSettings(), bm=s.burnMode||'half', w=typeof Steps!=='undefined'?Steps.kcal(d):{ steps:0, net:0, kcal:0 };
    const won=v=>Math.round(v).toLocaleString('ko-KR');
    const opt=(v,l,sub)=>`<button type="button" class="db-opt${bm===v?' on':''}" onclick="Diet.setBurnMode('${v}','${ds}')"><b>${l}</b><small>${sub}</small></button>`;
    App.openModal('@dumbbell 운동으로 쓴 열량',`<div class="dt db">
      <div class="db-big"><span class="num">${won(b.kcal+w.kcal)}</span><i>kcal</i></div>
      <p class="db-note">몸무게 <span class="num">${b.kg}</span>kg 기준 추정치입니다. 가만히 있어도 쓰는 열량은 빼고, 운동으로 더 쓴 만큼만 셌습니다.</p>
      <div class="db-list">${b.items.map(x=>`<div class="db-row"><span>${esc(x.name)}</span><small class="num">${esc(x.info)}</small><b class="num">${won(x.kcal)}</b></div>`).join('')}${w.steps?`<div class="db-row"><span>도보</span><small class="num">${won(w.steps)}걸음${w.net<w.steps?` 중 ${won(w.net)}걸음(유산소 겹친 걸음 뺌)`:''}</small><b class="num">${won(w.kcal)}</b></div>`:''}</div>
      <div class="dt-sec-hd" style="margin-top:24px">식단 목표에 얼마나 더할까요</div>
      <div class="db-opts">${opt('half','절반','기본 · 추정치가 넉넉한 편이라')}${opt('full','전부','소모한 만큼 다')}${opt('off','안 함','목표 그대로')}</div>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>
    </div>`);
  },
  setBurnMode(v, ds){
    const s=this.getSettings(); s.burnMode=v; UserStore.set(this._setKey(), JSON.stringify(s)); FirebaseSync?.scheduleSave();
    this.render(new Date(ds+'T00:00:00')); this.showBurn(ds);
  },
  saveSettings(){
    const restDays=[...document.querySelectorAll('.rest-day-chk:checked')].map(c=>parseInt(c.value));
    UserStore.set(this._setKey(),JSON.stringify({ ...this.getSettings(),
      calorieGoal: parseInt(document.getElementById('sCalG')?.value)||2200,
      proteinGoal: parseInt(document.getElementById('sProtG')?.value)||160,
      carbGoal:    parseInt(document.getElementById('sCarbG')?.value)||220,
      fatGoal:     parseInt(document.getElementById('sFatG')?.value)||60,
      restCalGoal:     parseInt(document.getElementById('rCalG')?.value)||2200,
      restProteinGoal: parseInt(document.getElementById('rProtG')?.value)||160,
      restCarbGoal:    parseInt(document.getElementById('rCarbG')?.value)||220,
      restFatGoal:     parseInt(document.getElementById('rFatG')?.value)||60,
      restDays,
    }));
    FirebaseSync?.scheduleSave();
    this.render(); App.closeModal(); App.showToast('저장됨','success');
  },
};
