// js/home-plan.js — 홈트레이닝 3일 분할 플랜 (모달 뷰)
// 장비: 인클라인 벤치, 가변 덤벨 24kg×2, 문틀 철봉, 어시스트 밴드(14kg×8), DIY 케이블, 요가 매트
// 기준: 77.4kg / 골격근 36.2kg / 체지방 18.4% / 커팅 중

const HomePlan = {
  IMG: [
    'img/home-workout/ex00_incline_db_press.png',
    'img/home-workout/ex01_flat_db_press.png',
    'img/home-workout/ex02_incline_db_fly.png',
    'img/home-workout/ex03_shoulder_press.png',
    'img/home-workout/ex04_lateral_raise.png',
    'img/home-workout/ex05_cable_pushdown.png',
    'img/home-workout/ex06_decline_pushup.png',
    'img/home-workout/ex07_band_pullup.png',
    'img/home-workout/ex08_onearm_row.png',
    'img/home-workout/ex09_lat_pulldown.png',
    'img/home-workout/ex10_face_pull.png',
    'img/home-workout/ex11_incline_curl.png',
    'img/home-workout/ex12_hammer_curl.png',
    'img/home-workout/ex13_goblet_squat.png',
    'img/home-workout/ex14_romanian_dl.png',
    'img/home-workout/ex15_bulgarian_split.png',
    'img/home-workout/ex16_calf_raise.png',
    'img/home-workout/ex17_hanging_knee.png',
    'img/home-workout/ex18_russian_twist.png',
    'img/home-workout/ex19_plank.png'
  ],

  // ═══ 운동 데이터 ═══
  // routine: [{w:'중량', r:'횟수', rest:'휴식'}]
  EX: [
    // ─── DAY A — 푸시 (가슴·어깨·삼두) ───
    [
      {n:'인클라인 덤벨 프레스', e:'Incline Dumbbell Press', img:0,
       target:'가슴 상부 · 전면 삼각근',
       routine:[
         {w:'14kg×2', r:'12회', rest:'90초'},
         {w:'16kg×2', r:'10회', rest:'90초'},
         {w:'16kg×2', r:'10회', rest:'90초'},
         {w:'18kg×2', r:'8회',  rest:'-'}
       ],
       tip:'벤치 30~40도. 내리는 동작 3초, 가슴 상부 수축 시 1초 정지.',
       alt:['플로어 프레스','푸시업'],
       yt:{ko:'인클라인 덤벨 프레스 자세',en:'incline dumbbell press form'}},

      {n:'덤벨 플랫 프레스', e:'Dumbbell Flat Bench Press', img:1,
       target:'가슴 중부 · 삼두',
       routine:[
         {w:'16kg×2', r:'12회', rest:'90초'},
         {w:'18kg×2', r:'10회', rest:'90초'},
         {w:'20kg×2', r:'8회',  rest:'90초'},
         {w:'20kg×2', r:'8회',  rest:'-'}
       ],
       tip:'가슴 넓이까지 내린 후 폭발적으로 밀어올리기. 락아웃 직전 멈추면 텐션 유지.',
       alt:['와이드 푸시업','스퀴즈 프레스'],
       yt:{ko:'덤벨 플랫 벤치프레스 자세',en:'dumbbell flat bench press form'}},

      {n:'인클라인 덤벨 플라이', e:'Incline Dumbbell Fly', img:2,
       target:'가슴 상부 안쪽',
       routine:[
         {w:'8kg×2',  r:'15회', rest:'60초'},
         {w:'10kg×2', r:'12회', rest:'60초'},
         {w:'10kg×2', r:'12회', rest:'-'}
       ],
       tip:'팔꿈치 살짝 굽힌 채 넓게 벌리고, 수축 시 1초 정지. 가슴이 늘어나는 느낌에 집중.',
       alt:['케이블 크로스오버','밴드 체스트 플라이'],
       yt:{ko:'인클라인 덤벨 플라이 자세',en:'incline dumbbell fly form'}},

      {n:'덤벨 숄더 프레스', e:'Seated DB Shoulder Press', img:3,
       target:'전면 삼각근 · 측면 삼각근',
       routine:[
         {w:'12kg×2', r:'10회', rest:'90초'},
         {w:'14kg×2', r:'8회',  rest:'90초'},
         {w:'14kg×2', r:'8회',  rest:'90초'},
         {w:'12kg×2', r:'10회', rest:'-'}
       ],
       tip:'벤치 80~85도. 팔꿈치가 어깨 높이에서 시작, 정수리 위까지. 마지막 세트는 백오프.',
       alt:['아놀드 프레스','밴드 숄더 프레스'],
       yt:{ko:'덤벨 숄더 프레스 자세',en:'seated dumbbell shoulder press form'}},

      {n:'덤벨 레터럴 레이즈', e:'Dumbbell Lateral Raise', img:4,
       target:'측면 삼각근',
       routine:[
         {w:'5kg×2', r:'20회', rest:'45초'},
         {w:'6kg×2', r:'15회', rest:'45초'},
         {w:'7kg×2', r:'12회', rest:'45초'},
         {w:'5kg×2', r:'20회 (드랍)', rest:'-'}
       ],
       tip:'새끼손가락 쪽이 위로, 승모근 개입 최소화. 마지막 세트 드랍셋으로 마무리.',
       alt:['케이블 레터럴','밴드 레터럴'],
       yt:{ko:'레터럴 레이즈 자세',en:'lateral raise proper form'}},

      {n:'케이블 푸시다운', e:'Cable Pushdown (DIY)', img:5,
       target:'삼두 전체',
       routine:[
         {w:'10kg', r:'15회', rest:'60초'},
         {w:'12kg', r:'12회', rest:'60초'},
         {w:'14kg', r:'10회', rest:'-'}
       ],
       tip:'팔꿈치 몸통에 고정, 전완만 움직여 완전 수축. 도르래 마찰 감안해서 체감 중량 +20%.',
       alt:['오버헤드 DB 익스텐션','다이아몬드 푸시업'],
       yt:{ko:'케이블 푸시다운 삼두운동',en:'cable tricep pushdown form'}},

      {n:'디클라인 푸시업', e:'Decline Push-up (Finisher)', img:6,
       target:'가슴 상부 · 삼두',
       routine:[
         {w:'맨몸', r:'MAX', rest:'60초'},
         {w:'맨몸', r:'MAX', rest:'-'}
       ],
       tip:'벤치에 발 올려 각도 ↑, 가슴 상부 탈진 마무리. 반복 수 기록해두고 매주 비교.',
       alt:['일반 푸시업 MAX','닐링 푸시업'],
       yt:{ko:'디클라인 푸시업 자세',en:'decline push up form'}}
    ],

    // ─── DAY B — 풀 (등·이두) ───
    [
      {n:'밴드 어시스트 풀업', e:'Band-Assisted Pull-up', img:7,
       target:'광배근 · 이두',
       routine:[
         {w:'밴드 2개 (28kg 보조)', r:'8회', rest:'120초'},
         {w:'밴드 2개 (28kg 보조)', r:'6회', rest:'120초'},
         {w:'밴드 2개 (28kg 보조)', r:'6회', rest:'120초'},
         {w:'밴드 1개 (14kg 보조)', r:'4회', rest:'-'}
       ],
       tip:'데드행에서 시작 → 팔꿈치를 허리 쪽으로 당기기. 내릴 때 3초 네거티브. 매주 밴드 줄이기 목표.',
       alt:['네거티브 풀업','인버티드 로우'],
       yt:{ko:'밴드 어시스트 풀업 자세',en:'band assisted pull up form'}},

      {n:'원암 덤벨 로우', e:'One-Arm Dumbbell Row', img:8,
       target:'광배근 · 능형근',
       routine:[
         {w:'18kg', r:'12회 (각)', rest:'90초'},
         {w:'20kg', r:'10회 (각)', rest:'90초'},
         {w:'22kg', r:'8회 (각)',  rest:'90초'},
         {w:'22kg', r:'8회 (각)',  rest:'-'}
       ],
       tip:'벤치에 한 손+한 무릎 지지, 팔꿈치를 엉덩이 쪽으로. 등이 당기는 느낌에 집중.',
       alt:['양손 벤트오버 로우','밴드 시티드 로우'],
       yt:{ko:'원암 덤벨 로우 등운동',en:'one arm dumbbell row form'}},

      {n:'케이블 랫 풀다운', e:'Cable Lat Pulldown (DIY)', img:9,
       target:'광배근 · 대원근',
       routine:[
         {w:'14kg', r:'12회', rest:'90초'},
         {w:'16kg', r:'10회', rest:'90초'},
         {w:'16kg', r:'10회', rest:'-'}
       ],
       tip:'무릎 꿇고, 바를 쇄골 아래까지 당기며 견갑골 수축. 도르래 마찰 감안.',
       alt:['밴드 랫 풀다운','덤벨 풀오버'],
       yt:{ko:'랫 풀다운 자세',en:'lat pulldown proper form'}},

      {n:'페이스풀', e:'Face Pull (Band/Cable)', img:10,
       target:'후면 삼각근 · 승모근 하부',
       routine:[
         {w:'밴드 1개 or 8kg', r:'20회', rest:'45초'},
         {w:'밴드 1개 or 10kg',r:'15회', rest:'45초'},
         {w:'밴드 1개 or 10kg',r:'15회', rest:'45초'},
         {w:'밴드 1개 or 8kg', r:'15회', rest:'-'}
       ],
       tip:'귀 옆까지 당기며 외회전, 자세교정 필수! 라운드숄더 예방에 핵심 운동.',
       alt:['벤트오버 리어 델트 레이즈','리버스 플라이'],
       yt:{ko:'페이스풀 자세 후면삼각근',en:'face pull band form tutorial'}},

      {n:'인클라인 덤벨 컬', e:'Incline Dumbbell Curl', img:11,
       target:'이두 장두',
       routine:[
         {w:'8kg×2',  r:'12회', rest:'60초'},
         {w:'10kg×2', r:'10회', rest:'60초'},
         {w:'10kg×2', r:'10회 → 6kg 드랍', rest:'-'}
       ],
       tip:'벤치 45도. 팔이 뒤로 빠져 이두 장두 스트레치 극대화. 마지막 세트 드랍셋.',
       alt:['해머 컬','컨센트레이션 컬'],
       yt:{ko:'인클라인 덤벨 컬 이두운동',en:'incline dumbbell curl form'}},

      {n:'해머 컬', e:'Hammer Curl', img:12,
       target:'상완근 · 전완근',
       routine:[
         {w:'10kg×2', r:'12회', rest:'60초'},
         {w:'12kg×2', r:'10회', rest:'60초'},
         {w:'12kg×2', r:'10회', rest:'-'}
       ],
       tip:'뉴트럴 그립(덤벨 세로)으로 컬, 팔 두께 발달. 팔꿈치 완전 고정.',
       alt:['리버스 컬','밴드 해머 컬'],
       yt:{ko:'해머 컬 자세',en:'hammer curl proper form'}}
    ],

    // ─── DAY C — 하체 + 코어 ───
    [
      {n:'덤벨 고블렛 스쿼트', e:'Dumbbell Goblet Squat', img:13,
       target:'대퇴사두 · 둔근',
       routine:[
         {w:'20kg', r:'12회', rest:'90초'},
         {w:'22kg', r:'10회', rest:'90초'},
         {w:'24kg', r:'10회', rest:'90초'},
         {w:'24kg', r:'8회',  rest:'-'}
       ],
       tip:'덤벨 1개를 가슴 앞에 들고. 엉덩이를 뒤로 빼며 대퇴부가 바닥과 평행할 때까지.',
       alt:['덤벨 스모 스쿼트','밴드 스쿼트'],
       yt:{ko:'고블렛 스쿼트 자세',en:'goblet squat dumbbell form'}},

      {n:'덤벨 루마니안 데드리프트', e:'Dumbbell Romanian Deadlift', img:14,
       target:'햄스트링 · 둔근 · 기립근',
       routine:[
         {w:'16kg×2', r:'12회', rest:'90초'},
         {w:'18kg×2', r:'10회', rest:'90초'},
         {w:'20kg×2', r:'10회', rest:'90초'},
         {w:'20kg×2', r:'10회', rest:'-'}
       ],
       tip:'무릎 살짝 굽힌 채 엉덩이를 뒤로 빼며 내리기. 햄스트링 스트레치 느낄 때까지 내림.',
       alt:['싱글레그 RDL','굿모닝'],
       yt:{ko:'루마니안 데드리프트 덤벨',en:'dumbbell romanian deadlift form'}},

      {n:'불가리안 스플릿 스쿼트', e:'Bulgarian Split Squat', img:15,
       target:'대퇴사두 · 둔근',
       routine:[
         {w:'맨몸',    r:'12회 (각)', rest:'90초'},
         {w:'8kg×2',  r:'10회 (각)', rest:'90초'},
         {w:'10kg×2', r:'10회 (각)', rest:'-'}
       ],
       tip:'뒷발 벤치에 올리고 앞다리 무릎 90도까지. 상체 살짝 앞으로 기울이면 둔근 자극 ↑.',
       alt:['덤벨 런지','스텝업'],
       yt:{ko:'불가리안 스플릿 스쿼트',en:'bulgarian split squat form'}},

      {n:'덤벨 카프 레이즈', e:'Standing Calf Raise', img:16,
       target:'비복근 · 가자미근',
       routine:[
         {w:'20kg×2', r:'20회', rest:'45초'},
         {w:'22kg×2', r:'15회', rest:'45초'},
         {w:'24kg×2', r:'15회', rest:'-'}
       ],
       tip:'발 앞부분만 올리고 최고점에서 2초 수축. 종아리는 고반복이 핵심.',
       alt:['시티드 카프 레이즈','싱글 레그 카프'],
       yt:{ko:'카프 레이즈 종아리 운동',en:'standing calf raise dumbbell form'}},

      {n:'행잉 니 레이즈', e:'Hanging Knee Raise', img:17,
       target:'하복부 · 장요근',
       routine:[
         {w:'맨몸', r:'15회', rest:'60초'},
         {w:'맨몸', r:'12회', rest:'60초'},
         {w:'맨몸', r:'12회', rest:'-'}
       ],
       tip:'철봉에 매달려 반동 없이 무릎을 가슴까지. 내릴 때 천천히 3초.',
       alt:['라잉 레그 레이즈','리버스 크런치'],
       yt:{ko:'행잉 니 레이즈 하복부',en:'hanging knee raise form'}},

      {n:'덤벨 러시안 트위스트', e:'Dumbbell Russian Twist', img:18,
       target:'복사근 · 코어 전체',
       routine:[
         {w:'6kg',  r:'20회 (좌우10)', rest:'45초'},
         {w:'8kg',  r:'16회 (좌우8)',  rest:'45초'},
         {w:'8kg',  r:'16회 (좌우8)',  rest:'-'}
       ],
       tip:'덤벨 1개, 발 들고 V자 유지, 좌우 천천히 회전. 배에 힘 유지.',
       alt:['바이시클 크런치','사이드 플랭크'],
       yt:{ko:'러시안 트위스트 복근운동',en:'russian twist dumbbell form'}},

      {n:'플랭크', e:'Plank (Finisher)', img:19,
       target:'코어 전체',
       routine:[
         {w:'맨몸', r:'45초', rest:'30초'},
         {w:'맨몸', r:'45초', rest:'30초'},
         {w:'맨몸', r:'45초', rest:'-'}
       ],
       tip:'엉덩이 처지거나 올라가지 않게 일직선 유지. 호흡 멈추지 않기.',
       alt:['사이드 플랭크 좌우 30초','데드버그'],
       yt:{ko:'플랭크 자세 코어 운동',en:'plank proper form core'}}
    ]
  ],

  DAY_LABELS: [
    {name:'DAY A', sub:'푸시', desc:'가슴 · 어깨 · 삼두 — 미는 동작 중심 (약 50분)', color:'#3b82f6'},
    {name:'DAY B', sub:'풀',  desc:'등 · 후면어깨 · 이두 — 당기는 동작 중심 (약 50분)', color:'#8b5cf6'},
    {name:'DAY C', sub:'하체+코어', desc:'하체 · 코어 — 큰 근육군 + 체지방 연소 (약 55분)', color:'#059669'}
  ],

  TIPS: [
    '가슴 운동은 인클라인 → 플랫 → 플라이 순서로 상부 → 중부 → 안쪽을 공략합니다. 마지막 푸시업은 탈진 세트로 근지구력까지.',
    '풀업은 매주 밴드를 줄여나가는 것이 목표입니다. 등 운동의 핵심은 "팔꿈치를 주머니에 넣는다"는 느낌으로 당기는 것.',
    '하체는 큰 근육군이라 에너지 소모가 큽니다. 커팅 시 체지방 감소에 가장 효과적인 날이에요.'
  ],

  _tab: 0,
  _open: {},

  ytUrl(q) {
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  },

  toggle(dayIdx, exIdx) {
    const k = dayIdx + '-' + exIdx;
    this._open[k] = !this._open[k];
    this._render();
  },

  switchTab(n) {
    this._tab = n;
    this._render();
  },

  _routineTable(routine) {
    return `<table class="hp-routine-tbl">
      <thead><tr><th>세트</th><th>중량</th><th>횟수</th><th>휴식</th></tr></thead>
      <tbody>${routine.map((s, i) =>
        `<tr><td class="hp-set-num">${i + 1}</td><td class="hp-set-w">${esc(s.w)}</td><td class="hp-set-r">${esc(s.r)}</td><td class="hp-set-rest">${esc(s.rest)}</td></tr>`
      ).join('')}</tbody>
    </table>`;
  },

  _exCard(x, dayIdx, exIdx) {
    const isOpen = this._open[dayIdx + '-' + exIdx];
    const imgSrc = this.IMG[x.img] || '';
    const totalSets = x.routine.length;

    return `<div class="hp-ex ${isOpen ? 'hp-ex-open' : ''}">
      <div class="hp-ex-head" onclick="HomePlan.toggle(${dayIdx},${exIdx})">
        <div class="hp-ex-num">${exIdx + 1}</div>
        <div class="hp-ex-info">
          <div class="hp-ex-name">${esc(x.n)}</div>
          <div class="hp-ex-meta">${esc(x.target)} · ${totalSets}세트</div>
        </div>
        <svg class="hp-chev" viewBox="0 0 20 20" fill="currentColor"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
      </div>
      ${isOpen ? `<div class="hp-ex-detail">
        ${imgSrc ? `<div class="hp-img-wrap"><img src="${imgSrc}" alt="${esc(x.n)}" loading="lazy"></div>` : ''}
        ${this._routineTable(x.routine)}
        <div class="hp-tip-line">💡 ${esc(x.tip)}</div>
        <div class="hp-yt-section">
          <a class="hp-yt-btn" href="${this.ytUrl(x.yt.ko)}" target="_blank" rel="noopener">
            <span class="hp-yt-icon">▶</span> 🇰🇷 자세 영상
          </a>
          <a class="hp-yt-btn" href="${this.ytUrl(x.yt.en)}" target="_blank" rel="noopener">
            <span class="hp-yt-icon">▶</span> 🇺🇸 Form Guide
          </a>
        </div>
        <div class="hp-alt">
          <span class="hp-alt-title">대체:</span> ${x.alt.map(a => `<span class="hp-alt-chip">${esc(a)}</span>`).join('')}
        </div>
      </div>` : ''}
    </div>`;
  },

  _summaryRow(dayIdx) {
    const day = this.EX[dayIdx];
    const totalSets = day.reduce((a, x) => a + x.routine.length, 0);
    return `<div class="hp-summary">${day.length}종목 · ${totalSets}세트</div>`;
  },

  _scheduleHtml() {
    return `
      <div class="hp-schedule">
        <h3 class="hp-section-title">📅 주간 스케줄</h3>
        <div class="hp-week-grid">
          <div class="hp-day hp-day-on" style="border-color:#3b82f6"><span class="hp-day-d">월</span><span class="hp-day-t">DAY A<br>푸시</span></div>
          <div class="hp-day hp-day-off"><span class="hp-day-d">화</span><span class="hp-day-t">휴식<br>or Zone2</span></div>
          <div class="hp-day hp-day-on" style="border-color:#8b5cf6"><span class="hp-day-d">수</span><span class="hp-day-t">DAY B<br>풀</span></div>
          <div class="hp-day hp-day-off"><span class="hp-day-d">목</span><span class="hp-day-t">휴식<br>or Zone2</span></div>
          <div class="hp-day hp-day-on" style="border-color:#059669"><span class="hp-day-d">금</span><span class="hp-day-t">DAY C<br>하체+코어</span></div>
          <div class="hp-day hp-day-off"><span class="hp-day-d">토</span><span class="hp-day-t">유산소<br>30분</span></div>
          <div class="hp-day hp-day-off"><span class="hp-day-d">일</span><span class="hp-day-t">완전<br>휴식</span></div>
        </div>
      </div>

      <div class="hp-panel">
        <h3 class="hp-section-title">📈 점진적 과부하 (4주 단위)</h3>
        <ul class="hp-list">
          <li><strong>1~2주:</strong> 표시된 중량 그대로, 폼 완성에 집중. 마지막 세트 여유 있으면 OK.</li>
          <li><strong>3~4주:</strong> 각 운동 마지막 세트 +2회 추가 시도.</li>
          <li><strong>5~6주:</strong> 메인 종목(프레스·로우·스쿼트) 각 세트 +1kg 증량.</li>
          <li><strong>7~8주:</strong> 밴드 풀업 보조 줄이기 + 세트 수 1세트 추가 고려.</li>
        </ul>
      </div>

      <div class="hp-panel">
        <h3 class="hp-section-title">🔄 주 4일 확장 (8주 후)</h3>
        <ul class="hp-list">
          <li><strong>월:</strong> 가슴 + 삼두 (프레스 위주)</li>
          <li><strong>화:</strong> 등 + 이두 (풀업·로우 위주)</li>
          <li><strong>목:</strong> 어깨 + 팔 (숄더프레스·레이즈·컬)</li>
          <li><strong>금:</strong> 하체 + 코어</li>
        </ul>
      </div>

      <div class="hp-panel">
        <h3 class="hp-section-title">🎯 8주 목표</h3>
        <ul class="hp-list">
          <li>풀업 무보조 5회 이상</li>
          <li>푸시업 30회 이상</li>
          <li>인클라인 프레스 20kg×10회</li>
          <li>체지방 16%↓ (커팅 목표 13~14%)</li>
        </ul>
      </div>

      <div class="hp-panel">
        <h3 class="hp-section-title">⚙️ 내 장비</h3>
        <div class="hp-chips">
          <span class="hp-chip">인클라인 벤치</span>
          <span class="hp-chip">가변 덤벨 24kg×2</span>
          <span class="hp-chip">문틀 철봉</span>
          <span class="hp-chip">어시스트 밴드 ×8</span>
          <span class="hp-chip">DIY 케이블</span>
          <span class="hp-chip">요가 매트</span>
        </div>
      </div>

      <div class="hp-tip">
        💡 <strong>휴식일 유산소:</strong> 걷기 30~40분 (심박 120~130) 또는 Zone2 자전거. 격렬한 유산소는 피하고 회복 집중.
      </div>`;
  },

  _render() {
    const el = document.getElementById('homePlanBody');
    if (!el) return;

    const tabIdx = this._tab;

    const tabs = this.DAY_LABELS.map((d, i) =>
      `<button class="hp-tab${i === tabIdx ? ' hp-tab-on' : ''}" onclick="HomePlan.switchTab(${i})" ${i === tabIdx ? `style="border-bottom:3px solid ${d.color}"` : ''}>${d.name}<small>${d.sub}</small></button>`
    ).join('') + `<button class="hp-tab${tabIdx === 3 ? ' hp-tab-on' : ''}" onclick="HomePlan.switchTab(3)">📅<small>스케줄</small></button>`;

    let content = '';
    if (tabIdx < 3) {
      const day = this.EX[tabIdx];
      const label = this.DAY_LABELS[tabIdx];
      content = `<div class="hp-desc">${label.desc}</div>` +
        this._summaryRow(tabIdx) +
        day.map((x, i) => this._exCard(x, tabIdx, i)).join('') +
        `<div class="hp-tip">💡 ${this.TIPS[tabIdx]}</div>`;
    } else {
      content = this._scheduleHtml();
    }

    el.innerHTML = `<div class="hp-tabs">${tabs}</div>${content}`;
  },

  open() {
    this._tab = 0;
    this._open = {};
    App.openModal('@dumbbell 홈트레이닝 플랜', '<div id="homePlanBody"></div>');
    setTimeout(() => this._render(), 30);
  }
};
