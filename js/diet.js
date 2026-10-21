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

  render(date=new Date()){
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
    const burn=(typeof Fitness!=='undefined'&&Fitness.burn) ? Fitness.burn(date) : { kcal:0, items:[] };
    const bm=s.burnMode||'half', bonus=bm==='off'?0:bm==='full'?burn.kcal:Math.round(burn.kcal/2/10)*10;
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
            <div class="dm-food">
              <button class="diet-fav-btn${this.isFav(item.base||item.name)?' is-fav':''}"
                onclick="Diet._clickFav('${(item.base||item.name).replace(/'/g,'&#39;')}','${meal}','${ds}')" title="즐겨찾기" aria-label="즐겨찾기">★</button>
              <span class="dm-fn">${esc(item.name)}</span>
              <span class="dm-fc num">${item.cal}</span>
              <button class="dm-del" onclick="Diet.remove('${meal}',${idx},'${ds}')" aria-label="${esc(item.name)} 삭제">✕</button>
            </div>`).join('')}
          <button type="button" class="dm-more" onclick="Diet.showAdd('${meal}','${ds}')">+ ${meal}에 더하기</button>
        </div>`:''}
      </div>`;
    }).join('');

    document.getElementById('dietWrap').innerHTML=`
      <div class="dk">
        <div class="dk-sub">${isToday?'오늘 ':ds+' '}${over?'초과한 열량':'남은 열량'} · 목표 ${won(s.calorieGoal)}${bonus?` + 운동 ${won(bonus)}`:''}</div>
        <div class="dk-big"><span class="num${over?' over':''}">${won(Math.abs(left))}</span><span class="dk-u">kcal</span>
          <span class="dk-eat">먹음 <b class="num">${won(t.cal)}</b></span></div>
        <div class="dk-bar"><i style="width:${Math.min(100,pct)}%"${over?' class="over"':''}></i></div>
        <div class="dk-mac">
          <div><span>단백질</span><b class="num">${this.macroTxt(t.protein,t,'')}<small> / ${s.proteinGoal}g</small></b><em><i class="acc" style="width:${mpct(t.protein,s.proteinGoal)}%"></i></em></div>
          <div><span>탄수화물</span><b class="num">${this.macroTxt(t.carb,t,'')}<small> / ${s.carbGoal}g</small></b><em><i style="width:${mpct(t.carb,s.carbGoal)}%"></i></em></div>
          <div><span>지방</span><b class="num">${this.macroTxt(t.fat,t,'')}<small> / ${s.fatGoal}g</small></b><em><i style="width:${mpct(t.fat,s.fatGoal)}%"></i></em></div>
        </div>
        ${burn.kcal?`<button type="button" class="dk-burn" onclick="Diet.showBurn('${ds}')"><span>운동 <b class="num">−${won(burn.kcal)}</b> kcal</span>${bonus?`<span class="dk-burn-plus"><b class="num">+${won(bonus)}</b> kcal 더 드셔도 됩니다</span>`:'<span class="dk-burn-plus">목표에 반영 안 함</span>'}</button>`:''}
        ${t.unknown?`<div class="diet-macro-note">${t.unknown}개 음식은 영양정보가 없어 빠져 있어요 — 눌러서 채울 수 있어요</div>`:''}
      </div>
      <div class="dk-acts">
        <button type="button" class="dk-act on" onclick="Diet.showPhotoAnalysis('${ds}')">${typeof Icons!=='undefined'?Icons.svg('camera'):''}사진</button>
        <button type="button" class="dk-act" onclick="Diet.showAdd('${nowMeal}','${ds}')">검색</button>
        <button type="button" class="dk-act" onclick="Diet.showSettings()">목표</button>
      </div>
      <div class="dm-list">${mealsHTML}</div>`;

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
  // ── AI 음식 사전 ──────────────────────
  // 사전에도 식약처 DB 에도 없는 음식만 AI 에게 묻는다. 만든 건 저장해 둔다 —
  // 같은 걸 두 번 물으면 숫자가 매번 조금씩 달라지고, 그때마다 또 기다려야 한다.
  _aiKey(){ return 'gl_food_ai'; },
  getAiFoods(){ try{ return JSON.parse(UserStore.get(this._aiKey())||'[]'); }catch{ return []; } },
  saveAiFoods(v){ UserStore.set(this._aiKey(), JSON.stringify(v.slice(0,500))); FirebaseSync?.scheduleSave(); },
  _rememberAi(f){
    const list=this.getAiFoods().filter(x=>x&&x.n!==f.n);
    list.unshift({ n:f.n, u:f.u, c:f.c, p:f.p, cb:f.cb, ft:f.ft, src:f.src||'ai', at:new Date().toISOString() });
    this.saveAiFoods(list);
  },
  // onclick="Diet.x('여기')" 자리로 들어가는 글자다. 두 번 해석된다 — HTML 이 속성을 읽고,
  // 그 결과를 JS 가 문자열로 읽는다. 따옴표 하나만 막으면 「김단단's」 같은 이름이 함수 호출을
  // 깨뜨린다. 그래서 역슬래시와 홑따옴표도 같이 막는다.
  _attr(s){ return String(s==null?'':s).replace(/[&<>"'\\]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'\\&#39;', '\\':'\\\\',
  }[c])); },

  // 출처 표시. 예전 화면(v1)은 이모지로, v2 는 작은 글자 꼬리표로 보여 준다 —
  // 둘 다 같은 뜻(어디서 온 숫자인가)이고, 어느 쪽을 쓸지는 css/v2-diet.css 가 고른다.
  SRC: { '🥗':'식약처', '🌍':'OFF', '📋':'성분표', '🤖':'AI 추정' },
  _em(e){ return e ? `<span class="dt-em">${e} </span>` : ''; },
  _srcTag(e){ const t=this.SRC[e]; return t ? `<span class="dt-src${e==='🤖'?' ai':''}">${t}</span>` : ''; },

  _aiBtnHtml(meal, ds){
    return `<button class="diet-ai-btn" id="dietAiBtn" onclick="Diet.aiLookup('${meal}','${ds}')">AI 로 영양정보 찾기</button>
      <div id="dietAiRes"></div>`;
  },
  async aiLookup(meal, ds){
    const q=(document.getElementById('dietSearch')?.value||'').trim();
    if(!q) return;
    const key=JARVIS._getKey();
    if(!key){ JARVIS.needKey('AI 키가 있어야 합니다 — 무료 키로 바로 쓸 수 있습니다'); return; }
    const btn=document.getElementById('dietAiBtn');
    const box=document.getElementById('dietAiRes');
    if(btn){ btn.disabled=true; btn.textContent='찾는 중…'; }
    if(box) box.innerHTML='';
    try{
      const f=await this._aiFood(q);
      this._aiPending=f;
      if(box) box.innerHTML=this._aiConfirmHtml(f, meal, ds);
    }catch(err){
      if(box) box.innerHTML=`<div class="diet-empty-hint">AI 검색 실패 · ${esc(err.message)}</div>`;
    }
    if(btn){ btn.disabled=false; btn.textContent='AI 로 다시 찾기'; }
  },
  async _aiFood(q){
    // 세트를 통째로 물으면 값이 낮게, 그리고 매번 다르게 나왔다.
    // 실제로 '버거킹 몬스터 jr 버거 라지세트' 를 다섯 번 물어 910·1000·910·1000·1010 kcal 을 받았다.
    // 실제 값은 1,300 kcal 쯤이다(버거 690 + 감자 라지 410 + 콜라 210).
    //
    // 나눠서 물으면 두 가지가 같이 해결된다. 구성품 하나하나는 모델이 잘 아는 물건이고,
    // 더하기는 우리가 한다 — 1,290 kcal 이 나왔고 세 번을 물어도 같은 값이었다.
    // 사람도 '버거 560 + 감자 470 + 콜라 260' 을 보면 어디가 틀렸는지 짚을 수 있다.
    // 합계 하나만 보여 주면 틀렸는지조차 알 수 없다.
    const prompt = `「${q}」가 사람이 먹는 음식인지 먼저 판단해라.
음식이 아니면(사물·장소·사람 등) 다른 필드 없이 {"ok":false} 만 낸다. 이때는 절대 숫자를 지어내지 않는다.
음식이면 한국에서 파는 1회 제공량 기준으로 답한다.
세트·콤보처럼 여러 음식이 묶인 이름이면 구성품을 하나씩 나눠 적고 각각의 값을 낸다.
세트는 보통 메인 + 사이드(감자튀김 등) + 음료다. 라지 세트면 사이드와 음료도 라지다.
단일 음식이면 parts 에 그 하나만 넣는다.
JSON 만 출력해. 다른 말은 붙이지 마.
{"ok":true,"name":"음식 이름","unit":"기준량 (예: 100g, 1개, 1세트)","parts":[{"n":"구성품","amt":"양","cal":숫자,"protein":숫자,"carb":숫자,"fat":숫자}]}`;
    // 모델 이름은 JARVIS 가 고른다 — 한 군데서 고르지 않으면 Groq 이 모델을 내릴 때마다
    // 여기저기서 따로 죽는다. 실제로 그렇게 죽었다.
    //
    // max_tokens 가 300 이었다. 지금 모델은 답하기 전에 속으로 생각하고 그 생각도 이 예산을 먹는다.
    // '사과' 는 통과했지만 세트 메뉴처럼 조금만 복잡해지면 생각만 하다 예산이 끝나
    // 본문이 빈 채로 돌아왔다(finish_reason:'length', content:'').
    // 그렇다고 크게 잡을 수도 없다 — 무료 등급은 분당 8,000 토큰이라 금방 막힌다.
    //
    // temperature 는 0 이다. 0.2 는 같은 음식을 두 번 물으면 다른 숫자를 줬고,
    // 그중 하나가 사전에 영영 저장됐다. 추정이어도 흔들리지는 말아야 한다.
    const data=await JARVIS.chat({ max_tokens:900, temperature:0,
      messages:[{role:'user',content:prompt}] });
    const ch=data.choices?.[0];
    const text=ch?.message?.content||'';
    // 왜 실패했는지를 구분해서 말한다. '못 찾았습니다' 한 마디로 뭉뚱그리면
    // 질문을 바꿔야 하는지, 다시 눌러야 하는지 알 수가 없다.
    if(!text.trim()) throw new Error(ch?.finish_reason==='length'
      ? '답이 길어 잘렸어요. 이름을 조금 짧게 해서 다시 눌러 주세요'
      : 'AI 가 빈 답을 보냈어요. 다시 눌러 주세요');
    let j=null; try{ const m=text.match(/\{[\s\S]*\}/); j=m?JSON.parse(m[0]):null; }catch{}
    if(!j) throw new Error('AI 답을 읽지 못했어요. 다시 눌러 주세요');
    if(j.ok===false) throw new Error('먹는 것으로 보지 않았어요');

    const num=v=>{ const n=Number(v); return isFinite(n)&&n>=0 ? n : 0; };
    // parts 가 없으면 예전 모양(cal/protein/…)으로 온 것이다. 한 덩어리로 받아 준다.
    const parts=(Array.isArray(j.parts)&&j.parts.length ? j.parts : [j])
      .map(x=>({ n:String(x.n||x.name||'').trim().slice(0,30),
                 amt:String(x.amt||'').trim().slice(0,20),
                 c:Math.round(num(x.cal)), p:num(x.protein), cb:num(x.carb), ft:num(x.fat) }))
      .filter(x=>x.c>0||x.p>0||x.cb>0||x.ft>0);
    if(!parts.length) throw new Error('AI 가 숫자를 못 냈어요. 다시 눌러 주세요');

    const sum=k=>parts.reduce((a,x)=>a+x[k],0);
    const r1=v=>Math.round(v*10)/10;
    let c=sum('c'); const p=r1(sum('p')), cb=r1(sum('cb')), ft=r1(sum('ft'));

    // 칼로리와 단탄지는 서로 묶여 있다 — 단백질·탄수 4, 지방 9 kcal.
    // 둘이 크게 어긋나면 둘 중 하나가 헛소리다. 이때는 계산으로 나오는 쪽을 믿는다.
    // (더하기는 틀릴 수가 없고, 기억해 낸 총량은 틀릴 수 있다.)
    const derived=Math.round(4*p+4*cb+9*ft);
    let fixed=false;
    if(derived>0 && Math.abs(c-derived)/derived > 0.3){ c=derived; fixed=true; }

    const name=String(j.name||q).trim().slice(0,40) || q;
    return { n:name, u:String(j.unit||'').trim().slice(0,20),
             c, p, cb, ft, parts, fixed };
  },
  // AI 가 낸 숫자는 그대로 들어가지 않는다. 추정값이라고 말하고, 고칠 수 있게 두고,
  // 누를 때 들어간다. 한번 들어간 칼로리는 나중에 틀린 걸 알아채기가 어렵다.
  _aiConfirmHtml(f, meal, ds){
    const A=s=>this._attr(s);
    return `<div class="diet-ai-card">
      <div class="diet-ai-hd">
        <span class="diet-ai-nm">${this._em('🤖')}${esc(f.n)}</span>
        <span class="diet-ai-warn">AI 추정값 · 맞는지 보고 담으세요</span>
      </div>
      ${(f.parts&&f.parts.length>1)?`<div class="diet-ai-parts">
        ${f.parts.map(x=>`<div class="dap-row"><span class="dap-n">${esc(x.n)}${
          x.amt?` <i>${esc(x.amt)}</i>`:''}</span><span class="dap-c num">${x.c}<i>kcal</i></span></div>`).join('')}
        <div class="dap-row dap-sum"><span class="dap-n">합계</span><span class="dap-c num">${f.c}<i>kcal</i></span></div>
      </div>`:''}
      ${f.fixed?`<div class="diet-ai-note">단백질·탄수·지방으로 계산한 값과 크게 달라서 칼로리를 다시 계산했어요.</div>`:''}
      <div class="diet-ai-grid">
        <label>기준량<input id="aiU"  class="inp inp-sm" value="${A(f.u)}"></label>
        <label>kcal<input id="aiC"  type="number" class="inp inp-sm" value="${f.c}"></label>
        <label>단백질<input id="aiP"  type="number" step="0.1" class="inp inp-sm" value="${f.p}"></label>
        <label>탄수화물<input id="aiCb" type="number" step="0.1" class="inp inp-sm" value="${f.cb}"></label>
        <label>지방<input id="aiFt" type="number" step="0.1" class="inp inp-sm" value="${f.ft}"></label>
      </div>
      <button class="btn-sm accent diet-ai-add dt-go" onclick="Diet.aiConfirm('${meal}','${ds}')">담고 사전에 저장</button>
    </div>`;
  },
  aiConfirm(meal, ds){
    const f=this._aiPending; if(!f) return;
    const num=(id,d)=>{ const e=document.getElementById(id); if(!e) return d;
      const n=parseFloat(e.value); return isFinite(n)&&n>=0 ? n : d; };
    const uEl=document.getElementById('aiU');
    const food={ e:'🤖', n:f.n, u:(uEl?uEl.value:f.u||'').trim(),
      c:Math.round(num('aiC',f.c)), p:num('aiP',f.p), cb:num('aiCb',f.cb), ft:num('aiFt',f.ft) };
    this._rememberAi(food);
    this.addToCart(food, meal, ds);
    this._aiPending=null;
    App.showToast(`「${food.n}」 사전에 저장됨 · 다음부턴 바로 검색됩니다`,'success');
    // 저장했으니 이제 그냥 검색된다 — 목록을 다시 그려서 그걸 보여 준다.
    const inp=document.getElementById('dietSearch'); if(inp) inp.value=food.n;
    this.searchFood(food.n, meal, ds);
  },

  // ── 띄어쓰기·순서·표기가 달라도 찾기 (서버 lib/mfds.js 와 같은 규칙) ──
  _VAR: [['마끼아또','마키아또','마키아토','마끼야또','마키야또','마끼아토'],['프라푸치노','프라프치노','프라푸찌노'],
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
      const rec=this._recent(8);
      this._hits=rec;
      box.innerHTML = rec.length
        ? `<div class="diet-rec-hd">최근 먹은 것</div>`
          + rec.map((f,i)=>this._foodRowHtml(f,i,meal,ds,favs)).join('')
        : '';
      clearTimeout(this._dbTimer);
      const empty=document.getElementById('dietDbRes'); if(empty) empty.innerHTML='';
      return;
    }
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
    if(term.length >= 2) this._dbTimer = setTimeout(()=>this._dbSearch(term, meal, ds), 350);
    else if(dbBox) dbBox.innerHTML = `<div class="diet-empty-hint">두 글자 이상 입력하면 식약처 DB 에서 찾아요</div>`;
  },
  // ── 식약처 식품영양성분DB ────────────────
  // 내 사전에 없으면 여기서 찾는다. AI 추정보다 먼저다 —
  // '비요뜨' 를 AI 에게 물으면 "요거트 음료 100kcal" 을 지어냈지만,
  // 이 DB 에는 '비요뜨 초코링 145kcal/100g' 이 실측으로 들어 있다.
  // 식약처 한 줄을 담을 수 있는 모양으로 바꾼다. 바코드 조회(js/barcode.js)도 이걸 쓴다 —
  // 환산 공식이 두 벌이면 같은 제품이 화면마다 다른 칼로리로 보인다.
  //
  // 값은 100g 기준으로 온다. 제품 한 개의 중량을 알면 그 단위로 환산해서 담는다 —
  // 비요뜨를 100g 씩 먹지는 않으니까. 모르면 기준량(100g) 그대로 둔다.
  _fromDb(x){
    const base = Number(x.per) || 100;
    const k    = x.pack ? x.pack / base : 1;
    const r1   = v => Math.round((Number(v)||0) * k * 10) / 10;
    return {
      e: x.e || '🥗', n: x.name,
      u:  x.pack ? `1개(${x.pack}${x.unit||'g'})` : `${base}${x.unit||'g'}`,
      c:  Math.round((Number(x.kcal)||0) * k),
      p:  r1(x.protein), cb: r1(x.carb), ft: r1(x.fat),
      grp: x.maker || x.group || '',
      // 환산했으면 원래 기준을 같이 보여 준다. 숫자를 확인할 길이 있어야 한다.
      note: x.pack ? `${base}${x.unit||'g'}당 ${Math.round(x.kcal||0)}kcal` : '',
    };
  },
  async _dbSearch(q, meal, ds){
    const box = document.getElementById('dietDbRes');
    if(!box) return;
    box.innerHTML = `<div class="diet-rec-hd">식약처 영양성분DB 찾는 중…</div>`;
    let j = null;
    try {
      const r = await fetch(Platform.api('/api/food?q=' + encodeURIComponent(q) + '&rows=8'));
      j = await r.json();
    } catch(e) { j = null; }
    // 오가는 사이에 검색어가 바뀌었으면 늦게 온 답은 버린다.
    const cur = (document.getElementById('dietSearch')?.value || '').trim();
    if(cur !== q) return;
    if(!j || !j.ok || !(j.items||[]).length){
      box.innerHTML = this._labelHtml(q, meal, ds) + this._aiBtnHtml(meal, ds);
      return;
    }
    this._dbHits = j.items.map(x => this._fromDb(x));
    box.innerHTML = `<div class="diet-rec-hd">식약처 영양성분DB <i>${Number(j.total||0).toLocaleString('ko-KR')}건 중</i></div>`
      + this._dbHits.map((f,i) => `<div class="diet-food">
          <div class="diet-food-main" onclick="Diet.selectDbFood(${i},'${meal}','${ds}')">
            <span class="diet-food-nm">${this._em(f.e)}${esc(f.n)}</span>
            <span class="dt-meta"><span class="diet-food-u">${esc(f.u)}</span>${f.grp?`<span class="diet-food-n">${esc(f.grp)}</span>`:''}${f.note?`<span class="diet-food-note">${esc(f.note)}</span>`:''}</span>
          </div>
          <span class="diet-food-cal num">${f.c}<i>kcal</i></span>
        </div>`).join('')
      + `<div class="diet-macro-note">${j.total > this._dbHits.length
            ? `${Number(j.total).toLocaleString('ko-KR')}건 중 ${this._dbHits.length}개 · 제품명을 더 붙여 치면 좁혀져요 · `
            : ''}담은 뒤 수량(−/+)으로 개수를 맞추세요</div>`
      // 목록에 내 제품이 없을 수도 있다. 그때 갈 길을 여기서 같이 연다.
      + this._labelHtml(q, meal, ds);
  },
  // ── 영양성분표 촬영 ──────────────────────
  // 식약처 DB 는 모든 제품을 담고 있지 않다. 실제로 '김단단 닭가슴살' 은 0건이었다.
  // 그럴 때 AI 에게 '이 제품 몇 칼로리냐' 고 묻는 건 기억을 지어내게 하는 일이다.
  // 포장의 표를 찍어 옮겨 적게 하는 건 전혀 다른 일이다 — 눈앞의 글자를 읽는 것이라
  // 지어낼 여지가 없고, 애초에 그 표가 제조사가 신고한 값이라 가장 정확하다.
  _labelHtml(q, meal, ds){
    const A = this._attr(q);
    return `<div class="diet-label-box">
      <div class="diet-rec-hd">영양성분표 찍기 <i>가장 정확해요</i></div>
      <div class="diet-label-hint">포장 뒷면의 표를 찍으면 <b>적힌 값을 그대로</b> 읽어 옵니다. 추정하지 않아요.</div>
      <input id="lblFile" type="file" accept="image/*" capture="environment" style="display:none"
             onchange="Diet._onLabelPick(this,'${A}','${meal}','${ds}')">
      <button class="btn-sm dp-rt-btn dt-ghost" onclick="document.getElementById('lblFile').click()">영양성분표 촬영 / 선택</button>
      <div id="lblResult"></div>
    </div>`;
  },
  _onLabelPick(input, q, meal, ds){
    const f = input.files && input.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = e => { this._lblB64 = String(e.target.result).split(',')[1]; this._readLabel(q, meal, ds); };
    r.readAsDataURL(f);
  },
  async _readLabel(q, meal, ds){
    const box = document.getElementById('lblResult');
    if(!box) return;
    if(!JARVIS._getKey()){
      box.innerHTML = `<div class="diet-empty-hint">표를 읽으려면 AI 키가 필요합니다. <button type="button" class="btn-sm accent" onclick="JARVIS.showKeySetup()">무료 키 넣기</button></div>`; return;
    }
    box.innerHTML = `<div class="diet-empty-hint">표를 읽는 중…</div>`;
    // 이 프롬프트의 핵심은 '추정하지 마라' 다. 아는 제품이라도 기억으로 채우면
    // 사진을 찍은 의미가 없어지고, 다시 지어낸 숫자가 사전에 저장된다.
    const prompt = `이 사진은 식품 포장의 영양성분표다. 적혀 있는 값을 그대로 옮겨 적어라.
추정하지 마라. 사진에서 읽을 수 없는 값은 null 로 둔다. 아는 제품이라도 기억으로 채우지 마라.
기준량은 표에 적힌 문구를 그대로 쓴다 (예: "총 내용량 100g", "1회 제공량 30g").
총 내용량당 값과 100g당 값이 둘 다 있으면 총 내용량 쪽을 쓴다.
JSON 만 출력한다. 다른 말은 붙이지 마라.
{"ok":true,"name":"제품명(읽히면)","basis":"기준량 문구","grams":숫자 또는 null,"kcal":숫자 또는 null,"protein":숫자 또는 null,"carb":숫자 또는 null,"fat":숫자 또는 null}
영양성분표가 사진에 없으면 {"ok":false} 만 출력한다.`;
    try{
      const data = await JARVIS.chat({ max_tokens:700, temperature:0,
        messages:[{ role:'user', content:[
          { type:'image_url', image_url:{ url:`data:image/jpeg;base64,${this._lblB64}` } },
          { type:'text', text: prompt },
        ]}] }, 'vision');
      const t = data.choices?.[0]?.message?.content || '';
      let j = null; try{ const m = t.match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; }catch(e){}
      if(!j) { box.innerHTML = `<div class="diet-empty-hint">답을 읽지 못했어요. 다시 찍어 주세요</div>`; return; }
      if(j.ok === false){ box.innerHTML = `<div class="diet-empty-hint">사진에서 영양성분표를 찾지 못했어요. 표가 잘 보이게 다시 찍어 주세요</div>`; return; }
      if(j.kcal == null){ box.innerHTML = `<div class="diet-empty-hint">열량을 읽지 못했어요. 표가 흐리면 값이 빠집니다 — 다시 찍어 주세요</div>`; return; }
      const A = s => this._attr(s);
      const nm = String(j.name || q).trim().slice(0,40) || q;
      const u  = String(j.basis || '').trim().slice(0,24);
      box.innerHTML = `<div class="diet-ai-card">
        <div class="diet-ai-hd"><span class="diet-ai-nm">${this._em('📋')}${esc(nm)}</span>
          <span class="diet-ai-u">${esc(u)}</span></div>
        <div class="diet-label-hint">읽은 값이 맞는지 보고 고칠 수 있어요. 못 읽은 칸은 비어 있습니다.</div>
        <div class="modal-grid2 dt-grid">
          <label>열량(kcal)<input id="lbC"  type="number" class="inp inp-sm" value="${j.kcal ?? ''}"></label>
          <label>단백질(g)<input id="lbP"  type="number" step="0.1" class="inp inp-sm" value="${j.protein ?? ''}"></label>
          <label>탄수(g)<input id="lbCb" type="number" step="0.1" class="inp inp-sm" value="${j.carb ?? ''}"></label>
          <label>지방(g)<input id="lbF"  type="number" step="0.1" class="inp inp-sm" value="${j.fat ?? ''}"></label>
        </div>
        <button class="btn-sm accent dp-rt-btn dt-go" onclick="Diet._saveLabel('${A(nm)}','${A(u)}','${meal}','${ds}')">담기</button>
      </div>`;
    }catch(err){
      box.innerHTML = `<div class="diet-empty-hint">읽기 실패 · ${esc(err.message)}</div>`;
    }
  },
  _saveLabel(name, unit, meal, ds){
    const num = id => { const e = document.getElementById(id); const v = e ? parseFloat(e.value) : NaN; return isFinite(v) && v >= 0 ? v : 0; };
    const f = { e:'📋', n:name, u:unit, c:Math.round(num('lbC')), p:num('lbP'), cb:num('lbCb'), ft:num('lbF') };
    if(!f.c){ App.showToast('열량을 입력해주세요','error'); return; }
    // 표에서 읽은 값이라는 걸 남긴다. 실측(db)·추정(ai)과 구분돼야 나중에 판단할 수 있다.
    this._rememberAi({ ...f, src:'label' });
    this.addToCart(f, meal, ds);
    this._lblB64 = null;
  },

  selectDbFood(i, meal, ds){
    const f = (this._dbHits||[])[i]; if(!f) return;
    // 사전에 남긴다. 같은 걸 또 검색하지 않아도 되고, 하루 1만 회 한도도 아낀다.
    this._rememberAi({ n:f.n, u:f.u, c:f.c, p:f.p, cb:f.cb, ft:f.ft, src:'db' });
    this.addToCart(f, meal, ds);
  },

  favFromSearch(i, meal, ds){
    const f=(this._hits||[])[i]; if(!f) return;
    this.toggleFav(f.n);
    const q=document.getElementById('dietSearch')?.value||'';
    this.searchFood(q, meal, ds);      // 즐겨찾기가 위로 올라가는 게 바로 보이도록 다시 그린다
  },
  // ── 담은 목록 (장바구니) ───────────────
  // 누르면 바로 담기지 않는다. 여러 개를 담아 두고 맨 아래 「추가」로 한 번에 넣는다.
  // 예전엔 하나를 고르면 이전 선택이 사라져서 닭가슴살+햇반을 같이 못 넣었다.
  //
  // 단위에 붙은 숫자를 수량만큼 곱한다. "100g"×2 → "200g", "1인분"×2 → "2인분".
  // 숫자로 시작하지 않으면(예: "반개", "M") 곱하지 않고 ×N 을 붙인다.
  _scaleUnit(u, q){
    if(q <= 1) return u || '';
    if(!u) return `×${q}`;
    const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(u);
    if(!m) return `${u} ×${q}`;
    const n = Number(m[1]) * q;
    return `${Number.isInteger(n) ? n : n.toFixed(1)}${m[2]}`;
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
        const u=this._scaleUnit(s.u, s.qty);
        return `<div class="diet-cart-row">
          <span class="diet-cart-nm">${this._em(s.e)}${esc(s.n)}${u?` <i>${esc(u)}</i>`:''}</span>
          <div class="diet-qty">
            <button onclick="Diet.cartQty(${i},-1,'${meal}','${ds}')" ${s.qty<=1?'disabled':''} aria-label="줄이기">−</button>
            <span class="diet-qty-n num">${s.qty}</span>
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
    s.qty=Math.min(99, Math.max(1, s.qty+d));
    this._paintCart(meal, ds);
  },
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

  remove(meal,idx,dateStr=null){
    const date=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const data=this.getData(date);
    data[meal].splice(idx,1);
    this.saveData(data,date);
    this.render(date);
  },

  // ── 사진 분석 ─────────────────────────
  showPhotoAnalysis(dateStr=null){
    const ds=dateStr||this._localDateStr();
    const key=JARVIS._getKey();
    if(!key){ JARVIS.needKey('AI 키가 있어야 합니다 — 무료 키로 바로 쓸 수 있습니다'); return; }
    const sug=this._suggestMeal();
    const camIc=typeof Icons!=='undefined'?Icons.svg('camera'):'';
    App.openModal('@camera 사진으로 기록',`<div class="dt dt-photo">
      <p class="dt-lead">사진을 올리면 AI 가 음식과 열량을 추정해요.</p>
      <div class="dt-field"><div class="modal-lbl">끼니</div>
        <input type="hidden" id="photoMeal" value="${sug}">
        <div class="dt-seg" role="radiogroup" aria-label="끼니">
          ${this.MEALS.map(m=>`<button type="button" role="radio" class="${m===sug?'on':''}" aria-checked="${m===sug}"
            onclick="Diet._pickPhotoMeal(this,'${m}')">${m}</button>`).join('')}
        </div>
      </div>
      <div id="photoDropZone" class="photo-drop-zone" onclick="document.getElementById('photoFileInput').click()">
        <div id="photoPreviewWrap" class="dt-drop">${camIc}
          <span>눌러서 사진 고르기</span><small>또는 여기로 끌어 놓기</small></div>
        <input id="photoFileInput" type="file" accept="image/*" style="display:none"
          onchange="Diet._onPhotoSelected(this,'${ds}')">
      </div>
      <div id="photoResult" style="display:none"></div>
      <div class="modal-btns">
        <button id="btnAnalyzePhoto" onclick="Diet._analyzePhoto('${ds}')" class="btn-sm accent" disabled>AI 분석</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
    setTimeout(()=>{
      const zone=document.getElementById('photoDropZone'); if(!zone) return;
      zone.addEventListener('dragover',e=>{e.preventDefault();zone.style.borderColor='var(--accent)';});
      zone.addEventListener('dragleave',()=>{zone.style.borderColor='';});
      zone.addEventListener('drop',e=>{ e.preventDefault(); zone.style.borderColor=''; const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) Diet._loadFile(f,ds); });
    },100);
  },

  _photoBase64:null,
  _pickPhotoMeal(btn, m){
    const inp=document.getElementById('photoMeal'); if(inp) inp.value=m;
    btn.parentElement.querySelectorAll('button').forEach(b=>{
      const on=b===btn; b.classList.toggle('on',on); b.setAttribute('aria-checked',on); });
  },
  _onPhotoSelected(input,dateStr){ const f=input.files[0]; if(f) this._loadFile(f,dateStr); },
  _loadFile(file,dateStr){
    const reader=new FileReader();
    reader.onload=e=>{
      this._photoBase64=e.target.result.split(',')[1];
      document.getElementById('photoPreviewWrap').innerHTML=`<img class="dt-shot" alt="고른 사진" src="data:${file.type};base64,${this._photoBase64}" style="max-width:100%;max-height:160px;border-radius:8px;object-fit:contain">`;
      const btn=document.getElementById('btnAnalyzePhoto'); if(btn){ btn.disabled=false; }
    };
    reader.readAsDataURL(file);
  },
  async _analyzePhoto(dateStr){
    if(!this._photoBase64) return;
    const btn=document.getElementById('btnAnalyzePhoto');
    if(btn){ btn.disabled=true; btn.textContent='분석 중...'; }
    const key=JARVIS._getKey();
    const meal=document.getElementById('photoMeal')?.value||'저녁';
    try{
      const data=await JARVIS.chat({ max_tokens:1000,
        messages:[{role:'user',content:[
          {type:'image_url',image_url:{url:`data:image/jpeg;base64,${this._photoBase64}`}},
          {type:'text',text:`이 사진에 있는 음식을 분석해서 아래 JSON 형식으로만 출력해줘. 다른 텍스트 없이 JSON만.
{"foods":[{"name":"음식명","amount":"양(예:100g,1개)","cal":칼로리숫자,"protein":단백질g,"carb":탄수화물g,"fat":지방g}],"total_cal":총칼로리,"meal":"아침|점심|저녁|간식","comment":"한줄코멘트"}
한국 음식 기준으로 칼로리를 최대한 정확하게 추정해줘. 음식이 없으면 foods를 빈 배열로 반환해줘.`}
        ]}] }, 'vision');
      const text=data.choices?.[0]?.message?.content||'';
      let parsed; try{ const m=text.match(/\{[\s\S]*\}/); parsed=m?JSON.parse(m[0]):null; }catch{}
      if(!parsed?.foods){ App.showToast('분석 실패','error'); if(btn){btn.disabled=false;btn.textContent='AI 분석';} return; }
      const resultEl=document.getElementById('photoResult'); if(!resultEl) return;
      resultEl.style.display='block';
      const tot=parsed.total_cal||parsed.foods.reduce((a,f)=>a+(Number(f.cal)||0),0);
      resultEl.innerHTML=`<div class="dt-pres">
        <div class="dt-pres-hd"><span class="modal-lbl">AI 추정</span>
          <span class="dt-pres-tot"><b class="num">${Math.round(tot).toLocaleString('ko-KR')}</b> kcal</span></div>
        ${parsed.foods.map(f=>`<div class="dt-pres-row"><span class="dt-pres-nm">${esc(f.name)}${f.amount?` <i>${esc(f.amount)}</i>`:''}</span><span class="dt-pres-c num">${f.cal}<i>kcal</i></span></div>`).join('')}
        ${parsed.comment?`<p class="dt-pres-cm">${esc(parsed.comment)}</p>`:''}
      </div>
      <button onclick="Diet._savePhotoFoods(${JSON.stringify(parsed.foods).replace(/"/g,'&quot;')},'${meal}','${dateStr}')" class="btn-sm accent dt-go">${meal}에 추가</button>`;
      // 결과가 나오면 주 단추는 '추가' 다. 다시 분석은 보조로 내린다.
      if(btn) btn.classList.remove('accent');
      if(btn){btn.textContent='다시 분석';btn.disabled=false;}
    }catch(err){ App.showToast('분석 실패: '+err.message,'error'); if(btn){btn.disabled=false;btn.textContent='AI 분석';} }
  },
  _savePhotoFoods(foods,meal,dateStr){
    const date=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const data=this.getData(date);
    if(!data[meal])data[meal]=[];
    foods.forEach(f=>{
      const food={name:f.name+(f.amount?`(${f.amount})`:''),cal:f.cal||0,protein:f.protein||0,carb:f.carb||0,fat:f.fat||0};
      data[meal].push(food); this.addToHistory(food);
    });
    this.saveData(data,date); this.render(date);
    App.closeModal(); App.showToast(`${meal}에 ${foods.length}개 추가됨`,'success');
    this._photoBase64=null;
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
    const d=new Date(ds+'T00:00:00'), b=Fitness.burn(d), s=this.getSettings(), bm=s.burnMode||'half';
    const won=v=>Math.round(v).toLocaleString('ko-KR');
    const opt=(v,l,sub)=>`<button type="button" class="db-opt${bm===v?' on':''}" onclick="Diet.setBurnMode('${v}','${ds}')"><b>${l}</b><small>${sub}</small></button>`;
    App.openModal('@dumbbell 운동으로 쓴 열량',`<div class="dt db">
      <div class="db-big"><span class="num">${won(b.kcal)}</span><i>kcal</i></div>
      <p class="db-note">몸무게 <span class="num">${b.kg}</span>kg 기준 추정치입니다. 가만히 있어도 쓰는 열량은 빼고, 운동으로 더 쓴 만큼만 셌습니다.</p>
      <div class="db-list">${b.items.map(x=>`<div class="db-row"><span>${esc(x.name)}</span><small class="num">${esc(x.info)}</small><b class="num">${won(x.kcal)}</b></div>`).join('')}</div>
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
