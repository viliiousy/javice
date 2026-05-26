// js/habits.js — 습관 트래커 (계정별 분리 + 모바일 스와이프)

const Habits = {
  DEFAULTS: [
    { id:'h1', name:'기상 (목표 시간)', emoji:'⏰', days:[0,1,2,3,4,5,6] },
    { id:'h2', name:'물 2L 마시기',    emoji:'💧', days:[0,1,2,3,4,5,6] },
    { id:'h3', name:'운동 완료',       emoji:'💪', days:[0,1,2,3,4,5,6] },
    { id:'h4', name:'단백질 목표',     emoji:'🥩', days:[0,1,2,3,4,5,6] },
    { id:'h5', name:'독서 30분',       emoji:'📚', days:[0,1,2,3,4,5,6] },
    { id:'h6', name:'스트레칭',        emoji:'🧘', days:[0,1,2,3,4,5,6] },
  ],
  DAYS_KO: ['일','월','화','수','목','금','토'],

  _lk(k) { return UserStore.key(k); },

  getList() {
    const v = UserStore.get('gl_habits_list');
    return JSON.parse(v || JSON.stringify(this.DEFAULTS));
  },
  saveList(v) { UserStore.set('gl_habits_list', JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  _dateStr(date) {
    const d=new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _dateKey(date) { return `gl_habits_${this._dateStr(date)}`; },
  getChecked(date=new Date()) { return JSON.parse(UserStore.get(this._dateKey(date))||'[]'); },
  setChecked(v,date=new Date()) { UserStore.set(this._dateKey(date), JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  getHabitsForDate(date=new Date()) {
    const dow     = new Date(date).getDay();
    const dateStr = this._dateStr(date);
    return this.getList().filter(h => {
      if(h.createdAt  && dateStr < h.createdAt)  return false; // 생성 전
      if(h.deletedFrom && dateStr >= h.deletedFrom) return false; // 삭제 후
      return !h.days || h.days.length===0 || h.days.includes(dow);
    });
  },

  streak(id) {
    let n=0; const today=new Date();
    for(let i=0;i<=365;i++){
      const d=new Date(today); d.setDate(today.getDate()-i);
      const h=this.getList().find(x=>x.id===id);
      if(h&&h.days&&!h.days.includes(d.getDay())) continue;
      const chk=this.getChecked(d);
      if(!chk.includes(id)) break;
      n++;
    }
    return n;
  },

  init(date=new Date()) { this.render(date); },

  render(date=new Date()) {
    const wrap=document.getElementById('habitsWrap'); if(!wrap) return;
    const list=this.getHabitsForDate(date);
    const chk=this.getChecked(date);
    const isToday=this._dateStr(date)===this._dateStr(new Date());
    const done=list.filter(h=>chk.includes(h.id)).length;

    const titleEl=document.querySelector('.card-habits .card-title');
    if(titleEl) titleEl.textContent=isToday?'✅ 오늘의 습관':`✅ ${new Date(date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})} 습관`;

    wrap.innerHTML=list.map(h=>{
      const isDone=chk.includes(h.id);
      const st=this.streak(h.id);
      const _d = h.days||[];
      let daysLabel = '';
      if(_d.length===7 || _d.length===0) daysLabel='<span class="habit-days">매일</span>';
      else if(_d.length===5&&[1,2,3,4,5].every(x=>_d.includes(x))) daysLabel='<span class="habit-days">평일</span>';
      else if(_d.length===2&&[0,6].every(x=>_d.includes(x))) daysLabel='<span class="habit-days">주말</span>';
      else daysLabel=`<span class="habit-days">${_d.map(d=>this.DAYS_KO[d]).join('')}</span>`;
      const idx=list.indexOf(h);
      return `<div class="habit-item${isDone?' done':''}${Habits._reorderMode?' reorder-mode':''}"
        data-reorderable="${h.id}"
        onclick="Habits._handleTap('${h.id}','${Habits._dateStr(date)}')">
        ${Habits._reorderMode?`<div class="reorder-handle" onclick="event.stopPropagation()" title="꾹 눌러서 순서 변경">⠿</div>`:''}
        <div class="habit-chk">${isDone?'✓':''}</div>
        <span class="habit-name">${esc(h.name)}${daysLabel}</span>
        ${st>0&&!Habits._reorderMode?`<span class="habit-streak">🔥${st}</span>`:''}
        ${Habits._reorderMode?`<button class="cl-del-btn edit-del-btn" onclick="event.stopPropagation();Habits._delFrom('${h.id}','${Habits._dateStr(date)}')" title="삭제">✕</button>`:''}
      </div>`;
    }).join('')
    +`<div class="habit-add-btn" onclick="Habits.showInlineAdd(App?.S?.selDate)">+ 습관 추가</div>`;

    document.getElementById('habitsFooter').innerHTML=`${isToday?'오늘':'해당 날짜'} <strong>${done}/${list.length}</strong> 완료 ${done===list.length&&list.length>0?'🏆 퍼펙트!':''}`;
  },

  // ── 탭/클릭 ──────────────────────────
  _touchSX:0, _touchSY:0, _lpTimer:null, _swiping:false,

  _touchStart(e,id) {
    this._touchSX=e.touches[0].clientX;
    this._touchSY=e.touches[0].clientY;
    this._swiping=false;
  },
  _touchMove(e) {
    const dx=Math.abs(e.touches[0].clientX-this._touchSX);
    const dy=Math.abs(e.touches[0].clientY-this._touchSY);
    if(dx>10) { this._swiping=true; e.preventDefault(); }
  },
  _touchEnd(e,id,dateStr) {
    if(this._swiping) {
      const dx=e.changedTouches[0].clientX-this._touchSX;
      if(dx < -60) { this._delFrom(id, dateStr); return; } // 왼쪽 스와이프 → 소프트 삭제 (오늘부터)
    }
  },
  _lpStart(e,id,dateStr) {
    // 왼쪽 드래그 핸들 꾹 누르기 → 편집
    this._lpTimer=setTimeout(()=>{ Habits.showEditHabit(id); },600);
  },
  _handleTap(id,dateStr) {
    if(this._swiping) return;
    const date=new Date(dateStr+'T00:00:00');
    const chk=this.getChecked(date);
    const i=chk.indexOf(id);
    const willBeChecked=(i===-1); // push 전에 미리 판단
    if(i===-1) chk.push(id); else chk.splice(i,1);
    this.setChecked(chk,date);
    this.render(date);
    if(typeof App!=='undefined') App._updateStatsBanner();
    if(willBeChecked){
      Sounds?.check();
      // 퍼펙트 달성 체크
      const newChk=this.getChecked(date);
      const todayList=this.getHabitsForDate(date);
      if(todayList.length>0&&todayList.every(h=>newChk.includes(h.id))) setTimeout(()=>Sounds?.achieve(),200);
    } else { Sounds?.uncheck(); }
  },

  toggle(id,date=new Date()) {
    const chk=this.getChecked(date);
    const i=chk.indexOf(id);
    if(i===-1) chk.push(id); else chk.splice(i,1);
    const isDoneNow=!chk.includes(id);
    this.setChecked(chk,date);
    this.render(date);
    if(typeof App!=='undefined') App._updateStatsBanner();
    if(isDoneNow){
      Sounds?.check();
      // 퍼펙트 달성 체크
      const newChk=this.getChecked(date);
      const todayList=this.getHabitsForDate(date);
      if(todayList.length>0&&todayList.every(h=>newChk.includes(h.id))) setTimeout(()=>Sounds?.achieve(),200);
    } else { Sounds?.uncheck(); }
  },

  _reorderMode: false,

  toggleReorderMode() {
    this._reorderMode = !this._reorderMode;
    const btn = document.getElementById('btnHabitReorder');
    if (btn) {
      btn.style.background = this._reorderMode ? 'var(--accent)' : '';
      btn.style.color = this._reorderMode ? 'white' : '';
    }
    // 현재 선택된 날짜 컨텍스트 유지 (App.S.selDate가 없으면 오늘)
    this.render(App?.S?.selDate || new Date());
    if (this._reorderMode) {
      // render 후 Reorder 모듈 활성화
      setTimeout(() => {
        const wrap = document.getElementById('habitsWrap');
        if (wrap && typeof Reorder !== 'undefined') {
          Reorder.enable(wrap, (newOrder) => {
            const list = this.getList();
            const sorted = newOrder.map(id => list.find(h => h.id === id)).filter(Boolean);
            // 순서에 없는 항목 뒤에 추가
            list.forEach(h => { if (!sorted.find(x => x.id === h.id)) sorted.push(h); });
            this.saveList(sorted);
            Sounds?.click();
          });
        }
      }, 50);
    }
  },

  _del(id) {
    // _del은 _delFrom(소프트 삭제)으로 대체됨 — 직접 호출 시 오늘 날짜로 소프트 삭제
    this._delFrom(id, this._dateStr(new Date()));
  },

  _delFrom(id, dateStr) {
    const today  = this._dateStr(new Date());
    const list   = this.getList();
    const h      = list.find(x=>x.id===id);
    if(!h) return;

    // 삭제 기준일 = 선택한 날짜(dateStr) 기준
    // 단, 선택 날짜가 과거라면 과거 날짜부터 삭제 (그 날짜 이후로 숨겨짐)
    const deleteFrom = dateStr || today;
    const isPast = deleteFrom < today;
    const isFuture = deleteFrom > today;
    let msg;
    if (isPast) {
      msg = `이 습관을 ${deleteFrom}부터 삭제하시겠습니까?\n(해당 날짜 이후 기록은 삭제되고 이전 기록은 유지됩니다)`;
    } else if (isFuture) {
      msg = `이 습관을 ${deleteFrom}부터 삭제하시겠습니까?\n(해당 날짜 이전 기록은 유지됩니다)`;
    } else {
      msg = '이 습관을 삭제하시겠습니까?\n(오늘부터 숨겨집니다. 과거 기록은 유지됩니다)';
    }
    if(!confirm(msg)) return;
    Sounds?.delete();

    // deletedFrom = 선택한 날짜 (해당 날짜부터 안 보임, 이전 기록 보존)
    h.deletedFrom = deleteFrom;
    this.saveList(list);
    // 현재 보던 날짜 컨텍스트를 유지해서 렌더링 (오늘로 점프하지 않음)
    const renderDate = new Date(dateStr + 'T00:00:00');
    this.render(isNaN(renderDate.getTime()) ? new Date() : renderDate);
    FirebaseSync?.scheduleSave();
    const label = deleteFrom === today ? '오늘' : deleteFrom;
    App.showToast(`습관 삭제됨 (${label}부터)`, 'success');
  },

  _moveUp(idx) {
    const list=this.getList(); if(idx<=0) return;
    [list[idx-1],list[idx]]=[list[idx],list[idx-1]];
    this.saveList(list); this.render(); Sounds?.click();
  },
  _moveDown(idx) {
    const list=this.getList(); if(idx>=list.length-1) return;
    [list[idx],list[idx+1]]=[list[idx+1],list[idx]];
    this.saveList(list); this.render(); Sounds?.click();
  },

  _pendingAddDate: null, // showInlineAdd 호출 시 기준 날짜 저장

  showInlineAdd(baseDate) {
    // baseDate 미전달 시 현재 선택된 날짜 사용, 없으면 오늘
    this._pendingAddDate = baseDate || App?.S?.selDate || new Date();
    const baseDateStr = this._dateStr(this._pendingAddDate);
    const today = this._dateStr(new Date());
    const dateLabel = baseDateStr !== today
      ? ` (${new Date(baseDateStr + 'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}부터)`
      : '';
    const dayBtns = this.DAYS_KO.map((d,i) =>
      '<label class="day-pick-btn">' +
      '<input type="checkbox" value="' + i + '" checked class="hday-chk"> ' + d +
      '</label>'
    ).join('');
    App.openModal('✅ 습관 추가',
      '<div class="modal-row"><label class="modal-lbl">습관 이름 *</label>' +
      '<input id="habitName" type="text" placeholder="예: 물 2L 마시기" class="inp"></div>' +
      '<div class="modal-row"><label class="modal-lbl">반복 요일</label>' +
      '<div class="day-picker">' + dayBtns + '</div></div>' +
      `<div style="font-size:11px;color:var(--text3);margin-bottom:8px">시작일: ${baseDateStr}${dateLabel}</div>` +
      '<div class="modal-btns" style="margin-top:10px">' +
      '<button id="btnHabitAdd" class="btn-sm accent">추가</button>' +
      '<button onclick="App.closeModal()" class="btn-sm">취소</button>' +
      '</div>'
    );
    setTimeout(()=>{
      document.getElementById('habitName')?.focus();
      document.getElementById('btnHabitAdd')?.addEventListener('click',()=>Habits._saveNew());
      document.getElementById('habitName')?.addEventListener('keypress',e=>{ if(e.key==='Enter') Habits._saveNew(); });
    },50);
  },

  _saveNew() {
    const name = document.getElementById('habitName')?.value.trim();
    if(!name){ App.showToast('이름을 입력해주세요','error'); return; }
    const days = [...document.querySelectorAll('.hday-chk:checked')].map(c=>parseInt(c.value));
    const list = this.getList();
    // 생성 기준일: 모달 열 때 기억해둔 날짜 (selDate) 사용, 없으면 오늘
    const createdAt = this._pendingAddDate
      ? this._dateStr(this._pendingAddDate)
      : this._dateStr(new Date());
    this._pendingAddDate = null;
    list.push({
      id: 'h'+Date.now(),
      name,
      emoji: '',
      days: days.length ? days : [0,1,2,3,4,5,6],
      createdAt,  // 선택한 날짜부터 습관 시작
    });
    this.saveList(list);
    // selDate 기준으로 렌더링
    const renderDate = App?.S?.selDate || new Date();
    this.render(renderDate);
    App.closeModal();
    App.showToast('습관 추가됨 ✓','success');
    FirebaseSync?.scheduleSave();
  },

  showEditHabit(id) {
    const h=this.getList().find(x=>x.id===id); if(!h) return;
    App.openModal('✅ 습관 편집',`
      <div class="modal-row"><label class="modal-lbl">이름</label>
        <input id="hEditName" type="text" value="${esc(h.name)}" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">이모지</label>
        <input id="hEditEmoji" type="text" value="${h.emoji}" class="inp" style="width:80px" maxlength="2"></div>
      <div class="modal-row"><label class="modal-lbl">반복 요일</label>
        <div class="day-picker">
          ${this.DAYS_KO.map((d,i)=>`<label class="day-pick-btn"><input type="checkbox" value="${i}" ${(h.days||[]).includes(i)?'checked':''} class="day-edit-chk"> ${d}</label>`).join('')}
        </div>
      </div>
      <div class="modal-btns">
        <button onclick="Habits._saveEdit('${id}')" class="btn-sm accent">저장</button>
        <button onclick="Habits._delFrom('${id}','${this._dateStr(App?.S?.selDate||new Date())}');App.closeModal();" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },

  _saveEdit(id) {
    const list=this.getList(); const h=list.find(x=>x.id===id); if(!h) return;
    h.name=document.getElementById('hEditName')?.value.trim()||h.name;
    h.emoji=document.getElementById('hEditEmoji')?.value.trim()||h.emoji;
    const days=[...document.querySelectorAll('.day-edit-chk:checked')].map(c=>parseInt(c.value));
    h.days=days.length?days:[0,1,2,3,4,5,6];
    this.saveList(list); this.render(); App.closeModal(); App.showToast('저장됨 ✓','success');
  },

  showManageModal() { this.showInlineAdd(); },
};
