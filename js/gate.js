// js/gate.js — 가입 승인 · 운영자 관리 화면 · 사용량 집계
//
// 지금은 운영자가 승인한 계정만 쓴다(서버 여력 때문 — 나중에 SIGNUP_OPEN 으로 연다).
//   · 로그인하면 서버(/api/hub act:gate)에 내 상태를 묻는다. 승인된 적이 있으면 이 기기에 기억해 두고 바로 들어간다
//     (뒤에서 다시 확인해서, 그사이 차단·삭제됐으면 그때 막는다).
//   · 승인 전이면 '가입 신청' 화면 — 이름과 한마디(누구인지)를 적어 보내면 운영자에게 알림이 간다.
//   · 운영자(yanggnay119@gmail.com)는 프로필 › 관리 에서 신청 승인·거절, 사용자 차단·삭제, 사용 통계를 본다.
const Gate = {
  ADMIN: ['yanggnay119@gmail.com'],
  admin: false, state: null, _info: null,
  _uid() { try { return firebase.auth().currentUser?.uid || ''; } catch (e) { return ''; } },
  _key() { return 'gl_gate_' + this._uid(); },
  async _tok() { try { return await firebase.auth().currentUser?.getIdToken(); } catch (e) { return null; } },
  async call(act, extra = {}) {
    const idToken = await this._tok(); if (!idToken) throw new Error('nologin');
    const r = await fetch(Platform.api('/api/hub'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act, idToken, ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  },
  _email(info) { try { return String((info && info.email) || firebase.auth().currentUser?.email || '').toLowerCase(); } catch (e) { return ''; } },

  // App.onAuthSuccess 맨 앞에서 부른다. true 면 들어가고, false 면 신청/대기 화면을 띄우고 멈춘다.
  async pass(info) {
    this._info = info || {};
    // Firebase 로그인을 잠깐 기다린다(토큰이 있어야 서버에 물을 수 있다)
    for (let i = 0; i < 20 && !this._uid(); i++) await new Promise(r => setTimeout(r, 250));
    const uid = this._uid();
    this.admin = this.ADMIN.includes(this._email(info));
    if (!uid) return true;   // 로그인 정보를 못 받으면(오프라인 등) 막지 않는다 — 데이터도 그 기기 것뿐이다
    const cached = localStorage.getItem(this._key()) === 'approved';
    if (cached || this.admin) {
      this._after();
      this.recheck();
      return true;
    }
    try {
      const j = await this.call('gate');
      this.state = j.state; this.admin = !!j.admin || this.admin;
      if (j.state === 'approved') { localStorage.setItem(this._key(), 'approved'); this._after(); return true; }
      this.show(j.state, j.msg || '');
      return false;
    } catch (e) {
      this.show('error', String(e.message || e));
      return false;
    }
  },
  // 이미 들어온 뒤 조용히 다시 확인 — 차단·삭제됐으면 그때 막는다
  async recheck() {
    try {
      const j = await this.call('gate');
      this.state = j.state; this.admin = !!j.admin || this.admin;
      if (j.state === 'approved') { localStorage.setItem(this._key(), 'approved'); this._menu(); return; }
      localStorage.removeItem(this._key());
      this.show(j.state, j.msg || '');
    } catch (e) {}
  },
  _after() {
    Usage.start();
    this._menu();
  },

  // ── 신청 · 대기 · 차단 화면 ──
  show(state, msg) {
    document.getElementById('gateOv')?.remove();
    const el = document.createElement('div'); el.id = 'gateOv'; el.className = 'gate';
    const nm = esc((this._info && this._info.name) || '');
    const body = state === 'blocked'
      ? `<h1 class="gate-t">이용이 제한된 계정입니다</h1><p class="gate-p">운영자에게 문의해 주세요.</p>`
      : state === 'pending'
      ? `<h1 class="gate-t">승인을 기다리고 있습니다</h1>
         <p class="gate-p">운영자가 확인하면 바로 쓸 수 있습니다. 승인되면 이 화면이 저절로 넘어갑니다.</p>
         ${msg ? `<div class="gate-msg"><span>보낸 한마디</span>${esc(msg)}</div>` : ''}
         <button type="button" class="gate-go" onclick="Gate.poll(true)">지금 다시 확인</button>
         <button type="button" class="gate-link" onclick="Gate.show('none', ${JSON.stringify(msg).replace(/"/g, '&quot;')})">한마디 고쳐서 다시 보내기</button>`
      : state === 'error'
      ? `<h1 class="gate-t">서버에 연결하지 못했습니다</h1><p class="gate-p">${esc(msg)}</p>
         <button type="button" class="gate-go" onclick="location.reload()">다시 시도</button>`
      : `<h1 class="gate-t">가입 신청</h1>
         <p class="gate-p">지금은 운영자가 승인한 분만 쓸 수 있습니다. 누구인지 알 수 있게 한마디 남겨 주세요.</p>
         <label class="gate-l">이름<input id="gateName" class="inp" maxlength="40" value="${nm}" placeholder="이름"></label>
         <label class="gate-l">한마디<textarea id="gateMsg" class="inp" rows="3" maxlength="200" placeholder="예: 민우 친구 지훈입니다. 운동 기록 쓰려고요">${esc(msg || '')}</textarea></label>
         <button type="button" class="gate-go" onclick="Gate.request()">가입 신청 보내기</button>`;
    el.innerHTML = `<div class="gate-box"><div class="gate-logo">b<i>.</i></div>${body}
      <p class="gate-who">${esc(this._email(this._info))}</p>
      <button type="button" class="gate-link" onclick="Auth.logout()">다른 계정으로 로그인</button></div>`;
    document.body.appendChild(el);
    clearInterval(this._pt);
    if (state === 'pending') this._pt = setInterval(() => { if (!document.hidden) this.poll(); }, 30000);
  },
  async request() {
    const name = document.getElementById('gateName')?.value.trim() || '', msg = document.getElementById('gateMsg')?.value.trim() || '';
    if (!msg) { App.showToast('한마디를 적어 주세요 — 누구인지 알아야 승인할 수 있습니다', 'error'); return; }
    try {
      const j = await this.call('gate', { req: true, name, msg, again: this.state === 'pending' });
      this.state = j.state;
      if (j.state === 'approved') return this._enter();
      this.show(j.state, j.msg || msg);
      App.showToast('신청을 보냈습니다', 'success');
    } catch (e) { App.showToast('보내지 못했습니다: ' + (e.message || e), 'error'); }
  },
  async poll(manual) {
    try {
      const j = await this.call('gate');
      if (j.state === 'approved') return this._enter();
      if (manual) App.showToast('아직 승인 전입니다');
      if (j.state !== this.state) { this.state = j.state; this.show(j.state, j.msg || ''); }
    } catch (e) { if (manual) App.showToast('확인하지 못했습니다', 'error'); }
  },
  _enter() {
    clearInterval(this._pt);
    localStorage.setItem(this._key(), 'approved');
    document.getElementById('gateOv')?.remove();
    App.showToast('승인되었습니다. 환영합니다', 'success');
    try { App.onAuthSuccess(this._info || {}); } catch (e) {}
  },

  // ── 운영자: 프로필 메뉴 › 관리 · 신청 알림 ──
  async _menu() {
    if (!this.admin) return;
    const m = document.getElementById('profileMenu');
    if (m && !document.getElementById('pmAdmin')) {
      const it = document.createElement('div'); it.className = 'profile-menu-item'; it.id = 'pmAdmin'; it.dataset.ic = 'grid';
      it.textContent = '관리'; it.onclick = () => { m.classList.add('hidden'); Admin.open(); };
      m.insertBefore(it, m.querySelector('.profile-menu-item'));
    }
    try {
      const j = await this.call('adm', { op: 'list' });
      Admin.data = j;
      const n = j.stats.pending;
      document.getElementById('hAvatar')?.parentElement?.classList.toggle('adm-dot', n > 0);
      const it = document.getElementById('pmAdmin'); if (it) it.innerHTML = `관리${n ? ` <b class="adm-n">${n}</b>` : ''}`;
      if (n && !this._told) { this._told = 1; App.showToast(`가입 신청 ${n}건이 기다리고 있습니다 — 프로필 › 관리`, 'success'); }
      if (/[?&]admin=1/.test(location.search)) Admin.open();
    } catch (e) {}
  },
};

// ── 운영자 화면 ──────────────────────────────
const Admin = {
  data: null, tab: 'req',
  async open(tab) {
    if (tab) this.tab = tab;
    App.openModal('@grid 관리', `<div class="adm"><div class="adm-tabs">
        <button type="button" data-t="req">가입 신청</button><button type="button" data-t="users">사용자</button><button type="button" data-t="stats">사용 통계</button>
      </div><div id="admBody" class="adm-body"><p class="pg-note">불러오는 중…</p></div></div>`);
    document.querySelectorAll('.adm-tabs button').forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.paint(); });
    await this.load();
  },
  async load(op, uid) {
    try { this.data = await Gate.call('adm', { op: op || 'list', uid }); }
    catch (e) { const b = document.getElementById('admBody'); if (b) b.innerHTML = `<p class="pg-note">${esc(e.message || e)}</p>`; return; }
    this.paint();
    const n = this.data.stats.pending;
    document.getElementById('hAvatar')?.parentElement?.classList.toggle('adm-dot', n > 0);
    const it = document.getElementById('pmAdmin'); if (it) it.innerHTML = `관리${n ? ` <b class="adm-n">${n}</b>` : ''}`;
  },
  _ago(t) {
    if (!t) return '—';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
  },
  paint() {
    const b = document.getElementById('admBody'), d = this.data; if (!b || !d) return;
    const s = d.stats, U = d.users;
    document.querySelectorAll('.adm-tabs button').forEach(x => {
      x.classList.toggle('on', x.dataset.t === this.tab);
      if (x.dataset.t === 'req') x.innerHTML = `가입 신청${s.pending ? ` <b class="adm-n">${s.pending}</b>` : ''}`;
    });
    const act = (u, op, label, cls = '') => `<button type="button" class="adm-b ${cls}" onclick="Admin.act('${op}','${esc(u.uid)}','${esc(u.name || u.email).replace(/'/g, '')}')">${label}</button>`;
    if (this.tab === 'req') {
      const P = U.filter(u => u.status === 'pending');
      b.innerHTML = P.length ? P.map(u => `<div class="adm-card">
          <div class="adm-h"><b>${esc(u.name || '(이름 없음)')}</b><span>${esc(u.email)}</span><i>${this._ago(u.at)}</i></div>
          <p class="adm-msg">${u.msg ? esc(u.msg) : '<span class="pg-note">한마디 없음</span>'}</p>
          <div class="adm-acts">${act(u, 'reject', '거절')}${act(u, 'approve', '승인', 'pri')}</div></div>`).join('')
        : '<p class="pg-note">기다리는 신청이 없습니다.</p>';
      return;
    }
    if (this.tab === 'users') {
      const A = U.filter(u => u.status !== 'pending');
      b.innerHTML = `<p class="adm-sum">승인 <b class="num">${s.total}</b> · 차단 <b class="num">${s.blocked}</b></p>` + A.map(u => `<div class="adm-row${u.status === 'blocked' ? ' off' : ''}">
          <div class="adm-u"><b>${esc(u.name || u.email)}${u.admin ? ' <em>운영자</em>' : ''}${u.status === 'blocked' ? ' <em class="bad">차단됨</em>' : ''}</b>
            <span>${esc(u.email)} · 마지막 ${this._ago(u.last)} · 7일 중 <b class="num">${u.days}</b>일 · 오늘 <b class="num">${u.today}</b>회</span></div>
          ${u.admin ? '' : `<div class="adm-acts">${u.status === 'blocked' ? act(u, 'unblock', '차단 풀기') : act(u, 'block', '차단')}${act(u, 'delete', '삭제', 'bad')}</div>`}
        </div>`).join('');
      return;
    }
    const max = Math.max(1, ...s.daily.map(x => x.n)), cats = Object.entries(s.cats || {}).sort((a, b) => b[1] - a[1]), cmax = Math.max(1, ...cats.map(c => c[1]));
    const DOW = '일월화수목금토';
    b.innerHTML = `<div class="adm-kpi">
        <div><b class="num">${s.total}</b><span>가입(승인)</span></div><div><b class="num">${s.dau}</b><span>오늘 쓴 사람</span></div>
        <div><b class="num">${s.wau}</b><span>이번 7일 쓴 사람</span></div><div><b class="num">${s.pending}</b><span>승인 대기</span></div></div>
      <div class="adm-h2">하루에 쓴 사람 · 최근 7일</div>
      <div class="adm-days">${s.daily.map(x => { const dd = new Date(x.d + 'T00:00:00'); return `<div class="adm-day"><i style="height:${Math.round(x.n / max * 100)}%"></i><b class="num">${x.n}</b><span>${dd.getMonth() + 1}/${dd.getDate()}<br>${DOW[dd.getDay()]}</span></div>`; }).join('')}</div>
      <div class="adm-h2">많이 쓴 기능 · 최근 7일(누른 횟수)</div>
      ${cats.length ? cats.map(([k, n]) => `<div class="adm-cat"><span>${esc(k)}</span><em><i style="width:${Math.round(n / cmax * 100)}%"></i></em><b class="num">${n}</b></div>`).join('') : '<p class="pg-note">아직 모인 기록이 없습니다.</p>'}
      <p class="pg-note">가입은 ${s.open ? '누구나 가능(열림)' : '운영자 승인제'}입니다. 사용량은 앱이 몇 분마다 기능별 횟수만 보냅니다(내용은 보내지 않음).</p>`;
  },
  async act(op, uid, name) {
    const msg = { approve: `${name} 님을 승인할까요?`, reject: `${name} 님의 신청을 거절할까요?`, block: `${name} 님을 차단할까요? 다음에 앱을 열 때부터 막힙니다.`,
      unblock: `${name} 님의 차단을 풀까요?`, delete: `${name} 님을 삭제할까요? 그 사람의 기록이 모두 지워지고, 다시 쓰려면 새로 가입 신청해야 합니다.` }[op];
    if (op !== 'approve' && !confirm(msg)) return;
    await this.load(op, uid);
    App.showToast({ approve: '승인했습니다', reject: '거절했습니다', block: '차단했습니다', unblock: '차단을 풀었습니다', delete: '삭제했습니다' }[op], 'success');
  },
};

// ── 사용량: 기능별로 누른 횟수만 모아 몇 분마다 보낸다(내용은 보내지 않는다) ──
const Usage = {
  q: {}, _on: false,
  hit(cat) { if (!this._on) return; this.q[cat] = (this.q[cat] || 0) + 1; },
  _day() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  async flush() {
    const cats = this.q; if (!Object.keys(cats).length) return;
    this.q = {};
    try { await Gate.call('usage', { day: this._day(), cats }); } catch (e) { for (const [k, n] of Object.entries(cats)) this.q[k] = (this.q[k] || 0) + n; }
  },
  start() {
    if (this._on) return; this._on = true;
    this.hit('열기');
    setInterval(() => this.flush(), 3 * 60000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); else this.hit('열기'); });
    // 기능별로 한 번 누를 때마다 센다 — 창 머리 아이콘과 몇몇 동작에 붙인다
    const ICON = { calendar: '일정', tasks: '할일', diet: '식단', camera: '식단', dumbbell: '운동', chart: '운동', pen: '체크리스트', trend: '경제', sparkle: 'AI', monitor: '스마트홈', book: '메모' };
    const wrap = (o, fn, cat) => { try { const f = o && o[fn]; if (typeof f !== 'function' || f._u) return; o[fn] = function (...a) { Usage.hit(typeof cat === 'function' ? cat(...a) : cat); return f.apply(this, a); }; o[fn]._u = 1; } catch (e) {} };
    wrap(App, 'openModal', t => { const m = /^@([a-z]+)/.exec(String(t || '')); return (m && ICON[m[1]]) || '설정'; });
    if (typeof Habits !== 'undefined') wrap(Habits, 'toggle', '습관');
    if (typeof Checklist !== 'undefined') wrap(Checklist, 'toggle', '체크리스트');
    if (typeof Memo !== 'undefined') wrap(Memo, 'open', '메모');
    if (typeof Diet !== 'undefined') wrap(Diet, 'commitCart', '식단');
    if (typeof Fitness !== 'undefined') wrap(Fitness, 'toggle', '운동');
    if (typeof WorkoutMode !== 'undefined') wrap(WorkoutMode, '_open', '운동모드');
    if (typeof InBody !== 'undefined') wrap(InBody, 'saveRecords', '인바디');
    if (typeof JARVIS !== 'undefined') wrap(JARVIS, 'toggle', 'AI');
    if (typeof Econ !== 'undefined') wrap(Econ, 'open', '경제');
    if (typeof App !== 'undefined') wrap(App, '_toggle', '할일');
  },
};
