// js/ex-media.js — 운동 자세 그림과 요령
//
// 자주 하는 종목마다 자세 그림 한 장(img/ex/<id>.webp)과 요령 세 줄을 둔다.
// 그림은 가로로 두 칸(왼쪽 = 시작 자세, 오른쪽 = 끝 자세)이고, 화면에서 두 칸을 번갈아 보여 줘서
// 짧은 반복 영상처럼 움직인다. 그림이 아직 없는 종목은 요령과 자세 영상 검색만 보인다.
// 그림 만드는 법: docs/exercise-images.md
const ExMedia = {
  DIR: 'img/ex/',
  // [id, 한글 이름(운동 목록과 같은 글자), 영어 이름, 부위, '요령1|요령2|요령3']
  RAW: [
    // 가슴
    ['bench_press','벤치 프레스','Barbell Bench Press','가슴','어깨뼈를 모으고 가슴을 편다|바를 명치 위로 천천히 내린다|발은 바닥에 단단히 붙인다'],
    ['incline_bench_press','인클라인 벤치 프레스','Incline Barbell Bench Press','가슴','벤치 각도 30~45도|쇄골 아래로 바를 내린다|팔꿈치는 45도 정도로 벌린다'],
    ['db_bench_press','덤벨 벤치 프레스','Dumbbell Bench Press','가슴','덤벨을 가슴 옆까지 깊게 내린다|올리며 덤벨끼리 살짝 모은다|손목은 곧게 세운다'],
    ['incline_db_press','인클라인 덤벨 벤치 프레스','Incline Dumbbell Press','가슴','30도 정도 벤치|내릴 때 3초|가슴 위쪽을 쥐어짜듯 올린다'],
    ['db_fly','덤벨 플라이','Dumbbell Fly','가슴','팔꿈치를 살짝 굽힌 채 고정|큰 원을 그리며 벌린다|가슴이 늘어나는 느낌까지만'],
    ['pushup','푸쉬업','Push-up','가슴','머리부터 발끝까지 일직선|가슴이 바닥 가까이 갈 때까지|팔꿈치는 몸통 쪽 45도'],
    ['knee_pushup','니 푸쉬업','Knee Push-up','가슴','무릎을 대고 엉덩이는 펴 둔다|가슴부터 내려간다|천천히 밀어 올린다'],
    ['incline_pushup','인클라인 푸쉬업','Incline Push-up','가슴','손을 벤치·책상 위에|몸은 일직선|가슴을 손 사이로 내린다'],
    ['decline_pushup','디클라인 푸쉬업','Decline Push-up','가슴','발을 의자 위에 올린다|허리가 꺾이지 않게 복부에 힘|가슴 위쪽으로 민다'],
    ['diamond_pushup','다이아몬드 푸쉬업','Diamond Push-up','삼두','두 손으로 마름모를 만든다|팔꿈치를 몸에 붙인다|삼두로 밀어 올린다'],
    ['dips','딥스','Dips','가슴','몸을 약간 앞으로 기울인다|어깨가 팔꿈치 높이까지 내려간다|어깨가 솟지 않게 내린다'],
    ['cable_crossover','케이블 크로스오버','Cable Crossover','가슴','한 발 앞으로 내딛고 상체를 숙인다|손을 배꼽 앞에서 모은다|천천히 벌리며 버틴다'],
    ['pec_deck','펙덱 플라이','Pec Deck Fly','가슴','등을 패드에 붙인다|팔꿈치로 모은다는 느낌|모은 자리에서 1초 쥐어짠다'],
    ['chest_press_machine','체스트 프레스 머신','Chest Press Machine','가슴','손잡이가 가슴 중간 높이|어깨를 뒤로 고정|끝까지 펴되 팔꿈치는 잠그지 않는다'],
    // 등
    ['pullup','풀 업','Pull-up','등','어깨를 먼저 끌어내린다|턱이 바 위로 올라갈 때까지|내려올 때도 천천히'],
    ['chinup','친 업','Chin-up','등','손바닥이 나를 향하게|가슴을 바로 향해 끌어온다|반동을 쓰지 않는다'],
    ['band_assist_pullup','밴드 어시스트 풀 업','Band-assisted Pull-up','등','밴드에 무릎이나 발을 건다|어깨를 내리고 당긴다|밴드 장력을 점점 줄인다'],
    ['lat_pulldown','랫 풀다운','Lat Pulldown','등','가슴을 들고 살짝 뒤로 기댄다|바를 쇄골 쪽으로 당긴다|팔이 아니라 팔꿈치로 끌어내린다'],
    ['seated_cable_row','시티드 케이블 로우','Seated Cable Row','등','허리는 곧게|손잡이를 배꼽으로 당긴다|어깨뼈를 모은 뒤 천천히 편다'],
    ['barbell_row','바벨 로우','Barbell Bent-over Row','등','엉덩이를 뒤로 빼고 45도 숙인다|바를 배꼽 쪽으로 당긴다|허리가 둥글게 말리지 않게'],
    ['one_arm_db_row','원 암 덤벨 로우','One-arm Dumbbell Row','등','한 손·무릎을 벤치에|덤벨을 골반 쪽으로 당긴다|몸통이 돌아가지 않게'],
    ['deadlift','데드리프트','Conventional Deadlift','등','바는 정강이에 붙여서|허리 곧게, 엉덩이와 어깨가 같이 오른다|일어설 때 엉덩이를 조인다'],
    ['romanian_deadlift','루마니안 데드리프트','Romanian Deadlift','하체','무릎은 살짝만 굽힌다|엉덩이를 뒤로 밀며 숙인다|햄스트링이 당기는 데까지만'],
    ['t_bar_row','티 바 로우','T-bar Row','등','가슴을 패드나 앞쪽으로 고정|팔꿈치를 뒤로 끌어당긴다|어깨가 말리지 않게'],
    ['face_pull','페이스 풀','Face Pull','어깨','로프를 얼굴 높이로|당기며 손을 귀 옆으로 벌린다|뒤쪽 어깨를 쥐어짠다'],
    ['back_extension','백 익스텐션','Back Extension','등','골반을 패드 끝에 걸친다|허리를 둥글게 내렸다가|몸이 일직선이 될 때까지만 올린다'],
    ['inverted_row','인버티드 로우','Inverted Row','등','몸을 일직선으로 유지|가슴을 바로 끌어올린다|엉덩이가 처지지 않게'],
    ['superman','슈퍼맨','Superman','복근','엎드려 팔다리를 뻗는다|팔과 다리를 동시에 든다|위에서 2초 버틴다'],
    // 어깨
    ['overhead_press','오버헤드 프레스','Overhead Press','어깨','배와 엉덩이에 힘을 준다|바를 얼굴 앞으로 곧게 민다|머리를 바 아래로 넣는다'],
    ['db_shoulder_press','덤벨 숄더 프레스','Dumbbell Shoulder Press','어깨','덤벨을 귀 높이에서 시작|머리 위로 모으며 민다|허리가 꺾이지 않게'],
    ['arnold_press','아놀드 프레스','Arnold Press','어깨','손바닥이 나를 향해 시작|돌리면서 밀어 올린다|내릴 때 다시 돌린다'],
    ['lateral_raise','덤벨 레터럴 레이즈','Dumbbell Lateral Raise','어깨','팔꿈치를 살짝 굽힌다|어깨 높이까지만 옆으로 든다|새끼손가락이 약간 위로'],
    ['front_raise','덤벨 프론트 레이즈','Dumbbell Front Raise','어깨','팔을 앞으로 어깨 높이까지|반동 없이|천천히 내린다'],
    ['cable_lateral_raise','케이블 레터럴 레이즈','Cable Lateral Raise','어깨','케이블을 몸 앞으로 교차|어깨 높이까지 든다|아래에서도 긴장 유지'],
    ['rear_delt_fly','펙 덱 리어 델트','Reverse Pec Deck','어깨','가슴을 패드에 붙인다|팔을 옆으로 크게 벌린다|뒤쪽 어깨로 당긴다'],
    ['upright_row','바벨 업라이트 로우','Barbell Upright Row','어깨','손 간격은 어깨너비|팔꿈치가 손보다 높게|가슴 높이까지만 올린다'],
    ['db_shrug','덤벨 슈러그','Dumbbell Shrug','어깨','어깨를 귀 쪽으로 곧게 올린다|위에서 1초 멈춘다|어깨를 돌리지 않는다'],
    ['pike_pushup','파이크 푸쉬업','Pike Push-up','어깨','엉덩이를 높이 든 ㅅ자 자세|머리를 손 사이로 내린다|어깨로 밀어 올린다'],
    // 팔
    ['db_curl','덤벨 바이셉 컬','Dumbbell Biceps Curl','이두','팔꿈치를 옆구리에 고정|손바닥을 위로 말아 올린다|내릴 때 천천히'],
    ['barbell_curl','바벨 바이셉 컬','Barbell Curl','이두','상체를 흔들지 않는다|팔꿈치는 제자리|위에서 이두를 쥐어짠다'],
    ['hammer_curl','덤벨 해머 컬','Hammer Curl','이두','손바닥이 서로 마주 보게|엄지 쪽으로 들어 올린다|팔꿈치 고정'],
    ['incline_db_curl','인클라인 덤벨 컬','Incline Dumbbell Curl','이두','등을 벤치에 기댄다|팔을 아래로 늘어뜨린 채 시작|이두가 늘어난 느낌을 유지'],
    ['preacher_curl','바벨 프리쳐 컬','Preacher Curl','이두','겨드랑이를 패드 끝에|끝까지 펴되 팔꿈치는 잠그지 않는다|천천히 말아 올린다'],
    ['cable_curl','케이블 바이셉 컬','Cable Curl','이두','케이블 앞에 똑바로 선다|팔꿈치 고정|끝까지 긴장 유지'],
    ['pushdown','케이블 트라이셉 푸쉬다운','Triceps Pushdown','삼두','팔꿈치를 옆구리에 붙인다|끝까지 펴며 삼두를 조인다|올라올 때 팔꿈치가 뜨지 않게'],
    ['rope_pushdown','케이블 로프 트라이셉 익스텐션','Rope Triceps Extension','삼두','로프를 아래에서 양옆으로 벌린다|팔꿈치는 고정|천천히 되돌린다'],
    ['overhead_tri_ext','오버헤드 트라이셉스 익스텐션','Overhead Triceps Extension','삼두','덤벨을 머리 뒤로 내린다|팔꿈치는 앞을 향하게|머리 위로 곧게 편다'],
    ['skull_crusher','라잉 바벨 트라이셉 익스텐션','Skull Crusher','삼두','누워서 팔을 수직으로|이마 쪽으로 바를 내린다|팔꿈치만 움직인다'],
    ['db_kickback','덤벨 킥백','Dumbbell Kickback','삼두','상체를 숙이고 팔꿈치를 몸 옆에|뒤로 곧게 편다|편 자리에서 1초'],
    ['bench_dips','벤치 딥스','Bench Dips','삼두','손을 벤치 끝에, 엉덩이는 벤치 가까이|팔꿈치를 뒤로 굽혀 내린다|삼두로 밀어 올린다'],
    ['close_grip_bench','클로즈 그립 벤치프레스','Close-grip Bench Press','삼두','손 간격은 어깨너비|팔꿈치를 몸에 붙여 내린다|가슴 아래쪽으로 내린다'],
    // 하체
    ['squat','바벨 스쿼트','Barbell Back Squat','하체','발은 어깨너비, 발끝은 살짝 바깥|엉덩이를 뒤로 앉듯 내려간다|무릎은 발끝 방향'],
    ['bodyweight_squat','와이드 스쿼트','Wide Squat','하체','발을 넓게 벌린다|허리 곧게 앉는다|발 전체로 밀고 일어난다'],
    ['goblet_squat','고블릿 스쿼트','Goblet Squat','하체','덤벨을 가슴 앞에 세워 든다|팔꿈치가 무릎 안쪽을 지나도록|가슴을 세운 채 앉는다'],
    ['front_squat','프론트 스쿼트','Front Squat','하체','바를 어깨 앞에 얹는다|팔꿈치를 높게|상체를 곧게 세운다'],
    ['leg_press','레그 프레스','Leg Press','하체','허리를 등판에 붙인다|무릎이 가슴 쪽으로 올 때까지|무릎을 끝까지 잠그지 않는다'],
    ['lunge','런지','Lunge','하체','한 발 크게 내딛는다|뒷무릎이 바닥 가까이|앞발 뒤꿈치로 밀고 돌아온다'],
    ['walking_lunge','워킹 런지','Walking Lunge','하체','상체를 곧게|걸어가며 번갈아 내딛는다|무릎이 안으로 모이지 않게'],
    ['bulgarian_split','덤벨 불가리안 스플릿 스쿼트','Bulgarian Split Squat','하체','뒷발을 벤치에 올린다|앞다리로 곧게 내려간다|상체를 살짝 숙이면 엉덩이에 더'],
    ['leg_extension','레그 익스텐션','Leg Extension','하체','무릎 축을 기계 축에 맞춘다|끝까지 펴고 1초|천천히 내린다'],
    ['leg_curl','레그 컬','Lying Leg Curl','하체','엎드려 골반을 붙인다|발뒤꿈치를 엉덩이 쪽으로|엉덩이가 들리지 않게'],
    ['hip_thrust','힙 쓰러스트','Hip Thrust','하체','등 위쪽을 벤치에 기댄다|턱을 당기고 엉덩이를 든다|위에서 엉덩이를 꽉 조인다'],
    ['glute_bridge','힙 브릿지','Glute Bridge','하체','누워서 무릎을 세운다|엉덩이를 들어 일직선|위에서 2초 조인다'],
    ['calf_raise','카프 레이즈','Calf Raise','하체','발끝으로 서서 최대한 높이|위에서 1초|발뒤꿈치를 천천히 내린다'],
    ['sumo_deadlift','스모 데드리프트','Sumo Deadlift','하체','발을 넓게, 손은 다리 안쪽|가슴을 세운다|바닥을 양옆으로 밀듯 일어난다'],
    ['step_up','덤벨 스텝업','Dumbbell Step-up','하체','올라선 발로만 민다|무릎이 안으로 모이지 않게|천천히 내려온다'],
    ['wall_sit','월 싯','Wall Sit','하체','등을 벽에 붙인다|무릎 90도|그 자세로 버틴다'],
    ['hip_abduction','힙 어브덕션 머신','Hip Abduction Machine','하체','허리를 등받이에|무릎을 바깥으로 민다|천천히 모은다'],
    ['jump_squat','점프 스쿼트','Jump Squat','하체','스쿼트로 앉았다가|힘껏 뛰어오른다|부드럽게 착지해 다시 앉는다'],
    ['good_morning','굿모닝','Good Morning','등','바를 등에 얹는다|엉덩이를 뒤로 밀며 숙인다|허리 곧게'],
    // 복근
    ['plank','플랭크','Plank','복근','팔꿈치는 어깨 아래|머리부터 발까지 일직선|엉덩이가 처지거나 솟지 않게'],
    ['side_plank','사이드 플랭크','Side Plank','복근','팔꿈치를 어깨 아래에|옆구리를 들어 일직선|골반이 앞으로 돌지 않게'],
    ['crunch','크런치','Crunch','복근','무릎을 세우고 눕는다|명치를 골반 쪽으로 말아 올린다|목을 당기지 않는다'],
    ['leg_raise','레그 레이즈','Leg Raise','복근','허리를 바닥에 붙인다|다리를 곧게 들어 올린다|바닥에 닿기 직전까지 천천히'],
    ['hanging_leg_raise','행잉 레그 레이즈','Hanging Leg Raise','복근','철봉에 매달린다|반동 없이 다리를 들어 올린다|골반을 말아 올린다'],
    ['russian_twist','러시안 트위스트','Russian Twist','복근','상체를 뒤로 기울여 버틴다|몸통을 좌우로 돌린다|발을 들면 더 어렵다'],
    ['bicycle_crunch','바이시클 크런치','Bicycle Crunch','복근','팔꿈치와 반대 무릎을 모은다|번갈아 페달 밟듯|허리를 바닥에 붙인다'],
    ['dead_bug','데드 벅','Dead Bug','복근','누워서 팔다리를 든다|반대쪽 팔·다리를 뻗는다|허리가 뜨지 않게'],
    ['bird_dog','버드 독','Bird Dog','복근','네발 자세|반대쪽 팔·다리를 뻗는다|골반을 수평으로 유지'],
    ['ab_slide','AB 슬라이드','Ab Wheel Rollout','복근','무릎을 대고 시작|허리가 꺾이지 않는 데까지 민다|복근으로 끌어온다'],
    ['mountain_climber','사이드 마운틴 클라이머','Mountain Climber','유산소','푸쉬업 자세|무릎을 가슴 쪽으로 번갈아|엉덩이를 낮게 유지'],
    ['flutter_kick','플러터 킥','Flutter Kick','복근','누워서 다리를 살짝 든다|위아래로 작게 번갈아 찬다|허리를 붙인다'],
    ['v_up','브이 업','V-up','복근','누워서 팔다리를 뻗는다|상체와 다리를 동시에 들어 V|천천히 내린다'],
    ['cable_crunch','케이블 크런치','Cable Crunch','복근','로프를 머리 옆에|무릎 꿇고 몸통을 말아 내린다|엉덩이는 움직이지 않는다'],
    // 전신·유산소
    ['burpee','버피','Burpee','유산소','쪼그려 앉아 손을 짚는다|다리를 뒤로 뻗어 푸쉬업 자세|일어나며 점프'],
    ['jumping_jack','점핑 잭','Jumping Jack','유산소','뛰며 팔다리를 벌린다|다시 모은다|리듬 있게 반복'],
    ['kettlebell_swing','케틀벨 스윙','Kettlebell Swing','전신','엉덩이를 뒤로 빼며 케틀벨을 다리 사이로|엉덩이를 튕겨 앞으로|팔이 아니라 엉덩이 힘으로'],
    ['thruster','쓰러스터','Thruster','전신','프론트 스쿼트로 앉는다|일어나는 힘으로 머리 위로 민다|한 동작으로 이어서'],
    ['farmers_walk','파머스워크','Farmer\'s Walk','전신','무거운 덤벨을 양손에|어깨를 펴고 곧게 걷는다|복부에 힘'],
    ['jump_rope','줄넘기','Jump Rope','유산소','손목으로 줄을 돌린다|발끝으로 가볍게 뛴다|무릎을 살짝 굽힌다'],
    ['rowing_machine','로잉 머신','Rowing Machine','유산소','다리 → 몸통 → 팔 순서로 당긴다|돌아갈 때는 반대 순서|등을 곧게'],
    ['treadmill','트레드밀 러닝','Treadmill Running','유산소','상체를 곧게|발 앞쪽으로 가볍게 착지|숨이 약간 찰 정도로'],
    ['cycle','싸이클','Stationary Bike','유산소','안장 높이는 다리가 거의 펴질 만큼|일정한 속도로|상체 힘을 뺀다'],
    ['stepper','스텝 밀','Stair Climber','유산소','손잡이에 기대지 않는다|발 전체로 딛는다|상체를 곧게'],
  ],
  _map: null,
  _all() {
    if (this._map) return this._map;
    this._map = new Map();
    for (const [id, ko, en, part, cues] of this.RAW) this._map.set(ko, { id, ko, en, part, cues: cues.split('|') });
    return this._map;
  },
  find(name) {
    const n = String(name || '').trim();
    const e = this._all().get(n);
    if (e) return e;
    // 요령은 아직 없지만 그림은 있는 나머지 종목 (js/ex-auto.js)
    if (typeof EX_AUTO !== 'undefined' && EX_AUTO[n]) {
      let part = '';
      if (typeof EX_DB !== 'undefined') for (const [p, ns] of Object.entries(EX_DB)) if (ns.includes(n)) { part = p; break; }
      return { id: EX_AUTO[n], ko: n, en: '', part, cues: [] };
    }
    // 이름이 조금 다르게 들어온 운동(AI 가 짠 루틴 등) — 띄어쓰기·표기 차이를 지우고 같은 운동을 찾는다
    //   푸시업→푸쉬업, 트라이셉스→트라이셉, 덤벨 플랫 프레스→덤벨 벤치 프레스, 인클라인 덤벨 프레스→인클라인 덤벨 벤치 프레스, 케이블 푸시다운→케이블 트라이셉 푸쉬다운
    if (!this._nz) {
      this._nz = new Map();
      const add = k => { const z = this._norm(k); if (z && !this._nz.has(z)) this._nz.set(z, k); };
      for (const k of this._all().keys()) add(k);
      if (typeof EX_AUTO !== 'undefined') for (const k of Object.keys(EX_AUTO)) add(k);
    }
    const z = this._norm(n);
    const cands = [z, z.replace('플랫', ''), z.replace(/(덤벨|바벨|케이블|스미스머신)프레스$/, '$1벤치프레스'), z.replace('플랫프레스', '벤치프레스'),
      z.replace(/^(케이블|로프|바)?푸쉬다운$/, '케이블트라이셉푸쉬다운'), z.replace('트라이셉스', '트라이셉'), z.replace(/^팔굽혀펴기$/, '푸쉬업')];
    for (const c of cands) { const k = this._nz.get(c); if (k && k !== n) return this.find(k); }
    return null;
  },
  _norm(s) { return String(s || '').replace(/\s+/g, '').replace(/푸시/g, '푸쉬').replace(/트라이셉스/g, '트라이셉').toLowerCase(); },
  img(e) { return this.DIR + e.id + '.webp'; },
  // 정렬해 둔 두 프레임(시작·끝 자세, 정사각형 두 칸) — img/exf/. 바닥·기구가 같은 자리에 오도록 맞춰 둔 그림이다.
  FDIR: 'img/exf/',
  // 앱(iOS·안드로이드)은 화면 파일을 앱 안에 넣어 두므로, 새로 만든 그림은 앱을 다시 빌드해야 보였다.
  // 서버(bashy.app)의 그림 목록(img/exf/have.json)을 읽어, 앱 안에 없는 그림은 서버에서 바로 가져온다.
  REMOTE: new Set(),
  frames(e) { return (this.REMOTE.has(e.id) ? 'https://bashy.app/' + this.FDIR : this.FDIR) + e.id + '.webp'; },
  async syncRemote() {
    if (!(typeof Platform !== 'undefined' && Platform.native) || typeof EX_HAVE === 'undefined') return;
    const add = ids => { let n = 0; for (const id of ids || []) if (!EX_HAVE.has(id)) { EX_HAVE.add(id); this.REMOTE.add(id); n++; } return n; };
    try { add(JSON.parse(localStorage.getItem('gl_exf_remote') || '[]')); } catch {}
    try {
      const r = await fetch('https://bashy.app/img/exf/have.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const ids = await r.json();
      const n = add(ids);
      localStorage.setItem('gl_exf_remote', JSON.stringify([...this.REMOTE]));
      if (n) { try { Fitness.render(App?.S?.selDate || new Date()); } catch {} }
    } catch {}
  },
  // 그림이 실제로 있는 운동인지 (없으면 자리 자체를 만들지 않는다)
  has(e) { return !!e && (typeof EX_HAVE === 'undefined' || EX_HAVE.has(e.id)); },
  thumbFor(name) {
    const sp = this.sportImg(name); if (sp) return sp;
    const e = this.find(name); return this.has(e) ? this.frames(e) : '';
  },
  // 스포츠 종목(주짓수·골프 …)은 자세 애니메이션 대신 같은 화풍의 사진 한 장 — 'still:' 로 표시해 poseHtml 이 멈춘 그림으로 그린다.
  // 사진이 아직 없으면 같은 틀의 이름 첫 글자 타일로 채운다(목록에서 통일감이 깨지지 않게).
  sportImg(name) {
    if (typeof EX_DB === 'undefined' || !EX_DB['스포츠']) return '';
    const i = EX_DB['스포츠'].indexOf(name);
    let mine = false;
    if (i < 0) { mine = typeof Fitness !== 'undefined' && Fitness.myPart && Fitness.myPart(name) === '스포츠'; if (!mine) return ''; }
    const id = i >= 0 ? 's' + String(i).padStart(3, '0') : '';
    if (id && typeof SPORT_HAVE !== 'undefined' && SPORT_HAVE.includes(id)) return 'still:img/sport/' + id + '.webp';
    const ch = String(name).trim().charAt(0) || '·';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' fill='#f2f3f5'/><circle cx='60' cy='60' r='38' fill='#ff7a1a' fill-opacity='.14'/><text x='60' y='61' text-anchor='middle' dominant-baseline='central' font-family='IBM Plex Sans KR, sans-serif' font-size='44' font-weight='700' fill='#3a3f47'>${ch.replace(/[<&'"]/g, '')}</text></svg>`;
    return 'still:data:image/svg+xml,' + encodeURIComponent(svg);
  },
  // 두 프레임을 겹쳐 두고 위의 것만 천천히 나타났다 사라지게 한다 — 안 움직이는 부분은 그대로 서 있다.
  poseHtml(src, label) {
    if (String(src).startsWith('still:')) return `<span class="pose still" role="img" aria-label="${label||''}"><i style="background-image:url(&quot;${String(src).slice(6)}&quot;)"></i></span>`;
    return `<span class="pose" role="img" aria-label="${label||''}"><i style="background-image:url('${src}')"></i><i class="pb" style="background-image:url('${src}')"></i></span>`;
  },

  // 운동 창들이 같이 쓰는 가는 선 아이콘(Icons 에 없는 것만) — 별(즐겨찾기)·재생(영상)·바깥 링크·꺾쇠
  IC: {
    star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10.2 8.8v6.4l5-3.2-5-3.2Z"/>',
    ext:  '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x:    '<path d="M6 6l12 12M18 6 6 18"/>',
  },
  ic(name, cls) { const d = this.IC[name]; return d ? `<svg class="fz-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>` : ''; },

  open(name) {
    const e = this.find(name); if (!e) return;
    const yt = typeof Fitness !== 'undefined' ? Fitness.ytUrl(e.ko) : '#';
    const meta = [e.en, e.part].filter(Boolean).map(esc).join(' · ');
    App.openModal('@dumbbell ' + e.ko, `<div class="fz fz-exm">
      <div class="exm-media" id="exmMedia">
        <div class="exm-anim">${this.poseHtml(this.frames(e), esc(e.ko)+' 시작·끝 자세')}</div>
        <div class="exm-none">${Icons.big('dumbbell')}<span>자세 그림 준비 중</span></div>
      </div>
      ${meta ? `<div class="exm-sub">${meta}</div>` : ''}
      ${e.cues.length ? `<div class="fz-lbl">자세 요령</div><ol class="exm-cues">${e.cues.map((c, i) => `<li><span class="num">${i + 1}</span><span>${esc(c)}</span></li>`).join('')}</ol>` : ''}
      <a class="fz-link" href="${yt}" target="_blank" rel="noopener">${this.ic('play')}<span>자세 영상 찾기</span>${this.ic('ext', 'fz-ic-end')}</a>
      <div class="modal-btns">
        <button class="btn-sm accent" onclick="App.closeModal()">닫기</button>
      </div></div>`);
    // 그림이 있으면 움직이는 칸을, 없으면 '준비 중' 을 보인다.
    const im = new Image();
    im.onload = () => document.getElementById('exmMedia')?.classList.add('has');
    im.src = this.frames(e);
  },
};

try { setTimeout(() => ExMedia.syncRemote(), 1500); } catch (e) {}
