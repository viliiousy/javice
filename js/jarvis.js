// js/jarvis.js — ⚡ JARVIS (Groq + 사진 분석 + 전체 액션)

const JARVIS = {
  history:     [],
  recognition: null,
  synthesis:   window.speechSynthesis,
  listening:   false,
  isOpen:      false,
  _proactiveShown: false,

  init() {
    this._injectHTML();
    this._initSpeech();
    this._setupListeners();
    setTimeout(()=>this._proactiveCheck(), 4000);
    setInterval(()=>this._proactiveCheck(), 30*60*1000);
  },

  _injectHTML() {
    const wrap=document.createElement('div');
    wrap.id='jarvisWrap';
    wrap.innerHTML=`
      <button id="jarvisBtn" class="jarvis-btn" onclick="JARVIS.toggle()" title="JARVIS">
        <span class="jarvis-btn-glyph">⚡</span>
        <span id="jarvisDot" class="jarvis-dot hidden"></span>
      </button>
      <div id="jarvisPanel" class="jarvis-panel hidden">
        <div class="jarvis-head">
          <div class="j-head-l">
            <span class="j-logo">⚡ JARVIS</span>
            <span id="jStatus" class="j-status">대기 중</span>
          </div>
          <div class="j-head-r">
            <button class="j-icon-btn" onclick="JARVIS.showKeySetup()" title="API 키">🔑</button>
            <button class="j-icon-btn" onclick="JARVIS.triggerPhoto()" title="사진으로 식단 기록">📷</button>
            <button id="jMicBtn" class="j-icon-btn" onclick="JARVIS.toggleMic()" title="음성 입력">🎤</button>
            <button class="j-icon-btn" onclick="JARVIS.toggle()">✕</button>
          </div>
        </div>
        <div id="jMsgs" class="j-msgs">
          <div class="j-msg j-ai">
            <div class="j-avatar">⚡</div>
            <div class="j-bubble">안녕하세요! JARVIS입니다.<br>
              <span style="font-size:11px;color:var(--accent-l)">💬 "치킨 먹었어" · "내일 10시 회의 잡아줘"<br>📷 사진 버튼으로 식단 자동 분석</span>
            </div>
          </div>
        </div>
        <input id="jPhotoInput" type="file" accept="image/*" capture="environment" style="display:none" onchange="JARVIS._onPhotoSelected(this)">
        <div class="j-input-wrap">
          <div id="jVoiceBar" class="j-voice-bar hidden"><span class="j-pulse"></span> 듣고 있습니다...</div>
          <div class="j-input-row">
            <input id="jInput" type="text" class="inp" placeholder="메시지 입력 또는 🎤 📷" style="flex:1">
            <button onclick="JARVIS.send()" class="btn-sm accent" style="flex-shrink:0">전송</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
  },

  _setupListeners() {
    setTimeout(()=>{
      const inp=document.getElementById('jInput');
      if(inp) inp.onkeypress=e=>{ if(e.key==='Enter') this.send(); };
    },200);
  },

  toggle() {
    this.isOpen=!this.isOpen;
    document.getElementById('jarvisPanel').classList.toggle('hidden',!this.isOpen);
    document.getElementById('jarvisDot').classList.add('hidden');
    if(this.isOpen) setTimeout(()=>document.getElementById('jInput')?.focus(),100);
  },

  // ── 📷 사진 분석 ─────────────────────
  triggerPhoto() {
    const key=this._getKey();
    if(!key){ this._addMsg('ai','🔑 API 키를 먼저 설정해주세요.'); this.showKeySetup(); return; }
    document.getElementById('jPhotoInput')?.click();
  },

  _onPhotoSelected(input) {
    const file=input.files[0]; if(!file) return;
    input.value='';
    const reader=new FileReader();
    reader.onload=e=>{
      const base64=e.target.result.split(',')[1];
      const mimeType=file.type||'image/jpeg';
      this._addMsg('user','📷 음식 사진 분석 요청');
      this._analyzeFood(base64, mimeType);
    };
    reader.readAsDataURL(file);
  },

  async _analyzeFood(base64, mimeType='image/jpeg') {
    const key=this._getKey(); if(!key) return;
    this._setStatus('사진 분석 중...');
    try {
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
        body:JSON.stringify({
          model:'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens:800,
          messages:[{role:'user',content:[
            {type:'image_url',image_url:{url:`data:${mimeType};base64,${base64}`}},
            {type:'text',text:`이 음식 사진을 분석해서 반드시 JSON만 출력해줘 (다른 텍스트 없이):
{"foods":[{"name":"음식명","amount":"양","cal":숫자,"protein":숫자,"carb":숫자,"fat":숫자}],"total_cal":숫자,"meal":"아침|점심|저녁|간식","comment":"한줄코멘트"}
한국 음식 기준으로 칼로리를 최대한 정확하게 추정해줘.`}
          ]}]
        }),
      });
      const data=await res.json();
      const text=data.choices?.[0]?.message?.content||'';
      let parsed;
      try{ const m=text.match(/\{[\s\S]*\}/); parsed=m?JSON.parse(m[0]):null; } catch{}

      if(!parsed||!parsed.foods){ this._addMsg('ai','음식을 인식하지 못했습니다. 다시 시도해주세요.'); return; }

      const meal=parsed.meal||'저녁';
      const foodList=parsed.foods.map(f=>`${f.name} (${f.amount||'?'}) - ${f.cal}kcal`).join('\n');
      this._addMsg('ai',`📊 분석 완료!\n${foodList}\n합계: ${parsed.total_cal}kcal\n${parsed.comment||''}\n\n${meal}에 추가할까요?`);

      // 자동으로 식단에 추가
      const d=Diet.getData();
      if(!d[meal]) d[meal]=[];
      parsed.foods.forEach(f=>d[meal].push({name:f.name+(f.amount?` (${f.amount})`:''),cal:f.cal||0,protein:f.protein||0,carb:f.carb||0,fat:f.fat||0}));
      Diet.saveData(d);
      Diet.render(App.S.selDate);
      App.showToast(`📷 ${meal}에 ${parsed.foods.length}개 추가됨 ✓`,'success');
    } catch(err){
      this._addMsg('ai',`분석 실패: ${err.message}`);
    }
    this._setStatus('대기 중');
  },

  // ── 텍스트 전송 ───────────────────────
  async send(text=null) {
    const inp=document.getElementById('jInput');
    const msg=(text||inp?.value||'').trim(); if(!msg) return;
    if(inp) inp.value='';
    this._addMsg('user',msg);
    this._setStatus('생각 중...');
    const key=this._getKey();
    if(!key){ this._addMsg('ai','⚠️ 🔑 버튼을 눌러 Groq API 키를 설정해주세요.\nconsole.groq.com 에서 무료 발급'); this._setStatus('대기 중'); return; }
    try {
      const raw=await this._callAPI(key,msg);
      this._handleReply(raw);
    } catch(err){ this._addMsg('ai',`오류: ${err.message}`); }
    this._setStatus('대기 중');
  },

  async _callAPI(apiKey, userMsg) {
    this.history.push({role:'user',content:userMsg});
    const msgs=this.history.slice(-12);
    const ctx=this._buildCtx();
    const sys=this._buildSys(ctx);
    const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
      body:JSON.stringify({model:'llama-3.1-8b-instant',max_tokens:1024,messages:[{role:'system',content:sys},...msgs]}),
    });
    if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`HTTP ${res.status}`); }
    const data=await res.json();
    const text=data.choices?.[0]?.message?.content||'';
    this.history.push({role:'assistant',content:text});
    return text;
  },

  _handleReply(raw) {
    let parsed={response:raw,actions:[],tips:[]};
    try{ const m=raw.match(/\{[\s\S]*\}/); if(m) parsed={response:'',actions:[],tips:[],...JSON.parse(m[0])}; } catch{}
    const reply=parsed.response||parsed.message||raw;
    if(reply){ this._addMsg('ai',reply); this._speak(reply); }
    if(Array.isArray(parsed.actions)) parsed.actions.forEach(a=>this._exec(a));
    if(Array.isArray(parsed.tips)&&parsed.tips.length) parsed.tips.forEach(t=>this._addMsg('tip',t));
  },

  // ── 액션 실행기 ───────────────────────
  async _exec(action) {
    try {
      switch(action.type) {

        case 'add_task': {
          if(!Auth.isLoggedIn()){ App.showToast('로그인 필요','error'); break; }
          const lid=App.S.lists[0]?.id; if(!lid) break;
          const t=await GoogleTasks.createTask(lid,action.title,action.due||null);
          t.starred=false;
          if(!App.S.tasks[lid]) App.S.tasks[lid]=[];
          App.S.tasks[lid].unshift(t);
          App._renderTasks();
          App.showToast(`✅ 할일: ${action.title}`,'success');
          break;
        }

        case 'delete_task': {
          if(!Auth.isLoggedIn()) break;
          const lid2=action.listId||App.S.lists[0]?.id; if(!lid2||!action.taskId) break;
          await GoogleTasks.deleteTask(lid2,action.taskId);
          App.S.tasks[lid2]=App.S.tasks[lid2]?.filter(t=>t.id!==action.taskId);
          App._renderTasks();
          App.showToast('🗑 할일 삭제됨','success');
          break;
        }

        case 'add_event': {
          if(!Auth.isLoggedIn()){ App.showToast('로그인 필요','error'); break; }
          const ev=await GoogleCalendar.createEvent(action.summary,action.start,action.end,action.description||'',action.location||'');
          App.S.events.push(ev);
          App.S.events.sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
          CalendarUI.render(document.getElementById('miniCal'),App.S.calDate,App.S.events,App.S.selDate);
          App._renderCalPanel();
          App.showToast(`📅 일정: ${action.summary}`,'success');
          break;
        }

        case 'delete_event': {
          if(!Auth.isLoggedIn()) break;
          const ev=App.S.events.find(e=>e.id===action.eventId||(e.summary&&e.summary.includes(action.title||'')));
          if(ev){ await GoogleCalendar.deleteEvent(ev.id,ev._calId||'primary'); App.S.events=App.S.events.filter(e=>e.id!==ev.id); App._renderCalPanel(); App.showToast('🗑 일정 삭제됨','success'); }
          break;
        }

        case 'add_checklist': {
          const items=Checklist.getItems();
          items.push({id:'cl_'+Date.now(),title:action.title,dueDate:action.dueDate||null,done:false,createdAt:new Date().toISOString()});
          Checklist.saveItems(items);
          Checklist.render();
          App.showToast(`✍️ 체크리스트: ${action.title}`,'success');
          break;
        }

        case 'delete_checklist': {
          const before=Checklist.getItems();
          const after=before.filter(i=>!i.title.includes(action.title||'__none__'));
          if(after.length<before.length){ Checklist.saveItems(after); Checklist.render(); App.showToast('🗑 체크리스트 삭제됨','success'); }
          break;
        }

        case 'log_food': {
          const d=Diet.getData();
          const meal=action.meal||'간식';
          if(!d[meal]) d[meal]=[];
          d[meal].push({name:action.name,cal:action.cal||0,protein:action.protein||0,carb:action.carb||0,fat:action.fat||0});
          Diet.saveData(d);
          Diet.render(App.S.selDate);
          App.showToast(`🥗 ${meal}: ${action.name}`,'success');
          break;
        }

        case 'delete_food': {
          const dd=Diet.getData();
          const meal=action.meal||'간식';
          if(dd[meal]){ dd[meal]=dd[meal].filter(f=>!f.name.includes(action.name||'__none__')); Diet.saveData(dd); Diet.render(App.S.selDate); App.showToast('🗑 식단 삭제됨','success'); }
          break;
        }

        case 'complete_habit': {
          const chk=Habits.getChecked();
          if(!chk.includes(action.habitId)){ chk.push(action.habitId); Habits.setChecked(chk); Habits.render(); const h=Habits.getList().find(x=>x.id===action.habitId); App.showToast(`✅ 습관: ${h?.name||''}`,'success'); }
          break;
        }

        case 'uncheck_habit': {
          const chk2=Habits.getChecked(); const ui=chk2.indexOf(action.habitId);
          if(ui!==-1){ chk2.splice(ui,1); Habits.setChecked(chk2); Habits.render(); App.showToast('↩ 습관 해제','success'); }
          break;
        }

        case 'complete_exercise': {
          const dow=new Date().getDay(); const plan=Fitness.PLAN[dow];
          const idx=plan?.exercises.findIndex(e=>e.name.includes(action.exercise)||action.exercise.includes(e.name));
          if(idx>=0){ Fitness.toggle(idx); App.showToast(`💪 완료: ${plan.exercises[idx].name}`,'success'); }
          break;
        }

        case 'uncheck_exercise': {
          const dow2=new Date().getDay(); const plan2=Fitness.PLAN[dow2];
          const idx2=plan2?.exercises.findIndex(e=>e.name.includes(action.exercise)||action.exercise.includes(e.name));
          if(idx2>=0){ const uc=Fitness._checked(); const ei=uc.indexOf(idx2); if(ei!==-1){ uc.splice(ei,1); Fitness._save(uc); Fitness.render(); App.showToast('↩ 운동 해제','success'); } }
          break;
        }
      }
    } catch(err){ console.error('[JARVIS action]',action.type,err); }
  },

  // ── 프로액티브 체크 ───────────────────
  async _proactiveCheck() {
    const key=this._getKey(); if(!key||this._proactiveShown) return;
    const now=new Date(), hour=now.getHours(), issues=[];
    if(hour>=17){ const plan=Fitness.PLAN[now.getDay()]; const chk=Fitness._checked(); if(plan.exercises.length>0&&chk.length===0) issues.push(`오늘 운동(${plan.name})을 아직 시작 안 했습니다.`); }
    if(hour>=15){ const t=Diet.totals(Diet.getData()); const g=Diet.getSettings(); if(t.cal<g.calorieGoal*0.35) issues.push(`칼로리 부족 (${t.cal}/${g.calorieGoal}kcal, ${Math.round(t.cal/g.calorieGoal*100)}%)`); }
    if(hour>=11){ const list=Habits.getList(); const chk=Habits.getChecked(); const miss=list.filter(h=>!chk.includes(h.id)); if(miss.length>=3) issues.push(`미완료 습관 ${miss.length}개: ${miss.map(h=>h.name).slice(0,3).join(', ')}`); }
    if(!issues.length) return;
    this._proactiveShown=true;
    const msg=`[분석] ${issues.join(' / ')} — 격려 메시지 1-2문장만`;
    try {
      const raw=await this._callAPI(key,msg);
      this._handleReply(raw);
      if(!this.isOpen) document.getElementById('jarvisDot')?.classList.remove('hidden');
    } catch{}
  },

  _buildCtx() {
    const now=new Date(), dow=now.getDay();
    const plan=Fitness.PLAN[dow], fitChk=Fitness._checked();
    const hList=Habits.getList(), hChk=Habits.getChecked();
    const dd=Diet.getData(), dt=Diet.totals(dd), ds=Diet.getSettings();
    const evToday=(App.S.events||[]).filter(e=>{ try{ return new Date(e.start?.dateTime||e.start?.date).toDateString()===now.toDateString(); }catch{return false;} });
    const pending=[]; Object.values(App.S.tasks||{}).forEach(l=>l.filter(t=>t.status==='needsAction').forEach(t=>pending.push({id:t.id,title:t.title,listId:t._lid})));
    const clItems=typeof Checklist!=='undefined'?Checklist.getItems().filter(i=>!i.done).slice(0,5):[];
    return {
      now:now.toLocaleString('ko-KR'), weekday:now.toLocaleDateString('ko-KR',{weekday:'long'}),
      habits:{ done:hList.filter(h=>hChk.includes(h.id)).map(h=>h.name), missing:hList.filter(h=>!hChk.includes(h.id)).map(h=>({id:h.id,name:h.name})) },
      fitness:{ plan:plan.name, exercises:plan.exercises.map((e,i)=>({name:e.name,sets:e.sets,done:fitChk.includes(i)})) },
      diet:{ cal:dt.cal,calGoal:ds.calorieGoal,protein:dt.protein,proteinGoal:ds.proteinGoal,carb:dt.carb,fat:dt.fat },
      schedule:{ today:evToday.map(e=>({title:e.summary,time:e.start?.dateTime?_fmtTime(new Date(e.start.dateTime)):'종일',id:e.id})), pending:pending.slice(0,8) },
      checklist:clItems.map(i=>({id:i.id,title:i.title,dueDate:i.dueDate})),
      habitIds:hList.reduce((o,h)=>{o[h.name]=h.id;return o;},{}),
    };
  },

  _buildSys(ctx) {
    return `당신은 JARVIS — 갓생 대시보드 AI 어시스턴트. 아이언맨의 JARVIS처럼 간결하고 분석적. 한국어로 대화. 사용자는 수훈님.

현재 상태: ${JSON.stringify(ctx)}

반드시 JSON만 출력:
{"response":"한국어 답변 2-3문장","actions":[],"tips":[]}

사용 가능한 actions (복수 실행 가능):
{"type":"add_task","title":"","due":"2026-05-22 or null"}
{"type":"delete_task","taskId":"id","listId":"id"}
{"type":"add_event","summary":"","start":"2026-05-22T14:00:00+09:00","end":"2026-05-22T15:00:00+09:00","location":"","description":""}
{"type":"delete_event","eventId":"id or null","title":"검색할 제목"}
{"type":"add_checklist","title":"","dueDate":"2026-05-22 or null"}
{"type":"delete_checklist","title":"포함된 단어"}
{"type":"log_food","meal":"아침|점심|저녁|간식","name":"","cal":0,"protein":0,"carb":0,"fat":0}
{"type":"delete_food","meal":"","name":"포함된 단어"}
{"type":"complete_habit","habitId":"h1"}
{"type":"uncheck_habit","habitId":"h1"}
{"type":"complete_exercise","exercise":"운동이름 일부"}
{"type":"uncheck_exercise","exercise":"운동이름 일부"}

식품 칼로리: 닭가슴살100g=165kcal/단31g, 달걀1개=77kcal/단6g, 흰쌀밥200g=260kcal/탄57g, 삼겹살100g=331kcal/지28g, 치킨1조각=213kcal/단18g, 김밥1줄=420kcal, 아메리카노=5kcal, 프로틴쉐이크=120kcal/단25g`;
  },

  // ── 음성 ──────────────────────────────
  _initSpeech() {
    const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent); if(isIOS) return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
    this.recognition=new SR();
    this.recognition.lang='ko-KR'; this.recognition.interimResults=false; this.recognition.maxAlternatives=1;
    this.recognition.onresult=e=>{ const text=e.results[0][0].transcript; this._setVoice(false); this.send(text); };
    this.recognition.onerror=()=>{ this.listening=false; this._setVoice(false); };
    this.recognition.onend=()=>{ this.listening=false; this._setVoice(false); };
  },

  toggleMic() {
    const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
    if(isIOS){ App.showToast('iOS는 키보드 🎤 버튼 이용',''); document.getElementById('jInput')?.focus(); return; }
    if(!this.recognition){ App.showToast('Chrome에서만 지원됩니다','error'); return; }
    if(this.listening) this.recognition.stop();
    else { try{ this.recognition.start(); this.listening=true; this._setVoice(true); } catch{ App.showToast('마이크 권한이 필요합니다','error'); } }
  },

  _speak(text) {
    if(!this.synthesis) return;
    this.synthesis.cancel();
    const clean=text.replace(/[*`#\[\]{}]/g,'').trim().slice(0,200);
    const u=new SpeechSynthesisUtterance(clean);
    u.lang='ko-KR'; u.rate=1.05; u.pitch=0.9;
    const ko=this.synthesis.getVoices().find(v=>v.lang==='ko-KR'||v.lang==='ko_KR');
    if(ko) u.voice=ko;
    this.synthesis.speak(u);
  },

  _addMsg(type,text) {
    const wrap=document.getElementById('jMsgs'); if(!wrap) return;
    const isAI=type!=='user';
    const d=document.createElement('div');
    d.className=`j-msg ${isAI?'j-ai':'j-user'}`;
    const clean=esc(text).replace(/\n/g,'<br>');
    d.innerHTML=isAI?`<div class="j-avatar">⚡</div><div class="j-bubble${type==='tip'?' j-tip':''}">${clean}</div>`
      :`<div class="j-bubble j-bubble-user">${clean}</div>`;
    wrap.appendChild(d);
    wrap.scrollTop=wrap.scrollHeight;
  },
  _setStatus(s){ const el=document.getElementById('jStatus'); if(el) el.textContent=s; },
  _setVoice(on){ document.getElementById('jVoiceBar')?.classList.toggle('hidden',!on); const btn=document.getElementById('jMicBtn'); if(btn) btn.style.color=on?'var(--red)':''; },
  _getKey(){ return localStorage.getItem('gl_ai_key')||''; },

  showKeySetup() {
    App.openModal('🔑 JARVIS API 키 설정',`
      <p style="color:var(--text2);font-size:13px;margin-bottom:14px">
        완전 무료 Groq API 키가 필요합니다.<br>
        <a href="https://console.groq.com" target="_blank" style="color:var(--accent-l)">console.groq.com</a> → API Keys → Create API Key
      </p>
      <div class="modal-row"><label class="modal-lbl">Groq API Key</label>
        <input id="aiKeyInp" type="password" placeholder="gsk_..." class="inp" value="${this._getKey()}"></div>
      <div class="modal-btns">
        <button onclick="JARVIS._saveKey()" class="btn-sm accent">저장 후 활성화</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('aiKeyInp')?.focus(),100);
  },

  _saveKey() {
    const k=document.getElementById('aiKeyInp')?.value.trim();
    if(!k){ App.showToast('API 키를 입력해주세요','error'); return; }
    localStorage.setItem('gl_ai_key',k);
    App.closeModal();
    App.showToast('✓ JARVIS 활성화됨','success');
    setTimeout(()=>{ this.isOpen=true; document.getElementById('jarvisPanel').classList.remove('hidden'); this.send('안녕! 오늘 대시보드 분석해줘.'); },400);
  },
};
