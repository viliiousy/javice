// js/memo.js — 메모 (최대 3줄 미리보기 + 드래그 정렬)

const Memo = {
  _key(){ return 'gl_memos_v1'; },
  getItems(){ return JSON.parse(localStorage.getItem(this._key())||'[]'); },
  saveItems(v){ localStorage.setItem(this._key(),JSON.stringify(v)); },

  render(){
    const wrap=document.getElementById('memoWrap'); if(!wrap) return;
    const items=this.getItems();

    wrap.innerHTML=items.map(m=>{
      // 내용을 최대 3줄로 자르기 (줄바꿈 유지)
      const lines=(m.content||'').split('\n').filter(l=>l.trim()!=='');
      const preview=lines.slice(0,3).map(l=>esc(l)).join('<br>');
      const hasMore=lines.length>3;

      return `<div class="memo-item" draggable="true"
          ondragstart="Memo._dragStart(event,'${m.id}')"
          ondragover="Memo._dragOver(event)"
          ondrop="Memo._drop(event,'${m.id}')"
          ondragend="Memo._dragEnd(event)"
          onclick="Memo.showEdit('${m.id}')">
        <div class="memo-drag">⠿</div>
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
    this.saveItems(this.getItems().filter(m=>m.id!==id)); this.render();
  },

  _dragId:null,
  _dragStart(e,id){ this._dragId=id; e.currentTarget.classList.add('cl-dragging'); e.dataTransfer.effectAllowed='move'; },
  _dragOver(e){ e.preventDefault(); e.currentTarget.classList.add('cl-dragover'); },
  _drop(e,targetId){
    e.preventDefault(); e.currentTarget.classList.remove('cl-dragover');
    if(this._dragId===targetId) return;
    const items=this.getItems();
    const fi=items.findIndex(i=>i.id===this._dragId), ti=items.findIndex(i=>i.id===targetId);
    if(fi<0||ti<0) return;
    const [moved]=items.splice(fi,1); items.splice(ti,0,moved);
    this.saveItems(items); this.render();
  },
  _dragEnd(e){ e.currentTarget?.classList.remove('cl-dragging'); document.querySelectorAll('.cl-dragover').forEach(el=>el.classList.remove('cl-dragover')); this._dragId=null; },
};

function _fmtMemoDate(iso){
  if(!iso) return '';
  const d=new Date(iso);
  return d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})
    +' '+d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
}
