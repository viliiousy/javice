// js/settings.js — 설정 화면 (프로필 → 설정)
//
// 프로필 메뉴에 열 줄 넘게 늘어놓던 것을 갈래별로 나눴다.
// 첫 화면은 갈래 목록, 누르면 그 갈래의 항목만 보인다(같은 창 안에서 넘겨 보기).
// 바로 바뀌는 것(테마·디자인·소리)은 이 화면에서 바로 바꾸고,
// 따로 창이 필요한 것(알림·AI 키·기기 연결)은 그 창을 연다.

const Settings = {
  CATS: [
    { id:'design', ic:'palette', name:'디자인',      sub:() => `${Settings._uiName()} · ${Settings._themeName()}` },
    { id:'voice',  ic:'volume',  name:'음성 · 소리 · 진동', sub:() => `답 읽기 ${Settings._on(JARVIS?._ttsEnabled)} · 효과음 ${Settings._on(Sounds?.enabled)} · 진동 ${Settings._on(Haptic.on)}` },
    { id:'notify', ic:'bell',    name:'알림',        sub:() => { try { return Notifications.getSettings().enabled ? '켜짐 · 습관·식단·할일·일정' : '꺼짐'; } catch(e){ return ''; } } },
    { id:'ai',     ic:'sparkle', name:'AI',          sub:() => { try { const P = JARVIS.PROVIDERS[JARVIS._active()]; return `기본 ${P ? (P.short || P.name) : '미설정'} · 사용량 추적`; } catch(e){ return 'AI 비서 · 사용량 추적'; } } },
    { id:'device', ic:'monitor', name:'기기 · 허브', sub:() => `허브 모드 ${localStorage.getItem('gl_hub_mode')==='1'?'켜짐':'꺼짐'} · 기기 연결` },
    { id:'secure', ic:'key',     name:'보안 · 계정', sub:() => '저장된 키 · 로그아웃 · 계정 삭제' },
    { id:'help',   ic:'book',    name:'도움말',      sub:() => '사용 도우미 · 버전' },
  ],
  VERSION: 'v26.10.19',

  _on(v){ return v ? '켜짐' : '꺼짐'; },
  _uiName(){ return document.documentElement.dataset.ui === 'v1' ? '예전 디자인' : '새 디자인'; },
  _themeName(){ try { return { system:'시스템', light:'밝게', dark:'어둡게' }[App._theme]; } catch(e){ return ''; } },
  _ic(n){ return typeof Icons !== 'undefined' ? Icons.svg(n) : ''; },

  open(cat) {
    document.getElementById('profileMenu')?.classList.add('hidden');
    App.openModal(cat ? this.CATS.find(c => c.id === cat)?.name || '설정' : '설정', `<div id="setBody" class="set">${cat ? this._page(cat) : this._home()}</div>`);
    document.getElementById('modal')?.classList.add('set-modal');
  },
  go(cat) {
    const b = document.getElementById('setBody'); if (!b) return this.open(cat);
    b.innerHTML = cat ? this._page(cat) : this._home();
    const t = document.getElementById('modalTitle');
    if (t) t.textContent = cat ? (this.CATS.find(c => c.id === cat)?.name || '설정') : '설정';
    b.scrollTop = 0;
  },
  _re(cat){ this.go(cat); },

  _home() {
    return `<div class="set-list">${this.CATS.map(c => `
      <button type="button" class="set-row" onclick="Settings.go('${c.id}')">
        <span class="set-ic">${this._ic(c.ic)}</span>
        <span class="set-tx"><b>${c.name}</b><small>${c.sub()}</small></span>
        <span class="set-chev" aria-hidden="true">›</span>
      </button>`).join('')}</div>`;
  },

  // 세그먼트(여러 값 중 하나 고르기)
  _seg(cur, opts, fn) {
    return `<div class="set-seg">${opts.map(([v, l]) => `<button type="button" class="${v === cur ? 'on' : ''}" onclick="${fn}('${v}')">${l}</button>`).join('')}</div>`;
  },
  _sw(on, fn) {
    return `<button type="button" class="set-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" onclick="${fn}"><i></i></button>`;
  },
  _back() { return `<button type="button" class="set-back" onclick="Settings.go()">‹ 설정</button>`; },
  _item(label, right, sub) {
    return `<div class="set-item"><span class="set-tx"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right}</div>`;
  },
  _link(label, fn, sub, danger) {
    return `<button type="button" class="set-item set-link${danger ? ' danger' : ''}" onclick="${fn}"><span class="set-tx"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="set-chev">›</span></button>`;
  },

  _page(cat) {
    const ui = document.documentElement.dataset.ui === 'v1' ? 'v1' : 'v2';
    let h = '';
    if (cat === 'design') {
      h = `<div class="set-h">화면</div>
        ${this._item('디자인', this._seg(ui, [['v2','새 디자인'],['v1','예전']], 'Settings.setUI'))}
        ${this._item('테마', this._seg(App._theme, [['system','시스템'],['light','밝게'],['dark','어둡게']], 'Settings.setTheme'))}
        ${this._item('아이콘', this._seg(Icons.mode, [['simple','심플'],['color','컬러']], 'Settings.setIcons'))}
        <div class="set-h">메인 화면</div>
        ${this._link('메인 카드 고르기', 'App.showCardSettings()', '탭마다 보일 카드를 켜고 끕니다')}`;
    } else if (cat === 'voice') {
      h = `<div class="set-h">AI 비서</div>
        ${this._item('답을 소리로 읽기', this._sw(JARVIS?._ttsEnabled, 'Settings.toggleTTS()'), 'AI 답을 음성으로 들려 줍니다')}
        <div class="set-h">앱</div>
        ${this._item('효과음', this._sw(Sounds?.enabled, 'Settings.toggleSound()'), '체크·완료할 때 짧은 소리')}
        ${this._item('진동(햅틱)', this._sw(Haptic.on, 'Settings.toggleHaptic()'), '체크·순서 바꾸기·탭 전환 때 손끝 진동')}`;
    } else if (cat === 'notify') {
      h = `<div id="setNotify" class="set-loading">불러오는 중…</div>`;
      setTimeout(async () => { const el = document.getElementById('setNotify'); if (el) { el.className=''; el.innerHTML = await Notifications.pageHtml(); } }, 0);
    } else if (cat === 'ai') {
      h = `<div class="set-h">AI 비서</div>
        ${this._link('기본 AI · 키 설정', 'JARVIS.showKeySetup()', '어느 AI 를 쓸지, 각 서비스의 키를 넣습니다')}
        <div class="set-h">상단 사용량 고리에 보일 것</div>
        <div class="set-box">${AIUsage.trackHtml()}</div>
        <div class="set-h"></div>
        ${this._link('AI 사용량 · 허브', 'AIUsage.open()', '남은 한도와 초기화 시각')}`;
      setTimeout(() => document.querySelectorAll('#setBody .aiu-show').forEach(i => i.onchange = () => AIUsage.saveTrack()), 0);
    } else if (cat === 'secure') {
      const keys = Object.values(JARVIS?.PROVIDERS || {}).filter(p => localStorage.getItem(p.key)).map(p => p.short || p.name);
      h = `<div class="set-h">저장된 키</div>
        ${this._item('이 기기에 저장된 AI 키', `<span class="set-val">${keys.length ? keys.join(', ') : '없음'}</span>`)}
        ${keys.length ? this._link('저장된 AI 키 모두 지우기', 'Settings.clearKeys()', '이 기기와 동기화된 키가 지워집니다', true) : ''}
        <div class="set-h">계정</div>
        ${this._link('로그아웃', 'Auth.logout()', '', true)}
        ${this._link('계정 삭제', 'Settings.deleteAccount()', 'Bashy 에 저장된 모든 기록과 구글 연결을 지웁니다', true)}`;
    } else if (cat === 'device') {
      const hub = localStorage.getItem('gl_hub_mode') === '1';
      h = `<div class="set-h">허브</div>
        ${this._item('허브 모드', this._sw(hub, 'Settings.toggleHub()'), '태블릿·거치용 벽 화면. 켜 두면 앱을 열자마자 큰 시계·할 일·AI 사용량·집 기기 화면이 뜹니다')}
        ${this._link('지금 허브 화면 열기', 'Settings.openHub()', '허브 오른쪽 아래 ‹ 앱으로 를 누르면 돌아옵니다')}
        <div class="set-h">기기</div>
        ${this._link('기기 연결', 'DevicePair.open()', '허브 태블릿·다른 기기를 이 계정에 연결')}`;
    } else if (cat === 'help') {
      h = `${this._link('사용 도우미 다시 보기', 'App.closeModal();Onboard.open(true)', '신체정보·AI·습관·식단·운동·경제 설정')}
        ${this._item('버전', `<span class="set-val">${this.VERSION}</span>`)}`;
    }
    return this._back() + `<div class="set-page">${h}</div>`;
  },

  // ── 바로 바뀌는 항목 ─────────────────────
  setUI(v) { if ((document.documentElement.dataset.ui === 'v1' ? 'v1' : 'v2') !== v) App.toggleUI(); this._re('design'); },
  setTheme(v) { App._theme = v; App._applyTheme(); this._re('design'); },
  setIcons(v) { Icons.mode = v; Icons.applyMode(); Icons.updateModeLabel?.(); this._re('design'); },
  toggleTTS() { JARVIS.toggleTTS(); this._re('voice'); },
  toggleHaptic() { Haptic.on = !Haptic.on; if (Haptic.on) Haptic.light(); this._re('voice'); },
  toggleSound() { Sounds.enabled = !Sounds.enabled; if (Sounds.enabled) Sounds.click?.(); App._updateSoundLabel?.(); this._re('voice'); },
  // 계정 삭제 — Apple 심사 지침 5.1.1(v). 두 번 확인한 뒤 서버(/api/delete-account)가 지운다.
  deleteAccount() {
    App.openModal('계정 삭제', `
      <p class="set-note" style="margin:0 0 12px;font-size:14px;color:var(--text2)">Bashy 에 저장된 <b>모든 기록</b>(습관·식단·체크리스트·메모·인바디·운동·설정·AI 키)과 서버에 보관한 <b>구글 연결</b>을 지우고, 로그인 계정도 삭제합니다. 되돌릴 수 없습니다.</p>
      <p class="set-note" style="margin:0 0 16px">구글 캘린더·구글 할 일은 사용자의 구글 계정에 있는 데이터라 그대로 남습니다.</p>
      <div class="modal-row"><label class="modal-lbl">확인을 위해 <b>삭제</b> 라고 입력해 주세요</label>
        <input id="delConfirm" class="inp" autocomplete="off" placeholder="삭제"></div>
      <div class="modal-btns">
        <button class="btn-sm" onclick="App.closeModal()">취소</button>
        <button class="btn-danger" id="delGo" onclick="Settings._doDelete()">계정 영구 삭제</button>
      </div>`);
  },
  async _doDelete() {
    if ((document.getElementById('delConfirm')?.value || '').trim() !== '삭제') { App.showToast('삭제 라고 입력해 주세요', 'error'); return; }
    const btn = document.getElementById('delGo'); if (btn) { btn.disabled = true; btn.textContent = '삭제하는 중…'; }
    try {
      const u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
      if (!u) throw new Error('다시 로그인한 뒤 시도해 주세요');
      const idToken = await u.getIdToken(true);
      const r = await fetch(Platform.api('/api/delete-account'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || '일부를 지우지 못했습니다. 잠시 뒤 다시 시도해 주세요');
      try { window.FirebaseSync && (FirebaseSync.scheduleSave = () => {}); } catch (e) {}   // 지운 뒤 다시 올리지 않게
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      App.closeModal();
      alert('계정과 모든 기록을 삭제했습니다.');
      try { await Auth.logout(); } catch (e) {}
      location.replace('index.html?nohub=1');
    } catch (e) {
      App.showToast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '계정 영구 삭제'; }
    }
  },
  toggleHub() {
    const on = localStorage.getItem('gl_hub_mode') !== '1';
    localStorage.setItem('gl_hub_mode', on ? '1' : '0');
    if (on) { App.showToast('허브 모드를 켰습니다 — 허브로 이동합니다', 'success'); setTimeout(() => this.openHub(), 600); }
    else this._re('device');
  },
  openHub() { location.href = 'hub.html?from=app'; },
  clearKeys() {
    if (!confirm('이 기기에 저장된 AI 키를 모두 지울까요?')) return;
    Object.values(JARVIS.PROVIDERS).forEach(p => localStorage.removeItem(p.key));
    window.FirebaseSync?.scheduleSave?.();
    App.showToast('AI 키를 지웠습니다', 'success');
    this._re('secure');
  },
};
