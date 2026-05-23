// js/app.js — 갓생 대시보드 메인 컨트롤러

const App = {
  S: {
    calDate:       new Date(),
    selDate:       new Date(),
    lists:         [],
    tasks:         {},
    events:        [],
    offline:       false,
    taskFilter:    'all',
    taskSort:      false,
    calPanel:      'today',
    showCompleted: false,
  },

  async init() {
    this._updateHeaderDate(new Date());
    this.initDarkMode();
    this._setupListeners();
    setTimeout(()=>{ if(typeof JARVIS!=='undefined') JARVIS.init(); },500);
    const waitGIS=setInterval(()=>{ if(typeof google!=='undefined'&&google.accounts){ clearInterval(waitGIS); Auth.init(); } },150); setTimeout(()=>clearInterval(waitGIS),8000);
  },

  _setupListeners() {
    const $=id=>document.getElementById(id);
    const on=(id,fn)=>{ const el=$(id); if(el) el.onclick=fn; };
    on('btnGoogleLogin', ()=>Auth.login());
    on('btnOfflineMode', ()=>this.startOffline());
    on('btnLogout',      ()=>Auth.logout());
    on('btnSync',        ()=>this.sync());
    on('btnShowCompleted',()=>{ this.S.showCompleted=!this.S.showCompleted; const b=document.getElementById('btnShowCompleted'); if(b)b.style.background=this.S.showCompleted?'var(--accent)':''; this._renderTasks(); });
    on('btnShowHidden',  ()=>{ this.S.showHidden=!this.S.showHidden; const b=document.getElementById('btnShowHidden'); if(b)b.style.background=this.S.showHidden?'var(--accent)':''; this._renderTasks(); });
    on('btnAddTask',     ()=>this._showTaskForm(true));
    on('btnCancelTask',  ()=>this._showTaskForm(false));
    on('btnSaveTask',    ()=>this._saveTask());
    on('btnAddEvent',    ()=>this.showLongPressMenu(this.S.selDate));
    on('btnDateSort',    ()=>this._toggleDateSort());
    on('btnModalClose',  ()=>this.closeModal());
    $('btnCalSettings')?.addEventListener('click',()=>GoogleCalendar.showSettings());
    const modal=$('modal'); if(modal) modal.onclick=e=>{ if(e.target===modal) this.closeModal(); };
    const ti=$('taskInput'); if(ti) ti.onkeypress=e=>{ if(e.key==='Enter') this._saveTask(); };
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
    try { Habits.init(new Date()); } catch(e){ console.warn('Habits init',e); }
    try { Diet.render(new Date()); } catch(e){ console.warn('Diet render',e); }
    try { Checklist.render(); }     catch(e){ console.warn('Checklist render',e); }
    try { Memo.render(); }          catch(e){ console.warn('Memo render',e); }
    try { CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,[],this.S.selDate); } catch(e){ console.warn('Cal render',e); }
    this._updateStatsBanner();
    await this.sync();
    try { Weather.init(); } catch(e){ console.warn('Weather',e); }
  },

  startOffline() {
    this.S.offline=true;
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('app').style.display='block';
    this._updateHeaderDate(new Date());
    try{ Habits.init(new Date()); }catch{}
    try{ Diet.render(new Date()); }catch{}
    try{ Checklist.render(); }catch{}
    try{ Memo.render(); }catch{}
    try{ CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,[],this.S.selDate); }catch{}
    document.getElementById('eventsWrap').innerHTML='<p class="empty">오프라인 모드</p>';
    document.getElementById('tasksContainer').innerHTML='<p class="empty">로그인 시 동기화됩니다</p>';
    this._updateStatsBanner();
    try{ Weather.init(); }catch{}
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
        this.S.tasks[l.id].forEach(t=>{
          t.starred=localStorage.getItem('gl_star_'+t.id)==='1';
          t._hidden=localStorage.getItem('gl_hidden_'+t.id)==='1';
        });
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

  // ── 스탯 배너 (즉각 반영 + 반짝임 + 긴급 할일) ──
  _statsPrev: '{}',
  _updateStatsBanner() {
    const el=document.getElementById('statsBanner'); if(!el) return;
    const now=new Date();

    // 습관
    const hList=Habits.getList(), hChk=Habits.getChecked();
    const hDone=hList.filter(h=>hChk.includes(h.id)).length;

    // 식단
    const dt=Diet.totals(Diet.getData()), ds=Diet.getSettings();
    const calPct=ds.calorieGoal?Math.round(dt.cal/ds.calorieGoal*100):0;

    // 할일 (숨김 제외)
    const allPending=[];
    Object.entries(this.S.tasks||{}).forEach(([lid,list])=>
      list.filter(t=>t.status==='needsAction'&&!t._hidden).forEach(t=>allPending.push({...t,_lid:lid}))
    );
    const pending=allPending.length;
    const clItems=Checklist.getItems().filter(i=>!i.done);
    const lastMsg=typeof JARVIS!=='undefined'&&JARVIS.history.length
      ?JARVIS.history.filter(m=>m.role==='assistant').slice(-1)[0]?.content.replace(/[{][\s\S]*[}]/g,'').trim():'';

    // 이번주 일정 + 기한 있는 할일 (오늘~7일)
    const weekEnd=new Date(now); weekEnd.setDate(now.getDate()+7); weekEnd.setHours(23,59,59,999);
    const upcoming=[];
    // 캘린더 이벤트
    (this.S.events||[]).forEach(e=>{
      try{
        const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date+'T00:00:00');
        if(d>=now&&d<=weekEnd) upcoming.push({label:(e.summary||'').slice(0,15),isTask:false,date:d});
      }catch{}
    });
    // 기한 있는 할일
    allPending.filter(t=>t.due).forEach(t=>{
      try{
        const d=new Date(t.due);
        if(d>=now&&d<=weekEnd) upcoming.push({label:(t.title||'').slice(0,15),isTask:true,date:d});
      }catch{}
    });
    upcoming.sort((a,b)=>a.date-b.date);

    // 긴급 할일 TOP 3
    const urgentTasks=[...allPending].sort((a,b)=>{
      const aO=a.due&&new Date(a.due)<now?1:0,bO=b.due&&new Date(b.due)<now?1:0;
      const aS=(a.starred?8:0)+(aO?4:0)+(a.due?2:0),bS=(b.starred?8:0)+(bO?4:0)+(b.due?2:0);
      if(bS!==aS) return bS-aS;
      if(a.due&&b.due) return new Date(a.due)-new Date(b.due);
      return 0;
    }).slice(0,3);

    // 변경 감지 (긴급할일 id+status 포함)
    const curStr=JSON.stringify({hDone,cal:dt.cal,pending,cl:clItems.length,uIds:urgentTasks.map(t=>t.id+t.status).join()});
    const changed=curStr!==this._statsPrev;
    const prevObj=this._statsPrev&&this._statsPrev!=='{}'?JSON.parse(this._statsPrev):{};
    this._statsPrev=curStr;

    // HTML 조립
    const chipsHTML=`
      <div class="stat-chip ${hDone===hList.length&&hList.length>0?'stat-green':''}" data-s="habits">✅ 습관 ${hDone}/${hList.length}</div>
      <div class="stat-chip ${calPct>=80?'stat-green':calPct>=50?'stat-yellow':''}" data-s="diet">🥗 ${dt.cal}/${ds.calorieGoal}kcal</div>
      ${pending>0?`<div class="stat-chip" data-s="tasks">📋 할일 ${pending}개</div>`:''}
      ${clItems.length>0?`<div class="stat-chip" data-s="checklist">✍️ ${clItems.length}개</div>`:''}`;

    // 이번주 일정/할일 - 날짜 포함, 3개씩 줄바꿈
    const upcomingHTML=upcoming.length?`
      <div class="stats-upcoming">
        ${upcoming.map(i=>{
          const md=`${i.date.getMonth()+1}/${i.date.getDate()}`;
          return `<span class="stats-upcoming-chip ${i.isTask?'uc-task':'uc-event'}">${i.isTask?'📋':'📅'} <span class="uc-date">${md}</span> ${esc(i.label)}</span>`;
        }).join('')}
      </div>`:'';

    const urgentHTML=urgentTasks.length?`
      <div class="stats-urgent-row">
        ${urgentTasks.map(t=>{
          const due=t.due?new Date(t.due):null,over=due&&due<now;
          return `<div class="stats-urgent-chip${over?' urgent-over':''}${t.starred?' urgent-star':''}" data-s="tasks">${t.starred?'⭐':''}${esc(t.title.length>15?t.title.slice(0,14)+'…':t.title)}${due?` <span class="${over?'stats-overdue':'stats-due'}">${_fmtDate(due)}</span>`:''}</div>`;
        }).join('')}
      </div>`:'';

    const jarvisHTML=lastMsg?`<div class="stats-jarvis"><span class="stats-jarvis-icon">⚡</span><span class="stats-jarvis-txt">${esc(lastMsg.slice(0,90))}</span></div>`:'';

    el.innerHTML=`<div class="stats-row">${chipsHTML}</div>${upcomingHTML}${urgentHTML}${jarvisHTML}`;

    // 칩별 반짝임
    if(changed){
      if(prevObj.hDone!==undefined&&prevObj.hDone!==hDone){
        const c=el.querySelector('[data-s="habits"]'); if(c){c.classList.remove('chip-flash');void c.offsetWidth;c.classList.add('chip-flash');}
      }
      if(prevObj.cal!==undefined&&prevObj.cal!==dt.cal){
        const c=el.querySelector('[data-s="diet"]'); if(c){c.classList.remove('chip-flash');void c.offsetWidth;c.classList.add('chip-flash');}
      }
      if(prevObj.pending!==undefined&&prevObj.pending!==pending){
        const c=el.querySelector('[data-s="tasks"]'); if(c){c.classList.remove('chip-flash');void c.offsetWidth;c.classList.add('chip-flash');}
      }
    }

    // 칩 클릭 → 섹션 스크롤
    setTimeout(()=>{
      el.querySelectorAll('[data-s]').forEach(chip=>{
        chip.onclick=()=>{
          const sec=chip.dataset.s;
          const map={habits:'.card-habits',diet:'.card-diet',tasks:'.card-tasks',checklist:'.card-checklist'};
          const target=document.querySelector(map[sec]);
          if(target){
            const sH=(document.querySelector('.header-sticky-group')?.offsetHeight||100)+8;
            window.scrollTo({top:target.getBoundingClientRect().top+window.scrollY-sH,behavior:'smooth'});
          }
        };
      });
    },50);
  },

  // ── 날짜 선택 ────────────────────────
  selectCalDate(date) {
    this.S.selDate=date;
    this.S.calPanel='today';
    document.querySelectorAll('.cal-panel-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,date);
    this._renderCalPanel();
    try{ Habits.render(date); }catch{}
    try{ Diet.render(date); }catch{}
    this._updateHeaderDate(date);
  },

  _updateHeaderDate(date) {
    const d=new Date(date);
    const isToday=d.toDateString()===new Date().toDateString();
    const dow=d.getDay();
    const hDateWrap=document.querySelector('.h-date');
    const el=document.getElementById('hDate'), eld=document.getElementById('hDay');

    if(hDateWrap) hDateWrap.classList.toggle('h-date-today', isToday);
    if(el){
      // 날짜 표시: 모바일이면 26년 5월 23일, PC면 2026년 5월 23일
      if(window.innerWidth<=640){
        el.textContent=`${String(d.getFullYear()).slice(2)}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
      } else {
        el.textContent=d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
      }
      el.style.cursor='pointer';
      el.onclick=(e)=>{ e.stopPropagation(); App._toggleDateDropdown(d); };
    }
    if(eld){
      const dayStr=d.toLocaleDateString('ko-KR',{weekday:'long'});
      // 해당 날짜 할일 개수
      const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const taskCount=Object.values(this.S.tasks||{}).reduce((n,l)=>n+l.filter(t=>{
        if(t.status!=='needsAction') return false;
        if(!t.due) return isToday; // 날짜 없는건 오늘에만 표시
        return t.due.split('T')[0]===dateStr;
      }).length,0);
      const taskBadge=taskCount>0?` <span style="font-size:10px;background:var(--accent);color:white;padding:1px 6px;border-radius:10px;font-weight:700">할일 ${taskCount}</span>`:'';

      // 6. 공휴일/일요일 빨간색 체크
      const isHoliday=typeof CalendarUI!=='undefined'&&CalendarUI._isHoliday(d.getFullYear(),d.getMonth(),d.getDate());
      const isRed=dow===0||isHoliday;

      if(isToday){
        eld.innerHTML=`<span style="color:#059669;font-weight:900">🕐 오늘</span> · ${dayStr}${taskBadge}`;
        eld.style.color='';
      } else {
        eld.innerHTML=`${dayStr}${taskBadge}`;
        eld.style.color=isRed?'var(--red)':dow===6?'var(--blue)':'';
      }
    }
  },

  _toggleDateDropdown(currentDate) {
    // 기존 드롭다운 닫기
    const existing=document.getElementById('datePicker');
    if(existing){ existing.remove(); return; }

    const hDate=document.querySelector('.h-date');
    if(!hDate) return;

    const dropdown=document.createElement('div');
    dropdown.id='datePicker';
    dropdown.className='date-picker-dropdown';

    const calContainer=document.createElement('div');
    let pickerDate=new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    const render=()=>{
      calContainer.innerHTML='';
      CalendarUI.render(calContainer, pickerDate, App.S.events, currentDate);
      // 달력 클릭 오버라이드 (touch + mouse 모두)
      calContainer.querySelectorAll('.cal-day:not(.other-month)').forEach(dayEl=>{
        const handler=(e)=>{
          e.stopPropagation(); e.preventDefault();
          const txt=dayEl.textContent.trim();
          if(!txt||isNaN(parseInt(txt))) return;
          const d=new Date(pickerDate.getFullYear(), pickerDate.getMonth(), parseInt(txt));
          dropdown.remove();
          App.selectCalDate(d);
        };
        dayEl.onclick=handler;
        dayEl.ontouchend=handler;
        // long press 방지
        dayEl.onmousedown=null; dayEl.ontouchstart=(e)=>e.stopPropagation();
      });
      // 월 이동 버튼 오버라이드
      calContainer.querySelector('.cal-nav-btn:first-child').onclick=(e)=>{
        e.stopPropagation();
        pickerDate=new Date(pickerDate.getFullYear(), pickerDate.getMonth()-1, 1);
        render();
      };
      calContainer.querySelector('.cal-nav-btn:last-child').onclick=(e)=>{
        e.stopPropagation();
        pickerDate=new Date(pickerDate.getFullYear(), pickerDate.getMonth()+1, 1);
        render();
      };
    };

    dropdown.innerHTML=`<div class="date-picker-header">
      <span style="font-size:13px;font-weight:700;color:var(--text)">날짜 선택</span>
      <button class="date-picker-today-btn" id="dpTodayBtn">오늘</button>
    </div>`;
    dropdown.appendChild(calContainer);

    hDate.style.position='relative';
    hDate.appendChild(dropdown);
    render();

    dropdown.querySelector('#dpTodayBtn').onclick=(e)=>{
      e.stopPropagation();
      dropdown.remove();
      App.selectCalDate(new Date());
    };

    // 바깥 클릭 닫기
    setTimeout(()=>{
      document.addEventListener('click', function close(e){
        if(!dropdown.contains(e.target)){ dropdown.remove(); document.removeEventListener('click',close); }
      });
    },0);
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
    if(p==='today')     this._renderEventsForDate(this.S.selDate,wrap);
    else if(p==='week') this._renderWeekEvents(wrap);
    else                this._renderMonthEvents(wrap);
  },

  // tasks를 날짜별로 가져오기
  _getTasksForDate(date) {
    const target=new Date(date); target.setHours(0,0,0,0);
    const result=[];
    Object.values(this.S.tasks||{}).forEach(list=>{
      list.filter(t=>t.status==='needsAction'&&t.due).forEach(t=>{
        try{
          const ds=t.due.split('T')[0];
          const [y,m,dd]=ds.split('-').map(Number);
          const td=new Date(y,m-1,dd); td.setHours(0,0,0,0);
          if(td.getTime()===target.getTime()) result.push(t);
        }catch{}
      });
    });
    return result;
  },

  _getTasksForRange(startDate, endDate) {
    const result=[];
    Object.values(this.S.tasks||{}).forEach(list=>{
      list.filter(t=>t.status==='needsAction'&&t.due).forEach(t=>{
        try{
          const ds=t.due.split('T')[0];
          const [y,m,dd]=ds.split('-').map(Number);
          const td=new Date(y,m-1,dd);
          if(td>=startDate&&td<=endDate) result.push({...t,_dueDate:td});
        }catch{}
      });
    });
    return result.sort((a,b)=>a._dueDate-b._dueDate);
  },

  _renderEventsForDate(date,wrap) {
    const target=new Date(date); target.setHours(0,0,0,0);
    const evs=(this.S.events||[]).filter(e=>{
      try{
        let d;
        if(e.start?.dateTime) d=new Date(e.start.dateTime);
        else if(e.start?.date){ const [y,m,dd]=e.start.date.split('-').map(Number); d=new Date(y,m-1,dd); }
        else return false;
        d.setHours(0,0,0,0);
        return d.getTime()===target.getTime();
      }catch{ return false; }
    }).sort((a,b)=>{
      const da=a.start?.dateTime?new Date(a.start.dateTime):new Date(a.start?.date);
      const db=b.start?.dateTime?new Date(b.start.dateTime):new Date(b.start?.date);
      return da-db;
    });

    const tasks=this._getTasksForDate(date);
    const cls=typeof Checklist!=='undefined'?Checklist.getItemsForDate(date):[];
    const label=date.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});

    if(!evs.length&&!tasks.length&&!cls.length){
      wrap.innerHTML=`<p class="empty" style="font-size:12px">${label} — 일정 없음<br><span style="color:var(--text3);font-size:11px">꾹 누르면 추가</span></p>`;
      return;
    }

    // 체크리스트 항목
    const clH=cls.map(c=>`<div class="event-item" style="border-color:var(--accent)">
      <div class="event-time" style="color:var(--accent)">체크</div>
      <div class="event-title${c.done?' done-text':''}">${esc(c.title)}</div>
    </div>`).join('');

    // Task 항목 (마감일 기준)
    const taskH=tasks.map(t=>`<div class="event-item" style="border-color:var(--yellow)">
      <div class="event-time" style="color:var(--yellow)">할일</div>
      <div class="event-title">${esc(t.title)}</div>
    </div>`).join('');

    // 캘린더 이벤트
    const evH=evs.map(e=>{
      const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime);
      const col=e._calColor||_evColor(e.colorId);
      return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')">
        <div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div>
        <div>
          <div class="event-title">${esc(e.summary||'(제목 없음)')}</div>
          ${e._calName&&e._calName!=='주요 일정'?`<div class="event-loc" style="color:${col}">📅 ${esc(e._calName)}</div>`:''}
          ${e.location?`<div class="event-loc">📍 ${esc(e.location)}</div>`:''}
        </div>
      </div>`;
    }).join('');

    wrap.innerHTML=`<div style="padding:5px 12px 3px;font-size:11px;color:var(--text3)">${label}</div>${clH}${taskH}${evH}`;
  },

  _renderWeekEvents(wrap) {
    const now=new Date(),dow=now.getDay();
    const mon=new Date(now); mon.setDate(now.getDate()-(dow===0?6:dow-1)); mon.setHours(0,0,0,0);
    const sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
    const evs=(this.S.events||[]).filter(e=>{ try{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); return d>=mon&&d<=sun; }catch{return false;} })
      .sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
    const tasks=this._getTasksForRange(mon,sun);

    if(!evs.length&&!tasks.length){ wrap.innerHTML='<p class="empty" style="font-size:12px">이번 주 일정 없음</p>'; return; }

    const groups={};
    tasks.forEach(t=>{ const k=t._dueDate.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push({_isTask:true,...t}); });
    evs.forEach(e=>{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); const k=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push(e); });

    wrap.innerHTML=Object.keys(groups).sort().map(day=>`
      <div class="ev-group-hd">${day}</div>
      ${groups[day].map(e=>{
        if(e._isTask) return `<div class="event-item" style="border-color:var(--yellow)"><div class="event-time" style="color:var(--yellow)">할일</div><div class="event-title">${esc(e.title)}</div></div>`;
        const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime); const col=e._calColor||_evColor(e.colorId);
        return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')"><div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div><div class="event-title">${esc(e.summary||'(제목 없음)')}</div></div>`;
      }).join('')}`).join('');
  },

  _renderMonthEvents(wrap) {
    const yr=this.S.calDate.getFullYear(),mo=this.S.calDate.getMonth();
    const evs=(this.S.events||[]).filter(e=>{ try{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); return d.getFullYear()===yr&&d.getMonth()===mo; }catch{return false;} })
      .sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
    const mStart=new Date(yr,mo,1), mEnd=new Date(yr,mo+1,0);
    const tasks=this._getTasksForRange(mStart,mEnd);
    const moLabel=new Date(yr,mo,1).toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    if(!evs.length&&!tasks.length){ wrap.innerHTML=`<p class="empty" style="font-size:12px">${moLabel} 일정 없음</p>`; return; }

    const groups={};
    tasks.forEach(t=>{ const k=t._dueDate.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push({_isTask:true,...t}); });
    evs.forEach(e=>{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); const k=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push(e); });

    wrap.innerHTML=`<div style="padding:5px 12px 3px;font-size:11px;color:var(--text3)">${moLabel} · ${evs.length+tasks.length}개</div>`
      +Object.keys(groups).sort().map(day=>`
        <div class="ev-group-hd">${day}</div>
        ${groups[day].map(e=>{
          if(e._isTask) return `<div class="event-item" style="border-color:var(--yellow)"><div class="event-time" style="color:var(--yellow)">할일</div><div class="event-title">${esc(e.title)}</div></div>`;
          const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime); const col=e._calColor||_evColor(e.colorId);
          return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')"><div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div><div class="event-title">${esc(e.summary||'(제목 없음)')}</div></div>`;
        }).join('')}`).join('');
  },

  // ── Long press 메뉴 ──────────────────
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
      <div style="margin-top:14px"><label class="modal-lbl">기본 캘린더</label>
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
      <div class="modal-row"><label class="modal-lbl">제목 *</label><input id="evT" type="text" class="inp"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">시작</label><input id="evS" type="datetime-local" value="${fmt(base)}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">종료</label><input id="evE" type="datetime-local" value="${fmt(end)}" class="inp inp-sm"></div>
      </div>
      <div class="modal-row"><label class="modal-lbl">캘린더</label><select id="evCal" class="inp inp-sm">${calOptions}</select></div>
      <div class="modal-row"><label class="modal-lbl">장소</label><input id="evL" type="text" placeholder="(선택)" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">설명</label><textarea id="evD" class="inp" rows="2" placeholder="(선택)"></textarea></div>
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
    try{
      const ev=await GoogleCalendar.createEvent(title,new Date(start).toISOString(),new Date(end).toISOString(),
        document.getElementById('evD').value.trim(),document.getElementById('evL').value.trim(),calId);
      this.S.events.push(ev);
      this.S.events.sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this._renderCalPanel(); this.closeModal(); this.showToast('일정 추가됨 ✓','success');
    }catch{ this.showToast('일정 추가 실패','error'); }
  },

  _showAddTaskForDate(date) {
    if(!Auth.isLoggedIn()){ this.showToast('로그인이 필요합니다','error'); return; }
    const ds=new Date(date).toISOString().split('T')[0];
    this.openModal('✅ 할일 추가',`
      <div class="modal-row"><label class="modal-lbl">제목 *</label><input id="qtTitle" type="text" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">메모</label><textarea id="qtNotes" class="inp" rows="2" placeholder="(선택)"></textarea></div>
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
    try{
      const task=await GoogleTasks.createTask(listId,title,due||null,notes);
      task.starred=false;
      if(!this.S.tasks[listId]) this.S.tasks[listId]=[];
      this.S.tasks[listId].unshift(task);
      this._renderTasks();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this.closeModal(); this.showToast('할일 추가됨 ✓','success');
      this._updateStatsBanner();
    }catch{ this.showToast('추가 실패','error'); }
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
    Checklist.saveItems(items); Checklist.render();
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
    this.closeModal(); this.showToast('추가됨 ✓','success');
    this._updateStatsBanner();
  },

  _showEvDetail(id) {
    const e=this.S.events.find(x=>x.id===id); if(!e) return;
    const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime);
    const en=e.end?.dateTime?new Date(e.end.dateTime):null;
    const col=e._calColor||_evColor(e.colorId);
    this.openModal('📅 일정',`
      <h4 style="font-size:16px;font-weight:700;margin-bottom:12px">${esc(e.summary||'(제목 없음)')}</h4>
      ${e._calName?`<p style="font-size:12px;color:${col};margin-bottom:8px">📅 ${esc(e._calName)}</p>`:''}
      <p style="color:var(--text2);font-size:13px;margin-bottom:8px">${e.start?.date||_fmtFull(s)}<br>${allDay?'종일':_fmtTime(s)+(en?' — '+_fmtTime(en):'')}</p>
      ${e.location?`<p style="color:var(--text2);font-size:13px;margin-bottom:8px">📍 ${esc(e.location)}</p>`:''}
      ${e.description?`<div style="color:var(--text2);font-size:13px;padding:10px;background:var(--card2);border-radius:8px;white-space:pre-wrap;margin-bottom:12px">${esc(e.description)}</div>`:''}
      ${!this.S.offline?`<button onclick="App._delEvent('${e.id}','${e._calId||''}')" style="width:100%;padding:9px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;color:var(--red);cursor:pointer;font-family:inherit;font-size:13px">🗑 일정 삭제</button>`:''}
    `);
  },

  async _delEvent(id,calId='') {
    if(!confirm('삭제하시겠습니까?')) return;
    try{
      await GoogleCalendar.deleteEvent(id,calId||'primary');
      this.S.events=this.S.events.filter(e=>e.id!==id);
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this._renderCalPanel(); this.closeModal(); this.showToast('삭제됨','success');
    }catch{ this.showToast('삭제 실패','error'); }
  },

  // ── 할일 ─────────────────────────────
  _buildTaskFilters() {
    const wrap=document.getElementById('taskFilters'); if(!wrap) return;
    const tabs=[{id:'all',label:'전체'},{id:'starred',label:'⭐ 별표'},...this.S.lists.map(l=>({id:l.id,label:l.title}))];
    const catColors=JSON.parse(localStorage.getItem('gl_cat_colors')||'{}');
    wrap.innerHTML=tabs.map(t=>{
      const isListTab=t.id!=='all'&&t.id!=='starred';
      const col=isListTab&&catColors[t.id]?catColors[t.id]:'';
      const borderStyle=col?`border-color:${col};color:${col};border-width:2px`:'' ;
      return `<button class="fit-tab${this.S.taskFilter===t.id?' active':''}"
        onclick="App._setFilter('${t.id}')"
        oncontextmenu="event.preventDefault();App._showCatColorPicker('${t.id}','${esc(t.label)}')"
        ontouchstart="App._tabLongPress('${t.id}','${esc(t.label)}',event)"
        ontouchend="App._tabLongPressEnd()"
        style="${borderStyle}">${esc(t.label)}</button>`;
    }).join('');
  },
  _toggleCompleted(){ this.S.showCompleted=!this.S.showCompleted; this._buildTaskFilters(); this._renderTasks(); },
  _tabLpTimer: null,
  _tabLongPress(id,label,e){
    this._tabLpTimer=setTimeout(()=>{ this._showCatColorPicker(id,label); },600);
  },
  _tabLongPressEnd(){ clearTimeout(this._tabLpTimer); },
  _toggleHidden(){ this.S.showHidden=!this.S.showHidden; this._buildTaskFilters(); this._renderTasks(); },
  _setFilter(id){ this.S.taskFilter=id; this._buildTaskFilters(); this._renderTasks(); },

  _renderTasks() {
    const today=new Date().toDateString(), filter=this.S.taskFilter;
    let all=[];
    for(const list of this.S.lists){
      (this.S.tasks[list.id]||[]).filter(t=>{
        if(t.status==='needsAction') return true;
        // 완료 항목: showCompleted 모드일 때만 오늘 완료된 것 표시
        if(this.S.showCompleted && t.status==='completed'&&t.completed)
          return new Date(t.completed).toDateString()===today;
        return false;
      }).forEach(t=>all.push({...t,_lid:list.id,_lname:list.title}));
    }
    if(filter==='starred') all=all.filter(t=>t.starred);
    else if(filter!=='all') all=all.filter(t=>t._lid===filter);
    // 숨김 처리
    if(!this.S.showHidden) all=all.filter(t=>!t._hidden);
    // 기본: 날짜순 + 별표 우선
    all.sort((a,b)=>{
      if(a.starred&&!b.starred) return -1;
      if(!a.starred&&b.starred) return 1;
      const da=a.due?new Date(a.due):new Date('9999');
      const db=b.due?new Date(b.due):new Date('9999');
      return da-db;
    });
    if(!all.length){ document.getElementById('tasksContainer').innerHTML=`<p class="empty">${filter==='starred'?'별표 없음 ☆':'할일 없음 🎉'}</p>`; return; }
    const groups={};
    // 전체/날짜순 탭: 단일 목록으로 날짜순 표시
    // 특정 목록 탭: 해당 카테고리만 그룹핑
    if(filter==='all'||filter==='starred'){
      groups['_all_']=[...all];
    } else {
      all.forEach(t=>{ if(!groups[t._lname])groups[t._lname]=[]; groups[t._lname].push(t); });
    }
    const catColors=JSON.parse(localStorage.getItem('gl_cat_colors')||'{}');
    document.getElementById('tasksContainer').innerHTML=Object.entries(groups).map(([k,v])=>{
      if(k==='_all_') return `<div class="task-group">${v.map(t=>this._taskHTML(t)).join('')}</div>`;
      const listId=v[0]?._lid||'';
      const col=catColors[listId]||'';
      const style=col?`border-left:3px solid ${col};padding-left:8px;border-radius:0 var(--r-xs) var(--r-xs) 0`:'';
      return `<div class="task-group" style="${style}">
        <div class="task-group-name" style="${col?'color:'+col+';font-weight:700':''}">${esc(k)}</div>
        ${v.map(t=>this._taskHTML(t)).join('')}
      </div>`;
    }).join('');
  },

  _taskHTML(t) {
    const done=t.status==='completed', due=t.due?new Date(t.due):null;
    const overdue=due&&due<new Date()&&!done, star=t.starred, hidden=t._hidden;
    const dueStr=due?`<span class="task-due-inline${overdue?' overdue':''}">${_fmtDate(due)}</span>`:'';
    return `<div class="task-item${done?' done':''}${hidden?' task-hidden':''}">
      <div class="task-check" onclick="event.stopPropagation();App._toggle('${t.id}','${t._lid}',${done})"></div>
      <div class="task-body" onclick="App._showTaskDetail('${t.id}','${t._lid}')">
        <div class="task-text">${hidden?'🙈 ':''}${esc(t.title)} ${dueStr}</div>
        ${t.notes?`<div class="task-notes">${esc(t.notes.slice(0,60))}${t.notes.length>60?'…':''}</div>`:''}
      </div>
      <button class="task-star${star?' starred':''}" onclick="event.stopPropagation();App._toggleStar('${t.id}','${t._lid}')"></button>
      <button class="task-hide-btn" onclick="event.stopPropagation();App._toggleHideTask('${t.id}','${t._lid}')" title="${hidden?'숨김 해제':'숨김'}">${hidden?'👁':'🙈'}</button>
      <button class="task-del" onclick="event.stopPropagation();App._delTask('${t.id}','${t._lid}')">✕</button>
    </div>`;
  },

  _toggleHideTask(taskId,listId){
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    t._hidden=!t._hidden;
    localStorage.setItem('gl_hidden_'+taskId, t._hidden?'1':'');
    this._renderTasks();
    this._updateStatsBanner();
  },

  _showTaskDetail(taskId, listId) {
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    const due=t.due?t.due.split('T')[0]:'';
    // 시간/반복은 localStorage에 보조 저장
    const extra=JSON.parse(localStorage.getItem('gl_task_extra_'+taskId)||'{}');
    const listOptions=this.S.lists.map(l=>`<option value="${l.id}"${l.id===listId?' selected':''}>${esc(l.title)}</option>`).join('');
    const repeatOpts=['없음','매일','매주','매월','매년'].map(v=>`<option${extra.repeat===v?' selected':''}>${v}</option>`).join('');
    this.openModal('📋 세부정보',`
      <div class="modal-row"><label class="modal-lbl">제목</label>
        <input id="tdTitle" type="text" value="${esc(t.title)}" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">메모</label>
        <textarea id="tdNotes" class="inp" rows="3">${esc(t.notes||'')}</textarea></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">마감 날짜</label>
          <input id="tdDue" type="date" value="${due}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">시간 (선택)</label>
          <input id="tdTime" type="time" value="${extra.time||''}" class="inp inp-sm"></div>
      </div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">반복</label>
          <select id="tdRepeat" class="inp inp-sm">${repeatOpts}</select></div>
        <div><label class="modal-lbl">목록 이동</label>
          <select id="tdList" class="inp inp-sm">${listOptions}</select></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
        수정: ${t.updated?new Date(t.updated).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'}):''}
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
    const time =document.getElementById('tdTime')?.value||'';
    const repeat=document.getElementById('tdRepeat')?.value||'없음';
    const newListId=document.getElementById('tdList')?.value||listId;
    if(!title){ this.showToast('제목을 입력해주세요','error'); return; }
    // 시간/반복은 localStorage 보조 저장
    localStorage.setItem('gl_task_extra_'+taskId, JSON.stringify({time,repeat}));
    try{
      if(newListId!==listId){
        const created=await GoogleTasks.moveTask(listId,newListId,taskId,title,notes,due);
        created.starred=localStorage.getItem('gl_star_'+taskId)==='1';
        if(!this.S.tasks[newListId]) this.S.tasks[newListId]=[];
        this.S.tasks[newListId].unshift(created);
        this.S.tasks[listId]=this.S.tasks[listId]?.filter(t=>t.id!==taskId);
      } else {
        const updated=await GoogleTasks.updateTask(listId,taskId,{title,notes,due});
        const t=this.S.tasks[listId]?.find(x=>x.id===taskId);
        if(t) Object.assign(t,{title,notes:notes||'',due:updated.due||null});
      }
      this._renderTasks();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this.closeModal(); this.showToast('저장됨 ✓','success');
      this._updateStatsBanner();
    }catch(e){ this.showToast('저장 실패: '+e.message,'error'); }
  },

  async _toggle(taskId,listId,done){
    try{
      await GoogleTasks.toggleTask(listId,taskId,!done);
      const t=this.S.tasks[listId]?.find(x=>x.id===taskId);
      if(t){ t.status=!done?'completed':'needsAction'; t.completed=!done?new Date().toISOString():null; }
      this._renderTasks();
      this._updateStatsBanner();
      !done?Sounds?.check():Sounds?.uncheck();
      this.showToast(!done?'완료! ✓':'다시 할일로','success');
    }catch{ this.showToast('업데이트 실패','error'); }
  },

  _toggleStar(taskId,listId){
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    t.starred=!t.starred;
    t.starred?localStorage.setItem('gl_star_'+taskId,'1'):localStorage.removeItem('gl_star_'+taskId);
    this._renderTasks();
  },

  async _delTask(taskId,listId){
    if(!confirm('삭제하시겠습니까?')) return;
    try{
      await GoogleTasks.deleteTask(listId,taskId);
      this.S.tasks[listId]=this.S.tasks[listId]?.filter(t=>t.id!==taskId);
      this._renderTasks();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      Sounds?.delete();
      this.showToast('삭제됨','success');
      this._updateStatsBanner();
    }catch{ this.showToast('삭제 실패','error'); }
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
    try{
      const task=await GoogleTasks.createTask(listId,title,due||null);
      task.starred=false;
      if(!this.S.tasks[listId]) this.S.tasks[listId]=[];
      this.S.tasks[listId].unshift(task);
      this._renderTasks();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      document.getElementById('taskInput').value='';
      document.getElementById('taskDue').value='';
      this._showTaskForm(false);
      this.showToast('할일 추가됨 ✓','success');
      this._updateStatsBanner();
    }catch{ this.showToast('추가 실패','error'); }
  },

  // ── 프로필 메뉴 ──────────────────────
  toggleProfileMenu() {
    const menu=document.getElementById('profileMenu');
    if(!menu) return;
    menu.classList.toggle('hidden');
    // 프로필 아이콘 위치 기준으로 메뉴 위치 설정
    if(!menu.classList.contains('hidden')){
      const hUser=document.getElementById('hUser');
      if(hUser){
        const rect=hUser.getBoundingClientRect();
        menu.style.top=(rect.bottom+4)+'px';
        menu.style.right=(window.innerWidth-rect.right)+'px';
        menu.style.left='auto';
      }
    }
    setTimeout(()=>{
      const close=(e)=>{ if(!e.target.closest('#hUser')&&!e.target.closest('#profileMenu')){ menu.classList.add('hidden'); document.removeEventListener('click',close); } };
      document.addEventListener('click',close);
    },0);
  },

  // ── 다크 모드 ─────────────────────────
  get _darkMode(){ return localStorage.getItem('gl_dark')==='true'; },
  set _darkMode(v){ localStorage.setItem('gl_dark',v?'true':'false'); },

  initDarkMode() {
    if(this._darkMode) document.documentElement.classList.add('dark');
    this._updateDarkLabel();
    setTimeout(()=>this._updateSoundLabel(),100);
  },

  toggleDarkMode() {
    this._darkMode=!this._darkMode;
    document.documentElement.classList.toggle('dark',this._darkMode);
    this._updateDarkLabel();
    document.getElementById('profileMenu')?.classList.add('hidden');
  },

  toggleSound() {
    if(typeof Sounds!=='undefined'){
      Sounds.enabled=!Sounds.enabled;
      const el=document.getElementById('soundLabel');
      if(el) el.textContent=Sounds.enabled?'🔔 사운드 켜짐':'🔕 사운드 꺼짐';
      if(Sounds.enabled) Sounds.click();
    }
    document.getElementById('profileMenu')?.classList.add('hidden');
  },

  _updateSoundLabel() {
    const el=document.getElementById('soundLabel');
    if(el&&typeof Sounds!=='undefined') el.textContent=Sounds.enabled?'🔔 사운드 켜짐':'🔕 사운드 꺼짐';
  },

  _updateDarkLabel() {
    const el=document.getElementById('darkModeLabel');
    if(el) el.textContent=this._darkMode?'☀️ 라이트 모드':'🌙 다크 모드';
  },

  _showCatColorPicker(listId, listName) {
    const catColors=JSON.parse(localStorage.getItem('gl_cat_colors')||'{}');
    const cur=catColors[listId]||'';
    const colors=['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#64748b',''];
    App.openModal(`🎨 "${listName}" 색상`,`
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px">카테고리 배경 색상을 선택하세요.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${colors.map(c=>c
          ?`<div onclick="App._saveCatColor('${listId}','${c}')" style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===cur?'var(--text)':'transparent'}"></div>`
          :`<div onclick="App._saveCatColor('${listId}','')" style="width:32px;height:32px;border-radius:50%;background:var(--bg);border:2px dashed var(--border2);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px">✕</div>`
        ).join('')}
      </div>
      <div class="modal-btns"><button onclick="App.closeModal()" class="btn-sm">닫기</button></div>`);
  },

  _saveCatColor(listId, color) {
    const catColors=JSON.parse(localStorage.getItem('gl_cat_colors')||'{}');
    if(color) catColors[listId]=color; else delete catColors[listId];
    localStorage.setItem('gl_cat_colors',JSON.stringify(catColors));
    this._buildTaskFilters();
    this._renderTasks();
    App.closeModal();
  },

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
