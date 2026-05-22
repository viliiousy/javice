// js/diet.js — 식단 / 칼로리 트래커 (AI 사진 인식 포함)

const Diet = {
  MEALS:  ['아침', '점심', '저녁', '간식'],
  EMOJIS: { 아침:'🌅', 점심:'🌞', 저녁:'🌙', 간식:'🍪' },

  _key()    { return `gl_diet_${new Date().toDateString()}`; },
  _setKey() { return 'gl_diet_settings'; },

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
        <div style="display:flex;gap:4px">
          <button onclick="Diet.showPhotoAnalysis()" title="📷 사진으로 음식 분석"
            style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);border-radius:8px;color:var(--cyan);cursor:pointer;font-size:18px;padding:6px 8px">📷</button>
          <button onclick="Diet.showSettings()" title="목표 설정"
            style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:4px">⚙️</button>
        </div>
      </div>
      <div class="diet-macros">
        <div class="macro"><div class="macro-lbl">단백질</div><div class="macro-val" style="color:var(--cyan)">${t.protein}g</div><div class="macro-goal">목표 ${s.proteinGoal}g</div></div>
        <div class="macro"><div class="macro-lbl">탄수화물</div><div class="macro-val" style="color:var(--yellow)">${t.carb}g</div><div class="macro-goal">목표 ${s.carbGoal}g</div></div>
        <div class="macro"><div class="macro-lbl">지방</div><div class="macro-val" style="color:var(--accent-l)">${t.fat}g</div><div class="macro-goal">목표 ${s.fatGoal}g</div></div>
      </div>
      ${mealsHTML}`;
  },

  // ── 📷 AI 사진 분석 ──────────────────
  showPhotoAnalysis() {
    const key = localStorage.getItem('gl_ai_key');
    if (!key) {
      App.showToast('JARVIS API 키를 먼저 설정해주세요 (⚡ → 🔑)', 'error');
      return;
    }
    App.openModal('📷 음식 사진 AI 분석', `
      <p style="color:var(--text2);font-size:13px;margin-bottom:14px">
        음식 사진을 업로드하면 AI가 음식을 인식하고 칼로리를 자동으로 기록합니다.
      </p>
      <div style="margin-bottom:12px">
        <label class="modal-lbl">식사 구분</label>
        <select id="photoMeal" class="inp inp-sm">
          <option value="아침">🌅 아침</option>
          <option value="점심">🌞 점심</option>
          <option value="저녁" selected>🌙 저녁</option>
          <option value="간식">🍪 간식</option>
        </select>
      </div>
      <div id="photoDropZone" class="photo-drop-zone" onclick="document.getElementById('photoFileInput').click()">
        <div id="photoPreviewWrap">
          <div style="font-size:48px;margin-bottom:8px">📷</div>
          <p style="color:var(--text2);font-size:13px">클릭하거나 사진을 끌어다 놓으세요</p>
          <p style="color:var(--text3);font-size:11px">JPG, PNG, HEIC 지원</p>
        </div>
        <input id="photoFileInput" type="file" accept="image/*" capture="environment" style="display:none"
          onchange="Diet._onPhotoSelected(this)">
      </div>
      <div id="photoResult" style="display:none;margin-top:12px"></div>
      <div class="modal-btns" style="margin-top:12px">
        <button id="btnAnalyzePhoto" onclick="Diet._analyzePhoto()" class="btn-sm accent" disabled>AI 분석하기</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);

    // 드래그&드롭
    setTimeout(() => {
      const zone = document.getElementById('photoDropZone');
      if (!zone) return;
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; });
      zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) Diet._loadImageFile(file);
      });
    }, 100);
  },

  _photoBase64: null,

  _onPhotoSelected(input) {
    const file = input.files[0];
    if (!file) return;
    this._loadImageFile(file);
  },

  _loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      this._photoBase64 = e.target.result.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      document.getElementById('photoPreviewWrap').innerHTML = `
        <img src="data:${mimeType};base64,${this._photoBase64}"
          style="max-width:100%;max-height:180px;border-radius:8px;object-fit:contain">`;
      const btn = document.getElementById('btnAnalyzePhoto');
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    };
    reader.readAsDataURL(file);
  },

  async _analyzePhoto() {
    if (!this._photoBase64) return;
    const btn = document.getElementById('btnAnalyzePhoto');
    if (btn) { btn.disabled = true; btn.textContent = '분석 중...'; }

    const key  = localStorage.getItem('gl_ai_key');
    const meal = document.getElementById('photoMeal')?.value || '저녁';

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${this._photoBase64}` },
              },
              {
                type: 'text',
                text: `이 음식 사진을 분석해서 반드시 JSON만 출력해줘. 다른 텍스트 없이:
{
  "foods": [
    {"name": "음식이름", "amount": "양(g 또는 개수)", "cal": 숫자, "protein": 숫자, "carb": 숫자, "fat": 숫자},
    ...
  ],
  "total_cal": 숫자,
  "comment": "한줄 코멘트"
}
칼로리는 한국 음식 기준으로 최대한 정확하게 추정해줘.`,
              },
            ],
          }],
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';

      let parsed;
      try {
        const m = text.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      } catch { parsed = null; }

      if (!parsed || !parsed.foods) throw new Error('분석 결과를 파싱할 수 없습니다');

      // 결과 표시
      const resultHTML = `
        <div style="background:var(--card2);border-radius:10px;padding:12px">
          <p style="font-size:12px;color:var(--text2);margin-bottom:8px">🤖 AI 분석 결과 · 총 ${parsed.total_cal}kcal 추정</p>
          ${parsed.foods.map(f => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:13px">${esc(f.name)} <span style="color:var(--text3);font-size:11px">${esc(f.amount)}</span></span>
              <span style="font-size:12px;color:var(--text2)">${f.cal}kcal</span>
            </div>`).join('')}
          ${parsed.comment ? `<p style="font-size:11px;color:var(--accent-l);margin-top:8px">💬 ${esc(parsed.comment)}</p>` : ''}
        </div>
        <button onclick="Diet._savePhotoFoods(${JSON.stringify(parsed.foods).replace(/"/g,'&quot;')}, '${meal}')"
          class="btn-sm accent" style="width:100%;padding:10px;margin-top:10px;font-size:14px">
          ✅ ${meal}에 모두 추가하기
        </button>`;

      const resultEl = document.getElementById('photoResult');
      if (resultEl) { resultEl.style.display = 'block'; resultEl.innerHTML = resultHTML; }
      if (btn) { btn.textContent = '다시 분석'; btn.disabled = false; }

    } catch (err) {
      App.showToast('분석 실패: ' + err.message, 'error');
      if (btn) { btn.textContent = 'AI 분석하기'; btn.disabled = false; }
    }
  },

  _savePhotoFoods(foods, meal) {
    const data = this.getData();
    if (!data[meal]) data[meal] = [];
    foods.forEach(f => {
      data[meal].push({
        name:    f.name + (f.amount ? ` (${f.amount})` : ''),
        cal:     f.cal     || 0,
        protein: f.protein || 0,
        carb:    f.carb    || 0,
        fat:     f.fat     || 0,
      });
    });
    this.saveData(data);
    this.render();
    App.closeModal();
    App.showToast(`📷 ${meal}에 ${foods.length}개 음식 추가됨 ✓`, 'success');
    this._photoBase64 = null;
  },

  // ── 수동 추가 ─────────────────────────
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
