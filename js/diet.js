// js/diet.js — 식단 기록 (날짜별 + 즐겨찾기 + 최근 10개 + 빈도)

const Diet = {
  MEALS:  ['아침','점심','저녁','간식'],
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
  getData(date=new Date()){
    return JSON.parse(UserStore.get(this._key(date))||JSON.stringify(
      {아침:[],점심:[],저녁:[],간식:[]}));
  },
  saveData(d,date=new Date()){ UserStore.set(this._key(date),JSON.stringify(d)); },

  // ── 즐겨찾기 ──────────────────────────
  getFavs(){ return JSON.parse(UserStore.get(this._favKey())||'[]'); },
  saveFavs(v){ UserStore.set(this._favKey(),JSON.stringify(v)); },
  toggleFav(name){
    const favs=this.getFavs();
    const idx=favs.indexOf(name);
    if(idx===-1) favs.push(name); else favs.splice(idx,1);
    this.saveFavs(favs);
  },
  isFav(name){ return this.getFavs().includes(name); },

  // ── 음식 히스토리 (최근 10개 + 빈도) ──
  getHistory(){ return JSON.parse(UserStore.get(this._histKey())||'[]'); },
  saveHistory(v){ UserStore.set(this._histKey(),JSON.stringify(v.slice(0,200))); },
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
              <button class="diet-fav-btn${this.isFav(item.name)?' is-fav':''}"
                onclick="Diet._clickFav('${item.name.replace(/'/g,'&#39;')}','${meal}','${ds}')" title="즐겨찾기">★</button>
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

  // ── 음식 추가 모달 ─────────────────────
  showAdd(meal,dateStr=null){
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

    App.openModal(`${this.EMOJIS[meal]} ${meal} 추가`,`
      ${quickHTML}
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">직접 입력</div>
      <div class="modal-row"><label class="modal-lbl">음식 이름 *</label>
        <input id="fName" type="text" placeholder="예: 닭가슴살 100g" class="inp"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">칼로리 (kcal)</label><input id="fCal" type="number" min="0" placeholder="0" class="inp inp-sm"></div>
        <div><label class="modal-lbl">단백질 (g)</label><input id="fProt" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
        <div><label class="modal-lbl">탄수화물 (g)</label><input id="fCarb" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
        <div><label class="modal-lbl">지방 (g)</label><input id="fFat" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
      </div>
      <div class="modal-btns">
        <button onclick="Diet.saveFood('${meal}','${ds}')" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('fName')?.focus(),50);
  },

  _quickAdd(name,meal,dateStr){
    const h=this.getHistory();
    const food=h.find(f=>f.name===name);
    if(!food) return;
    const date=new Date(dateStr+'T00:00:00');
    const data=this.getData(date);
    data[meal].push({name:food.name,cal:food.cal||0,protein:food.protein||0,carb:food.carb||0,fat:food.fat||0});
    this.saveData(data,date);
    this.addToHistory(food);
    this.render(date);
    App.closeModal();
    App.showToast(`${name} 추가됨 ✓`,'success');
  },

  saveFood(meal,dateStr=null){
    const name=document.getElementById('fName').value.trim();
    if(!name){ App.showToast('음식 이름을 입력해주세요','error'); return; }
    const food={
      name,
      cal:    parseInt(document.getElementById('fCal').value)||0,
      protein:parseFloat(document.getElementById('fProt').value)||0,
      carb:   parseFloat(document.getElementById('fCarb').value)||0,
      fat:    parseFloat(document.getElementById('fFat').value)||0,
    };
    const date=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const data=this.getData(date);
    data[meal].push(food);
    this.saveData(data,date);
    this.addToHistory(food);
    this.render(date);
    App.closeModal();
    App.showToast(`${name} 추가됨 ✓`,'success');
  },

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
    App.openModal('📷 음식 사진 AI 분석',`
      <p style="color:var(--text2);font-size:13px;margin-bottom:10px">사진을 업로드하면 AI가 자동 분석합니다.</p>
      <div style="margin-bottom:10px"><label class="modal-lbl">식사 구분</label>
        <select id="photoMeal" class="inp inp-sm">
          ${this.MEALS.map(m=>`<option value="${m}">${this.EMOJIS[m]} ${m}</option>`).join('')}
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
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
        body:JSON.stringify({ model:'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens:1000,
          messages:[{role:'user',content:[
            {type:'image_url',image_url:{url:`data:image/jpeg;base64,${this._photoBase64}`}},
            {type:'text',text:`이 사진에 있는 음식을 분석해서 아래 JSON 형식으로만 출력해줘. 다른 텍스트 없이 JSON만.
{"foods":[{"name":"음식명","amount":"양(예:100g,1개)","cal":칼로리숫자,"protein":단백질g,"carb":탄수화물g,"fat":지방g}],"total_cal":총칼로리,"meal":"아침|점심|저녁|간식","comment":"한줄코멘트"}
한국 음식 기준으로 칼로리를 최대한 정확하게 추정해줘. 음식이 없으면 foods를 빈 배열로 반환해줘.`}
          ]}]
        }),
      });
      const data=await res.json();
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
    App.openModal('⚙️ 식단 목표 설정',`
      <div class="modal-row"><label class="modal-lbl">칼로리 목표 (kcal)</label><input id="sCalG" type="number" value="${s.calorieGoal}" class="inp"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">단백질 (g)</label><input id="sProtG" type="number" value="${s.proteinGoal}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">탄수화물 (g)</label><input id="sCarbG" type="number" value="${s.carbGoal}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">지방 (g)</label><input id="sFatG" type="number" value="${s.fatGoal}" class="inp inp-sm"></div>
      </div>
      <div class="modal-btns">
        <button onclick="Diet.saveSettings()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },
  saveSettings(){
    UserStore.set(this._setKey(),JSON.stringify({
      calorieGoal:parseInt(document.getElementById('sCalG').value)||2200,
      proteinGoal:parseInt(document.getElementById('sProtG').value)||160,
      carbGoal:   parseInt(document.getElementById('sCarbG').value)||220,
      fatGoal:    parseInt(document.getElementById('sFatG').value)||60,
    }));
    this.render(); App.closeModal(); App.showToast('저장됨 ✓','success');
  },
};
