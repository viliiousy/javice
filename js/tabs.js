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
  JARVIS_TAB: { id:'jarvis', label:'AI', icon:'sparkle' },
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
  // 카드·카테고리 순서는 휴대폰과 넓은 화면(PC·태블릿)을 따로 둔다 — 폰은 탭마다 한 줄, 넓은 화면은 한 판에 다 놓여서 원하는 순서가 다르다.
  // 휴대폰은 예전 키를 그대로 쓴다(이미 정해 둔 순서가 유지되게).
  _wide() { try { return matchMedia('(min-width:641px)').matches; } catch (e) { return false; } },
  get ORDER_KEY() { return this._wide() ? 'gl_cards_order_w' : 'gl_cards_order'; },     // 카드 순서(사람마다) — 예: 식단보다 운동을 위로
  order() {
    let o = []; try { o = JSON.parse(UserStore.get(this.ORDER_KEY) || '[]') || []; } catch {}
    const all = this.CARDS.map(c => c.cls);
    return o.filter(x => all.includes(x)).concat(all.filter(x => !o.includes(x)));
  },
  get TABS_ORDER_KEY() { return this._wide() ? 'gl_tabs_order_w' : 'gl_tabs_order'; },  // 카테고리(아래 탭) 순서
  tabsSorted() {
    let o = []; try { o = JSON.parse(UserStore.get(this.TABS_ORDER_KEY) || '[]') || []; } catch {}
    const ids = this.DEF.map(t => t.id), ord = o.filter(x => ids.includes(x)).concat(ids.filter(x => !o.includes(x)));
    return ord.map(id => this.DEF.find(t => t.id === id));
  },
  hasTabOrder() { return this.tabsSorted().map(t => t.id).join() !== this.DEF.map(t => t.id).join(); },
  moveTab(id, dir) {
    const o = this.tabsSorted().map(t => t.id), i = o.indexOf(id), j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    UserStore.set(this.TABS_ORDER_KEY, JSON.stringify(o)); window.FirebaseSync?.scheduleSave?.();
    this._paintBar(); this.set(this._cur, true); this.applyOrder();
    try { Haptic.light(); } catch (e) {}
    Settings._re('cats');
  },
  hasOrder() { try { return (JSON.parse(UserStore.get(this.ORDER_KEY) || '[]') || []).length > 0; } catch { return false; } },
  // 순서를 화면에 입힌다: 카드를 한 줄 흐름으로 펴고(order 속성) — 기본 순서면 원래 배치 그대로
  applyOrder() {
    const on = this.hasOrder() || this.hasTabOrder();
    document.documentElement.classList.toggle('card-ordered', on);
    // 카테고리 순서가 먼저, 그 안에서 카드 순서 (PC 에서는 이 순서대로 한 화면에 놓인다)
    const rank = this.tabsSorted().map(t => t.id), o = this.order();
    this.CARDS.forEach(c => { const el = document.querySelector('.' + c.cls); if (el) el.style.order = on ? String(rank.indexOf(c.tab) * 20 + o.indexOf(c.cls) + 1) : ''; });
  },
  moveCard(cls, dir) {
    const t = this.tabOf(cls), o = this.order();
    // 같은 카테고리 안에서만 자리를 바꾼다(폰에서는 카테고리마다 따로 보이므로)
    const same = o.filter(x => this.tabOf(x) === t), i = same.indexOf(cls), j = i + dir;
    if (j < 0 || j >= same.length) return;
    const a = o.indexOf(same[i]), b = o.indexOf(same[j]); [o[a], o[b]] = [o[b], o[a]];
    UserStore.set(this.ORDER_KEY, JSON.stringify(o)); window.FirebaseSync?.scheduleSave?.();
    this.applyOrder(); try { Haptic.light(); } catch (e) {}
    (document.getElementById('cardSetBody') ? this._paintSettings() : Settings._re('cats'));
  },
  resetOrder() { UserStore.set(this.ORDER_KEY, '[]'); UserStore.set(this.TABS_ORDER_KEY, '[]'); this._paintBar(); this.set(this._cur, true); window.FirebaseSync?.scheduleSave?.(); this.applyOrder(); (document.getElementById('cardSetBody') ? this._paintSettings() : Settings._re('cats')); App.showToast('카테고리·카드 순서를 처음대로 돌렸습니다', 'success'); },
  TABS_OFF_KEY: 'gl_tabs_off',
  getTabsOff() { try { return JSON.parse(UserStore.get(this.TABS_OFF_KEY) || '[]'); } catch { return []; } },
  tabOn(id) { return !this.getTabsOff().includes(id); },
  _onTabs() { return this.tabsSorted().filter(t => this.tabOn(t.id)); },
  // 카테고리(탭) 켜고 끄기 — 하나는 남아야 한다
  toggleTab(id, on) {
    let off = this.getTabsOff();
    if (!on && this._onTabs().length <= 1 && this.tabOn(id)) { App.showToast('카테고리는 하나 이상 남아야 합니다', 'error'); Settings._re('cats'); return; }
    off = on ? off.filter(x => x !== id) : (off.includes(id) ? off : off.concat(id));
    UserStore.set(this.TABS_OFF_KEY, JSON.stringify(off));
    window.FirebaseSync?.scheduleSave?.();
    this._paintBar(); this.applyOff();
    if (!this.tabOn(this._cur)) this.set(this._onTabs()[0].id, true); else this.set(this._cur, true);
    Settings._re('cats');
  },
  catsHtml() {
    const off = this.getOff(), T = this.tabsSorted();
    const mv = (fn, a, b) => `<span class="co-mv"><button type="button" class="co-b" ${a ? 'disabled' : ''} onclick="${fn}(-1)" aria-label="위로">↑</button><button type="button" class="co-b" ${b ? 'disabled' : ''} onclick="${fn}(1)" aria-label="아래로">↓</button></span>`;
    return `<div class="co-intro">
        <p>메인 화면을 내 쓰임새대로 고칩니다.</p>
        <ul><li><b>카테고리 순서</b> — 카테고리 이름 옆 ↑↓ 로 아래 탭의 순서를 바꿉니다. 맨 위 카테고리가 앱을 열면 처음 보이는 화면입니다.</li>
          <li><b>카드 순서</b> — 카드 이름 옆 ↑↓ 로 그 카테고리 안에서 위아래를 바꿉니다. 예: 식단보다 운동을 위로.</li>
          <li><b>켜고 끄기</b> — 스위치를 끄면 그 카드(또는 카테고리 전체)가 화면에서만 빠집니다. 기록은 그대로 남고 다시 켜면 돌아옵니다.</li></ul>
        <p class="co-sub">지금 바꾸는 순서: <b>${this._wide() ? 'PC·태블릿' : '휴대폰'}</b>. 순서는 휴대폰과 PC·태블릿을 따로 저장합니다(켜고 끄기는 함께). ${this._wide() ? 'PC·태블릿은 탭 없이 이 순서대로 한 화면에 놓입니다.' : '휴대폰은 카테고리 탭마다 이 순서로 보입니다.'}</p></div>`
      + T.map((t, ti) => {
      const on = this.tabOn(t.id);
      return `<div class="set-h co-h">${t.label}</div>
        ${Settings._item(`${t.label} 카테고리`, mv(`Tabs.moveTab.bind(Tabs,'${t.id}')`, ti === 0, ti === T.length - 1) + Settings._sw(on, `Tabs.toggleTab('${t.id}', ${!on})`), on ? `${ti === 0 ? '처음 보이는 화면 · ' : ''}아래 탭과 카드가 보입니다` : '탭과 카드가 모두 숨겨집니다(기록은 그대로)')}
        ${on ? (() => { const list = this.order().filter(x => this.tabOf(x) === t.id).map(x => this.CARDS.find(c => c.cls === x));
          return list.map((c, i) => Settings._item(c.name, mv(`Tabs.moveCard.bind(Tabs,'${c.cls}')`, i === 0, i === list.length - 1)
            + Settings._sw(!off.includes(c.cls), `Tabs.toggleCard('${c.cls}', ${off.includes(c.cls)});Settings._re('cats')`))).join(''); })() : ''}`;
    }).join('') + (this.hasOrder() || this.hasTabOrder() ? `<p class="co-note"><button type="button" class="co-reset" onclick="Tabs.resetOrder()">순서를 처음대로 돌리기</button></p>` : '');
  },
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
    this.applyOrder();
    // 화면 폭이 휴대폰 ↔ 넓은 화면으로 바뀌면(태블릿 돌리기 등) 그쪽 순서로 다시 놓는다
    try { matchMedia('(min-width:641px)').addEventListener('change', () => { this._paintBar(); this.applyOrder(); this.set(this._cur, true); }); } catch (e) {}
    // 매일 여는 앱의 기본 상태는 언제나 '오늘'이다. 마지막 탭을 복원하지 않는다.
    this.set(this._onTabs()[0]?.id || 'today', true);   // 맨 위 카테고리부터
  },

  _paintBar() {
    const bar = document.getElementById('tabbar');
    if (!bar) return;
    const j = this.JARVIS_TAB;
    bar.innerHTML = this._onTabs().map(t =>
      `<button class="tab-btn" data-t="${t.id}" onclick="Tabs.set('${t.id}')" aria-label="${t.label}">
        ${Icons.svg(t.icon, 'tab-ic')}<span class="tab-lb">${t.label}</span>
      </button>`).join('')
      + `<button class="tab-btn tab-jarvis" data-t="${j.id}" onclick="JARVIS.toggle()" aria-label="${j.label}">
          ${Icons.svg(j.icon, 'tab-ic')}<span id="tabJarvisBadge" class="tab-badge hidden">0</span>
          <span class="tab-lb">${j.label}</span>
        </button>`;
  },

  set(id, silent) {
    if (!this.DEF.some(t => t.id === id) || !this.tabOn(id)) id = (this._onTabs()[0] || this.DEF[0]).id;
    this._cur = id;
    document.body.dataset.tab = id;
    try { if (typeof JARVIS !== 'undefined' && JARVIS.isOpen) JARVIS.close(); } catch(e){}
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
      if (el) el.classList.toggle('card-off', off.includes(c.cls) || !this.tabOn(c.tab));
    });
  },

  toggleCard(cls, on) {
    let off = this.getOff();
    off = on ? off.filter(x => x !== cls) : (off.includes(cls) ? off : off.concat(cls));
    UserStore.set(this.OFF_KEY, JSON.stringify(off));
    if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleSave?.();
    this.applyOff();
    this._paintSettings();
    try { App._updateStatsBanner(); } catch (e) {}
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
    const ord = this.order();
    const byTab = this.DEF.map(t => ({ t, list: ord.filter(x => this.tabOf(x) === t.id).map(x => this.CARDS.find(c => c.cls === x)) }));
    b.innerHTML = byTab.map(({ t, list }) => `
      <div class="cardset-grp">
        <div class="cardset-hd">${Icons.svg(t.icon)} ${t.label}</div>
        ${list.map((c, i) => {
          const on = !off.includes(c.cls);
          return `<label class="cardset-row">
            <span class="cardset-nm">${c.name}</span>
            <span class="co-mv" onclick="event.preventDefault()"><button type="button" class="co-b" ${i === 0 ? 'disabled' : ''} onclick="Tabs.moveCard('${c.cls}',-1)" aria-label="위로">↑</button><button type="button" class="co-b" ${i === list.length - 1 ? 'disabled' : ''} onclick="Tabs.moveCard('${c.cls}',1)" aria-label="아래로">↓</button></span>
            <span class="ec-sw"><input type="checkbox" ${on ? 'checked' : ''}
              onchange="Tabs.toggleCard('${c.cls}', this.checked)"><span></span></span>
          </label>`;
        }).join('')}
      </div>`).join('');
  },
};
