// js/settings.js — 설정 화면 (프로필 → 설정)
//
// 프로필 메뉴에 열 줄 넘게 늘어놓던 것을 갈래별로 나눴다.
// 첫 화면은 갈래 목록, 누르면 그 갈래의 항목만 보인다(같은 창 안에서 넘겨 보기).
// 바로 바뀌는 것(테마·디자인·소리)은 이 화면에서 바로 바꾸고,
// 따로 창이 필요한 것(알림·AI 키·기기 연결)은 그 창을 연다.

const Settings = {
  CATS: [
    { id:'design', ic:'palette', name:'디자인',      sub:() => `${Settings._uiName()} · ${Settings._themeName()}` },
    { id:'voice',  ic:'volume',  name:'음성 · 소리', sub:() => `답 읽기 ${Settings._on(JARVIS?._ttsEnabled)} · 효과음 ${Settings._on(Sounds?.enabled)}` },
    { id:'notify', ic:'bell',    name:'알림',        sub:() => '할일·습관·일정 알림' },
    { id:'ai',     ic:'sparkle', name:'AI',          sub:() => { try { const P = JARVIS.PROVIDERS[JARVIS._active()]; return `기본 ${P ? (P.short || P.name) : '미설정'} · 사용량 추적`; } catch(e){ return 'AI 비서 · 사용량 추적'; } } },
    { id:'secure', ic:'key',     name:'보안 · 계정', sub:() => '기기 연결 · 저장된 키 · 로그아웃' },
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
        ${this._item('효과음', this._sw(Sounds?.enabled, 'Settings.toggleSound()'), '체크·완료할 때 짧은 소리')}`;
    } else if (cat === 'notify') {
      h = `${this._link('알림 설정 열기', 'Notifications.showSettings()', '할일 마감·습관·일정 알림 시간을 정합니다')}`;
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
      h = `<div class="set-h">기기</div>
        ${this._link('기기 연결', 'DevicePair.open()', '허브·다른 기기와 연결')}
        <div class="set-h">저장된 키</div>
        ${this._item('이 기기에 저장된 AI 키', `<span class="set-val">${keys.length ? keys.join(', ') : '없음'}</span>`)}
        ${keys.length ? this._link('저장된 AI 키 모두 지우기', 'Settings.clearKeys()', '이 기기와 동기화된 키가 지워집니다', true) : ''}
        <div class="set-h">계정</div>
        ${this._link('로그아웃', 'Auth.logout()', '', true)}`;
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
  toggleSound() { Sounds.enabled = !Sounds.enabled; if (Sounds.enabled) Sounds.click?.(); App._updateSoundLabel?.(); this._re('voice'); },
  clearKeys() {
    if (!confirm('이 기기에 저장된 AI 키를 모두 지울까요?')) return;
    Object.values(JARVIS.PROVIDERS).forEach(p => localStorage.removeItem(p.key));
    window.FirebaseSync?.scheduleSave?.();
    App.showToast('AI 키를 지웠습니다', 'success');
    this._re('secure');
  },
};
