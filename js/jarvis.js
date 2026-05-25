// js/jarvis.js — ⚡ JARVIS (TTS 토글 + 스마트 리마인더 + 읽지 않은 알림)

const JARVIS = {
  history:[], recognition:null, synthesis:window.speechSynthesis,
  listening:false, isOpen:false,
  _unread:0,
  // 오늘 이미 보낸 리마인더 타입 추적 (중복 방지)
  _sentReminders: new Set(),
  _lastReminderDate: '',

  // TTS 상태 (localStorage 유지)
  get _ttsEnabled(){ return localStorage.getItem('gl_tts')==='true'; },
  set _ttsEnabled(v){ localStorage.setItem('gl_tts',v?'true':'false'); },

  init() {
    this._injectHTML();
    this._initSpeech();
    this._setupListeners();
    // 리마인더: 5분마다 체크 (단, 각 타입은 하루 1회만)
    setInterval(()=>this._checkReminders(),5*60*1000);
    setTimeout(()=>this._checkReminders(),8000);
  },

  _injectHTML() {
    const wrap=document.createElement('div'); wrap.id='jarvisWrap';
    wrap.innerHTML=`
      <button id="jarvisBtn" class="jarvis-btn" onclick="JARVIS.toggle()">
        <span class="jarvis-btn-glyph">⚡</span>
        <span id="jarvisBadge" class="jarvis-badge hidden">0</span>
      </button>
      <div id="jarvisPanel" class="jarvis-panel hidden">
        <div class="jarvis-head">
          <div class="j-head-l"><span class="j-logo">⚡ JARVIS</span><span id="jStatus" class="j-status">대기 중</span></div>
          <div class="j-head-r">
            <button class="j-icon-btn" id="jTtsBtn" onclick="JARVIS.toggleTTS()" title="음성 출력 켜기/끄기">${this._ttsEnabled?'🔊':'🔇'}</button>
            <button class="j-icon-btn" onclick="JARVIS.showKeySetup()">🔑</button>
            <button class="j-icon-btn" onclick="JARVIS.triggerPhoto()" title="사진 식단 분석">📷</button>
            <button id="jMicBtn" class="j-icon-btn" onclick="JARVIS.toggleMic()">🎤</button>
            <button class="j-icon-btn" onclick="JARVIS.toggle()">✕</button>
          </div>
        </div>
        <div id="jMsgs" class="j-msgs">
          <div class="j-msg j-ai"><div class="j-avatar">⚡</div>
            <div class="j-bubble">JARVIS입니다.<br>
              <span style="font-size:11px;color:var(--accent-l)">할일·일정·체크리스트·습관·식단·메모 관리 가능<br>📷 사진으로 식단 자동 분석</span>
            </div>
          </div>
        </div>
        <input id="jPhotoInput" type="file" accept="image/*" style="display:none" onchange="JARVIS._onPhotoSelected(this)">
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

  // ── 열기/닫기 ─────────────────────────
  toggle() {
    this.isOpen=!this.isOpen;
    document.getElementById('jarvisPanel').classList.toggle('hidden',!this.isOpen);
    if(this.isOpen) {
      // 읽지 않은 알림 초기화
      this._unread=0;
      this._updateBadge();
      setTimeout(()=>document.getElementById('jInput')?.focus(),100);
    }
  },

  // ── TTS 토글 ──────────────────────────
  toggleTTS() {
    this._ttsEnabled=!this._ttsEnabled;
    const btn=document.getElementById('jTtsBtn');
    if(btn) btn.textContent=this._ttsEnabled?'🔊':'🔇';
    if(!this._ttsEnabled && this.synthesis) this.synthesis.cancel();
    App.showToast(this._ttsEnabled?'🔊 음성 출력 켜짐':'🔇 음성 출력 꺼짐','');
  },

  // ── 읽지 않은 알림 배지 ───────────────
  _updateBadge() {
    const badge=document.getElementById('jarvisBadge');
    if(!badge) return;
    if(this._unread>0 && !this.isOpen){
      badge.textContent=this._unread>9?'9+':String(this._unread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  // ── 스마트 리마인더 ───────────────────
  _checkReminders() {
    const key=this._getKey(); if(!key) return;

    // 날짜가 바뀌면 리마인더 초기화
    const today=new Date().toDateString();
    if(this._lastReminderDate!==today){
      this._sentReminders.clear();
      this._lastReminderDate=today;
    }

    const now=new Date(), hour=now.getHours(), min=now.getMinutes();
    const reminders=[];

    // ── 식사 리마인더 ─────────────────────
    const dietData = (typeof Diet!=='undefined') ? Diet.getData() : {아침:[],점심:[],저녁:[],간식:[]};

    if(hour>=9 && hour<11 && !this._sentReminders.has('breakfast') && dietData['아침'].length===0){
      reminders.push({ id:'breakfast', msg:'🌅 아침 식사를 아직 기록하지 않으셨어요. 잊지 마세요!' });
    }
    if(hour>=13 && hour<15 && !this._sentReminders.has('lunch') && dietData['점심'].length===0){
      reminders.push({ id:'lunch', msg:'🌞 점심 식사를 아직 기록하지 않으셨어요.' });
    }
    if(hour>=19 && hour<21 && !this._sentReminders.has('dinner') && dietData['저녁'].length===0){
      reminders.push({ id:'dinner', msg:'🌙 저녁 식사를 아직 기록하지 않으셨어요.' });
    }

    // ── 오늘 마감 할일 리마인더 ──────────
    if(hour>=9 && !this._sentReminders.has('due_today')){
      const todayStr=Diet._localDateStr ? Diet._localDateStr() : new Date().toISOString().split('T')[0];
      const dueToday=[];
      Object.values(App.S.tasks||{}).forEach(list=>{
        list.filter(t=>t.status==='needsAction'&&t.due).forEach(t=>{
          const ds=t.due.split('T')[0];
          if(ds===todayStr) dueToday.push(t.title);
        });
      });
      if(dueToday.length>0){
        reminders.push({ id:'due_today', msg:`📋 오늘 마감 할일 ${dueToday.length}개 있습니다: ${dueToday.slice(0,2).join(', ')}${dueToday.length>2?` 외 ${dueToday.length-2}개`:''}` });
      }
    }

    // ── 기한 초과 할일 리마인더 ──────────
    if(hour>=10 && !this._sentReminders.has('overdue')){
      const overdue=[];
      Object.values(App.S.tasks||{}).forEach(list=>{
        list.filter(t=>t.status==='needsAction'&&t.due&&new Date(t.due)<now).forEach(t=>{
          overdue.push(t.title);
        });
      });
      if(overdue.length>0){
        reminders.push({ id:'overdue', msg:`⚠️ 기한 초과된 할일 ${overdue.length}개: ${overdue.slice(0,2).join(', ')}${overdue.length>2?` 외 ${overdue.length-2}개`:''}` });
      }
    }

    // ── 오늘 일정 시작 30분 전 리마인더 ──
    if(!this._sentReminders.has('upcoming_event')){
      const upcoming=(App.S.events||[]).filter(e=>{
        if(!e.start?.dateTime) return false;
        const evTime=new Date(e.start.dateTime);
        const diff=(evTime-now)/60000; // 분 단위
        return diff>0&&diff<=35&&evTime.toDateString()===today;
      });
      if(upcoming.length>0){
        const ev=upcoming[0];
        const evTime=new Date(ev.start.dateTime);
        const diff=Math.round((evTime-now)/60000);
        reminders.push({ id:'upcoming_event', msg:`📅 ${diff}분 후 일정: "${ev.summary}" (${evTime.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})})` });
      }
    }

    // 각 리마인더 처리 (사용자 응답 없이 단순 알림 메시지만)
    reminders.forEach(r=>{
      this._sentReminders.add(r.id);
      this._showReminder(r.msg);
    });
  },

  // 리마인더 메시지 표시 (AI 호출 없이 직접 메시지)
  _showReminder(msg) {
    this._addMsg('reminder', msg);
    // TTS가 켜져 있을 때만 음성 출력
    if(this._ttsEnabled) this._speak(msg);
  },

  // ── 📷 사진 분석 ─────────────────────
  triggerPhoto() {
    if(!this._getKey()){ this._addMsg('ai','🔑 API 키를 먼저 설정해주세요.'); this.showKeySetup(); return; }
    document.getElementById('jPhotoInput')?.click();
  },
  _onPhotoSelected(input) {
    const file=input.files[0]; if(!file) return; input.value='';
    const reader=new FileReader();
    reader.onload=e=>{ const b64=e.target.result.split(',')[1]; this._addMsg('user','📷 음식 사진 분석'); this._analyzeFood(b64,file.type||'image/jpeg'); };
    reader.readAsDataURL(file);
  },
  async _analyzeFood(base64,mimeType) {
    const key=this._getKey(); if(!key) return;
    this._setStatus('사진 분석 중...');
    try{
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
        body:JSON.stringify({ model:'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens:1000,
          messages:[{role:'user',content:[
            {type:'image_url',image_url:{url:`data:${mimeType};base64,${base64}`}},
            {type:'text',text:`음식 사진 분석 JSON만 출력:\n{"foods":[{"name":"","amount":"","cal":0,"protein":0,"carb":0,"fat":0}],"total_cal":0,"meal":"아침|점심|저녁|간식","comment":""}\n한국 음식 기준으로 정확하게 추정해줘.`}
          ]}]
        }),
      });
      const data=await res.json();
      const text=data.choices?.[0]?.message?.content||'';
      let parsed; try{ const m=text.match(/\{[\s\S]*\}/); parsed=m?JSON.parse(m[0]):null; }catch{}
      if(!parsed?.foods){ this._addMsg('ai','음식을 인식하지 못했습니다.'); return; }
      const meal=parsed.meal||'저녁';
      this._addMsg('ai',`✅ ${meal} 분석!\n${parsed.foods.map(f=>`${f.name}(${f.amount||'?'}) ${f.cal}kcal`).join(', ')}\n합계: ${parsed.total_cal}kcal`);
      const d=Diet.getData(); if(!d[meal])d[meal]=[];
      parsed.foods.forEach(f=>{ const food={name:f.name+(f.amount?`(${f.amount})`:''),cal:f.cal||0,protein:f.protein||0,carb:f.carb||0,fat:f.fat||0}; d[meal].push(food); Diet.addToHistory(food); });
      Diet.saveData(d); Diet.render();
      App.showToast(`📷 ${meal}에 ${parsed.foods.length}개 추가 ✓`,'success');
      App._updateStatsBanner();
    }catch(err){ this._addMsg('ai',`분석 실패: ${err.message}`); }
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
    if(!key){ this._addMsg('ai','⚠️ 🔑 버튼 → Groq API 키 설정\nconsole.groq.com 에서 무료 발급'); this._setStatus('대기 중'); return; }
    try{
      const raw=await this._callAPI(key,msg);
      this._handleReply(raw);
    }catch(err){ this._addMsg('ai',`오류: ${err.message}`); }
    this._setStatus('대기 중');
  },

  async _callAPI(apiKey, userMsg) {
    this.history.push({role:'user',content:userMsg});
    const msgs=this.history.slice(-12);
    const ctx=this._buildCtx(), sys=this._buildSys(ctx);
    const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
      body:JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:1200,messages:[{role:'system',content:sys},...msgs]}),
    });
    if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`HTTP ${res.status}`); }
    const data=await res.json();
    const text=data.choices?.[0]?.message?.content||'';
    this.history.push({role:'assistant',content:text});
    return text;
  },

  _handleReply(raw) {
    let parsed={response:raw,actions:[],tips:[]};
    try{ const m=raw.match(/\{[\s\S]*\}/); if(m) parsed={response:'',actions:[],tips:[],...JSON.parse(m[0])}; }catch{}
    const reply=parsed.response||parsed.message||raw;
    if(reply){
      this._addMsg('ai',reply);
      // TTS는 켜져 있을 때만
      if(this._ttsEnabled) this._speak(reply);
    }
    if(Array.isArray(parsed.actions)) parsed.actions.forEach(a=>this._exec(a));
    if(Array.isArray(parsed.tips)&&parsed.tips.length) parsed.tips.forEach(t=>this._addMsg('tip',t));
    setTimeout(()=>{ if(typeof App!=='undefined') App._updateStatsBanner(); },400);
  },

  // ── 액션 실행기 ───────────────────────
  async _exec(action) {
    try {
      switch(action.type) {
        case 'add_task': {
          if(!Auth.isLoggedIn()) break;
          const lid=action.listId||App.S.lists[0]?.id; if(!lid) break;
          const t=await GoogleTasks.createTask(lid,action.title,action.due||null,action.notes||'');
          t.starred=false;
          if(!App.S.tasks[lid]) App.S.tasks[lid]=[];
          App.S.tasks[lid].unshift(t);
          App._renderTasks();
          CalendarUI.render(document.getElementById('miniCal'),App.S.calDate,App.S.events,App.S.selDate);
          App.showToast(`✅ 할일: ${action.title}`,'success');
          break;
        }
        case 'edit_task': {
          if(!Auth.isLoggedIn()) break;
          const lid=action.listId||App.S.lists[0]?.id; if(!lid||!action.taskId) break;
          const updated=await GoogleTasks.updateTask(lid,action.taskId,{title:action.title,notes:action.notes,due:action.due});
          const t=App.S.tasks[lid]?.find(x=>x.id===action.taskId);
          if(t) Object.assign(t,{title:updated.title,notes:updated.notes||'',due:updated.due||null});
          App._renderTasks(); App.showToast(`✏️ 할일 수정됨`,'success'); break;
        }
        case 'delete_task': {
          if(!Auth.isLoggedIn()) break;
          let lid=action.listId, tid=action.taskId;
          if(!tid&&action.title){ for(const [lId,list] of Object.entries(App.S.tasks||{})){ const found=list.find(t=>t.title.includes(action.title)&&t.status==='needsAction'); if(found){tid=found.id;lid=lId;break;} } }
          if(!lid||!tid) break;
          await GoogleTasks.deleteTask(lid,tid);
          App.S.tasks[lid]=App.S.tasks[lid]?.filter(t=>t.id!==tid);
          App._renderTasks(); App.showToast(`🗑 할일 삭제됨`,'success'); break;
        }
        case 'add_event': {
          if(!Auth.isLoggedIn()) break;
          const ev=await GoogleCalendar.createEvent(action.summary,action.start,action.end,action.description||'',action.location||'');
          App.S.events.push(ev);
          App.S.events.sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
          CalendarUI.render(document.getElementById('miniCal'),App.S.calDate,App.S.events,App.S.selDate);
          App._renderCalPanel(); App.showToast(`📅 일정: ${action.summary}`,'success'); break;
        }
        case 'delete_event': {
          if(!Auth.isLoggedIn()) break;
          const ev=App.S.events.find(e=>e.id===action.eventId||(action.title&&e.summary?.includes(action.title)));
          if(ev){ await GoogleCalendar.deleteEvent(ev.id,ev._calId||'primary'); App.S.events=App.S.events.filter(e=>e.id!==ev.id); App._renderCalPanel(); App.showToast('🗑 일정 삭제됨','success'); } break;
        }
        case 'add_checklist': {
          const items=Checklist.getItems();
          items.push({id:'cl_'+Date.now(),title:action.title,dueDate:action.dueDate||null,done:false,createdAt:new Date().toISOString()});
          Checklist.saveItems(items); Checklist.render(); App.showToast(`✍️ 체크리스트: ${action.title}`,'success'); break;
        }
        case 'edit_checklist': {
          const items=Checklist.getItems();
          const it=items.find(i=>i.id===action.id||(action.searchTitle&&i.title.includes(action.searchTitle||action.title)));
          if(it){ if(action.newTitle) it.title=action.newTitle; if(action.dueDate!==undefined) it.dueDate=action.dueDate; Checklist.saveItems(items); Checklist.render(); App.showToast('✏️ 체크리스트 수정됨','success'); } break;
        }
        case 'delete_checklist': {
          const before=Checklist.getItems();
          const after=before.filter(i=>!(i.id===action.id||(action.title&&i.title.includes(action.title))));
          if(after.length<before.length){ Checklist.saveItems(after); Checklist.render(); App.showToast('🗑 체크리스트 삭제됨','success'); } break;
        }
        case 'toggle_checklist': {
          const items=Checklist.getItems();
          const it=items.find(i=>i.id===action.id||(action.title&&i.title.includes(action.title)));
          if(it){ it.done=action.done!==undefined?action.done:!it.done; Checklist.saveItems(items); Checklist.render(); } break;
        }
        case 'add_memo': {
          const items=Memo.getItems();
          items.unshift({id:'memo_'+Date.now(),title:action.title,content:action.content||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
          Memo.saveItems(items); Memo.render(); App.showToast(`📝 메모: ${action.title}`,'success'); break;
        }
        case 'edit_memo': {
          const items=Memo.getItems();
          const m=items.find(i=>i.id===action.id||(action.searchTitle&&i.title.includes(action.searchTitle)));
          if(m){ if(action.title) m.title=action.title; if(action.content!==undefined) m.content=action.content; m.updatedAt=new Date().toISOString(); Memo.saveItems(items); Memo.render(); App.showToast('✏️ 메모 수정됨','success'); } break;
        }
        case 'delete_memo': {
          const before=Memo.getItems();
          const after=before.filter(m=>!(m.id===action.id||(action.title&&m.title.includes(action.title))));
          if(after.length<before.length){ Memo.saveItems(after); Memo.render(); App.showToast('🗑 메모 삭제됨','success'); } break;
        }
        case 'log_food': {
          const _targetDate = action.date ? new Date(action.date+'T00:00:00') : new Date();
          const d=Diet.getData(_targetDate); const meal=action.meal||'간식';
          if(!d[meal])d[meal]=[];
          const food={name:action.name,cal:action.cal||0,protein:action.protein||0,carb:action.carb||0,fat:action.fat||0};
          d[meal].push(food); Diet.saveData(d, _targetDate); Diet.addToHistory(food); Diet.render(_targetDate);
          const _dl = action.date && action.date!==new Date().toISOString().split('T')[0] ? ` (${action.date})` : '';
          App.showToast(`🥗 ${meal}: ${action.name}${_dl}`,'success'); break;
        }
        case 'delete_food': {
          const dd=Diet.getData(); const meal=action.meal||'간식';
          if(dd[meal]){ dd[meal]=dd[meal].filter(f=>!f.name.includes(action.name||'__')); Diet.saveData(dd); Diet.render(); App.showToast('🗑 식단 삭제됨','success'); } break;
        }
        case 'complete_habit': {
          const chk=Habits.getChecked();
          if(!chk.includes(action.habitId)){ chk.push(action.habitId); Habits.setChecked(chk); Habits.render(); App.showToast(`✅ 습관 완료`,'success'); } break;
        }
        case 'uncheck_habit': {
          const chk2=Habits.getChecked(); const ui=chk2.indexOf(action.habitId);
          if(ui!==-1){ chk2.splice(ui,1); Habits.setChecked(chk2); Habits.render(); App.showToast('↩ 습관 해제','success'); } break;
        }
        case 'add_habit': {
          const list=Habits.getList();
          list.push({id:'h'+Date.now(),name:action.name,emoji:action.emoji||'✅',days:action.days||[0,1,2,3,4,5,6]});
          Habits.saveList(list); Habits.render(); App.showToast(`✅ 습관 추가: ${action.name}`,'success'); break;
        }
        case 'delete_habit': {
          const hl=Habits.getList();
          const after=hl.filter(h=>!(h.id===action.habitId||(action.name&&h.name.includes(action.name))));
          if(after.length<hl.length){ Habits.saveList(after); Habits.render(); App.showToast('🗑 습관 삭제됨','success'); } break;
        }
      }
    }catch(err){ console.error('[JARVIS action]',action.type,err); }
  },

  _buildCtx() {
    const now=new Date(),dow=now.getDay();
    const plan=Fitness.PLAN[dow],fitChk=Fitness._checked();
    const hList=Habits.getList(),hChk=Habits.getChecked();
    const dd=Diet.getData(),dt=Diet.totals(dd),ds=Diet.getSettings();
    const evToday=(App.S.events||[]).filter(e=>{ try{ return new Date(e.start?.dateTime||e.start?.date).toDateString()===now.toDateString(); }catch{return false;} });
    const pending=[];
    Object.entries(App.S.tasks||{}).forEach(([lid,list])=>list.filter(t=>t.status==='needsAction').forEach(t=>pending.push({id:t.id,title:t.title,listId:lid,due:t.due,starred:t.starred})));
    const clItems=typeof Checklist!=='undefined'?Checklist.getItems().map(i=>({id:i.id,title:i.title,dueDate:i.dueDate,done:i.done})):[];
    const memos=typeof Memo!=='undefined'?Memo.getItems().slice(0,5).map(m=>({id:m.id,title:m.title})):[];
    return {
      now:now.toLocaleString('ko-KR'), weekday:now.toLocaleDateString('ko-KR',{weekday:'long'}),
      habits:{ done:hList.filter(h=>hChk.includes(h.id)).map(h=>h.name), missing:hList.filter(h=>!hChk.includes(h.id)).map(h=>({id:h.id,name:h.name})) },
      fitness:{ plan:plan.name, exercises:plan.exercises.map((e,i)=>({name:e.name,done:fitChk.includes(i)})) },
      diet:{ cal:dt.cal,calGoal:ds.calorieGoal,protein:dt.protein,proteinGoal:ds.proteinGoal },
      schedule:{ today:evToday.map(e=>({id:e.id,title:e.summary,time:e.start?.dateTime?_fmtTime(new Date(e.start.dateTime)):'종일'})), pending:pending.slice(0,8) },
      checklist:clItems, memos,
      habitIds:hList.reduce((o,h)=>{o[h.name]=h.id;return o;},{}),
      taskLists:App.S.lists.map(l=>({id:l.id,title:l.title})),
    };
  },

  _buildSys(ctx) {
    return `당신은 JARVIS — 갓생 대시보드의 AI. 간결하고 한국어로 대화. 사용자: 수훈님.

현재 상태: ${JSON.stringify(ctx)}

반드시 JSON만 출력 (다른 텍스트 없이):
{"response":"한국어 답변 (2-3문장, 간결하게)","actions":[],"tips":[]}

사용 가능한 actions:
{"type":"add_task","title":"","due":"YYYY-MM-DD or null","notes":"","listId":""}
{"type":"edit_task","taskId":"","listId":"","title":"","notes":"","due":""}
{"type":"delete_task","taskId":"","listId":"","title":"검색어"}
{"type":"add_event","summary":"","start":"2026-05-22T14:00:00+09:00","end":"2026-05-22T15:00:00+09:00","location":"","description":""}
{"type":"delete_event","eventId":"","title":"검색어"}
{"type":"add_checklist","title":"","dueDate":"YYYY-MM-DD or null"}
{"type":"edit_checklist","id":"","searchTitle":"","newTitle":"","dueDate":""}
{"type":"delete_checklist","id":"","title":"검색어"}
{"type":"toggle_checklist","id":"","title":"","done":true}
{"type":"add_memo","title":"","content":""}
{"type":"edit_memo","id":"","searchTitle":"","title":"","content":""}
{"type":"delete_memo","id":"","title":"검색어"}
{"type":"log_food","meal":"아침|점심|저녁|간식","name":"","cal":0,"protein":0,"carb":0,"fat":0}
{"type":"delete_food","meal":"","name":"검색어"}
{"type":"complete_habit","habitId":""}
{"type":"uncheck_habit","habitId":""}
{"type":"add_habit","name":"","emoji":"","days":[0,1,2,3,4,5,6]}
{"type":"delete_habit","habitId":"","name":"검색어"}

식품: 닭가슴살100g=165kcal/단31g, 달걀=77kcal/단6g, 흰밥200g=260kcal/탄57g, 삼겹살100g=331kcal, 치킨조각=213kcal, 김밥=420kcal, 아메리카노=5kcal, 프로틴=120kcal/단25g`;
  },

  // ── 음성 ──────────────────────────────
  _initSpeech() {
    if(/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
    this.recognition=new SR(); this.recognition.lang='ko-KR'; this.recognition.interimResults=false;
    this.recognition.onresult=e=>{ this._setVoice(false); this.send(e.results[0][0].transcript); };
    this.recognition.onerror=()=>{ this.listening=false; this._setVoice(false); };
    this.recognition.onend=()=>{ this.listening=false; this._setVoice(false); };
  },
  toggleMic() {
    if(/iPad|iPhone|iPod/.test(navigator.userAgent)){ App.showToast('iOS: 키보드 🎤 버튼 사용',''); document.getElementById('jInput')?.focus(); return; }
    if(!this.recognition){ App.showToast('Chrome에서만 지원','error'); return; }
    if(this.listening) this.recognition.stop();
    else{ try{ this.recognition.start(); this.listening=true; this._setVoice(true); }catch{ App.showToast('마이크 권한 필요','error'); } }
  },
  _speak(text) {
    if(!this._ttsEnabled||!this.synthesis) return;
    this.synthesis.cancel();
    const clean=text.replace(/[*`#\[\]{}]/g,'').trim().slice(0,200);
    const u=new SpeechSynthesisUtterance(clean); u.lang='ko-KR'; u.rate=1.05; u.pitch=0.9;
    const ko=this.synthesis.getVoices().find(v=>v.lang==='ko-KR'||v.lang==='ko_KR');
    if(ko) u.voice=ko;
    this.synthesis.speak(u);
  },

  // ── UI 헬퍼 ───────────────────────────
  _addMsg(type, text) {
    const wrap=document.getElementById('jMsgs'); if(!wrap) return;
    const isAI=type!=='user';
    const d=document.createElement('div');
    d.className=`j-msg ${isAI?'j-ai':'j-user'}`;
    const clean=esc(text).replace(/\n/g,'<br>');
    const isReminder=type==='reminder';
    d.innerHTML=isAI
      ?`<div class="j-avatar">${isReminder?'🔔':'⚡'}</div><div class="j-bubble${type==='tip'?' j-tip':isReminder?' j-reminder':''}">${clean}</div>`
      :`<div class="j-bubble j-bubble-user">${clean}</div>`;
    wrap.appendChild(d);
    wrap.scrollTop=wrap.scrollHeight;

    // 패널 닫혀 있으면 읽지 않은 알림 증가
    if(!this.isOpen && isAI){
      this._unread++;
      this._updateBadge();
    }
  },
  _setStatus(s){ const el=document.getElementById('jStatus'); if(el) el.textContent=s; },
  _setVoice(on){ document.getElementById('jVoiceBar')?.classList.toggle('hidden',!on); const btn=document.getElementById('jMicBtn'); if(btn) btn.style.color=on?'var(--red)':''; },
  _getKey(){ return localStorage.getItem('gl_ai_key')||''; },

  showKeySetup() {
    App.openModal('🔑 JARVIS API 키',`
      <p style="color:var(--text2);font-size:13px;margin-bottom:14px">
        완전 무료 Groq API 키 필요<br>
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
    App.closeModal(); App.showToast('✓ JARVIS 활성화됨','success');
    setTimeout(()=>{ this.isOpen=true; document.getElementById('jarvisPanel').classList.remove('hidden'); this.send('안녕!'); },400);
  },
};
