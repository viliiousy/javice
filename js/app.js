// js/app.js — 갓생 대시보드 메인 컨트롤러

const App = {
  S: {
    calDate:    new Date(),
    selDate:    new Date(),
    lists:      [],
    tasks:      {},
    events:     [],
    offline:    false,
    taskFilter: 'all',
    taskSort:   false,
    calPanel:   'today',
  },

  async init() {
    this._updateHeaderDate(new Date());
    this._loadQuote();
    this._setupListeners();
    setTimeout(()=>{ if(typeof JARVIS!=='undefined') JARVIS.init(); },500);
    const waitGIS=setInterval(()=>{
      if(typeof google!=='undefined'&&google.accounts){ clearInterval(waitGIS); Auth.init(); }
    },150);
    setTimeout(()=>clearInterval(waitGIS),5000);
  },

  _setupListeners() {
    const $=id=>document.getElementById(id);
    $('btnGoogleLogin').onclick =()=>Auth.login();
    $('btnOfflineMode').onclick =()=>this.startOffline();
    $('btnLogout').onclick      =()=>Auth.logout();
    $('btnSync').onclick        =()=>this.sync();
    $('btnAddTask').onclick     =()=>this._showTaskForm(true);
    $('btnCancelTask').onclick  =()=>this._showTaskForm(false);
    $('btnSaveTask').onclick    =()=>this._saveTask();
    $('btnAddEvent').onclick    =()=>this.showLongPressMenu(this.S.selDate);
    $('btnManageHabits').onclick=()=>Habits.showManageModal();
    $('btnCalSettings')?.addEventListener('click',()=>GoogleCalendar.showSettings());
    $('btnModalClose').onclick  =()=>this.closeModal();
    $('modal').onclick          =e=>{ if(e.target===$('modal')) this.closeModal(); };
    $('taskInput').onkeypress   =e=>{ if(e.key==='Enter') this._saveTask(); };
    $('btnDateSort').onclick    =()=>this._toggleDateSort();
  },

  _toggleDateSort() {
    this.S.taskSort=!this.S.taskSort;
    const btn=document.getElementById('btnDateSort');
    if(btn){ btn.style.background=this.S.taskSort?'var(--accent)':''; btn.style.color=this.S.taskSort?'#fff':''; btn.style.border=this.S.taskSort?'1px solid var(--accent)':''; }
    this._renderTasks();
  },

  async onAuthSuccess(userInfo) {
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('app').style.display='block';
    if(userInfo?.name){
      document.getElementById('hName').textContent=userInfo.name;
      if(userInfo.picture) document.getElementById('hAvatar').src=userInfo.picture;
      document.getElementById('hUser').style.display='flex';
    }
    this._updateHeaderDate(new Date());
    Habits.init(new Date());
    Fitness.render(new Date());
    Diet.render(new Date());
    Checklist.render();
    Memo.render();
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,[],this.S.selDate);
    await this.sync();
    Weather.init();
    this._updateStatsBanner();
  },

  startOffline() {
    this.S.offline=true;
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('app').style.display='block';
    this._updateHeaderDate(new Date());
    Habits.init(new Date()); Fitness.render(new Date()); Diet.render(new Date()); Checklist.render(); Memo.render();
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,[],this.S.selDate);
    document.getElementById('eventsWrap').innerHTML='<p class="empty">오프라인 모드</p>';
    document.getElementById('tasksContainer').innerHTML='<p class="empty">로그인 시 동기화됩니다</p>';
    Weather.init();
    this._updateStatsBanner();
  },

  // ── 동기화 ────────────────────────────
  async sync() {
    if(this.S.offline||!Auth.isLoggedIn()) return;
    this.showToast('동기화 중...','');
    try {
      this.S.lists=await GoogleTasks.fetchTaskLists();
      const sel=document.getElementById('taskListSel');
      if(sel) sel.innerHTML=this.S.lists.map(l=>`<option value="${l.id}">${esc(l.title)}</option>`).join('');
      this.S.tasks={};
      await Promise.all(this.S.lists.map(async l=>{
        this.S.tasks[l.id]=await GoogleTasks.fetchTasks(l.id);
        // 별표: localStorage 기반 (Google Tasks API는 starred 미지원)
        this.S.tasks[l.id].forEach(t=>{ t.starred=localStorage.getItem('gl_star_'+t.id)==='1'; });
      }));
      this._buildTaskFilters();
      this._renderTasks();

      const tMin=new Date(); tMin.setMonth(tMin.getMonth()-1); tMin.setHours(0,0,0,0);
      const tMax=new Date(); tMax.setMonth(tMax.getMonth()+3); tMax.setHours(23,59,59,999);
      this.S.events=await GoogleCalendar.fetchEvents(tMin,tMax);
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this._renderCalPanel();
      this._updateStatsBanner();
      this.showToast(`동기화 완료 ✓ (일정 ${this.S.events.length}개)`,'success');
    } catch(err){
      console.error('[Sync]',err);
      this.showToast('동기화 실패: '+err.message,'error');
    }
  },

  // ── 스탯 배너 ─────────────────────────
  _updateStatsBanner() {
    const el=document.getElementById('statsBanner'); if(!el) return;
    const hList=Habits.getList(); const hChk=Habits.getChecked();
    const hDone=hList.filter(h=>hChk.includes(h.id)).length;
    const dt=Diet.totals(Diet.getData()); const ds=Diet.getSettings();
    const calPct=ds.calorieGoal?Math.round(dt.cal/ds.calorieGoal*100):0;
    const fitChk=Fitness._checked(); const plan=Fitness.PLAN[new Date().getDay()];
    const fDone=fitChk.length; const fTotal=plan.exercises.length;
    const pending=Object.values(this.S.tasks||{}).reduce((n,l)=>n+l.filter(t=>t.status==='needsAction').length,0);
    const lastMsg=typeof JARVIS!=='undefined'&&JARVIS.history.length?JARVIS.history.filter(m=>m.role==='assistant').slice(-1)[0]?.content:'';
    const clItems=Checklist.getItems().filter(i=>!i.done);

    el.innerHTML=`
      <div class="stats-row">
        <div class="stat-chip ${hDone===hList.length&&hList.length>0?'stat-green':''}">✅ 습관 ${hDone}/${hList.length}</div>
        <div class="stat-chip ${calPct>=80?'stat-green':calPct>=50?'stat-yellow':''}">🥗 ${dt.cal}/${ds.calorieGoal}kcal</div>
        ${fTotal>0?`<div class="stat-chip ${fDone===fTotal?'stat-green':''}">💪 운동 ${fDone}/${fTotal}</div>`:''}
        ${pending>0?`<div class="stat-chip">📋 할일 ${pending}개</div>`:''}
        ${clItems.length>0?`<div class="stat-chip">✍️ ${clItems.length}개 미완료</div>`:''}
      </div>
      ${lastMsg?`<div class="stats-jarvis"><span class="stats-jarvis-icon">⚡</span><span class="stats-jarvis-txt">${esc(lastMsg.replace(/\{[\s\S]*\}/g,'').trim().slice(0,80))}</span></div>`:''}`;
  },

  // ── 날짜 선택 ────────────────────────
  selectCalDate(date) {
    this.S.selDate=date;
    this.S.calPanel='today';
    document.querySelectorAll('.cal-panel-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,date);
    this._renderCalPanel();
    Habits.render(date);
    Fitness.render(date);
    Diet.render(date);
    this._updateHeaderDate(date);
  },

  _updateHeaderDate(date) {
    const d=new Date(date);
    const isToday=d.toDateString()===new Date().toDateString();
    const el=document.getElementById('hDate'); const eld=document.getElementById('hDay');
    if(el) el.textContent=d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
    if(eld) eld.textContent=(isToday?'오늘 · ':'')+d.toLocaleDateString('ko-KR',{weekday:'long'});
  },

  changeCalMonth(dir) {
    const d=this.S.calDate;
    this.S.calDate=new Date(d.getFullYear(),d.getMonth()+dir,1);
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
  },

  setCalPanel(panel,btn) {
    this.S.calPanel=panel;
    document.querySelectorAll('.cal-panel-tab').forEach(t=>t.classList.remove('active'));
    if(btn) btn.classList.add('active');
    this._renderCalPanel();
  },

  _renderCalPanel() {
    const wrap=document.getElementById('eventsWrap'); if(!wrap) return;
    const p=this.S.calPanel||'today';
    if(p==='today')      this._renderEventsForDate(this.S.selDate,wrap);
    else if(p==='week')  this._renderWeekEvents(wrap);
    else                 this._renderMonthEvents(wrap);
  },

  _renderEventsForDate(date,wrap) {
    const target=new Date(date); target.setHours(0,0,0,0);
    const evs=(this.S.events||[]).filter(e=>{
      try {
        let d;
        if(e.start?.dateTime) d=new Date(e.start.dateTime);
        else if(e.start?.date){ const [y,m,dd]=e.start.date.split('-').map(Number); d=new Date(y,m-1,dd); }
        else return false;
        d.setHours(0,0,0,0);
        return d.getTime()===target.getTime();
      } catch{ return false; }
    }).sort((a,b)=>{
      const da=a.start?.dateTime?new Date(a.start.dateTime):new Date(a.start?.date);
      const db=b.start?.dateTime?new Date(b.start.dateTime):new Date(b.start?.date);
      return da-db;
    });
    const cls=typeof Checklist!=='undefined'?Checklist.getItemsForDate(date):[];
    const label=date.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    if(!evs.length&&!cls.length){ wrap.innerHTML=`<p class="empty" style="font-size:12px">${label} — 일정 없음<br><span style="color:var(--text3);font-size:11px">꾹 누르면 추가</span></p>`; return; }
    const clH=cls.map(c=>`<div class="event-item" style="border-color:var(--accent)"><div class="event-time" style="color:var(--accent)">체크</div><div class="event-title${c.done?' done-text':''}">${esc(c.title)}</div></div>`).join('');
    const evH=evs.map(e=>{ const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime); const col=e._calColor||_evColor(e.colorId);
      return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')">
        <div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div>
        <div><div class="event-title">${esc(e.summary||'(제목 없음)')}</div>
        ${e._calName&&e._calName!=='주요 일정'?`<div class="event-loc" style="color:${col}">📅 ${esc(e._calName)}</div>`:''}
        ${e.location?`<div class="event-loc">📍 ${esc(e.location)}</div>`:''}</div></div>`;
    }).join('');
    wrap.innerHTML=`<div style="padding:5px 12px 3px;font-size:11px;color:var(--text3)">${label}</div>${clH}${evH}`;
  },

  _renderWeekEvents(wrap) {
    const now=new Date(),dow=now.getDay();
    const mon=new Date(now); mon.setDate(now.getDate()-(dow===0?6:dow-1)); mon.setHours(0,0,0,0);
    const sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
    const evs=(this.S.events||[]).filter(e=>{ try{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); return d>=mon&&d<=sun; }catch{return false;} })
      .sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
    if(!evs.length){ wrap.innerHTML='<p class="empty" style="font-size:12px">이번 주 일정 없음</p>'; return; }
    const groups={}; evs.forEach(e=>{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); const k=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push(e); });
    wrap.innerHTML=Object.entries(groups).map(([day,items])=>`<div class="ev-group-hd">${day}</div>${items.map(e=>{ const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime); const col=e._calColor||_evColor(e.colorId);
      return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')"><div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div><div class="event-title">${esc(e.summary||'(제목 없음)')}</div></div>`; }).join('')}`).join('');
  },

  _renderMonthEvents(wrap) {
    const yr=this.S.calDate.getFullYear(),mo=this.S.calDate.getMonth();
    const evs=(this.S.events||[]).filter(e=>{ try{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); return d.getFullYear()===yr&&d.getMonth()===mo; }catch{return false;} })
      .sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
    const moLabel=new Date(yr,mo,1).toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    if(!evs.length){ wrap.innerHTML=`<p class="empty" style="font-size:12px">${moLabel} 일정 없음</p>`; return; }
    const groups={}; evs.forEach(e=>{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); const k=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push(e); });
    wrap.innerHTML=`<div style="padding:5px 12px 3px;font-size:11px;color:var(--text3)">${moLabel} · ${evs.length}개</div>`
      +Object.entries(groups).map(([day,items])=>`<div class="ev-group-hd">${day}</div>${items.map(e=>{ const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime); const col=e._calColor||_evColor(e.colorId);
        return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')"><div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div><div class="event-title">${esc(e.summary||'(제목 없음)')}</div></div>`; }).join('')}`).join('');
  },

  // ── long press 메뉴 ──────────────────
  showLongPressMenu(date) {
    const d=date||this.S.selDate;
    const ds=d.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    const defCal=GoogleCalendar.getDefaultCalendar();
    const calOptions=GoogleCalendar._allCalendars.length
      ?GoogleCalendar._allCalendars.map(c=>`<option value="${c.id}"${c.id===defCal?' selected':''}>${esc(c.summary)}</option>`).join('')
      :`<option value="primary">기본 캘린더</option>`;
    this.openModal(`➕ ${ds}`,`
      <div class="lp-menu">
        <button class="lp-btn" onclick="App.closeModal();App._showAddEventModalForDate(new Date('${d.toDateString()}'))">📅 일정 추가</button>
        <button class="lp-btn" onclick="App.closeModal();App._showAddTaskForDate(new Date('${d.toDateString()}'))">✅ 할일 추가</button>
        <button class="lp-btn" onclick="App.closeModal();App._showAddChecklistForDate(new Date('${d.toDateString()}'))">✍️ 체크리스트 추가</button>
      </div>
      <div style="margin-top:14px"><label class="modal-lbl">일정 추가 시 기본 캘린더</label>
        <select id="lpDefCal" class="inp inp-sm" onchange="GoogleCalendar.saveSettings({...GoogleCalendar.getSettings(),default:this.value})">${calOptions}</select>
      </div>`);
  },

  _showAddEventModalForDate(date) {
    const d=date||this.S.selDate;
    const base=new Date(d.getFullYear(),d.getMonth(),d.getDate(),new Date().getHours()+1,0);
    const end=new Date(base.getTime()+3600000);
    const fmt=x=>x.toISOString().slice(0,16);
    const defCal=GoogleCalendar.getDefaultCalendar();
    const calOptions=GoogleCalendar._allCalendars.length
      ?GoogleCalendar._allCalendars.map(c=>`<option value="${c.id}"${c.id===defCal?' selected':''}>${esc(c.summary)}</option>`).join('')
      :`<option value="primary">기본 캘린더</option>`;
    this.openModal('📅 일정 추가',`
      <div class="modal-row"><label class="modal-lbl">제목 *</label><input id="evT" type="text" placeholder="일정 제목" class="inp"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">시작</label><input id="evS" type="datetime-local" value="${fmt(base)}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">종료</label><input id="evE" type="datetime-local" value="${fmt(end)}" class="inp inp-sm"></div>
      </div>
      <div class="modal-row"><label class="modal-lbl">캘린더</label><select id="evCal" class="inp inp-sm">${calOptions}</select></div>
      <div class="modal-row"><label class="modal-lbl">장소</label><input id="evL" type="text" placeholder="장소 (선택)" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">설명</label><textarea id="evD" placeholder="설명 (선택)" class="inp" rows="2"></textarea></div>
      <div class="modal-btns">
        <button onclick="App._createEvent()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('evT')?.focus(),50);
  },

  async _createEvent() {
    const title=document.getElementById('evT').value.trim();
    const start=document.getElementById('evS').value;
    const end  =document.getElementById('evE').value;
    const calId=document.getElementById('evCal')?.value||'primary';
    if(!title||!start||!end){ this.showToast('제목과 날짜를 입력해주세요','error'); return; }
    try {
      const ev=await GoogleCalendar.createEvent(title,new Date(start).toISOString(),new Date(end).toISOString(),
        document.getElementById('evD').value.trim(),document.getElementById('evL').value.trim(),calId);
      this.S.events.push(ev);
      this.S.events.sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this._renderCalPanel();
      this.closeModal();
      this.showToast('일정 추가됨 ✓','success');
    } catch{ this.showToast('일정 추가 실패','error'); }
  },

  _showAddTaskForDate(date) {
    if(!Auth.isLoggedIn()){ this.showToast('로그인이 필요합니다','error'); return; }
    const ds=new Date(date).toISOString().split('T')[0];
    this.openModal('✅ 할일 추가',`
      <div class="modal-row"><label class="modal-lbl">제목 *</label><input id="qtTitle" type="text" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">메모</label><textarea id="qtNotes" class="inp" rows="3" placeholder="메모 (선택)"></textarea></div>
      <div class="modal-row"><label class="modal-lbl">목록</label><select id="qtList" class="inp inp-sm">${this.S.lists.map(l=>`<option value="${l.id}">${esc(l.title)}</option>`).join('')}</select></div>
      <div class="modal-row"><label class="modal-lbl">마감</label><input id="qtDue" type="date" value="${ds}" class="inp inp-sm"></div>
      <div class="modal-btns">
        <button onclick="App._saveQuickTask()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('qtTitle')?.focus(),50);
  },

  async _saveQuickTask() {
    const title=document.getElementById('qtTitle')?.value.trim();
    const notes=document.getElementById('qtNotes')?.value.trim()||'';
    const listId=document.getElementById('qtList')?.value;
    const due=document.getElementById('qtDue')?.value;
    if(!title){ this.showToast('제목을 입력해주세요','error'); return; }
    try {
      const task=await GoogleTasks.createTask(listId,title,due||null,notes);
      task.starred=false;
      if(!this.S.tasks[listId]) this.S.tasks[listId]=[];
      this.S.tasks[listId].unshift(task);
      this._renderTasks();
      this.closeModal();
      this.showToast('할일 추가됨 ✓','success');
    } catch{ this.showToast('추가 실패','error'); }
  },

  _showAddChecklistForDate(date) {
    const ds=new Date(date).toISOString().split('T')[0];
    this.openModal('✍️ 체크리스트 추가',`
      <div class="modal-row"><label class="modal-lbl">항목 *</label><input id="qcTitle" type="text" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">마감</label><input id="qcDue" type="date" value="${ds}" class="inp inp-sm"></div>
      <div class="modal-btns">
        <button onclick="App._saveQuickChecklist()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('qcTitle')?.focus(),50);
  },

  _saveQuickChecklist() {
    const title=document.getElementById('qcTitle')?.value.trim();
    const due=document.getElementById('qcDue')?.value;
    if(!title){ this.showToast('항목을 입력해주세요','error'); return; }
    const items=Checklist.getItems();
    items.push({id:'cl_'+Date.now(),title,dueDate:due||null,done:false,createdAt:new Date().toISOString()});
    Checklist.saveItems(items);
    Checklist.render();
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
    this.closeModal();
    this.showToast('체크리스트 추가됨 ✓','success');
  },

  _showEvDetail(id) {
    const e=this.S.events.find(x=>x.id===id); if(!e) return;
    const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime);
    const en=e.end?.dateTime?new Date(e.end.dateTime):null;
    const col=e._calColor||_evColor(e.colorId);
    this.openModal('📅 일정',`
      <h4 style="font-size:16px;font-weight:700;margin-bottom:12px">${esc(e.summary||'(제목 없음)')}</h4>
      ${e._calName?`<p style="font-size:12px;color:${col};margin-bottom:8px">📅 ${esc(e._calName)}</p>`:''}
      <p style="color:var(--text2);font-size:13px;margin-bottom:8px">
        ${e.start?.date||_fmtFull(s)}<br>${allDay?'종일':_fmtTime(s)+(en?' — '+_fmtTime(en):'')}
      </p>
      ${e.location?`<p style="color:var(--text2);font-size:13px;margin-bottom:8px">📍 ${esc(e.location)}</p>`:''}
      ${e.description?`<div style="color:var(--text2);font-size:13px;padding:10px;background:var(--card2);border-radius:8px;white-space:pre-wrap;margin-bottom:12px">${esc(e.description)}</div>`:''}
      ${!this.S.offline?`<button onclick="App._delEvent('${e.id}','${e._calId||''}')" style="width:100%;padding:9px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;color:var(--red);cursor:pointer;font-family:inherit;font-size:13px">🗑 일정 삭제</button>`:''}
    `);
  },

  async _delEvent(id,calId='') {
    if(!confirm('삭제하시겠습니까?')) return;
    try {
      await GoogleCalendar.deleteEvent(id,calId||'primary');
      this.S.events=this.S.events.filter(e=>e.id!==id);
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this._renderCalPanel(); this.closeModal(); this.showToast('삭제됨','success');
    } catch{ this.showToast('삭제 실패','error'); }
  },

  // ── 할일 ─────────────────────────────
  _buildTaskFilters() {
    const wrap=document.getElementById('taskFilters'); if(!wrap) return;
    const tabs=[{id:'all',label:'전체'},{id:'starred',label:'⭐ 별표'},...this.S.lists.map(l=>({id:l.id,label:l.title}))];
    wrap.innerHTML=tabs.map(t=>`<button class="fit-tab${this.S.taskFilter===t.id?' active':''}" onclick="App._setFilter('${t.id}')">${esc(t.label)}</button>`).join('');
  },
  _setFilter(id){ this.S.taskFilter=id; this._buildTaskFilters(); this._renderTasks(); },

  _renderTasks() {
    const today=new Date().toDateString(), filter=this.S.taskFilter;
    let all=[];
    for(const list of this.S.lists){
      (this.S.tasks[list.id]||[]).filter(t=>{
        if(t.status==='needsAction') return true;
        if(t.status==='completed'&&t.completed) return new Date(t.completed).toDateString()===today;
        return false;
      }).forEach(t=>all.push({...t,_lid:list.id,_lname:list.title}));
    }
    if(filter==='starred') all=all.filter(t=>t.starred);
    else if(filter!=='all') all=all.filter(t=>t._lid===filter);
    all.sort((a,b)=>(b.starred?1:0)-(a.starred?1:0));
    if(this.S.taskSort) all.sort((a,b)=>{ if(a.starred&&!b.starred)return -1; if(!a.starred&&b.starred)return 1; return (a.due?new Date(a.due):new Date('9999'))-(b.due?new Date(b.due):new Date('9999')); });
    if(!all.length){ document.getElementById('tasksContainer').innerHTML=`<p class="empty">${filter==='starred'?'별표 항목 없음 ☆':'할일 없음 🎉'}</p>`; return; }
    const groups={};
    if(this.S.taskSort){ all.forEach(t=>{ const k=t.due?new Date(t.due).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'}):'날짜 없음'; if(!groups[k])groups[k]=[]; groups[k].push(t); }); }
    else{ all.forEach(t=>{ const k=t._lname; if(!groups[k])groups[k]=[]; groups[k].push(t); }); }
    document.getElementById('tasksContainer').innerHTML=Object.entries(groups).map(([k,v])=>
      `<div class="task-group"><div class="task-group-name">${esc(k)}</div>${v.map(t=>this._taskHTML(t)).join('')}</div>`).join('');
  },

  _taskHTML(t) {
    const done=t.status==='completed', due=t.due?new Date(t.due):null;
    const overdue=due&&due<new Date()&&!done, star=t.starred;
    const dueStr=due?`<span class="task-due-inline${overdue?' overdue':''}">${_fmtDate(due)}</span>`:'';
    return `<div class="task-item${done?' done':''}">
      <div class="task-check" onclick="event.stopPropagation();App._toggle('${t.id}','${t._lid}',${done})"></div>
      <div class="task-body" onclick="App._showTaskDetail('${t.id}','${t._lid}')">
        <div class="task-text">${esc(t.title)} ${dueStr}</div>
        ${t.notes?`<div class="task-notes">${esc(t.notes.slice(0,50))}${t.notes.length>50?'…':''}</div>`:''}
      </div>
      <button class="task-star${star?' starred':''}" onclick="event.stopPropagation();App._toggleStar('${t.id}','${t._lid}')"></button>
      <button class="task-del" onclick="event.stopPropagation();App._delTask('${t.id}','${t._lid}')">✕</button>
    </div>`;
  },

  // ── 할일 상세 / 편집 모달 ─────────────
  _showTaskDetail(taskId, listId) {
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    const due=t.due?t.due.split('T')[0]:'';
    const listOptions=this.S.lists.map(l=>`<option value="${l.id}"${l.id===listId?' selected':''}>${esc(l.title)}</option>`).join('');
    this.openModal('📋 할일 상세',`
      <div class="modal-row"><label class="modal-lbl">제목</label>
        <input id="tdTitle" type="text" value="${esc(t.title)}" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">메모</label>
        <textarea id="tdNotes" class="inp" rows="4" placeholder="메모 (선택)">${esc(t.notes||'')}</textarea></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">마감 날짜</label>
          <input id="tdDue" type="date" value="${due}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">목록 이동</label>
          <select id="tdList" class="inp inp-sm">${listOptions}</select></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
        생성: ${t.updated?new Date(t.updated).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'}):''}
      </div>
      <div class="modal-btns">
        <button onclick="App._saveTaskDetail('${taskId}','${listId}')" class="btn-sm accent">저장 및 동기화</button>
        <button onclick="App._delTask('${taskId}','${listId}');App.closeModal();" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('tdTitle')?.focus(),50);
  },

  async _saveTaskDetail(taskId, listId) {
    const title=document.getElementById('tdTitle')?.value.trim();
    const notes=document.getElementById('tdNotes')?.value.trim()||'';
    const due  =document.getElementById('tdDue')?.value||null;
    const newListId=document.getElementById('tdList')?.value||listId;
    if(!title){ this.showToast('제목을 입력해주세요','error'); return; }
    try {
      if(newListId!==listId){
        // 목록 이동
        const created=await GoogleTasks.moveTask(listId,newListId,taskId,title,notes,due);
        created.starred=localStorage.getItem('gl_star_'+taskId)==='1';
        if(!this.S.tasks[newListId]) this.S.tasks[newListId]=[];
        this.S.tasks[newListId].unshift(created);
        this.S.tasks[listId]=this.S.tasks[listId]?.filter(t=>t.id!==taskId);
      } else {
        const updated=await GoogleTasks.updateTask(listId,taskId,{title,notes,due});
        const t=this.S.tasks[listId]?.find(x=>x.id===taskId);
        if(t){ Object.assign(t,{title,notes:notes||'',due:updated.due||null}); }
      }
      this._renderTasks();
      this.closeModal();
      this.showToast('저장됨 ✓','success');
    } catch(e){ this.showToast('저장 실패: '+e.message,'error'); }
  },

  async _toggle(taskId,listId,done){
    try {
      await GoogleTasks.toggleTask(listId,taskId,!done);
      const t=this.S.tasks[listId]?.find(x=>x.id===taskId);
      if(t){ t.status=!done?'completed':'needsAction'; t.completed=!done?new Date().toISOString():null; }
      this._renderTasks();
      this._updateStatsBanner();
      this.showToast(!done?'완료! ✓':'다시 할일로','success');
    } catch{ this.showToast('업데이트 실패','error'); }
  },

  _toggleStar(taskId,listId){
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    t.starred=!t.starred;
    t.starred?localStorage.setItem('gl_star_'+taskId,'1'):localStorage.removeItem('gl_star_'+taskId);
    this._renderTasks();
    this.showToast(t.starred?'⭐ 별표 추가':'별표 해제','');
  },

  async _delTask(taskId,listId){
    if(!confirm('삭제하시겠습니까?')) return;
    try {
      await GoogleTasks.deleteTask(listId,taskId);
      this.S.tasks[listId]=this.S.tasks[listId]?.filter(t=>t.id!==taskId);
      this._renderTasks();
      this.showToast('삭제됨','success');
    } catch{ this.showToast('삭제 실패','error'); }
  },

  _showTaskForm(show){
    document.getElementById('taskForm').classList.toggle('hidden',!show);
    if(show) setTimeout(()=>document.getElementById('taskInput').focus(),50);
  },

  async _saveTask(){
    const title=document.getElementById('taskInput').value.trim(); if(!title) return;
    const listId=document.getElementById('taskListSel').value;
    const due=document.getElementById('taskDue').value;
    if(!Auth.isLoggedIn()){ this.showToast('로그인이 필요합니다','error'); return; }
    try {
      const task=await GoogleTasks.createTask(listId,title,due||null);
      task.starred=false;
      if(!this.S.tasks[listId]) this.S.tasks[listId]=[];
      this.S.tasks[listId].unshift(task);
      this._renderTasks();
      document.getElementById('taskInput').value='';
      document.getElementById('taskDue').value='';
      this._showTaskForm(false);
      this.showToast('할일 추가됨 ✓','success');
    } catch{ this.showToast('추가 실패','error'); }
  },

  // ── 유틸 ──────────────────────────────
  _loadQuote() {}, // 스탯 배너로 대체

  openModal(title,body){ document.getElementById('modalTitle').textContent=title; document.getElementById('modalBody').innerHTML=body; document.getElementById('modal').classList.remove('hidden'); },
  closeModal(){ document.getElementById('modal').classList.add('hidden'); },

  showToast(msg,type=''){
    const t=document.getElementById('toast');
    t.textContent=msg; t.className=`toast${type?' '+type:''}`;
    clearTimeout(this._tt);
    this._tt=setTimeout(()=>t.classList.add('hidden'),3000);
  },
};

function esc(s){ if(!s)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _fmtDate(d){ return d?.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})||''; }
function _fmtTime(d){ return d?.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})||''; }
function _fmtFull(d){ return d?.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'})||''; }
function _evColor(cid){ const M={'1':'#7986cb','2':'#33b679','3':'#8e24aa','4':'#e67c73','5':'#f6bf26','6':'#f5511d','7':'#039be5','8':'#616161','9':'#3f51b5','10':'#0b8043','11':'#d60000'}; return M[cid]||'var(--cyan)'; }

document.addEventListener('DOMContentLoaded',()=>App.init());
