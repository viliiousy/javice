// js/onboard.js — 처음 쓰는 사람을 위한 설정 도우미
//
// 구글로 처음 가입한 사람에게 한 번 뜬다. 여섯 단계를 순서대로 보여 주고, 단계마다 건너뛸 수 있다.
//   1 기본 신체정보(목표 칼로리)  2 일정·할일·캘린더  3 습관·체크리스트·메모
//   4 식단  5 운동  6 경제·주식
// 기존 사용자도 볼 수 있다 — 첫 화면에서 '도우미 시작' 과 '알아서 할게요' 중 고른다.
// 끝내거나 건너뛰면 다시 뜨지 않는다. 설정 › 도움말 › '사용 도우미 다시 보기' 로 언제든 다시 연다.
//
// 기능 안내(GUIDE): 앱의 모든 기능을 갈래별로 — 무엇을 할 수 있는지와 어디서 하는지(메뉴 경로).
// 설정에서 열면 기능 안내 목록부터 보이고, 거기서 설정 도우미(위 단계)도 다시 시작할 수 있다.
// 기능이 늘거나 메뉴 이름이 바뀌면 GUIDE 의 줄도 같이 고친다.
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

  // fromMenu: 설정 › 도움말 에서 열 때 — 기능 안내 목록부터 보인다
  open(fromMenu) {
    document.getElementById('profileMenu')?.classList.add('hidden');
    this.i = -1;
    this.gi = fromMenu ? -1 : null;
    this.gq = '';
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
    // 이미 끝낸 사람이 기능 안내만 보고 닫아도 '건너뜀' 으로 바뀌지 않게
    UserStore.set(this.KEY, done || UserStore.get(this.KEY) === 'done' ? 'done' : 'skipped');
    window.FirebaseSync?.scheduleSave?.();
    const el = document.getElementById('obWrap'); if (el) el.hidden = true;
    document.body.classList.remove('ob-open');
    try { App._updateStatsBanner?.(); TopStrip?.render?.(); } catch {}
  },

  next() { this.gi = null; this.i++; if (this.i >= this.STEPS.length) return this.finish(); this.paint(); },
  // 기능 안내에서 설정 도우미로
  startSetup() { this.gi = null; this.i = 0; this.d = {}; this.paint(); },
  back() { this.i = Math.max(-1, this.i - 1); this.paint(); },
  skip() { this.next(); },
  finish() {
    const el = document.getElementById('obWrap');
    el.innerHTML = this._shell(`
      <div class="ob-hero">${Icons.big('sparkle')}<h2>준비가 끝났습니다</h2>
      <p>오른쪽 아래 <b>AI</b> 를 누르면 말로도 기록할 수 있어요.<br>“점심에 김치찌개 먹었어”, “내일 3시 치과 일정 추가해 줘” 처럼요.</p>
      <p class="ob-sub">모든 기능과 메뉴 위치는 설정 › 도움말 › <b>사용 도우미 다시 보기</b> 에서 볼 수 있습니다.</p></div>`,
      `<button class="ob-btn" onclick="Onboard.guide(-1)">기능 안내 보기</button>
       <button class="ob-btn pri" onclick="Onboard.close(true)">시작하기</button>`, false);
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
    if (this.gi != null) return this._paintGuide(el);
    if (this.i < 0) {
      el.innerHTML = this._shell(`
        <div class="ob-hero">
          <div class="ob-logo">${Icons.svg('zap')}</div>
          <h2>Bashy 에 오신 것을 환영합니다</h2>
          <p>일정·할일·습관·식단·운동·경제를 한 화면에서 챙기는 앱입니다.<br>처음이라면 1분짜리 설정 도우미로 시작해 보세요.</p>
          <ol class="ob-list">${this.STEPS.map((s, k) => `<li>${Icons.svg(s.ic)}<span>${k + 1}. ${s.t}</span></li>`).join('')}</ol>
          <p class="ob-sub">단계마다 건너뛸 수 있습니다. 이미 쓰던 분은 ‘알아서 할게요’ 를 누르세요.</p>
          <button class="ob-link" onclick="Onboard.guide(-1)">${Icons.svg('book')} 모든 기능 한눈에 보기</button>
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
    // 아이폰 앱: 애플 건강부터 — 키·몸무게·체지방률·성별·나이를 채우고, 앞으로 인바디 측정도 자동으로 들어온다
    const hk = typeof InBody !== 'undefined' && InBody.healthAvail();
    const hkOn = hk && InBody.healthOn();
    return `${hk ? `<div class="ob-hk${hkOn ? ' on' : ''}">
        <div><b>${hkOn ? HealthBridge.name() + ' 연결됨' : HealthBridge.name() + '에서 불러오기'}</b><span>${hkOn ? '키·몸무게·체지방률·성별·나이를 채웠습니다. 인바디로 잴 때마다 자동으로 들어옵니다' : '인바디 앱·체중계가 건강 앱에 남긴 값으로 아래를 채우고, 앞으로 인바디 측정도 자동으로 기록합니다'}</span></div>
        ${hkOn ? '' : `<button class="ob-btn pri" onclick="Onboard._health()">연결</button>`}
      </div>` : ''}
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
  async _health() {
    const n = await InBody.healthConnect();
    const la = InBody.latest() || {}, me = InBody._me || {};
    let pf = {}; try { pf = JSON.parse(UserStore.get('gl_profile') || '{}') || {}; } catch {}
    Object.assign(this.d, { sex: me.sex || pf.sex || this.d.sex, age: me.age || pf.age || this.d.age, ht: me.ht || pf.ht || this.d.ht,
      wt: la.wt || this.d.wt, bf: la.bf || this.d.bf, ms: la.ms || this.d.ms });
    this.paint();
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
  _mcp(k) {
    if (!Settings._mcp) { App.showToast('로그인(동기화)이 끝난 뒤 다시 눌러 주세요 — 설정 › AI 에서도 할 수 있습니다', 'error'); Settings.mcpUrl().then(u => { if (u) Settings._mcp = u; }).catch(() => {}); return; }
    Settings.mcpGo(k);
  },
  _inbodyPhoto() {
    if (typeof JARVIS === 'undefined' || !JARVIS._getKey()) { App.showToast('사진 읽기는 AI 키가 있어야 합니다. 다음 AI 단계에서 무료 키를 넣을 수 있고, 지금은 숫자를 직접 넣어 주세요', ''); return; }
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
    // 연결 주소는 미리 받아 둔다 — 누르는 순간 복사·새 창이 막히지 않게
    setTimeout(() => { Settings.mcpUrl().then(u => { if (u) Settings._mcp = u; }).catch(() => {}); }, 0);
    return `<p class="ob-p">말로 기록하기, 사진으로 식단·인바디 읽기는 AI 가 합니다. 기본으로 쓸 AI 를 고르고 키를 넣어 주세요. 키가 없으면 이 단계를 건너뛰고 나중에 AI 창의 열쇠 단추에서 넣어도 됩니다.</p>
      ${JARVIS.setupHtml()}
      <div class="ob-sub2" id="obMcp">ChatGPT·Claude 월 구독이 있다면</div>
      <p class="ob-p">구독은 API 키가 아니라 위 칸에 넣을 수 없습니다. 대신 아래 단추로 Bashy 를 그 AI 에 커넥터로 붙이면, 그 앱에서 “점심 김치찌개 먹었어” 처럼 말해 Bashy 에 기록할 수 있습니다(구독 요금 안에서). 단추를 누르면 연결 주소가 복사되고 붙여 넣을 화면이 열립니다.</p>
      <div class="ez-go2">
        <button type="button" class="ez-go" onclick="Onboard._mcp('claude')"><b>Claude 에 연결</b><small>주소 복사 + 커넥터 화면 열기</small></button>
        <button type="button" class="ez-go" onclick="Onboard._mcp('chatgpt')"><b>ChatGPT 에 연결</b><small>주소 복사 + 플러그인 화면 열기</small></button>
      </div>
      <div class="ob-sub2">구독 AI 사용량 표시</div>
      <p class="ob-p">Claude·ChatGPT·Higgsfield 구독의 남은 사용량을 맨 위 고리로 보여 줍니다. Bashy 안에서 그 AI 를 쓰지 않아도 됩니다 — PC 크롬에 <a href="https://bashy.app/extension.html" target="_blank" rel="noopener">Bashy 사용량 확장</a>을 깔고 같은 크롬에서 bashy.app 에 로그인하면 됩니다. 표시할 것을 고르세요.</p>
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
        <button class="ob-opt on" data-v="plan" onclick="Onboard._opt(this)"><b>맞춤 플랜 만들기 (추천)</b><span>목표·경력·장소와 기구·주당 횟수·시간·아픈 곳 7가지를 고르면 요일별 루틴을 짜 줍니다</span></button>
        <button class="ob-opt" data-v="own" onclick="Onboard._opt(this)"><b>내 루틴 직접 만들기</b><span>660여 개 종목에서 골라 요일별로 배정합니다</span></button>
        <button class="ob-opt" data-v="later" onclick="Onboard._opt(this)"><b>그날그날 기록만</b><span>계획 없이 한 운동만 ‘+ 운동 추가’ 로 남깁니다</span></button>
      </div>
      ${this._tips([
        ['dumbbell', '체크로 기록', '종목을 누르면 완료, 연필로 무게·횟수를 남기면 다음 무게를 알려 줍니다.'],
        ['trend', '운동 교체', '⇄ 를 누르면 같은 동작·부위의 다른 운동으로 바꿉니다. 쓰기 싫은 기구는 플랜 설정에서 뺄 수 있어요.'],
        ['zap', '자세 보기', '종목 옆 i 를 누르면 자세 그림과 요령, ▶ 는 자세 영상을 찾아 줍니다.'],
      ])}`;
  },
  _opt(b) { b.parentElement.querySelectorAll('.ob-opt').forEach(x => x.classList.toggle('on', x === b)); },
  _saveFit() {
    const v = document.querySelector('#obFit .ob-opt.on')?.dataset.v || 'plan';
    if (typeof Fitness === 'undefined') return;
    if (v === 'plan') {
      this._afterFinish = () => { Tabs?.set?.('body'); setTimeout(() => PlanGen.open(), 300); };
    } else if (v === 'home') {
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

  // ── 기능 안내 ──────────────────────────
  // 갈래마다 [할 수 있는 일, 설명, 어디서(메뉴 경로)]. 경로는 화면에 보이는 이름 그대로 쓴다.
  // 폰은 아래 탭(일정·건강·경제·AI)으로 나뉘고, PC 는 탭 없이 모든 카드가 한 화면에 놓인다.
  GUIDE: [
    { id:'plan', ic:'calendar', t:'일정 · 할일', s:'캘린더 · 할일 · 체크리스트', rows: [
      ['달력 보기', '오늘·이번 주·이번 달로 바꿔 봅니다. 날짜를 누르면 위 요약·식단·습관·운동이 모두 그날로 바뀝니다.', '일정 탭 › 일정과 할일'],
      ['일정·할일 추가', '+ 추가 로 일정을 넣고, 아래 할일 목록에서 할일을 더합니다. 줄을 길게 누르면 수정, 왼쪽으로 3분의 1쯤 밀면 빨갛게 차오르며 진동과 함께 삭제됩니다.', '일정과 할일 › + 추가'],
      ['완료·숨긴 할일', '체크 단추는 끝낸 할일을, 감은 눈 단추는 잠깐 치워 둔 할일을 보여 줍니다. 기한이 지난 할일은 ‘지난’ 으로 모입니다.', '일정과 할일 › 위쪽 단추'],
      ['캘린더 연결', '구글 캘린더·할 일, 아이폰 캘린더(앱), 캘린더 구독 주소(.ics · webcal)를 함께 봅니다. 구글이 없어도 Bashy 캘린더에 저장됩니다.', '설정 › 일정과 할일'],
      ['보일 캘린더 · 기본 캘린더', '어떤 캘린더 일정을 보일지, 새 일정을 어디에 넣을지 고릅니다.', '설정 › 일정과 할일 › 보일 캘린더 · 기본 캘린더'],
      ['상단 급한 할일', '기한이 지난 할일도 맨 위 줄에 보일지 정합니다.', '설정 › 일정과 할일 › 상단 요약'],
      ['체크리스트', '장보기·준비물처럼 한 번 쓰고 마는 목록입니다. 길게 누르면 수정, 왼쪽으로 3분의 1쯤 밀면 빨갛게 차오르며 진동과 함께 삭제됩니다.', '일정 탭 › 체크리스트'],
      ['할일 · 일정 알림', '오늘 마감 할일, 일정 있는 날 아침 요약, 체크리스트 알림 시각을 정합니다.', '설정 › 알림'],
    ] },
    { id:'habit', ic:'check', t:'습관', s:'체크 · 알림 · 트래커', rows: [
      ['체크하기', '네모를 누르면 완료입니다. 길게 누르면 수정하거나 끌어서 순서를 바꾸고, 왼쪽으로 밀면 그날부터 삭제됩니다.', '일정 탭 › 오늘의 습관'],
      ['습관 추가', '이름·분류(운동·공부·약·개발·기타, 분류는 더하고 뺄 수 있음)·반복 요일을 정합니다.', '오늘의 습관 › + 습관 추가'],
      ['습관 알림', '‘알림 설정하기’ 를 누르고 시각을 고르면, 반복 요일에 아직 체크하지 않았을 때 알려 드립니다. 약은 5분 전에 한 번, 체크할 때까지 한 시간마다 다시 알립니다.', '습관 추가 · 편집 › 알림 설정하기'],
      ['습관 트래커', '월간은 달력 한 장에 날마다 달성률을, 연간은 12달을 한 장 격자로 펼쳐 봅니다. 습관별 횟수도 봅니다.', '오늘의 습관 › 월간 · 연간 기록'],
      ['달력 농도', '일정 카드 달력 칸이 진할수록 그날 습관을 많이 한 날입니다.', '일정과 할일 › 달력'],
      ['체크 애니메이션', '체크할 때 효과가 터지고, 그날 습관을 다 채우면 올클리어 도장이 찍힙니다.', '설정 › 소리 · 진동 · 효과 › 체크 애니메이션'],
      ['남은 습관 알림', '정한 시각에 남은 습관이 있으면 한 번 알려 드립니다.', '설정 › 알림 › 습관'],
    ] },
    { id:'diet', ic:'diet', t:'식단', s:'사진 · 검색 · 목표 열량', rows: [
      ['사진으로 기록', '음식 사진을 찍으면 AI 가 메뉴와 열량을 추정해 끼니에 넣습니다.', '건강 탭 › 식단 기록 › 사진'],
      ['음식 검색', '식약처 데이터에서 찾습니다. 초성·띄어쓰기가 달라도 찾고, 비워 두면 최근 먹은 것이 나옵니다. ★ 로 즐겨찾기합니다.', '식단 기록 › 검색'],
      ['바코드 · 영양성분표', '포장 식품은 바코드로 제품을 바로 찾고, 영양성분표를 찍으면 가장 정확합니다. 목록에 없는 음식은 AI 가 찾아 내 사전에 남깁니다.', '식단 기록 › 검색'],
      ['목표 열량', '평일과 휴일의 목표 열량·단백질·탄수화물·지방을 따로 정하고, 휴일로 쓸 요일을 고릅니다.', '식단 기록 › 목표'],
      ['운동 보너스', '운동한 날은 소모 열량만큼 더 먹어도 되는 양이 늘어납니다. 운동 줄을 눌러 절반(기본)·전부·안 함 중 고릅니다.', '식단 기록 › 운동 −kcal 줄'],
      ['끼니 보기', '아침·점심·저녁·간식 줄을 누르면 펼쳐집니다. 영양정보가 빠진 음식은 눌러서 채웁니다.', '식단 기록'],
      ['끼니 알림', '아침·점심·저녁 시각에 아직 기록이 없으면 알려 드립니다.', '설정 › 알림 › 식단 기록'],
    ] },
    { id:'fit', ic:'dumbbell', t:'운동 계획 · 기록', s:'루틴 · 교체 · 내 운동', rows: [
      ['체크로 기록', '종목을 누르면 완료, 연필 단추로 무게·횟수를 남깁니다. 지난 기록으로 오늘 권장 무게를 알려 드립니다.', '건강 탭 › 운동'],
      ['자세 보기', '종목 그림을 누르면 움직이는 자세 그림과 요령이 나옵니다.', '운동 › 종목 그림'],
      ['다른 요일 보기', '위쪽 요일을 누르면 그날 계획을 보고, 앱 전체 날짜도 그날로 바뀝니다.', '운동 › 요일'],
      ['오늘 목록 고치기', '교체·순서·세트·무게·빼기·추가를 합니다. 바꾸면 바로 오늘만 저장되고, ‘앞으로 이 요일에도’ 를 누르면 플랜에 넣습니다.', '운동 › 수정'],
      ['오늘 부위 바꾸기', '부위를 고르면 그날 운동을 그 부위로 다시 짭니다(오늘만 / 앞으로 이 요일도). 직접 골라 넣고 뺄 수도 있습니다.', '운동 › 오늘 부위 바꾸기'],
      ['맞춤 플랜 · 루틴', '7가지 질문으로 요일별 루틴을 짜거나 직접 만듭니다. 하루에 두 번 이상 하면 ‘한 번 더’ 로 회차를 더합니다.', '운동 › 설정 › 루틴'],
      ['장소 · 기구', '운동 장소마다 가진 기구를 정하고, 쓰기 싫은 기구와 추천받지 않을 운동을 뺍니다.', '운동 › 설정'],
      ['내 운동 · 스포츠', '목록에 없는 운동은 이름과 종류(근력 부위·유산소·스포츠)로 만들어 두면 ‘내 운동’ 에 모여 다음부터 검색·교체에 나옵니다. 유산소·스포츠는 분으로 기록합니다.', '운동 고르기 › 직접 만들기'],
      ['오늘 합계', '그날 총 볼륨·세트·소모 열량(추정)이 카드 아래에 보입니다. 누르면 추이가 열립니다.', '운동 › 아래 합계'],
    ] },
    { id:'wk', ic:'clock', t:'운동 모드 · 추이', s:'세트 · 쉬는 시간 · 그래프', rows: [
      ['운동 시작', '종목·세트·예상 시간·예상 볼륨을 보여 주고 시작합니다. 지난 날 운동을 오늘 하거나 그날 기록으로 남길 수도 있습니다.', '운동 › 시작'],
      ['세트 기록', '무게·횟수를 고치면 아직 안 한 아래 세트도 같이 바뀝니다. 세트 추가는 마지막 값 그대로, 왼쪽으로 밀면 그 세트를 지웁니다.', '운동 모드'],
      ['숫자 입력 방식', '키패드(소수점 포함)와 자릿수 스크롤 중 고른 방식이 계정에 남아 다음에도 그대로 열립니다.', '운동 모드 › 무게·횟수 › 키패드 / 스크롤'],
      ['쉬는 시간 타이머', '세트를 끝내면 타이머가 돕니다. 3초 전부터 째깍, 끝나면 알림음이 울리고 앱을 내려 둬도 울립니다. 시간·타이머·소리 설정은 계정에 저장됩니다.', '운동 모드 › 위쪽 단추'],
      ['잠금 화면 표시', '아이폰은 잠금 화면·다이내믹 아일랜드에 지금 운동과 남은 쉬는 시간이 보이고, 세트 완료·+30초·건너뛰기를 누를 수 있습니다. 안드로이드는 상단 알림으로 보입니다.', '운동 모드 (앱)'],
      ['자동 끝내기', '30분 동안 기록이 없으면 아직 운동 중인지 묻고, 1시간이 되면 지금까지 한 것을 저장하고 끝냅니다.', '운동 모드'],
      ['이어 하기 · 끝내기', '도중에 나가도 진행이 남아 다시 시작을 누르면 이어집니다. 끝낼 때 저장 여부를 고르고, 목록이 바뀌었으면 오늘만·플랜에도를 묻습니다.', '운동 모드 › 끝내기'],
      ['운동 기록 · 추이', '이번 주와 지난주 같은 기간의 볼륨·세트·열량·운동한 날, 주별(8주)·일별(14일) 그래프, 부위별 볼륨, 종목별 최고 무게를 봅니다.', '운동 › 기록 · 추이 보기'],
      ['종목 그래프', '종목을 누르면 그 운동을 언제·몇 kg·몇 번 했는지 그래프로 봅니다.', '기록 · 추이 › 종목 이름'],
    ] },
    { id:'body', ic:'chart', t:'인바디', s:'몸 기록 · 그래프', rows: [
      ['애플 건강 자동 기록', '인바디 앱에서 건강 앱 연동을 켜 두면 체중·체지방률·제지방량·BMI 가 자동으로 들어옵니다(아이폰 앱).', '건강 탭 › 인바디 › 불러오기'],
      ['직접 입력', '휠로 굴려 숫자를 고릅니다. BMI 는 비워 두면 키와 체중으로 자동 계산합니다.', '인바디 › 직접 입력'],
      ['추이 그래프', '기간과 최근 몇 회를 골라 보고, 항목을 눌러 그래프에서 켜고 끕니다. 기록을 누르면 고치거나 지웁니다.', '인바디'],
      ['결과지 사진', '설정 도우미 첫 단계에서 인바디 결과지 사진으로 숫자를 채웁니다(AI 키 필요).', '사용 도우미 › 설정 도우미 › 기본 신체정보'],
      ['상단바 표시', '몸무게·체지방·BMI·근육량과 직전 대비 화살표를 맨 위 줄에 보입니다.', '설정 › 디자인 › 상단바 정보'],
    ] },
    { id:'memo', ic:'memo', t:'메모', s:'서식 · 복사 · 잠금', rows: [
      ['서식', '굵게·밑줄·취소선, 글머리·번호·체크 목록, 들여쓰기를 씁니다. 긴 메모는 눌러서 펼칩니다.', '일정 탭 › 메모'],
      ['누르면 복사', '밑줄을 그은 문구는 누르면 바로 복사됩니다. 주소·계좌처럼 자주 쓰는 글에 좋습니다.', '메모 편집 › 밑줄'],
      ['글씨 크기', '작은 가 · 큰 가 단추로 메모 글씨를 줄이고 키웁니다.', '메모 › 오른쪽 위'],
      ['메모 잠금', '잠그기를 켜면 내용이 기기 안에서 암호화되어 운영자도 읽을 수 없습니다. 카드에는 제목만 보이고, AI 도 잠긴 메모는 읽지 않습니다.', '메모 편집 › 잠그기'],
      ['잠긴 메모 열기', '앱은 Face ID, 웹은 계정(구글·애플) 확인으로 엽니다. 간단 비밀번호(4·6자리)를 만들면 숫자로 열고 새 기기에서도 엽니다.', '잠긴 메모 누르기'],
      ['비밀번호를 잊었을 때', '계정으로 다시 확인하고 새 비밀번호를 만들면 잠긴 메모는 그대로 열립니다.', '잠긴 메모 › 간단 비밀번호를 잊었어요'],
    ] },
    { id:'econ', ic:'trend', t:'경제', s:'시세 · 보유 종목 · 알림', rows: [
      ['관심 종목 · 지수', '한글로 검색해도 해외 종목·지수·금·환율이 나옵니다. 담으면 카드와 상단에 시세가 보입니다.', '경제 탭 › 경제 › 전체 보기'],
      ['증권사 연동', '한국투자증권 Open API 앱키로 보유 종목·수량·평단을 그대로 가져옵니다.', '설정 › 경제 · 증권 › 증권사 연동'],
      ['캡처로 채우기', '다른 증권사는 보유 화면 캡처를 AI 가 읽어 종목·수량·평단을 채웁니다.', '설정 › 경제 · 증권 › 캡처로 채우기'],
      ['보유 종목', '수량·평단을 고치고 평가액·수익률을 봅니다.', '설정 › 경제 · 증권 › 보유 종목 편집'],
      ['시세 알림', '급변동 기준, 한국·미국 장 시작·마감 알림, 매일 리포트 시각을 정합니다. 앱 알림으로 옵니다. 종목마다 알림을 켜고 끕니다.', '경제 › 차트·알림 › 톱니'],
      ['상단바 등락', '보유 또는 관심 종목의 오늘 등락 % 를 맨 위 줄에 보입니다.', '설정 › 디자인 › 상단바 정보'],
    ] },
    { id:'ai', ic:'sparkle', t:'AI 비서', s:'말로 기록 · 음성 대화 · 구독 연결', rows: [
      ['AI 열기', '폰은 아래 탭의 AI, PC 는 오른쪽 아래 단추를 누릅니다.', '아래 탭 › AI'],
      ['말로 하는 일', '운동 교체·추가·기록·부위 바꾸기·시작, 습관 체크·추가, 식단·몸무게 기록, 일정·할일·체크리스트·메모 추가·수정·삭제, 시세 보기, 테마 바꾸기. 실제로 해낸 결과만 알려 드립니다.', 'AI 창'],
      ['음성 대화', '빈 칸에서 마이크를 누르면 듣기 → 자동 보내기 → 답 읽기 → 다시 듣기가 이어집니다. 30초 동안 말이 없으면 끝납니다.', 'AI 창 › 마이크'],
      ['사진으로 식단', '사진 단추로 음식 사진을 보내면 메뉴와 열량을 넣습니다.', 'AI 창 › 사진'],
      ['기본 AI · 키', '무료 Groq·Gemini, 유료 ChatGPT·Claude·Grok API 키 중 기본으로 쓸 AI 를 고릅니다.', '설정 › AI › 기본 AI · 키 설정'],
      ['구독에 연결 (MCP)', 'ChatGPT·Claude 앱에 Bashy 를 커넥터로 붙이면, 그 앱에서 말해 Bashy 에 기록합니다. API 키가 필요 없습니다.', '설정 › AI › ChatGPT · Claude 에 Bashy 연결'],
      ['AI 사용량', 'Claude·ChatGPT·Higgsfield 구독의 남은 한도와 초기화 시각을 봅니다. 맨 위 고리에 보일 것도 고릅니다.', '설정 › AI › AI 사용량'],
      ['답 소리로 읽기', 'AI 답을 음성으로 들려 줍니다.', '설정 › 소리 · 진동 · 효과'],
      ['동의 철회', 'AI 회사로 보내기 전에 받은 데이터 전송 동의를 지웁니다.', '설정 › AI › AI 데이터 전송 동의 철회'],
    ] },
    { id:'home', ic:'monitor', t:'스마트홈 · 허브', s:'집 기기 · 허브 태블릿', rows: [
      ['스마트홈 연결', 'SmartThings·구글 홈·Home Assistant 를 이 계정에 연결합니다.', '설정 › 스마트홈 허브 › 스마트홈 연결'],
      ['AI 로 기기 조작', '“거실 불 꺼 줘”, “에어컨 24도”, “밝기 30” 처럼 말하면 그 방·이름의 기기를 바로 움직입니다.', 'AI 창'],
      ['허브 모드', '켜 두면 프로필 메뉴에 ‘허브 모드로 전환’ 이 생기고, 큰 시계·할 일·AI 사용량·집 기기 화면(가로)으로 바뀝니다. ‹ 앱으로 를 누르면 돌아옵니다.', '설정 › 스마트홈 허브 › 허브 모드'],
      ['허브 태블릿 승인', '태블릿에 뜬 6자리 번호(또는 QR)로 이 계정에 연결합니다. 설정은 한꺼번에 넘어갑니다.', '설정 › 스마트홈 허브 › 허브 태블릿 승인'],
    ] },
    { id:'link', ic:'grid', t:'위젯 · 시리 · 확장', s:'홈 화면 · 단축어 · 크롬', rows: [
      ['홈 화면 위젯', '아이폰은 ‘Bashy 오늘’, 안드로이드는 오늘·습관 위젯을 홈 화면에 놓습니다.', '설정 › 위젯 · 시리 · 홈 화면'],
      ['시리 · 단축어', '“시리야, Bashy에 할 일 추가 / Bashy 오늘 할 일 / Bashy에 몸무게 기록” 을 설정 없이 씁니다(아이폰 앱).', '설정 › 위젯 · 시리 · 홈 화면'],
      ['홈 화면에 추가', '웹은 홈 화면에 담아 앱처럼 엽니다. 아이폰 웹은 이렇게 해야 알림을 받습니다.', '설정 › 위젯 · 시리 · 홈 화면'],
      ['크롬 사용량 확장', 'PC 크롬에 깔면 AI 구독 사용량이 맨 위 고리에 채워집니다. 대화 내용은 읽지 않습니다.', 'bashy.app/extension.html', 'https://bashy.app/extension.html'],
      ['Face ID 잠금', '앱을 열 때마다 본인 확인을 합니다(아이폰 앱).', '프로필 메뉴 › Face ID 잠금'],
    ] },
    { id:'set', ic:'palette', t:'설정 · 화면', s:'디자인 · 카드 순서 · 알림', rows: [
      ['디자인 · 테마 · 아이콘', '새 디자인 / 예전, 시스템·밝게·어둡게, 심플·컬러 아이콘을 고릅니다.', '설정 › 디자인'],
      ['카드 순서 · 켜고 끄기', '↑↓ 로 아래 탭(카테고리) 순서와 카테고리 안 카드의 위아래를 바꾸고, 스위치로 안 쓰는 카드·카테고리를 숨깁니다. 계정에 저장되어 휴대폰·PC 가 같게 보입니다.', '설정 › 디자인 › 카테고리 · 카드 순서와 켜고 끄기'],
      ['상단바 정보', '맨 위 줄에 보일 숫자(열량·몸무게·체지방·BMI·근육량·추세·주식 등락·AI 사용량 고리)를 고릅니다.', '설정 › 디자인 › 상단바 정보'],
      ['숫자 움직임', '습관·할일·체크·열량이 바뀌면 상단바 숫자가 슬롯처럼 굴러 바뀌고, 바뀐 만큼이 떠올랐다 사라집니다. 열량은 먹은 것과 운동 보너스를 따로 보여 줍니다.', '맨 위 상단바'],
      ['소리 · 진동 · 효과', '효과음, 진동(햅틱), 체크 애니메이션, AI 답 읽기를 켜고 끕니다.', '설정 › 소리 · 진동 · 효과'],
      ['알림', '습관·식단·할일·체크리스트·일정 알림을 켜고 시각을 정합니다. 테스트 알림으로 확인합니다.', '설정 › 알림'],
      ['보안 · 계정', '저장된 AI 키 지우기, 로그아웃, 계정 삭제를 합니다.', '설정 › 보안 · 계정'],
      ['어디서나 같게', '기록은 계정에 저장되어 휴대폰·PC·태블릿에서 같게 보입니다.', '자동 동기화'],
    ] },
  ],

  // k: -1 = 목록, 0.. = 갈래
  guide(k) { this.gi = k; this.paint(); },
  _gSearch(v) {
    this.gq = v;
    const box = document.getElementById('obGRes'); if (box) box.innerHTML = this._gListHtml();
  },
  _gRows(rows) {
    return `<div class="ob-gd">${rows.map(([t, s, p, href]) => `<div class="ob-gi"><b>${t}</b><p>${s}</p>${p ? (href
      ? `<a class="ob-path" href="${href}" target="_blank" rel="noopener">${p}</a>` : `<span class="ob-path">${p}</span>`) : ''}</div>`).join('')}</div>`;
  },
  _gListHtml() {
    const q = (this.gq || '').trim().toLowerCase().replace(/\s+/g, '');
    if (q) {
      const hit = [];
      this.GUIDE.forEach((g, k) => g.rows.forEach(r => { if ((g.t + r[0] + r[1] + r[2]).toLowerCase().replace(/\s+/g, '').includes(q)) hit.push([k, g, r]); }));
      if (!hit.length) return `<p class="ob-hint">‘${esc(this.gq.trim())}’ 에 맞는 기능이 없습니다. 다른 말로 찾아 보세요.</p>`;
      return `<div class="ob-gd">${hit.map(([k, g, [t, s, p]]) => `<button type="button" class="ob-gi ob-gi-b" onclick="Onboard.guide(${k})"><small class="ob-gcat">${g.t}</small><b>${t}</b><p>${s}</p><span class="ob-path">${p}</span></button>`).join('')}</div>`;
    }
    return `<div class="ob-gl">${this.GUIDE.map((g, k) => `<button type="button" class="ob-gc" onclick="Onboard.guide(${k})">
        <span class="ob-tic">${Icons.svg(g.ic)}</span><span class="ob-gtx"><b>${g.t}</b><small>${g.s}</small></span><span class="ob-gch" aria-hidden="true">›</span></button>`).join('')}</div>`;
  },
  _paintGuide(el) {
    const n = this.GUIDE.length, k = this.gi;
    const x = `<button class="ob-x" onclick="Onboard.close(false)" aria-label="도우미 닫기">${Icons.svg('close')}</button>`;
    if (k < 0) {
      el.innerHTML = `<div class="ob-card">
        <div class="ob-top">${x}<span class="ob-gtt">사용 도우미</span></div>
        <div class="ob-hd"><span class="ob-ic">${Icons.svg('book')}</span><div><h2>기능 안내</h2><p>무엇을 할 수 있고 어디서 하는지 갈래별로 보여 드립니다</p></div></div>
        <div class="ob-body">
          <input class="inp ob-gq" type="search" placeholder="기능 찾기 — 알림, 타이머, 잠금, 위젯…" value="${esc(this.gq || '').replace(/"/g, '&quot;')}" oninput="Onboard._gSearch(this.value)" aria-label="기능 찾기">
          <div id="obGRes">${this._gListHtml()}</div>
          <button type="button" class="ob-opt ob-gsetup" onclick="Onboard.startSetup()"><b>설정 도우미 다시 하기</b><span>신체정보(목표 열량) · AI · 일정 · 습관 · 식단 · 운동 · 경제 — ${this.STEPS.length}단계, 단계마다 건너뛸 수 있습니다</span></button>
        </div>
        <div class="ob-foot"><button class="ob-btn pri" onclick="Onboard.close(false)">닫기</button></div></div>`;
      return;
    }
    const g = this.GUIDE[k], nx = this.GUIDE[k + 1];
    el.innerHTML = `<div class="ob-card">
      <div class="ob-top">${x}
        <div class="ob-dots">${this.GUIDE.map((_, j) => `<span class="${j < k ? 'done' : j === k ? 'on' : ''}"></span>`).join('')}</div>
        <span class="ob-cnt">${k + 1}/${n}</span></div>
      <div class="ob-hd"><span class="ob-ic">${Icons.svg(g.ic)}</span><div><h2>${g.t}</h2><p>${g.s}</p></div></div>
      <div class="ob-body">
        <button type="button" class="ob-link ob-gback" onclick="Onboard.guide(-1)">‹ 기능 목록</button>
        ${this._gRows(g.rows)}
      </div>
      <div class="ob-foot">
        <button class="ob-btn" onclick="Onboard.guide(${k > 0 ? k - 1 : -1})">${k > 0 ? '이전' : '목록'}</button>
        <button class="ob-btn pri" onclick="Onboard.guide(${nx ? k + 1 : -1})">${nx ? `다음 · ${nx.t}` : '목록으로'}</button>
      </div></div>`;
    el.querySelector('.ob-body')?.scrollTo(0, 0);
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
