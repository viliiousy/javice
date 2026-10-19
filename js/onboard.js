// js/onboard.js — 처음 쓰는 사람을 위한 설정 도우미
//
// 구글로 처음 가입한 사람에게 한 번 뜬다. 여섯 단계를 순서대로 보여 주고, 단계마다 건너뛸 수 있다.
//   1 기본 신체정보(목표 칼로리)  2 일정·할일·캘린더  3 습관·체크리스트·메모
//   4 식단  5 운동  6 경제·주식
// 기존 사용자도 볼 수 있다 — 첫 화면에서 '도우미 시작' 과 '알아서 할게요' 중 고른다.
// 끝내거나 건너뛰면 다시 뜨지 않는다. 프로필 메뉴 → '사용 도우미' 로 언제든 다시 연다.
const Onboard = {
  KEY: 'gl_onboard_v1',
  STEPS: [
    { id:'body',  ic:'user',     t:'기본 신체정보',          s:'목표 칼로리를 계산합니다' },
    { id:'ai',    ic:'sparkle',  t:'AI 비서',                s:'어떤 AI 로 답할지·사용량 표시' },
    { id:'plan',  ic:'calendar', t:'일정과 할일',            s:'캘린더·할일 쓰는 법' },
    { id:'habit', ic:'check',    t:'습관·체크리스트·메모',   s:'매일 할 일 정하기' },
    { id:'diet',  ic:'diet',     t:'식단 기록',              s:'먹은 것을 남기는 법' },
    { id:'fit',   ic:'dumbbell', t:'운동 기록',              s:'내 루틴 만들기' },
    { id:'econ',  ic:'trend',    t:'경제·주식',              s:'관심 종목 담기' },
  ],
  i: -1,           // -1 = 첫 화면
  d: {},           // 입력값

  // 이 계정에 쌓인 기록이 없으면 새 사용자로 본다.
  _isNew() {
    const keys = ['gl_habits_list','gl_diet_settings','gl_inbody_v1','gl_fitness_dayplan','gl_checklist_v2','gl_memos_v1'];
    return !keys.some(k => { const v = UserStore.get(k); return v && v !== '[]' && v !== '{}'; });
  },

  maybeStart() {
    if (UserStore.get(this.KEY)) return;
    // 새 사용자에게는 운동을 미리 정해 두지 않는다 (요일마다 '계획 없음').
    if (this._isNew()) { UserStore.set('gl_fit_blank', '1'); this._new = true; }
    this.open();
  },

  open(fromMenu) {
    document.getElementById('profileMenu')?.classList.add('hidden');
    this.i = fromMenu ? 0 : -1;
    this.d = {};
    let el = document.getElementById('obWrap');
    if (!el) {
      el = document.createElement('div');
      el.id = 'obWrap'; el.className = 'ob-wrap';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      document.body.appendChild(el);
    }
    el.hidden = false;
    document.body.classList.add('ob-open');
    this.paint();
  },

  close(done) {
    UserStore.set(this.KEY, done ? 'done' : 'skipped');
    window.FirebaseSync?.scheduleSave?.();
    const el = document.getElementById('obWrap'); if (el) el.hidden = true;
    document.body.classList.remove('ob-open');
    try { App._updateStatsBanner?.(); TopStrip?.render?.(); } catch {}
  },

  next() { this.i++; if (this.i >= this.STEPS.length) return this.finish(); this.paint(); },
  back() { this.i = Math.max(-1, this.i - 1); this.paint(); },
  skip() { this.next(); },
  finish() {
    const el = document.getElementById('obWrap');
    el.innerHTML = this._shell(`
      <div class="ob-hero">${Icons.big('sparkle')}<h2>준비가 끝났습니다</h2>
      <p>오른쪽 아래 <b>AI</b> 를 누르면 말로도 기록할 수 있어요.<br>“점심에 김치찌개 먹었어”, “내일 3시 치과 일정 추가해 줘” 처럼요.</p>
      <p class="ob-sub">이 도우미는 프로필 메뉴 → <b>사용 도우미</b> 에서 다시 볼 수 있습니다.</p></div>`,
      `<button class="ob-btn pri" onclick="Onboard.close(true)">시작하기</button>`, false);
  },

  // ── 그리기 ────────────────────────────
  _shell(body, foot, showHead = true) {
    const n = this.STEPS.length, st = this.STEPS[this.i];
    const head = showHead && st ? `
      <div class="ob-top">
        <button class="ob-x" onclick="Onboard.close(false)" aria-label="도우미 닫기">${Icons.svg('close')}</button>
        <div class="ob-dots">${this.STEPS.map((_, k) => `<span class="${k < this.i ? 'done' : k === this.i ? 'on' : ''}"></span>`).join('')}</div>
        <span class="ob-cnt">${this.i + 1}/${n}</span>
      </div>
      <div class="ob-hd"><span class="ob-ic">${Icons.svg(st.ic)}</span><div><h2>${st.t}</h2><p>${st.s}</p></div></div>` : '';
    return `<div class="ob-card">${head}<div class="ob-body">${body}</div><div class="ob-foot">${foot}</div></div>`;
  },
  _nav(nextLbl = '다음') {
    return `<button class="ob-btn" onclick="Onboard.skip()">이 단계 건너뛰기</button>
      <button class="ob-btn pri" onclick="Onboard._submit()">${nextLbl}</button>`;
  },

  paint() {
    const el = document.getElementById('obWrap'); if (!el) return;
    if (this.i < 0) {
      el.innerHTML = this._shell(`
        <div class="ob-hero">
          <div class="ob-logo">${Icons.svg('zap')}</div>
          <h2>Bashy 에 오신 것을 환영합니다</h2>
          <p>일정·할일·습관·식단·운동·경제를 한 화면에서 챙기는 앱입니다.<br>처음이라면 1분짜리 설정 도우미로 시작해 보세요.</p>
          <ol class="ob-list">${this.STEPS.map((s, k) => `<li>${Icons.svg(s.ic)}<span>${k + 1}. ${s.t}</span></li>`).join('')}</ol>
          <p class="ob-sub">단계마다 건너뛸 수 있습니다. 이미 쓰던 분은 ‘알아서 할게요’ 를 누르세요.</p>
        </div>`,
        `<button class="ob-btn" onclick="Onboard.close(false)">알아서 할게요</button>
         <button class="ob-btn pri" onclick="Onboard.next()">도우미 시작</button>`, false);
      return;
    }
    el.innerHTML = this._shell(this['_' + this.STEPS[this.i].id](), this._navFor());
    el.querySelector('.ob-body')?.scrollTo(0, 0);
    if (this.STEPS[this.i].id === 'body') this._calc();
  },
  _navFor() {
    const id = this.STEPS[this.i].id;
    if (id === 'body') return this._nav('목표로 설정하고 다음');
    if (id === 'econ') return this._nav('완료');
    return this._nav();
  },
  _submit() {
    const id = this.STEPS[this.i].id;
    try {
      if (id === 'body' && !this._saveBody()) return;
      if (id === 'habit') this._saveHabits();
      if (id === 'fit') this._saveFit();
      if (id === 'ai') { JARVIS.saveSetup(); AIUsage.saveTrack(); }
    } catch (e) { console.warn('onboard', e); }
    this.next();
  },

  // ── 1. 기본 신체정보 ────────────────────
  _body() {
    const la = (typeof InBody !== 'undefined' && InBody.latest()) || {};
    const v = (k, d = '') => this.d[k] ?? la[k] ?? d;
    return `
      <div class="ob-row2">
        <div class="ob-seg" id="obSex">
          <button data-v="m" class="${(this.d.sex || 'm') === 'm' ? 'on' : ''}" onclick="Onboard._seg(this)">남성</button>
          <button data-v="f" class="${this.d.sex === 'f' ? 'on' : ''}" onclick="Onboard._seg(this)">여성</button>
        </div>
      </div>
      <div class="ob-grid">
        <label><span>나이</span><input id="obAge" class="inp" type="number" inputmode="numeric" placeholder="30" value="${this.d.age || ''}" oninput="Onboard._calc()"></label>
        <label><span>키 (cm)</span><input id="obHt" class="inp" type="number" inputmode="decimal" placeholder="175" value="${this.d.ht || ''}" oninput="Onboard._calc()"></label>
        <label><span>몸무게 (kg)</span><input id="obWt" class="inp" type="number" inputmode="decimal" placeholder="70" value="${v('wt')}" oninput="Onboard._calc()"></label>
        <label><span>체지방률 (%) <i>선택</i></span><input id="obBf" class="inp" type="number" inputmode="decimal" placeholder="—" value="${v('bf')}" oninput="Onboard._calc()"></label>
        <label><span>골격근량 (kg) <i>선택</i></span><input id="obMs" class="inp" type="number" inputmode="decimal" placeholder="—" value="${v('ms')}"></label>
        <label><span>활동량</span><select id="obAct" class="inp" onchange="Onboard._calc()">
          <option value="1.2">거의 앉아서 지냄</option>
          <option value="1.375" selected>주 1~3회 운동</option>
          <option value="1.55">주 3~5회 운동</option>
          <option value="1.725">거의 매일 운동</option>
        </select></label>
      </div>
      <div class="ob-seg ob-goal" id="obGoal">
        <button data-v="cut" onclick="Onboard._seg(this)">체중 감량</button>
        <button data-v="keep" class="on" onclick="Onboard._seg(this)">유지</button>
        <button data-v="bulk" onclick="Onboard._seg(this)">근육 증량</button>
      </div>
      <div id="obRes" class="ob-res"></div>
      <button class="ob-link" onclick="Onboard._inbodyPhoto()">${Icons.svg('camera')} 인바디 결과지 사진으로 채우기</button>
      <input id="obIbFile" type="file" accept="image/*" hidden onchange="Onboard._onIbPhoto(this)">`;
  },
  _seg(b) {
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    this._calc();
  },
  _segVal(id) { return document.querySelector(`#${id} .on`)?.dataset.v; },
  _num(id) { const n = parseFloat(document.getElementById(id)?.value); return isFinite(n) && n > 0 ? n : null; },
  // 기초대사량: 체지방률을 알면 Katch-McArdle(제지방량 기준), 모르면 Mifflin-St Jeor.
  _compute() {
    const sex = this._segVal('obSex') || 'm', age = this._num('obAge'), ht = this._num('obHt'), wt = this._num('obWt'), bf = this._num('obBf');
    const act = parseFloat(document.getElementById('obAct')?.value || '1.375'), goal = this._segVal('obGoal') || 'keep';
    if (!wt || (!bf && (!age || !ht))) return null;
    const bmr = bf ? 370 + 21.6 * wt * (1 - bf / 100) : 10 * wt + 6.25 * ht - 5 * age + (sex === 'm' ? 5 : -161);
    const tdee = bmr * act;
    const cal = Math.round((tdee + (goal === 'cut' ? -500 : goal === 'bulk' ? 300 : 0)) / 10) * 10;
    const protein = Math.round(wt * (goal === 'keep' ? 1.6 : 2.0));
    const fat = Math.round(cal * 0.25 / 9);
    const carb = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), cal, protein, fat, carb, goal, wt, bf, method: bf ? '체지방률 기준' : '키·나이 기준' };
  },
  _calc() {
    const box = document.getElementById('obRes'); if (!box) return;
    const r = this._compute();
    if (!r) { box.innerHTML = `<p class="ob-hint">몸무게와 키·나이(또는 체지방률)를 넣으면 목표 칼로리가 계산됩니다.</p>`; return; }
    box.innerHTML = `
      <div class="ob-kcal"><span>하루 목표</span><b>${r.cal.toLocaleString()}</b><span>kcal</span></div>
      <div class="ob-macros"><span>단백질 <b>${r.protein}g</b></span><span>탄수 <b>${r.carb}g</b></span><span>지방 <b>${r.fat}g</b></span></div>
      <p class="ob-hint">기초대사량 ${r.bmr.toLocaleString()} · 활동 포함 ${r.tdee.toLocaleString()} kcal (${r.method}). 나중에 식단 카드 ⚙ 에서 바꿀 수 있어요.</p>`;
  },
  _saveBody() {
    const r = this._compute();
    if (!r) { App.showToast('몸무게와 키·나이를 넣거나 이 단계를 건너뛰어 주세요', 'error'); return false; }
    this.d.sex = this._segVal('obSex'); this.d.age = this._num('obAge'); this.d.ht = this._num('obHt');
    UserStore.set('gl_profile', JSON.stringify({ sex: this.d.sex, age: this.d.age, ht: this.d.ht, act: document.getElementById('obAct')?.value, goal: r.goal }));
    let s = {}; try { s = Diet.getSettings(); } catch {}
    Object.assign(s, { calorieGoal: r.cal, proteinGoal: r.protein, carbGoal: r.carb, fatGoal: r.fat,
      restCalGoal: r.cal, restProteinGoal: r.protein, restCarbGoal: r.carb, restFatGoal: r.fat });
    UserStore.set('gl_diet_settings', JSON.stringify(s));
    if (typeof InBody !== 'undefined') {
      const recs = InBody.getRecords(), dt = InBody._todayStr();
      const rec = Object.assign(recs.find(x => x.dt === dt) || { dt }, { wt: r.wt, bmr: r.bmr });
      if (r.bf) rec.bf = r.bf;
      const ms = this._num('obMs'); if (ms) rec.ms = ms;
      if (this.d.ht) rec.bmi = Math.round(r.wt / Math.pow(this.d.ht / 100, 2) * 10) / 10;
      InBody.saveRecords(recs.filter(x => x.dt !== dt).concat(rec));
      try { InBody.render(); } catch {}
    }
    window.FirebaseSync?.scheduleSave?.();
    try { Diet.render(App?.S?.selDate || new Date()); } catch {}
    return true;
  },
  _inbodyPhoto() {
    if (typeof JARVIS === 'undefined' || !JARVIS._getKey()) { App.showToast('사진 읽기는 AI 키가 있어야 합니다. 숫자를 직접 넣어 주세요', ''); return; }
    document.getElementById('obIbFile')?.click();
  },
  _onIbPhoto(input) {
    const f = input.files?.[0]; if (!f) return; input.value = '';
    const rd = new FileReader();
    rd.onload = async e => {
      App.showToast('결과지를 읽는 중…', '');
      try {
        const data = await JARVIS.chat({ max_tokens: 400, messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: String(e.target.result) } },
          { type: 'text', text: '인바디 결과지에서 숫자만 JSON 으로: {"wt":체중kg,"ms":골격근량kg,"bf":체지방률%,"bmr":기초대사량kcal,"ht":키cm,"age":나이}. 없는 값은 null. JSON 만 출력.' },
        ] }] }, 'vision');
        const m = (data.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
        const j = m ? JSON.parse(m[0]) : null;
        if (!j) throw new Error('읽지 못함');
        const put = (id, v) => { if (v != null && document.getElementById(id)) document.getElementById(id).value = v; };
        put('obWt', j.wt); put('obMs', j.ms); put('obBf', j.bf); put('obHt', j.ht); put('obAge', j.age);
        this._calc(); App.showToast('결과지 숫자를 채웠습니다. 맞는지 확인해 주세요', 'success');
      } catch { App.showToast('결과지를 읽지 못했습니다. 숫자를 직접 넣어 주세요', 'error'); }
    };
    rd.readAsDataURL(f);
  },

  // ── AI 비서 ────────────────────────────
  _ai() {
    return `<p class="ob-p">말로 기록하기, 사진으로 식단·인바디 읽기는 AI 가 합니다. 기본으로 쓸 AI 를 고르고 키를 넣어 주세요. 키가 없으면 이 단계를 건너뛰고 나중에 AI 창의 열쇠 단추에서 넣어도 됩니다.</p>
      ${JARVIS.setupHtml()}
      <div class="ob-sub2">AI 사용량 표시</div>
      <p class="ob-p">유료 구독 중인 AI 의 남은 사용량을 맨 위에 고리로 보여 줍니다(PC 크롬의 Bashy 사용량 확장이 필요합니다). 표시할 것을 고르세요.</p>
      ${AIUsage.trackHtml()}`;
  },

  // ── 2. 일정과 할일 ──────────────────────
  _plan() {
    return this._tips([
      ['calendar', '구글 캘린더와 자동 연결', '로그인한 구글 계정의 캘린더 일정이 그대로 보이고, 여기서 만든 일정도 구글 캘린더에 들어갑니다.'],
      ['plus', '날짜를 눌러 추가', '달력에서 날짜를 누르면 그날 일정·할일을 바로 추가할 수 있어요. 길게 누르면 메뉴가 열립니다.'],
      ['tasks', '할일은 구글 할일(Tasks)과 동기화', '개인·업무 목록으로 나뉘고, 기한이 지난 할일은 ‘지난’ 단추로 모아 봅니다.'],
      ['eyeclosed', '잠깐 치워 두기', '감은 눈 단추를 누르면 할일이 목록에서 숨겨지고, 뜬 눈을 누르면 다시 보입니다.'],
      ['sparkle', 'AI 에게 말로', '“내일 오후 3시 치과 일정 잡아 줘” 라고 말하면 일정이 들어갑니다.'],
    ]);
  },
  // ── 3. 습관·체크리스트·메모 ─────────────
  HABIT_PRESETS: [
    ['물 2L 마시기','etc'], ['운동하기','ex'], ['독서 30분','study'], ['영양제 먹기','med'],
    ['스트레칭','ex'], ['일기 쓰기','etc'], ['12시 전에 자기','etc'], ['영어 공부','study'],
  ],
  _habit() {
    const cur = (typeof Habits !== 'undefined' ? Habits.getList().filter(h => !h.deletedFrom).map(h => h.name) : []);
    return `<p class="ob-p">매일 체크할 습관을 골라 보세요. 나중에 얼마든지 바꿀 수 있습니다.</p>
      <div class="ob-chips" id="obHabits">${this.HABIT_PRESETS.map(([n, c]) =>
        `<button class="ob-chip${cur.includes(n) ? ' on' : ''}" data-n="${n}" data-c="${c}" onclick="this.classList.toggle('on')">${n}</button>`).join('')}</div>
      ${this._tips([
        ['check', '오늘의 습관', '네모를 누르면 완료. 줄을 길게 누르면 끌어서 순서를 바꾸고, 왼쪽으로 밀면 삭제 단추가 나옵니다.'],
        ['checkbox', '체크리스트', '장보기·준비물처럼 한 번 쓰고 마는 목록입니다.'],
        ['memo', '메모', '떠오른 생각을 적어 둡니다. AI 에게 “메모해 줘” 라고 해도 됩니다.'],
      ])}`;
  },
  _saveHabits() {
    const picked = [...document.querySelectorAll('#obHabits .ob-chip.on')].map(b => ({ n: b.dataset.n, c: b.dataset.c }));
    if (!picked.length || typeof Habits === 'undefined') return;
    // 새 사용자는 기본 예시 습관 대신 고른 것만 남긴다. 기존 사용자는 없는 것만 더한다.
    let list = this._new ? [] : Habits.getList();
    const today = Habits._dateStr(new Date());
    picked.forEach((p, k) => {
      if (list.some(h => h.name === p.n && !h.deletedFrom)) return;
      list.push({ id: 'h' + Date.now() + k, name: p.n, emoji: '', cat: p.c, days: [0,1,2,3,4,5,6], createdAt: today });
    });
    Habits.saveList(list);
    try { Habits.render(App?.S?.selDate || new Date()); } catch {}
  },
  // ── 4. 식단 ────────────────────────────
  _diet() {
    return this._tips([
      ['camera', '사진 한 장으로', '음식 사진을 찍으면 AI 가 메뉴와 칼로리를 추정해 끼니에 넣어 줍니다.'],
      ['list', '검색·바코드', '식약처 데이터에서 음식을 찾거나, 포장 식품은 바코드를 찍어 넣습니다.'],
      ['sparkle', '말로 기록', '“점심에 김치찌개랑 공깃밥 먹었어” 라고 하면 칼로리까지 계산해 넣습니다.'],
      ['chart', '남은 칼로리', '위쪽 요약 줄에 오늘 남은 칼로리가 표시됩니다. 목표는 1단계에서 정한 값이에요.'],
    ]);
  },
  // ── 5. 운동 ────────────────────────────
  _fit() {
    return `<p class="ob-p">운동은 미리 정해 두지 않았습니다. 어떻게 시작할지 골라 주세요.</p>
      <div class="ob-opts" id="obFit">
        <button class="ob-opt on" data-v="own" onclick="Onboard._opt(this)"><b>내 루틴 직접 만들기</b><span>660여 개 종목에서 골라 요일별로 배정합니다</span></button>
        <button class="ob-opt" data-v="home" onclick="Onboard._opt(this)"><b>홈트 3분할 플랜 쓰기</b><span>월 푸시 · 수 풀 · 금 하체, 사이사이 유산소</span></button>
        <button class="ob-opt" data-v="later" onclick="Onboard._opt(this)"><b>그날그날 기록만</b><span>계획 없이 한 운동만 ‘+ 운동 추가’ 로 남깁니다</span></button>
      </div>
      ${this._tips([
        ['dumbbell', '체크로 기록', '오늘 운동 목록에서 한 종목을 누르면 완료로 표시됩니다.'],
        ['zap', '자세 보기', '종목 옆 i 를 누르면 자세 그림과 요령, ▶ 는 자세 영상을 찾아 줍니다.'],
      ])}`;
  },
  _opt(b) { b.parentElement.querySelectorAll('.ob-opt').forEach(x => x.classList.toggle('on', x === b)); },
  _saveFit() {
    const v = document.querySelector('#obFit .ob-opt.on')?.dataset.v || 'own';
    if (typeof Fitness === 'undefined') return;
    if (v === 'home') {
      UserStore.set('gl_fit_blank', '0');
      Fitness.saveDayPlan({});
    } else if (v === 'own') {
      this._afterFinish = () => { Tabs?.set?.('body'); setTimeout(() => Fitness.showRoutineEdit(), 300); };
    }
    try { Fitness.render(App?.S?.selDate || new Date()); } catch {}
  },
  // ── 6. 경제·주식 ───────────────────────
  _econ() {
    return `<p class="ob-p">관심 있는 종목·지수를 담아 두면 경제 탭과 위쪽 줄에서 시세를 볼 수 있습니다. 한글로 검색해도 해외 종목이 나옵니다.</p>
      <input class="inp ec-search" placeholder="검색 — 삼성전자, 테슬라, 애플, 금, 환율…" oninput="Econ.search(this.value,'O')">
      <div id="obERes" class="ob-eres"></div>
      ${this._tips([
        ['trend', '즐겨찾기 알림', '담은 종목이 크게 움직이면 알림으로 알려 줍니다.'],
        ['camera', '보유 종목은 캡처로', '증권사 앱 보유 화면을 캡처해 올리면 종목·수량·평단을 읽어 옵니다.'],
      ])}`;
  },

  _tips(rows) {
    return `<div class="ob-tips">${rows.map(([ic, t, s]) => `<div class="ob-tip"><span class="ob-tic">${Icons.svg(ic)}</span><div><b>${t}</b><p>${s}</p></div></div>`).join('')}</div>`;
  },
};

// 완료 후 이어서 할 일이 있으면 (예: 루틴 만들기 창) 닫힌 뒤 연다.
(() => {
  const close = Onboard.close.bind(Onboard);
  Onboard.close = function (done) {
    close(done);
    const f = this._afterFinish; this._afterFinish = null;
    if (done && f) setTimeout(f, 200);
  };
})();
