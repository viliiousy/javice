// js/memo.js — 메모
//
// 예전엔 제목 한 줄과 평문 한 덩어리였다. 주소를 적어 두면 쓸 때마다 모달을 열고,
// 글자를 끌어서 골라, 복사하고, 닫았다. 네 동작이 한 동작이어야 했다.
//
// 그래서 세 가지를 바꿨다.
//   하나, 내용이 서식을 갖는다 — 굵게·밑줄·취소선, 글머리·번호·체크리스트, 들여쓰기.
//   둘,  긴 메모는 눌러서 펼친다. 읽으려고 편집창을 열 이유가 없다.
//   셋,  자주 쓰는 문구에는 복사칩을 단다. 칩은 제가 복사할 문구를 몸에 지니고 다녀서
//        메모 안 어디로 옮겨도 늘 같은 것을 복사한다.
//
// 저장은 HTML 로 한다. 남이 쓴 HTML 이 아니라 내가 쓴 것이지만, 파이어베이스를 한 바퀴
// 돌아 오는 문자열이므로 들어올 때도 나갈 때도 허용 목록으로 한 번 거른다.
// 믿을 만한 출처라서 안 거르는 게 아니라, 거르는 값이 싸서 늘 거른다.

const Memo = {
  _key(){ return 'gl_memos_v1'; },
  getItems(){ return JSON.parse(UserStore.get(this._key())||'[]'); },
  saveItems(v){ UserStore.set(this._key(), JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  // ── 정화기 ────────────────────────────
  // 허용한 것만 남기고 나머지는 통째로 버린다. 태그 이름을 지우는 게 아니라
  // 노드를 들어내고 자식만 끌어올린다 — 글이 사라지진 않는다.
  TAGS: new Set(['B','STRONG','I','EM','U','S','STRIKE','BR','DIV','P','UL','OL','LI','SPAN']),
  CLS:  new Set(['mm-check','on','mm-cp','mm-i1','mm-i2','mm-i3','mm-i4']),
  // 이것들은 껍데기만 벗기면 안 된다 — 알맹이가 코드라서 글로 남으면 그것도 쓰레기다.
  DROP: new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','NOSCRIPT','TEMPLATE','SVG','MATH']),

  clean(html){
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    const walk = (node) => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 3) return;                    // 글자는 그대로
        if (ch.nodeType !== 1) { ch.remove(); return; }    // 주석 따위는 버린다
        if (this.DROP.has(ch.tagName)) { ch.remove(); return; }
        if (!this.TAGS.has(ch.tagName)) {                  // 허용 밖 → 껍데기만 벗긴다
          walk(ch);
          while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
          ch.remove();
          return;
        }
        const cp = ch.getAttribute('data-cp');
        const cls = (ch.getAttribute('class') || '').split(/\s+/).filter(c => this.CLS.has(c));
        [...ch.attributes].forEach(a => ch.removeAttribute(a.name));
        if (cls.length) ch.setAttribute('class', cls.join(' '));
        if (cp != null && cls.includes('mm-cp')) {
          ch.setAttribute('data-cp', cp);
          ch.setAttribute('contenteditable', 'false');
        }
        walk(ch);
      });
    };
    walk(box);
    return box.innerHTML;
  },

  // 평문만 있던 옛 메모를 그리기용 HTML 로 바꾼다. 저장은 건드리지 않는다 —
  // 손대지 않은 메모까지 전부 다시 쓰면 동기화가 한 번 크게 출렁인다.
  htmlOf(m){
    if (m.html) return this.clean(m.html);
    return esc(m.content || '').replace(/\n/g, '<br>');
  },

  // 미리보기·검색·알림에 쓸 평문. 칩은 제 문구로 되돌려 놓는다.
  textOf(html){
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    box.querySelectorAll('.mm-cp').forEach(c => c.replaceWith(document.createTextNode(c.dataset.cp || '')));
    box.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    box.querySelectorAll('div,p,li').forEach(b => b.append('\n'));
    return (box.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  },

  // 저장된 HTML 을 화면에 올릴 수 있게 만든다. 칩에 아이콘과 손잡이를 달아 준다.
  // 붙여넣기·되돌리기로 새로 들어온 칩도 이 길로 다시 꾸며진다.
  paintChips(root){
    root.querySelectorAll('.mm-cp').forEach(c => {
      c.setAttribute('contenteditable', 'false');
      c.setAttribute('draggable', 'true');
      c.setAttribute('title', `복사: ${c.dataset.cp || ''}`);
      if (!c.querySelector('svg')) c.innerHTML = (typeof Icons !== 'undefined') ? Icons.svg('copy') : '⧉';
    });
  },

  // ── 카드 ──────────────────────────────
  _open: {},   // 펼쳐 둔 메모

  render(){
    const wrap = document.getElementById('memoWrap'); if(!wrap) return;
    const items = this.getItems();

    wrap.innerHTML = items.map(m => {
      const html = this.htmlOf(m);
      const lines = this.textOf(html).split('\n').filter(l => l.trim() !== '');
      const long = lines.length > 3;
      const open = !!this._open[m.id];

      return `<div class="memo-item${open?' open':''}${Memo._reorderMode?' reorder-mode':''}"
          data-reorderable="${m.id}"${Memo._reorderMode?'':` data-row data-i="${m.id}" data-label="${esc(m.title)}"`}>
        ${Memo._reorderMode?'<div class="memo-drag-hint">⠿</div>':''}
        <div class="memo-content-wrap">
          <div class="memo-title" data-edit>${esc(m.title)}</div>
          ${html?`<div class="memo-preview${open?'':' clamp'}" data-edit>${html}</div>`:''}
          ${long?`<button type="button" class="memo-toggle">${open?'접기':'더보기'}</button>`:''}
        </div>
        <div class="memo-right">
          ${Memo._reorderMode?`<button class="cl-del-btn edit-del-btn" onclick="event.stopPropagation();Memo.remove('${m.id}')" title="삭제">✕</button>`:''}
          <div class="memo-date">${_fmtMemoDate(m.updatedAt)}</div>
        </div>
      </div>`;
    }).join('')
    + `<div class="habit-add-btn" onclick="Memo.showAdd()">+ 메모 추가</div>`;

    this.paintChips(wrap);

    // 줄 하나를 어떻게 다루는지는 체크리스트·습관과 같은 규칙을 쓴다.
    // 손가락은 길게 눌러 수정·왼쪽으로 밀어 삭제, 마우스는 글씨를 눌러 수정·올리면 ✕.
    try { RowUI.paint(wrap, {
      edit: id => this.showEdit(id),
      del:  id => this.remove(id),
    }); } catch(e){ console.warn('RowUI', e); }

    wrap.querySelectorAll('.memo-item').forEach(row => {
      if (row.dataset.mmOn) return;
      row.dataset.mmOn = '1';
      row.addEventListener('click', (e) => {
        if (Memo._reorderMode) return;
        const chip = e.target.closest('.mm-cp');
        if (chip) { e.stopPropagation(); Memo.copyChip(chip); return; }
        if (e.target.closest('.rw-x, .rw-del, .cl-del-btn')) return;
        // 글씨를 누르면 수정, 그 밖의 빈 곳을 누르면 펼친다.
        if (e.target.closest('.memo-toggle') || !e.target.closest('[data-edit]')) {
          e.stopPropagation();
          Memo.toggleOpen(row.dataset.i || row.dataset.reorderable);
        } else {
          Memo.showEdit(row.dataset.i || row.dataset.reorderable);
        }
      });
    });
  },

  toggleOpen(id){
    if (!id) return;
    // 3줄이 안 되는 메모는 펼칠 게 없다. 아무 일도 안 일어나야 헛클릭이 아니다.
    const m = this.getItems().find(x => x.id === id); if (!m) return;
    const lines = this.textOf(this.htmlOf(m)).split('\n').filter(l => l.trim() !== '');
    if (lines.length <= 3) return;
    this._open[id] = !this._open[id];
    this.render();
  },

  copyChip(chip){
    const t = chip.dataset.cp || '';
    if (!t) return;
    const done = () => { chip.classList.add('cp-ok'); setTimeout(()=>chip.classList.remove('cp-ok'), 900);
                         App?.showToast('복사됨 ✓','success'); Sounds?.click(); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(done).catch(()=>this._copyFallback(t,done));
    else this._copyFallback(t, done);
  },
  _copyFallback(t, done){
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { App?.showToast('복사 실패','error'); }
    ta.remove();
  },

  // ── 편집창 ────────────────────────────
  _bar(){
    const b = (cmd,label,title,cls) =>
      `<button type="button" class="mm-b${cls?' '+cls:''}" data-cmd="${cmd}" title="${title}">${label}</button>`;
    return `<div class="mm-bar">
      ${b('bold','<b>B</b>','굵게 (Ctrl+B)')}
      ${b('underline','<u>U</u>','밑줄 (Ctrl+U)')}
      ${b('strikeThrough','<s>S</s>','취소선')}
      <span class="mm-bar-sep"></span>
      ${b('insertUnorderedList','•','글머리 기호')}
      ${b('insertOrderedList','1.','번호 매기기')}
      ${b('checklist', (typeof Icons!=='undefined'?Icons.svg('checkbox'):'☑'), '체크리스트')}
      <span class="mm-bar-sep"></span>
      ${b('outdent','⇤','내어쓰기')}
      ${b('indent','⇥','들여쓰기')}
      <span class="mm-bar-sep"></span>
      ${b('chip','복사칩','고른 문구 뒤에 복사 단추를 단다','wide')}
    </div>`;
  },

  _form(m){
    return `<div class="modal-row"><label class="modal-lbl">제목${m?'':' *'}</label>
        <input id="mTitle" type="text" placeholder="제목" class="inp" value="${m?esc(m.title):''}"></div>
      <div class="modal-row"><label class="modal-lbl">내용</label>
        ${this._bar()}
        <div id="mBody" class="mm-ed" contenteditable="true" spellcheck="false"></div>
        <div class="mm-hint">문구를 끌어서 고른 뒤 <b>복사칩</b> 을 누르면 그 자리에 복사 단추가 생깁니다. 칩은 옮겨도 제 문구를 기억합니다.</div>
      </div>`;
  },

  showAdd(){
    App.openModal('@memo 메모 추가', this._form(null) + `
      <div class="modal-btns">
        <button onclick="Memo._saveNew()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`, () => { this._wire(''); document.getElementById('mTitle')?.focus(); });
  },

  showEdit(id){
    const m = this.getItems().find(x => x.id === id); if(!m) return;
    App.openModal('@memo 메모 편집', this._form(m) + `
      <div class="modal-btns">
        <button onclick="Memo._saveEdit('${id}')" class="btn-sm accent">저장</button>
        <button onclick="Memo.remove('${id}');App.closeModal();" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`, () => { this._wire(this.htmlOf(m)); document.getElementById('mTitle')?.focus(); });
  },

  _wire(html){
    const ed = document.getElementById('mBody'); if(!ed) return;
    ed.innerHTML = html || '';
    this.paintChips(ed);
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}

    // 마지막으로 고른 자리를 기억한다. 도구 단추를 누르는 순간 편집창은 초점을 잃어서
    // 그때 selection 을 읽으면 이미 비어 있다.
    const save = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && ed.contains(s.anchorNode)) this._sel = s.getRangeAt(0).cloneRange();
    };
    ed.addEventListener('keyup', save);
    ed.addEventListener('mouseup', save);
    document.addEventListener('selectionchange', save);

    // 체크리스트 네모를 누르면 켜고 끈다. 글자 자리를 누르면 그냥 커서다.
    ed.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (li && li.parentElement?.classList.contains('mm-check')) {
        const x = e.clientX - li.getBoundingClientRect().left;
        if (x < 24) { li.classList.toggle('on'); e.preventDefault(); }
      }
    });

    // 칩 옮기기.
    // 처음엔 눌렀을 때 바로 복사만 하게 해 뒀는데, 그 preventDefault 때문에 칩을
    // 고를 수가 없어서 잘라내기도 끌기도 막혀 있었다 — 만들고 나면 못 움직이는 물건이었다.
    // HTML5 드래그는 contenteditable 안에서 브라우저마다 제각각이라 포인터로 직접 옮긴다.
    // 누른 채 움직이면 커서를 따라 칩이 실제로 이동하고, 안 움직이고 떼면 복사다.
    //
    // 손가락은 마우스와 사정이 다르다. 폰에서 이게 안 됐던 이유가 셋이었다.
    //   1. pointermove 를 ed 에 걸어 뒀다. 손가락이 칩 밖으로 나가는 순간 이벤트가 끊긴다.
    //      → setPointerCapture 로 칩이 끝까지 받게 한다.
    //   2. 브라우저가 그 터치를 스크롤로 먼저 가져갔다. → CSS 의 touch-action:none.
    //   3. 조금만 움직여도 끌기로 쳐서, 누르려던 것이 자꾸 끌려갔다.
    //      → 아이폰처럼 '꾹 눌러야 들린다'. 250ms 지나면 칩이 들리고, 그 전에 떼면 복사다.
    ed.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('.mm-cp');
      if (!chip) return;
      e.preventDefault();
      const touch = e.pointerType !== 'mouse';
      const sx = e.clientX, sy = e.clientY;
      let moved = false, armed = !touch;      // 마우스는 곧바로, 손가락은 꾹 눌러야
      try { chip.setPointerCapture(e.pointerId); } catch {}

      // 손가락: 꾹 누르고 있으면 칩이 '들린다'. 들렸다는 걸 몸으로 알려 준다.
      const arm = touch ? setTimeout(() => {
        armed = true; chip.classList.add('cp-drag');
        navigator.vibrate?.(12);
      }, 250) : null;

      const move = (ev) => {
        const far = Math.abs(ev.clientX-sx) >= 6 || Math.abs(ev.clientY-sy) >= 6;
        // 들리기 전에 손가락이 크게 움직였으면 끌기가 아니라 스크롤이다. 없던 일로 한다.
        if (!armed) { if (far) { clearTimeout(arm); cancel(); } return; }
        if (!moved && !far) return;
        if (!moved) { moved = true; chip.classList.add('cp-drag'); }
        const r = Memo._caretAt(ev.clientX, ev.clientY);
        if (!r || !ed.contains(r.startContainer) || chip.contains(r.startContainer)) return;
        r.insertNode(chip);                    // 이미 문서에 있는 노드라 '옮기기' 가 된다
      };
      const cleanup = () => {
        clearTimeout(arm);
        chip.removeEventListener('pointermove', move);
        chip.removeEventListener('pointerup', up);
        chip.removeEventListener('pointercancel', cancel);
        try { chip.releasePointerCapture(e.pointerId); } catch {}
        chip.classList.remove('cp-drag');
      };
      const cancel = () => cleanup();
      const up = () => {
        const didMove = moved;
        cleanup();
        if (didMove) {
          // 옮긴 뒤 칩 바로 뒤에 커서를 둔다. 그래야 이어서 글을 칠 수 있다.
          const after = document.createRange();
          after.setStartAfter(chip); after.collapse(true);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(after);
          this._sel = after.cloneRange();
          App?.showToast('칩 옮김 ✓','success');
        } else {
          this.copyChip(chip);
          // 복사한 김에 칩을 골라 둔다 — 바로 Ctrl+X 로 잘라내 옮길 수 있게.
          const r = document.createRange(); r.selectNode(chip);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        }
      };
      chip.addEventListener('pointermove', move);
      chip.addEventListener('pointerup', up);
      chip.addEventListener('pointercancel', cancel);
    });

    // ── 목록에서의 엔터·백스페이스 ──────────────
    // 워드에서 몸에 익은 동작을 그대로 가져온다.
    //   Shift+Enter : 번호를 늘리지 않고 같은 항목 안에서 줄만 내린다.
    //   빈 항목 Enter : 번호를 떼고 그 자리에 들여쓴 문단으로 남는다.
    //   그 문단 맨 앞 Backspace : 들여쓰기만 푼다(글자를 지우지 않는다).
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        try { document.execCommand('insertLineBreak', false, null); } catch {}
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const li = Memo._closest(ed, 'LI');
        if (li && !li.textContent.trim() && !li.querySelector('.mm-cp')) {
          e.preventDefault(); Memo._leaveList(ed, li); return;
        }
      }
      if (e.key === 'Backspace') {
        const b = Memo._block(ed);
        const cur = b && [...b.classList].find(c => /^mm-i[1-4]$/.test(c));
        if (cur && Memo._atBlockStart(ed)) { e.preventDefault(); Memo._indent(ed, -1); }
      }
    });

    // 붙여넣기는 늘 거른다. 다른 앱에서 온 서식이 통째로 딸려 오면 저장할 때
    // 어차피 정화기에 걸려 사라지므로, 화면과 저장이 어긋나지 않게 들어올 때 거른다.
    ed.addEventListener('paste', (e) => {
      const dt = e.clipboardData; if (!dt) return;
      const html = dt.getData('text/html');
      const text = dt.getData('text/plain');
      e.preventDefault();
      const frag = this.clean(html || esc(text).replace(/\n/g,'<br>'));
      document.execCommand('insertHTML', false, frag);
      this.paintChips(ed);
    });

    // 되돌리기·끌어놓기 등 우리가 모르는 길로 들어온 칩도 꾸며 준다.
    new MutationObserver(() => this.paintChips(ed))
      .observe(ed, { childList:true, subtree:true });

    document.querySelectorAll('.mm-bar .mm-b').forEach(b => {
      // mousedown 에서 막지 않으면 단추를 누르는 순간 고른 자리가 풀린다.
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => this._cmd(b.dataset.cmd, ed));
    });
  },

  // 포인터가 가리키는 글자 사이 자리. 크롬·사파리와 파이어폭스가 이름이 다르다.
  _caretAt(x, y){
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (!p) return null;
      const r = document.createRange();
      r.setStart(p.offsetNode, p.offset); r.collapse(true);
      return r;
    }
    return null;
  },

  _restore(ed){
    ed.focus();
    if (!this._sel) return;
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(this._sel);
  },

  _cmd(cmd, ed){
    this._restore(ed);
    if (cmd === 'chip')      return this._insertChip(ed);
    if (cmd === 'checklist') return this._checklist(ed);
    if (cmd === 'indent')    return this._indent(ed,  1);
    if (cmd === 'outdent')   return this._indent(ed, -1);
    try { document.execCommand(cmd, false, null); } catch {}
    if (cmd === 'insertUnorderedList') {
      // 글머리 기호로 되돌릴 때 체크리스트 표시가 남아 있으면 안 된다.
      const ul = this._blockUL(ed);
      if (ul) ul.classList.remove('mm-check');
    }
    ed.focus();
  },

  _closest(ed, tag){
    const s = window.getSelection();
    let n = s && s.anchorNode;
    while (n && n !== ed) { if (n.nodeType === 1 && n.tagName === tag) return n; n = n.parentNode; }
    return null;
  },

  // 커서가 이 블록의 맨 앞에 있는가. 앞에 글자가 하나라도 있으면 백스페이스는
  // 원래 하던 일(글자 지우기)을 해야 한다.
  _atBlockStart(ed){
    const s = window.getSelection();
    if (!s || !s.isCollapsed || !s.rangeCount) return false;
    const b = this._block(ed); if (!b) return false;
    const r = s.getRangeAt(0).cloneRange();
    try { r.setStart(b, 0); } catch { return false; }
    return r.toString().length === 0;
  },

  // 빈 항목에서 엔터. 번호(또는 점)를 떼고 들여쓴 문단으로 내려놓는다.
  // 안쪽 목록이면 한 단계만 밖으로 — 그게 '들여쓰기가 하나 풀린다' 는 뜻이다.
  _leaveList(ed, li){
    const list = li.parentElement;
    const nested = list && list.parentElement && list.parentElement.tagName === 'LI';
    if (nested) {
      try { document.execCommand('outdent', false, null); } catch {}
      ed.querySelectorAll('ul.mm-check ul').forEach(u => u.classList.add('mm-check'));
      ed.focus(); return;
    }
    const p = document.createElement('div');
    p.className = 'mm-i1';                    // 번호는 사라지고 들여쓰기는 남는다
    p.appendChild(document.createElement('br'));
    // 마지막 항목이면 목록 뒤에, 중간이면 목록을 쪼개지 않고 그 앞에 놓는다.
    if (li.nextElementSibling) list.parentNode.insertBefore(p, list);
    else list.parentNode.insertBefore(p, list.nextSibling);
    li.remove();
    if (!list.children.length) list.remove();
    const r = document.createRange();
    r.setStart(p, 0); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    this._sel = r.cloneRange();
    ed.focus();
  },

  _blockUL(ed){
    const s = window.getSelection();
    let n = s && s.anchorNode;
    while (n && n !== ed) { if (n.nodeType === 1 && n.tagName === 'UL') return n; n = n.parentNode; }
    return null;
  },

  _checklist(ed){
    const cur = this._blockUL(ed);
    if (cur && cur.classList.contains('mm-check')) {       // 이미 체크리스트 → 평범한 줄로
      try { document.execCommand('insertUnorderedList', false, null); } catch {}
      ed.focus(); return;
    }
    if (!cur) { try { document.execCommand('insertUnorderedList', false, null); } catch {} }
    const ul = this._blockUL(ed);
    if (ul) ul.classList.add('mm-check');
    ed.focus();
  },

  // 지금 커서가 놓인 '한 덩어리' — 편집창의 바로 아래 자식.
  _block(ed){
    const s = window.getSelection();
    let n = s && s.anchorNode;
    while (n && n.parentNode !== ed && n !== ed) n = n.parentNode;
    return (n && n !== ed && n.nodeType === 1) ? n : null;
  },

  // 들여쓰기.
  // 목록 안에서는 브라우저의 indent 를 쓴다 — 목록 안의 목록으로 접히는 게 옳고,
  // 그 모양은 정화기를 그대로 통과한다.
  // 그냥 문단에서는 브라우저가 blockquote 나 margin-left 를 만드는데 둘 다 정화기에 걸려
  // 저장하는 순간 들여쓴 게 풀렸다. 그래서 문단은 우리 이름표(mm-i1~4)로 직접 민다.
  _indent(ed, dir){
    const s = window.getSelection();
    let n = s && s.anchorNode, li = null;
    while (n && n !== ed) { if (n.nodeType === 1 && n.tagName === 'LI') { li = n; break; } n = n.parentNode; }
    if (li) {
      try { document.execCommand(dir > 0 ? 'indent' : 'outdent', false, null); } catch {}
      // 체크리스트를 들여쓰면 새로 생긴 안쪽 목록도 체크리스트여야 한다
      ed.querySelectorAll('ul.mm-check ul').forEach(u => u.classList.add('mm-check'));
      ed.focus(); return;
    }
    let b = this._block(ed);
    if (!b) { try { document.execCommand('formatBlock', false, 'div'); } catch {} b = this._block(ed); }
    if (!b) return;
    const cur = [...b.classList].find(c => /^mm-i[1-4]$/.test(c));
    let lvl = cur ? parseInt(cur[4], 10) : 0;
    lvl = Math.max(0, Math.min(4, lvl + dir));
    if (cur) b.classList.remove(cur);
    if (lvl) b.classList.add('mm-i' + lvl);
    ed.focus();
  },

  // 고른 문구를 몸에 지닌 칩을 그 문구 바로 뒤에 놓는다.
  // 문구 자체는 지우지 않는다 — 주소는 읽을 수 있어야 하고, 칩은 그걸 가져가는 손잡이다.
  _insertChip(ed){
    const s = window.getSelection();
    if (!s || !s.rangeCount) { App.showToast('먼저 문구를 끌어서 고르세요','error'); return; }
    const r = s.getRangeAt(0);
    const text = String(r.toString() || '').trim();
    if (!text) { App.showToast('먼저 문구를 끌어서 고르세요','error'); return; }

    const chip = document.createElement('span');
    chip.className = 'mm-cp';
    chip.setAttribute('contenteditable','false');
    chip.dataset.cp = text;
    chip.title = `복사: ${text}`;
    chip.innerHTML = (typeof Icons !== 'undefined') ? Icons.svg('copy') : '⧉';

    const end = r.cloneRange();
    end.collapse(false);                 // 고른 문구의 끝
    end.insertNode(chip);
    // 칩 뒤에 커서를 놓아 준다. 안 그러면 다음에 친 글자가 칩 안으로 들어간다.
    const after = document.createRange();
    after.setStartAfter(chip); after.collapse(true);
    s.removeAllRanges(); s.addRange(after);
    this._sel = after.cloneRange();
    ed.focus();
    App.showToast('복사칩 추가됨 ✓','success');
  },

  _read(){
    const ed = document.getElementById('mBody');
    const html = this.clean(ed ? ed.innerHTML : '');
    return { html, content: this.textOf(html) };
  },

  _saveNew(){
    const title = document.getElementById('mTitle')?.value.trim();
    if(!title){ App.showToast('제목을 입력해주세요','error'); return; }
    const { html, content } = this._read();
    const items = this.getItems();
    items.unshift({ id:'memo_'+Date.now(), title, html, content,
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
    this.saveItems(items); this.render(); App.closeModal(); App.showToast('메모 저장됨 ✓','success');
  },

  _saveEdit(id){
    const title = document.getElementById('mTitle')?.value.trim();
    if(!title){ App.showToast('제목을 입력해주세요','error'); return; }
    const { html, content } = this._read();
    const items = this.getItems();
    const m = items.find(x => x.id === id);
    if(m){ m.title=title; m.html=html; m.content=content; m.updatedAt=new Date().toISOString(); }
    this.saveItems(items); this.render(); App.closeModal(); App.showToast('수정됨 ✓','success');
  },

  remove(id){
    if(!confirm('메모를 삭제하시겠습니까?')) return;
    Sounds?.delete();
    delete this._open[id];
    this.saveItems(this.getItems().filter(m => m.id !== id)); this.render();
  },

  _reorderMode: false,
  toggleReorderMode() {
    this._reorderMode = !this._reorderMode;
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
