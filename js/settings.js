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
  VERSION: 'v26.10.20',
  // 갈래 안의 하위 화면(뒤로 가면 그 갈래로)
  SUB: { topinfo: ['상단바 정보', 'design'], cats: ['보일 카테고리', 'design'], connector: ['ChatGPT · Claude 연결', 'ai'] },
  _title(cat){ return cat ? (this.SUB[cat]?.[0] || this.CATS.find(c => c.id === cat)?.name || '설정') : '설정'; },

  _on(v){ return v ? '켜짐' : '꺼짐'; },
  _uiName(){ return document.documentElement.dataset.ui === 'v1' ? '예전 디자인' : '새 디자인'; },
  _themeName(){ try { return { system:'시스템', light:'밝게', dark:'어둡게' }[App._theme]; } catch(e){ return ''; } },
  _ic(n){ return typeof Icons !== 'undefined' ? Icons.svg(n) : ''; },

  open(cat) {
    document.getElementById('profileMenu')?.classList.add('hidden');
    App.openModal(this._title(cat), `<div id="setBody" class="set">${cat ? this._page(cat) : this._home()}</div>`);
    document.getElementById('modal')?.classList.add('set-modal');
  },
  go(cat) {
    const b = document.getElementById('setBody'); if (!b) return this.open(cat);
    b.innerHTML = cat ? this._page(cat) : this._home();
    const t = document.getElementById('modalTitle');
    if (t) t.textContent = this._title(cat);
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
        ${this._link('보일 카테고리', "Settings.go('cats')", `${Tabs.DEF.filter(t => Tabs.tabOn(t.id)).map(t => t.label).join(' · ')} — 카테고리와 그 안의 카드를 켜고 끕니다`)}
        ${this._link('상단바 정보', "Settings.go('topinfo')", '몸무게·체지방·BMI·근육량·추세·주식 등락·AI 사용량')}`;
    } else if (cat === 'topinfo') {
      h = TopInfo.pageHtml();
    } else if (cat === 'cats') {
      h = Tabs.catsHtml();
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
      h = `<div class="set-h">월 구독으로 쓰기 (API 키 없이)</div>
        ${this._link('ChatGPT · Claude 에 Bashy 연결', "Settings.go('connector')", 'ChatGPT Plus·Claude 구독(무료 플랜 포함)에서 “점심 김치찌개 먹었어” 하면 Bashy 에 기록됩니다')}
        <div class="set-h">앱 안 AI 비서 (API 키)</div>
        ${this._link('기본 AI · 키 설정', 'JARVIS.showKeySetup()', '무료: Gemini·Groq / 유료: ChatGPT·Claude·Grok API 키')}
        ${this._link('AI 사용량', 'AIUsage.open()', '남은 한도와 초기화 시각 · 위쪽 고리는 디자인 › 상단바 정보에서')}`;
    } else if (cat === 'connector') {
      h = `<div id="mcpBox" class="set-loading">주소를 준비하는 중…</div>`;
      setTimeout(() => this.mcpPaint(), 0);
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
        ${this._item('허브 모드', this._sw(hub, 'Settings.toggleHub()'), '켜 두면 프로필 메뉴에 \'허브 모드로 전환\' 단추가 생깁니다. 누르면 큰 시계·할 일·AI 사용량·집 기기 화면(가로)으로 바뀝니다')}
        ${this._link('지금 허브 화면 열기', 'Settings.openHub()', '허브 오른쪽 아래 ‹ 앱으로 를 누르면 돌아옵니다')}
        <div class="set-h">기기</div>
        ${this._link('기기 연결', 'DevicePair.open()', '허브 태블릿·다른 기기를 이 계정에 연결')}`;
    } else if (cat === 'help') {
      h = `${this._link('사용 도우미 다시 보기', 'App.closeModal();Onboard.open(true)', '신체정보·AI·습관·식단·운동·경제 설정')}
        ${this._item('버전', `<span class="set-val">${this.VERSION}</span>`)}`;
    }
    return (this.SUB[cat] ? `<button type="button" class="set-back" onclick="Settings.go('${this.SUB[cat][1]}')">‹ ${this.CATS.find(c => c.id === this.SUB[cat][1])?.name || '설정'}</button>` : this._back()) + `<div class="set-page">${h}</div>`;
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
    App.showToast(on ? '프로필 메뉴에 \'허브 모드로 전환\' 단추를 넣었습니다' : '허브 모드 단추를 뺐습니다', 'success');
    this.hubMenu(); this._re('device');
    if (on) this.hubLink().catch(() => {});
  },

  // 허브는 따로 로그인하지 않는다. 이 앱에 로그인한 구글 계정의 연결 코드를 허브 설정에 넣어 주면
  // 허브가 그 코드로 할 일·AI 사용량과, 계정에 저장해 둔 허브 설정(Home Assistant 주소 등)을 받아 온다.
  // 코드가 이미 있으면 그대로 쓴다(새로 만들면 다른 태블릿의 연결이 끊긴다).
  async hubLink(waitMs = 15000) {
    const end = Date.now() + waitMs;
    const authed = () => typeof FirebaseSync !== 'undefined' && FirebaseSync.ready() && FirebaseSync._authed;
    while (!authed() && Date.now() < end) await new Promise(r => setTimeout(r, 300));
    if (!authed()) return null;
    let link = await FirebaseSync.getLink();
    let key = link && link.hubKey;
    if (!key) {
      const b = new Uint8Array(24); crypto.getRandomValues(b);
      key = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (!(await FirebaseSync.setLink({ hubKey: key }))) return null;
    }
    const code = `${FirebaseSync._uid}.${key}`;
    let cfg = {}; try { cfg = JSON.parse(localStorage.getItem('hub_cfg_v1')) || {}; } catch {}
    if (cfg.code !== code) { cfg.code = code; delete cfg.cfgAt; localStorage.setItem('hub_cfg_v1', JSON.stringify(cfg)); }
    return code;
  },

  // ── 월 구독 AI 연결(MCP 커넥터) ─────────────
  // 주소 하나를 ChatGPT(개발자 모드 커넥터)·Claude(사용자 지정 커넥터)에 넣으면, 그 AI 가 Bashy 기록을 읽고 쓴다.
  async mcpUrl(fresh) {
    const authed = typeof FirebaseSync !== 'undefined' && FirebaseSync.ready() && FirebaseSync._authed;
    if (!authed) return null;
    const l = await FirebaseSync.getLink();
    let key = l && l.mcpKey;
    if (!key || fresh) {
      const b = new Uint8Array(24); crypto.getRandomValues(b);
      key = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (!(await FirebaseSync.setLink({ mcpKey: key }))) return null;
    }
    return `https://bashy.app/mcp/${FirebaseSync._uid}.${key}`;
  },
  async mcpPaint(fresh) {
    const box = document.getElementById('mcpBox'); if (!box) return;
    const url = await this.mcpUrl(fresh);
    if (!url) { box.textContent = '로그인(동기화)이 끝난 뒤 다시 열어 주세요.'; return; }
    this._mcp = url;
    box.className = 'mcp';
    box.innerHTML = `
      <p class="mcp-p">ChatGPT·Claude 의 <b>월 구독</b>은 API 키가 아니라서 Bashy 가 대신 부를 수 없습니다. 대신 반대로, 그 AI 가 Bashy 를 <b>도구</b>로 쓰게 연결합니다.
        연결하면 ChatGPT·Claude 앱에서 “점심에 김치찌개 먹었어”, “물 마시기 체크해 줘”, “오늘 몸무게 81.2”, “오늘 뭐 남았어?” 라고 말하면 Bashy 에 바로 기록·조회됩니다. 계산은 그 사람의 구독이 합니다.</p>
      <div class="mcp-url"><code>${esc(url)}</code><button class="btn-sm accent" onclick="Settings.mcpCopy()">복사</button></div>
      <p class="mcp-warn">이 주소는 비밀번호와 같습니다. 남에게 보이지 마세요 — 새어 나갔으면 아래 ‘주소 새로 만들기’.</p>
      <div class="set-h">Claude (무료 플랜도 1개 가능 · Pro·Max)</div>
      <ol class="mcp-ol"><li>claude.ai 에서 <b>설정(Customize) › 커넥터 › + 추가 › 사용자 지정 커넥터</b></li>
        <li>이름 <b>Bashy</b>, URL 칸에 위 주소 붙여 넣기, 로그인 방식은 <b>로그인 없음</b> → 추가</li>
        <li>대화창 아래 도구 단추에서 Bashy 를 켜고 말하면 됩니다(앱에서도 동작)</li></ol>
      <div class="set-h">ChatGPT (Plus·Pro)</div>
      <ol class="mcp-ol"><li>chatgpt.com 에서 <b>설정 › 앱 및 커넥터 › 고급 설정 › 개발자 모드</b> 켜기</li>
        <li><b>앱 및 커넥터 › 만들기</b> → 이름 Bashy, URL 에 위 주소, 인증 <b>없음</b> → 만들기</li>
        <li>새 대화에서 + › 개발자 모드 › Bashy 를 고르고 말하면 됩니다. 기록할 때마다 확인을 한 번 누릅니다</li></ol>
      <div class="set-h">할 수 있는 일</div>
      <p class="mcp-p">오늘 요약 보기 · 식단 기록(칼로리는 AI 가 추정) · 습관 체크 · 구글 할 일 추가·완료 · 몸무게·체지방·근육량 기록 · 메모 추가 · 몸 기록 추이</p>
      <div class="modal-btns" style="justify-content:flex-start"><button class="btn-sm" onclick="if(confirm('새 주소를 만들면 지금 연결해 둔 ChatGPT·Claude 커넥터는 끊깁니다. 계속할까요?'))Settings.mcpPaint(true)">주소 새로 만들기</button></div>`;
  },
  async mcpCopy() {
    try { await navigator.clipboard.writeText(this._mcp || ''); App.showToast('복사했습니다', 'success'); }
    catch { App.showToast('복사 실패 — 주소를 길게 눌러 복사해 주세요', 'error'); }
  },

  hubMenu() { const el = document.getElementById('pmHub'); if (el) el.hidden = localStorage.getItem('gl_hub_mode') !== '1'; },

  async openHub() {
    App.showToast('허브를 여는 중…');
    await this.hubLink();
    location.href = 'hub.html?from=app';
  },
  clearKeys() {
    if (!confirm('이 기기에 저장된 AI 키를 모두 지울까요?')) return;
    Object.values(JARVIS.PROVIDERS).forEach(p => localStorage.removeItem(p.key));
    window.FirebaseSync?.scheduleSave?.();
    App.showToast('AI 키를 지웠습니다', 'success');
    this._re('secure');
  },
};
