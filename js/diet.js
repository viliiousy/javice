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
    return JSON.parse(UserStore.get(this._setKey())||JSON.stringify(
      {calorieGoal:2200,proteinGoal:160,carbGoal:220,fatGoal:60}));
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
    return JSON.parse(UserStore.get(this._key(date))||JSON.stringify(
      {아침:[],점심:[],저녁:[],간식:[]}));
  },
  saveData(d,date=new Date()){ UserStore.set(this._key(date),JSON.stringify(d)); FirebaseSync?.scheduleSave(); },

  // ── 즐겨찾기 ──────────────────────────
  getFavs(){ return JSON.parse(UserStore.get(this._favKey())||'[]'); },
  saveFavs(v){ UserStore.set(this._favKey(),JSON.stringify(v)); FirebaseSync?.scheduleSave(); },
  toggleFav(name){
    const favs=this.getFavs();
    const idx=favs.indexOf(name);
    if(idx===-1) favs.push(name); else favs.splice(idx,1);
    this.saveFavs(favs);
  },
  isFav(name){ return this.getFavs().includes(name); },

  // ── 음식 히스토리 (최근 10개 + 빈도) ──
  getHistory(){ return JSON.parse(UserStore.get(this._histKey())||'[]'); },
  saveHistory(v){ UserStore.set(this._histKey(),JSON.stringify(v.slice(0,200))); FirebaseSync?.scheduleSave(); },
  addToHistory(food){
    const h=this.getHistory();
    // 중복 제거 후 맨 앞에 추가
    const filtered=h.filter(f=>f.name!==food.name);
    filtered.unshift({...food,lastAdded:new Date().toISOString()});
    this.saveHistory(filtered);
  },
  getRecentUnique(n=10){
    return this.getHistory().slice(0,n);
  },
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

  totals(data){
    let cal=0,protein=0,carb=0,fat=0;
    Object.values(data).forEach(m=>m.forEach(i=>{
      cal+=i.cal||0; protein+=i.protein||0; carb+=i.carb||0; fat+=i.fat||0;
    }));
    return {cal,protein,carb,fat};
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

    document.getElementById('dietBadge').textContent=`${t.cal} / ${s.calorieGoal} kcal`;

    const mealsHTML=this.MEALS.map(meal=>{
      const items=data[meal]||[];
      const mealCal=items.reduce((s,i)=>s+(i.cal||0),0);
      return `<div class="meal-sec">
        <div class="meal-hd" onclick="Diet.showAdd('${meal}','${ds}')">
          <span>${this.EMOJIS[meal]} ${meal}${mealCal?` <span style="color:var(--text3);font-weight:400">${mealCal}kcal</span>`:''}</span>
          <span style="color:var(--accent-l);font-size:14px">+</span>
        </div>
        <div class="meal-items">
          ${items.map((item,idx)=>`
            <div class="meal-food">
              <button class="diet-fav-btn${this.isFav(item.base||item.name)?' is-fav':''}"
                onclick="Diet._clickFav('${(item.base||item.name).replace(/'/g,'&#39;')}','${meal}','${ds}')" title="즐겨찾기">★</button>
              <span>${esc(item.name)}</span>
              <span class="meal-food-cal">${item.cal}kcal
                <button class="btn-del-food" onclick="Diet.remove('${meal}',${idx},'${ds}')">✕</button>
              </span>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');

    document.getElementById('dietWrap').innerHTML=`
      <div class="diet-summary">
        <svg class="diet-ring" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="22" fill="none" stroke="var(--card)" stroke-width="4"/>
          <circle cx="24" cy="24" r="22" fill="none" stroke="${col}" stroke-width="4"
            stroke-dasharray="${(pct/100)*C} ${C}" stroke-linecap="round"
            transform="rotate(-90 24 24)" style="transition:stroke-dasharray 0.5s"/>
        </svg>
        <div class="diet-info">
          <div class="diet-cal-num">${t.cal.toLocaleString()}</div>
          <div class="diet-cal-sub">${isToday?'오늘':ds} · 목표 ${s.calorieGoal.toLocaleString()}kcal · ${pct}%</div>
        </div>
        <div style="display:flex;gap:4px">
          <button onclick="Diet.showPhotoAnalysis('${ds}')" title="📷 사진 분석"
            style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);border-radius:8px;color:var(--cyan);cursor:pointer;font-size:18px;padding:6px 8px">📷</button>
          <button onclick="Diet.showSettings()" title="목표 설정"
            style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:4px">⚙️</button>
        </div>
      </div>
      <div class="diet-macros">
        <div class="macro"><div class="macro-lbl">단백질</div><div class="macro-val" style="color:var(--cyan)">${t.protein}g</div><div class="macro-goal">목표 ${s.proteinGoal}g</div></div>
        <div class="macro"><div class="macro-lbl">탄수화물</div><div class="macro-val" style="color:var(--yellow)">${t.carb}g</div><div class="macro-goal">목표 ${s.carbGoal}g</div></div>
        <div class="macro"><div class="macro-lbl">지방</div><div class="macro-val" style="color:var(--accent-l)">${t.fat}g</div><div class="macro-goal">목표 ${s.fatGoal}g</div></div>
      </div>
      ${mealsHTML}`;

    if(typeof App!=='undefined') App._updateStatsBanner();
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
  // 프리셋 + 내가 직접 입력했던 음식을 한 목록으로. 프리셋이 먼저, 중복 이름은 프리셋 우선.
  _allFoods(){
    const db = (typeof FOOD_DB!=='undefined' ? FOOD_DB : [])
      .map(([e,n,u,c]) => ({ e, n, u, c, p:0, cb:0, ft:0 }));
    const seen = new Set(db.map(f=>f.n));
    // AI 사전이 히스토리보다 앞이다 — 영양소가 전부 들어 있다.
    const ai = [];
    for(const f of this.getAiFoods()){
      if(!f || !f.n || seen.has(f.n)) continue;
      seen.add(f.n);
      ai.push({ e:'🤖', n:f.n, u:f.u||'', c:f.c||0, p:f.p||0, cb:f.cb||0, ft:f.ft||0 });
    }
    const hist = this.getHistory()
      .filter(f => f && f.name && !seen.has(f.name))
      .map(f => ({ e:'🍴', n:f.name, u:'', c:f.cal||0, p:f.protein||0, cb:f.carb||0, ft:f.fat||0 }));
    return db.concat(ai, hist);
  },
  // ── AI 음식 사전 ──────────────────────
  // 프리셋에 없는 음식은 AI 에게 물어서 만든다. 만든 건 저장해 둔다 —
  // 같은 걸 두 번 물으면 숫자가 매번 조금씩 달라지고, 그때마다 또 기다려야 한다.
  _aiKey(){ return 'gl_food_ai'; },
  getAiFoods(){ try{ return JSON.parse(UserStore.get(this._aiKey())||'[]'); }catch{ return []; } },
  saveAiFoods(v){ UserStore.set(this._aiKey(), JSON.stringify(v.slice(0,500))); FirebaseSync?.scheduleSave(); },
  _rememberAi(f){
    const list=this.getAiFoods().filter(x=>x&&x.n!==f.n);
    list.unshift({ n:f.n, u:f.u, c:f.c, p:f.p, cb:f.cb, ft:f.ft, at:new Date().toISOString() });
    this.saveAiFoods(list);
  },
  _attr(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); },

  _aiBtnHtml(meal, ds){
    return `<button class="diet-ai-btn" id="dietAiBtn" onclick="Diet.aiLookup('${meal}','${ds}')">AI 로 영양정보 찾기</button>
      <div id="dietAiRes"></div>`;
  },
  async aiLookup(meal, ds){
    const q=(document.getElementById('dietSearch')?.value||'').trim();
    if(!q) return;
    const key=localStorage.getItem('gl_ai_key');
    if(!key){ App.showToast('JARVIS API 키를 먼저 설정해주세요 (⚡→🔑)','error'); return; }
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
    const prompt = `한국에서 흔히 먹는 기준으로 「${q}」의 1회 제공량 영양정보를 알려줘.
JSON 만 출력해. 다른 말은 붙이지 마.
{"ok":true,"name":"음식 이름","unit":"기준량 (예: 100g, 1개, 1인분)","cal":숫자,"protein":숫자,"carb":숫자,"fat":숫자}
음식이 아니거나 모르면 {"ok":false} 만 출력해.`;
    // 모델 이름은 JARVIS 가 고른다 — 한 군데서 고르지 않으면 Groq 이 모델을 내릴 때마다
    // 여기저기서 따로 죽는다. 실제로 그렇게 죽었다.
    const data=await JARVIS.chat({ max_tokens:300, temperature:0.2,
      messages:[{role:'user',content:prompt}] });
    const text=data.choices?.[0]?.message?.content||'';
    let j=null; try{ const m=text.match(/\{[\s\S]*\}/); j=m?JSON.parse(m[0]):null; }catch{}
    if(!j || j.ok===false) throw new Error('음식으로 못 찾았습니다');
    const num=v=>{ const n=Number(v); return isFinite(n)&&n>=0 ? n : 0; };
    const name=String(j.name||q).trim().slice(0,40) || q;
    return { n:name, u:String(j.unit||'').trim().slice(0,20),
             c:Math.round(num(j.cal)), p:num(j.protein), cb:num(j.carb), ft:num(j.fat) };
  },
  // AI 가 낸 숫자는 그대로 들어가지 않는다. 추정값이라고 말하고, 고칠 수 있게 두고,
  // 누를 때 들어간다. 한번 들어간 칼로리는 나중에 틀린 걸 알아채기가 어렵다.
  _aiConfirmHtml(f, meal, ds){
    const A=s=>this._attr(s);
    return `<div class="diet-ai-card">
      <div class="diet-ai-hd">
        <span class="diet-ai-nm">🤖 ${esc(f.n)}</span>
        <span class="diet-ai-warn">AI 추정값 · 맞는지 보고 담으세요</span>
      </div>
      <div class="diet-ai-grid">
        <label>기준량<input id="aiU"  class="inp inp-sm" value="${A(f.u)}"></label>
        <label>kcal<input id="aiC"  type="number" class="inp inp-sm" value="${f.c}"></label>
        <label>단백질<input id="aiP"  type="number" step="0.1" class="inp inp-sm" value="${f.p}"></label>
        <label>탄수화물<input id="aiCb" type="number" step="0.1" class="inp inp-sm" value="${f.cb}"></label>
        <label>지방<input id="aiFt" type="number" step="0.1" class="inp inp-sm" value="${f.ft}"></label>
      </div>
      <button class="btn-sm accent diet-ai-add" onclick="Diet.aiConfirm('${meal}','${ds}')">담고 사전에 저장</button>
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

  _search(q){
    q = String(q||'').trim();
    if(!q) return [];
    const lower  = q.toLowerCase();
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
        if(nm === lower)          rank = 0;
        else if(nm.startsWith(lower)) rank = 1;
        else if(nm.includes(lower))   rank = 2;
        else if(this._cho(f.n).includes(q)) rank = 4;   // 한글 자모가 섞여도 잡아준다
      }
      if(rank < 0) continue;
      // 즐겨찾기는 무조건 위로 (god_life 의 favs.concat(rest) 와 같은 규칙)
      scored.push([favs.includes(f.n) ? -1 : rank, f.n.length, f]);
    }
    scored.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    return scored.slice(0,30).map(x=>x[2]);
  },
  searchFood(q, meal, ds){
    const box=document.getElementById('dietSearchRes'); if(!box) return;
    const hits=this._search(q);
    this._hits=hits;
    if(!String(q||'').trim()){ box.innerHTML=''; return; }
    if(!hits.length){
      box.innerHTML=`<div class="diet-empty-hint">「${esc(q)}」 결과가 없습니다</div>`
        + this._aiBtnHtml(meal, ds);
      return;
    }
    const favs=this.getFavs();
    box.innerHTML=hits.map((f,i)=>{
      const fv=favs.includes(f.n);
      return `<div class="diet-food">
        <button class="diet-food-fav${fv?' on':''}" title="즐겨찾기"
          onclick="event.stopPropagation();Diet.favFromSearch(${i},'${meal}','${ds}')">${fv?'★':'☆'}</button>
        <div class="diet-food-main" onclick="Diet.selectFood(${i},'${meal}','${ds}')">
          <span class="diet-food-nm">${f.e} ${esc(f.n)}</span>
          ${f.u?`<span class="diet-food-u">${esc(f.u)}</span>`:''}
        </div>
        <span class="diet-food-cal">${f.c}<i>kcal</i></span>
      </div>`;
    }).join('');
    // 비슷한 게 나왔지만 찾던 게 아닐 수 있다. 이름이 딱 맞는 게 없으면 AI 길도 열어 둔다.
    const exact = hits.some(f=>f.n.toLowerCase()===String(q).trim().toLowerCase());
    if(!exact) box.innerHTML += this._aiBtnHtml(meal, ds);
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
      <div class="diet-cart-hd">담은 것 ${cart.length}개</div>
      ${cart.map((s,i)=>{
        const u=this._scaleUnit(s.u, s.qty);
        return `<div class="diet-cart-row">
          <span class="diet-cart-nm">${s.e} ${esc(s.n)}${u?` <i>${esc(u)}</i>`:''}</span>
          <div class="diet-qty">
            <button onclick="Diet.cartQty(${i},-1,'${meal}','${ds}')" ${s.qty<=1?'disabled':''} aria-label="줄이기">−</button>
            <span class="diet-qty-n">${s.qty}</span>
            <button onclick="Diet.cartQty(${i},1,'${meal}','${ds}')" aria-label="늘리기">+</button>
          </div>
          <span class="diet-cart-cal">${Math.round(s.c*s.qty)}<i>kcal</i></span>
          <button class="diet-cart-del" onclick="Diet.cartRemove(${i},'${meal}','${ds}')" aria-label="빼기">✕</button>
        </div>`;
      }).join('')}
      <div class="diet-cart-sum">합계 <b>${this._cartCal()}</b>kcal</div>
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
  // 직접 입력은 기본으로 접어 둔다 — 프리셋 316개로 대부분 해결된다
  toggleManual(){
    const box=document.getElementById('dietManual');
    const btn=document.getElementById('dietManualBtn');
    if(!box) return;
    const open = box.style.display==='none';
    box.style.display = open ? '' : 'none';
    if(btn) btn.textContent = open ? '− 직접 입력 닫기' : '＋ 직접 입력';
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
    App.showToast(`${n}개 · ${kcal}kcal 추가됨 ✓`,'success');
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

    const quickHTML=quickList.length?`
      <div style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px">빠른 추가 (클릭)</div>
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

    const dbN = (typeof FOOD_DB!=='undefined' ? FOOD_DB.length : 0);
    App.openModal(`${this.EMOJIS[meal]} ${meal} 추가`,`
      <input id="dietSearch" class="inp diet-search" autocomplete="off"
        placeholder="음식 검색 — 초성도 됩니다 (예: ㄷㄱㅅㅅ)"
        oninput="Diet.searchFood(this.value,'${meal}','${ds}')">
      <div id="dietCart"></div>
      <div id="dietSearchRes"></div>
      ${quickHTML}
      <button id="dietManualBtn" class="diet-manual-btn" onclick="Diet.toggleManual()">＋ 직접 입력</button>
      <div id="dietManual" style="display:none">
        <div style="font-size:11px;color:var(--text3);margin:8px 0 6px">프리셋 ${dbN}개에 없는 음식</div>
        <div class="modal-row"><label class="modal-lbl">음식 이름 *</label>
          <input id="fName" type="text" placeholder="예: 엄마표 된장찌개" class="inp"></div>
        <div class="modal-grid2">
          <div><label class="modal-lbl">칼로리 (kcal)</label><input id="fCal" type="number" min="0" placeholder="0" class="inp inp-sm"></div>
          <div><label class="modal-lbl">단백질 (g)</label><input id="fProt" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
          <div><label class="modal-lbl">탄수화물 (g)</label><input id="fCarb" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
          <div><label class="modal-lbl">지방 (g)</label><input id="fFat" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
        </div>
        <button class="btn-sm" style="width:100%;margin-top:8px" onclick="Diet.addManualToCart('${meal}','${ds}')">담기</button>
      </div>
      <div class="modal-btns">
        <button id="dietCommit" onclick="Diet.commitCart('${meal}','${ds}')" class="btn-sm accent" disabled>담은 음식 없음</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>{ this._paintCart(meal, ds); document.getElementById('dietSearch')?.focus(); },50);
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
    const key=localStorage.getItem('gl_ai_key');
    if(!key){ App.showToast('JARVIS API 키를 먼저 설정해주세요 (⚡→🔑)','error'); return; }
    App.openModal('@camera 음식 사진 AI 분석',`
      <p style="color:var(--text2);font-size:13px;margin-bottom:10px">사진을 업로드하면 AI가 자동 분석합니다.</p>
      <div style="margin-bottom:10px"><label class="modal-lbl">식사 구분</label>
        <select id="photoMeal" class="inp inp-sm">
          ${this.MEALS.map(m=>`<option value="${m}"${m===this._suggestMeal()?'selected':''}>${this.EMOJIS[m]} ${m}</option>`).join('')}
        </select>
      </div>
      <div id="photoDropZone" class="photo-drop-zone" onclick="document.getElementById('photoFileInput').click()">
        <div id="photoPreviewWrap"><div style="font-size:48px">📷</div>
          <p style="color:var(--text2);font-size:13px">클릭하거나 사진을 올려주세요</p></div>
        <input id="photoFileInput" type="file" accept="image/*" style="display:none"
          onchange="Diet._onPhotoSelected(this,'${ds}')">
      </div>
      <div id="photoResult" style="display:none;margin-top:10px"></div>
      <div class="modal-btns" style="margin-top:10px">
        <button id="btnAnalyzePhoto" onclick="Diet._analyzePhoto('${ds}')" class="btn-sm accent" disabled>AI 분석</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>{
      const zone=document.getElementById('photoDropZone'); if(!zone) return;
      zone.addEventListener('dragover',e=>{e.preventDefault();zone.style.borderColor='var(--accent)';});
      zone.addEventListener('dragleave',()=>{zone.style.borderColor='';});
      zone.addEventListener('drop',e=>{ e.preventDefault(); zone.style.borderColor=''; const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) Diet._loadFile(f,ds); });
    },100);
  },

  _photoBase64:null,
  _onPhotoSelected(input,dateStr){ const f=input.files[0]; if(f) this._loadFile(f,dateStr); },
  _loadFile(file,dateStr){
    const reader=new FileReader();
    reader.onload=e=>{
      this._photoBase64=e.target.result.split(',')[1];
      document.getElementById('photoPreviewWrap').innerHTML=`<img src="data:${file.type};base64,${this._photoBase64}" style="max-width:100%;max-height:160px;border-radius:8px;object-fit:contain">`;
      const btn=document.getElementById('btnAnalyzePhoto'); if(btn){ btn.disabled=false; }
    };
    reader.readAsDataURL(file);
  },
  async _analyzePhoto(dateStr){
    if(!this._photoBase64) return;
    const btn=document.getElementById('btnAnalyzePhoto');
    if(btn){ btn.disabled=true; btn.textContent='분석 중...'; }
    const key=localStorage.getItem('gl_ai_key');
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
      resultEl.innerHTML=`<div style="background:var(--card2);border-radius:10px;padding:10px">
        <p style="font-size:11px;color:var(--text2);margin-bottom:6px">총 ${parsed.total_cal||0}kcal 추정</p>
        ${parsed.foods.map(f=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px"><span>${esc(f.name)} ${esc(f.amount||'')}</span><span style="color:var(--text2)">${f.cal}kcal</span></div>`).join('')}
        ${parsed.comment?`<p style="font-size:11px;color:var(--accent-l);margin-top:6px">${esc(parsed.comment)}</p>`:''}
      </div>
      <button onclick="Diet._savePhotoFoods(${JSON.stringify(parsed.foods).replace(/"/g,'&quot;')},'${meal}','${dateStr}')" class="btn-sm accent" style="width:100%;padding:9px;margin-top:8px">✅ ${meal}에 추가</button>`;
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
    App.closeModal(); App.showToast(`📷 ${meal}에 ${foods.length}개 추가됨 ✓`,'success');
    this._photoBase64=null;
  },

  // ── 설정 ──────────────────────────────
  showSettings(){
    const s=this.getSettings();
    const rest=s.restDays||[0,6]; // 기본: 일,토
    const days=['일','월','화','수','목','금','토'];
    App.openModal('@gear 식단 목표 설정',`
      <div style="margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">📅 평일 기본 목표</div>
        <div class="modal-row"><label class="modal-lbl">칼로리 (kcal)</label>
          <input id="sCalG" type="number" value="${s.calorieGoal}" class="inp inp-sm" style="width:90px"></div>
        <div class="modal-grid2">
          <div><label class="modal-lbl">단백질 (g)</label><input id="sProtG" type="number" value="${s.proteinGoal}" class="inp inp-sm"></div>
          <div><label class="modal-lbl">탄수화물 (g)</label><input id="sCarbG" type="number" value="${s.carbGoal}" class="inp inp-sm"></div>
          <div><label class="modal-lbl">지방 (g)</label><input id="sFatG" type="number" value="${s.fatGoal}" class="inp inp-sm"></div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">🏖️ 휴일 목표</div>
        <div class="modal-row" style="flex-wrap:wrap;gap:5px"><label class="modal-lbl" style="width:100%">휴일 요일 선택</label>
          ${days.map((d,i)=>`<label style="cursor:pointer;padding:3px 8px;border:1px solid var(--border);border-radius:20px;font-size:12px;background:${rest.includes(i)?'var(--accent)':'var(--bg)'};color:${rest.includes(i)?'white':'var(--text2)'}">
            <input type="checkbox" value="${i}" ${rest.includes(i)?'checked':''} class="rest-day-chk" style="display:none"> ${d}</label>`).join('')}
        </div>
        <div class="modal-row" style="margin-top:8px"><label class="modal-lbl">칼로리 (kcal)</label>
          <input id="rCalG" type="number" value="${s.restCalGoal||s.calorieGoal}" class="inp inp-sm" style="width:90px"></div>
        <div class="modal-grid2">
          <div><label class="modal-lbl">단백질 (g)</label><input id="rProtG" type="number" value="${s.restProteinGoal||s.proteinGoal}" class="inp inp-sm"></div>
          <div><label class="modal-lbl">탄수화물 (g)</label><input id="rCarbG" type="number" value="${s.restCarbGoal||s.carbGoal}" class="inp inp-sm"></div>
          <div><label class="modal-lbl">지방 (g)</label><input id="rFatG" type="number" value="${s.restFatGoal||s.fatGoal}" class="inp inp-sm"></div>
        </div>
      </div>
      <div class="modal-btns">
        <button onclick="Diet.saveSettings()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    // 휴일 버튼 토글
    setTimeout(()=>{
      document.querySelectorAll('.rest-day-chk').forEach(cb=>{
        const lbl=cb.closest('label');
        cb.addEventListener('change',()=>{
          lbl.style.background=cb.checked?'var(--accent)':'var(--bg)';
          lbl.style.color=cb.checked?'white':'var(--text2)';
        });
      });
    },50);
  },
  saveSettings(){
    const restDays=[...document.querySelectorAll('.rest-day-chk:checked')].map(c=>parseInt(c.value));
    UserStore.set(this._setKey(),JSON.stringify({
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
    this.render(); App.closeModal(); App.showToast('저장됨 ✓','success');
  },
};
