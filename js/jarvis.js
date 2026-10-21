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
        <span class="jarvis-btn-glyph">${typeof Icons!=="undefined"?Icons.svg("sparkle"):"AI"}</span>
        <span id="jarvisBadge" class="jarvis-badge hidden">0</span>
      </button>
      <div id="jarvisScrim" class="j-scrim hidden" onclick="JARVIS.close()"></div>
      <div id="jarvisPanel" class="jarvis-panel hidden">
        <div class="j-grab" aria-hidden="true"></div>
        <div class="jarvis-head">
          <div class="j-head-l"><span class="j-logo">AI 비서</span><span class="j-sub"><span id="jProv" class="j-prov"></span><span id="jStatus" class="j-status">대기 중</span></span></div>
          <div class="j-head-r">
            <button class="j-icon-btn" id="jTtsBtn" onclick="JARVIS.toggleTTS()" title="답을 소리로 듣기" aria-label="답을 소리로 듣기">${Icons.svg(this._ttsEnabled?'volume':'mute')}</button>
            <button class="j-icon-btn" onclick="JARVIS.showKeySetup()" title="AI 키 설정" aria-label="AI 키 설정">${Icons.svg('key')}</button>
            <button class="j-icon-btn" onclick="JARVIS.toggle()" title="닫기" aria-label="닫기">${Icons.svg('close')}</button>
          </div>
        </div>
        <div id="jMsgs" class="j-msgs">
          <div class="j-msg j-ai"><div class="j-avatar">B</div>
            <div class="j-bubble">AI 비서입니다. 말하거나 입력하면 기록해 드려요.<br>
              <span style="font-size:11px;color:var(--accent-l)">할일·일정·체크리스트·습관·식단·메모 관리 가능<br>사진으로 식단 자동 분석</span>
            </div>
          </div>
        </div>
        <div class="j-chips">
          <button type="button" class="j-chip" onclick="JARVIS.quick('오늘 할일 알려줘')">오늘 할일</button>
          <button type="button" class="j-chip" onclick="JARVIS.quick('물 한 잔 마셨어')">물 마셨어</button>
          <button type="button" class="j-chip" onclick="JARVIS.quick('오늘 먹은 거 정리해줘')">오늘 식단</button>
          <button type="button" class="j-chip" onclick="JARVIS.fill('메모해 줘: ')">메모해 줘</button>
        </div>
        <input id="jPhotoInput" type="file" accept="image/*" style="display:none" onchange="JARVIS._onPhotoSelected(this)">
        <div class="j-input-wrap">
          <div id="jVoiceBar" class="j-voice-bar hidden"><span class="j-pulse"></span><span id="jVoiceTxt">듣고 있습니다…</span></div>
          <div class="j-input-row">
            <button class="j-in-btn" onclick="JARVIS.triggerPhoto()" title="사진으로 식단 기록" aria-label="사진으로 식단 기록">${Icons.svg('camera')}</button>
            <input id="jInput" type="text" class="inp j-inp" placeholder="무엇이든 말하거나 입력하세요" enterkeyhint="send" autocomplete="off"
              oninput="JARVIS._syncSend()">
            <button id="jMicBtn" class="j-in-btn j-act" onclick="JARVIS._act()" title="음성으로 말하기" aria-label="음성으로 말하기">${Icons.svg('mic')}</button>
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
  // 다른 탭(일정·건강·경제)을 누르거나 바깥을 누르면 창이 내려간다
  close() { if (this.isOpen) this.toggle(); },
  quick(t) { const i=document.getElementById('jInput'); if(!i) return; i.value=t; this._syncSend?.(); this.send(); },
  fill(t)  { const i=document.getElementById('jInput'); if(!i) return; i.value=t; this._syncSend?.(); i.focus(); },

  toggle() {
    this.isOpen=!this.isOpen;
    document.getElementById('jarvisPanel').classList.toggle('hidden',!this.isOpen);
    document.getElementById('jarvisScrim')?.classList.toggle('hidden',!this.isOpen);
    document.querySelector('#tabbar .tab-jarvis')?.classList.toggle('on', this.isOpen);
    if(this.isOpen) {
      try { const hg=document.querySelector('.header-sticky-group'); if(hg) document.documentElement.style.setProperty('--v2-head', Math.round(hg.getBoundingClientRect().bottom)+'px'); } catch(e){}
      try { const P=this.PROVIDERS?.[this._active?.()]; const el=document.getElementById('jProv'); if(el) el.textContent=P?(P.short||P.name)+' · ':''; } catch(e){}
      // 읽지 않은 알림 초기화
      this._unread=0;
      this._updateBadge();
      // 폰에서는 입력칸에 자동 포커스하지 않는다. 키보드가 올라오면서 화면이 맨 아래로 밀려
      // 창 머리와 첫 메시지가 가려졌다. 대화는 맨 위부터 보여 준다.
      const msgs=document.getElementById('jMsgs')||document.querySelector('.j-msgs');
      if(matchMedia('(pointer:coarse)').matches){ if(msgs) msgs.scrollTop=0; }
      else setTimeout(()=>document.getElementById('jInput')?.focus(),100);
    }
  },

  // ── TTS 토글 ──────────────────────────
  toggleTTS() {
    this._ttsEnabled=!this._ttsEnabled;
    const btn=document.getElementById('jTtsBtn');
    if(btn) btn.innerHTML=Icons.svg(this._ttsEnabled?'volume':'mute');
    if(!this._ttsEnabled) this._stopSpeak();
    App.showToast(this._ttsEnabled?'답을 소리로 읽어 드립니다':'소리 읽기 꺼짐','');
  },

  // ── 읽지 않은 알림 배지 ───────────────
  // 배지가 붙을 자리가 둘이다 — 넓은 화면의 떠 있는 단추, 좁은 화면의 하단 탭.
  // 한쪽만 갱신하면 폰에서는 읽지 않은 알림이 있어도 아무 표시가 없다.
  _updateBadge() {
    const on = this._unread > 0 && !this.isOpen;
    const txt = this._unread > 9 ? '9+' : String(this._unread);
    ['jarvisBadge','tabJarvisBadge'].forEach(id => {
      const b = document.getElementById(id);
      if (!b) return;
      if (on) { b.textContent = txt; b.classList.remove('hidden'); }
      else b.classList.add('hidden');
    });
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
      reminders.push({ id:'breakfast', msg:'아침 식사를 아직 기록하지 않으셨어요. 잊지 마세요!' });
    }
    if(hour>=13 && hour<15 && !this._sentReminders.has('lunch') && dietData['점심'].length===0){
      reminders.push({ id:'lunch', msg:'점심 식사를 아직 기록하지 않으셨어요.' });
    }
    if(hour>=19 && hour<21 && !this._sentReminders.has('dinner') && dietData['저녁'].length===0){
      reminders.push({ id:'dinner', msg:'저녁 식사를 아직 기록하지 않으셨어요.' });
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
        reminders.push({ id:'due_today', msg:`오늘 마감 할일 ${dueToday.length}개 있습니다: ${dueToday.slice(0,2).join(', ')}${dueToday.length>2?` 외 ${dueToday.length-2}개`:''}` });
      }
    }

    // ── 기한 초과 할일 리마인더 ──────────
    if(hour>=10 && !this._sentReminders.has('overdue')){
      const overdue=[];
      Object.values(App.S.tasks||{}).forEach(list=>{
        list.filter(t=>t.status==='needsAction'&&t.due&&new Date(String(t.due).slice(0,10)+'T23:59:59')<now).forEach(t=>{
          overdue.push(t.title);
        });
      });
      if(overdue.length>0){
        reminders.push({ id:'overdue', msg:`기한 초과된 할일 ${overdue.length}개: ${overdue.slice(0,2).join(', ')}${overdue.length>2?` 외 ${overdue.length-2}개`:''}` });
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
        reminders.push({ id:'upcoming_event', msg:`${diff}분 후 일정: "${ev.summary}" (${evTime.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})})` });
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
    if(!this._getKey()){ this._addMsg('ai','API 키를 먼저 설정해주세요.'); this.showKeySetup(); return; }
    document.getElementById('jPhotoInput')?.click();
  },
  _onPhotoSelected(input) {
    const file=input.files[0]; if(!file) return; input.value='';
    const reader=new FileReader();
    reader.onload=e=>{ const b64=e.target.result.split(',')[1]; this._addMsg('user','음식 사진 분석'); this._analyzeFood(b64,file.type||'image/jpeg'); };
    reader.readAsDataURL(file);
  },
  async _analyzeFood(base64,mimeType) {
    const key=this._getKey(); if(!key) return;
    this._setStatus('사진 분석 중...');
    try{
      const data=await this.chat({ max_tokens:1000,
        messages:[{role:'user',content:[
          {type:'image_url',image_url:{url:`data:${mimeType};base64,${base64}`}},
          {type:'text',text:`음식 사진 분석 JSON만 출력:\n{"foods":[{"name":"","amount":"","cal":0,"protein":0,"carb":0,"fat":0}],"total_cal":0,"meal":"아침|점심|저녁|간식","comment":""}\n한국 음식 기준으로 정확하게 추정해줘.`}
        ]}] }, 'vision');
      const text=data.choices?.[0]?.message?.content||'';
      let parsed; try{ const m=text.match(/\{[\s\S]*\}/); parsed=m?JSON.parse(m[0]):null; }catch{}
      if(!parsed?.foods){ this._addMsg('ai','음식을 인식하지 못했습니다.'); return; }
      const meal=parsed.meal||'저녁';
      this._addMsg('ai',`${meal} 분석\n${parsed.foods.map(f=>`${f.name}(${f.amount||'?'}) ${f.cal}kcal`).join(', ')}\n합계: ${parsed.total_cal}kcal`);
      const d=Diet.getData(); if(!d[meal])d[meal]=[];
      parsed.foods.forEach(f=>{ const food={name:f.name+(f.amount?`(${f.amount})`:''),cal:f.cal||0,protein:f.protein||0,carb:f.carb||0,fat:f.fat||0}; d[meal].push(food); Diet.addToHistory(food); });
      Diet.saveData(d); Diet.render();
      App.showToast(`${meal}에 ${parsed.foods.length}개 추가`,'success');
      App._updateStatsBanner();
    }catch(err){ this._addMsg('ai',`분석 실패: ${err.message}`); }
    this._setStatus('대기 중');
  },

  // ── 텍스트 전송 ───────────────────────
  async send(text=null) {
    const inp=document.getElementById('jInput');
    const msg=(text||inp?.value||'').trim(); if(!msg) return;
    if(inp) inp.value='';
    this._syncSend();
    this._addMsg('user',msg);
    this._setStatus('생각 중...');
    const key=this._getKey();
    if(!key){ this._noKey(msg); this._setStatus('대기 중'); return; }
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
    const data=await this.chat({ max_tokens:1200, messages:[{role:'system',content:sys},...msgs] });
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
          App.showToast(`할일: ${action.title}`,'success');
          break;
        }
        case 'edit_task': {
          if(!Auth.isLoggedIn()) break;
          const lid=action.listId||App.S.lists[0]?.id; if(!lid||!action.taskId) break;
          const updated=await GoogleTasks.updateTask(lid,action.taskId,{title:action.title,notes:action.notes,due:action.due});
          const t=App.S.tasks[lid]?.find(x=>x.id===action.taskId);
          if(t) Object.assign(t,{title:updated.title,notes:updated.notes||'',due:updated.due||null});
          App._renderTasks(); App.showToast(`할일 수정됨`,'success'); break;
        }
        case 'delete_task': {
          if(!Auth.isLoggedIn()) break;
          let lid=action.listId, tid=action.taskId;
          if(!tid&&action.title){ for(const [lId,list] of Object.entries(App.S.tasks||{})){ const found=list.find(t=>t.title.includes(action.title)&&t.status==='needsAction'); if(found){tid=found.id;lid=lId;break;} } }
          if(!lid||!tid) break;
          await GoogleTasks.deleteTask(lid,tid);
          App.S.tasks[lid]=App.S.tasks[lid]?.filter(t=>t.id!==tid);
          App._renderTasks(); App.showToast(`할일 삭제됨`,'success'); break;
        }
        case 'add_event': {
          if(!Auth.isLoggedIn()) break;
          const ev=await GoogleCalendar.createEvent(action.summary,action.start,action.end,action.description||'',action.location||'');
          App.S.events.push(ev);
          App.S.events.sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
          CalendarUI.render(document.getElementById('miniCal'),App.S.calDate,App.S.events,App.S.selDate);
          App._renderCalPanel(); App.showToast(`일정: ${action.summary}`,'success'); break;
        }
        case 'delete_event': {
          if(!Auth.isLoggedIn()) break;
          const ev=App.S.events.find(e=>e.id===action.eventId||(action.title&&e.summary?.includes(action.title)));
          if(ev){ await GoogleCalendar.deleteEvent(ev.id,ev._calId||'primary'); App.S.events=App.S.events.filter(e=>e.id!==ev.id); App._renderCalPanel(); App.showToast('일정 삭제됨','success'); } break;
        }
        case 'add_checklist': {
          const items=Checklist.getItems();
          items.push({id:'cl_'+Date.now(),title:action.title,dueDate:action.dueDate||null,done:false,createdAt:new Date().toISOString()});
          Checklist.saveItems(items); Checklist.render(); App.showToast(`체크리스트: ${action.title}`,'success'); break;
        }
        case 'edit_checklist': {
          const items=Checklist.getItems();
          const it=items.find(i=>i.id===action.id||(action.searchTitle&&i.title.includes(action.searchTitle||action.title)));
          if(it){ if(action.newTitle) it.title=action.newTitle; if(action.dueDate!==undefined) it.dueDate=action.dueDate; Checklist.saveItems(items); Checklist.render(); App.showToast('체크리스트 수정됨','success'); } break;
        }
        case 'delete_checklist': {
          const before=Checklist.getItems();
          const after=before.filter(i=>!(i.id===action.id||(action.title&&i.title.includes(action.title))));
          if(after.length<before.length){ Checklist.saveItems(after); Checklist.render(); App.showToast('체크리스트 삭제됨','success'); } break;
        }
        case 'toggle_checklist': {
          const items=Checklist.getItems();
          const it=items.find(i=>i.id===action.id||(action.title&&i.title.includes(action.title)));
          if(it){ it.done=action.done!==undefined?action.done:!it.done; Checklist.saveItems(items); Checklist.render(); } break;
        }
        case 'add_memo': {
          const items=Memo.getItems();
          items.unshift({id:'memo_'+Date.now(),title:action.title,content:action.content||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
          Memo.saveItems(items); Memo.render(); App.showToast(`메모: ${action.title}`,'success'); break;
        }
        case 'edit_memo': {
          const items=Memo.getItems();
          const m=items.find(i=>i.id===action.id||(action.searchTitle&&i.title.includes(action.searchTitle)));
          if(m){ if(action.title) m.title=action.title; if(action.content!==undefined) m.content=action.content; m.updatedAt=new Date().toISOString(); Memo.saveItems(items); Memo.render(); App.showToast('메모 수정됨','success'); } break;
        }
        case 'delete_memo': {
          const before=Memo.getItems();
          const after=before.filter(m=>!(m.id===action.id||(action.title&&m.title.includes(action.title))));
          if(after.length<before.length){ Memo.saveItems(after); Memo.render(); App.showToast('메모 삭제됨','success'); } break;
        }
        case 'log_food': {
          const _targetDate = action.date ? new Date(action.date+'T00:00:00') : new Date();
          const d=Diet.getData(_targetDate); const meal=action.meal||'간식';
          if(!d[meal])d[meal]=[];
          const food={name:action.name,cal:action.cal||0,protein:action.protein||0,carb:action.carb||0,fat:action.fat||0};
          d[meal].push(food); Diet.saveData(d, _targetDate); Diet.addToHistory(food); Diet.render(_targetDate);
          const _dl = action.date && action.date!==new Date().toISOString().split('T')[0] ? ` (${action.date})` : '';
          App.showToast(`${meal}: ${action.name}${_dl}`,'success'); break;
        }
        case 'delete_food': {
          const dd=Diet.getData(); const meal=action.meal||'간식';
          if(dd[meal]){ dd[meal]=dd[meal].filter(f=>!f.name.includes(action.name||'__')); Diet.saveData(dd); Diet.render(); App.showToast('식단 삭제됨','success'); } break;
        }
        case 'complete_habit': {
          const chk=Habits.getChecked();
          if(!chk.includes(action.habitId)){ chk.push(action.habitId); Habits.setChecked(chk); Habits.render(); App.showToast(`습관 완료`,'success'); } break;
        }
        case 'uncheck_habit': {
          const chk2=Habits.getChecked(); const ui=chk2.indexOf(action.habitId);
          if(ui!==-1){ chk2.splice(ui,1); Habits.setChecked(chk2); Habits.render(); App.showToast('↩ 습관 해제','success'); } break;
        }
        case 'add_habit': {
          const list=Habits.getList();
          list.push({id:'h'+Date.now(),name:action.name,emoji:action.emoji||'✅',days:action.days||[0,1,2,3,4,5,6]});
          Habits.saveList(list); Habits.render(); App.showToast(`습관 추가: ${action.name}`,'success'); break;
        }
        case 'delete_habit': {
          const hl=Habits.getList();
          const after=hl.filter(h=>!(h.id===action.habitId||(action.name&&h.name.includes(action.name))));
          if(after.length<hl.length){ Habits.saveList(after); Habits.render(); App.showToast('습관 삭제됨','success'); } break;
        }
      }
    }catch(err){ console.error('[JARVIS action]',action.type,err); }
  },

  _buildCtx() {
    const now=new Date(),dow=now.getDay();
    const plan=Fitness.planFor(dow),fitChk=Fitness._checked();
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
    return `당신은 Bashy — 자기관리 앱 Bashy 의 AI 비서. 간결하고 한국어로 대화. 사용자: 수훈님.

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
  // 앱(iOS)에서는 기기 음성 인식·읽기(네이티브 플러그인)를 쓰고, 웹에서는 브라우저 기능을 쓴다.
  // 입력칸 오른쪽 단추 하나가 상황에 따라 바뀐다: 비어 있으면 마이크, 글자가 있으면 보내기, 듣는 중이면 정지.
  get _nSR(){ return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.SpeechRecognition : null; },
  get _nTTS(){ return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.TextToSpeech : null; },
  _initSpeech() {
    if(this._nSR){
      this._nSR.addListener('partialResults', e=>{
        const t=(e.accumulatedText||e.matches?.[0]||'').trim();
        if(!t) return;
        const inp=document.getElementById('jInput'); if(inp) inp.value=t;
        const vt=document.getElementById('jVoiceTxt'); if(vt) vt.textContent=t;
      }).catch(()=>{});
      this._nSR.addListener('listeningState', e=>{
        const st=e.state||e.status;
        if(st==='stopped' && this.listening) this._voiceDone();
      }).catch(()=>{});
      return;
    }
    if(/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
    this.recognition=new SR(); this.recognition.lang='ko-KR'; this.recognition.interimResults=true;
    this.recognition.onresult=e=>{
      const t=[...e.results].map(r=>r[0].transcript).join('');
      const inp=document.getElementById('jInput'); if(inp) inp.value=t;
      const vt=document.getElementById('jVoiceTxt'); if(vt) vt.textContent=t;
    };
    this.recognition.onerror=()=>{ this.listening=false; this._setVoice(false); };
    this.recognition.onend=()=>{ if(this.listening) this._voiceDone(); };
  },
  // 오른쪽 단추: 듣는 중 → 멈추고 보내기 / 글자 있음 → 보내기 / 비어 있음 → 듣기
  _act() {
    try { Haptic.medium(); } catch(e){}
    if(this.listening) return this._stopListen();
    const v=document.getElementById('jInput')?.value.trim();
    if(v) return this.send();
    this.toggleMic();
  },
  _syncSend() {
    const btn=document.getElementById('jMicBtn'); if(!btn) return;
    const has=!!document.getElementById('jInput')?.value.trim();
    const mode=this.listening?'stop':has?'send':'mic';
    if(btn.dataset.mode===mode) return;
    btn.dataset.mode=mode;
    btn.innerHTML=Icons.svg(mode);
    btn.classList.toggle('on', mode!=='mic');
    btn.ariaLabel=btn.title=mode==='send'?'보내기':mode==='stop'?'말하기 끝내기':'음성으로 말하기';
  },
  async toggleMic() {
    if(this.listening) return this._stopListen();
    this._stopSpeak();
    const inp=document.getElementById('jInput'); if(inp) inp.value='';
    if(this._nSR){
      try{
        const p=await this._nSR.requestPermissions();
        if(p.speechRecognition!=='granted'){ App.showToast('설정 → Bashy 에서 마이크·음성 인식을 허용해 주세요','error'); return; }
        this.listening=true; this._setVoice(true);
        await this._nSR.start({ language:'ko-KR', partialResults:true, popup:false, addPunctuation:false });
      }catch(e){ this.listening=false; this._setVoice(false); App.showToast('음성 인식을 시작하지 못했습니다','error'); }
      return;
    }
    if(!this.recognition){ App.showToast(/iPad|iPhone|iPod/.test(navigator.userAgent)?'키보드의 마이크 단추로 말해 주세요':'이 브라우저는 음성 인식을 지원하지 않습니다',''); inp?.focus(); return; }
    try{ this.recognition.start(); this.listening=true; this._setVoice(true); }catch{ App.showToast('마이크 권한이 필요합니다','error'); }
  },
  _stopListen() {
    if(this._nSR){ this._nSR.stop().catch(()=>{}); setTimeout(()=>{ if(this.listening) this._voiceDone(); },700); }
    else this.recognition?.stop();
  },
  _voiceDone() {
    this.listening=false; this._setVoice(false);
    const v=document.getElementById('jInput')?.value.trim();
    if(v) this.send(v);
  },
  _stopSpeak() {
    if(this._nTTS) this._nTTS.stop().catch(()=>{});
    else this.synthesis?.cancel();
  },
  _speak(text) {
    if(!this._ttsEnabled) return;
    const clean=text.replace(/[*`#\[\]{}]/g,'').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu,'').trim().slice(0,300);
    if(!clean) return;
    if(this._nTTS){ this._nTTS.stop().catch(()=>{}).finally(()=>this._nTTS.speak({ text:clean, lang:'ko-KR', rate:1.0, pitch:1.0, category:'playback' }).catch(()=>{})); return; }
    if(!this.synthesis) return;
    this.synthesis.cancel();
    const u=new SpeechSynthesisUtterance(clean); u.lang='ko-KR'; u.rate=1.05; u.pitch=0.95;
    const ko=this.synthesis.getVoices().find(v=>v.lang==='ko-KR'||v.lang==='ko_KR');
    if(ko) u.voice=ko;
    this.synthesis.speak(u);
  },

  // ── UI 헬퍼 ───────────────────────────
  // 키가 없을 때: 무료 키 안내 + 구독(ChatGPT Plus·Claude Pro)만 있는 사람은 그 앱으로 같은 질문을 넘긴다.
  // 구독은 API 키가 아니어서 이 앱이 대신 부를 수 없다 — 대신 질문을 채운 채로 그 앱을 연다.
  _noKey(q) {
    this._addMsg('ai','AI 키가 아직 없습니다. 열쇠 단추에서 무료 키(Groq·Gemini)를 넣으면 여기서 바로 답합니다.\nChatGPT·Claude 구독만 있다면 설정 › AI › ‘ChatGPT · Claude 에 Bashy 연결’ 을 해 두세요 — 그 앱에서 말하면 Bashy 에 바로 기록됩니다. 아래 단추는 이 질문만 그 앱으로 넘깁니다.');
    const wrap=document.getElementById('jMsgs'); if(!wrap) return;
    const d=document.createElement('div'); d.className='j-msg j-ai j-handoff';
    const e=encodeURIComponent(q);
    d.innerHTML=`<div class="j-avatar"></div><div class="j-ho">
      <a class="btn-sm" href="https://chatgpt.com/?q=${e}" target="_blank" rel="noopener">ChatGPT 에서 묻기</a>
      <a class="btn-sm" href="https://claude.ai/new?q=${e}" target="_blank" rel="noopener">Claude 에서 묻기</a>
      <button class="btn-sm accent" onclick="JARVIS.showKeySetup()">키 넣기</button></div>`;
    wrap.appendChild(d); wrap.scrollTop=wrap.scrollHeight;
  },

  _addMsg(type, text) {
    const wrap=document.getElementById('jMsgs'); if(!wrap) return;
    const isAI=type!=='user';
    const d=document.createElement('div');
    d.className=`j-msg ${isAI?'j-ai':'j-user'}`;
    const clean=esc(text).replace(/\n/g,'<br>');
    const isReminder=type==='reminder';
    d.innerHTML=isAI
      ?`<div class="j-avatar">${isReminder?'!':'B'}</div><div class="j-bubble${type==='tip'?' j-tip':isReminder?' j-reminder':''}">${clean}</div>`
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
  _setVoice(on){
    document.getElementById('jVoiceBar')?.classList.toggle('hidden',!on);
    const vt=document.getElementById('jVoiceTxt'); if(vt&&on) vt.textContent='듣고 있습니다…';
    this._setStatus(on?'듣는 중':'대기 중');
    this._syncSend();
  },
  // ── AI 제공자 ─────────────────────────
  // 기본은 Groq(무료 키). ChatGPT·Claude·Gemini·Grok 은 각 회사의 'API 키' 로 부른다.
  // (ChatGPT Plus 같은 구독은 API 키가 아니다 — 개발자 콘솔에서 따로 발급하고 쓴 만큼 요금이 붙는다.)
  // 모델 이름은 고정하지 않는다. 키로 지금 쓸 수 있는 목록을 받아 선호 순서대로 고른다.
  PROVIDERS: {
    groq:      { name:'Groq (무료)', short:'Groq',    url:'https://api.groq.com/openai/v1', key:'gl_ai_key',            keyUrl:'https://console.groq.com/keys', ph:'gsk_…', free:true },
    openai:    { name:'ChatGPT',     short:'ChatGPT', url:'https://api.openai.com/v1',      key:'gl_ai_key_openai',     keyUrl:'https://platform.openai.com/api-keys', ph:'sk-…',
                 pref:{ text:[/^gpt-5(\.\d+)?-mini$/,/^gpt-4\.1-mini$/,/^gpt-4o-mini$/,/mini/], vision:[/^gpt-5(\.\d+)?-mini$/,/^gpt-4\.1-mini$/,/^gpt-4o-mini$/,/mini/] } },
    anthropic: { name:'Claude',      short:'Claude',  url:'https://api.anthropic.com/v1',   key:'gl_ai_key_anthropic',  keyUrl:'https://console.anthropic.com/settings/keys', ph:'sk-ant-…',
                 pref:{ text:[/haiku/,/sonnet/], vision:[/haiku/,/sonnet/] } },
    gemini:    { name:'Gemini (무료 사용량)', short:'Gemini',  url:'https://generativelanguage.googleapis.com/v1beta/openai', key:'gl_ai_key_gemini', keyUrl:'https://aistudio.google.com/apikey', ph:'AIza…',
                 pref:{ text:[/flash-lite/,/flash/], vision:[/flash/] } },
    xai:       { name:'Grok',        short:'Grok',    url:'https://api.x.ai/v1',            key:'gl_ai_key_xai',        keyUrl:'https://console.x.ai', ph:'xai-…',
                 pref:{ text:[/grok.*(mini|fast)/,/grok/], vision:[/grok.*vision/,/grok-4/,/grok/] } },
  },
  // 따로 고르지 않았으면 키를 넣어 둔 AI 를 쓴다(무료 → 유료 순). 아무 키도 없으면 Gemini 를 권한다.
  FREE_FIRST: ['groq','gemini','openai','anthropic','xai'],
  get prov(){ const p=localStorage.getItem('gl_ai_prov'); if(this.PROVIDERS[p]) return p; return this.FREE_FIRST.find(x=>this._keyOf(x)) || 'groq'; },
  _keyOf(p){ return localStorage.getItem(this.PROVIDERS[p].key)||''; },
  // 고른 제공자의 키. 그 키가 비어 있으면 키가 있는 다른 제공자로 넘어간다 — 아무 키라도 있으면 비서는 동작한다.
  _active(){
    const order=[this.prov, ...Object.keys(this.PROVIDERS).filter(p=>p!==this.prov)];
    return order.find(p=>this._keyOf(p)) || this.prov;
  },
  _getKey(){ return this._keyOf(this._active()); },

  // OpenAI 호환(ChatGPT·Gemini·Grok)·Claude 의 모델 목록에서 선호 순서대로 하나 고른다. 하루 동안 기억한다.
  async _pick(p, kind){
    const P=this.PROVIDERS[p], ck='gl_ai_models_'+p, key=this._keyOf(p);
    let ids=null;
    try{ const c=JSON.parse(localStorage.getItem(ck)||'null'); if(c&&Date.now()-c.at<864e5) ids=c.ids; }catch{}
    if(!ids){
      try{
        const h = p==='anthropic' ? { 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' } : { Authorization:`Bearer ${key}` };
        const r=await fetch(P.url+'/models',{ headers:h }); const d=await r.json();
        ids=(d.data||d.models||[]).map(m=>String(m.id||m.name||'').replace(/^models\//,'')).filter(Boolean);
        if(ids.length) localStorage.setItem(ck, JSON.stringify({ at:Date.now(), ids }));
      }catch{ ids=[]; }
    }
    for(const re of (P.pref[kind]||P.pref.text)){ const hit=ids.filter(i=>re.test(i)).sort().reverse()[0]; if(hit) return hit; }
    return ids[0] || ({ openai:'gpt-4o-mini', anthropic:'claude-haiku-4-5', gemini:'gemini-2.5-flash', xai:'grok-3-mini' })[p];
  },

  // Groq 이 아닌 제공자로 보내기. 결과는 OpenAI 모양({choices:[{message:{content}}]})으로 맞춰 돌려준다.
  async _chatOther(p, body, kind){
    const P=this.PROVIDERS[p], key=this._keyOf(p), model=await this._pick(p, kind);
    const { reasoning_effort, response_format, ...b } = body;
    if(p==='anthropic'){
      const sys=(b.messages||[]).filter(m=>m.role==='system').map(m=>typeof m.content==='string'?m.content:'').join('\n');
      const conv=c=> typeof c==='string' ? c : c.map(x=>{
        if(x.type==='image_url'){ const m=/^data:([^;]+);base64,(.+)$/.exec(x.image_url.url||''); return m?{type:'image',source:{type:'base64',media_type:m[1],data:m[2]}}:{type:'text',text:''}; }
        return { type:'text', text:x.text||'' };
      });
      const msgs=(b.messages||[]).filter(m=>m.role!=='system').map(m=>({ role:m.role==='assistant'?'assistant':'user', content:conv(m.content) }));
      const res=await fetch(P.url+'/messages',{ method:'POST', headers:{ 'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body:JSON.stringify({ model, max_tokens:b.max_tokens||1024, ...(sys?{system:sys}:{}), messages:msgs, ...(b.temperature!=null?{temperature:b.temperature}:{}) }) });
      const d=await res.json().catch(()=>({}));
      if(res.status===429) throw new Error('Claude 사용량이 잠깐 찼어요. 잠시 뒤 다시 눌러 주세요');
      if(!res.ok) throw new Error(d.error?.message||`HTTP ${res.status}`);
      return { choices:[{ message:{ content:(d.content||[]).map(x=>x.text||'').join('') } }] };
    }
    const nb={ ...b, model };
    if(p==='openai' && nb.max_tokens){ nb.max_completion_tokens=nb.max_tokens; delete nb.max_tokens; delete nb.temperature; }
    const res=await fetch(P.url+'/chat/completions',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${key}` }, body:JSON.stringify(nb) });
    const d=await res.json().catch(()=>({}));
    if(res.status===429) throw new Error(`${P.short} 사용량이 잠깐 찼어요. 잠시 뒤 다시 눌러 주세요`);
    if(!res.ok){ if(/model/i.test(d.error?.message||'')) localStorage.removeItem('gl_ai_models_'+p); throw new Error(d.error?.message||`HTTP ${res.status}`); }
    return d;
  },

  // ── 어떤 모델로 부를 것인가 ─────────────────────────
  // 모델 이름을 코드에 박아 두면 Groq 이 그걸 내리는 날 앱이 조용히 죽는다.
  // 실제로 두 번 그랬다 — llama-3.3-70b 는 2026-08-16, llama-4-scout 는 2026-07-17 에
  // 무료·개발자 등급에서 내려갔고, 화면에는 "does not exist or you do not have access" 만 떴다.
  //
  // 그래서 이름을 고정하지 않는다. 이 키로 지금 쓸 수 있는 목록을 물어보고 그 안에서 고른다.
  // 다음에 또 하나가 내려가도 다음 후보로 저절로 넘어간다.
  MODELS: {
    text:   ['openai/gpt-oss-120b','qwen/qwen3.8-27b','qwen/qwen3.6-27b','openai/gpt-oss-20b'],
    vision: ['qwen/qwen3.8-27b','qwen/qwen3.6-27b'],
  },
  _MC: 'gl_ai_models',

  async _modelIds(fresh) {
    if(!fresh){
      try {
        const c = JSON.parse(localStorage.getItem(this._MC)||'null');
        // 하루면 충분하다. 모델이 내려가는 건 몇 달에 한 번이다.
        if(c && Date.now()-c.at < 864e5 && Array.isArray(c.ids) && c.ids.length) return c.ids;
      } catch {}
    }
    const key=this._keyOf('groq'); if(!key) return [];
    try {
      const res=await fetch('https://api.groq.com/openai/v1/models',{ headers:{ Authorization:`Bearer ${key}` } });
      if(!res.ok) return [];
      const data=await res.json();
      const ids=(data.data||[]).map(m=>m&&m.id).filter(Boolean);
      if(ids.length) localStorage.setItem(this._MC, JSON.stringify({ at:Date.now(), ids }));
      return ids;
    } catch { return []; }
  },

  async model(kind='text') {
    const want=this.MODELS[kind]||this.MODELS.text;
    const ids=await this._modelIds();
    // 목록을 못 받았으면(네트워크·권한) 첫 후보로 그냥 해 본다. 틀리면 아래 chat() 이 한 번 더 챙긴다.
    return want.find(m=>ids.includes(m)) || want[0];
  },

  // 모든 Groq 호출은 여기를 지난다. 모델이 없다고 하면 목록을 새로 받아 한 번만 다시 시도한다.
  // ── AI 로 보내기 전 동의 (App Store 5.1.1·5.1.2) ─────────────
  // 회사마다 처음 한 번: 무엇을, 누구에게 보내는지 알리고 허락을 받는다. 거절하면 보내지 않는다.
  CONSENT_KEY:'gl_ai_consent',
  COMPANY:{ groq:'Groq, Inc. (미국)', openai:'OpenAI (미국)', anthropic:'Anthropic (미국)', gemini:'Google (미국)', xai:'xAI (미국)' },
  _consented(p){ try{ return !!(JSON.parse(UserStore.get(this.CONSENT_KEY)||'{}')||{})[p]; }catch{ return false; } },
  revokeConsent(){ UserStore.set(this.CONSENT_KEY,'{}'); window.FirebaseSync?.scheduleSave?.(); },
  _askConsent(p){
    if(this._consented(p)) return Promise.resolve(true);
    if(this._consentP) return this._consentP;
    const P=this.PROVIDERS[p]||{}, co=this.COMPANY[p]||P.name||p;
    this._consentP=new Promise(res=>{
      const el=document.createElement('div'); el.className='ai-cs';
      el.innerHTML=`<div class="ai-cs-bg"></div><div class="ai-cs-sh" role="dialog" aria-label="AI 데이터 전송 동의">
        <div class="ai-cs-t">AI 에 내용을 보내도 될까요?</div>
        <dl class="ai-cs-dl">
          <dt>보내는 곳</dt><dd><b>${esc(P.short||p)}</b> · ${esc(co)} — 사용자가 넣은 API 키로 그 회사 서버에 바로 보냅니다(Bashy 서버를 거치지 않음)</dd>
          <dt>보내는 내용</dt><dd>입력한 질문·사진, 그리고 답하는 데 필요한 범위의 오늘 일정·할 일·습관·식단·운동·인바디 요약</dd>
          <dt>쓰임</dt><dd>질문에 대한 답, 식단 사진 분석, 운동 플랜 만들기에만 씁니다. 처리 방식은 그 회사의 개인정보 정책을 따릅니다</dd>
        </dl>
        <p class="ai-cs-n">동의하지 않으면 AI 기능만 쓰지 않고 나머지는 그대로 쓸 수 있습니다. 설정 › AI 에서 언제든 철회할 수 있습니다.</p>
        <div class="ai-cs-b"><button class="btn-sm" data-v="0">동의 안 함</button><button class="btn-sm accent" data-v="1">동의하고 보내기</button></div></div>`;
      el.addEventListener('click',e=>{ const b=e.target.closest('[data-v]'); if(!b) return;
        const ok=b.dataset.v==='1';
        if(ok){ let m={}; try{ m=JSON.parse(UserStore.get(this.CONSENT_KEY)||'{}')||{}; }catch{} m[p]=new Date().toISOString(); UserStore.set(this.CONSENT_KEY, JSON.stringify(m)); window.FirebaseSync?.scheduleSave?.(); }
        el.remove(); this._consentP=null; res(ok); });
      document.body.appendChild(el);
    });
    return this._consentP;
  },

  async chat(body, kind='text') {
    const p=this._active();
    const key=this._keyOf(p);
    if(!key) throw new Error('AI 키가 없습니다 — AI 창의 열쇠 단추에서 설정해 주세요');
    if(!(await this._askConsent(p))) throw new Error('AI 로 보내는 데 동의하지 않아 보내지 않았습니다');
    if(p!=='groq') return this._chatOther(p, body, kind);
    // 지금 쓰는 모델(gpt-oss)은 답하기 전에 속으로 생각하고, 그 생각도 max_tokens 를 먹는다.
    // 조금 어려운 질문이면 생각만 하다 예산이 끝나 본문이 빈 채로 돌아온다
    // (finish_reason:'length', content:'') — 부르는 쪽에서는 '모델이 모른다' 로 보인다.
    // 그래서 생각의 깊이를 기본값으로 낮춰 둔다. 부르는 쪽이 정했으면 그 값을 쓴다.
    const withDefaults = { reasoning_effort:'low', ...body };
    const send = async (model, b) => {
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
        body:JSON.stringify({ ...b, model }),
      });
      const data=await res.json().catch(()=>({}));
      return { ok:res.ok, status:res.status, data };
    };
    let model=await this.model(kind);
    let r=await send(model, withDefaults);
    // 생각 깊이를 안 받는 모델도 있다. 그것 때문에 통째로 실패하면 안 되니 한 번은 빼고 다시.
    if(!r.ok && /reasoning_effort/i.test(r.data?.error?.message||'')){
      const { reasoning_effort, ...bare } = withDefaults;
      r=await send(model, bare);
    }
    const gone = !r.ok && /does not exist|do not have access|decommission|model_not_found/i.test(
      r.data?.error?.message || r.data?.error?.code || '');
    if(gone){
      // 캐시가 낡았다. 새로 받아서 다른 후보로 한 번만 더.
      const ids=await this._modelIds(true);
      const next=(this.MODELS[kind]||this.MODELS.text).find(m=>ids.includes(m) && m!==model);
      if(next) r=await send(next, withDefaults);
    }
    // 무료 등급은 분당 토큰이 8,000 이다. 영어 원문을 그대로 띄우면
    // '내가 뭘 잘못했나' 로 읽힌다 — 잘못한 게 아니라 잠깐 기다리면 되는 일이다.
    if(r.status===429) throw new Error('AI 사용량이 잠깐 찼어요. 30초쯤 뒤에 다시 눌러 주세요');
    if(!r.ok) throw new Error(r.data?.error?.message || `HTTP ${r.status}`);
    return r.data;
  },

  showKeySetup() {
    App.openModal('@key AI 비서 설정', this.setupHtml() + `
      <div class="modal-btns">
        <button onclick="JARVIS.saveSetup();App.closeModal()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },
  // 설정 도우미와 같이 쓰는 화면 — 기본 AI 고르기 + 제공자별 키
  setupHtml() {
    const cur=this.prov;
    return `<div class="ai-setup">
      <p class="ai-note">AI 비서가 어떤 AI 로 답할지 고릅니다. 처음이라면 <b>Groq</b>(무료 · 하루 약 1,000회, 사진 분석 포함) 키를 권합니다. <b>Gemini</b> 무료 키는 하루 사용량이 적어(빠른 모델 약 20회) 예비로 두기 좋습니다.
        ChatGPT·Claude·Grok 은 각 회사 개발자 사이트의 <b>API 키</b>가 필요하고 쓴 만큼 요금이 붙습니다.</p>
      <p class="ai-note">ChatGPT Plus·Claude Pro 같은 <b>월 구독</b>은 API 키가 아니라서 여기에 넣을 수 없습니다. 대신 설정 › AI › <b>ChatGPT · Claude 에 Bashy 연결</b>을 하면, 그 앱에서 말하는 것으로 식단·습관·할 일·몸무게를 기록할 수 있습니다(구독 요금 안에서).</p>
      <p class="ai-note">키를 넣은 AI 가 여러 개면 고른 AI 를 먼저 쓰고, 그 키가 없으면 키가 있는 다른 AI 로 자동으로 넘어갑니다.</p>
      <div class="ai-provs">${Object.entries(this.PROVIDERS).map(([id,P])=>`
        <label class="ai-prov${id===cur?' on':''}">
          <input type="radio" name="aiProv" value="${id}" ${id===cur?'checked':''} onchange="JARVIS._pickProv(this)">
          <span class="ai-pn">${P.name}</span>
          <span class="ai-ps">${this._keyOf(id)?'키 있음':'키 없음'}</span>
        </label>`).join('')}</div>
      ${Object.entries(this.PROVIDERS).map(([id,P])=>`
        <div class="ai-keyrow" data-prov="${id}"${id===cur?'':' hidden'}>
          ${id==='groq' ? this._groqGuide() : ''}
          <label class="modal-lbl">${P.name} API 키 <a href="${P.keyUrl}" target="_blank" rel="noopener">발급받기 ↗</a></label>
          <div class="ai-keyline"><input type="password" class="inp ai-key" data-prov="${id}" placeholder="${P.ph}" value="${esc(this._keyOf(id))}" autocomplete="off">
            <button type="button" class="btn-sm" onclick="JARVIS.testKey('${id}', this)">확인</button></div>
          <div class="ai-keymsg" data-prov="${id}"></div>
        </div>`).join('')}
      <p class="ai-note">키는 이 계정에만 저장되고, 이 기기에서 각 AI 회사로 바로 보냅니다.</p>
    </div>`;
  },
  // 무료 Groq 키를 사용자 본인이 받는 길 — 앱이 대신 내주는 키는 없다(각자 자기 계정·자기 한도)
  _groqGuide() {
    return `<ol class="ai-guide">
      <li><a href="https://console.groq.com/keys" target="_blank" rel="noopener"><b>console.groq.com</b></a> 을 열고 구글 계정으로 가입합니다 (무료 · 카드 등록 없음)</li>
      <li><b>Create API Key</b> → 이름 아무거나(예: Bashy) → 나온 키를 <b>복사</b> (gsk_ 로 시작 · 이 화면에서 한 번만 보입니다)</li>
      <li>아래 칸에 붙여 넣고 <b>확인</b> → 연결되면 저장</li>
    </ol><p class="ai-note">무료 한도: 하루 약 1,000번 대화·사진 분석. 키는 내 계정에만 저장되고, 이 기기에서 Groq 로 바로 보냅니다.</p>`;
  },
  // 넣은 키가 실제로 되는지 모델 목록을 한 번 불러 본다
  async testKey(p, btn) {
    const box=document.querySelector(`.ai-setup .ai-key[data-prov="${p}"]`);
    const msg=document.querySelector(`.ai-setup .ai-keymsg[data-prov="${p}"]`);
    const key=(box?.value||'').trim(); if(!msg) return;
    if(!key){ msg.className='ai-keymsg bad'; msg.textContent='키를 먼저 붙여 넣어 주세요'; return; }
    msg.className='ai-keymsg'; msg.textContent='확인 중…'; if(btn) btn.disabled=true;
    try{
      const P=this.PROVIDERS[p];
      const r = p==='anthropic'
        ? await fetch(P.url+'/models',{ headers:{ 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' } })
        : await fetch(P.url+'/models',{ headers:{ Authorization:`Bearer ${key}` } });
      const j=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j?.error?.message || (r.status===401?'키가 맞지 않습니다':'HTTP '+r.status));
      const n=(j.data||j.models||[]).length;
      msg.className='ai-keymsg ok'; msg.textContent=`연결됨 — 쓸 수 있는 모델 ${n}개. 저장을 누르면 이 키로 답합니다.`;
    }catch(e){ msg.className='ai-keymsg bad'; msg.textContent='실패: '+(e.message||e); }
    if(btn) btn.disabled=false;
  },
  _pickProv(input) {
    const box=input.closest('.ai-setup');
    box.querySelectorAll('.ai-prov').forEach(l=>l.classList.toggle('on', l.querySelector('input').checked));
    box.querySelectorAll('.ai-keyrow').forEach(r=>r.hidden = r.dataset.prov!==input.value);
  },
  saveSetup() {
    const box=document.querySelector('.ai-setup'); if(!box) return false;
    const p=box.querySelector('input[name="aiProv"]:checked')?.value || this.prov;
    box.querySelectorAll('.ai-key').forEach(i=>{
      const k=i.value.trim(), lk=this.PROVIDERS[i.dataset.prov].key;
      if(k) localStorage.setItem(lk,k); else localStorage.removeItem(lk);
    });
    localStorage.setItem('gl_ai_prov', p);
    window.FirebaseSync?.scheduleSave?.();
    App.showToast(this._keyOf(p) ? `기본 AI: ${this.PROVIDERS[p].short}` : `${this.PROVIDERS[p].short} 키가 없어 ${this._keyOf(this._active())?this.PROVIDERS[this._active()].short+' 로 답합니다':'AI 비서는 키를 넣은 뒤 동작합니다'}`, 'success');
    return true;
  },
  _saveKey() { this.saveSetup(); },
};
