// js/memo.js — 메모 (최대 3줄 미리보기 + 드래그 정렬)

const Memo = {
  _key(){ return 'gl_memos_v1'; },
  getItems(){ return JSON.parse(UserStore.get(this._key())||'[]'); },
  saveItems(v){ UserStore.set(this._key(), JSON.stringify(v)); },

  render(){
    const wrap=document.getElementById('memoWrap'); if(!wrap) return;
    const items=this.getItems();

    wrap.innerHTML=items.map(m=>{
      // 내용을 최대 3줄로 자르기 (줄바꿈 유지)
      const lines=(m.content||'').split('\n').filter(l=>l.trim()!=='');
      const preview=lines.slice(0,3).map(l=>esc(l)).join('<br>');
      const hasMore=lines.length>3;

      return `<div class="memo-item${Memo._reorderMode?' reorder-mode':''}"
          data-reorderable="${m.id}"
          onclick="${Memo._reorderMode?'void(0)':"Memo.showEdit('" + m.id + "')"}">
        ${Memo._reorderMode?'<div class="memo-drag-hint">⠿</div>':''}
        <div class="memo-content-wrap">
          <div class="memo-title">${esc(m.title)}</div>
          ${preview?`<div class="memo-preview">${preview}${hasMore?'<span class="memo-more">…</span>':''}</div>`:''}
        </div>
        <div class="memo-right">
          <button class="cl-del-btn" onclick="event.stopPropagation();Memo.remove('${m.id}')" title="삭제">✕</button>
          <div class="memo-date">${_fmtMemoDate(m.updatedAt)}</div>
        </div>
      </div>`;
    }).join('')
    +`<div class="habit-add-btn" onclick="Memo.showAdd()">+ 메모 추가</div>`;
  },

  showAdd(){
    App.openModal('📝 메모 추가',`
      <div class="modal-row"><label class="modal-lbl">제목 *</label>
        <input id="mTitle" type="text" placeholder="제목" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">내용 (선택)</label>
        <textarea id="mContent" placeholder="내용..." class="inp" rows="5"></textarea></div>
      <div class="modal-btns">
        <button onclick="Memo._saveNew()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('mTitle')?.focus(),50);
  },

  _saveNew(){
    const title=document.getElementById('mTitle')?.value.trim();
    if(!title){ App.showToast('제목을 입력해주세요','error'); return; }
    const items=this.getItems();
    items.unshift({id:'memo_'+Date.now(),title,
      content:document.getElementById('mContent')?.value||'',
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    this.saveItems(items); this.render(); App.closeModal(); App.showToast('메모 저장됨 ✓','success');
  },

  showEdit(id){
    const m=this.getItems().find(x=>x.id===id); if(!m) return;
    App.openModal('📝 메모 편집',`
      <div class="modal-row"><label class="modal-lbl">제목</label>
        <input id="mEditTitle" type="text" value="${esc(m.title)}" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">내용</label>
        <textarea id="mEditContent" class="inp" rows="8">${esc(m.content||'')}</textarea></div>
      <div class="modal-btns">
        <button onclick="Memo._saveEdit('${id}')" class="btn-sm accent">저장</button>
        <button onclick="Memo.remove('${id}');App.closeModal();" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('mEditTitle')?.focus(),50);
  },

  _saveEdit(id){
    const title=document.getElementById('mEditTitle')?.value.trim();
    if(!title){ App.showToast('제목을 입력해주세요','error'); return; }
    const items=this.getItems();
    const m=items.find(x=>x.id===id);
    if(m){ m.title=title; m.content=document.getElementById('mEditContent')?.value||''; m.updatedAt=new Date().toISOString(); }
    this.saveItems(items); this.render(); App.closeModal(); App.showToast('수정됨 ✓','success');
  },

  remove(id){
    if(!confirm('메모를 삭제하시겠습니까?')) return;
    this.saveItems(this.getItems().filter(m=>m.id!==id)); this.render(); FirebaseSync?.scheduleSave();
  },

  _reorderMode: false,
  toggleReorderMode() {
    this._reorderMode = !this._reorderMode;
    const btn = document.getElementById('btnMemoReorder');
    if(btn) {
      btn.style.background = this._reorderMode ? 'var(--accent)' : '';
      btn.style.color      = this._reorderMode ? 'white' : '';
    }
    this.render();
    if(this._reorderMode && typeof Reorder !== 'undefined') {
      setTimeout(() => {
        const wrap = document.getElementById('memoWrap');
        if(wrap) Reorder.enable(wrap, (newOrder) => {
          const items  = this.getItems();
          const sorted = newOrder.map(id => items.find(i=>i.id===id)).filter(Boolean);
          items.forEach(i => { if(!sorted.find(x=>x.id===i.id)) sorted.push(i); });
          this.saveItems(sorted);
          this.render();
          Sounds?.click();
        });
      }, 80);
    }
  },

  _moveUp(id){
    const items=this.getItems(); const i=items.findIndex(x=>x.id===id); if(i<=0) return;
    [items[i-1],items[i]]=[items[i],items[i-1]];
    this.saveItems(items); this.render(); Sounds?.click();
  },
  _moveDown(id){
    const items=this.getItems(); const i=items.findIndex(x=>x.id===id); if(i>=items.length-1) return;
    [items[i],items[i+1]]=[items[i+1],items[i]];
    this.saveItems(items); this.render(); Sounds?.click();
  },
};

function _fmtMemoDate(iso){
  if(!iso) return '';
  const d=new Date(iso);
  return d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
    +' '+d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
}
