// js/memo.js — 메모 (체크박스 없는 노트 목록)

const Memo = {
  _key() { return 'gl_memos_v1'; },
  getItems() { return JSON.parse(localStorage.getItem(this._key()) || '[]'); },
  saveItems(v) { localStorage.setItem(this._key(), JSON.stringify(v)); },

  render() {
    const wrap = document.getElementById('memoWrap');
    if (!wrap) return;
    const items = this.getItems();

    wrap.innerHTML = items.map(m => `
      <div class="memo-item" onclick="Memo.showEdit('${m.id}')">
        <div class="memo-title">${esc(m.title)}</div>
        ${m.content ? `<div class="memo-content">${esc(m.content)}</div>` : ''}
        <div class="memo-footer">
          <span class="memo-date">${_fmtMemoDate(m.updatedAt)}</span>
          <button class="task-del" onclick="event.stopPropagation();Memo.remove('${m.id}')">✕</button>
        </div>
      </div>`).join('')
    + `<div class="habit-add-btn" onclick="Memo.showAdd()">+ 메모 추가</div>`;
  },

  showAdd() {
    App.openModal('📝 메모 추가', `
      <div class="modal-row">
        <label class="modal-lbl">제목 *</label>
        <input id="mTitle" type="text" placeholder="메모 제목" class="inp">
      </div>
      <div class="modal-row">
        <label class="modal-lbl">내용 (선택)</label>
        <textarea id="mContent" placeholder="내용을 입력하세요..." class="inp" rows="5"></textarea>
      </div>
      <div class="modal-btns">
        <button onclick="Memo._saveNew()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(() => document.getElementById('mTitle')?.focus(), 50);
  },

  _saveNew() {
    const title = document.getElementById('mTitle')?.value.trim();
    if (!title) { App.showToast('제목을 입력해주세요', 'error'); return; }
    const items = this.getItems();
    items.unshift({
      id:        'memo_' + Date.now(),
      title,
      content:   document.getElementById('mContent')?.value.trim() || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.saveItems(items);
    this.render();
    App.closeModal();
    App.showToast('메모 저장됨 ✓', 'success');
  },

  showEdit(id) {
    const items = this.getItems();
    const m = items.find(x => x.id === id);
    if (!m) return;
    App.openModal('📝 메모 편집', `
      <div class="modal-row">
        <label class="modal-lbl">제목</label>
        <input id="mEditTitle" type="text" value="${esc(m.title)}" class="inp">
      </div>
      <div class="modal-row">
        <label class="modal-lbl">내용</label>
        <textarea id="mEditContent" class="inp" rows="7">${esc(m.content||'')}</textarea>
      </div>
      <div class="modal-btns">
        <button onclick="Memo._saveEdit('${id}')" class="btn-sm accent">저장</button>
        <button onclick="Memo.remove('${id}');App.closeModal();" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(() => document.getElementById('mEditTitle')?.focus(), 50);
  },

  _saveEdit(id) {
    const title = document.getElementById('mEditTitle')?.value.trim();
    if (!title) { App.showToast('제목을 입력해주세요', 'error'); return; }
    const items = this.getItems();
    const m = items.find(x => x.id === id);
    if (m) {
      m.title     = title;
      m.content   = document.getElementById('mEditContent')?.value.trim() || '';
      m.updatedAt = new Date().toISOString();
      this.saveItems(items);
      this.render();
    }
    App.closeModal();
    App.showToast('메모 수정됨 ✓', 'success');
  },

  remove(id) {
    this.saveItems(this.getItems().filter(m => m.id !== id));
    this.render();
  },
};

function _fmtMemoDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month:'short', day:'numeric' })
    + ' ' + d.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', hour12:false });
}
