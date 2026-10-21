// js/home-plan.js — 홈트레이닝 3일 분할 플랜 (모달 뷰)

const HomePlan = {
  // 이미지 경로 (img/ex/ — 전체 종목 그림과 같은 그림체)
  // 운동 자세 그림 — 전체 종목 그림(img/ex)과 같은 그림체. 왼쪽 시작·오른쪽 끝 자세를 번갈아 보여 준다.
  IMG: [
    'img/ex/incline_db_press.webp',
    'img/ex/db_bench_press.webp',
    'img/ex/incline_db_fly.webp',
    'img/ex/db_shoulder_press.webp',
    'img/ex/lateral_raise.webp',
    'img/ex/cable_pushdown_diy.webp',
    'img/ex/decline_pushup.webp',
    'img/ex/band_assist_pullup.webp',
    'img/ex/one_arm_db_row.webp',
    'img/ex/lat_pulldown.webp',
    'img/ex/face_pull.webp',
    'img/ex/incline_db_curl.webp',
    'img/ex/hammer_curl.webp',
    'img/ex/goblet_squat.webp',
    'img/ex/db_romanian_deadlift.webp',
    'img/ex/bulgarian_split.webp',
    'img/ex/calf_raise.webp',
    'img/ex/hanging_knee_raise.webp',
    'img/ex/russian_twist.webp',
    'img/ex/plank.webp'
  ],

  // ═══ 운동 데이터 ═══
  EX: [
    // DAY A — 푸시 (가슴·어깨·삼두)
    [
      {n:'인클라인 덤벨 프레스',e:'Incline Dumbbell Press',img:0,
       tg:[{t:'가슴 상부',c:'m'},{t:'전면 삼각근',c:'m'},{t:'4×10-12',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','14~16kg 각 손 (첫주 12kg)'],['벤치 각도','30~40도'],['포인트','내리는 동작 3초, 올리며 가슴 상부 수축 1초 유지']],
       alt:['플로어 프레스','푸시업 (인클라인 벤치에 발 올려서)'],lb:'14-16kg × 각 손',
       yt:{ko:'인클라인 덤벨 프레스 자세 방법',en:'incline dumbbell press form tutorial'}},
      {n:'덤벨 플랫 프레스',e:'Dumbbell Flat Bench Press',img:1,
       tg:[{t:'가슴 중부',c:'m'},{t:'삼두',c:'m'},{t:'3×10-12',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','16~18kg 각 손 (첫주 14kg)'],['포인트','가슴 넓이까지 내린 후 폭발적으로 밀어올리기']],
       alt:['와이드 푸시업','덤벨 스퀴즈 프레스'],lb:'16-18kg × 각 손',
       yt:{ko:'덤벨 플랫 벤치 프레스 자세',en:'dumbbell flat bench press form'}},
      {n:'인클라인 덤벨 플라이',e:'Incline Dumbbell Fly',img:2,
       tg:[{t:'가슴 상부 안쪽',c:'m'},{t:'3×12-15',c:'s'},{t:'휴식 60초',c:'r'}],
       info:[['추천 중량','8~10kg 각 손'],['포인트','팔꿈치 살짝 굽힌 채 넓게 벌렸다가 수축 시 1초 정지']],
       alt:['케이블 크로스오버','밴드 체스트 플라이'],lb:'8-10kg × 각 손',
       yt:{ko:'인클라인 덤벨 플라이 자세',en:'incline dumbbell fly form'}},
      {n:'덤벨 숄더 프레스',e:'Seated DB Shoulder Press',img:3,
       tg:[{t:'전면 삼각근',c:'m'},{t:'측면 삼각근',c:'m'},{t:'4×8-10',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','12~14kg 각 손 (첫주 10kg)'],['벤치 각도','80~85도'],['포인트','팔꿈치가 어깨 높이에서 시작, 정수리 위까지']],
       alt:['아놀드 프레스','밴드 숄더 프레스'],lb:'12-14kg × 각 손',
       yt:{ko:'덤벨 숄더 프레스 자세',en:'seated dumbbell shoulder press form'}},
      {n:'덤벨 레터럴 레이즈',e:'Dumbbell Lateral Raise',img:4,
       tg:[{t:'측면 삼각근',c:'m'},{t:'4×15-20',c:'s'},{t:'휴식 45초',c:'r'}],
       info:[['추천 중량','5~7kg 각 손 (마지막 세트 드랍 → 3kg)'],['포인트','새끼손가락 쪽이 위로, 승모근 개입 최소화']],
       alt:['케이블 레터럴 레이즈','밴드 레터럴 레이즈'],lb:'5-7kg × 각 손',
       yt:{ko:'레터럴 레이즈 자세',en:'lateral raise proper form'}},
      {n:'케이블 푸시다운',e:'Cable Pushdown (DIY Pulley)',img:5,
       tg:[{t:'삼두 전체',c:'m'},{t:'3×12-15',c:'s'},{t:'휴식 60초',c:'r'}],
       info:[['추천 중량','10~14kg (도르래 마찰 감안 +20%)'],['포인트','팔꿈치 고정, 전완만 움직여 완전 수축']],
       alt:['오버헤드 덤벨 삼두 익스텐션','다이아몬드 푸시업'],lb:'10-14kg',
       yt:{ko:'케이블 푸시다운 삼두운동',en:'cable tricep pushdown form'}},
      {n:'디클라인 푸시업',e:'Decline Push-up (Finisher)',img:6,
       tg:[{t:'가슴 상부',c:'m'},{t:'삼두',c:'m'},{t:'2×MAX',c:'s'},{t:'휴식 60초',c:'r'}],
       info:[['포인트','벤치에 발 올려 상체 각도 ↑, 가슴 상부 마무리']],
       alt:['일반 푸시업 MAX','닐링 푸시업'],lb:'맨몸 · 벤치 위 발',
       yt:{ko:'디클라인 푸시업 자세',en:'decline push up form'}}
    ],
    // DAY B — 풀 (등·이두)
    [
      {n:'밴드 어시스트 풀업',e:'Band-Assisted Pull-up',img:7,
       tg:[{t:'광배근',c:'m'},{t:'이두',c:'m'},{t:'4×6-8',c:'s'},{t:'휴식 120초',c:'r'}],
       info:[['밴드 보조','밴드 2~3개 = 28~42kg 보조'],['포인트','데드행 → 팔꿈치를 허리 쪽 당기기, 내릴 때 3초'],['목표','매주 밴드 1개 줄이기 → 8주 후 무보조 5회']],
       alt:['네거티브 풀업','인버티드 로우'],lb:'밴드 2~3개 보조',
       yt:{ko:'밴드 어시스트 풀업 자세',en:'band assisted pull up form tutorial'}},
      {n:'원암 덤벨 로우',e:'One-Arm Dumbbell Row',img:8,
       tg:[{t:'광배근',c:'m'},{t:'능형근',c:'m'},{t:'4×10-12 각',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','18~22kg (한 손, 첫주 16kg)'],['포인트','벤치에 한 손+한 무릎 지지, 팔꿈치를 엉덩이 쪽으로']],
       alt:['양손 덤벨 벤트오버 로우','밴드 시티드 로우'],lb:'18-22kg',
       yt:{ko:'원암 덤벨 로우 등운동',en:'one arm dumbbell row form'}},
      {n:'케이블 랫 풀다운',e:'Cable Lat Pulldown (DIY)',img:9,
       tg:[{t:'광배근',c:'m'},{t:'대원근',c:'m'},{t:'3×10-12',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','14~18kg (도르래 마찰 감안)'],['포인트','무릎 꿇고, 바를 쇄골 아래까지 당기며 견갑 수축']],
       alt:['밴드 랫 풀다운','덤벨 풀오버'],lb:'14-18kg',
       yt:{ko:'랫 풀다운 자세',en:'lat pulldown proper form'}},
      {n:'페이스풀',e:'Face Pull (Band/Cable)',img:10,
       tg:[{t:'후면 삼각근',c:'m'},{t:'승모근 하부',c:'m'},{t:'4×15-20',c:'s'},{t:'휴식 45초',c:'r'}],
       info:[['추천 강도','밴드 1~2개 or 케이블 8~10kg'],['포인트','귀 옆까지 당기며 외회전, 자세교정 필수!']],
       alt:['벤트오버 리어 델트 레이즈','리버스 플라이'],lb:'밴드/케이블 8-10kg',
       yt:{ko:'페이스풀 자세 후면삼각근',en:'face pull band form tutorial'}},
      {n:'인클라인 덤벨 컬',e:'Incline Dumbbell Curl',img:11,
       tg:[{t:'이두 장두',c:'m'},{t:'3×10-12',c:'s'},{t:'휴식 60초',c:'r'}],
       info:[['추천 중량','8~10kg 각 손 (드랍: 10→6kg)'],['벤치 각도','45도 인클라인'],['포인트','팔이 뒤로 빠져 이두 장두 스트레치 극대화']],
       alt:['해머 컬','컨센트레이션 컬'],lb:'8-10kg × 각 손',
       yt:{ko:'인클라인 덤벨 컬 이두운동',en:'incline dumbbell curl form'}},
      {n:'해머 컬',e:'Hammer Curl',img:12,
       tg:[{t:'상완근',c:'m'},{t:'전완근',c:'m'},{t:'3×10-12',c:'s'},{t:'휴식 60초',c:'r'}],
       info:[['추천 중량','10~12kg 각 손'],['포인트','덤벨을 세워서 (뉴트럴 그립) 컬, 팔 두께 발달']],
       alt:['리버스 컬','밴드 해머 컬'],lb:'10-12kg × 각 손',
       yt:{ko:'해머 컬 자세',en:'hammer curl proper form'}}
    ],
    // DAY C — 하체 + 코어
    [
      {n:'덤벨 고블렛 스쿼트',e:'Dumbbell Goblet Squat',img:13,
       tg:[{t:'대퇴사두',c:'m'},{t:'둔근',c:'m'},{t:'4×10-12',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','20~24kg (덤벨 1개를 가슴 앞에)'],['포인트','엉덩이를 뒤로 빼며, 무릎이 발끝을 넘지 않게']],
       alt:['덤벨 스모 스쿼트','밴드 스쿼트'],lb:'20-24kg',
       yt:{ko:'고블렛 스쿼트 자세',en:'goblet squat dumbbell form'}},
      {n:'덤벨 루마니안 데드리프트',e:'Dumbbell Romanian Deadlift',img:14,
       tg:[{t:'햄스트링',c:'m'},{t:'둔근',c:'m'},{t:'기립근',c:'m'},{t:'4×10-12',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','16~20kg 각 손 (첫주 14kg)'],['포인트','무릎 살짝 굽힌 채 엉덩이를 뒤로 빼며 내리기']],
       alt:['싱글레그 RDL','굿모닝'],lb:'16-20kg × 각 손',
       yt:{ko:'루마니안 데드리프트 덤벨',en:'dumbbell romanian deadlift form'}},
      {n:'불가리안 스플릿 스쿼트',e:'Bulgarian Split Squat',img:15,
       tg:[{t:'대퇴사두',c:'m'},{t:'둔근',c:'m'},{t:'3×10-12 각',c:'s'},{t:'휴식 90초',c:'r'}],
       info:[['추천 중량','10~14kg 각 손 (첫주 맨몸)'],['포인트','뒷발 벤치에 올리고 앞다리 무릎 90도까지']],
       alt:['덤벨 런지','스텝업'],lb:'10-14kg × 각 손',
       yt:{ko:'불가리안 스플릿 스쿼트',en:'bulgarian split squat dumbbell form'}},
      {n:'덤벨 카프 레이즈',e:'Standing Calf Raise',img:16,
       tg:[{t:'비복근',c:'m'},{t:'가자미근',c:'m'},{t:'3×15-20',c:'s'},{t:'휴식 45초',c:'r'}],
       info:[['추천 중량','20~24kg 각 손'],['포인트','발 앞부분만 올리고, 최고점에서 2초 수축']],
       alt:['시티드 카프 레이즈','싱글 레그 카프 레이즈'],lb:'20-24kg × 각 손',
       yt:{ko:'카프 레이즈 종아리 운동',en:'standing calf raise dumbbell form'}},
      {n:'행잉 니 레이즈',e:'Hanging Knee Raise',img:17,
       tg:[{t:'하복부',c:'m'},{t:'장요근',c:'m'},{t:'3×12-15',c:'s'},{t:'휴식 60초',c:'r'}],
       info:[['포인트','반동 없이 무릎을 가슴까지, 내릴 때 천천히']],
       alt:['라잉 레그 레이즈','리버스 크런치'],lb:'맨몸 (철봉)',
       yt:{ko:'행잉 니 레이즈 하복부',en:'hanging knee raise form'}},
      {n:'덤벨 러시안 트위스트',e:'Dumbbell Russian Twist',img:18,
       tg:[{t:'복사근',c:'m'},{t:'코어 전체',c:'m'},{t:'3×20 (좌우10)',c:'s'},{t:'휴식 45초',c:'r'}],
       info:[['추천 중량','6~8kg 덤벨 1개'],['포인트','발 들고 V자 유지, 좌우 천천히 회전']],
       alt:['바이시클 크런치','사이드 플랭크'],lb:'6-8kg',
       yt:{ko:'러시안 트위스트 복근운동',en:'russian twist dumbbell form'}},
      {n:'플랭크',e:'Plank (Finisher)',img:19,
       tg:[{t:'코어 전체',c:'m'},{t:'3×45초',c:'s'},{t:'휴식 30초',c:'r'}],
       info:[['포인트','엉덩이 처지거나 올라가지 않게 일직선 유지']],
       alt:['사이드 플랭크 (좌우 30초씩)','데드버그'],lb:'맨몸 45초',
       yt:{ko:'플랭크 자세 코어 운동',en:'plank proper form core'}}
    ]
  ],

  DAY_LABELS: [
    {name:'DAY A', sub:'푸시', desc:'가슴 · 어깨 · 삼두 — 미는 동작 중심'},
    {name:'DAY B', sub:'풀',  desc:'등 · 후면어깨 · 이두 — 당기는 동작 중심'},
    {name:'DAY C', sub:'하체+코어', desc:'하체 · 코어 — 큰 근육군 자극으로 대사량 증가'}
  ],

  TIPS: [
    '가슴 운동 시 벤치 각도를 바꿔가며 다양한 부위를 자극하세요. 마지막 푸시업은 탈진 세트로 근지구력을 함께 기릅니다.',
    '풀업은 매주 밴드를 줄여나가는 것이 목표입니다. 등 운동 시 "팔꿈치를 주머니에 넣는다"는 느낌으로 당기세요.',
    '하체는 큰 근육군이라 에너지 소모가 큽니다. 커팅 시 체지방 감소에 가장 효과적인 날이에요.'
  ],

  _tab: 0,
  _open: {},  // { 'dayIdx-exIdx': true }

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

  _ic(n, c) { return typeof ExMedia !== 'undefined' && ExMedia.ic ? ExMedia.ic(n, c) : ''; },

  _exCard(x, dayIdx, exIdx) {
    const isOpen = this._open[dayIdx + '-' + exIdx];
    const imgSrc = this.IMG[x.img] || '';
    // 태그 색칠 대신 한 줄 글: 자극 부위 · 세트(숫자) · 휴식
    const meta = x.tg.map(t => t.c === 's' ? `<b class="num">${esc(t.t)}</b>` : `<span>${esc(t.t)}</span>`).join('<i></i>');

    // 그림은 늘 보인다(시작·끝 자세 두 칸 그대로). 이름은 한 줄로 작게, 자세 팁·영상만 접어 둔다.
    return `<div class="hp-ex ${isOpen ? 'hp-ex-open' : ''}">
      ${imgSrc ? `<div class="hp-pic"><img src="${imgSrc}" alt="${esc(x.n)} 시작·끝 자세" loading="lazy"></div>` : ''}
      <div class="hp-ex-line">
        <span class="hp-ex-num num">${String(exIdx + 1).padStart(2, '0')}</span>
        <span class="hp-ex-name">${esc(x.n)}</span>
        <span class="hp-ex-en">${esc(x.e)}</span>
      </div>
      <div class="hp-meta">${meta}</div>
      <button type="button" class="hp-more" aria-expanded="${!!isOpen}" onclick="HomePlan.toggle(${dayIdx},${exIdx})"><span>${isOpen ? '접기' : '자세 팁 · 영상'}</span>${this._ic('down', 'hp-more-ic')}</button>
      ${isOpen ? `<div class="hp-ex-detail">
        <div class="hp-info-rows">
          ${x.info.map(r => `<div class="hp-info-row"><span class="hp-info-label">${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join('')}
        </div>
        ${x.alt.length ? `<div class="hp-alt"><span class="hp-alt-title">대체 운동</span><span>${x.alt.map(esc).join(' · ')}</span></div>` : ''}
        ${x.lb ? `<div class="hp-weight-label">${esc(x.lb)}</div>` : ''}
        <div class="hp-yt-section">
          <a class="fz-link" href="${this.ytUrl(x.yt.ko)}" target="_blank" rel="noopener">${this._ic('play')}<span>자세 영상</span>${this._ic('ext', 'fz-ic-end')}</a>
          <a class="fz-link" href="${this.ytUrl(x.yt.en)}" target="_blank" rel="noopener">${this._ic('play')}<span>${esc(x.e)} form guide</span>${this._ic('ext', 'fz-ic-end')}</a>
        </div>
      </div>` : ''}
    </div>`;
  },

  _scheduleHtml() {
    const W = [['월', 'DAY A · 푸시', 1], ['화', '휴식 또는 유산소'], ['수', 'DAY B · 풀', 1], ['목', '휴식 또는 유산소'],
      ['금', 'DAY C · 하체+코어', 1], ['토', '휴식 또는 유산소'], ['일', '완전 휴식']];
    const list = (t, rows) => `<section class="hp-sec"><h3 class="hp-section-title">${t}</h3>
      <ul class="hp-list">${rows.map(([k, v]) => `<li>${k ? `<strong>${k}</strong>` : ''}<span>${v}</span></li>`).join('')}</ul></section>`;
    return `
      <section class="hp-sec hp-schedule">
        <h3 class="hp-section-title">주간 스케줄</h3>
        <ul class="hp-week">${W.map(([d, t, on]) => `<li class="${on ? 'on' : ''}"><span class="hp-day-d">${d}</span><span class="hp-day-t">${t}</span></li>`).join('')}</ul>
      </section>
      ${list('점진적 과부하', [['1~2주', '추천 중량 하한, 폼 완성 집중'], ['3~4주', '추천 중량 상한으로 올리기'], ['5~6주', '각 운동 1~2kg 증량 또는 2~3회 추가'], ['7~8주', '밴드 풀업 보조 줄이기, 주 4일 확장 고려']])}
      ${list('주 4일 확장 (8주 후)', [['월', '가슴 + 삼두'], ['화', '등 + 이두'], ['목', '어깨 + 팔'], ['금', '하체 + 코어']])}
      ${list('8주 목표', [['', '풀업 무보조 5회 이상'], ['', '푸시업 30회 이상'], ['', '덤벨 프레스 20kg × 12회'], ['', '체중 80kg 이하 (체지방 24% 이하)']])}
      <div class="hp-tip"><strong>휴식일 유산소</strong> 걷기 30~40분(심박 120~130) 또는 Zone2 자전거. 격렬한 유산소는 피하고 회복에 집중합니다.</div>`;
  },

  _render() {
    const el = document.getElementById('homePlanBody');
    if (!el) return;

    const tabIdx = this._tab;

    // 탭 버튼
    const tabs = this.DAY_LABELS.map((d, i) =>
      `<button class="hp-tab${i === tabIdx ? ' hp-tab-on' : ''}" onclick="HomePlan.switchTab(${i})">${d.name}<small>${d.sub}</small></button>`
    ).join('') + `<button class="hp-tab${tabIdx === 3 ? ' hp-tab-on' : ''}" onclick="HomePlan.switchTab(3)">스케줄</button>`;

    let content = '';
    if (tabIdx < 3) {
      const day = this.EX[tabIdx];
      const label = this.DAY_LABELS[tabIdx];
      content = `<div class="hp-desc">${label.desc}</div>` +
        day.map((x, i) => this._exCard(x, tabIdx, i)).join('') +
        `<div class="hp-tip">${this.TIPS[tabIdx]}</div>`;
    } else {
      content = this._scheduleHtml();
    }

    el.innerHTML = `<div class="hp-tabs">${tabs}</div>${content}`;
  },

  open(day = 0, ex = null) {
    this._tab = Number(day) || 0;
    this._open = {};
    if (ex != null) this._open[this._tab + '-' + ex] = true;
    App.openModal('@dumbbell 홈트레이닝 플랜', '<div id="homePlanBody" class="fz fz-hp"></div>');
    setTimeout(() => this._render(), 30);
  }
};
