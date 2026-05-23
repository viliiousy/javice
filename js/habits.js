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
  saveList(v) { UserStore.set('gl_habits_list', JSON.stringify(v)); },

  _dateKey(date) { const d=new Date(date); return `gl_habits_${d.toDateString()}`; },
  getChecked(date=new Date()) { return JSON.parse(UserStore.get(this._dateKey(date))||'[]'); },
  setChecked(v,date=new Date()) { UserStore.set(this._dateKey(date), JSON.stringify(v)); },

  getHabitsForDate(date=new Date()) {
    const dow=new Date(date).getDay();
    return this.getList().filter(h=>!h.days||h.days.length===0||h.days.includes(dow));
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
    const isToday=new Date(date).toDateString()===new Date().toDateString();
    const done=list.filter(h=>chk.includes(h.id)).length;

    const titleEl=document.querySelector('.card-habits .card-title');
    if(titleEl) titleEl.textContent=isToday?'✅ 오늘의 습관':`✅ ${new Date(date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})} 습관`;

    wrap.innerHTML=list.map(h=>{
      const isDone=chk.includes(h.id);
      const st=this.streak(h.id);
      const daysLabel=(h.days&&h.days.length<7)?`<span class="habit-days">${h.days.map(d=>this.DAYS_KO[d]).join('')}</span>`:'';
      return `<div class="habit-item${isDone?' done':''}"
        data-id="${h.id}"
        onclick="Habits._handleTap('${h.id}','${new Date(date).toDateString()}')"
        ontouchstart="Habits._touchStart(event,'${h.id}')"
        ontouchmove="Habits._touchMove(event)"
        ontouchend="Habits._touchEnd(event,'${h.id}','${new Date(date).toDateString()}')">
        <div class="habit-drag" onmousedown="Habits._dragStart(event,'${h.id}')" ontouchstart="Habits._lpStart(event,'${h.id}','${new Date(date).toDateString()}')">⠿</div>
        <div class="habit-chk">${isDone?'✓':''}</div>
        <span class="habit-emoji">${h.emoji}</span>
        <span class="habit-name">${esc(h.name)}${daysLabel}</span>
        ${st>0?`<span class="habit-streak">🔥${st}</span>`:''}
        ${isToday?`<button class="cl-del-btn" onclick="event.stopPropagation();Habits._del('${h.id}')">✕</button>`:''}
      </div>`;
    }).join('')
    +`<div class="habit-add-btn" onclick="Habits.showInlineAdd()">+ 습관 추가</div>`;

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
      if(dx < -60) { this._del(id); return; } // 왼쪽 스와이프 → 삭제
    }
  },
  _lpStart(e,id,dateStr) {
    // 왼쪽 드래그 핸들 꾹 누르기 → 편집
    this._lpTimer=setTimeout(()=>{ Habits.showEditHabit(id); },600);
  },
  _handleTap(id,dateStr) {
    if(this._swiping) return;
    const date=new Date(dateStr);
    const chk=this.getChecked(date);
    const i=chk.indexOf(id);
    if(i===-1) chk.push(id); else chk.splice(i,1);
    this.setChecked(chk,date);
    this.render(date);
    if(typeof App!=='undefined') App._updateStatsBanner();
  },

  toggle(id,date=new Date()) {
    const chk=this.getChecked(date);
    const i=chk.indexOf(id);
    if(i===-1) chk.push(id); else chk.splice(i,1);
    this.setChecked(chk,date);
    this.render(date);
    if(typeof App!=='undefined') App._updateStatsBanner();
  },

  _del(id) {
    if(!confirm('이 습관을 삭제하시겠습니까?')) return;
    this.saveList(this.getList().filter(h=>h.id!==id));
    this.render();
  },

  showInlineAdd() {
    App.openModal('✅ 습관 추가',`
      <div class="modal-row"><label class="modal-lbl">이름 *</label>
        <input id="hName" type="text" placeholder="예: 물 2L 마시기" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">이모지</label>
        <input id="hEmoji" type="text" placeholder="💧" class="inp" style="width:80px" maxlength="2"></div>
      <div class="modal-row"><label class="modal-lbl">반복 요일</label>
        <div class="day-picker">
          ${this.DAYS_KO.map((d,i)=>`<label class="day-pick-btn"><input type="checkbox" value="${i}" checked class="day-chk"> ${d}</label>`).join('')}
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">※ 오늘부터 적용, 과거 기록 유지</div>
      <div class="modal-btns">
        <button onclick="Habits._saveNew()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('hName')?.focus(),50);
  },

  _saveNew() {
    const name=document.getElementById('hName')?.value.trim();
    if(!name){ App.showToast('이름을 입력해주세요','error'); return; }
    const emoji=document.getElementById('hEmoji')?.value.trim()||'✅';
    const days=[...document.querySelectorAll('.day-chk:checked')].map(c=>parseInt(c.value));
    const list=this.getList();
    list.push({id:'h'+Date.now(),name,emoji,days:days.length?days:[0,1,2,3,4,5,6]});
    this.saveList(list); this.render(); App.closeModal(); App.showToast('습관 추가됨 ✓','success');
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
        <button onclick="Habits._del('${id}');App.closeModal();" class="btn-danger">삭제</button>
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
