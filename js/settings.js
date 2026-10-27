// js/settings.js — 설정 화면 (프로필 → 설정)
//
// 프로필 메뉴에 열 줄 넘게 늘어놓던 것을 갈래별로 나눴다.
// 첫 화면은 갈래 목록, 누르면 그 갈래의 항목만 보인다(같은 창 안에서 넘겨 보기).
// 바로 바뀌는 것(테마·디자인·소리)은 이 화면에서 바로 바꾸고,
// 따로 창이 필요한 것(알림·AI 키·기기 연결)은 그 창을 연다.

const Settings = {
  CATS: [
    { id:'design', ic:'palette', name:'디자인',      sub:() => `${Settings._uiName()} · ${Settings._themeName()}` },
    { id:'voice',  ic:'volume',  name:'소리 · 진동 · 효과', sub:() => `답 읽기 ${Settings._on(JARVIS?._ttsEnabled)} · 효과음 ${Settings._on(Sounds?.enabled)} · 진동 ${Settings._on(Haptic.on)} · 애니메이션 ${Settings._on(typeof Fx!=='undefined' && Fx.on)}` },
    { id:'workout', ic:'dumbbell', name:'운동 · 루틴', sub:() => { try { const L = Fitness.progList(); return `루틴 묶음 ${L.progs.filter(g=>g.user).length}개 · 루틴 ${Object.keys(Fitness._rtRO()).length}개 · 요일별 운동`; } catch(e){ return '루틴 묶음 · 루틴 만들기·관리'; } } },
    { id:'notify', ic:'bell',    name:'알림',        sub:() => { try { return Notifications.getSettings().enabled ? '켜짐 · 습관·식단·할일·일정' : '꺼짐'; } catch(e){ return ''; } } },
    { id:'ai',     ic:'sparkle', name:'AI',          sub:() => { try { const P = JARVIS.PROVIDERS[JARVIS._active()]; return `기본 ${P ? (P.short || P.name) : '미설정'} · 사용량 추적`; } catch(e){ return 'AI 비서 · 사용량 추적'; } } },
    { id:'cal',    ic:'calendar', name:'일정과 할일', sub:() => { try { return `${CalSources.summary()} · 상단 지난 할일 ${localStorage.getItem('gl_top_overdue')==='0'?'숨김':'보임'}`; } catch(e){ return '캘린더 · 할일'; } } },
    { id:'econ',   ic:'trend',   name:'경제 · 증권', sub:() => '증권사 연동 · 보유 종목 · 관심 종목' },
    { id:'device', ic:'monitor', name:'스마트홈 허브', sub:() => `허브 모드 ${localStorage.getItem('gl_hub_mode')==='1'?'켜짐':'꺼짐'} · SmartThings · 구글 홈 · Home Assistant` },
    { id:'widget', ic:'grid',    name:'위젯 · 시리 · 홈 화면', sub:() => Settings._widgetSub() },
    { id:'secure', ic:'key',     name:'보안 · 계정', sub:() => '저장된 키 · 로그아웃 · 계정 삭제' },
    { id:'help',   ic:'book',    name:'도움말',      sub:() => '사용 도우미 · 버전' },
  ],
  VERSION: 'v26.10.20',
  // 갈래 안의 하위 화면(뒤로 가면 그 갈래로)
  SUB: { topinfo: ['상단바 정보', 'design'], cats: ['카테고리 · 카드 순서와 켜고 끄기', 'design'], connector: ['ChatGPT · Claude 연결', 'ai'] },
  _title(cat){ return cat ? (this.SUB[cat]?.[0] || this.CATS.find(c => c.id === cat)?.name || '설정') : '설정'; },

  _on(v){ return v ? '켜짐' : '꺼짐'; },
  _uiName(){ return '새 디자인'; },
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
      h = `<p class="set-lead">앱의 생김새와 메인 화면 구성을 바꿉니다. 누르면 바로 적용됩니다. 디자인·테마·아이콘·상단바 정보는 이 기기에만, 카테고리·카드 순서와 켜고 끄기는 계정에 저장되어 다른 기기에서도 같게 보입니다.</p>
        <div class="set-h">화면</div>
        ${this._item('테마', this._seg(App._theme, [['system','시스템'],['light','밝게'],['dark','어둡게']], 'Settings.setTheme'), '시스템은 휴대폰 설정(다크 모드)을 따라 낮·밤에 맞춰 바뀝니다')}
        ${this._item('아이콘', this._seg(Icons.mode, [['simple','심플'],['color','컬러']], 'Settings.setIcons'), '심플: 한 가지 색 선 아이콘 · 컬러: 카드마다 색이 들어간 아이콘')}
        ${typeof Weather!=='undefined' ? this._item('날씨 표시', this._seg(Weather.mode, [['simple','간단'],['detail','세부'],['off','끄기']], 'Settings.setWx'), '간단: 요일 옆 아이콘·기온 · 세부: 최저·지금·최고를 호 모양으로, 날짜 위에 해·구름·비·눈 효과 · 상단바 날씨를 눌러도 바뀝니다') : ''}
        ${typeof Weather!=='undefined' ? this._link('날씨 위치', 'Weather.pick()', Weather.city() ? `${esc(Weather.city().name)}${Weather.city().sub ? ' · ' + esc(Weather.city().sub) : ''} — 눌러서 바꾸기` : '아직 안 고름 — 접속 위치로 보는 중 · 눌러서 도시 고르기') : ''}
        <div class="set-h">메인 화면</div>
        ${this._link('상단바 정보', "Settings.go('topinfo')", '맨 위 줄에 보일 숫자 고르기 — 몸무게·체지방·BMI·근육량·추세·주식 등락·AI 사용량')}
        ${this._link('카테고리 · 카드 순서와 켜고 끄기', "Settings.go('cats')", `지금 ${Tabs._onTabs().map(t => t.label).join(' → ')} — 탭 순서, 카드 순서(예: 운동을 식단 위로), PC·태블릿은 카드 칸 크기(1×1·2×1…)와 자리, 안 쓰는 카드 숨기기`)}`;
    } else if (cat === 'topinfo') {
      h = TopInfo.pageHtml();
    } else if (cat === 'cats') {
      h = Tabs.catsHtml();
    } else if (cat === 'voice') {
      h = `<div class="set-h">AI 비서</div>
        ${this._item('답을 소리로 읽기', this._sw(JARVIS?._ttsEnabled, 'Settings.toggleTTS()'), 'AI 답을 음성으로 들려 줍니다')}
        <div class="set-h">앱</div>
        ${this._item('효과음', this._sw(Sounds?.enabled, 'Settings.toggleSound()'), '체크·완료할 때 짧은 소리')}
        ${this._item('진동(햅틱)', this._sw(Haptic.on, 'Settings.toggleHaptic()'), '체크·순서 바꾸기·탭 전환 때 손끝 진동')}
        <div class="set-h">효과</div>
        ${this._item('체크 애니메이션', this._sw(typeof Fx!=='undefined' && Fx.on, 'Settings.toggleFx()'), '습관을 체크하면 터지는 효과 · 다 채우면 올클리어')}`;
    } else if (cat === 'workout') {
      h = Fitness.settingsHtml(this);
    } else if (cat === 'notify') {
      h = `<div id="setNotify" class="set-loading">불러오는 중…</div>`;
      setTimeout(async () => { const el = document.getElementById('setNotify'); if (el) { el.className=''; el.innerHTML = await Notifications.pageHtml(); } }, 0);
    } else if (cat === 'ai') {
      h = `<div class="set-h">월 구독으로 쓰기 (API 키 없이)</div>
        ${this._link('ChatGPT · Claude 에 Bashy 연결', "Settings.go('connector')", 'ChatGPT Plus·Claude 구독(무료 플랜 포함)에서 “점심 김치찌개 먹었어” 하면 Bashy 에 기록됩니다')}
        <div class="set-h">앱 안 AI 비서 (API 키)</div>
        ${this._link('기본 AI · 키 설정', 'JARVIS.showKeySetup()', '무료: Groq·Gemini / 유료: ChatGPT·Claude·Grok API 키')}
        ${this._link('AI 사용량', 'AIUsage.open()', 'Claude·ChatGPT·Higgsfield 남은 한도와 초기화 시각')}
        ${this._link('위쪽 고리에 보일 AI 고르기', "Settings.go('topinfo')", '상단바에 사용량 고리로 보일 서비스')}
        <div class="set-h">개인정보</div>
        ${this._link('AI 데이터 전송 동의 철회', "JARVIS.revokeConsent();App.showToast('동의를 철회했습니다 — 다음에 AI 를 쓸 때 다시 묻습니다')", 'AI 회사(Groq·OpenAI·Anthropic·Google·xAI)로 보내기 전에 받은 동의를 지웁니다')}`;
    } else if (cat === 'cal') {
      const ov = localStorage.getItem('gl_top_overdue') !== '0';
      const g = Auth.isLoggedIn();
      const bev = BashyCal._read(BashyCal.EV_KEY).length, btk = BashyCal._read(BashyCal.TASK_KEY).filter(t => t.status !== 'completed').length;
      h = `<div class="set-h">구글 캘린더</div>
        ${g ? this._link('보일 캘린더 · 기본 캘린더', 'App.closeModal();GoogleCalendar.showSettings()', '어떤 캘린더 일정을 보일지, 새 일정을 어디에 넣을지')
            : Auth.appleUser ? this._link('구글 캘린더·할 일 연결', 'App.closeModal();Auth.connectGoogle()', '구글 계정의 일정과 할 일을 함께 봅니다')
            : this._item('구글 캘린더', '<span class="set-val">연결 안 됨</span>', '다시 로그인하면 구글 일정과 할 일이 보입니다')}
        ${DeviceCal.avail() ? `<div class="set-h">아이폰 캘린더</div><div id="setDevCal">${this._devCalHtml()}</div>` : ''}
        <div class="set-h">캘린더 구독 주소</div>
        <div id="setIcs">${this._icsHtml()}</div>
        <div class="set-h">Bashy 캘린더</div>
        ${this._item('Bashy 캘린더 · 할일', '<span class="set-val">항상 켜짐</span>', `일정 ${bev}개 · 할일 ${btk}개 · 다른 기기에서도 보입니다`)}
        ${this._link('지금 다시 불러오기', 'App.closeModal();App.sync()', '연결한 캘린더를 모두 새로 받아 옵니다')}
        <div class="set-h">상단 요약</div>
        ${this._item('기한 지난 할일도 보이기', this._sw(ov, 'Settings.toggleOverdue()'), ov ? '위쪽 급한 할일 줄에 기한이 지난 것도 함께 보입니다' : '기한이 지나지 않은 할일만 위쪽에 보입니다')}`;
    } else if (cat === 'econ') {
      h = `<div class="set-h">보유 종목 가져오기</div>
        ${this._link('증권사 연동', 'App.closeModal();Econ.showBroker()', '한국투자증권 Open API 앱키로 보유 종목·수량·평단을 그대로 가져옵니다')}
        ${this._link('캡처로 채우기', 'App.closeModal();Econ.showHoldScan()', '다른 증권사는 보유 화면 캡처를 AI 가 읽어 채웁니다')}
        <div class="set-h">목록</div>
        ${this._link('보유 종목 편집', "App.closeModal();Econ.open('hold')", '수량·평단 고치기, 평가액·수익률 보기')}
        ${this._link('관심 종목 · 지수', 'App.closeModal();Econ.open()', '시세를 볼 종목 담기·빼기')}
        <div class="set-h">위쪽 표시</div>
        ${this._link('상단바에 주식 등락 보이기', "Settings.go('topinfo')", '보유 / 관심종목의 오늘 등락 %')}`;
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
      h = `<div class="set-h">허브 태블릿</div>
        ${this._link('허브 태블릿 승인 (6자리 번호)', 'DevicePair.openPair()', '태블릿 화면에 뜬 번호를 넣으면 이 계정에 연결됩니다 · QR 을 찍었다면 이미 채워져 있습니다')}
        <div class="set-h">허브</div>
        ${this._item('허브 모드', this._sw(hub, 'Settings.toggleHub()'), '켜 두면 프로필 메뉴에 \'허브 모드로 전환\' 단추가 생깁니다. 누르면 큰 시계·할 일·AI 사용량·집 기기 화면(가로)으로 바뀝니다')}
        ${this._link('지금 허브 화면 열기', 'Settings.openHub()', '허브 오른쪽 아래 ‹ 앱으로 를 누르면 돌아옵니다')}
        <div class="set-h">스마트홈</div>
        ${this._link('스마트홈 연결', 'DevicePair.open()', 'SmartThings · 구글 홈 · Home Assistant 연결')}`;
    } else if (cat === 'widget') {
      h = this._widgetHtml();
    } else if (cat === 'help') {
      h = `${this._link('사용 도우미 다시 보기', 'App.closeModal();Onboard.open(true)', '모든 기능 안내(일정·습관·식단·운동·인바디·메모·경제·AI·스마트홈·위젯·설정)와 메뉴 위치 · 설정 도우미')}
        ${this._link('위젯 · 시리 · 홈 화면에 추가', "Settings.go('widget')", '휴대폰 홈 화면에서 바로 열기')}
        ${this._item('버전', `<span class="set-val">${this.VERSION}</span>`)}
        ${typeof AppUpdate!=='undefined'&&AppUpdate.on ? this._link('업데이트 확인', "AppUpdate.check('manual')", `안드로이드 앱 빌드 ${AppUpdate.local} · 새 빌드가 있으면 APK 를 받습니다`) : ''}`;
    }
    return (this.SUB[cat] ? `<button type="button" class="set-back" onclick="Settings.go('${this.SUB[cat][1]}')">‹ ${this.CATS.find(c => c.id === this.SUB[cat][1])?.name || '설정'}</button>` : this._back()) + `<div class="set-page">${h}</div>`;
  },

  // ── 바로 바뀌는 항목 ─────────────────────
  setWx(v) { Weather.setMode(v); this._re('design'); },
  setTheme(v) { App._theme = v; App._applyTheme(); this._re('design'); },
  setIcons(v) { Icons.mode = v; Icons.applyMode(); Icons.updateModeLabel?.(); this._re('design'); },
  toggleTTS() { JARVIS.toggleTTS(); this._re('voice'); },
  toggleHaptic() { Haptic.on = !Haptic.on; if (Haptic.on) Haptic.light(); this._re('voice'); },
  toggleFx() { Fx.on = !Fx.on; if (Fx.on) setTimeout(() => { Fx.check(document.querySelector('.set-sw[onclick*="toggleFx"]'), true); }, 60); this._re('voice'); },
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
  // 주소는 화면을 그릴 때 미리 받아 둔다. 단추를 누른 순간엔 기다리지 않고 바로 복사·열기 해야
  // 사파리가 '사용자가 누른 일' 로 보고 복사와 새 창을 막지 않는다.
  MCP_GO: {
    claude:  { name: 'Claude',  url: 'https://claude.ai/customize/connectors' },
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/plugins' },
  },
  async mcpPaint(fresh) {
    const box = document.getElementById('mcpBox'); if (!box) return;
    const url = await this.mcpUrl(fresh);
    if (!url) { box.textContent = '로그인(동기화)이 끝난 뒤 다시 열어 주세요.'; return; }
    this._mcp = url;
    box.className = 'mcp';
    const share = typeof navigator.share === 'function';
    box.innerHTML = `
      <p class="mcp-p">ChatGPT·Claude 의 <b>월 구독</b>은 API 키가 아니라서 Bashy 가 대신 부를 수 없습니다. 대신 그 AI 가 Bashy 를 <b>도구</b>로 쓰게 연결합니다.
        연결하면 그 앱에서 “점심에 김치찌개 먹었어”, “물 마시기 체크해 줘”, “오늘 몸무게 81.2” 라고 말하면 Bashy 에 바로 기록됩니다.</p>
      <div class="ez-go2">
        <button type="button" class="ez-go" onclick="Settings.mcpGo('claude')"><b>Claude 에 연결</b><small>주소를 복사하고 커넥터 화면을 엽니다</small></button>
        <button type="button" class="ez-go" onclick="Settings.mcpGo('chatgpt')"><b>ChatGPT 에 연결</b><small>주소를 복사하고 플러그인 화면을 엽니다</small></button>
      </div>
      <div class="mcp-url"><code>${esc(url)}</code><button class="btn-sm" onclick="Settings.mcpCopy()">복사</button></div>
      <p class="mcp-warn">이 주소는 비밀번호와 같습니다. 남에게 보이지 마세요 — 새어 나갔으면 아래 ‘주소 새로 만들기’.</p>
      <div class="set-h">Claude (무료 플랜도 1개 · Pro · Max)</div>
      <ol class="ez-steps">
        <li>위 <b>Claude 에 연결</b>을 누르면 주소가 복사되고 claude.ai 커넥터 화면이 열립니다</li>
        <li><b>사용자 지정 커넥터 추가</b>(Add custom connector) → 이름 <button type="button" class="ez-chip" onclick="Settings.copy('Bashy','이름을 복사했습니다')">Bashy 복사</button>, URL 칸에 <b>붙여 넣기</b> → 추가</li>
        <li>대화창 <b>+</b> › 커넥터에서 Bashy 를 켜고 말하면 됩니다 (휴대폰 앱에서도 동작)</li></ol>
      <div class="set-h">ChatGPT (Plus · Pro)</div>
      <ol class="ez-steps">
        <li>위 <b>ChatGPT 에 연결</b>을 누르면 주소가 복사되고 chatgpt.com 플러그인 화면이 열립니다 (PC 웹에서)</li>
        <li><b>+</b> › <b>Add custom MCP server</b> → 이름 <button type="button" class="ez-chip" onclick="Settings.copy('Bashy','이름을 복사했습니다')">Bashy 복사</button>, Connection 에 <b>붙여 넣기</b>, 인증 <b>없음</b> → 확인 체크 → 만들기</li>
        <li>새 대화에서 <b>@Bashy</b> 를 고르고 말하면 됩니다. 메뉴가 안 보이면 설정 › 앱 › 고급 설정 › <b>개발자 모드</b>를 먼저 켭니다</li></ol>
      ${share ? `<div class="set-h">PC 에서 하려면</div>
      ${this._link('이 주소를 PC 로 보내기', 'Settings.mcpShare()', '카카오톡 나에게 보내기 · 메일 등으로 PC 에 옮깁니다')}` : ''}
      <div class="set-h">할 수 있는 일</div>
      <p class="mcp-p">오늘 요약 보기 · 식단 기록(칼로리는 AI 가 추정) · 습관 체크 · 구글 할 일 추가·완료 · 몸무게·체지방·근육량 기록 · 메모 추가 · 몸 기록 추이</p>
      <div class="modal-btns" style="justify-content:flex-start"><button class="btn-sm" onclick="if(confirm('새 주소를 만들면 지금 연결해 둔 ChatGPT·Claude 커넥터는 끊깁니다. 계속할까요?'))Settings.mcpPaint(true)">주소 새로 만들기</button></div>`;
  },
  mcpGo(k) {
    const G = this.MCP_GO[k]; if (!G || !this._mcp) return;
    this.copy(this._mcp, `주소를 복사했습니다 — 열린 ${G.name} 화면의 URL 칸에 붙여 넣으세요`);
    this.openExt(G.url);
  },
  mcpCopy() { this.copy(this._mcp || '', '복사했습니다'); },
  mcpShare() { if (this._mcp && navigator.share) navigator.share({ title: 'Bashy 커넥터 주소', text: this._mcp }).catch(() => {}); },

  // ── 쉬운 연결 도우미 (여러 화면이 같이 쓴다) ─────────────
  // 복사: 클립보드 API 가 막힌 곳(오래된 웹뷰)은 숨은 입력칸으로 한 번 더 시도한다.
  copy(text, ok = '복사했습니다') {
    const done = () => App.showToast(ok, 'success');
    const legacy = () => {
      try {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
        document.body.appendChild(t); t.select(); const r = document.execCommand('copy'); t.remove();
        r ? done() : App.showToast('복사하지 못했습니다 — 길게 눌러 복사해 주세요', 'error');
      } catch { App.showToast('복사하지 못했습니다 — 길게 눌러 복사해 주세요', 'error'); }
    };
    try { if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(done, legacy); return; } } catch {}
    legacy();
  },
  // 클립보드 읽기 — 사용자가 단추를 누른 순간에만 부른다(브라우저가 그때만 허락한다)
  async readClip() {
    try { return ((await navigator.clipboard.readText()) || '').trim(); } catch { return null; }
  },
  // 바깥 페이지 열기. 앱(아이폰·안드로이드)에서는 시스템 브라우저/그 앱으로, 웹에서는 새 탭으로.
  // shortcuts:// 같은 앱 주소는 그 앱을 연다.
  openExt(url) {
    if (!/^https?:/i.test(url)) { location.href = url; return; }
    const w = window.open(url, '_blank', 'noopener');
    if (!w && !Platform.native) location.href = url;
  },
  // 휴대폰 설정의 이 앱 화면(알림·카메라·캘린더 권한)을 바로 연다. 예전 앱 빌드는 이 기능이 없어 false.
  async osSettings(target = 'app') {
    const B = window.Capacitor?.Plugins?.BashyNative;
    if (!Platform.native || !B || typeof B.openSettings !== 'function') return false;
    try { await B.openSettings({ target }); return true; } catch { return false; }
  },
  // 권한이 막혔을 때 쓰는 안내: 앱이면 '설정 열기' 단추가 달린 토스트, 아니면 글로만
  permHelp(msg, target = 'app') {
    const B = window.Capacitor?.Plugins?.BashyNative;
    if (Platform.native && B && typeof B.openSettings === 'function') App.showToast(msg, 'error', { label: '설정 열기', fn: () => this.osSettings(target) });
    else App.showToast(msg, 'error');
  },

  // ── 홈 화면에 추가 (웹) ─────────────
  // 안드로이드·PC 크롬은 설치 창을 바로 띄울 수 있다. 아이폰 사파리는 막혀 있어 공유 단추 안내만 한다.
  _bip: null,
  get standalone() { return Platform.native || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; },
  get iosWeb() { return !Platform.native && /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !Platform.native); },
  async install() {
    if (this._bip) {
      const e = this._bip; this._bip = null;
      e.prompt();
      try { const r = await e.userChoice; if (r.outcome === 'accepted') App.showToast('홈 화면에 Bashy 를 담았습니다', 'success'); } catch {}
      this._re('widget');
      return;
    }
    this.go('widget');
  },
  _widgetSub() {
    if (Platform.ios) return '홈 화면 위젯 · 시리로 할 일·몸무게 기록';
    if (Platform.native) return '홈 화면 위젯 (오늘 · 습관)';
    return this.standalone ? '홈 화면에서 앱처럼 열고 있습니다' : '홈 화면에 Bashy 아이콘 담기';
  },
  _widgetHtml() {
    const B = window.Capacitor?.Plugins?.BashyNative;
    if (Platform.ios) {
      const siri = [['Bashy에 할 일 추가', '할 일 이름을 물어보고 바로 넣습니다'], ['Bashy 오늘 할 일', '앱을 열어 오늘 화면을 보여 줍니다'], ['Bashy에 몸무게 기록', '숫자를 물어보고 오늘 몸무게로 남깁니다']];
      return `<div class="set-h">홈 화면 위젯</div>
        <ol class="ez-steps">
          <li>이 창을 닫고 <b>홈 화면 빈 곳을 길게</b> 누릅니다 (아이콘이 흔들릴 때까지)</li>
          <li>왼쪽 위 <b>편집</b> › <b>위젯 추가</b> (예전 iOS 는 <b>+</b>)</li>
          <li>검색 칸에 <button type="button" class="ez-chip" onclick="Settings.copy('Bashy','Bashy 를 복사했습니다 — 검색 칸에 붙여 넣으세요')">Bashy 복사</button> → <b>Bashy 오늘</b> › 크기 고르고 <b>위젯 추가</b></li>
        </ol>
        <p class="set-note">아이폰은 앱이 위젯을 대신 놓아 줄 수 없게 막혀 있어 위 세 단계만 직접 해 주세요. 위젯은 앱을 열 때마다 새 숫자로 바뀝니다.</p>
        <div class="set-h">고를 수 있는 위젯</div>
        ${[['일정 · 할 일', '중간(가로 4칸×2줄) · 큰', '이번 달 달력 + 할 일. 동그라미를 누르면 완료, + 를 누르면 앱이 열리며 바로 새 할 일을 적습니다'],
           ['AI 사용량', '작은(2×2) · 중간', 'Claude·ChatGPT 5시간·7일 남은 양, Higgsfield 크레딧 — 초기화 시각'],
           ['칼로리 · 운동', '작은 · 중간 · 잠금 화면', '남은 열량 고리, 단·탄·지, 오늘 운동 부위와 진행'],
           ['습관 · 체크리스트', '작은 · 중간 · 큰 · 잠금 화면', '위젯에서 바로 습관을 체크합니다'],
           ['시세', '작은 · 중간', '비트코인과 경제 카드 즐겨찾기 종목'],
           ['Bashy 오늘', '작은 · 중간', '습관·할 일·다음 일정 요약'],
           ['Bashy 잠금 화면', '잠금 화면 3가지', '날씨·할 일 한 줄, 다음 일정, 습관 고리']]
          .map(([n, sz, d]) => `<div class="set-item"><span class="set-tx"><b>${n}</b><small>${sz} — ${d}</small></span></div>`).join('')}
        <div class="set-h">시리 · 단축어 — 설정 없이 바로 됩니다</div>
        ${siri.map(([p, d]) => `<div class="set-item"><span class="set-tx"><b>“시리야, ${p}”</b><small>${d}</small></span></div>`).join('')}
        ${this._link('단축어 앱에서 보기', "Settings.openExt('shortcuts://')", '단축어 앱 › 앱 단축어 › Bashy — 홈 화면 단추나 뒷면 탭에 붙일 수 있습니다')}`;
    }
    if (Platform.native) {
      const pin = B && typeof B.pinWidget === 'function';
      return `<div class="set-h">홈 화면 위젯</div>
        ${pin ? `${this._link('오늘 위젯 놓기', "Settings.pinWidget('today')", '남은 할 일·습관·식단 요약 — 누르면 홈 화면에 놓을 위치를 묻습니다')}
          ${this._link('습관 위젯 놓기', "Settings.pinWidget('habit')", '오늘 습관 진행')}` : ''}
        <ol class="ez-steps">
          <li>홈 화면 빈 곳을 <b>길게</b> 누르고 <b>위젯</b>을 누릅니다</li>
          <li>목록에서 <b>Bashy</b> › <b>Bashy 오늘</b> 또는 <b>Bashy 습관</b>을 길게 눌러 원하는 곳에 놓습니다</li>
        </ol>`;
    }
    // 웹
    if (this.standalone) return `<p class="set-note">이미 홈 화면에서 앱처럼 열고 있습니다. 위젯과 시리는 App Store·Play 스토어의 Bashy 앱에서 쓸 수 있습니다.</p>`;
    if (this._bip) return `<div class="set-h">홈 화면에 추가</div>
      <button type="button" class="ez-go ez-go-1" onclick="Settings.install()"><b>홈 화면에 Bashy 담기</b><small>한 번 누르면 설치 창이 뜹니다 · 앱처럼 전체 화면으로 열립니다</small></button>`;
    if (this.iosWeb) return `<div class="set-h">홈 화면에 추가 (아이폰 사파리)</div>
      <ol class="ez-steps">
        <li>화면 아래(아이패드는 위) <b>공유 단추</b> <span class="ez-ic" aria-hidden="true">⬆︎</span> 를 누릅니다</li>
        <li>목록을 내려 <b>홈 화면에 추가</b> › 오른쪽 위 <b>추가</b></li>
        <li>이제 홈 화면의 Bashy 아이콘으로 열면 <b>알림</b>도 받을 수 있습니다</li>
      </ol>
      <p class="set-note">아이폰 사파리는 웹사이트가 이 창을 대신 띄울 수 없게 막혀 있습니다.</p>`;
    return `<div class="set-h">홈 화면에 추가</div>
      <ol class="ez-steps">
        <li>크롬 주소창 오른쪽의 <b>설치</b> 아이콘(모니터에 화살표)을 누르거나, <b>⋮</b> › <b>홈 화면에 추가</b>(PC 는 <b>Bashy 설치</b>)</li>
        <li><b>설치</b>를 누르면 앱처럼 따로 열립니다</li>
      </ol>`;
  },
  async pinWidget(kind) {
    const B = window.Capacitor?.Plugins?.BashyNative;
    try { const r = await B.pinWidget({ kind }); if (r && r.ok === false) throw new Error(r.error || '이 홈 화면은 위젯 놓기를 지원하지 않습니다'); App.showToast('홈 화면에서 놓을 위치를 골라 주세요', 'success'); }
    catch (e) { App.showToast((e.message || e) + ' — 아래 순서대로 직접 놓아 주세요', 'error'); }
  },

  // ── 일정과 할일: 아이폰 캘린더 · 구독 주소 ─────────────
  _devCalHtml() {
    const on = DeviceCal.on();
    let h = this._item('아이폰 캘린더 보기', this._sw(on, `Settings.deviceCal(${!on})`),
      on ? '아이폰에 추가한 계정의 일정을 함께 보여 줍니다' : 'iCloud·네이버·아웃룩 등 아이폰 설정에 추가한 계정의 일정을 함께 봅니다');
    if (!on) return h;
    const cals = DeviceCal._cals;
    if (!cals) { setTimeout(() => DeviceCal.calendars().then(() => this._paintDevCal()).catch(e => App.showToast(e.message, 'error')), 0); return h + '<div class="set-loading">캘린더를 불러오는 중…</div>'; }
    if (!cals.length) return h + '<p class="set-note">이 아이폰에 캘린더가 없습니다.</p>';
    const hide = new Set(DeviceCal.cfg().hide || []), dest = DeviceCal.dest();
    h += cals.map((c, i) => `<div class="set-item cal-row"><i class="ev-dot" style="background:${esc(c.color)}"></i>
        <span class="set-tx"><b>${esc(c.title)}</b><small>${esc(c.source || '')}${c.allowsModify ? '' : ' · 읽기 전용'}</small></span>
        ${this._sw(!hide.has(c.id), `Settings.devCalShow(${i})`)}</div>`).join('');
    const w = DeviceCal.writable();
    if (w.length) h += this._item('새 일정 기본 저장', `<select class="inp inp-sm cal-sel" onchange="Settings.devCalDest(this.value)">${
      w.map((c) => `<option value="${cals.indexOf(c)}"${dest && dest.id === c.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('')}</select>`, '추가 창에서 바꿀 수 있습니다');
    return h;
  },
  _paintDevCal() { const el = document.getElementById('setDevCal'); if (el) el.innerHTML = this._devCalHtml(); },
  async deviceCal(on) {
    try {
      await DeviceCal.enable(on);
      if (on) await DeviceCal.calendars(true);
      App.showToast(on ? '아이폰 캘린더를 함께 봅니다' : '아이폰 캘린더를 껐습니다', 'success');
    } catch (e) {
      const m = e.message || String(e);
      if (/설정 ›/.test(m)) this.permHelp('캘린더 접근이 꺼져 있습니다 — 설정 열기 › 캘린더 › ‘전체 접근’', 'app'); else App.showToast(m, 'error');
    }
    try { Auth._paintGConnect(); } catch (e) {}
    this._paintDevCal();
    App.sync();
  },
  devCalShow(i) {
    const c = (DeviceCal._cals || [])[i]; if (!c) return;
    const hide = new Set(DeviceCal.cfg().hide || []);
    DeviceCal.setVisible(c.id, hide.has(c.id));
    this._paintDevCal(); App.sync();
  },
  devCalDest(i) { const c = (DeviceCal._cals || [])[+i]; if (c) { DeviceCal.setDest(c.id); CalSources.remember('device:' + c.id); } },

  _icsColor: null,
  _icsHtml() {
    const list = IcsCal.sources();
    const cur = this._icsColor || IcsCal.COLORS[list.length % IcsCal.COLORS.length];
    const host = u => { try { return new URL(u).host; } catch (e) { return u; } };
    return list.map(s => `<div class="set-item cal-row"><i class="ev-dot" style="background:${esc(s.color)}"></i>
        <span class="set-tx"><b>${esc(s.name)}</b><small${IcsCal.errors[s.id] ? ' class="cal-err"' : ''}>${IcsCal.errors[s.id] ? '받지 못함 · ' + esc(IcsCal.errors[s.id]) : esc(host(s.url)) + ' · 읽기 전용'}</small></span>
        <button type="button" class="btn-sm cal-del" onclick="Settings.icsRemove('${s.id}')">삭제</button></div>`).join('')
      + `<div class="cal-ics-add">
        <input id="icsUrl" class="inp" type="url" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="https:// 또는 webcal:// 로 시작하는 주소">
        <div class="cal-ics-line">
          <input id="icsName" class="inp" type="text" maxlength="30" placeholder="이름 (비우면 캘린더 이름)">
          <div class="cal-sw" role="radiogroup" aria-label="색">${IcsCal.COLORS.map(c => `<button type="button" role="radio" aria-checked="${c === cur}" class="${c === cur ? 'on' : ''}" style="--c:${c}" onclick="Settings.icsPick('${c}')"></button>`).join('')}</div>
        </div>
        <div class="cal-ics-btns">
          <button type="button" class="btn-sm" onclick="Settings.icsPaste()">복사한 주소 붙여넣기</button>
          <button type="button" id="icsGo" class="btn-sm accent" onclick="Settings.icsAdd()">구독 추가</button>
        </div>
        <p class="set-note">구독한 일정은 읽기만 하고, 15분마다 새로 받습니다.</p>
      </div>
      <div class="set-h">주소는 어디서 복사하나요</div>
      <div class="ez-tabs" role="tablist">${Object.entries(this.ICS_GUIDE).map(([k, g]) => `<button type="button" role="tab" class="${k === this._icsTab ? 'on' : ''}" onclick="Settings.icsTab('${k}')">${g.name}</button>`).join('')}</div>
      <div id="icsGuide">${this._icsGuide(this._icsTab)}</div>`;
  },
  // 서비스마다 'ICS 주소' 가 숨어 있는 자리가 다르다. 그 화면을 바로 열고, 누를 단추 이름을 그대로 적는다.
  _icsTab: 'naver',
  ICS_GUIDE: {
    naver:   { name: '네이버', open: 'https://calendar.naver.com/', openLbl: '네이버 캘린더 열기 (PC 웹)', steps: [
      '<b>네이버 캘린더 열기</b>를 누릅니다 (휴대폰이면 브라우저 메뉴에서 <b>PC 버전</b>으로)',
      '왼쪽 <b>내 캘린더</b>에서 가져올 캘린더 이름 옆 <b>⋯</b> › <b>캘린더 설정</b>(또는 위쪽 <b>환경설정</b> › 캘린더 관리)',
      '<b>캘린더 공개</b>를 켜고, 아래 <b>iCal 주소</b>의 <b>복사</b>를 누릅니다',
      '이 화면으로 돌아와 <b>복사한 주소 붙여넣기</b> → 자동으로 구독됩니다'] },
    icloud:  { name: 'iCloud', open: 'https://www.icloud.com/calendar/', openLbl: 'iCloud 캘린더 열기', steps: [
      '아이폰이라면 <b>캘린더 앱</b> › 아래 <b>캘린더</b> › 가져올 캘린더 옆 <b>ⓘ</b>',
      '맨 아래 <b>공개 캘린더</b>를 켜고 <b>링크 공유…</b> › <b>복사</b>',
      'PC 라면 <b>iCloud 캘린더 열기</b> › 캘린더 이름 옆 <b>공유 아이콘</b> › <b>공개 캘린더</b> 체크 › <b>링크 복사</b>',
      '이 화면으로 돌아와 <b>복사한 주소 붙여넣기</b> (webcal:// 주소도 그대로 됩니다)'] },
    outlook: { name: 'Outlook', open: 'https://outlook.live.com/calendar/0/options/calendar/SharedCalendars', openLbl: 'Outlook 일정 게시 화면 열기', steps: [
      '<b>Outlook 일정 게시 화면 열기</b>를 누릅니다 (회사 계정은 outlook.office.com 에서 같은 메뉴)',
      '<b>일정 게시</b>에서 캘린더를 고르고 권한을 <b>모든 세부 정보 볼 수 있음</b> › <b>게시</b>',
      '나온 링크 중 <b>ICS</b> 를 눌러 <b>링크 복사</b>',
      '이 화면으로 돌아와 <b>복사한 주소 붙여넣기</b>'] },
    google:  { name: '다른 구글 계정', open: 'https://calendar.google.com/calendar/r/settings', openLbl: '구글 캘린더 설정 열기', steps: [
      '로그인한 구글 계정은 이미 연결되어 있습니다. <b>다른 구글 계정</b>의 일정을 더 볼 때만 쓰세요',
      '<b>구글 캘린더 설정 열기</b> › 왼쪽 <b>내 캘린더의 설정</b>에서 캘린더 이름',
      '<b>캘린더 통합</b>까지 내려 <b>iCal 형식의 비공개 주소</b> 오른쪽 <b>복사</b> 아이콘',
      '이 화면으로 돌아와 <b>복사한 주소 붙여넣기</b>'] },
  },
  _icsGuide(k) {
    const g = this.ICS_GUIDE[k] || this.ICS_GUIDE.naver;
    return `<ol class="ez-steps">${g.steps.map(t => `<li>${t}</li>`).join('')}</ol>
      <button type="button" class="btn-sm ez-open" onclick="Settings.openExt('${g.open}')">${g.openLbl} ↗</button>`;
  },
  icsTab(k) {
    this._icsTab = k;
    document.querySelectorAll('.ez-tabs button').forEach(b => b.classList.toggle('on', b.getAttribute('onclick').includes(`'${k}'`)));
    const el = document.getElementById('icsGuide'); if (el) el.innerHTML = this._icsGuide(k);
  },
  // 복사해 온 주소를 붙여 넣고 바로 구독까지 — 입력칸을 눌러 붙여 넣는 단계를 없앤다
  async icsPaste() {
    const t = await this.readClip();
    const inp = document.getElementById('icsUrl');
    if (t == null) { inp?.focus(); App.showToast('붙여넣기가 막혀 있습니다 — 주소 칸을 길게 눌러 붙여 넣어 주세요', 'error'); return; }
    const m = t.match(/(webcals?|https?):\/\/\S+/i);
    if (!m) { App.showToast('클립보드에 캘린더 주소가 없습니다 — 아래 안내대로 주소를 먼저 복사해 주세요', 'error'); return; }
    if (inp) inp.value = m[0];
    this.icsAdd();
  },
  _paintIcs() { const el = document.getElementById('setIcs'); if (el) el.innerHTML = this._icsHtml(); },
  icsPick(c) {
    this._icsColor = c;
    document.querySelectorAll('.cal-sw button').forEach(b => { const on = b.style.getPropertyValue('--c') === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  },
  async icsAdd() {
    const url = IcsCal.normUrl(document.getElementById('icsUrl')?.value);
    const name = (document.getElementById('icsName')?.value || '').trim();
    if (!url) { App.showToast('http(s):// 또는 webcal:// 로 시작하는 주소를 넣어 주세요', 'error'); return; }
    const btn = document.getElementById('icsGo'); if (btn) { btn.disabled = true; btn.textContent = '확인하는 중…'; }
    try {
      const t = await IcsCal.test(url);
      IcsCal.add(name || t.name, url, this._icsColor);
      this._icsColor = null;
      App.showToast(`구독했습니다 — 일정 ${t.count}개`, 'success');
      try { Auth._paintGConnect(); } catch (e) {}
      this._paintIcs();
      App.sync();
    } catch (e) {
      App.showToast('추가하지 못했습니다: ' + (e.message || e), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '구독 추가'; }
    }
  },
  icsRemove(id) {
    const s = IcsCal.sources().find(x => x.id === id); if (!s) return;
    if (!confirm(`'${s.name}' 구독을 지울까요?`)) return;
    IcsCal.remove(id);
    App._srcEv.ics = App._srcEv.ics.filter(e => e._calId !== id);
    App._mergeEvents(); App._renderAllCal();
    this._paintIcs();
  },

  toggleOverdue() {
    localStorage.setItem('gl_top_overdue', localStorage.getItem('gl_top_overdue') === '0' ? '1' : '0');
    window.FirebaseSync?.scheduleSave?.(); try { App._updateStatsBanner(); } catch (e) {} this._re('cal');
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
// 안드로이드·PC 크롬: '홈 화면에 추가' 창을 우리 단추로 띄울 수 있게 잡아 둔다
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); Settings._bip = e; });
window.addEventListener('appinstalled', () => { Settings._bip = null; });
