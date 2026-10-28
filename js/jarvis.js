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
              <span style="font-size:11px;color:var(--accent-l)">운동·습관·식단·인바디·일정·할일·메모·스마트홈을 말로 처리합니다<br>마이크를 누르면 음성 대화 · 사진으로 식단 분석</span>
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
            <button id="jMicBtn" class="j-in-btn j-act" onclick="JARVIS._act()" title="음성 대화" aria-label="음성 대화">${Icons.svg('mic')}</button>
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
    // 짧은 기기 명령("조명 꺼 줘"·"거실 불 켜"·"에어컨 24도로")은 허브처럼 바로 처리한다 — AI 를 거치지 않고, 실제 결과로 답한다.
    // 확실하지 않으면 null 이 오고 아래 AI 로 넘어간다. (js/jarvis-actions.js JHome.quick)
    try{
      if(typeof JHome!=='undefined' && JHome.quick){
        if(JHome.qverb(JHome.qnum(msg))) this._setStatus('기기 확인 중...');
        const q=await JHome.quick(msg);
        if(q){
          this.history.push({role:'user',content:msg},{role:'assistant',content:JSON.stringify({response:q,actions:[]})+' [앱이 바로 실행함]'});
          this.history=this.history.slice(-24);
          this._addMsg('ai',q);
          if(this._ttsEnabled) this._speak(q);
          this._setStatus('대기 중');
          return q;
        }
      }
    }catch(e){ console.warn('[JARVIS quick]',e); }
    this._setStatus('생각 중...');
    const key=this._getKey();
    if(!key){ this._noKey(msg); this._setStatus('대기 중'); return; }
    try{
      const raw=await this._callAPI(key,msg);
      await this._handleReply(raw);
    }catch(err){ this._addMsg('ai',`오류: ${err.message}`); }
    this._setStatus('대기 중');
  },

  async _callAPI(apiKey, userMsg) {
    this.history.push({role:'user',content:userMsg});
    const msgs=this.history.slice(-12);
    const ctx=await this._buildCtx();
    let refs=''; try{ if(typeof JarvisActions!=='undefined' && JarvisActions.foodRefs) refs=await JarvisActions.foodRefs(userMsg); }catch(e){}
    const sys=this._buildSys(ctx)+refs;
    const data=await this.chat({ max_tokens:4000, messages:[{role:'system',content:sys},...msgs] });
    const text=data.choices?.[0]?.message?.content||'';
    this.history.push({role:'assistant',content:text});
    return text;
  },

  // 명령을 먼저 실행하고, 실행기가 돌려준 결과로만 답한다(js/jarvis-actions.js).
  // 예전엔 모델의 말을 먼저 띄우고 명령은 뒤에서 조용히 돌려서, 대상을 못 찾아도 '바꿨습니다' 가 남았다.
  async _handleReply(raw) {
    let out;
    try { out = await JarvisActions.handle(this, raw); }
    catch (e) { console.error('[JARVIS]', e); out = { text: JarvisActions.parse(raw).response || String(raw || ''), tips: [] }; }
    const reply = out.text;
    if(reply){
      this._addMsg('ai',reply);
      // TTS는 켜져 있을 때만
      if(this._ttsEnabled) this._speak(reply);
    }
    if(Array.isArray(out.tips)&&out.tips.length) out.tips.forEach(t=>this._addMsg('tip',t));
    setTimeout(()=>{ if(typeof App!=='undefined') App._updateStatsBanner(); },400);
    return reply;
  },

  // ── 액션 실행기 ───────────────────────
  // 명령 목록·실행·이름 찾기(음성 인식 오타 보정)·스마트홈은 js/jarvis-actions.js 에 있다. 결과 { ok, msg, show } 를 돌려준다.
  _exec(action) { return JarvisActions.exec(action); },
  _buildCtx() { return JarvisActions.ctx(); },
  _buildSys(ctx) { return JarvisActions.sys(ctx); },

  // ── 음성 ──────────────────────────────
  // 앱(iOS)에서는 기기 음성 인식·읽기(네이티브 플러그인)를 쓰고, 웹에서는 브라우저 기능을 쓴다.
  // 입력칸 오른쪽 단추 하나가 상황에 따라 바뀐다: 비어 있으면 마이크, 글자가 있으면 보내기, 듣는 중이면 정지.
  get _nSR(){ return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.SpeechRecognition : null; },
  get _nTTS(){ return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.TextToSpeech : null; },
  _initSpeech() {
    if(this._nSR){
      this._nSR.addListener('partialResults', e=>{
        const t=(e.accumulatedText||e.matches?.[0]||'').trim();
        if(!t || window.VoiceChat?.active) return;
        const inp=document.getElementById('jInput'); if(inp) inp.value=t;
        const vt=document.getElementById('jVoiceTxt'); if(vt) vt.textContent=t;
      }).catch(()=>{});
      this._nSR.addListener('listeningState', e=>{
        const st=e.state||e.status;
        if(st==='stopped' && this.listening && !window.VoiceChat?.active) this._voiceDone();
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
    // 빈 칸에서 마이크 = 음성 대화 모드 (듣기 → 자동 보내기 → 답 읽기 → 다시 듣기). js/voice-chat.js
    if(window.VoiceChat) return VoiceChat.toggle();
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
    btn.ariaLabel=btn.title=mode==='send'?'보내기':mode==='stop'?'말하기 끝내기':'음성 대화';
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
    if(!this._ttsEnabled || window.VoiceChat?.active) return;   // 음성 대화 중에는 voice-chat.js 가 읽는다
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
    this._addMsg('ai','AI 키가 아직 없습니다. 열쇠 단추에서 무료 키(Groq·Gemini)를 넣으면 여기서 바로 답합니다.\nChatGPT·Claude 구독만 있다면 아래 ‘구독에 Bashy 연결’ 을 한 번 해 두세요 — 그 앱에서 말하면 Bashy 에 바로 기록됩니다. ‘에서 묻기’ 단추는 이 질문만 그 앱으로 넘깁니다.');
    const wrap=document.getElementById('jMsgs'); if(!wrap) return;
    const d=document.createElement('div'); d.className='j-msg j-ai j-handoff';
    const e=encodeURIComponent(q);
    d.innerHTML=`<div class="j-avatar"></div><div class="j-ho">
      <a class="btn-sm" href="https://chatgpt.com/?q=${e}" target="_blank" rel="noopener">ChatGPT 에서 묻기</a>
      <a class="btn-sm" href="https://claude.ai/new?q=${e}" target="_blank" rel="noopener">Claude 에서 묻기</a>
      <button class="btn-sm" onclick="Settings.open('connector')">구독에 Bashy 연결</button>
      <button class="btn-sm accent" onclick="JARVIS.showKeySetup()">무료 키 넣기</button></div>`;
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
      <div class="modal-btns ai-setup-btns">
        <button onclick="JARVIS.saveSetup();App.closeModal()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },
  // 키 발급 페이지 링크는 무료 키(Groq·Gemini)에만 단다 — 유료 API 키를 사도록 이끄는 단추는 두지 않는다.
  _FREE_KEY: ['groq','gemini'],
  // 설정 도우미와 같이 쓰는 화면 — 기본 AI 고르기 + 제공자별 키
  setupHtml() {
    const cur=this.prov;
    return `<div class="ai-setup">
      <p class="ai-note ai-lead">AI 비서가 답할 때 쓸 AI 를 고릅니다. 처음이라면 무료인 <b>Groq</b> 키를 권합니다(하루 약 1,000회 · 사진 분석 포함). <b>Gemini</b> 무료 키는 하루 사용량이 적어(약 20회) 예비로 두기 좋습니다.</p>
      <div class="ai-sec">기본 AI</div>
      <div class="ai-provs" role="radiogroup" aria-label="기본 AI">${Object.entries(this.PROVIDERS).map(([id,P])=>`
        <label class="ai-prov${id===cur?' on':''}">
          <input type="radio" name="aiProv" value="${id}" ${id===cur?'checked':''} onchange="JARVIS._pickProv(this)">
          <span class="ai-pn">${P.name}</span>
          <span class="ai-ps${this._keyOf(id)?' has':''}">${this._keyOf(id)?'키 있음':'키 없음'}</span>
        </label>`).join('')}</div>
      ${Object.entries(this.PROVIDERS).map(([id,P])=>`
        <div class="ai-keyrow" data-prov="${id}"${id===cur?'':' hidden'}>
          ${id==='groq' ? this._groqGuide() : id==='gemini' ? this._geminiGuide() : ''}
          <label class="modal-lbl">${P.name} API 키${this._FREE_KEY.includes(id) ? ` <a href="${P.keyUrl}" target="_blank" rel="noopener" onclick="JARVIS._wentForKey('${id}')">무료 키 받기 ↗</a>` : ''}</label>
          <div class="ai-keyline"><input type="password" class="inp ai-key" data-prov="${id}" placeholder="${P.ph}" value="${esc(this._keyOf(id))}" autocomplete="off" spellcheck="false" autocapitalize="off"
              onpaste="setTimeout(()=>JARVIS._keyTyped(this),0)">
            <button type="button" class="btn-sm" onclick="JARVIS.testKey('${id}', this)">확인</button></div>
          <button type="button" class="btn-sm ai-paste" onclick="JARVIS.pasteKey()">복사한 키 붙여넣기</button>
          <div class="ai-keymsg" data-prov="${id}"></div>
          ${P.free || this._FREE_KEY.includes(id) ? '' : `<p class="ai-note">이미 가지고 있는 ${P.short} API 키가 있을 때 넣어 주세요.</p>`}
        </div>`).join('')}
      <div class="ai-foot">
        <p class="ai-note">ChatGPT Plus·Claude Pro 같은 월 구독은 API 키가 아니어서 여기에 넣을 수 없습니다. 대신 <a href="#" onclick="event.preventDefault();JARVIS._toConnector()"><b>ChatGPT · Claude 에 Bashy 연결</b></a>을 하면 그 앱에서 말한 내용이 Bashy 에 기록됩니다.</p>
        <p class="ai-note">키가 여러 개면 고른 AI 를 먼저 쓰고, 그 키가 없으면 키가 있는 다른 AI 로 넘어갑니다. 키는 이 계정에만 저장되고, 이 기기에서 각 AI 회사로 바로 보냅니다.</p>
      </div>
    </div>`;
  },
  // 무료 Groq 키를 사용자 본인이 받는 길 — 앱이 대신 내주는 키는 없다(각자 자기 계정·자기 한도)
  _groqGuide() {
    return `<ol class="ai-guide">
      <li><a href="https://console.groq.com/keys" target="_blank" rel="noopener" onclick="JARVIS._wentForKey('groq')"><b>Groq 키 화면 열기 ↗</b></a> — 구글 계정으로 가입합니다 (무료 · 카드 등록 없음)</li>
      <li><b>Create API Key</b> → 이름 아무거나(예: Bashy) → <b>Submit</b> → 나온 키의 <b>Copy</b> (gsk_ 로 시작 · 한 번만 보입니다)</li>
      <li>이 화면으로 돌아와 <b>복사한 키 붙여넣기</b> — 확인과 저장까지 저절로 됩니다</li>
    </ol>`;
  },
  _geminiGuide() {
    return `<ol class="ai-guide">
      <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" onclick="JARVIS._wentForKey('gemini')"><b>Gemini 키 화면 열기 ↗</b></a> — 구글 계정으로 로그인합니다 (무료)</li>
      <li><b>API 키 만들기</b>(Create API key) → 나온 키 옆 <b>복사</b> (AIza 로 시작)</li>
      <li>이 화면으로 돌아와 <b>복사한 키 붙여넣기</b> — 확인과 저장까지 저절로 됩니다</li>
    </ol>`;
  },
  // 키 모양으로 어느 회사 키인지 안다 — 다른 칸에 붙여 넣어도 맞는 칸으로 옮긴다
  _provOfKey(k) {
    k = String(k || '').trim();
    if (/^gsk_/.test(k)) return 'groq';
    if (/^AIza/.test(k)) return 'gemini';
    if (/^sk-ant-/.test(k)) return 'anthropic';
    if (/^xai-/.test(k)) return 'xai';
    if (/^sk-/.test(k)) return 'openai';
    return null;
  },
  // 키를 받으러 다른 탭으로 갔다가 돌아오면 붙여넣기 단추를 눈에 띄게
  _wentForKey(p) {
    this._waitKey = p;
    const back = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', back);
      const b = document.querySelector(`.ai-setup .ai-keyrow[data-prov="${this._waitKey}"] .ai-paste`);
      if (b) { b.classList.add('accent'); b.focus({ preventScroll: true }); }
      const m = document.querySelector(`.ai-setup .ai-keymsg[data-prov="${this._waitKey}"]`);
      if (m && !m.textContent) { m.className = 'ai-keymsg'; m.textContent = '복사해 왔으면 아래 ‘복사한 키 붙여넣기’ 를 누르세요'; }
    };
    document.addEventListener('visibilitychange', back);
  },
  // 클립보드에서 키를 꺼내 맞는 칸에 넣고, 확인 → 성공하면 바로 저장
  async pasteKey() {
    let k = null;
    try { k = ((await navigator.clipboard.readText()) || '').trim(); } catch { k = null; }
    const cur = document.querySelector('.ai-setup input[name="aiProv"]:checked')?.value || this.prov;
    if (k == null) { const i = document.querySelector(`.ai-setup .ai-key[data-prov="${cur}"]`); i?.focus(); App.showToast('붙여넣기가 막혀 있습니다 — 키 칸을 길게 눌러 붙여 넣어 주세요', 'error'); return; }
    k = k.split(/\s+/)[0];
    const p = this._provOfKey(k);
    if (!p) { App.showToast('클립보드에 AI 키가 없습니다 — 키 화면에서 복사를 먼저 눌러 주세요', 'error'); return; }
    const inp = document.querySelector(`.ai-setup .ai-key[data-prov="${p}"]`); if (!inp) return;
    inp.value = k;
    this._keyTyped(inp);
  },
  async _keyTyped(inp) {
    const k = (inp.value || '').trim(); if (!k) return;
    const p = this._provOfKey(k) || inp.dataset.prov;
    let box = inp;
    if (p !== inp.dataset.prov) {   // 다른 회사 칸에 붙여 넣었다 → 맞는 칸으로 옮긴다
      box = document.querySelector(`.ai-setup .ai-key[data-prov="${p}"]`) || inp;
      if (box !== inp) { box.value = k; inp.value = this._keyOf(inp.dataset.prov) || ''; }
    }
    const radio = document.querySelector(`.ai-setup input[name="aiProv"][value="${p}"]`);
    if (radio && !radio.checked) { radio.checked = true; this._pickProv(radio); }
    const ok = await this.testKey(p);
    if (ok) {
      localStorage.setItem(this.PROVIDERS[p].key, k);
      localStorage.setItem('gl_ai_prov', p);
      window.FirebaseSync?.scheduleSave?.();
      const st = document.querySelector(`.ai-setup .ai-prov input[value="${p}"]`)?.closest('.ai-prov')?.querySelector('.ai-ps');
      if (st) { st.textContent = '키 있음'; st.classList.add('has'); }
      const m = document.querySelector(`.ai-setup .ai-keymsg[data-prov="${p}"]`);
      if (m) m.textContent = `연결되어 저장했습니다 — 이제 ${this.PROVIDERS[p].short} 로 답합니다.`;
      document.querySelector(`.ai-setup .ai-keyrow[data-prov="${p}"] .ai-paste`)?.classList.remove('accent');
    }
  },
  _toConnector() {
    const ob = document.getElementById('obMcp');
    if (ob && document.body.classList.contains('ob-open')) ob.scrollIntoView({ behavior:'smooth', block:'start' });
    else Settings.open('connector');
  },
  // 키가 필요한 기능에서 부른다: 길을 말로 알려 주지 않고 '키 넣기' 단추를 바로 준다
  needKey(msg = 'AI 키가 필요합니다') {
    App.showToast(msg, 'error', { label: '무료 키 넣기', fn: () => this.showKeySetup() });
  },
  // 넣은 키가 실제로 되는지 모델 목록을 한 번 불러 본다
  async testKey(p, btn) {
    const box=document.querySelector(`.ai-setup .ai-key[data-prov="${p}"]`);
    const msg=document.querySelector(`.ai-setup .ai-keymsg[data-prov="${p}"]`);
    const key=(box?.value||'').trim(); if(!msg) return false;
    if(!key){ msg.className='ai-keymsg bad'; msg.textContent='키를 먼저 붙여 넣어 주세요'; return false; }
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
      if(btn) btn.disabled=false;
      return true;
    }catch(e){ msg.className='ai-keymsg bad'; msg.textContent='실패: '+(e.message||e); }
    if(btn) btn.disabled=false;
    return false;
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
};
