// js/tabs.js — 모바일 하단 탭 + 메인 카드 구성
//
// 카드가 열 개가 되면서 모바일은 "한 줄로 열 개를 쌓은 화면"이 됐다.
// 아래 서너 개는 스크롤 끝에 있어서 사실상 안 보인다. 그래서 폭이 좁을 때만
// 카드를 네 묶음으로 나눈다. 묶음 기준은 "같은 순간에 함께 보는가"다 —
// 식단·운동·인바디는 몸 관리 한 세션에 같이 열리고, 경제는 돈 볼 때 혼자 열린다.
//
// PC(901px 이상)에서는 탭바가 사라지고 지금처럼 카드 전부가 3열로 깔린다.
// 숨기는 건 CSS 가 하고, 카드는 DOM 에 그대로 남는다 —
// 각 모듈의 render() 를 하나도 건드리지 않기 위해서다.

const Tabs = {
  // icon 은 js/icons.js 의 이름표다. 이모지를 직접 넣지 않는다 —
  // 기기마다 그림이 달라지고, 색이 제각각이라 지금 눌러둔 탭이 어느 건지 흐려졌다.
  // 계획 탭은 없앴다. 캘린더가 할일과 한 카드가 되면서 '오늘' 로 옮겨졌고,
  // 남은 게 메모 하나뿐인 탭은 탭이라고 할 게 못 된다.
  // 이름은 카드가 하는 일을 그대로 부른다. '오늘·몸·자산' 은 짧지만
  // 그 탭에 뭐가 들어 있는지는 눌러 봐야 알았다. id 는 그대로 둔다 —
  // 끈 카드 목록과 body[data-tab] 이 이 값을 쓰고 있어서, 바꾸면 저장된 설정이 끊긴다.
  DEF: [
    { id:'today', label:'일정', icon:'calendar' },
    { id:'body',  label:'건강', icon:'dumbbell' },
    { id:'money', label:'경제', icon:'trend'    },
  ],
  // 탭바에만 있고 카드는 없는 자리. Bashy 는 화면을 바꾸는 게 아니라 창을 연다.
  // 떠 있던 동그란 단추는 늘 뭔가를 가리고 있었다 — 손이 닿는 자리는 어차피 여기다.
  JARVIS_TAB: { id:'jarvis', label:'Bashy', icon:'zap' },
  // 카드 → 탭 · 이름 (설정 화면에서도 이 목록을 쓴다)
  CARDS: [
    { cls:'card-calendar',  name:'일정과 할일', tab:'today' },
    { cls:'card-checklist', name:'체크리스트', tab:'today' },
    { cls:'card-habits',    name:'오늘의 습관', tab:'today' },
    { cls:'card-memo',      name:'메모',      tab:'today' },
    { cls:'card-diet',      name:'식단 기록',  tab:'body'  },
    { cls:'card-fitness',   name:'오늘의 운동', tab:'body'  },
    { cls:'card-inbody',    name:'인바디',    tab:'body'  },
    { cls:'card-econ',      name:'경제',      tab:'money' },
  ],

  OFF_KEY: 'gl_cards_off',
  _cur: 'today',
  get current(){ return this._cur; },
  tabOf(cardClass){
    const c = this.CARDS.find(x => x.cls === cardClass);
    return c ? c.tab : 'today';
  },

  init() {
    // 카드가 열 껍데기(.dash-col) 안으로 들어가서 '>' 로는 안 잡힌다.
    document.querySelectorAll('.dashboard .card').forEach(el => {
      const c = this.CARDS.find(x => el.classList.contains(x.cls));
      if (c) el.dataset.tab = c.tab;
    });
    this._paintBar();
    this.applyOff();
    // 매일 여는 앱의 기본 상태는 언제나 '오늘'이다. 마지막 탭을 복원하지 않는다.
    this.set('today', true);
  },

  _paintBar() {
    const bar = document.getElementById('tabbar');
    if (!bar) return;
    const j = this.JARVIS_TAB;
    bar.innerHTML = this.DEF.map(t =>
      `<button class="tab-btn" data-t="${t.id}" onclick="Tabs.set('${t.id}')" aria-label="${t.label}">
        ${Icons.svg(t.icon, 'tab-ic')}<span class="tab-lb">${t.label}</span>
      </button>`).join('')
      + `<button class="tab-btn tab-jarvis" data-t="${j.id}" onclick="JARVIS.toggle()" aria-label="${j.label}">
          ${Icons.svg(j.icon, 'tab-ic')}<span id="tabJarvisBadge" class="tab-badge hidden">0</span>
          <span class="tab-lb">${j.label}</span>
        </button>`;
  },

  set(id, silent) {
    if (!this.DEF.some(t => t.id === id)) id = 'today';
    this._cur = id;
    document.body.dataset.tab = id;
    document.querySelectorAll('#tabbar .tab-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.t === id));
    if (!silent) window.scrollTo({ top:0, behavior:'smooth' });
  },

  // ── 메인 카드 켜고 끄기 ───────────────────────────────
  // 끈 카드는 DOM 에 그대로 남는다. 지우면 그 모듈의 render() 가 매번 터진다.
  // (각 모듈은 자기 컨테이너가 없으면 조용히 빠지도록 이미 되어 있지만,
  //  숨기기와 삭제는 다른 일이다 — 다시 켰을 때 데이터가 그대로여야 한다.)
  getOff() {
    try { return JSON.parse(UserStore.get(this.OFF_KEY) || '[]'); } catch { return []; }
  },
  isOn(cls) { return !this.getOff().includes(cls); },

  applyOff() {
    const off = this.getOff();
    this.CARDS.forEach(c => {
      const el = document.querySelector('.' + c.cls);
      if (el) el.classList.toggle('card-off', off.includes(c.cls));
    });
  },

  toggleCard(cls, on) {
    let off = this.getOff();
    off = on ? off.filter(x => x !== cls) : (off.includes(cls) ? off : off.concat(cls));
    UserStore.set(this.OFF_KEY, JSON.stringify(off));
    if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleSave?.();
    this.applyOff();
    this._paintSettings();
  },

  openSettings() {
    App.openModal('@grid 메인 카드', `<div id="cardSetBody"></div>
      <p class="ec-hint">끈 카드는 화면에서만 빠집니다. 기록은 그대로 남고, 다시 켜면 돌아옵니다.</p>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`);
    this._paintSettings();
  },

  _paintSettings() {
    const b = document.getElementById('cardSetBody');
    if (!b) return;
    const off = this.getOff();
    const byTab = this.DEF.map(t => ({ t, list: this.CARDS.filter(c => c.tab === t.id) }));
    b.innerHTML = byTab.map(({ t, list }) => `
      <div class="cardset-grp">
        <div class="cardset-hd">${Icons.svg(t.icon)} ${t.label}</div>
        ${list.map(c => {
          const on = !off.includes(c.cls);
          return `<label class="cardset-row">
            <span class="cardset-nm">${c.name}</span>
            <span class="ec-sw"><input type="checkbox" ${on ? 'checked' : ''}
              onchange="Tabs.toggleCard('${c.cls}', this.checked)"><span></span></span>
          </label>`;
        }).join('')}
      </div>`).join('');
  },
};
