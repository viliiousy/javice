// js/diet.js — 식단 / 칼로리 트래커

const Diet = {
  MEALS:  ['아침', '점심', '저녁', '간식'],
  EMOJIS: { 아침:'🌅', 점심:'🌞', 저녁:'🌙', 간식:'🍪' },

  _key()     { return `gl_diet_${new Date().toDateString()}`; },
  _setKey()  { return 'gl_diet_settings'; },

  getSettings() {
    return JSON.parse(localStorage.getItem(this._setKey()) || JSON.stringify(
      { calorieGoal:2200, proteinGoal:160, carbGoal:220, fatGoal:60 }
    ));
  },

  getData() {
    return JSON.parse(localStorage.getItem(this._key()) || JSON.stringify(
      { 아침:[], 점심:[], 저녁:[], 간식:[] }
    ));
  },

  saveData(d) { localStorage.setItem(this._key(), JSON.stringify(d)); },

  totals(data) {
    let cal=0, protein=0, carb=0, fat=0;
    Object.values(data).forEach(m => m.forEach(i => {
      cal += i.cal||0; protein += i.protein||0; carb += i.carb||0; fat += i.fat||0;
    }));
    return { cal, protein, carb, fat };
  },

  render() {
    const data = this.getData();
    const s    = this.getSettings();
    const t    = this.totals(data);
    const pct  = Math.min(100, Math.round(t.cal / s.calorieGoal * 100));
    const C    = 2 * Math.PI * 22;
    const col  = pct < 80 ? 'var(--accent)' : pct < 105 ? 'var(--yellow)' : 'var(--red)';

    document.getElementById('dietBadge').textContent = `${t.cal} / ${s.calorieGoal} kcal`;

    const mealsHTML = this.MEALS.map(meal => {
      const items   = data[meal] || [];
      const mealCal = items.reduce((s, i) => s + (i.cal||0), 0);
      return `<div class="meal-sec">
        <div class="meal-hd" onclick="Diet.showAdd('${meal}')">
          <span>${this.EMOJIS[meal]} ${meal}${mealCal ? ` <span style="color:var(--text3);font-weight:400">${mealCal} kcal</span>` : ''}</span>
          <span style="color:var(--accent-l);font-size:14px">+</span>
        </div>
        <div class="meal-items">
          ${items.map((item, idx) => `
            <div class="meal-food">
              <span>${esc(item.name)}</span>
              <span class="meal-food-cal">${item.cal} kcal
                <button class="btn-del-food" onclick="Diet.remove('${meal}',${idx})">✕</button>
              </span>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');

    document.getElementById('dietWrap').innerHTML = `
      <div class="diet-summary">
        <svg class="diet-ring" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="22" fill="none" stroke="var(--card)" stroke-width="4"/>
          <circle cx="24" cy="24" r="22" fill="none" stroke="${col}" stroke-width="4"
            stroke-dasharray="${(pct/100)*C} ${C}" stroke-linecap="round"
            transform="rotate(-90 24 24)" style="transition:stroke-dasharray 0.5s"/>
        </svg>
        <div class="diet-info">
          <div class="diet-cal-num">${t.cal.toLocaleString()}</div>
          <div class="diet-cal-sub">목표 ${s.calorieGoal.toLocaleString()} kcal · ${pct}% 달성</div>
        </div>
        <button onclick="Diet.showSettings()" title="목표 설정"
          style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:4px">⚙️</button>
      </div>
      <div class="diet-macros">
        <div class="macro"><div class="macro-lbl">단백질</div><div class="macro-val" style="color:var(--cyan)">${t.protein}g</div><div class="macro-goal">목표 ${s.proteinGoal}g</div></div>
        <div class="macro"><div class="macro-lbl">탄수화물</div><div class="macro-val" style="color:var(--yellow)">${t.carb}g</div><div class="macro-goal">목표 ${s.carbGoal}g</div></div>
        <div class="macro"><div class="macro-lbl">지방</div><div class="macro-val" style="color:var(--accent-l)">${t.fat}g</div><div class="macro-goal">목표 ${s.fatGoal}g</div></div>
      </div>
      ${mealsHTML}`;
  },

  showAdd(meal) {
    App.openModal(`${this.EMOJIS[meal]} ${meal} 추가`, `
      <div class="modal-row"><label class="modal-lbl">음식 이름 *</label>
        <input id="fName" type="text" placeholder="예: 닭가슴살 100g" class="inp"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">칼로리 (kcal)</label><input id="fCal" type="number" min="0" placeholder="0" class="inp inp-sm"></div>
        <div><label class="modal-lbl">단백질 (g)</label><input id="fProt" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
        <div><label class="modal-lbl">탄수화물 (g)</label><input id="fCarb" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
        <div><label class="modal-lbl">지방 (g)</label><input id="fFat" type="number" min="0" step="0.1" placeholder="0" class="inp inp-sm"></div>
      </div>
      <div class="modal-btns">
        <button onclick="Diet.saveFood('${meal}')" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(() => document.getElementById('fName')?.focus(), 50);
  },

  saveFood(meal) {
    const name = document.getElementById('fName').value.trim();
    if (!name) { App.showToast('음식 이름을 입력해주세요', 'error'); return; }
    const data = this.getData();
    data[meal].push({
      name,
      cal:     parseInt(document.getElementById('fCal').value)  || 0,
      protein: parseFloat(document.getElementById('fProt').value) || 0,
      carb:    parseFloat(document.getElementById('fCarb').value) || 0,
      fat:     parseFloat(document.getElementById('fFat').value)  || 0,
    });
    this.saveData(data);
    this.render();
    App.closeModal();
    App.showToast(`${name} 추가됨 ✓`, 'success');
  },

  remove(meal, idx) {
    const data = this.getData();
    data[meal].splice(idx, 1);
    this.saveData(data);
    this.render();
  },

  showSettings() {
    const s = this.getSettings();
    App.openModal('⚙️ 식단 목표 설정', `
      <div class="modal-row"><label class="modal-lbl">칼로리 목표 (kcal)</label><input id="sCalG" type="number" value="${s.calorieGoal}" class="inp"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">단백질 목표 (g)</label><input id="sProtG" type="number" value="${s.proteinGoal}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">탄수화물 목표 (g)</label><input id="sCarbG" type="number" value="${s.carbGoal}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">지방 목표 (g)</label><input id="sFatG" type="number" value="${s.fatGoal}" class="inp inp-sm"></div>
      </div>
      <div class="modal-btns">
        <button onclick="Diet.saveSettings()" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
  },

  saveSettings() {
    localStorage.setItem(this._setKey(), JSON.stringify({
      calorieGoal: parseInt(document.getElementById('sCalG').value)  || 2200,
      proteinGoal: parseInt(document.getElementById('sProtG').value) || 160,
      carbGoal:    parseInt(document.getElementById('sCarbG').value) || 220,
      fatGoal:     parseInt(document.getElementById('sFatG').value)  || 60,
    }));
    this.render();
    App.closeModal();
    App.showToast('목표 저장됨 ✓', 'success');
  },
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}