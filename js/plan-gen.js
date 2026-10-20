// js/plan-gen.js — 맞춤 운동 플랜 · 기구 제외 · 운동 교체 · 무게 기록과 다음 무게 · AI 플랜
//
// 여러 운동 앱(Fitbod·Hevy·플랜핏·Caliber·Freeletics·번핏)의 첫 설정을 비교해 좋은 점만 모았다.
//   · 질문은 7개만: 목표 · 경력 · 장소와 기구 · 주당 일수 · 한 번 시간 · 집중 부위와 유산소 · 아픈 곳
//     (키·몸무게는 이미 도우미 1단계에서 받는다)
//   · 기구는 '고르는 조건' 이 아니라 '거르는 필터' 다(Fitbod·플랜핏): 없는 기구·뺀 기구를 쓰는 운동은 후보에서 뺀다
//   · 분할은 주당 일수 × 경력으로 정한다 / 종목 수는 시간으로 정한다(Fitbod 시간표 응용)
//   · 교체는 같은 동작 → 같은 부위 순, 가진 기구로만(Fitbod Replace)
//   · 무게는 더블 프로그레션: 모든 세트가 반복 상한에 닿으면 다음엔 올리고, 두 번 연속 하한 미만이면 10% 내린다
//   · AI 플랜: 지난 기록(무게·횟수)과 답을 사용자의 AI 키로 보내 루틴을 받아 온다
const PlanGen = {
  PROFILE_KEY: 'gl_fit_profile',   // { goal, level, loc, equip[], days, mins, focus[], cardio, injury[], exclude[] }
  BAN_KEY: 'gl_fit_ban',           // 다시 추천하지 않을 운동 이름들
  LOG_PREFIX: 'gl_fit_log_',       // + 날짜 → { 운동이름: [{w, r}] }
  SWAP_PREFIX: 'gl_fit_swap_',     // + 날짜 → { 순번: 새 이름 } (루틴이 아닌 플랜의 그날만 교체)

  EQUIP: [
    ['dumbbell', '덤벨'], ['barbell', '바벨·랙'], ['machine', '머신'], ['cable', '케이블'],
    ['bar', '철봉(풀업바)'], ['band', '밴드'], ['kettlebell', '케틀벨'], ['trx', 'TRX·링'],
  ],

  // 운동 이름 → 쓰는 기구. 이름에 기구가 들어 있어서 규칙으로 충분하다.
  equipOf(n) {
    n = String(n || '');
    if (/덤벨|고블릿/.test(n) && !/케틀벨/.test(n)) return 'dumbbell';
    if (/케틀벨/.test(n)) return 'kettlebell';
    if (/밴드/.test(n)) return 'band';
    if (/TRX|^링 /.test(n)) return 'trx';
    if (/케이블|로프|크로스오버|페이스 풀|풀다운(?! 머신)|암 풀다운/.test(n)) return 'cable';
    if (/머신|해머 ?스트렝스|스미스|레그 프레스|레그 컬|레그 익스텐션|펙 ?덱|핵 |펜듈럼|펜들럼|어시스트 (풀|친|딥)|슬레드/.test(n)) return 'machine';
    if (/바벨|이지바|랜드마인|트랩바|헥스 ?바|티 바|데드리프트|벤치 ?프레스|오버헤드 프레스|굿모닝|펜들레이|랙 풀|파워 ?클린|클린|스내치|쓰러스터|비하인드 넥|JM 프레스|스쿼트 클린|프론트 스쿼트|박스 바벨/.test(n)) return 'barbell';
    if (/풀 ?업|친 ?업|철봉|행잉|인버티드|토 투 바|머슬업|캡틴스|매달리기/.test(n)) return 'bar';
    return 'body';
  },

  // 동작 칸(슬롯)마다 후보. 앞에 있을수록 우선(헬스장 표준 → 집에서 되는 것).
  POOL: {
    squat:   ['바벨 스쿼트', '핵 스쿼트 머신', '레그 프레스', '고블릿 스쿼트', '덤벨 스쿼트', '케틀벨 고블릿 스쿼트', '밴드 스쿼트', '와이드 스쿼트'],
    hinge:   ['루마니안 데드리프트', '데드리프트', '덤벨 루마니안 데드리프트', '케이블 풀 쓰루', '케틀벨 데드리프트', '원 레그 데드리프트', '힙 브릿지'],
    lunge:   ['덤벨 불가리안 스플릿 스쿼트', '덤벨 런지', '바벨 런지', '스미스 머신 런지', '케틀벨 런지', '스플릿 스쿼트', '백 런지'],
    glute:   ['바벨 힙 쓰러스트', '힙 쓰러스트 머신', '덤벨 힙 쓰러스트', '케틀벨 힙 쓰러스트', '밴드 글루트 브릿지', '힙 브릿지'],
    quad:    ['레그 익스텐션', '덤벨 레그 익스텐션', '씨시 스쿼트', '월 싯'],
    ham:     ['레그 컬', '시티드 레그 컬', '케이블 루마니안 데드리프트', '덤벨 스티프 레그 데드리프트', '노르딕 컬'],
    calf:    ['스탠딩 카프 레이즈 머신', '스미스 머신 카프 레이즈', '카프 레이즈', '싱글 레그 카프레이즈'],
    hpush:   ['벤치 프레스', '덤벨 벤치 프레스', '체스트 프레스 머신', '스미스 머신 벤치 프레스', '케이블 체스트 프레스', '밴드 체스트 프레스', '푸쉬업', '니 푸쉬업'],
    incline: ['인클라인 덤벨 벤치 프레스', '인클라인 벤치 프레스', '인클라인 벤치 프레스 머신', '인클라인 케이블 벤치 프레스', '디클라인 푸쉬업'],
    fly:     ['펙덱 플라이', '케이블 크로스오버', '덤벨 플라이', '밴드 체스트 플라이', '와이드 푸쉬업'],
    vpush:   ['오버헤드 프레스', '덤벨 숄더 프레스', '숄더 프레스 머신', '케이블 숄더 프레스', '케틀벨 숄더 프레스', '밴드 오버헤드 프레스', '파이크 푸쉬업'],
    lateral: ['덤벨 레터럴 레이즈', '케이블 레터럴 레이즈', '레터럴 레이즈 머신', '밴드 레터럴 레이즈', 'Y 레이즈'],
    rear:    ['페이스 풀', '펙 덱 리어 델트', '리버스 케이블 플라이', '인클라인 덤벨 리어 래터럴 레이즈', '밴드 풀 어파트', 'T 레이즈'],
    vpull:   ['풀 업', '랫 풀다운', '랫 풀다운 머신', '어시스트 풀 업', '밴드 어시스트 풀 업', '원 암 케이블 랫 풀다운', '슈퍼맨 로우'],
    hrow:    ['바벨 로우', '시티드 케이블 로우', '시티드 로우 머신', '원 암 덤벨 로우', '케틀벨 로우', '밴드 로우', '인버티드 로우', '슈퍼맨 로우'],
    row2:    ['원 암 덤벨 로우', '티 바 로우', '시티드 로우 머신', '시티드 케이블 로우', '덤벨 벤트오버 로우', '밴드 벤트 오버 로우', '인버티드 로우', 'W 레이즈'],
    biceps:  ['바벨 바이셉 컬', '덤벨 바이셉 컬', '케이블 바이셉 컬', '암 컬 머신', '케틀벨 이두 컬', '밴드 바이셉 컬', 'TRX 바이셉스 컬'],
    hammer:  ['덤벨 해머 컬', '로프 해머 컬', '밴드 해머 컬', '인클라인 덤벨 컬'],
    triceps: ['케이블 트라이셉 푸쉬다운', '케이블 로프 트라이셉 익스텐션', '오버헤드 트라이셉스 익스텐션', '트라이셉 푸쉬다운 머신', '덤벨 킥백', '밴드 트라이셉 푸쉬다운', '벤치 딥스', '다이아몬드 푸쉬업'],
    core:    ['행잉 레그 레이즈', '케이블 크런치', 'AB 슬라이드', '데드 벅', '플랭크', '레그 레이즈', '크런치', '러시안 트위스트'],
  },
  PART_OF: { squat:'하체', hinge:'하체', lunge:'하체', glute:'하체', quad:'하체', ham:'하체', calf:'하체',
    hpush:'가슴', incline:'가슴', fly:'가슴', vpush:'어깨', lateral:'어깨', rear:'어깨',
    vpull:'등', hrow:'등', row2:'등', biceps:'이두', hammer:'이두', triceps:'삼두', core:'복근' },

  // 날 모양(우선순위 순). 시간이 짧으면 뒤에서부터 잘린다.
  DAYS: {
    fullA: ['전신 A', ['squat', 'hpush', 'hrow', 'hinge', 'lateral', 'core', 'biceps']],
    fullB: ['전신 B', ['hinge', 'vpush', 'vpull', 'lunge', 'incline', 'core', 'triceps']],
    fullC: ['전신 C', ['lunge', 'incline', 'row2', 'glute', 'rear', 'core', 'hammer']],
    upper: ['상체 A', ['hpush', 'vpull', 'vpush', 'hrow', 'lateral', 'biceps', 'triceps']],
    upper2:['상체 B', ['incline', 'hrow', 'vpush', 'vpull', 'fly', 'hammer', 'triceps']],
    lower: ['하체 A', ['squat', 'hinge', 'lunge', 'ham', 'quad', 'calf', 'core']],
    lower2:['하체 B', ['hinge', 'lunge', 'glute', 'quad', 'ham', 'calf', 'core']],
    push:  ['푸시', ['hpush', 'incline', 'vpush', 'lateral', 'fly', 'triceps', 'triceps']],
    pull:  ['풀', ['vpull', 'hrow', 'row2', 'rear', 'biceps', 'hammer', 'core']],
    legs:  ['하체', ['squat', 'hinge', 'lunge', 'quad', 'ham', 'calf', 'core']],
  },
  // 주당 일수 × 경력 → 날 순서 (연구 요약의 분할표)
  split(days, level, loc, equip) {
    const lowGear = loc === 'body' || (loc === 'home' && !equip.includes('barbell') && !equip.includes('machine'));
    const adv = level === 'mid';
    if (days <= 2) return ['fullA', 'fullB'];
    if (days === 3) return adv && !lowGear ? ['push', 'pull', 'legs'] : ['fullA', 'fullB', 'fullC'];
    if (days === 4) return ['upper', 'lower', 'upper2', 'lower2'];
    if (days === 5) return adv && !lowGear ? ['push', 'pull', 'legs', 'upper', 'lower'] : ['upper', 'lower', 'fullA', 'upper2', 'lower2'];
    return adv && !lowGear ? ['push', 'pull', 'legs', 'push', 'pull', 'legs'] : ['upper', 'lower', 'fullA', 'upper2', 'lower2'];
  },
  WEEKDAYS: { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] },
  COUNT: { 30: 4, 45: 5, 60: 6, 75: 7 },
  SETS: {   // 목표 → [메인, 보조]
    muscle:   ['4×8-12', '3×10-12'],
    strength: ['5×3-5', '3×6-8'],
    lose:     ['3×12-15', '3×15'],
    health:   ['3×10-12', '2×12-15'],
  },
  // 아픈 곳 → 피할 동작 칸 / 이름
  INJURY: {
    shoulder: { slots: ['vpush'], re: /딥스|비하인드 넥|업라이트/ },
    back:     { slots: [], re: /^데드리프트|바벨 로우|굿모닝|펜들레이|바벨 스쿼트/ },
    knee:     { slots: ['lunge'], re: /점프|피스톨|씨시|시시|레그 익스텐션/ },
    wrist:    { slots: [], re: /푸쉬업|프론트 스쿼트/ },
  },

  profile() { try { return JSON.parse(UserStore.get(this.PROFILE_KEY) || 'null'); } catch { return null; } },
  saveProfile(p) { UserStore.set(this.PROFILE_KEY, JSON.stringify(p)); window.FirebaseSync?.scheduleSave?.(); },
  bans() { try { return JSON.parse(UserStore.get(this.BAN_KEY) || '[]'); } catch { return []; } },
  ban(name) { const b = this.bans(); if (!b.includes(name)) { b.push(name); UserStore.set(this.BAN_KEY, JSON.stringify(b)); window.FirebaseSync?.scheduleSave?.(); } },

  // 이 사람이 쓸 수 있는 기구 (맨몸은 늘 가능)
  have(p) {
    p = p || this.profile() || {};
    let set;
    if (!p.loc || p.loc === 'gym') set = ['dumbbell', 'barbell', 'machine', 'cable', 'bar', 'band', 'kettlebell', 'trx'];
    else if (p.loc === 'body') set = (p.equip || []).filter(e => e === 'bar' || e === 'band');
    else set = p.equip || [];
    const ex = p.exclude || [];
    return ['body', ...set.filter(e => !ex.includes(e))];
  },
  allowed(name, p) {
    p = p || this.profile() || {};
    if (this.bans().includes(name)) return false;
    if (!this.have(p).includes(this.equipOf(name))) return false;
    for (const k of p.injury || []) { const r = this.INJURY[k]; if (r && r.re.test(name)) return false; }
    return true;
  },
  // 고르기 창에서 쓰는 거름: 뺀 기구(exclude)와 다시 추천 안 함만 거른다(장소는 따지지 않는다)
  pickerOk(name) {
    const p = this.profile() || {};
    return !this.bans().includes(name) && !(p.exclude || []).includes(this.equipOf(name));
  },

  // ── 플랜 만들기 ─────────────────────────
  generate(p) {
    const days = Math.max(2, Math.min(6, Number(p.days) || 3));
    const order = this.split(days, p.level, p.loc, p.equip || []);
    let n = this.COUNT[p.mins] || 5;
    if (p.level === 'new') n -= 1;
    const [mainSet, accSet] = this.SETS[p.goal] || this.SETS.muscle;
    const banSlots = new Set((p.injury || []).flatMap(k => (this.INJURY[k] || {}).slots || []));
    const routines = order.map((key, di) => {
      const [nm, slots0] = this.DAYS[key];
      let slots = slots0.filter(s => !banSlots.has(s));
      // 집중 부위: 그 부위 칸이 있는 날에 한 칸 더(앞쪽에)
      for (const f of p.focus || []) {
        const extra = Object.keys(this.PART_OF).find(s => this.PART_OF[s] === f && slots.includes(s));
        if (extra) slots.splice(2, 0, extra);
      }
      const used = new Set(), out = [];
      for (const s of slots) {
        if (out.length >= n) break;
        const name = (this.POOL[s] || []).find(x => !used.has(x) && this.allowed(x, p));
        if (!name) continue;
        used.add(name);
        out.push({ name, sets: out.length < 2 && p.goal !== 'lose' ? mainSet : accSet, slot: s });
      }
      const dup = order.slice(0, di).filter(k => k === key).length;
      return { name: `${nm}${dup ? ' ' + (dup + 1) : ''}`, exercises: out };
    });
    return { routines, weekdays: this.WEEKDAYS[days] || this.WEEKDAYS[3] };
  },

  apply(plan, p) {
    const R = Fitness.routines();
    // 예전에 만든 자동 플랜은 지운다(직접 만든 루틴은 그대로)
    Object.keys(R).forEach(k => { if (R[k].auto) delete R[k]; });
    const dp = {}, ids = [];
    plan.routines.forEach((r, i) => {
      const id = 'p_' + Date.now().toString(36) + i;
      R[id] = { name: r.name, exercises: r.exercises.map(x => ({ name: x.name, sets: x.sets, slot: x.slot })), auto: true };
      ids.push(id);
    });
    for (let d = 0; d < 7; d++) dp[d] = 'rest';
    plan.weekdays.forEach((d, i) => { dp[d] = ids[i % ids.length]; });
    if (p.cardio) for (let d = 1; d < 7; d++) if (dp[d] === 'rest') dp[d] = 'cardio';
    Fitness.saveRoutines(R);
    Fitness.saveDayPlan(dp);
    UserStore.set('gl_fit_blank', '0');
    try { Fitness.render(App?.S?.selDate || new Date()); } catch (e) {}
  },

  // ── 설정 질문 창 ─────────────────────────
  Q: [
    ['goal', '목표', [['muscle', '근육 키우기'], ['strength', '힘 세지기'], ['lose', '체중 감량'], ['health', '건강·체력']]],
    ['level', '운동 경력', [['new', '처음 (6개월 미만)'], ['beg', '초급 (2년 미만)'], ['mid', '중급 이상']]],
    ['loc', '어디서 하나요', [['gym', '헬스장'], ['home', '집 (기구 있음)'], ['body', '집 (맨몸)']]],
    ['days', '일주일에 몇 번', [[2, '2회'], [3, '3회'], [4, '4회'], [5, '5회'], [6, '6회']]],
    ['mins', '한 번에 몇 분', [[30, '30분'], [45, '45분'], [60, '60분'], [75, '75분+']]],
  ],
  open() {
    const p = this.profile() || { goal: 'muscle', level: 'beg', loc: 'gym', days: 3, mins: 60, equip: ['dumbbell'], focus: [], cardio: false, injury: [], exclude: [] };
    this._p = JSON.parse(JSON.stringify(p));
    App.openModal('@dumbbell 맞춤 운동 플랜', `<div id="pgBody" class="pg"></div>
      <div class="modal-btns">
        <button class="btn-sm accent" onclick="PlanGen.make()">플랜 만들기</button>
        <button class="btn-sm" onclick="PlanGen.aiMake()">AI 로 만들기</button>
        <button class="btn-sm" onclick="App.closeModal()">취소</button>
      </div>`);
    this._paint();
  },
  _chip(k, v, l, multi) {
    const cur = this._p[k];
    const on = multi ? (cur || []).includes(v) : cur === v;
    const vv = typeof v === 'number' ? v : `'${v}'`;
    return `<button type="button" class="pg-c${on ? ' on' : ''}" onclick="PlanGen._set('${k}', ${vv}, ${multi ? 1 : 0})">${l}</button>`;
  },
  _set(k, v, multi) {
    if (multi) { const a = this._p[k] || []; this._p[k] = a.includes(v) ? a.filter(x => x !== v) : a.concat(v); }
    else this._p[k] = v;
    this._paint();
  },
  _paint() {
    const b = document.getElementById('pgBody'); if (!b) return;
    const p = this._p;
    const row = (t, inner, sub) => `<div class="pg-q"><div class="pg-t">${t}${sub ? `<small>${sub}</small>` : ''}</div><div class="pg-cs">${inner}</div></div>`;
    let h = this.Q.map(([k, t, opts]) => row(t, opts.map(([v, l]) => this._chip(k, v, l)).join(''))).join('');
    if (p.loc !== 'gym') h += row('가진 기구', this.EQUIP.filter(([e]) => p.loc === 'home' || e === 'bar' || e === 'band').map(([e, l]) => this._chip('equip', e, l, true)).join(''), '여러 개 고를 수 있습니다');
    h += row('더 키우고 싶은 부위', ['가슴', '등', '어깨', '하체', '이두', '삼두', '복근'].map(x => this._chip('focus', x, x, true)).join(''), '선택 · 최대 2개 권장');
    h += row('유산소', this._chip('cardio', true, '쉬는 날에 넣기') + this._chip('cardio', false, '넣지 않기'));
    h += row('아픈 곳', [['shoulder', '어깨'], ['back', '허리'], ['knee', '무릎'], ['wrist', '손목']].map(([v, l]) => this._chip('injury', v, l, true)).join(''), '그 부위에 부담이 큰 동작을 뺍니다');
    h += row('추천하지 않을 기구', this.EQUIP.map(([e, l]) => this._chip('exclude', e, l, true)).join(''), '있어도 쓰기 싫은 기구 — 플랜·교체·추가 목록에서 뺍니다');
    const plan = this.generate(p);
    h += `<div class="pg-prev"><div class="pg-t">미리 보기</div>${plan.routines.map((r, i) => `
      <div class="pg-day"><b>${['일', '월', '화', '수', '목', '금', '토'][plan.weekdays[i]]} · ${esc(r.name)}</b>
        <span>${r.exercises.map(x => esc(x.name)).join(' · ') || '가능한 운동이 없습니다 — 기구를 더 골라 주세요'}</span></div>`).join('')}
      <p class="pg-note">세트 ${esc((this.SETS[p.goal] || this.SETS.muscle).join(' / '))} · 종목 ${plan.routines[0]?.exercises.length || 0}개 · 쉬는 날 ${p.cardio ? '가벼운 유산소' : '휴식'}</p></div>`;
    b.innerHTML = h;
  },
  make() {
    const p = this._p;
    const plan = this.generate(p);
    if (!plan.routines.some(r => r.exercises.length)) { App.showToast('가능한 운동이 없습니다 — 기구를 더 골라 주세요', 'error'); return; }
    this.saveProfile(p);
    this.apply(plan, p);
    App.closeModal();
    App.showToast('맞춤 플랜을 요일에 배정했습니다', 'success');
  },

  // ── AI 로 만들기: 답 + 지난 4주 기록 ─────────
  recentLogs(days = 28) {
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = Fitness._dateStr(d);
      const L = this.log(ds);
      for (const [n, sets] of Object.entries(L)) if (sets.length) out.push(`${ds} ${n}: ${sets.map(s => `${s.w || 0}kg×${s.r || 0}`).join(', ')}`);
    }
    return out.slice(0, 120);
  },
  async aiMake() {
    const p = this._p;
    if (!JARVIS._getKey()) { App.showToast('AI 키가 필요합니다 — 설정 › AI 에서 무료 키를 넣어 주세요', 'error'); return; }
    const base = this.generate(p);
    const allowed = Object.values(EX_DB).flat().filter(n => this.allowed(n, p));
    const logs = this.recentLogs();
    App.showToast('AI 가 플랜을 짜는 중…');
    const prompt = `당신은 근력 운동 코치입니다. 아래 조건과 지난 기록으로 주간 루틴을 짜 주세요.
조건: ${JSON.stringify({ 목표: p.goal, 경력: p.level, 장소: p.loc, 주당: p.days, 분: p.mins, 집중: p.focus, 아픈곳: p.injury })}
기본안(규칙 기반): ${JSON.stringify(base.routines.map(r => ({ name: r.name, ex: r.exercises.map(x => x.name + ' ' + x.sets) })))}
지난 4주 기록(날짜 운동: 무게×횟수): ${logs.length ? logs.join(' | ') : '없음'}
규칙: 운동 이름은 반드시 아래 목록에서만 고른다. 날 수는 ${base.routines.length}개. 기록이 있으면 각 종목 sets 뒤에 다음 목표 무게를 '@60kg' 처럼 붙인다(모든 세트가 반복 상한이면 +2.5~5kg, 두 번 연속 하한 미만이면 -10%).
가능한 운동 목록: ${allowed.join(', ')}
JSON 만 출력: {"routines":[{"name":"상체","exercises":[{"name":"벤치 프레스","sets":"4×8-12 @60kg"}]}],"note":"한 줄 설명"}`;
    try {
      const data = await JARVIS.chat({ max_tokens: 1800, temperature: 0.2, messages: [{ role: 'user', content: prompt }] });
      const t = data.choices?.[0]?.message?.content || '';
      const m = t.match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : null;
      const ok = new Set(allowed);
      const routines = (j?.routines || []).slice(0, base.routines.length).map(r => ({
        name: String(r.name || '루틴').slice(0, 20),
        exercises: (r.exercises || []).filter(x => ok.has(x.name)).slice(0, 8).map(x => ({ name: x.name, sets: String(x.sets || '3×10').slice(0, 24) })),
      })).filter(r => r.exercises.length);
      if (!routines.length) throw new Error('쓸 수 있는 답이 아닙니다');
      this.saveProfile(p);
      this.apply({ routines, weekdays: base.weekdays.slice(0, routines.length) }, p);
      App.closeModal();
      App.showToast('AI 플랜을 배정했습니다' + (j.note ? ' — ' + String(j.note).slice(0, 60) : ''), 'success');
    } catch (e) { App.showToast('AI 플랜 실패: ' + (e.message || e) + ' — 기본 플랜 만들기를 써 주세요', 'error'); }
  },

  // ── 무게·횟수 기록과 다음 무게 ─────────────
  log(ds) { try { return JSON.parse(UserStore.get(this.LOG_PREFIX + ds) || '{}') || {}; } catch { return {}; } },
  saveLog(ds, L) { UserStore.set(this.LOG_PREFIX + ds, JSON.stringify(L)); window.FirebaseSync?.scheduleSave?.(); },
  // 이 운동의 가장 최근 기록(오늘 이전)
  last(name, beforeDs) {
    for (let i = 1; i <= 120; i++) {
      const d = new Date(beforeDs + 'T00:00:00'); d.setDate(d.getDate() - i);
      const L = this.log(Fitness._dateStr(d));
      if (L[name] && L[name].length) return { ds: Fitness._dateStr(d), sets: L[name] };
    }
    return null;
  },
  _range(sets) { const m = String(sets || '').match(/(\d+)\s*[-~]\s*(\d+)/); if (m) return [+m[1], +m[2]]; const k = String(sets || '').match(/×\s*(\d+)/); return k ? [+k[1], +k[1]] : [8, 12]; },
  // 더블 프로그레션 제안
  // 오늘 권장 무게(숫자) — 운동 모드가 칸에 미리 채운다
  nextWeight(name, sets, ds) {
    const t = this.suggest(name, sets, ds).match(/오늘 ([\d.]+)kg/);
    return t ? Number(t[1]) : null;
  },
  suggest(name, sets, ds) {
    const L = this.last(name, ds); if (!L) return '';
    const [lo, hi] = this._range(sets);
    const top = Math.max(...L.sets.map(s => Number(s.w) || 0));
    if (!top) return `지난번 ${L.sets.map(s => s.r).join('·')}회`;
    const allHi = L.sets.every(s => Number(s.r) >= hi), under = L.sets.some(s => Number(s.r) < lo);
    const lower = this.PART_OF[Object.keys(this.POOL).find(k => this.POOL[k].includes(name))] === '하체';
    const step = lower ? 5 : 2.5;
    const next = allHi ? top + step : under ? Math.round(top * 0.9 / 2.5) * 2.5 : top;
    return `지난번 ${top}kg×${L.sets.map(s => s.r).join('·')} → 오늘 ${next}kg${allHi ? ' ▲' : under ? ' ▼' : ''}`;
  },
  openLog(name, sets, ds) {
    const L = this.log(ds), cur = L[name] || [];
    const n = Math.max(cur.length, Number(String(sets).match(/^(\d+)/)?.[1]) || 3);
    const prev = this.last(name, ds);
    this._lg = { name, ds };
    App.openModal('@dumbbell ' + name, `
      ${prev ? `<p class="pg-note">지난번(${prev.ds.slice(5).replace('-', '/')}): ${prev.sets.map(s => `${s.w || 0}kg×${s.r || 0}`).join(', ')}</p>` : ''}
      <p class="pg-note">${esc(this.suggest(name, sets, ds) || '처음 기록입니다 — 2~3회 더 할 수 있는 무게로 시작하세요')}</p>
      <div id="lgRows" class="lg-rows">${Array.from({ length: n }, (_, i) => this._lgRow(i, cur[i])).join('')}</div>
      <button class="habit-add-btn" onclick="PlanGen._lgAdd()">+ 세트</button>
      <div class="modal-btns"><button class="btn-sm accent" onclick="PlanGen._lgSave()">저장</button><button class="btn-sm" onclick="App.closeModal()">취소</button></div>`);
  },
  _lgRow(i, s) {
    s = s || {};
    return `<div class="lg-row"><span class="lg-n">${i + 1}</span>
      <input class="inp inp-sm lg-w" type="number" inputmode="decimal" step="0.5" placeholder="kg" value="${s.w ?? ''}">
      <span>kg ×</span><input class="inp inp-sm lg-r" type="number" inputmode="numeric" placeholder="회" value="${s.r ?? ''}"><span>회</span></div>`;
  },
  _lgAdd() { const b = document.getElementById('lgRows'); if (b) b.insertAdjacentHTML('beforeend', this._lgRow(b.children.length)); },
  _lgSave() {
    const { name, ds } = this._lg || {}; if (!name) return;
    const sets = [...document.querySelectorAll('#lgRows .lg-row')].map(r => ({ w: Number(r.querySelector('.lg-w').value) || 0, r: Number(r.querySelector('.lg-r').value) || 0 })).filter(s => s.r > 0);
    const L = this.log(ds); if (sets.length) L[name] = sets; else delete L[name];
    this.saveLog(ds, L);
    App.closeModal();
    try { Fitness.render(new Date(ds + 'T00:00:00')); } catch (e) {}
    App.showToast(sets.length ? `${sets.length}세트 기록됨` : '기록을 지웠습니다', 'success');
  },

  // ── 운동 교체 ───────────────────────────
  // 이름 → 자극 부위. 목록에 없는 이름(홈트 플랜·직접 쓴 이름)도 낱말로 짐작한다.
  partOf(name) {
    const n = String(name || '');
    const slot = Object.keys(this.POOL).find(k => this.POOL[k].includes(n));
    if (slot) return this.PART_OF[slot];
    const hit = Object.keys(EX_DB).find(k => EX_DB[k].includes(n));
    if (hit) return hit;
    const R = [
      [/걷기|러닝|달리기|자전거|사이클|싸이클|줄넘기|유산소|Zone ?2|트레드밀|로잉|버피|점핑|등산|수영/i, '유산소'],
      [/컬(?!.*레그)|바이셉|이두/, '이두'], [/트라이셉|삼두|킥백|푸쉬다운|딥스/, '삼두'],
      [/레이즈(?!.*레그)|숄더|어깨|오버헤드|파이크|페이스 풀|리어/, '어깨'],
      [/스쿼트|런지|레그|하체|힙|브릿지|카프|데드리프트|글루트|둔근|허벅지/, '하체'],
      [/풀 ?업|친 ?업|로우|풀다운|등|턱걸이|슈퍼맨/, '등'],
      [/푸쉬업|팔굽혀|벤치|체스트|가슴|플라이|프레스/, '가슴'],
      [/플랭크|크런치|복근|코어|싯업|레그 레이즈|데드 ?벅|트위스트/, '복근'],
    ];
    const m = R.find(([re]) => re.test(n));
    return m ? m[1] : null;
  },
  // 교체 후보: ① 같은 동작 칸 → ② 같은 동작 이름 → ③ 같은 부위. 가진 기구로 먼저 고르고,
  // 그래도 없으면 기구를 따지지 않고(대신 '기구 필요' 표시) 같은 부위에서 고른다 — 빈 목록은 보이지 않는다.
  alternatives(name) {
    const p = this.profile() || {};
    const slot = Object.keys(this.POOL).find(k => this.POOL[k].includes(name));
    const part = this.partOf(name);
    const kw = String(name).replace(/덤벨|바벨|케이블|머신|스미스|케틀벨|밴드|원 암|인클라인|디클라인|시티드|스탠딩|\(.*?\)/g, '').trim().split(/\s+/).pop();
    const cands = [];
    if (slot) cands.push(...this.POOL[slot]);
    if (part && EX_DB[part]) {
      if (kw) cands.push(...EX_DB[part].filter(n => n.includes(kw)));
      const pool = Object.values(this.POOL).flat().filter(n => this.partOf(n) === part);
      cands.push(...pool, ...EX_DB[part]);
    }
    const uniq = [...new Set(cands)].filter(n => n !== name && !this.bans().includes(n));
    const ok = uniq.filter(n => this.allowed(n, p)).map(n => ({ n, need: false }));
    const more = ok.length >= 6 ? [] : uniq.filter(n => !this.allowed(n, p)).slice(0, 8 - ok.length).map(n => ({ n, need: true }));
    return ok.slice(0, 12).concat(more);
  },
  openSwap(idx, name, ds, rid) {
    this._sw = { idx, name, ds, rid };
    const alts = this.alternatives(name);
    App.openModal('@dumbbell 운동 교체', `
      <p class="pg-note"><b>${esc(name)}</b> 대신 같은 동작 → 같은 자극 부위 순서입니다. 가진 기구로 하는 것부터, 모자라면 기구가 필요한 것도 표시합니다.</p>
      <div class="sw-list">${alts.map((a, i) => {
        const th = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(a.n) : '';
        const eq = (this.EQUIP.find(([e]) => e === this.equipOf(a.n)) || [])[1];
        return `<button class="sw-row" onclick="PlanGen._swap(${i})">${th ? `<span class="ex-th">${ExMedia.poseHtml(th)}</span>` : '<span class="ex-th none"></span>'}<span class="sw-nm">${esc(a.n)}${a.need ? `<small>${esc(eq || '기구')} 필요</small>` : ''}</span></button>`;
      }).join('') || `<p class="pg-note">이 운동의 자극 부위를 알 수 없어 추천을 못 했습니다. '+ 운동 추가' 에서 직접 골라 주세요.</p>`}</div>
      <label class="sw-ban"><input type="checkbox" id="swBan"> '${esc(name)}' 은(는) 앞으로 추천하지 않기</label>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div>`);
    this._alts = alts.map(a => a.n);
  },
  _swap(i) {
    const n = (this._alts || [])[i]; const s = this._sw; if (!n || !s) return;
    if (document.getElementById('swBan')?.checked) this.ban(s.name);
    if (s.rid) {
      const R = Fitness.routines(), r = R[s.rid];
      if (r && r.exercises[s.idx]) { r.exercises[s.idx].name = n; Fitness.saveRoutines(R); }
    } else {
      const k = this.SWAP_PREFIX + s.ds;
      let m = {}; try { m = JSON.parse(UserStore.get(k) || '{}') || {}; } catch {}
      m[s.idx] = n; UserStore.set(k, JSON.stringify(m)); window.FirebaseSync?.scheduleSave?.();
    }
    App.closeModal();
    try { Fitness.render(new Date(s.ds + 'T00:00:00')); } catch (e) {}
    App.showToast(`${n} 으로 바꿨습니다`, 'success');
  },
  swapsFor(ds) { try { return JSON.parse(UserStore.get(this.SWAP_PREFIX + ds) || '{}') || {}; } catch { return {}; } },
};
