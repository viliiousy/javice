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

  // 카테고리 — 기존 습관은 cat 필드가 없으므로 전부 'life'로 취급된다
  CATS: {
    life: { label:'일상',     icon:'✅', ic:'check', wrap:'habitsWrap', foot:'habitsFooter',
            titleSel:'.card-habits .card-title', btn:'btnHabitReorder', addLbl:'+ 습관 추가' },
    dev:  { label:'자기개발', icon:'📚', ic:'book',  wrap:'habitsWrap', foot:'habitsFooter',
            titleSel:'.card-habits .card-title', btn:'btnHabitReorder', addLbl:'+ 자기개발 추가' },
  },
  _catOf(h) { return (h && h.cat === 'dev') ? 'dev' : 'life'; },

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

  // cat 을 넘기지 않으면 전체 카테고리를 반환한다 (스탯 배너 등 기존 호출 호환)
  getHabitsForDate(date=new Date(), cat=null) {
    return this._forDate(this.getList(), date, cat);
  },
  // 목록을 밖에서 넘길 수 있게 갈라 뒀다. 히트맵이 35일치를 도는데
  // 날마다 getList() 를 부르면 JSON 을 35번 파싱한다.
  _forDate(all, date, cat=null) {
    const dow     = new Date(date).getDay();
    const dateStr = this._dateStr(date);
    return all.filter(h => {
      if(cat && this._catOf(h) !== cat) return false;
      if(h.createdAt  && dateStr < h.createdAt)  return false; // 생성 전
      if(h.deletedFrom && dateStr >= h.deletedFrom) return false; // 삭제 후
      return !h.days || h.days.length===0 || h.days.includes(dow);
    });
  },

  // ── 최근 5주 히트맵 ───────────────────
  // 하루치 체크는 '오늘 했나' 만 말한다. 다섯 주를 한 판에 깔면 '요즘 무너지고 있나' 가 보인다 —
  // 연속 기록(🔥)이 못 보여주는 것이다. 끊긴 날은 0 이 되고 끝이지만, 여기선 자국이 남는다.
  //
  // 그날 할 습관이 아예 없던 날(평일 습관인데 주말)은 실패가 아니다. 빈칸으로 둔다.
  // 0% 와 '해당 없음' 을 같은 색으로 칠하면 쉰 날이 무너진 날처럼 보인다.
  // 격자는 언제나 '오늘' 을 끝으로 잡는다. 고른 날짜를 끝으로 잡으면
  // 과거 칸을 누르는 순간 그 뒤 날들이 미래가 되어 사라진다 — 돌아올 길이 없어진다.
  _heat(cat) {
    const all = this.getList();
    const end = new Date(); end.setHours(0,0,0,0);
    const start = new Date(end);
    start.setDate(start.getDate() - start.getDay() - 28);   // 4주 전 일요일부터
    const out = [];
    for(let i=0;i<35;i++){
      const d = new Date(start); d.setDate(start.getDate()+i);
      const ds = this._dateStr(d);
      if(d > end){ out.push({ds, lv:-2}); continue; }        // 아직 오지 않은 날
      const hs = this._forDate(all, d, cat);
      if(!hs.length){ out.push({ds, lv:-1}); continue; }     // 할 습관이 없던 날
      const chk  = this.getChecked(d);
      const done = hs.filter(h=>chk.includes(h.id)).length;
      const r    = done/hs.length;
      out.push({ ds, done, total:hs.length,
                 lv: r===0?0 : r<0.34?1 : r<0.67?2 : r<1?3 : 4 });
    }
    return out;
  },

  _heatHtml(cat, selDate) {
    const cells = this._heat(cat);
    // 기록이 아예 없으면 빈 격자만 뜬다. 그건 정보가 아니라 회색 벽이다.
    if(!cells.some(c=>c.lv>0)) return '';
    this._heatData = this._heatData||{}; this._heatData[cat]=cells;

    const todayStr = this._dateStr(new Date());
    const selStr   = this._dateStr(selDate || new Date());
    const grid = cells.map((c,i)=>{
      const cls = c.lv===-2 ? 'hm-fut' : c.lv===-1 ? 'hm-off' : 'hm-l'+c.lv;
      const day = Number(c.ds.slice(8));
      // 칸에 날짜를 적어야 달력으로 읽힌다. 색만 있으면 '어느 날인지' 를 세어야 한다.
      // 지나지 않은 날은 누를 것도 없으니 눌리지 않게 둔다.
      const dead = c.lv===-2;
      return `<button class="hm-c ${cls}${c.ds===todayStr?' hm-today':''}${c.ds===selStr&&c.ds!==todayStr?' hm-sel':''}"${dead?' disabled':''}
        onpointerenter="Habits._heatHover('${cat}',${i})" onfocus="Habits._heatHover('${cat}',${i})"
        onpointerleave="Habits._heatHover('${cat}',-1)" onblur="Habits._heatHover('${cat}',-1)"
        ${dead?'':`onclick="Habits._heatPick('${c.ds}')"`}
        aria-label="${this._heatLabel(c)}"><span>${day}</span></button>`;
    }).join('');

    const days = this.DAYS_KO.map(d=>`<span>${d}</span>`).join('');
    return `<div class="hm">
      <div class="hm-head"><span class="hm-t">최근 5주</span>
        <span class="hm-legend">적음<i class="hm-l1"></i><i class="hm-l2"></i><i class="hm-l3"></i><i class="hm-l4"></i>많음</span></div>
      <div class="hm-days">${days}</div>
      <div class="hm-grid">${grid}</div>
      <div class="hm-read" id="hmRead-${cat}">${this._heatSummary(cells)}</div>
    </div>`;
  },

  _heatLabel(c) {
    const md = c.ds.slice(5).replace(/-/,'/').replace(/^0/,'');
    if(c.lv===-2) return md;
    if(c.lv===-1) return `${md} · 쉬는 날`;
    return `${md} · ${Math.round(c.done/c.total*100)}% (${c.done}/${c.total})`;
  },
  _heatSummary(cells) {
    const real = cells.filter(c=>c.lv>=0);
    if(!real.length) return '';
    const perfect = real.filter(c=>c.lv===4).length;
    return `${real.length}일 중 <strong>${perfect}일</strong> 전부 완료`;
  },
  // 칸을 누르면 카드 전체가 그 날짜로 간다. 달력처럼 생겼으면 달력처럼 눌려야 한다.
  _heatPick(ds) {
    const d = new Date(ds + 'T00:00:00');
    if(isNaN(d.getTime())) return;
    if(typeof App !== 'undefined' && App.selectCalDate) App.selectCalDate(d);
    else this.render(d);
  },

  _heatHover(cat, i) {
    const el = document.getElementById('hmRead-'+cat);
    const cells = this._heatData && this._heatData[cat];
    if(!el||!cells) return;
    el.innerHTML = i<0 ? this._heatSummary(cells) : this._heatLabel(cells[i]);
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

  // 카드 두 장이던 걸 한 장으로 합쳤다. 같은 모듈을 카테고리만 갈라 두 번 그리느라
  // 화면을 두 배로 쓰고 있었다. 지금은 한 장 안에서 분류를 바꿔 본다.
  _view: 'life',

  setView(cat) {
    if (!this.CATS[cat] || this._view === cat) return;
    this._view = cat;
    this._reorderMode = null;          // 분류를 옮기면 편집 모드는 푼다
    this.render(App?.S?.selDate || new Date());
  },

  render(date=new Date()) { this._renderCard(this._view, date); },

  // 안 보고 있는 쪽에 남은 개수를 숫자로 띄운다.
  // 카드를 합치면서 잃을 뻔한 게 이거다 — 자기개발이 눈에서 사라지면 그냥 안 하게 된다.
  _segHtml(date) {
    const all = this.getList(), chk = this.getChecked(date);
    return '<div class="hb-seg">' + Object.entries(this.CATS).map(([c, C]) => {
      const left = this._forDate(all, date, c).filter(h => !chk.includes(h.id)).length;
      return `<button class="hb-seg-btn${c === this._view ? ' on' : ''}" onclick="Habits.setView('${c}')">
        ${Icons.svg(C.ic, 'hb-seg-ic')}${C.label}${left ? `<i>${left}</i>` : ''}</button>`;
    }).join('') + '</div>';
  },

  _renderCard(cat, date=new Date()) {
    const C=this.CATS[cat]; if(!C) return;
    const wrap=document.getElementById(C.wrap); if(!wrap) return;
    const list=this.getHabitsForDate(date, cat);
    const chk=this.getChecked(date);
    const isToday=this._dateStr(date)===this._dateStr(new Date());
    const done=list.filter(h=>chk.includes(h.id)).length;
    const reorder=this._reorderMode===cat;

    const titleEl=document.querySelector(C.titleSel);
    if(titleEl){
      const dLbl=new Date(date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
      // textContent 로 쓰면 머리글 아이콘까지 지워진다. Icons.title 로 통일한다.
      Icons.title(titleEl, C.ic, cat==='life'
        ? (isToday?'오늘의 습관':`${dLbl} 습관`)
        : (isToday?'자기개발'  :`${dLbl} 자기개발`));
    }

    wrap.innerHTML=this._segHtml(date)+list.map(h=>{
      const isDone=chk.includes(h.id);
      const st=this.streak(h.id);
      const _d = h.days||[];
      let daysLabel = '';
      if(_d.length===7 || _d.length===0) daysLabel='<span class="habit-days">매일</span>';
      else if(_d.length===5&&[1,2,3,4,5].every(x=>_d.includes(x))) daysLabel='<span class="habit-days">평일</span>';
      else if(_d.length===2&&[0,6].every(x=>_d.includes(x))) daysLabel='<span class="habit-days">주말</span>';
      else daysLabel=`<span class="habit-days">${_d.map(d=>this.DAYS_KO[d]).join('')}</span>`;
      const ds2=Habits._dateStr(date);
      // 순서 바꾸는 중에는 밀기·길게누르기를 붙이지 않는다 — 끌어야 하는데 삭제가 열린다.
      return `<div class="habit-item${isDone?' done':''}${reorder?' reorder-mode':''}"
        data-reorderable="${h.id}"${reorder?'':` data-row data-i="${h.id}" data-label="${esc(h.name)}"`}>
        ${reorder?`<div class="reorder-handle" onclick="event.stopPropagation()" title="꾹 눌러서 순서 변경">⠿</div>`:''}
        <div class="habit-chk" onclick="event.stopPropagation();Habits._handleTap('${h.id}','${ds2}')">${isDone?'✓':''}</div>
        <span class="habit-name" onclick="event.stopPropagation();Habits.showEditHabit('${h.id}')">${h.emoji?esc(h.emoji)+' ':''}${esc(h.name)}${daysLabel}</span>
        ${st>0&&!reorder?`<span class="habit-streak">🔥${st}</span>`:''}
        ${reorder?`<button class="cl-del-btn edit-del-btn" onclick="event.stopPropagation();Habits._delFrom('${h.id}','${ds2}')" title="삭제">✕</button>`:''}
      </div>`;
    }).join('')
    + (list.length ? '' : `<p class="empty">${Icons.big(C.ic)}${cat==='dev'?'독서·강의·외국어 같은 자기개발 습관을 추가해보세요':'습관이 없습니다'}</p>`)
    + `<div class="habit-add-btn" onclick="Habits.showInlineAdd(App?.S?.selDate,'${cat}')">${C.addLbl}</div>`;

    // 밀기·길게누르기·✕ 를 붙인다 (js/rowui.js)
    try { RowUI.paint(wrap, {
      edit: id => this.showEditHabit(id),
      del:  id => this._delFrom(id, this._dateStr(date)),
    }); } catch(e) { console.warn('RowUI', e); }

    // 히트맵은 카드 맨 아래다. 오늘 몇 개 했는지를 먼저 읽고, 그다음에 지난 다섯 주를 본다.
    // 순서가 뒤집히면 오늘 얘기가 지난 달 얘기 밑에 깔린다.
    const foot=document.getElementById(C.foot);
    if(foot) foot.innerHTML = (list.length
      ? `${isToday?'오늘':'해당 날짜'} <strong>${done}/${list.length}</strong> 완료 ${done===list.length?'🏆 퍼펙트!':''}`
      : '')
      + (reorder ? '' : this._heatHtml(cat, date));
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

  // 편집 모드는 한 번에 한 카테고리만 (null | 'life' | 'dev')
  _reorderMode: null,

  toggleReorderMode(cat) {
    cat = this.CATS[cat] ? cat : this._view;
    // 편집은 지금 보고 있는 분류에 대해서만 한다
    if (cat !== this._view) { this._view = cat; }
    this._reorderMode = (this._reorderMode === cat) ? null : cat;

    // 버튼은 이제 하나다. 예전처럼 카테고리마다 돌면 뒤엣것이 앞엣것을 덮어쓴다.
    const btn = document.getElementById('btnHabitReorder');
    if (btn) {
      const on = this._reorderMode !== null;
      btn.style.background = on ? 'var(--accent)' : '';
      btn.style.color      = on ? 'white' : '';
    }

    // 현재 선택된 날짜 컨텍스트 유지 (App.S.selDate가 없으면 오늘)
    this.render(App?.S?.selDate || new Date());

    const active = this._reorderMode;
    if (!active) return;

    // render 후 Reorder 모듈 활성화
    setTimeout(() => {
      const wrap = document.getElementById(this.CATS[active].wrap);
      if (!wrap || typeof Reorder === 'undefined') return;
      Reorder.enable(wrap, (newOrder) => {
        const list  = this.getList();
        const inCat = list.filter(h => this._catOf(h) === active);
        // 새 순서대로 정렬하되, 순서에 없는 항목은 뒤에 붙인다
        const ordered = newOrder.map(id => inCat.find(h => h.id === id)).filter(Boolean);
        inCat.forEach(h => { if (!ordered.includes(h)) ordered.push(h); });
        // 다른 카테고리 항목의 자리는 그대로 두고 해당 카테고리 자리만 교체
        let qi = 0;
        const sorted = list.map(h => this._catOf(h) === active ? ordered[qi++] : h);
        this.saveList(sorted);
        Sounds?.click();
      });
    }, 50);
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
  _pendingAddCat: 'life',

  // 카테고리 선택 UI (추가/편집 모달 공용)
  _catPickerHtml(selected, name) {
    return `<div class="cat-picker">` + Object.entries(this.CATS).map(([c,C]) =>
      `<label class="cat-pick-btn${c===selected?' on':''}">
         <input type="radio" name="${name}" value="${c}" ${c===selected?'checked':''}
                onchange="Habits._syncCatPicker(this)"> ${C.icon} ${C.label}
       </label>`).join('') + `</div>`;
  },
  _syncCatPicker(input) {
    input.closest('.cat-picker')?.querySelectorAll('.cat-pick-btn')
      .forEach(l => l.classList.toggle('on', l.querySelector('input')?.checked));
  },

  showInlineAdd(baseDate, cat='life') {
    // baseDate 미전달 시 현재 선택된 날짜 사용, 없으면 오늘
    this._pendingAddDate = baseDate || App?.S?.selDate || new Date();
    this._pendingAddCat  = this.CATS[cat] ? cat : 'life';
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
    App.openModal(`${this.CATS[this._pendingAddCat].icon} ${this.CATS[this._pendingAddCat].label} 습관 추가`,
      '<div class="modal-row"><label class="modal-lbl">습관 이름 *</label>' +
      '<input id="habitName" type="text" placeholder="' +
        (this._pendingAddCat==='dev' ? '예: 독서 30분' : '예: 물 2L 마시기') + '" class="inp"></div>' +
      '<div class="modal-row"><label class="modal-lbl">분류</label>' +
      this._catPickerHtml(this._pendingAddCat, 'hAddCat') + '</div>' +
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
    const cat = document.querySelector('input[name="hAddCat"]:checked')?.value
             || this._pendingAddCat || 'life';
    list.push({
      id: 'h'+Date.now(),
      name,
      emoji: '',
      cat: this.CATS[cat] ? cat : 'life',
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
    App.openModal('@check 습관 편집',`
      <div class="modal-row"><label class="modal-lbl">이름</label>
        <input id="hEditName" type="text" value="${esc(h.name)}" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">이모지</label>
        <input id="hEditEmoji" type="text" value="${h.emoji||''}" class="inp" style="width:80px" maxlength="2"></div>
      <div class="modal-row"><label class="modal-lbl">분류</label>
        ${this._catPickerHtml(this._catOf(h),'hEditCat')}</div>
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
    const cat=document.querySelector('input[name="hEditCat"]:checked')?.value;
    if(this.CATS[cat]) h.cat=cat;
    const days=[...document.querySelectorAll('.day-edit-chk:checked')].map(c=>parseInt(c.value));
    h.days=days.length?days:[0,1,2,3,4,5,6];
    this.saveList(list);
    this.render(App?.S?.selDate||new Date());
    App.closeModal(); App.showToast('저장됨 ✓','success');
  },

  showManageModal() { this.showInlineAdd(); },
};
