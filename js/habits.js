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

  // 분류.
  // 예전엔 '일상' 과 '자기개발' 두 칸이었고 카드 위에 탭이 있었다. 탭 하나에 습관 두어 개씩이라
  // 매번 건너다니며 확인해야 했고, 안 보고 있는 쪽은 그냥 안 하게 됐다.
  // 지금은 한 목록에 다 있고, 분류는 줄에 붙는 이름표일 뿐이다.
  // 기본 분류. 사용자가 추가·삭제할 수 있어서 실제 목록은 CATS(getter)가 저장값에서 만든다.
  // '기타' 는 지울 수 없다 — 분류가 지워진 습관이 갈 곳이 있어야 한다.
  BASE_CATS: [
    { id:'ex',    label:'운동', ic:'dumbbell' },
    { id:'study', label:'공부', ic:'book'     },
    { id:'med',   label:'약',   ic:'pill'     },
    { id:'code',  label:'개발', ic:'code'     },
    { id:'etc',   label:'기타', ic:'list'     },
  ],
  _catList() {
    let v = null;
    try { v = JSON.parse(UserStore.get('gl_habit_cats') || 'null'); } catch {}
    const list = Array.isArray(v) && v.length ? v : this.BASE_CATS.slice();
    if (!list.some(c => c.id === 'etc')) list.push({ id:'etc', label:'기타', ic:'list' });
    return list;
  },
  _saveCats(list) { UserStore.set('gl_habit_cats', JSON.stringify(list)); FirebaseSync?.scheduleSave(); },
  // 줄마다 _catOf → CATS 를 부른다(트래커·연속 계산에서는 수백 번). 저장 문자열이 같으면 지난번 표를 쓴다.
  get CATS() {
    let raw = null; try { raw = UserStore.get('gl_habit_cats'); } catch {}
    const c = this._catsC;
    if (c && c.raw === raw && c.u === UserStore.getUser()) return c.o;
    const o = {};
    this._catList().forEach(c => { o[c.id] = { label:c.label, ic:c.ic || 'list' }; });
    this._catsC = { raw, u: UserStore.getUser(), o };
    return o;
  },
  addCat(btn) {
    const name = (prompt('새 분류 이름', '') || '').trim().slice(0, 8);
    if (!name) return;
    const list = this._catList();
    if (list.some(c => c.label === name)) { App.showToast('이미 있는 분류입니다', 'error'); return; }
    const id = 'c' + Date.now().toString(36);
    list.splice(list.length - 1, 0, { id, label:name, ic:'list' });   // '기타' 앞에 넣는다
    this._saveCats(list);
    this._repaintPicker(btn, id);
  },
  delCat(id, btn) {
    if (id === 'etc') return;
    const C = this.CATS[id]; if (!C) return;
    const n = this.getList().filter(h => !h.deletedFrom && this._catOf(h) === id).length;
    if (!confirm(`'${C.label}' 분류를 삭제할까요?` + (n ? `\n이 분류의 습관 ${n}개는 '기타'로 옮겨집니다.` : ''))) return;
    this._saveCats(this._catList().filter(c => c.id !== id));
    this._repaintPicker(btn, 'etc');
  },
  _repaintPicker(btn, selected) {
    const box = btn?.closest('.cat-box'); if (!box) return;
    const name = box.dataset.name;
    const cur = box.querySelector(`input[name="${name}"]:checked`)?.value;
    const sel = selected || (this.CATS[cur] ? cur : 'etc');
    const editing = box.classList.contains('editing');
    box.outerHTML = this._catPickerHtml(sel, name, editing);
    const med = document.querySelector('.med-row');
    if (med) med.hidden = sel !== 'med';
  },
  toggleCatEdit(btn) {
    const box = btn.closest('.cat-box'); box?.classList.toggle('editing');
    btn.textContent = box?.classList.contains('editing') ? '완료' : '편집';
  },
  // 새 '개발' 을 'dev' 로 부르지 않는 이유: 예전 값 'dev' 가 '자기개발' 이었다.
  // 같은 글자가 두 가지 뜻이면 어느 쪽인지 영영 알 수 없는 데이터가 된다.
  // 예전 값은 읽는 시점에만 옮긴다 — 저장을 통째로 다시 쓰면 동기화가 한 번 크게 출렁인다.
  //   'dev'(자기개발) → 공부,  'life'·없음 → 기타
  _catOf(h) {
    const c = h && h.cat;
    const C = this.CATS;
    if (C[c]) return c;
    if (c === 'dev' && C.study) return 'study';
    return c === 'dev' ? 'study' : 'etc';
  },

  _lk(k) { return UserStore.key(k); },

  getList() {
    const v = UserStore.parse('gl_habits_list', null);
    return Array.isArray(v) ? v : JSON.parse(JSON.stringify(this.DEFAULTS));
  },
  // 읽기 전용 목록(고치지 말 것) — 같은 저장 문자열이면 다시 파싱하지 않는다
  _listRO() {
    const v = UserStore.json('gl_habits_list', null);
    return Array.isArray(v) ? v : this.DEFAULTS;
  },
  saveList(v) { UserStore.set('gl_habits_list', JSON.stringify(v)); FirebaseSync?.scheduleSave(); },

  _dateStr(date) {
    const d=new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _dateKey(date) { return `gl_habits_${this._dateStr(date)}`; },
  getChecked(date=new Date()) { return this._chkRO(date).slice(); },
  // 읽기 전용 체크 목록 — 연속·트래커·달력처럼 날마다 읽는 곳에서 쓴다
  _chkRO(date=new Date()) { const v = UserStore.json(this._dateKey(date), null); return Array.isArray(v) ? v : []; },
  setChecked(v,date=new Date()) { UserStore.set(this._dateKey(date), JSON.stringify(v)); FirebaseSync?.scheduleSave(); try{ LocalNotify?.reschedule(); }catch(e){} },

  // cat 을 넘기지 않으면 전체 카테고리를 반환한다 (스탯 배너 등 기존 호출 호환)
  getHabitsForDate(date=new Date(), cat=null) {
    return this._forDate(this._listRO(), date, cat);
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

  // ── 습관 농도 ─────────────────────────
  // 하루치 체크는 '오늘 했나' 만 말한다. 여러 날을 겹쳐 깔면 '요즘 무너지고 있나' 가 보인다 —
  // 연속 기록(🔥)이 못 보여주는 것이다. 끊긴 날은 0 이 되고 끝이지만, 여기선 자국이 남는다.
  //
  // 예전엔 습관 카드 안에 '최근 5주' 격자를 따로 뒀는데, 바로 위에 달력이 또 있었다.
  // 달력 두 개가 나란히 있으면 어느 쪽이 무엇인지 매번 다시 읽어야 한다.
  // 그래서 농도를 달력 칸 바탕으로 옮겼다 — 5주가 아니라 한 달을 통으로 본다.
  _level(done, total) {
    if (!total) return -1;                 // 그날 할 습관이 아예 없었다 (쉰 날 ≠ 무너진 날)
    const r = done / total;
    return r===0 ? 0 : r<0.34 ? 1 : r<0.67 ? 2 : r<1 ? 3 : 4;
  },

  // 달력이 한 달치를 한 번에 받아 간다. 날마다 getList() 를 부르면 JSON 을 31번 파싱한다.
  monthLevels(year, month) {               // month 는 0부터
    const all = this._listRO();
    const end = new Date(); end.setHours(0,0,0,0);
    const n = new Date(year, month+1, 0).getDate();
    const out = {};
    for (let d=1; d<=n; d++) {
      const dt = new Date(year, month, d);
      if (dt > end) continue;              // 아직 오지 않은 날은 칠할 것이 없다
      const hs = this._forDate(all, dt, null);
      if (!hs.length) continue;
      const chk  = this._chkRO(dt);
      const done = hs.filter(h => chk.includes(h.id)).length;
      out[d] = { lv: this._level(done, hs.length), done, total: hs.length };
    }
    return out;
  },

  // ── 트래커: 월간(습관 × 날짜 격자) · 연간(습관 × 12달 달성률) ─────────────
  // 종이 해빗 트래커처럼 한 장에 펼쳐 본다. 칸: 함 = 주황 / 할 날인데 안 함 = 빈칸 / 할 날 아님 = 점 / 아직 = 비움
  openTracker(mode='m', y, m) {
    const now = new Date();
    this._trk = { mode, y: y ?? now.getFullYear(), m: m ?? now.getMonth() }; this._trkDetail = false;
    App.openModal('@check 습관 트래커', `<div class="trk" id="trkBox"></div>`, () => this._trkPaint());
    this._trkPaint();
  },
  _trkGo(k, v) {
    const t = this._trk; if (!t) return;
    if (k === 'mode') t.mode = v;
    if (k === 'm') t.m = v;
    if (k === 'y') { t.y += v; }
    if (k === 'step') { t.m += v; if (t.m < 0) { t.m = 11; t.y--; } if (t.m > 11) { t.m = 0; t.y++; } }
    try { Haptic.light(); } catch (e) {}
    this._trkPaint();
  },
  // 그 기간에 하루라도 할 날이 있었던 습관(지운 습관도 지우기 전 기록은 남긴다)
  _trkRows(all, from, to) {
    const a = this._dateStr(from), b = this._dateStr(to);
    return all.filter(h => !(h.createdAt && h.createdAt > b) && !(h.deletedFrom && h.deletedFrom <= a));
  },
  _trkPaint() {
    const box = document.getElementById('trkBox'), t = this._trk; if (!box || !t) return;
    const all = this._listRO(), today = new Date(); today.setHours(0,0,0,0);
    const name = h => `${h.emoji ? esc(h.emoji)+' ' : ''}${esc(h.name)}`;
    const D31 = Array.from({ length:31 }, (_, i) => i+1);
    const seg = `<div class="trk-seg" role="tablist">
        <button type="button" class="${t.mode==='m'?'on':''}" onclick="Habits._trkGo('mode','m')">월간</button>
        <button type="button" class="${t.mode==='y'?'on':''}" onclick="Habits._trkGo('mode','y')">연간</button></div>`;
    // 하루치 요약 — 칸 농도(0~4)와 '다 했음'
    const dayInfo = d => {
      const hs = this._forDate(all, d), ck = this._chkRO(d);
      const dn = hs.filter(h => ck.includes(h.id)).length, tot = hs.length;
      const r = tot ? dn/tot : -1;
      return { dn, tot, lv: r < 0 ? 'x' : r===0 ? 0 : r<.34 ? 1 : r<.67 ? 2 : r<1 ? 3 : 4, full: tot>0 && dn===tot };
    };
    const head = `<div class="trk-row trk-dn"><span class="trk-l"></span>${D31.map(i => `<span>${[1,5,10,15,20,25,31].includes(i)?i:''}</span>`).join('')}<span class="trk-pc"></span></div>`;
    let tDone = 0, tDue = 0, html = '';
    if (t.mode === 'm') {
      // 월간: 달력(월~일 7칸). 칸 농도 = 그날 달성률, 다 한 날 체크. 습관별 횟수는 '세부 정보 보기' 안에.
      const n = new Date(t.y, t.m+1, 0).getDate(), first = new Date(t.y, t.m, 1), last = new Date(t.y, t.m, n);
      const rows = this._trkRows(all, first, last), lead = (first.getDay() + 6) % 7, DOWS = '월화수목금토일';   // 월요일부터
      const per = rows.map(h => ({ h, dn:0, due:0 }));
      const cells = [];
      for (let k = 0; k < lead; k++) cells.push('<i class="cd pad"></i>');
      for (let i = 1; i <= n; i++) {
        const d = new Date(t.y, t.m, i), ds = this._dateStr(d), isT = ds === this._dateStr(today);
        if (d > today) { cells.push(`<i class="cd fut"><span class="num">${i}</span></i>`); continue; }
        const k = dayInfo(d), ck = this._chkRO(d);
        per.forEach(p => { if (this._forDate([p.h], d).length) { p.due++; if (ck.includes(p.h.id)) p.dn++; } });
        tDone += k.dn; tDue += k.tot;
        cells.push(`<i class="c cd lv${k.lv}${k.full?' full':''}${isT?' now':''}" data-d="${ds}"><span class="num">${i}</span></i>`);
      }
      while (cells.length % 7) cells.push('<i class="cd pad"></i>');
      const fullN = cells.filter(c => c.includes(' full')).length;
      const pct = tDue ? Math.round(tDone/tDue*100) : 0;
      const open = !!this._trkDetail;
      html = `${seg}
        <div class="trk-hd">
          <button type="button" class="trk-nav" onclick="Habits._trkGo('step',-1)" aria-label="이전 달">‹</button>
          <div class="trk-ttl"><b class="num">${t.y}.${String(t.m+1).padStart(2,'0')}</b><span>${tDue?`다 채운 날 ${fullN}일 · 할 일 ${tDue}번 중 ${tDone}번`:'기록 없음'}</span></div>
          <button type="button" class="trk-nav" onclick="Habits._trkGo('step',1)" aria-label="다음 달">›</button>
          <div class="trk-big"><b class="num">${pct}</b><i>%</i></div>
        </div>
        <div class="trk-months">${D31.slice(0,12).map(i => `<button type="button" class="${i-1===t.m?'on':''}" onclick="Habits._trkGo('m',${i-1})">${i}</button>`).join('')}</div>
        <div class="trk-sheet trk-cal">
          <div class="trk-dow">${[...DOWS].map((w,i) => `<span class="${i===5?'sat':i===6?'sun':''}">${w}</span>`).join('')}</div>
          <div class="trk-cg">${cells.join('')}</div>
        </div>
        <div class="trk-key"><span><i class="c lv1"></i><i class="c lv2"></i><i class="c lv3"></i><i class="c lv4"></i>적게 → 많이</span><span><i class="c lv4 full"></i>다 함</span></div>
        ${rows.length ? `<button type="button" class="trk-more${open?' open':''}" onclick="Habits._trkDetail=!Habits._trkDetail;Habits._trkPaint()">세부 정보 ${open?'접기':'보기'}<i>›</i></button>
        ${open ? `<div class="trk-det">${per.map(p => `<div class="trk-dr"><span class="trk-dn2">${name(p.h)}</span><span class="trk-dc">${p.due?`${p.due}번 중 ${p.dn}번`:'할 날 없음'}</span><b class="num">${p.due?Math.round(p.dn/p.due*100)+'%':'—'}</b></div>`).join('')}</div>` : ''}` : ''}
        <p class="trk-note">날짜를 누르면(PC는 올려 두면) 그날 무엇을 했는지 보입니다.</p>`;
    } else {
      // 연간: 12달 × 31일 = 한 장. 없는 날(2월 30일 등)은 X, 칸 농도는 그날 달성률, 다 한 날은 체크
      let full = 0;
      const rows = Array.from({ length:12 }, (_, m) => {
        const n = new Date(t.y, m+1, 0).getDate(); let md = 0, mu = 0;
        const cells = D31.map(i => {
          if (i > n) return `<i class="c no"></i>`;
          const d = new Date(t.y, m, i); if (d > today) return `<i class="c fut"></i>`;
          const k = dayInfo(d); md += k.dn; mu += k.tot; if (k.full) full++;
          return `<i class="c lv${k.lv}${k.full?' full':''}" data-d="${this._dateStr(d)}"></i>`;
        }).join('');
        tDone += md; tDue += mu;
        return `<div class="trk-row"><button type="button" class="trk-l trk-ml" onclick="Habits._trk.m=${m};Habits._trkGo('mode','m')">${m+1}월</button>${cells}<b class="trk-pc num">${mu?Math.round(md/mu*100)+'%':'—'}</b></div>`;
      }).join('');
      const pct = tDue ? Math.round(tDone/tDue*100) : 0;
      html = `${seg}
        <div class="trk-hd">
          <button type="button" class="trk-nav" onclick="Habits._trkGo('y',-1)" aria-label="이전 해">‹</button>
          <div class="trk-ttl"><b class="num">${t.y}</b><span>${tDue?`다 채운 날 ${full}일 · 할 일 ${tDue.toLocaleString('ko-KR')}번 중 ${tDone.toLocaleString('ko-KR')}번`:'기록 없음'}</span></div>
          <button type="button" class="trk-nav" onclick="Habits._trkGo('y',1)" aria-label="다음 해">›</button>
          <div class="trk-big"><b class="num">${pct}</b><i>%</i></div>
        </div>
        <div class="trk-sheet trk-year">${head}${rows}</div>
        <div class="trk-key"><span><i class="c lv1"></i><i class="c lv2"></i><i class="c lv3"></i><i class="c lv4"></i>적게 → 많이</span><span><i class="c lv4 full"></i>다 함</span><span><i class="c no"></i>없는 날</span></div>
        <p class="trk-note">칸을 누르면(PC는 올려 두면) 그날 무엇을 했는지 보입니다. 달 이름을 누르면 그 달 격자로 갑니다.</p>`;
    }
    box.innerHTML = html;
    this._trkTipBind(box);
  },
  // 칸 설명 — 마우스는 올리면, 손가락은 누르면
  _trkTipBind(box) {
    const sheet = box.querySelector('.trk-sheet'); if (!sheet) return;
    const DOW = '일월화수목금토';
    const show = cell => {
      const ds = cell?.dataset?.d; let tip = document.getElementById('trkTip');
      if (!ds) { tip?.remove(); return; }
      const d = new Date(ds+'T00:00:00'), hs = this._forDate(this._listRO(), d), ck = this._chkRO(d);
      const dn = hs.filter(h => ck.includes(h.id)).length;
      if (!tip) { tip = document.createElement('div'); tip.id = 'trkTip'; tip.className = 'trk-tip'; document.body.appendChild(tip); }
      tip.innerHTML = `<div class="trk-tip-h"><b>${d.getMonth()+1}월 ${d.getDate()}일 (${DOW[d.getDay()]})</b><span class="num">${dn}/${hs.length}</span></div>`
        + (hs.length ? hs.map(h => `<div class="trk-tip-r${ck.includes(h.id)?' on':''}"><i></i>${esc(h.name)}</div>`).join('') : '<div class="trk-tip-r">할 습관이 없던 날</div>');
      const r = cell.getBoundingClientRect(), w = 200;
      tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width/2 - w/2)) + 'px';
      tip.style.top = '0px'; tip.classList.add('on');
      const h = tip.offsetHeight; const above = r.top - h - 8;
      tip.style.top = (above > 8 ? above : r.bottom + 8) + 'px';
      sheet.querySelectorAll('.c.sel').forEach(x => x.classList.remove('sel')); cell.classList.add('sel');
    };
    sheet.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') show(e.target.closest('.c')); });
    sheet.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { document.getElementById('trkTip')?.remove(); sheet.querySelectorAll('.c.sel').forEach(x => x.classList.remove('sel')); } });
    sheet.addEventListener('click', e => { const c = e.target.closest('.c'); if (c) { show(c); try { Haptic.light(); } catch (er) {} } });
    if (!this._trkTipOff) { this._trkTipOff = true; document.addEventListener('pointerdown', e => { if (!e.target.closest('.trk-sheet .c')) document.getElementById('trkTip')?.remove(); }, true); }
  },

  // 예전엔 365일을 도는 동안 날마다 목록 전체를 다시 파싱했다(습관 8개면 한 번 그릴 때 3천 번).
  // 목록은 한 번만 읽고, 날짜별 체크는 _days(같은 그리기 안에서 습관끼리 나눠 쓰는 표)에 담아 둔다.
  // 반복 요일 아래 한 줄: 무엇이 골라졌는지 글로도 보여 준다(주식 '담김' 처럼 확실하게)
  _daySum(box) {
    if (!box) return;
    const on = [...box.querySelectorAll('input:checked')].map(c => +c.value).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const el = box.nextElementSibling; if (!el || !el.classList.contains('day-sum')) return;
    const lbl = on.length === 7 || !on.length ? '매일' : on.length === 5 && [1,2,3,4,5].every(x => on.includes(x)) ? '평일' : on.length === 2 && [0,6].every(x => on.includes(x)) ? '주말' : on.map(d => this.DAYS_KO[d]).join('·');
    el.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg><b>${lbl}</b> 반복${on.length && on.length < 7 ? ` · 주 ${on.length}회` : ''}${!on.length ? ' (하나도 안 고르면 매일로 저장)' : ''}`;
  },
  streak(id, _days) {
    let n=0; const today=new Date();
    const h=this._listRO().find(x=>x.id===id);
    const days=_days||new Map();
    for(let i=0;i<=365;i++){
      const d=new Date(today); d.setDate(today.getDate()-i);
      if(h&&h.days&&!h.days.includes(d.getDay())) continue;
      let chk=days.get(i); if(!chk){ chk=this._chkRO(d); days.set(i,chk); }
      if(!chk.includes(id)) break;
      n++;
    }
    return n;
  },

  init(date=new Date()) { this.render(date); },

  render(date=new Date()) { this._renderCard(date); },

  _renderCard(date=new Date()) {
    const wrap=document.getElementById('habitsWrap'); if(!wrap) return;
    const list=this.getHabitsForDate(date);
    const chk=this._chkRO(date);
    const isToday=this._dateStr(date)===this._dateStr(new Date());
    const done=list.filter(h=>chk.includes(h.id)).length;
    const reorder=false;
    const stDays=new Map(), CATS=this.CATS, ds2=this._dateStr(date);

    const titleEl=document.querySelector('.card-habits .card-title');
    if(titleEl){
      const dLbl=new Date(date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
      // textContent 로 쓰면 머리글 아이콘까지 지워진다. Icons.title 로 통일한다.
      Icons.title(titleEl, 'check', isToday?'오늘의 습관':`${dLbl} 습관`);
    }

    wrap.innerHTML=list.map(h=>{
      const isDone=chk.includes(h.id);
      const st=this.streak(h.id, stDays);
      const _d = h.days||[];
      let daysLabel = '';
      if(_d.length===7 || _d.length===0) daysLabel='<span class="habit-days">매일</span>';
      else if(_d.length===5&&[1,2,3,4,5].every(x=>_d.includes(x))) daysLabel='<span class="habit-days">평일</span>';
      else if(_d.length===2&&[0,6].every(x=>_d.includes(x))) daysLabel='<span class="habit-days">주말</span>';
      else daysLabel=`<span class="habit-days">${_d.map(d=>this.DAYS_KO[d]).join('')}</span>`;
      const cat=this._catOf(h), C=CATS[cat]||CATS.etc||{ic:'list'};
      // 약은 '몇 시에' 가 이름만큼 중요하다. 그것만 줄에 붙인다.
      const timeLabel = (h.time && (cat==='med' || h.notify===true))
        ? `<span class="habit-time">${esc(h.time)}${h.notify===false?'':' · 알림'}</span>` : '';
      // 순서 바꾸는 중에는 밀기·길게누르기를 붙이지 않는다 — 끌어야 하는데 삭제가 열린다.
      return `<div class="habit-item${isDone?' done':''}${reorder?' reorder-mode':''}"
        data-reorderable="${h.id}"${reorder?'':` data-row data-i="${h.id}" data-label="${esc(h.name)}"`}>
        ${reorder?`<div class="reorder-handle" onclick="event.stopPropagation()" title="꾹 눌러서 순서 변경">⠿</div>`:''}
        <div class="habit-chk" onclick="event.stopPropagation();Habits._handleTap('${h.id}','${ds2}')">${isDone?'✓':''}</div>
        <span class="habit-name" onclick="event.stopPropagation();Habits.showEditHabit('${h.id}')"
          >${Icons.svg(C.ic,'hb-cat-ic')}${h.emoji?esc(h.emoji)+' ':''}${esc(h.name)}${timeLabel}${daysLabel}</span>
        ${st>0&&!reorder?`<span class="habit-streak">${st}일 연속</span>`:''}
        ${reorder?`<button class="cl-del-btn edit-del-btn" onclick="event.stopPropagation();Habits._delFrom('${h.id}','${ds2}')" title="삭제">✕</button>`:''}
      </div>`;
    }).join('')
    + (list.length ? '' : `<p class="empty">${Icons.big('check')}습관이 없습니다</p>`)
    + `<div class="habit-add-btn" onclick="Habits.showInlineAdd(App?.S?.selDate)">+ 습관 추가</div>`;

    // 밀기·길게누르기·✕ 를 붙인다 (js/rowui.js)
    // 길게 누르면 끌어서 순서를 바꾼다. 수정은 이름을 누르면 열린다.
    try { RowUI.paint(wrap, {
      edit: id => this.showEditHabit(id),
      del:  id => this._delFrom(id, this._dateStr(date)),
      reorder: order => this._applyOrder(order),
    }); } catch(e) { console.warn('RowUI', e); }
    try { Fold.apply(wrap, 'habits'); } catch(e) {}

    // 지난 다섯 주 격자는 여기 있었는데 달력 칸 바탕으로 옮겼다(monthLevels).
    // 한 화면에 달력이 둘이면 어느 쪽이 무엇인지 매번 다시 읽어야 한다.
    // 이번 주(월~일) 완료 개수 띠 — 많이 지킨 날일수록 진한 주황 (시안 04)
    const foot=document.getElementById('habitsFooter');
    if(foot){
      if(!list.length){ foot.innerHTML=''; }
      else {
        const all=this._listRO(), base=new Date(date); base.setHours(0,0,0,0);
        const cells=[];
        // 보는 날이 든 주를 월→일 순으로. 오늘은 주황 테두리, 오늘이 아닌 날을 보고 있으면 그날은 흰 테두리
        const mon=new Date(base); mon.setDate(base.getDate()-((base.getDay()+6)%7));
        const t0=new Date(); t0.setHours(0,0,0,0);
        for(let i=0;i<7;i++){
          const d=new Date(mon); d.setDate(mon.getDate()+i);
          const fut=d>t0, isT=+d===+t0, isSel=+d===+base;
          const hs=this._forDate(all,d,null), ck=this._chkRO(d);
          const dn=hs.filter(h=>ck.includes(h.id)).length, tot=hs.length;
          const r=tot?dn/tot:0, lv=fut||!tot?0:r===0?0:r<.34?1:r<.67?2:r<1?3:4;
          const wd=d.getDay();
          cells.push(`<div class="hw${isT?' today':isSel?' cur':''}${fut?' fut':''}${wd===6?' sat':wd===0?' sun':''}"><span>${this.DAYS_KO[wd]}</span><i class="lv${lv}">${tot&&!fut?dn:''}</i></div>`);
        }
        foot.innerHTML=`<div class="hw-row">${cells.join('')}</div><div class="hw-sum"><b class="num">${done}</b> / ${list.length} 완료<button type="button" class="hw-open" onclick="Habits.openTracker('m')">월간 · 연간 기록 ›</button></div>`;
      }
    }
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
      const todayList=this.getHabitsForDate(date);
      const all=todayList.length>0&&todayList.every(h=>chk.includes(h.id));
      this._fx(id, all, todayList.length);
      if(all) { setTimeout(()=>Sounds?.achieve(),200); setTimeout(()=>{ try{ Haptic.success(); }catch(e){} },120); }
    } else { Sounds?.uncheck(); }
  },

  toggle(id,date=new Date()) {
    const chk=this.getChecked(date);
    const i=chk.indexOf(id);
    if(i===-1) chk.push(id); else chk.splice(i,1);
    try { Haptic.light(); } catch(e){}
    const isDoneNow=!chk.includes(id);
    this.setChecked(chk,date);
    this.render(date);
    if(typeof App!=='undefined') App._updateStatsBanner();
    if(isDoneNow){
      Sounds?.check();
      // 퍼펙트 달성 체크
      const newChk=this.getChecked(date);
      const todayList=this.getHabitsForDate(date);
      const all=todayList.length>0&&todayList.every(h=>newChk.includes(h.id));
      this._fx(id, all, todayList.length);
      if(all) setTimeout(()=>Sounds?.achieve(),200);
    } else { Sounds?.uncheck(); }
  },
  // 체크 애니메이션(설정에서 켰을 때만) — 다시 그린 뒤의 체크칸을 찾아 터뜨린다
  _fx(id, all, n) {
    if (typeof Fx==='undefined') return;
    const first = Fx.unset;              // 처음 체크: 기본으로 보여 주고 나서 켤지 묻는다
    if (!first && !Fx.on) return;
    try {
      Fx.check(document.querySelector(`#habitsWrap .habit-item[data-reorderable="${id}"] .habit-chk`), first);
      if (all) setTimeout(()=>Fx.perfect(document.querySelector('.card-habits'), n, first), 260);
      if (first) setTimeout(()=>Fx.ask(), all ? 2000 : 1100);
    } catch(e) { console.warn('fx', e); }
  },

  // 화면에 보이는 순서대로 세운다.
  _applyOrder(newOrder) {
    const list = this.getList();
    // 그날 보이는 습관끼리만 자리를 바꾸고, 안 보이는 습관(다른 요일 등)은 제자리에 둔다
    const vis = new Set(newOrder);
    const q = newOrder.map(id => list.find(h => h.id === id)).filter(Boolean);
    const ordered = list.map(h => vis.has(h.id) ? (q.shift() || h) : h);
    this.saveList(ordered);
    Sounds?.click();
  },
  toggleReorderMode() {},

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
  _pendingAddCat: 'etc',

  // 카테고리 선택 UI (추가/편집 모달 공용)
  _catPickerHtml(selected, name, editing=false) {
    return `<div class="cat-box${editing?' editing':''}" data-name="${name}"><div class="cat-picker">` + Object.entries(this.CATS).map(([c,C]) =>
      `<label class="cat-pick-btn${c===selected?' on':''}">
         <input type="radio" name="${name}" value="${c}" ${c===selected?'checked':''}
                onchange="Habits._syncCatPicker(this)">${Icons.svg(C.ic,'hb-cat-ic')}<span>${esc(C.label)}</span>
         ${c==='etc'?'':`<button type="button" class="cat-del" onclick="event.preventDefault();event.stopPropagation();Habits.delCat('${c}',this)" aria-label="${esc(C.label)} 분류 삭제">✕</button>`}
       </label>`).join('')
      + `<button type="button" class="cat-add" onclick="Habits.addCat(this)">+ 분류</button>`
      + `</div><button type="button" class="cat-edit-tg" onclick="Habits.toggleCatEdit(this)">${editing?'완료':'편집'}</button></div>`;
  },
  _syncCatPicker(input) {
    const box = input.closest('.cat-picker');
    box?.querySelectorAll('.cat-pick-btn')
      .forEach(l => l.classList.toggle('on', l.querySelector('input')?.checked));
    // '약' 을 고를 때만 시각 칸이 나온다. 늘 띄워 두면 나머지 넷에서 뜻 없는 칸이 된다.
    // 약으로 바꾸면 알림을 기본으로 켠다(약은 시각이 이름만큼 중요하다)
    const row = document.querySelector('.rm-row');
    if (row) { const wasMed = row.dataset.med === '1', isMed = input.value === 'med'; row.dataset.med = isMed ? '1' : '0';
      row.querySelector('.modal-lbl').textContent = isMed ? '복용 시각 · 알림' : '알림';
      if (isMed && !wasMed) this._rmOn(true); }
  },

  // 알림 칸 — 약은 처음부터 켜져 있고, 다른 습관은 '알림 설정하기' 를 눌러 켠다.
  // 시각은 웹에서는 시계 칸, 앱에서는 시·분 두 줄 휠로 고른다.
  _medRowHtml(cat, time, notify) {
    const med = cat === 'med', on = med ? notify !== false : (notify === true && !!time);
    const t = time || (med ? '09:00' : '21:00');
    const nat = typeof Platform !== 'undefined' && Platform.native;
    return `<div class="modal-row med-row rm-row" data-on="${on?1:0}" data-med="${med?1:0}">
      <label class="modal-lbl">${med?'복용 시각 · 알림':'알림'}</label>
      <button type="button" class="rm-add" onclick="Habits._rmOn(true)">${typeof Icons!=='undefined'?Icons.svg('bell'):''}<span>알림 설정하기</span></button>
      <div class="rm-body">
        <div class="med-line">
          ${nat ? `<input id="hMedTime" type="hidden" value="${esc(t)}"><div id="hRmWheel" class="rm-wheel"></div>`
                : `<input id="hMedTime" type="time" class="inp inp-sm num" value="${esc(t)}">`}
          <button type="button" class="rm-off" onclick="Habits._rmOn(false)">알림 끄기</button>
        </div>
        <div class="med-note">${med ? '5분 전에 한 번 알리고, 체크가 없으면 한 시간마다 다시 알립니다. 자정이 지나면 처음으로 돌아갑니다.' : '정한 시각에 아직 체크하지 않았으면 알려 드립니다. 반복 요일에만 울립니다.'}</div>
      </div>
    </div>`;
  },
  _rmOn(on) {
    const row = document.querySelector('.rm-row'); if (!row) return;
    row.dataset.on = on ? '1' : '0';
    if (on) this._rmWheel();
    try { Haptic.light(); } catch (e) {}
  },
  _rmWheel() {
    const box = document.getElementById('hRmWheel'), inp = document.getElementById('hMedTime');
    if (!box || !inp || box.childElementCount || typeof Wheel === 'undefined' || document.querySelector('.rm-row')?.dataset.on !== '1') return;
    const [h, m] = String(inp.value || '09:00').split(':').map(Number);
    const H = Array.from({ length:24 }, (_, i) => i), M = Array.from({ length:12 }, (_, i) => i*5);
    Wheel.inline(box, [
      { vals:H, cur:h||0, fmt:v => String(v).padStart(2,'0')+'시' },
      { vals:M, cur:M.reduce((a,b) => Math.abs(b-(m||0)) < Math.abs(a-(m||0)) ? b : a, 0), fmt:v => String(v).padStart(2,'0')+'분' },
    ], ([hh, mm]) => { inp.value = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; });
  },
  // 저장: 알림을 켰으면 시각과 함께, 껐으면 약은 시각만 남기고 다른 습관은 지운다
  _rmApply(h) {
    const row = document.querySelector('.rm-row'), on = row?.dataset.on === '1';
    const t = document.getElementById('hMedTime')?.value;
    if (h.cat === 'med') { h.time = t || h.time || '09:00'; h.notify = on; }
    else if (on) { h.time = t || '21:00'; h.notify = true; }
    else { delete h.time; delete h.notify; }
  },

  showInlineAdd(baseDate, cat='etc') {
    // baseDate 미전달 시 현재 선택된 날짜 사용, 없으면 오늘
    this._pendingAddDate = baseDate || App?.S?.selDate || new Date();
    this._pendingAddCat  = this.CATS[cat] ? cat : 'etc';
    const baseDateStr = this._dateStr(this._pendingAddDate);
    const today = this._dateStr(new Date());
    const dateLabel = baseDateStr !== today
      ? ` (${new Date(baseDateStr + 'T00:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}부터)`
      : '';
    const dayBtns = this.DAYS_KO.map((d,i) =>
      '<label class="day-pick-btn">' +
      '<input type="checkbox" value="' + i + '" checked class="hday-chk"><span>' + d + '</span>' +
      '</label>'
    ).join('');
    App.openModal('@check 습관 추가',
      '<div class="hb-sheet">' +
      '<div class="modal-row"><label class="modal-lbl" for="habitName">습관 이름</label>' +
      '<input id="habitName" type="text" placeholder="예: 물 2L 마시기" class="inp"></div>' +
      '<div class="modal-row hb-cat-row"><label class="modal-lbl">분류</label>' +
      this._catPickerHtml(this._pendingAddCat, 'hAddCat') + '</div>' +
      this._medRowHtml(this._pendingAddCat, null, undefined) +
      '<div class="modal-row"><label class="modal-lbl">반복 요일</label>' +
      '<div class="day-picker" onchange="Habits._daySum(this)">' + dayBtns + '</div><div class="day-sum"></div>' +
      `<div class="hb-meta">시작일 <span class="num">${baseDateStr}</span>${dateLabel}</div></div>` +
      '<div class="modal-btns hb-acts">' +
      '<button id="btnHabitAdd" class="btn-sm accent hb-go">추가</button>' +
      '<div class="hb-acts-sub"><button onclick="App.closeModal()" class="btn-sm hb-ghost">취소</button></div>' +
      '</div></div>'
    );
    setTimeout(()=>{ document.querySelectorAll('.day-picker').forEach(b=>this._daySum(b)); },0);
    setTimeout(()=>{
      document.getElementById('habitName')?.focus();
      Habits._rmWheel();
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
    const raw = document.querySelector('input[name="hAddCat"]:checked')?.value
             || this._pendingAddCat || 'etc';
    const cat = this.CATS[raw] ? raw : 'etc';
    const h = {
      id: 'h'+Date.now(),
      name,
      emoji: '',
      cat,
      days: days.length ? days : [0,1,2,3,4,5,6],
      createdAt,  // 선택한 날짜부터 습관 시작
    };
    this._rmApply(h);
    list.push(h);
    this.saveList(list);
    // selDate 기준으로 렌더링
    const renderDate = App?.S?.selDate || new Date();
    this.render(renderDate);
    App.closeModal();
    App.showToast('습관 추가됨','success');
    FirebaseSync?.scheduleSave();
  },

  showEditHabit(id) {
    const h=this.getList().find(x=>x.id===id); if(!h) return;
    App.openModal('@check 습관 편집',`<div class="hb-sheet">
      <div class="modal-row"><label class="modal-lbl" for="hEditName">이름</label>
        <div class="hb-name-line">
          <input id="hEditEmoji" type="text" value="${esc(h.emoji||'')}" class="inp hb-emoji" maxlength="2" placeholder="＋" aria-label="이모지">
          <input id="hEditName" type="text" value="${esc(h.name)}" class="inp">
        </div></div>
      <div class="modal-row hb-cat-row"><label class="modal-lbl">분류</label>
        ${this._catPickerHtml(this._catOf(h),'hEditCat')}</div>
      ${this._medRowHtml(this._catOf(h), h.time, h.notify)}
      <div class="modal-row"><label class="modal-lbl">반복 요일</label>
        <div class="day-picker" onchange="Habits._daySum(this)">
          ${this.DAYS_KO.map((d,i)=>`<label class="day-pick-btn"><input type="checkbox" value="${i}" ${(h.days||[]).includes(i)?'checked':''} class="day-edit-chk"><span>${d}</span></label>`).join('')}
        </div><div class="day-sum"></div>
      </div>
      <div class="modal-btns hb-acts">
        <button onclick="Habits._saveEdit('${id}')" class="btn-sm accent hb-go">저장</button>
        <div class="hb-acts-sub">
          <button onclick="Habits._delFrom('${id}','${this._dateStr(App?.S?.selDate||new Date())}');App.closeModal();" class="btn-danger hb-ghost hb-del">삭제</button>
          <button onclick="App.closeModal()" class="btn-sm hb-ghost">취소</button>
        </div>
      </div></div>`);
    setTimeout(()=>{ document.querySelectorAll('.day-picker').forEach(b=>this._daySum(b)); },0);
    setTimeout(()=>this._rmWheel(), 60);
  },

  _saveEdit(id) {
    const list=this.getList(); const h=list.find(x=>x.id===id); if(!h) return;
    h.name=document.getElementById('hEditName')?.value.trim()||h.name;
    h.emoji=document.getElementById('hEditEmoji')?.value.trim()||h.emoji;
    const cat=document.querySelector('input[name="hEditCat"]:checked')?.value;
    if(this.CATS[cat]) h.cat=cat;
    this._rmApply(h);
    const days=[...document.querySelectorAll('.day-edit-chk:checked')].map(c=>parseInt(c.value));
    h.days=days.length?days:[0,1,2,3,4,5,6];
    this.saveList(list);
    this.render(App?.S?.selDate||new Date());
    App.closeModal(); App.showToast('저장됨','success');
  },

  showManageModal() { this.showInlineAdd(); },
};
