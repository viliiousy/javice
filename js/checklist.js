// js/checklist.js — 체크리스트 (계정별 + 모바일 스와이프)

const Checklist = {
  _key() { return 'gl_checklist_v2'; },
  getItems() { return JSON.parse(UserStore.get(this._key())||'[]'); },
  saveItems(v) { UserStore.set(this._key(), JSON.stringify(v)); },

  getItemsForDate(date) {
    const d=new Date(date); d.setHours(0,0,0,0);
    return this.getItems().filter(i=>{
      if(!i.dueDate) return false;
      const id=new Date(i.dueDate+'T00:00:00'); id.setHours(0,0,0,0);
      return id.getTime()===d.getTime();
    });
  },

  render() {
    const wrap=document.getElementById('checklistWrap'); if(!wrap) return;
    const items=this.getItems();
    const today=new Date(); today.setHours(0,0,0,0);

    const sorted=[...items].sort((a,b)=>{
      if(a.done!==b.done) return a.done?1:-1;
      const da=a.dueDate?new Date(a.dueDate+'T00:00:00'):new Date('9999');
      const db=b.dueDate?new Date(b.dueDate+'T00:00:00'):new Date('9999');
      return da-db;
    });

    wrap.innerHTML=sorted.map(item=>{
      const due=item.dueDate?new Date(item.dueDate+'T00:00:00'):null;
      const dueValid=due&&!isNaN(due.getTime());
      if(dueValid) due.setHours(0,0,0,0);
      const overdue=dueValid&&!item.done&&due<today;
      const dueStr=dueValid?due.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}):'';

      return `<div class="cl-item${item.done?' done':''}" data-id="${item.id}"
          draggable="true"
          ondragstart="Checklist._dragStart(event,'${item.id}')"
          ondragover="Checklist._dragOver(event)"
          ondrop="Checklist._drop(event,'${item.id}')"
          ondragend="Checklist._dragEnd(event)"
          ontouchstart="Checklist._touchStart(event,'${item.id}')"
          ontouchmove="Checklist._touchMove(event)"
          ontouchend="Checklist._touchEnd(event,'${item.id}')">
        <div class="cl-drag"
          ontouchstart="Checklist._lpStart(event,'${item.id}')"
          ontouchend="Checklist._lpEnd()">⠿</div>
        <div class="cl-check" onclick="event.stopPropagation();Checklist.toggle('${item.id}')"></div>
        <div class="cl-body" onclick="Checklist._bodyTap('${item.id}')">
          <div class="cl-title">${esc(item.title)}</div>
          ${dueStr?`<div class="cl-due${overdue?' overdue':''}">${dueStr}</div>`:''}
        </div>
        <button class="cl-del-btn" onclick="event.stopPropagation();Checklist.remove('${item.id}')" title="삭제">✕</button>
      </div>`;
    }).join('')
    +`<div class="habit-add-btn" onclick="Checklist.showAdd()">+ 항목 추가</div>`;
  },

  // ── 터치 제스처 ───────────────────────
  _touchSX:0, _swiping:false, _lpTimer:null,
  _touchStart(e,id){ this._touchSX=e.touches[0].clientX; this._swiping=false; },
  _touchMove(e){
    const dx=Math.abs(e.touches[0].clientX-this._touchSX);
    if(dx>10){ this._swiping=true; e.preventDefault(); }
  },
  _touchEnd(e,id){
    if(this._swiping){
      const dx=e.changedTouches[0].clientX-this._touchSX;
      if(dx < -60){ this.remove(id); return; } // 왼쪽 스와이프 → 삭제
    }
  },
  _lpStart(e,id){ this._lpTimer=setTimeout(()=>Checklist.showEdit(id),600); },
  _lpEnd(){ clearTimeout(this._lpTimer); },

  _bodyTap(id) {
    // 모바일: 탭으로 바로 체크
    if(window.matchMedia('(max-width:640px)').matches){
      this.toggle(id);
    } else {
      this.showEdit(id);
    }
  },

  toggle(id) {
    const items=this.getItems();
    const it=items.find(i=>i.id===id);
    if(it){ it.done=!it.done; this.saveItems(items); this.render(); }
    if(typeof App!=='undefined') App._updateStatsBanner();
  },

  remove(id) {
    this.saveItems(this.getItems().filter(i=>i.id!==id));
    this.render();
    if(typeof App!=='undefined'){
      App._updateStatsBanner();
      CalendarUI.render(document.getElementById('miniCal'),App.S.calDate,App.S.events,App.S.selDate);
    }
  },

  showAdd() {
    App.openModal('✍️ 체크리스트 추가',`
      <div class="modal-row"><label class="modal-lbl">항목 *</label>
        <input id="clTitle" type="text" placeholder="항목 입력..." class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">마감 날짜 (선택)</label>
        <input id="clDue" type="date" value="" class="inp inp-sm"></div>
      <div class="modal-btns">
        <button onclick="Checklist._saveNew()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('clTitle')?.focus(),50);
  },

  _saveNew() {
    const title=document.getElementById('clTitle')?.value.trim();
    if(!title){ App.showToast('항목을 입력해주세요','error'); return; }
    const due=document.getElementById('clDue')?.value||null;
    const items=this.getItems();
    items.push({id:'cl_'+Date.now(),title,dueDate:due||null,done:false,createdAt:new Date().toISOString()});
    this.saveItems(items); this.render(); App.closeModal(); App.showToast('추가됨 ✓','success');
    App._updateStatsBanner();
    CalendarUI.render(document.getElementById('miniCal'),App.S.calDate,App.S.events,App.S.selDate);
  },

  showEdit(id) {
    const it=this.getItems().find(i=>i.id===id); if(!it) return;
    App.openModal('✍️ 항목 편집',`
      <div class="modal-row"><label class="modal-lbl">항목 *</label>
        <input id="clEditTitle" type="text" value="${esc(it.title)}" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">마감 날짜</label>
        <input id="clEditDue" type="date" value="${it.dueDate||''}" class="inp inp-sm"></div>
      <div class="modal-btns">
        <button onclick="Checklist._saveEdit('${id}')" class="btn-sm accent">저장</button>
        <button onclick="Checklist.remove('${id}');App.closeModal();" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('clEditTitle')?.focus(),50);
  },

  _saveEdit(id) {
    const title=document.getElementById('clEditTitle')?.value.trim();
    if(!title){ App.showToast('항목을 입력해주세요','error'); return; }
    const items=this.getItems();
    const it=items.find(i=>i.id===id);
    if(it){ it.title=title; it.dueDate=document.getElementById('clEditDue')?.value||null; }
    this.saveItems(items); this.render(); App.closeModal(); App.showToast('저장됨 ✓','success');
    CalendarUI.render(document.getElementById('miniCal'),App.S.calDate,App.S.events,App.S.selDate);
  },

  // ── 드래그 & 드롭 ─────────────────────
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
