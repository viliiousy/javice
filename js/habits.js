// js/habits.js — 습관 트래커 (요일 스케줄 + 날짜별 기록 + 인라인 추가)

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

  getList() {
    return JSON.parse(localStorage.getItem('gl_habits_list') || JSON.stringify(this.DEFAULTS));
  },
  saveList(v) { localStorage.setItem('gl_habits_list', JSON.stringify(v)); },

  _dateKey(date) {
    return `gl_habits_${new Date(date).toDateString()}`;
  },
  getChecked(date = new Date()) {
    return JSON.parse(localStorage.getItem(this._dateKey(date)) || '[]');
  },
  setChecked(v, date = new Date()) {
    localStorage.setItem(this._dateKey(date), JSON.stringify(v));
  },

  // 해당 날짜의 요일에 맞는 습관만 필터
  getHabitsForDate(date = new Date()) {
    const dow = new Date(date).getDay();
    return this.getList().filter(h => {
      if (!h.days || h.days.length === 0) return true;
      return h.days.includes(dow);
    });
  },

  streak(id) {
    let n = 0;
    const today = new Date();
    for (let i = 0; i <= 365; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      // 해당 날짜에 이 습관이 예정되어 있었는지 확인
      const dow = d.getDay();
      const h = this.getList().find(x => x.id === id);
      if (h && h.days && !h.days.includes(dow)) continue; // 예정 없는 날은 스킵
      const chk = this.getChecked(d);
      if (!chk.includes(id)) break;
      n++;
    }
    return n;
  },

  init(date = new Date()) { this.render(date); },

  render(date = new Date()) {
    const list    = this.getHabitsForDate(date);
    const chk     = this.getChecked(date);
    const isToday = new Date(date).toDateString() === new Date().toDateString();
    const done    = list.filter(h => chk.includes(h.id)).length;

    // 카드 타이틀 변경
    const titleEl = document.querySelector('.card-habits .card-title');
    if (titleEl) {
      if (isToday) {
        titleEl.textContent = '✅ 오늘의 습관';
      } else {
        const ds = new Date(date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
        titleEl.textContent = `✅ ${ds} 습관`;
      }
    }

    const habitsHTML = list.map(h => {
      const isDone = chk.includes(h.id);
      const st = this.streak(h.id);
      const daysLabel = (h.days && h.days.length < 7)
        ? `<span class="habit-days">${h.days.map(d=>this.DAYS_KO[d]).join('')}</span>` : '';
      return `<div class="habit-item${isDone?' done':''}" onclick="Habits.toggle('${h.id}',${isToday?'null':'new Date(\''+new Date(date).toDateString()+'\')'})" style="${!isToday?'cursor:default':''}">
        <div class="habit-chk">${isDone?'✓':''}</div>
        <span class="habit-emoji">${h.emoji}</span>
        <span class="habit-name">${esc(h.name)}${daysLabel}</span>
        ${st>0?`<span class="habit-streak">🔥${st}</span>`:''}
        ${isToday?`<button class="task-del" onclick="event.stopPropagation();Habits._del('${h.id}')">✕</button>`:''}
      </div>`;
    }).join('');

    // 인라인 추가 버튼 (오늘만 표시)
    const addBtn = isToday ? `<div class="habit-add-btn" onclick="Habits.showInlineAdd()">+ 습관 추가</div>` : '';

    document.getElementById('habitsWrap').innerHTML = habitsHTML + addBtn;
    document.getElementById('habitsFooter').innerHTML =
      `${isToday?'오늘':'해당 날짜'} <strong>${done} / ${list.length}</strong> 완료 ${done===list.length&&list.length>0?'🏆 퍼펙트!':''}`;
  },

  toggle(id, date = null) {
    const d = date || new Date();
    if (new Date(d).toDateString() !== new Date().toDateString()) return; // 과거 편집 불가
    const chk = this.getChecked(d);
    const i = chk.indexOf(id);
    if (i===-1) chk.push(id); else chk.splice(i,1);
    this.setChecked(chk, d);
    this.render(d);
  },

  _del(id) {
    if (!confirm('이 습관을 삭제하시겠습니까?\n과거 기록은 유지됩니다.')) return;
    this.saveList(this.getList().filter(h=>h.id!==id));
    this.render();
  },

  showInlineAdd() {
    App.openModal('✅ 습관 추가', `
      <div class="modal-row">
        <label class="modal-lbl">이름 *</label>
        <input id="hName" type="text" placeholder="예: 물 2L 마시기" class="inp">
      </div>
      <div class="modal-row">
        <label class="modal-lbl">이모지</label>
        <input id="hEmoji" type="text" placeholder="💧" class="inp" style="width:80px" maxlength="2">
      </div>
      <div class="modal-row">
        <label class="modal-lbl">반복 요일</label>
        <div class="day-picker">
          ${this.DAYS_KO.map((d,i)=>`
            <label class="day-pick-btn">
              <input type="checkbox" value="${i}" checked class="day-chk"> ${d}
            </label>`).join('')}
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">※ 과거 기록에는 영향 없이 오늘부터 적용됩니다</div>
      <div class="modal-btns">
        <button onclick="Habits._saveNew()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('hName')?.focus(),50);
  },

  _saveNew() {
    const name = document.getElementById('hName')?.value.trim();
    if (!name) { App.showToast('이름을 입력해주세요','error'); return; }
    const emoji = document.getElementById('hEmoji')?.value.trim() || '✅';
    const days = [...document.querySelectorAll('.day-chk:checked')].map(c=>parseInt(c.value));
    const list = this.getList();
    list.push({ id:'h'+Date.now(), name, emoji, days: days.length?days:[0,1,2,3,4,5,6] });
    this.saveList(list);
    this.render();
    App.closeModal();
    App.showToast('습관 추가됨 ✓','success');
  },

  showManageModal() {
    // 설정에서도 관리 가능
    const list = this.getList();
    App.openModal('⚙️ 습관 관리', `
      <div id="habitManageList">
        ${list.map((h,i)=>`
          <div class="habit-manage-item">
            <input type="text" value="${h.emoji}" class="inp" id="hEm${i}" style="width:44px;text-align:center">
            <input type="text" value="${esc(h.name)}" class="inp inp-sm" id="hNm${i}" style="flex:1">
            <button class="btn-danger" onclick="Habits._del('${h.id}')">삭제</button>
          </div>`).join('')}
      </div>
      <button onclick="Habits.showInlineAdd()" class="btn-sm" style="width:100%;padding:8px;margin-top:8px">+ 습관 추가</button>
      <div class="modal-btns" style="margin-top:10px">
        <button onclick="Habits._saveManage()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },

  _saveManage() {
    const list = this.getList();
    list.forEach((h,i)=>{
      h.emoji = document.getElementById(`hEm${i}`)?.value.trim() || h.emoji;
      h.name  = document.getElementById(`hNm${i}`)?.value.trim() || h.name;
    });
    this.saveList(list);
    this.render();
    App.closeModal();
    App.showToast('저장됨 ✓','success');
  },
};
