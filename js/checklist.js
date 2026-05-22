// js/checklist.js — 체크리스트 (삭제 버튼 + 하단 추가 버튼)

const Checklist = {
  _key() { return 'gl_checklist_v2'; },
  getItems() { return JSON.parse(localStorage.getItem(this._key()) || '[]'); },
  saveItems(v) { localStorage.setItem(this._key(), JSON.stringify(v)); },

  getItemsForDate(date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    return this.getItems().filter(i => {
      if (!i.dueDate) return false;
      const id = new Date(i.dueDate + 'T00:00:00'); id.setHours(0,0,0,0);
      return id.getTime() === d.getTime();
    });
  },

  render() {
    const wrap = document.getElementById('checklistWrap');
    if (!wrap) return; // 요소 없으면 조용히 종료
    const items = this.getItems();

    const today = new Date(); today.setHours(0,0,0,0);
    const sorted = [...items].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const da = a.dueDate ? new Date(a.dueDate+'T00:00:00') : new Date('9999');
      const db = b.dueDate ? new Date(b.dueDate+'T00:00:00') : new Date('9999');
      return da - db;
    });

    wrap.innerHTML = sorted.map(item => {
      const due = item.dueDate ? new Date(item.dueDate+'T00:00:00') : null;
      if (due) due.setHours(0,0,0,0);
      const overdue = due && !item.done && due < today;
      const dueStr  = due ? due.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}) : '';
      return `<div class="cl-item${item.done?' done':''}">
        <div class="cl-check" onclick="Checklist.toggle('${item.id}')"></div>
        <div class="cl-body">
          <div class="cl-title">${esc(item.title)}</div>
          ${dueStr?`<div class="cl-due${overdue?' overdue':''}">${dueStr}</div>`:''}
        </div>
        <button class="task-del" onclick="Checklist.remove('${item.id}')" title="삭제">✕</button>
      </div>`;
    }).join('')
    + `<div class="habit-add-btn" onclick="Checklist.showAdd()">+ 항목 추가</div>`;
  },

  toggle(id) {
    const items = this.getItems();
    const it = items.find(i => i.id === id);
    if (it) { it.done = !it.done; this.saveItems(items); this.render(); }
  },

  remove(id) {
    this.saveItems(this.getItems().filter(i => i.id !== id));
    this.render();
    if (typeof App !== 'undefined') {
      CalendarUI.render(document.getElementById('miniCal'), App.S.calDate, App.S.events, App.S.selDate);
    }
  },

  showAdd() {
    const today = new Date().toISOString().split('T')[0];
    App.openModal('✍️ 체크리스트 추가', `
      <div class="modal-row">
        <label class="modal-lbl">항목 *</label>
        <input id="clTitle" type="text" placeholder="항목 입력..." class="inp">
      </div>
      <div class="modal-row">
        <label class="modal-lbl">마감 날짜 (선택)</label>
        <input id="clDue" type="date" value="${today}" class="inp inp-sm">
      </div>
      <div class="modal-btns">
        <button onclick="Checklist._saveNew()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(() => document.getElementById('clTitle')?.focus(), 50);
  },

  _saveNew() {
    const title = document.getElementById('clTitle')?.value.trim();
    if (!title) { App.showToast('항목을 입력해주세요','error'); return; }
    const due = document.getElementById('clDue')?.value || null;
    const items = this.getItems();
    items.push({ id:'cl_'+Date.now(), title, dueDate:due, done:false, createdAt:new Date().toISOString() });
    this.saveItems(items);
    this.render();
    App.closeModal();
    App.showToast('추가됨 ✓','success');
    if (typeof App !== 'undefined') {
      CalendarUI.render(document.getElementById('miniCal'), App.S.calDate, App.S.events, App.S.selDate);
    }
  },
};
