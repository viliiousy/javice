// js/tabs.js — 모바일 하단 탭
//
// 카드가 열 개가 되면서 모바일은 "한 줄로 열 개를 쌓은 화면"이 됐다.
// 아래 서너 개는 스크롤 끝에 있어서 사실상 안 보인다. 그래서 폭이 좁을 때만
// 카드를 네 묶음으로 나눈다. 묶음 기준은 "같은 순간에 함께 보는가"다 —
// 식단·운동·인바디는 몸 관리 한 세션에 같이 열리고, 시세는 돈 볼 때 혼자 열린다.
//
// PC(901px 이상)에서는 탭바가 사라지고 지금처럼 카드 전부가 3열로 깔린다.
// 숨기는 건 CSS 가 하고, 카드는 DOM 에 그대로 남는다 —
// 각 모듈의 render() 를 하나도 건드리지 않기 위해서다.

const Tabs = {
  DEF: [
    { id:'today', label:'오늘', icon:'☀️' },
    { id:'plan',  label:'계획', icon:'🗓️' },
    { id:'body',  label:'몸',   icon:'💪' },
    { id:'money', label:'자산', icon:'📈' },
  ],
  MAP: {
    'card-tasks':'today', 'card-checklist':'today', 'card-habits':'today', 'card-dev':'today',
    'card-calendar':'plan', 'card-memo':'plan',
    'card-diet':'body', 'card-fitness':'body', 'card-inbody':'body',
    'card-econ':'money',
  },

  _cur: 'today',
  get current(){ return this._cur; },
  tabOf(cardClass){ return this.MAP[cardClass] || 'today'; },

  init() {
    document.querySelectorAll('.dashboard > .card').forEach(el => {
      const cls = [...el.classList].find(c => this.MAP[c]);
      if (cls) el.dataset.tab = this.MAP[cls];
    });
    this._paintBar();
    // 매일 여는 앱의 기본 상태는 언제나 '오늘'이다. 마지막 탭을 복원하지 않는다.
    this.set('today', true);
  },

  _paintBar() {
    const bar = document.getElementById('tabbar');
    if (!bar) return;
    bar.innerHTML = this.DEF.map(t =>
      `<button class="tab-btn" data-t="${t.id}" onclick="Tabs.set('${t.id}')" aria-label="${t.label}">
        <span class="tab-ic">${t.icon}</span><span class="tab-lb">${t.label}</span>
      </button>`).join('');
  },

  set(id, silent) {
    if (!this.DEF.some(t => t.id === id)) id = 'today';
    this._cur = id;
    document.body.dataset.tab = id;
    document.querySelectorAll('#tabbar .tab-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.t === id));
    if (!silent) window.scrollTo({ top:0, behavior:'smooth' });
  },
};
