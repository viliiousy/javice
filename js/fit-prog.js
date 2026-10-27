// js/fit-prog.js — 루틴 묶음(분할 프로그램) · 루틴 고르는 칸 · 오늘의 운동 회차(루틴 추가)
//
// 루틴 하나 = 하루치 운동. 루틴 묶음 = 여러 날(예: '초보자 3분할' = 1일차 가슴·삼두 / 2일차 등·이두 / 3일차 하체).
// 고르는 칸에는 묶음 이름만 보이고, 누르면 그 묶음의 날들이 펼쳐져 하루를 고른다(전부 나열하면 너무 길다).
// 묶음은 gl_fit_progs = { id: { name, days:[루틴 id …] } }. 맞춤 플랜(자동)과 홈트는 저절로 묶음으로 보인다.
Object.assign(Fitness, {
  PROG_KEY: 'gl_fit_progs',
  progs() { const v = UserStore.json(this.PROG_KEY, null); return v && typeof v === 'object' ? v : {}; },
  saveProgs(P) { UserStore.set(this.PROG_KEY, JSON.stringify(P)); FirebaseSync?.scheduleSave(); },
  // { progs:[{ id, name, days:[[값, 이름]], user }], solo:[[루틴 id, 이름]] }
  progList() {
    const R = this._rtRO(), P = this.progs(), inP = new Set(), progs = [];
    for (const [pid, g] of Object.entries(P)) {
      const days = (g.days || []).filter(r => R[r]); days.forEach(r => inP.add(r));
      progs.push({ id: pid, name: g.name || '이름 없는 묶음', days: days.map(r => [r, R[r].name]), user: true });
    }
    const auto = Object.entries(R).filter(([id, r]) => r.auto && !inP.has(id));
    if (auto.length) { progs.push({ id: '_auto', name: '맞춤 플랜', days: auto.map(([id, r]) => [id, r.name]) }); auto.forEach(([id]) => inP.add(id)); }
    progs.push({ id: '_home', name: '홈트', days: [['A', 'DAY A 푸시'], ['B', 'DAY B 풀'], ['C', 'DAY C 하체+코어']] });
    const solo = Object.entries(R).filter(([id]) => !inP.has(id)).map(([id, r]) => [id, r.name]);
    return { progs, solo };
  },

  // ── 회차(하루 여러 번) ─────────────────────────
  // 목록에 실제로 운동이 있는 회차만 센다 → { 회차 번호: 보이는 순번(1, 2 …) }
  _sessOrd(list) { const m = new Map(); [...new Set((list || []).map(x => x.sess).filter(v => v != null))].sort((a, b) => a - b).forEach((s, k) => m.set(s, k + 1)); return m; },
  _nSess(list) { return this._sessOrd(list).size; },
  // 회차 이름 — 직접 만든 루틴·홈트는 그 이름, 부위·종목으로 넣은 회차는 실제 운동을 보고 부위를 붙인다
  sessName(plan, si, list) {
    const s = plan && plan.src === 'multi' ? ((plan.sessions || [])[si] || {}) : (plan || {});
    if (s.src === 'routine' || s.src === 'home') return s.name || '';
    const names = (list || []).filter(x => plan && plan.src === 'multi' ? x.sess === si : true).map(x => x.name);
    if (names.length && typeof PlanGen !== 'undefined' && names.every(n => PlanGen.partOf(n) === '스포츠')) return names.join('·');
    return (typeof PlanGen !== 'undefined' && PlanGen.dayLabel(names)) || s.name || '';
  },
  _sessHead(plan, si, list, ord) {
    const k = si != null ? ord.get(si) : null;
    return `<div class="fx-sess${k > 1 || k == null ? ' fx-sess-n' : ''}"><span class="num">${k ?? '+'}</span><b>${esc(si != null ? this.sessName(plan, si, list) : '추가한 운동')}</b></div>`;
  },
  // 수정 중 운동을 빼서 비어 버린 '그날만 더한 회차' 는 없애고 번호를 당긴다(하루 4회 · 6회처럼 숫자만 늘던 문제)
  _pruneSessions(ed) {
    const d = new Date(ed.ds + 'T00:00:00'), xs = this.extraPicks(ed.ds); if (!xs.length) return;
    const plan = this.planOn(d);
    if (plan.src !== 'multi') { if (!ed.list.length) this.setExtraPicks(ed.ds, []); return; }
    const nb = plan.sessions.length - xs.length, last = plan.sessions.length - 1;
    ed.list.forEach(x => { if (x.sess == null) x.sess = last; });   // 회차 없는 운동은 마지막 회차로
    const used = new Set(ed.list.map(x => x.sess)), keep = [], map = {};
    for (let i = 0; i < nb; i++) map[i] = i;
    xs.forEach((v, k) => { const si = nb + k; if (used.has(si)) { map[si] = nb + keep.length; keep.push(v); } });
    if (keep.length === xs.length) return;
    ed.list.forEach(x => { if (map[x.sess] != null) x.sess = map[x.sess]; });
    this.setExtraPicks(ed.ds, keep);
  },

  // ── 종목 추가 — 회차가 둘 이상이면 회차마다 단추가 있고, 그 회차 끝에 넣는다 ──
  edAdd(si) {
    const favs = this.getFavs();
    this.pickOne({ title: si != null ? `${this._sessOrd(this._ed.list).get(si) || ''}회차에 종목 추가` : '종목 추가', recLabel: favs.length ? '즐겨찾기' : '', recommend: favs.map(n => ({ n })),
      onPick: n => {
        const L = this._ed.list, it = { name: n, sets: this.defSets(n), w: '', ...(si != null ? { sess: si } : {}) };
        let at = -1; if (si != null) L.forEach((x, i) => { if (x.sess === si) at = i; });
        if (at >= 0) L.splice(at + 1, 0, it); else L.push(it);
        this._ed.dirty = true; this._edPaint();
      } });
  },

  // ── 고르는 칸 ─────────────────────────────────
  // mode 'day'(요일별 운동): 부위는 눌러서 더하고 빼기(그 부위로 운동을 짠다)
  // mode 'add'(오늘의 운동 › 루틴 추가): 부위를 누르면 그 부위 종목이 뜨고, 골라 담는다
  // 루틴: 묶음 이름 → 누르면 그 묶음의 날들. 묶음에 안 든 루틴은 그대로 하나씩. 스포츠는 접어 둔다.
  RP_PARTS: ['가슴', '등', '하체', '어깨', '팔', '삼두', '이두', '전완근', '복근', '전신', '유산소'],
  rpHtml(cur, opt = {}) {
    cur = String(cur || 'none');
    const add = opt.mode === 'add';
    const on = cur.startsWith('part:') ? cur.slice(5).split(',') : cur === 'cardio' ? ['유산소'] : [];
    const SP = (typeof EX_DB !== 'undefined' && EX_DB['스포츠']) || [];
    const c = (v, l, sel, kind, extra = '') => `<button type="button" class="rp-c${sel ? ' on' : ''}" data-k="${kind}" data-v="${esc(v)}" ${extra} onclick="Fitness._rpTap(this)">${esc(l)}</button>`;
    const { progs, solo } = this.progList();
    const curProg = progs.find(g => g.days.some(([v]) => v === cur));
    return `<div class="rp${add ? ' rp-add' : ''}">
      <div class="rp-l">부위<small>${add ? '누르면 그 부위 종목이 나옵니다 · 골라 담기' : '눌러서 더하고 뺍니다 · 여러 개 가능'}</small></div>
      <div class="rp-cs">${this.RP_PARTS.map(p => c(p, p, !add && on.includes(p), add ? 'pa' : 'p')).join('')}</div>
      ${add ? '<div class="rp-exl"></div>' : ''}
      <div class="rp-l">루틴<small>묶음을 누르면 날을 고릅니다</small></div>
      <div class="rp-cs">
        ${opt.noRest ? '' : c('rest', '휴식', cur === 'rest', 'o') + c('none', '계획 없음', cur === 'none', 'o')}
        ${progs.map(g => `<button type="button" class="rp-c rp-g${curProg === g ? ' on open' : ''}" data-k="g" data-g="${esc(g.id)}" onclick="Fitness._rpTap(this)">${esc(g.name)}<i>${g.days.length}</i></button>`).join('')}
        ${solo.map(([v, l]) => c(v, l, cur === v, 'o')).join('')}
      </div>
      ${progs.map(g => `<div class="rp-days${curProg === g ? ' open' : ''}" data-g="${esc(g.id)}"><span class="rp-dl">${esc(g.name)}</span>${g.days.map(([v, l], k) => c(v, `${k + 1}일차 · ${l}`, cur === v, 'o')).join('')}</div>`).join('')}
      ${SP.length ? `<button type="button" class="rp-l rp-more${cur.startsWith('sport:') ? ' open' : ''}" onclick="this.classList.toggle('open')">스포츠<small>${SP.length}종</small>${this._ic('down', 'rp-chev')}</button>
      <div class="rp-cs rp-sp">${SP.map(n => c('sport:' + n, n, cur === 'sport:' + n, 'o')).join('')}</div>` : ''}
    </div>`;
  },
  _rpTap(b) {
    const rp = b.closest('.rp'), k = b.dataset.k; let v;
    try { Haptic.light(); } catch (e) {}
    if (k === 'g') {   // 묶음: 그 묶음의 날들을 펼치고 닫는다(값은 날을 골라야 바뀐다)
      const g = b.dataset.g, open = !b.classList.contains('open');
      rp.querySelectorAll('.rp-g').forEach(x => x.classList.toggle('open', x === b && open));
      rp.querySelectorAll('.rp-days').forEach(x => x.classList.toggle('open', x.dataset.g === g && open));
      return;
    }
    if (k === 'pa') {   // 루틴 추가: 부위 = 그 부위 종목 목록 탭
      const was = b.classList.contains('on');
      rp.querySelectorAll('.rp-c[data-k="pa"]').forEach(x => x.classList.remove('on'));
      if (!was) b.classList.add('on');
      this._rpExList(rp, was ? null : b.dataset.v);
      return;
    }
    if (k === 'p') {
      b.classList.toggle('on');
      rp.querySelectorAll('.rp-c[data-k="o"].on, .rp-g.on').forEach(x => x.classList.remove('on'));
      const ps = [...rp.querySelectorAll('.rp-c[data-k="p"].on')].map(x => x.dataset.v);
      v = !ps.length ? (rp.dataset.empty || 'none') : ps.length === 1 && ps[0] === '유산소' ? 'cardio' : 'part:' + ps.join(',');
    } else {
      rp.querySelectorAll('.rp-c.on:not([data-k="pa"])').forEach(x => x.classList.remove('on')); b.classList.add('on'); v = b.dataset.v;
      const dg = b.closest('.rp-days'); if (dg) rp.querySelector(`.rp-g[data-g="${CSS.escape(dg.dataset.g)}"]`)?.classList.add('on');
      if (rp._cart) { rp._cart.clear(); rp.querySelectorAll('.rp-x.on').forEach(x => x.classList.remove('on')); }   // 루틴을 고르면 담은 종목은 비운다
    }
    rp.dataset.v = v; if (rp._set) rp._set(v);
    this._rpGo(rp);
  },
  // 부위 종목 목록 — 추천(맞춤 플랜 규칙으로 고른 것) 먼저, 나머지는 15개까지 보이고 '더 보기'
  _rpNames(p) {
    if (typeof EX_DB === 'undefined') return [];
    const L = p === '팔' ? [...(EX_DB['이두'] || []), ...(EX_DB['삼두'] || [])] : (EX_DB[p] || []);
    return [...new Set(L)];
  },
  _rpExList(rp, p) {
    const box = rp.querySelector('.rp-exl'); if (!box) return;
    if (!p) { box.innerHTML = ''; return; }
    rp._cart = rp._cart || new Map();
    let rec = []; try { rec = PlanGen.dayFor([p]) || []; } catch (e) {}
    const recN = rec.map(x => x.name); rp._rec = rp._rec || {}; rec.forEach(x => { rp._rec[x.name] = x.sets; });
    const rest = this._rpNames(p).filter(n => !recN.includes(n));
    const row = (n, tag) => { const th = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(n) : '';
      return `<button type="button" class="rp-x${rp._cart.has(n) ? ' on' : ''}" data-n="${esc(n)}" onclick="Fitness._rpX(this)">
        <span class="rp-xth">${th ? ExMedia.poseHtml(th, '') : ''}</span><b>${esc(n)}</b>${tag ? `<small>${tag}</small>` : ''}<i class="rp-xck"></i></button>`; };
    box.innerHTML = `<div class="rp-xl">${recN.map(n => row(n, '추천')).join('')}${rest.slice(0, 15).map(n => row(n)).join('')}</div>
      ${rest.length > 15 ? `<button type="button" class="rp-xmore" onclick="this.previousElementSibling.insertAdjacentHTML('beforeend', this.dataset.h); this.remove()" data-h="${esc(rest.slice(15).map(n => row(n)).join(''))}">${p} 종목 ${rest.length - 15}개 더 보기</button>` : ''}`;
  },
  _rpX(b) {
    const rp = b.closest('.rp'), n = b.dataset.n; rp._cart = rp._cart || new Map();
    if (rp._cart.has(n)) { rp._cart.delete(n); b.classList.remove('on'); } else { rp._cart.set(n, (rp._rec || {})[n] || this.defSets(n)); b.classList.add('on'); }
    try { Haptic.light(); } catch (e) {}
    // 종목을 담으면 루틴 선택은 푼다(둘 중 하나로 더한다)
    rp.querySelectorAll('.rp-c[data-k="o"].on, .rp-g.on').forEach(x => x.classList.remove('on')); rp.dataset.v = '';
    this._rpGo(rp);
  },
  _rpGo(rp) {
    const g = document.getElementById('rpGo'); if (!g) return;
    const n = rp._cart ? rp._cart.size : 0;
    g.textContent = n ? `${n}종목 더하기` : rp.dataset.v ? `${this.pickLabel(rp.dataset.v)} 더하기` : '더하기';
  },

  // ── 오늘의 운동 › 루틴 추가: 새 회차로 ─────────────
  edAddSet() {
    if (!this._ed) return;
    App.openModal('@dumbbell 루틴 추가', `<p class="fz-note">오늘 운동에 회차를 하나 더합니다(1회차 다음 2회차로 따로). 부위를 눌러 종목을 담거나, 루틴·스포츠를 고르세요.</p>
      <div class="fz">${this.rpHtml('', { noRest: true, mode: 'add' })}</div>
      <div class="modal-btns"><button class="btn-sm accent" id="rpGo" onclick="Fitness._edAddSetGo()">더하기</button><button class="btn-sm" onclick="App.closeModal()">취소</button></div>`);
    const rp = document.querySelector('#modal .rp'); if (rp) { rp.dataset.empty = ''; rp._cart = new Map(); }
  },
  _edAddSetGo() {
    const rp = document.querySelector('#modal .rp'), ed = this._ed; if (!rp || !ed) return;
    let v = rp.dataset.v, items;
    if (rp._cart && rp._cart.size) { v = 'free'; items = [...rp._cart].map(([name, sets]) => ({ name, sets })); }
    else if (v) items = (this._planOne0(v, this._rtRO()).exercises || []);
    if (!v) { App.showToast('부위에서 종목을 담거나 루틴을 골라 주세요'); return; }
    App.closeModal();
    if (!items || !items.length) { App.showToast('더할 운동이 없습니다'); return; }
    // 이어 붙이지 않고 새 회차로: 그날만 더한 회차에 넣고, 목록의 운동에 회차 번호를 단다(카드·운동 모드에서 따로 묶여 보인다)
    const d = new Date(ed.ds + 'T00:00:00'), before = this.planOn(d);
    this.setExtraPicks(ed.ds, [...this.extraPicks(ed.ds), v]);
    const after = this.planOn(d);
    let si = null;
    if (after.src === 'multi') {
      si = after.sessions.length - 1;
      if (before.src !== 'multi') ed.list.forEach(x => { if (x.sess == null) x.sess = 0; });   // 한 회차뿐이던 날이 두 회차가 되면 원래 운동은 1회차
    } else ed.list.length = 0;   // 휴식·계획 없음이던 날 — 그 회차만 남는다
    items.forEach(x => ed.list.push({ name: x.name, sets: x.sets || this.defSets(x.name), w: x.w ?? '', ...(si != null ? { sess: si } : {}) }));
    ed.dirty = true; this._edPaint();
    const lb = this.sessName(this.planOn(d), si, ed.list) || this.pickLabel(v);
    App.showToast(`${si != null ? (this._sessOrd(ed.list).get(si) || si + 1) + '회차로 ' : ''}${lb}을(를) 더했습니다`, 'success');
  },

  // ── 설정 › 운동 · 루틴: 루틴 묶음과 루틴 만들기·관리 ─────────
  settingsHtml(S) {
    const { progs, solo } = this.progList();
    const R = this._rtRO();
    const mine = progs.filter(g => g.user);
    return `<p class="set-lead">루틴은 하루치 운동, 루틴 묶음은 여러 날(예: 초보자 3분할 · 어깨 깡패 프로그램)입니다. 요일별 운동과 '루틴 추가' 에서 묶음 이름을 누르면 그 묶음의 날을 고를 수 있습니다.</p>
      <div class="set-h">루틴 묶음 (분할)</div>
      ${mine.map(g => S._link(esc(g.name), `Fitness.progEdit('${g.id}')`, `${g.days.length}일 분할${g.days.length ? ' · ' + g.days.map(([, l]) => esc(l)).join(' / ') : ''}`)).join('')}
      ${progs.filter(g => !g.user).map(g => S._item(esc(g.name), '', `${g.days.length}일 · ${g.days.map(([, l]) => esc(l)).join(' / ')} · ${g.id === '_home' ? '기본 제공' : '맞춤 플랜에서 만든 것'}`)).join('')}
      ${S._link('+ 새 루틴 묶음 만들기', 'Fitness.progEdit()', '이름을 짓고 날마다 루틴을 붙입니다')}
      <div class="set-h">루틴</div>
      ${Object.entries(R).length ? Object.entries(R).map(([id, r]) => S._link(esc(r.name), `Fitness.showRoutineEdit('${id}')`, `${(r.exercises || []).length}종목${solo.some(([s]) => s === id) ? '' : ' · ' + esc((progs.find(g => g.days.some(([v]) => v === id)) || {}).name || '')}`)).join('') : S._item('아직 만든 루틴이 없습니다', '', '')}
      ${S._link('+ 새 루틴 만들기', 'Fitness.showRoutineEdit()', '종목을 골라 하루치 루틴을 만듭니다')}
      <div class="set-h">요일</div>
      ${S._link('요일별 운동', 'Fitness.showDayPlan()', '요일마다 할 부위·루틴·스포츠 정하기')}
      ${S._link('맞춤 플랜 다시 만들기', 'PlanGen.open()', '목표 · 기구 · 요일 · 제외 기구')}`;
  },

  // 루틴 묶음 편집: 이름 · 날마다 루틴(1일차, 2일차 …) · 날 추가(있는 루틴 붙이기 / 새로 만들기)
  progEdit(pid) {
    const g = pid && this.progs()[pid];
    this._pg = { id: pid || ('g_' + Date.now().toString(36)), isNew: !g, name: g ? g.name : '', days: g ? [...(g.days || [])] : [] };
    this._progPaint();
  },
  _progPaint() {
    const pg = this._pg, R = this._rtRO(); if (!pg) return;
    pg.days = pg.days.filter(r => R[r]);
    const used = new Set(pg.days), others = Object.entries(R).filter(([id]) => !used.has(id));
    App.openModal('@dumbbell ' + (pg.isNew ? '새 루틴 묶음' : '루틴 묶음 편집'), `<div class="fz pgm">
      <div class="modal-row"><label class="modal-lbl" for="pgName">묶음 이름</label>
        <input id="pgName" class="inp" placeholder="예: 초보자 3분할, 어깨 깡패" value="${esc(pg.name)}" oninput="Fitness._pg.name=this.value"></div>
      <div class="fz-lbl">날 <small>${pg.days.length}일 분할</small></div>
      <div class="pgm-days">${pg.days.map((r, k) => `<div class="pgm-d"><span class="num">${k + 1}일차</span><b>${esc(R[r].name)}</b><small>${(R[r].exercises || []).length}종목</small>
        ${k ? `<button type="button" class="pgm-b" onclick="Fitness._pgMove(${k})" aria-label="위로">↑</button>` : ''}
        <button type="button" class="pgm-b" onclick="Fitness._pgEditDay('${r}')">편집</button>
        <button type="button" class="pgm-b" onclick="Fitness._pgDel(${k})" aria-label="빼기">빼기</button></div>`).join('') || '<p class="pg-note">아직 날이 없습니다 — 아래에서 루틴을 붙이세요.</p>'}</div>
      <div class="fz-lbl">날 추가</div>
      <div class="rp-cs">${others.map(([id, r]) => `<button type="button" class="rp-c" onclick="Fitness._pgAdd('${id}')">+ ${esc(r.name)}</button>`).join('')}
        <button type="button" class="rp-c rp-new" onclick="Fitness._pgNew()">+ 새 루틴 만들기</button></div>
      <div class="modal-btns">
        <button class="btn-sm accent" onclick="Fitness._pgSave()">저장</button>
        ${pg.isNew ? '' : `<button class="btn-danger" onclick="Fitness._pgRemove()">묶음 삭제</button>`}
        <button class="btn-sm" onclick="Fitness._pg=null;Settings.open('workout')">취소</button>
      </div></div>`);
  },
  _pgAdd(id) { this._pg.days.push(id); this._progPaint(); },
  _pgDel(k) { this._pg.days.splice(k, 1); this._progPaint(); },
  _pgMove(k) { const d = this._pg.days; [d[k - 1], d[k]] = [d[k], d[k - 1]]; this._progPaint(); },
  _pgNew() { this._progAdd = this._pg; this.showRoutineEdit(undefined, true); },
  _pgEditDay(id) { this._progAdd = this._pg; this.showRoutineEdit(id, true); },
  _pgSave() {
    const pg = this._pg; if (!pg) return;
    const name = (pg.name || '').trim(); if (!name) { App.showToast('묶음 이름을 입력해 주세요', 'error'); return; }
    const P = this.progs(); P[pg.id] = { name, days: pg.days }; this.saveProgs(P);
    this._pg = null; Settings.open('workout'); App.showToast(`'${name}' 묶음 저장됨`, 'success');
  },
  _pgRemove() {
    const pg = this._pg; if (!pg || !confirm('이 묶음을 지울까요? 안에 든 루틴은 그대로 남습니다.')) return;
    const P = this.progs(); delete P[pg.id]; this.saveProgs(P);
    this._pg = null; Settings.open('workout'); App.showToast('묶음을 지웠습니다', 'success');
  },
});
