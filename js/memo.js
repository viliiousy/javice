// js/memo.js — 메모
//
// 예전엔 제목 한 줄과 평문 한 덩어리였다. 주소를 적어 두면 쓸 때마다 모달을 열고,
// 글자를 끌어서 골라, 복사하고, 닫았다. 네 동작이 한 동작이어야 했다.
//
// 그래서 세 가지를 바꿨다.
//   하나, 내용이 서식을 갖는다 — 굵게·밑줄·취소선, 글머리·번호·체크리스트, 들여쓰기.
//   둘,  긴 메모는 눌러서 펼친다. 읽으려고 편집창을 열 이유가 없다.
//   셋,  자주 쓰는 문구에는 밑줄을 긋는다. 그 글씨를 누르면 그 글이 복사된다.
//        예전엔 문구 '뒤에' 복사칩(작은 단추)을 달았다. 단추가 글줄에 끼어 자리를 차지했고,
//        옮기려면 꾹 눌러야 했고, 제가 복사할 문구를 따로 지니고 다녀서 보이는 글과
//        복사되는 글이 갈라질 수 있었다. 복사할 것은 글 자체이지 글 옆의 물건이 아니다.
//        옛 메모에 남은 칩은 그대로 눌러 쓸 수 있게 두되, 새로 만들지는 않는다.
//   넷,  글씨 크기는 내가 정한다. 메모는 사람마다 읽는 거리가 다르다.
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
  CLS:  new Set(['mm-check','on','mm-cp','mm-lk','mm-i1','mm-i2','mm-i3','mm-i4']),
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

  // 미리보기·검색·알림에 쓸 평문. 옛 칩은 제 문구로 되돌려 놓는다 —
  // 칩은 글이 아니라 글을 가리키는 물건이었다. 복사 링크는 글 자체라 손댈 게 없다.
  textOf(html){
    const box = document.createElement('div');
    box.innerHTML = String(html || '');
    box.querySelectorAll('.mm-cp').forEach(c => c.replaceWith(document.createTextNode(c.dataset.cp || '')));
    box.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    box.querySelectorAll('div,p,li').forEach(b => b.append('\n'));
    return (box.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  },

  // 저장된 HTML 을 화면에 올릴 수 있게 만든다.
  // 복사 링크는 제 글자를 그대로 복사하므로 따로 지닐 게 없다 — 안내만 붙인다.
  // 그래서 링크 안의 글을 고치면 복사되는 것도 같이 바뀐다.
  paintMarks(root){
    root.querySelectorAll('.mm-lk').forEach(a => {
      a.setAttribute('title', `눌러서 복사: ${a.textContent || ''}`);
    });
    // 옛 메모에 남은 복사칩. 새로 만들지는 않지만, 있던 것은 계속 눌러 쓸 수 있어야 한다.
    root.querySelectorAll('.mm-cp').forEach(c => {
      c.setAttribute('contenteditable', 'false');
      c.setAttribute('title', `복사: ${c.dataset.cp || ''}`);
      if (!c.querySelector('svg')) c.innerHTML = (typeof Icons !== 'undefined') ? Icons.svg('copy') : '⧉';
    });
  },

  // ── 글씨 크기 ─────────────────────────
  // 메모만 따로 정한다. 앱 전체 글씨를 키우면 달력 숫자와 칸이 전부 흐트러지는데,
  // 정작 크게 보고 싶은 건 메모 본문이었다.
  // 값은 CSS 변수 한 곳에만 둔다 — 카드와 편집창에 따로 쓰면 카드에서 크게 해 놓고
  // 편집창을 열었을 때 글이 도로 작아진다. 같은 메모가 두 크기로 보이면 안 된다.
  FS: [10, 11, 12, 13, 14, 16, 18],
  _fsKey(){ return 'gl_memo_fs'; },
  fs(){
    const v = parseInt(UserStore.get(this._fsKey()) || '', 10);
    return this.FS.includes(v) ? v : 12;      // 모르는 값이 들어오면 원래 크기로
  },
  applyFs(){ document.documentElement.style.setProperty('--mm-fs', this.fs() + 'px'); },
  stepFs(dir){
    const i = this.FS.indexOf(this.fs());
    const n = Math.max(0, Math.min(this.FS.length - 1, i + dir));
    // 끝에 닿았으면 조용히 넘기지 않는다. 눌렀는데 아무 일도 안 일어나면
    // 단추가 고장 난 건지 끝인 건지 알 수가 없다.
    if (n === i) { App?.showToast(dir > 0 ? '가장 큰 글씨입니다' : '가장 작은 글씨입니다', 'error'); return; }
    UserStore.set(this._fsKey(), String(this.FS[n]));
    FirebaseSync?.scheduleSave();
    this.applyFs();
    Sounds?.click();
    App?.showToast(`메모 글씨 ${this.FS[n]}px`, 'success');
  },

  // ── 카드 ──────────────────────────────
  // 날짜는 제목과 같은 줄에 둔다. 예전엔 오른쪽에 제 칸을 차지하고 서 있었고,
  // PC 의 ✕ 단추가 그 옆에 또 한 칸을 먹었다. 그래서 본문은 늘 줄 끝에서
  // 100px 쯤 앞서 접혔다 — 한 줄이면 될 메모가 두 줄이 되던 이유다.
  _open: {},   // 펼쳐 둔 메모

  render(){
    const wrap = document.getElementById('memoWrap'); if(!wrap) return;
    this.applyFs();
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
          <div class="memo-head">
            <div class="memo-title" data-edit title="${esc(m.title)}">${esc(m.title)}</div>
            <div class="memo-date">${_fmtMemoDate(m.updatedAt)}</div>
          </div>
          ${html?`<div class="memo-preview${open?'':' clamp'}" data-edit>${html}</div>`:''}
          ${long?`<button type="button" class="memo-toggle">${open?'접기':'더보기'}</button>`:''}
        </div>
        ${Memo._reorderMode?`<button class="cl-del-btn edit-del-btn" onclick="event.stopPropagation();Memo.remove('${m.id}')" title="삭제">✕</button>`:''}
      </div>`;
    }).join('')
    + `<div class="habit-add-btn" onclick="Memo.showAdd()">+ 메모 추가</div>`;

    this.paintMarks(wrap);

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
        // 밑줄 그은 글씨 → 그 글을 복사한다. 메모를 여는 것보다 먼저다.
        // 누르면 복사된다고 밑줄로 약속해 뒀으니 그 약속이 먼저 지켜져야 한다.
        const lk = e.target.closest('.mm-lk');
        if (lk) { e.stopPropagation(); Memo.copy(lk.textContent, lk); return; }
        const chip = e.target.closest('.mm-cp');
        if (chip) { e.stopPropagation(); Memo.copy(chip.dataset.cp, chip); return; }
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

  copy(text, el){
    const t = String(text || '').trim();
    if (!t) return;
    const done = () => { el?.classList.add('cp-ok'); setTimeout(()=>el?.classList.remove('cp-ok'), 900);
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
      ${b('link','복사 링크','고른 문구에 밑줄 — 누르면 복사된다 (한 번 더 누르면 해제)','wide')}
    </div>`;
  },

  _form(m){
    return `<div class="modal-row"><label class="modal-lbl">제목${m?'':' *'}</label>
        <input id="mTitle" type="text" placeholder="제목" class="inp" value="${m?esc(m.title):''}"></div>
      <div class="modal-row"><label class="modal-lbl">내용</label>
        ${this._bar()}
        <div id="mBody" class="mm-ed" contenteditable="true" spellcheck="false"></div>
        <div class="mm-hint">문구를 끌어서 고른 뒤 <b>복사 링크</b> 를 누르면 밑줄이 그어집니다. 메모 카드에서 그 글씨를 누르면 복사됩니다. 링크 안에 커서를 두고 한 번 더 누르면 밑줄이 풀립니다.</div>
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
    this.paintMarks(ed);
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

    // 복사칩의 '옮기기' 는 없앴다.
    // 칩은 문구 뒤에 붙는 별개의 물건이라, 만들고 나면 어디 두었는지가 또 하나의 상태였다.
    // 꾹 눌러 들고 끌어 옮기는 코드가 50 줄 넘게 있었고 폰에서 세 번 고쳤다.
    // 복사 링크는 글 자체에 그어지므로 옮길 일이 없다 — 글을 옮기면 밑줄이 따라간다.

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
      this.paintMarks(ed);
    });

    // 되돌리기·붙여넣기 등 우리가 모르는 길로 들어온 표시도 꾸며 준다.
    new MutationObserver(() => this.paintMarks(ed))
      .observe(ed, { childList:true, subtree:true });

    document.querySelectorAll('.mm-bar .mm-b').forEach(b => {
      // mousedown 에서 막지 않으면 단추를 누르는 순간 고른 자리가 풀린다.
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => this._cmd(b.dataset.cmd, ed));
    });
  },

  _restore(ed){
    ed.focus();
    if (!this._sel) return;
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(this._sel);
  },

  _cmd(cmd, ed){
    this._restore(ed);
    if (cmd === 'link')      return this._toggleLink(ed);
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

  // 고른 문구에 밑줄을 긋는다. 링크 안에 커서가 있으면 반대로 밑줄을 푼다 —
  // 긋는 길과 푸는 길이 한 단추여야 '이 단추가 밑줄을 담당한다' 가 눈에 남는다.
  //
  // 고른 범위를 통째로 감싸지 않고 글자만 꺼내 다시 넣는다. surroundContents 는
  // 고른 범위가 태그 경계를 넘으면(굵게 반쪽 + 보통 반쪽) 그냥 실패한다.
  // 밑줄 안의 굵게를 잃는 건 아쉽지만, 눌렀는데 아무 일도 안 일어나는 것보다 낫다.
  _toggleLink(ed){
    const s = window.getSelection();
    if (!s || !s.rangeCount) { App.showToast('먼저 문구를 끌어서 고르세요','error'); return; }
    const r = s.getRangeAt(0);

    const hits = this._linksIn(ed, r);
    if (hits.length) {
      hits.forEach(a => { while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a); a.remove(); });
      ed.normalize();                     // 쪼개진 글자 토막을 도로 하나로
      ed.focus();
      App.showToast('복사 링크 해제됨','success');
      return;
    }

    const text = String(r.toString() || '').trim();
    if (!text) { App.showToast('먼저 문구를 끌어서 고르세요','error'); return; }

    const a = document.createElement('span');
    a.className = 'mm-lk';
    a.textContent = text;
    r.deleteContents();
    r.insertNode(a);

    // 링크 바로 뒤에 커서를 둔다. 안 그러면 이어서 친 글자가 밑줄 안으로 들어간다.
    const after = document.createRange();
    after.setStartAfter(a); after.collapse(true);
    s.removeAllRanges(); s.addRange(after);
    this._sel = after.cloneRange();
    ed.focus();
    this.paintMarks(ed);
    App.showToast('복사 링크 만듦 ✓','success');
  },

  // 고른 범위에 걸린 복사 링크들.
  // 커서를 한 점에 찍어 둔 경우(collapsed)에는 '걸쳐 있는지' 를 아예 묻지 않는다.
  // 규격대로라면 점 하나짜리 범위는 어차피 아무것과도 안 겹치지만, 경계 판정은
  // 엔진마다 미묘하다. 링크 바로 뒤에 커서를 둔 것이 '겹침' 으로 읽히면
  // 새 링크를 그으려다 옆 링크가 풀린다. 그래서 규칙으로 못 박는다 —
  // 커서만 있을 때 잡히는 링크는 '커서가 그 안에 있는' 링크뿐이다.
  _linksIn(ed, r){
    const out = [];
    const up = n => { while (n && n !== ed) {
      if (n.nodeType === 1 && n.classList && n.classList.contains('mm-lk')) return n;
      n = n.parentNode;
    } return null; };
    const a = up(r.startContainer), b = up(r.endContainer);
    if (a) out.push(a);
    if (b && b !== a) out.push(b);
    if (!r.collapsed) ed.querySelectorAll('.mm-lk').forEach(x => {
      if (!out.includes(x) && r.intersectsNode(x)) out.push(x);
    });
    return out;
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
