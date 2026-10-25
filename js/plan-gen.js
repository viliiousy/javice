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
    ['bar', '철봉·딥스바'], ['band', '밴드'], ['kettlebell', '케틀벨'], ['trx', 'TRX·링'], ['etc', '기타 기구'],
  ],
  // 이름만으로는 틀리게 나오는 종목 — 기구를 직접 적는다(2026-10, 플랜핏 운동 가이드의 기구 분류와 맞춰 봄)
  EQ_FIX: {
    '고릴라 로우':'dumbbell', '레니게이드 로우':'dumbbell', '인클라인 로우':'dumbbell', '루 레이즈':'dumbbell', '숄더 투 숄더 프레스':'dumbbell',
    '아놀드 프레스':'dumbbell', '웨이터 컬':'dumbbell', '컨센트레이션 컬':'dumbbell', '크로스 바디 해머 컬':'dumbbell', '조트맨 컬':'dumbbell',
    '데빌 프레스':'dumbbell', 'B-Stance 루마니안 데드리프트':'dumbbell', '오버헤드 덤벨 트라이셉스 익스텐션':'dumbbell',
    '리버스 그립 오버 헤드 프레스':'barbell', '박스 스쿼트':'barbell', '제르셔 스쿼트':'barbell', '퍼즈 스쿼트':'barbell', '바벨 핵 스쿼트':'barbell', '메도우스 로우':'barbell',
    '버티컬 트랙션':'machine', '투웨이 로우':'machine', '플레이트 로디드 시티드 로우':'machine', '버티컬 체스트 프레스':'machine', '스탠딩 체스트 프레스':'machine',
    '잭해머 푸쉬다운':'machine', '해머 벤치 프레스':'machine', '바이킹 프레스':'machine', '글루트 햄 레이즈':'machine', '리버스 브이 스쿼트':'machine',
    '버티컬 레그프레스':'machine', '벨트 스쿼트':'machine', '브이 스쿼트':'machine', '브이 스쿼트 굿모닝':'machine', '스쿼트 프레스':'machine',
    '캡틴스 체어 레그 레이즈':'machine', '토르소 로테이션':'machine', '펙 플라이 머신':'machine',
    '스키 에르그':'machine', '스텝 밀':'machine', '스텝퍼':'machine', '스핀 바이크':'machine', '싸이클':'machine', '에어 바이크':'machine',
    '트레드밀 러닝':'machine', '인클라인 트레드밀 러닝':'machine', '좌식 싸이클':'machine', '무동력 트레드밀':'machine',
    '베이지안 컬':'cable', '페이스 어웨이 베이지안 컬':'cable', '케이블 사이드 밴드':'cable', '암 크로스오버':'body',
    '딥스':'bar', '중량 딥스':'bar',
  },

  // 운동 이름 → 쓰는 기구. 이름에 기구가 들어 있어서 규칙으로 충분하다.
  equipOf(n) {
    n = String(n || '');
    if (this.EQ_FIX[n]) return this.EQ_FIX[n];
    if (/짐볼|보수볼|메디신볼|스텝 ?박스|박스 점프|배틀 로프|슬레드|리스트 롤러|악력기|AB 슬라이드|줄넘기|큰줄|훌라후프/.test(n)) return 'etc';
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
  split(days, level, have) {
    const lowGear = !have.includes('barbell') && !have.includes('machine');
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
  ALL_EQUIP: ['dumbbell', 'barbell', 'machine', 'cable', 'bar', 'band', 'kettlebell', 'trx', 'etc'],
  // 운동 장소: 이름을 붙여 여러 곳(헬스장 A·회사 헬스장·집…)을 두고, 장소마다 보유 운동기구를 따로 저장한다.
  // 예전 설정(loc: gym/home/body + equip)은 첫 장소로 옮겨 온다. '추천하지 않을 기구'(exclude)는 장소와 상관없이 사람에게 붙는다.
  places(p) {
    p = p || this.profile() || {};
    // '기타 기구'(박스·짐볼·배틀 로프 …)는 2026-10 에 생겼다 — 그 전에 만든 장소는 머신이 있으면(헬스장) 있는 것으로 본다
    if (Array.isArray(p.places) && p.places.length) return p.places.map(pl => {
      if (!pl || pl.v2) return pl;
      const eq = pl.equip || [];
      return Object.assign(pl, { v2: 1, equip: eq.includes('machine') && !eq.includes('etc') ? eq.concat('etc') : eq });
    });
    const loc = p.loc || 'gym';
    return [{ id: 'pl_' + loc, name: loc === 'gym' ? '헬스장' : loc === 'home' ? '집' : '집 (맨몸)',
      equip: loc === 'gym' ? this.ALL_EQUIP.slice() : loc === 'body' ? (p.equip || []).filter(e => e === 'bar' || e === 'band') : (p.equip || []).slice() }];
  },
  place(p) { p = p || this.profile() || {}; const ps = this.places(p); return ps.find(x => x.id === p.place) || ps[0]; },
  have(p) {
    p = p || this.profile() || {};
    const set = this.place(p).equip || [];
    const ex = p.exclude || [];
    return ['body', ...set.filter(e => !ex.includes(e))];
  },
  // 읽기 전용(고치지 말 것) — 종목 검색은 글자 하나 칠 때마다 수백 종목을 거른다
  _profRO() { return UserStore.json(this.PROFILE_KEY, null); },
  _bansRO() { const v = UserStore.json(this.BAN_KEY, null); return Array.isArray(v) ? v : []; },
  allowed(name, p) {
    p = p || this._profRO() || {};
    if (this._bansRO().includes(name)) return false;
    if (!this.have(p).includes(this.equipOf(name))) return false;
    for (const k of p.injury || []) { const r = this.INJURY[k]; if (r && r.re.test(name)) return false; }
    return true;
  },
  // 고르기 창에서 쓰는 거름: 뺀 기구(exclude)와 다시 추천 안 함만 거른다(장소는 따지지 않는다)
  pickerOk(name) {
    const p = this._profRO() || {};
    return !this._bansRO().includes(name) && !(p.exclude || []).includes(this.equipOf(name));
  },

  // ── 플랜 만들기 ─────────────────────────
  generate(p) {
    const days = Math.max(2, Math.min(6, Number(p.days) || 3));
    const order = this.split(days, p.level, this.have(p));
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
      // 이름은 '푸시·풀' 같은 분할 이름 대신 실제 부위로 — 무엇을 하는 날인지 바로 보이게
      return { name: this.partLabel(out) || nm, exercises: out };
    });
    // 같은 부위 이름이 둘이면 '가슴·삼두 2' 처럼 번호
    const cnt = {}; routines.forEach(r => { cnt[r.name] = (cnt[r.name] || 0) + 1; if (cnt[r.name] > 1) r.name += ' ' + cnt[r.name]; });
    return { routines, weekdays: this.WEEKDAYS[days] || this.WEEKDAYS[3] };
  },

  // 운동 목록 → '가슴·어깨·삼두' 같은 부위 이름 (많이 나온 순, 최대 3개)
  partLabel(exs) {
    const cnt = {};
    for (const e of exs || []) { const pt = e.slot ? this.PART_OF[e.slot] : this.partOf(e.name); if (pt) cnt[pt] = (cnt[pt] || 0) + 1; }
    const order = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
    if (order.length >= 4 && order.includes('하체') && order.some(x => ['가슴', '등', '어깨'].includes(x))) return '전신';
    return order.slice(0, 3).join('·');
  },
  // ── 오늘 부위 바꾸기 ─────────────────────
  // 자동 플랜이 '하체' 인 날에 가슴을 하고 싶을 때, 루틴을 통째로 다시 만들지 않고 그날만 부위로 다시 뽑는다.
  // 고른 부위들의 동작 칸을 번갈아 채우고, 기구·아픈 곳·뺀 운동 규칙은 맞춤 플랜과 같다.
  PART_SLOTS: {
    '가슴': ['hpush', 'incline', 'fly', 'hpush', 'incline'],
    '등':   ['vpull', 'hrow', 'row2', 'rear'],
    '하체': ['squat', 'hinge', 'lunge', 'quad', 'ham', 'calf'],
    '어깨': ['vpush', 'lateral', 'rear', 'lateral'],
    '팔':   ['biceps', 'triceps', 'hammer', 'triceps'],
    '복근': ['core', 'core', 'core'],
    '전신': ['squat', 'hpush', 'hrow', 'vpush', 'hinge', 'core'],   // 큰 동작을 부위마다 하나씩
  },
  CARDIO: ['트레드밀 러닝', '인클라인 트레드밀 러닝', '싸이클', '로잉 머신', '엘립티컬 머신', '스텝 밀', '걷기', '줄넘기'],
  // 운동 이름들 → 그날 한 부위 이름. 고른 운동만 보고 판단한다(유산소·스포츠는 따로 붙인다).
  //   예: 벤치·인클라인·푸쉬다운 → '가슴·팔' · 스쿼트·벤치·로우·프레스 → '전신' · 러닝 → '유산소'
  dayLabel(names) {
    const cnt = {}; let cardio = 0, sport = 0;
    (names || []).forEach(n => {
      let pt = this.partOf(n); if (!pt) return;
      if (pt === '유산소') { cardio++; return; }
      if (pt === '스포츠') { sport++; return; }
      if (/이두|삼두|전완근/.test(pt)) pt = '팔';
      cnt[pt] = (cnt[pt] || 0) + 1;
    });
    const order = Object.keys(cnt).filter(x => x !== '전신').sort((a, b) => cnt[b] - cnt[a]);
    const upper = order.filter(x => ['가슴', '등', '어깨'].includes(x)).length;
    let main = (cnt['전신'] >= 2 || (order.length >= 4 && order.includes('하체') && upper >= 2)) ? ['전신'] : order.slice(0, 3);
    if (!main.length && cnt['전신']) main = ['전신'];
    if (sport) main.push('스포츠');
    if (cardio) main.push('유산소');
    return main.join('·');
  },
  dayFor(parts, n) {
    // 유산소는 시간 운동이라 따로: 유산소만 고르면 유산소 두 가지, 다른 부위와 함께면 끝에 하나
    if (parts.includes('유산소')) {
      const rest = parts.filter(x => x !== '유산소');
      const cardio = this.CARDIO.filter(x => this.pickerOk ? this.pickerOk(x) : true);
      const pick = (cardio.length ? cardio : this.CARDIO);
      if (!rest.length) return [{ name: pick[0], sets: '30분' }, { name: pick.find(x => x.split(' ').pop() !== pick[0].split(' ').pop()) || pick[1] || pick[0], sets: '15분' }];
      const base = this.dayFor(rest, n ? n - 1 : undefined);
      return base.concat([{ name: pick[0], sets: '20분' }]);
    }
    const p = this.profile() || { goal: 'muscle', level: 'beg', mins: 60 };
    n = n || Math.max(4, (this.COUNT[p.mins] || 5) - (p.level === 'new' ? 1 : 0));
    const [mainSet, accSet] = this.SETS[p.goal] || this.SETS.muscle;
    const banSlots = new Set((p.injury || []).flatMap(k => (this.INJURY[k] || {}).slots || []));
    const lists = parts.map(pt => (this.PART_SLOTS[pt] || []).filter(sl => !banSlots.has(sl)));
    const order = [];   // 부위를 번갈아: 가슴1, 삼두1, 가슴2 …
    for (let i = 0; order.length < 40 && lists.some(l => l[i]); i++) lists.forEach(l => { if (l[i]) order.push(l[i]); });
    const used = new Set(), out = [];
    for (const sl of order) {
      if (out.length >= n) break;
      const pool = (this.POOL[sl] || []).filter(x => !used.has(x));
      const name = pool.find(x => this.allowed(x, p)) || pool.find(x => this.pickerOk(x));
      if (!name) continue;
      used.add(name);
      out.push({ name, sets: out.length < 2 && p.goal !== 'lose' ? mainSet : accSet });
    }
    return out;
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
    ['days', '일주일에 몇 번', [[2, '2회'], [3, '3회'], [4, '4회'], [5, '5회'], [6, '6회']]],
    ['mins', '한 번에 몇 분', [[30, '30분'], [45, '45분'], [60, '60분'], [75, '75분+']]],
  ],
  open() {
    const p = this.profile() || { goal: 'muscle', level: 'beg', loc: 'gym', days: 3, mins: 60, equip: ['dumbbell'], focus: [], cardio: false, injury: [], exclude: [] };
    this._p = JSON.parse(JSON.stringify(p));
    App.openModal('@dumbbell 맞춤 운동 플랜', `<div class="fz fz-pg"><div id="pgBody" class="pg"></div>
      <div class="modal-btns">
        <button class="btn-sm accent" onclick="PlanGen.make()">플랜 만들기</button>
        <button class="btn-sm" onclick="PlanGen.aiMake()">AI 로 만들기</button>
        <button class="btn-sm" onclick="App.closeModal()">취소</button>
      </div></div>`);
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
    if (!p.places) { p.places = this.places(p); p.place = p.places[0].id; }
    const pl = this.place(p);
    h += row('운동 장소', p.places.map(x => `<button type="button" class="pg-c${x.id === pl.id ? ' on' : ''}" onclick="PlanGen._pickPlace('${x.id}')">${esc(x.name)}</button>`).join('')
      + `<button type="button" class="pg-c pg-add" onclick="PlanGen._addPlace()">+ 장소</button>`, '헬스장을 여러 곳 다니면 장소마다 기구를 따로 정해 둡니다');
    h += row(`보유 운동기구 · ${esc(pl.name)}`, this.EQUIP.map(([e, l]) => `<button type="button" class="pg-c${(pl.equip || []).includes(e) ? ' on' : ''}" onclick="PlanGen._togglePlaceEq('${e}')">${l}</button>`).join(''), '없는 기구는 눌러서 끕니다 · 맨몸 운동은 늘 들어갑니다');
    h += row('더 키우고 싶은 부위', ['가슴', '등', '어깨', '하체', '이두', '삼두', '복근'].map(x => this._chip('focus', x, x, true)).join(''), '선택 · 최대 2개 권장');
    h += row('유산소', this._chip('cardio', true, '쉬는 날에 넣기') + this._chip('cardio', false, '넣지 않기'));
    h += row('아픈 곳', [['shoulder', '어깨'], ['back', '허리'], ['knee', '무릎'], ['wrist', '손목']].map(([v, l]) => this._chip('injury', v, l, true)).join(''), '그 부위에 부담이 큰 동작을 뺍니다');
    h += row('추천하지 않을 기구', this.EQUIP.map(([e, l]) => this._chip('exclude', e, l, true)).join(''), '있어도 쓰기 싫은 기구 — 플랜·교체·추가 목록에서 뺍니다');
    const plan = this.generate(p);
    h += `<div class="pg-prev"><div class="pg-t">미리 보기<small><span class="num">${esc((this.SETS[p.goal] || this.SETS.muscle).join(' / '))}</span> · 종목 <span class="num">${plan.routines[0]?.exercises.length || 0}</span>개 · 쉬는 날 ${p.cardio ? '가벼운 유산소' : '휴식'}</small></div>${plan.routines.map((r, i) => `
      <div class="pg-day"><em>${['일', '월', '화', '수', '목', '금', '토'][plan.weekdays[i]]}</em><div><b>${esc(r.name)}</b>
        <span>${r.exercises.map(x => esc(x.name)).join(' · ') || '가능한 운동이 없습니다 — 기구를 더 골라 주세요'}</span></div></div>`).join('')}</div>`;
    b.innerHTML = h;
  },
  _pickPlace(id) { this._p.place = id; this._paint(); },
  _addPlace() {
    const name = prompt('운동 장소 이름 (예: 회사 헬스장, 집)'); if (!name || !name.trim()) return;
    const id = 'pl_' + Date.now().toString(36);
    this._p.places = (this._p.places || this.places(this._p)).concat({ id, name: name.trim().slice(0, 20), equip: this.ALL_EQUIP.slice(), v2: 1 });
    this._p.place = id; this._paint();
  },
  _togglePlaceEq(e) {
    const pl = this._p.places.find(x => x.id === this._p.place) || this._p.places[0];
    pl.equip = (pl.equip || []).includes(e) ? pl.equip.filter(x => x !== e) : (pl.equip || []).concat(e);
    this._paint();
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
    if (!JARVIS._getKey()) { JARVIS.needKey('AI 키가 필요합니다 — 무료 키로 바로 만들 수 있습니다'); return; }
    const base = this.generate(p);
    const allowed = Object.entries(EX_DB).filter(([k]) => k !== '스포츠' && k !== '내 운동').flatMap(([, v]) => v).filter(n => this.allowed(n, p));
    const logs = this.recentLogs();
    App.showToast('AI 가 플랜을 짜는 중…');
    const prompt = `당신은 근력 운동 코치입니다. 아래 조건과 지난 기록으로 주간 루틴을 짜 주세요.
조건: ${JSON.stringify({ 목표: p.goal, 경력: p.level, 장소: this.place(p).name, 기구: this.have(p), 주당: p.days, 분: p.mins, 집중: p.focus, 아픈곳: p.injury })}
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
  saveLog(ds, L) { UserStore.set(this.LOG_PREFIX + ds, JSON.stringify(L)); window.FirebaseSync?.scheduleSave?.(); if (window.VolTier) VolTier._c = null; },   // 들어 올린 무게 1분 기억도 비운다
  // 이 운동의 가장 최근 기록(오늘 이전)
  // 120일을 거슬러 찾는다 — 운동 줄마다 불리므로 날짜별 기록은 읽기 전용 캐시로 읽는다
  last(name, beforeDs) {
    for (let i = 1; i <= 120; i++) {
      const d = new Date(beforeDs + 'T00:00:00'); d.setDate(d.getDate() - i);
      const L = UserStore.json(this.LOG_PREFIX + Fitness._dateStr(d), null) || {};
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
    const nx = this.nextWeight(name, sets, ds);
    const ic = (n, c) => typeof ExMedia !== 'undefined' && ExMedia.ic ? ExMedia.ic(n, c) : '';
    App.openModal('@dumbbell ' + name, `<div class="fz fz-lg">
      ${prev ? `<div class="lg-sum">
        <div class="lg-sum-i"><span>지난번 · <span class="num">${prev.ds.slice(5).replace('-', '/')}</span></span><b class="num">${prev.sets.map(s => `${s.w || 0}×${s.r || 0}`).join('  ')}</b></div>
        ${nx != null ? `<div class="lg-sum-i lg-next"><span>오늘 권장</span><b class="num">${nx}<small>kg</small></b></div>` : ''}
      </div>` : `<p class="fz-note">처음 기록입니다. 2~3회 더 할 수 있는 무게로 시작하세요.</p>`}
      <div class="lg-head"><span>세트</span><span>무게 kg</span><span></span><span>횟수</span></div>
      <div id="lgRows" class="lg-rows">${Array.from({ length: n }, (_, i) => this._lgRow(i, cur[i])).join('')}</div>
      <button class="fz-act" onclick="PlanGen._lgAdd()">${ic('plus')}<span>세트 추가</span></button>
      <p class="lg-hint">세트를 왼쪽으로 밀면 삭제</p>
      <details class="lg-hist"><summary>지난 기록 · 그래프${ic('down', 'fz-ic-end')}</summary><div class="wh">${typeof WorkoutHistory!=='undefined' ? WorkoutHistory.html(name) : ''}</div></details>
      <div class="modal-btns"><button class="btn-sm accent" onclick="PlanGen._lgSave()">저장</button><button class="btn-sm" onclick="App.closeModal()">취소</button></div></div>`);
    this._lgBind();
  },
  _lgRow(i, s) {
    s = s || {};
    return `<div class="lg-sw"><div class="lg-row"><span class="lg-n num">${i + 1}</span>
      <input class="inp inp-sm lg-w num" readonly inputmode="none" placeholder="–" aria-label="${i + 1}세트 무게 kg" value="${s.w ?? ''}" onclick="PlanGen._lgPick(this,'w')">
      <span class="lg-x">×</span><input class="inp inp-sm lg-r num" readonly inputmode="none" placeholder="–" aria-label="${i + 1}세트 횟수" value="${s.r ?? ''}" onclick="PlanGen._lgPick(this,'r')"></div><button type="button" class="lg-del" onclick="PlanGen._lgDel(this)">삭제</button></div>`;
  },
  // 세트 줄을 왼쪽으로 밀면 '삭제' 가 나온다(운동 모드와 같은 방식). 민 그 세트를 지우고 번호를 다시 매긴다.
  _lgBind() {
    document.querySelectorAll('#lgRows .lg-sw').forEach(w => {
      if (w._b) return; w._b = 1;
      const row = w.querySelector('.lg-row'); w.classList.remove('open'); row.style.transform = '';
      let sx = 0, sy = 0, dx = 0, on = false;
      row.addEventListener('touchstart', e => {
        document.querySelectorAll('#lgRows .lg-sw.open').forEach(o => { if (o !== w) { o.classList.remove('open'); o.querySelector('.lg-row').style.transform = ''; } });
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; on = false;
      }, { passive: true });
      row.addEventListener('touchmove', e => {
        const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
        if (!on && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) on = true;
        if (!on) return;
        e.preventDefault(); w.classList.add('sw'); dx = Math.min(0, Math.max(-96, mx + (w.classList.contains('open') ? -72 : 0))); row.style.transform = `translateX(${dx}px)`;
      }, { passive: false });
      row.addEventListener('touchend', () => {
        if (!on) return;
        w.classList.remove('sw');
        if (dx < -40) { w.classList.add('open'); row.style.transform = 'translateX(-72px)'; } else { w.classList.remove('open'); row.style.transform = ''; }
      });
    });
  },
  _lgDel(btn) {
    btn.closest('.lg-sw')?.remove();
    try { Haptic.light(); } catch (e) {}
    document.querySelectorAll('#lgRows .lg-sw').forEach((w, i) => {
      w.querySelector('.lg-n').textContent = i + 1;
      w.querySelector('.lg-w').setAttribute('aria-label', `${i + 1}세트 무게 kg`); w.querySelector('.lg-r').setAttribute('aria-label', `${i + 1}세트 횟수`);
    });
  },
  // 기록 창의 무게·횟수도 운동 모드처럼 숫자 휠로. 고른 값은 아래 줄(빈 칸·같은 값)에도 채운다.
  _lgPick(el, f) {
    const rows = [...document.querySelectorAll('#lgRows .lg-row')], k = rows.indexOf(el.closest('.lg-row'));
    const cur = Number(el.value) || 0, cls = f === 'w' ? '.lg-w' : '.lg-r';
    const html = document.getElementById('modalBody').innerHTML, title = document.getElementById('modalTitle').textContent;
    const back = (v) => {
      App.openModal('@dumbbell ' + title.trim(), html); this._lgBind();
      const rs = [...document.querySelectorAll('#lgRows .lg-row')];
      for (let j = k; j < rs.length; j++) { const inp = rs[j].querySelector(cls); if (j === k || !inp.value || inp.value === el.value) { inp.value = v; inp.setAttribute('value', v); } }
    };
    const cancel = () => { App.openModal('@dumbbell ' + title.trim(), html); this._lgBind(); };
    const W = typeof Wheel !== 'undefined' ? Wheel : null; if (!W) return;
    if (f === 'w') W.open({ title: `${k + 1}세트 무게`, unit: 'kg', cols: [{ vals: Array.from({ length: 301 }, (_, i) => i), cur: Math.floor(cur) }, { vals: [0, 0.5], cur: cur % 1 >= 0.5 ? 0.5 : 0, fmt: v => v ? '.5' : '.0' }], done: ([a, b]) => back(a + b), cancel });
    else W.open({ title: `${k + 1}세트 횟수`, unit: '회', cols: [{ vals: Array.from({ length: 61 }, (_, i) => i), cur: cur || 10 }], done: ([a]) => back(a), cancel });
  },
  _lgAdd() { const b = document.getElementById('lgRows'); if (b) { b.insertAdjacentHTML('beforeend', this._lgRow(b.children.length)); this._lgBind(); } },
  _lgSave() {
    const { name, ds } = this._lg || {}; if (!name) return;
    const sets = [...document.querySelectorAll('#lgRows .lg-row')].map(r => ({ w: Number(r.querySelector('.lg-w').value) || 0, r: Number(r.querySelector('.lg-r').value) || 0 })).filter(s => s.r > 0);
    const L = this.log(ds); if (sets.length) L[name] = sets; else delete L[name];
    this.saveLog(ds, L);
    // 기록을 적으면 그 운동을 체크한다(체크한 운동만 들어 올린 무게에 들어간다). 기록을 지우면 체크도 푼다.
    try { const d = new Date(ds + 'T00:00:00'), list = Fitness.exercisesFor(d).list, i = list.findIndex(x => x.name === name), chk = Fitness._checked(d);
      if (i >= 0) { const k = chk.indexOf(i); if (sets.length && k < 0) chk.push(i); if (!sets.length && k >= 0) chk.splice(k, 1); Fitness._save(chk, d); } } catch (e) {}
    App.closeModal();
    try { Fitness.render(new Date(ds + 'T00:00:00')); } catch (e) {}
    const vw = sets.length && typeof VolTier !== 'undefined' ? VolTier.warn(name, sets, ds) : '';
    App.showToast(sets.length ? `${sets.length}세트 기록됨${vw ? ' · ' + vw : ''}` : '기록을 지웠습니다', vw ? '' : 'success');
  },

  // ── 운동 교체 ───────────────────────────
  // 이름 → 자극 부위. 목록에 없는 이름(홈트 플랜·직접 쓴 이름)도 낱말로 짐작한다.
  partOf(name) {
    const n = String(name || '');
    const my = typeof Fitness !== 'undefined' && Fitness.myPart ? Fitness.myPart(n) : null;   // 직접 만든 운동은 고른 종류 그대로
    if (my) return my;
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
  // 시간으로 하는 운동(유산소·스포츠) — 세트·무게 대신 '몇 분'
  timed(name) { return ['유산소', '스포츠'].includes(this.partOf(name)); },
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
    const bans = this.bans();
    const uniq = [...new Set(cands)].filter(n => n !== name && !bans.includes(n));
    const ok = uniq.filter(n => this.allowed(n, p)).map(n => ({ n, need: false }));
    const more = ok.length >= 6 ? [] : uniq.filter(n => !this.allowed(n, p)).slice(0, 8 - ok.length).map(n => ({ n, need: true }));
    return ok.slice(0, 12).concat(more);
  },
  openSwap(idx, name, ds, rid) {
    this._sw = { idx, name, ds, rid };
    const alts = this.alternatives(name);
    App.openModal('@dumbbell 운동 교체', `<div class="fz fz-sw">
      <p class="fz-note"><b>${esc(name)}</b> 대신 할 운동입니다. 같은 동작, 가진 기구로 하는 것부터 보여 드립니다.</p>
      <div class="sw-list">${alts.map((a, i) => {
        const th = typeof ExMedia !== 'undefined' ? ExMedia.thumbFor(a.n) : '';
        const eq = (this.EQUIP.find(([e]) => e === this.equipOf(a.n)) || [])[1];
        return `<button class="sw-row" onclick="PlanGen._swap(${i})">${th ? `<span class="ex-th">${ExMedia.poseHtml(th)}</span>` : `<span class="ex-th none">${typeof Icons !== 'undefined' ? Icons.svg('dumbbell') : ''}</span>`}<span class="sw-nm">${esc(a.n)}${a.need ? `<small>${esc(eq || '기구')} 필요</small>` : ''}</span></button>`;
      }).join('') || `<p class="pg-note">이 운동의 자극 부위를 알 수 없어 추천을 못 했습니다. '+ 운동 추가' 에서 직접 골라 주세요.</p>`}</div>
      <label class="sw-ban"><input type="checkbox" id="swBan"> '${esc(name)}' 은(는) 앞으로 추천하지 않기</label>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div></div>`);
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
