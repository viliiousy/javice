// js/habits.js — 습관 트래커

const Habits = {
  DEFAULTS: [
    { id:'h1', name:'기상 (목표 시간)',    emoji:'⏰' },
    { id:'h2', name:'물 2L 마시기',       emoji:'💧' },
    { id:'h3', name:'운동 완료',          emoji:'💪' },
    { id:'h4', name:'단백질 목표 달성',   emoji:'🥩' },
    { id:'h5', name:'독서 30분',          emoji:'📚' },
    { id:'h6', name:'스트레칭 / 폼롤링', emoji:'🧘' },
  ],

  getList() {
    return JSON.parse(localStorage.getItem('gl_habits_list') || JSON.stringify(this.DEFAULTS));
  },
  saveList(v) { localStorage.setItem('gl_habits_list', JSON.stringify(v)); },

  _dayKey(d = new Date()) { return `gl_habits_${d.toDateString()}`; },
  getChecked()   { return JSON.parse(localStorage.getItem(this._dayKey()) || '[]'); },
  setChecked(v)  { localStorage.setItem(this._dayKey(), JSON.stringify(v)); },

  streak(id) {
    let n = 0;
    const d = new Date();
    // 오늘 체크되어 있으면 오늘도 포함
    if (this.getChecked().includes(id)) n++;
    for (let i = 1; i <= 365; i++) {
      const prev = new Date(d); prev.setDate(d.getDate() - i);
      const k = JSON.parse(localStorage.getItem(this._dayKey(prev)) || '[]');
      if (!k.includes(id)) break;
      n++;
    }
    return n;
  },

  init() { this.render(); },

  render() {
    const list  = this.getList();
    const chk   = this.getChecked();
    const done  = list.filter(h => chk.includes(h.id)).length;
    const all   = list.length;

    document.getElementById('habitsWrap').innerHTML = list.map(h => {
      const isDone = chk.includes(h.id);
      const st     = isDone ? this.streak(h.id) : this.streak(h.id);
      return `<div class="habit-item${isDone ? ' done' : ''}" onclick="Habits.toggle('${h.id}')">
        <div class="habit-chk">${isDone ? '✓' : ''}</div>
        <span class="habit-emoji">${h.emoji}</span>
        <span class="habit-name">${esc(h.name)}</span>
        ${st > 0 ? `<span class="habit-streak">🔥${st}</span>` : ''}
      </div>`;
    }).join('');

    document.getElementById('habitsFooter').innerHTML =
      `오늘 <strong>${done} / ${all}</strong> 완료 ${done === all && all > 0 ? '🏆 퍼펙트!' : ''}`;
  },

  toggle(id) {
    const chk = this.getChecked();
    const i   = chk.indexOf(id);
    if (i === -1) chk.push(id); else chk.splice(i, 1);
    this.setChecked(chk);
    this.render();
  },

  showManageModal() {
    const list = this.getList();
    const rows = list.map((h, i) => `
      <div class="habit-manage-item">
        <input type="text" value="${h.emoji}" class="inp inp-sm" id="hEm${i}" style="width:44px;text-align:center">
        <input type="text" value="${esc(h.name)}" class="inp inp-sm" id="hNm${i}" style="flex:1">
        <button class="btn-danger" onclick="Habits._del('${h.id}')">삭제</button>
      </div>`).join('');

    App.openModal('⚙️ 습관 관리', `
      <div id="habitManageList">${rows}</div>
      <button onclick="Habits._add()" class="btn-sm" style="width:100%;padding:8px;margin-top:8px">+ 습관 추가</button>
      <div class="modal-btns" style="margin-top:10px">
        <button onclick="Habits._save()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },

  _add() {
    const list = this.getList();
    list.push({ id: 'h' + Date.now(), name: '새 습관', emoji: '⭐' });
    this.saveList(list);
    this.showManageModal();
  },

  _del(id) {
    this.saveList(this.getList().filter(h => h.id !== id));
    this.showManageModal();
  },

  _save() {
    const list = this.getList();
    list.forEach((h, i) => {
      h.emoji = (document.getElementById(`hEm${i}`)?.value.trim() || h.emoji);
      h.name  = (document.getElementById(`hNm${i}`)?.value.trim() || h.name);
    });
    this.saveList(list);
    this.render();
    App.closeModal();
    App.showToast('습관 저장됨 ✓', 'success');
  },
};
