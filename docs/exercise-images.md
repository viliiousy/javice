# 운동 자세 그림 만들기 (ChatGPT)

앱의 운동 카드에서 종목 옆 **i** 를 누르면 자세 그림이 나옵니다. 그림 한 장은 **가로 두 칸**(왼쪽 = 시작 자세, 오른쪽 = 끝 자세)이고,
앱이 두 칸을 0.9초마다 번갈아 보여 줘서 짧은 반복 영상처럼 움직입니다. 그래서 GIF·영상이 아니라 그림 한 장이면 됩니다.

## 진행 방법
1. ChatGPT 에서 **새 대화**를 하나 엽니다 (모든 그림을 같은 대화에서 만들어야 그림체가 같아집니다).
2. 아래 **[처음 한 번 붙여 넣기]** 를 먼저 보냅니다.
3. 그다음 종목 줄을 한 번에 하나씩(또는 "다음") 보내면 그림이 나옵니다.
4. 받은 그림을 **파일 이름 그대로** 저장합니다 (예: `bench_press.png`). PNG 여도 됩니다.
5. 다 모이면 저(Claude)에게 올려 주세요. 크기를 줄여 `img/ex/<이름>.webp` 로 앱에 넣겠습니다.

## [처음 한 번 붙여 넣기]
```
지금부터 운동 자세 설명 그림을 여러 장 만들 거야. 모든 그림을 아래 규칙으로 똑같이 그려 줘.
- 크기: 가로 1536 × 세로 1024 (가로형)
- 그림을 세로선 없이 왼쪽 절반, 오른쪽 절반 두 칸으로 나눈다. 왼쪽 = 동작 시작 자세, 오른쪽 = 동작 끝 자세.
- 두 칸에서 사람의 위치·크기·카메라 각도는 똑같고 자세만 다르다 (번갈아 보이면 움직이는 것처럼 보여야 함).
- 인물: 얼굴 표정 없는 중성적인 3D 마네킹, 짙은 회색(#3a3f47), 매트 질감. 운동하는 근육만 주황색(#ff7a1a)으로 은은하게 강조.
- 기구(바벨·덤벨·벤치·머신)는 밝은 회색 단순한 모양.
- 배경: 아주 옅은 회색(#f2f3f5) 단색, 바닥 그림자만 살짝. 글자·숫자·화살표·로고 넣지 않기.
- 카메라: 자세가 가장 잘 보이는 옆 45도 각도, 전신이 칸 안에 여유 있게 들어오게.
내가 종목 이름을 보내면 그 규칙대로 그림 한 장만 만들어 줘. 설명 글은 필요 없어.
```

## 종목 목록 (94개)
| 파일 이름 | 보낼 문장 |
|---|---|
| `bench_press.png` | Barbell Bench Press (벤치 프레스) — 어깨뼈를 모으고 가슴을 편다 |
| `incline_bench_press.png` | Incline Barbell Bench Press (인클라인 벤치 프레스) — 벤치 각도 30~45도 |
| `db_bench_press.png` | Dumbbell Bench Press (덤벨 벤치 프레스) — 덤벨을 가슴 옆까지 깊게 내린다 |
| `incline_db_press.png` | Incline Dumbbell Press (인클라인 덤벨 벤치 프레스) — 30도 정도 벤치 |
| `db_fly.png` | Dumbbell Fly (덤벨 플라이) — 팔꿈치를 살짝 굽힌 채 고정 |
| `pushup.png` | Push-up (푸쉬업) — 머리부터 발끝까지 일직선 |
| `knee_pushup.png` | Knee Push-up (니 푸쉬업) — 무릎을 대고 엉덩이는 펴 둔다 |
| `incline_pushup.png` | Incline Push-up (인클라인 푸쉬업) — 손을 벤치·책상 위에 |
| `decline_pushup.png` | Decline Push-up (디클라인 푸쉬업) — 발을 의자 위에 올린다 |
| `diamond_pushup.png` | Diamond Push-up (다이아몬드 푸쉬업) — 두 손으로 마름모를 만든다 |
| `dips.png` | Dips (딥스) — 몸을 약간 앞으로 기울인다 |
| `cable_crossover.png` | Cable Crossover (케이블 크로스오버) — 한 발 앞으로 내딛고 상체를 숙인다 |
| `pec_deck.png` | Pec Deck Fly (펙덱 플라이) — 등을 패드에 붙인다 |
| `chest_press_machine.png` | Chest Press Machine (체스트 프레스 머신) — 손잡이가 가슴 중간 높이 |
| `pullup.png` | Pull-up (풀 업) — 어깨를 먼저 끌어내린다 |
| `chinup.png` | Chin-up (친 업) — 손바닥이 나를 향하게 |
| `band_assist_pullup.png` | Band-assisted Pull-up (밴드 어시스트 풀 업) — 밴드에 무릎이나 발을 건다 |
| `lat_pulldown.png` | Lat Pulldown (랫 풀다운) — 가슴을 들고 살짝 뒤로 기댄다 |
| `seated_cable_row.png` | Seated Cable Row (시티드 케이블 로우) — 허리는 곧게 |
| `barbell_row.png` | Barbell Bent-over Row (바벨 로우) — 엉덩이를 뒤로 빼고 45도 숙인다 |
| `one_arm_db_row.png` | One-arm Dumbbell Row (원 암 덤벨 로우) — 한 손·무릎을 벤치에 |
| `deadlift.png` | Conventional Deadlift (데드리프트) — 바는 정강이에 붙여서 |
| `romanian_deadlift.png` | Romanian Deadlift (루마니안 데드리프트) — 무릎은 살짝만 굽힌다 |
| `t_bar_row.png` | T-bar Row (티 바 로우) — 가슴을 패드나 앞쪽으로 고정 |
| `face_pull.png` | Face Pull (페이스 풀) — 로프를 얼굴 높이로 |
| `back_extension.png` | Back Extension (백 익스텐션) — 골반을 패드 끝에 걸친다 |
| `inverted_row.png` | Inverted Row (인버티드 로우) — 몸을 일직선으로 유지 |
| `superman.png` | Superman (슈퍼맨) — 엎드려 팔다리를 뻗는다 |
| `overhead_press.png` | Overhead Press (오버헤드 프레스) — 배와 엉덩이에 힘을 준다 |
| `db_shoulder_press.png` | Dumbbell Shoulder Press (덤벨 숄더 프레스) — 덤벨을 귀 높이에서 시작 |
| `arnold_press.png` | Arnold Press (아놀드 프레스) — 손바닥이 나를 향해 시작 |
| `lateral_raise.png` | Dumbbell Lateral Raise (덤벨 레터럴 레이즈) — 팔꿈치를 살짝 굽힌다 |
| `front_raise.png` | Dumbbell Front Raise (덤벨 프론트 레이즈) — 팔을 앞으로 어깨 높이까지 |
| `cable_lateral_raise.png` | Cable Lateral Raise (케이블 레터럴 레이즈) — 케이블을 몸 앞으로 교차 |
| `rear_delt_fly.png` | Reverse Pec Deck (펙 덱 리어 델트) — 가슴을 패드에 붙인다 |
| `upright_row.png` | Barbell Upright Row (바벨 업라이트 로우) — 손 간격은 어깨너비 |
| `db_shrug.png` | Dumbbell Shrug (덤벨 슈러그) — 어깨를 귀 쪽으로 곧게 올린다 |
| `pike_pushup.png` | Pike Push-up (파이크 푸쉬업) — 엉덩이를 높이 든 ㅅ자 자세 |
| `db_curl.png` | Dumbbell Biceps Curl (덤벨 바이셉 컬) — 팔꿈치를 옆구리에 고정 |
| `barbell_curl.png` | Barbell Curl (바벨 바이셉 컬) — 상체를 흔들지 않는다 |
| `hammer_curl.png` | Hammer Curl (덤벨 해머 컬) — 손바닥이 서로 마주 보게 |
| `incline_db_curl.png` | Incline Dumbbell Curl (인클라인 덤벨 컬) — 등을 벤치에 기댄다 |
| `preacher_curl.png` | Preacher Curl (바벨 프리쳐 컬) — 겨드랑이를 패드 끝에 |
| `cable_curl.png` | Cable Curl (케이블 바이셉 컬) — 케이블 앞에 똑바로 선다 |
| `pushdown.png` | Triceps Pushdown (케이블 트라이셉 푸쉬다운) — 팔꿈치를 옆구리에 붙인다 |
| `rope_pushdown.png` | Rope Triceps Extension (케이블 로프 트라이셉 익스텐션) — 로프를 아래에서 양옆으로 벌린다 |
| `overhead_tri_ext.png` | Overhead Triceps Extension (오버헤드 트라이셉스 익스텐션) — 덤벨을 머리 뒤로 내린다 |
| `skull_crusher.png` | Skull Crusher (라잉 바벨 트라이셉 익스텐션) — 누워서 팔을 수직으로 |
| `db_kickback.png` | Dumbbell Kickback (덤벨 킥백) — 상체를 숙이고 팔꿈치를 몸 옆에 |
| `bench_dips.png` | Bench Dips (벤치 딥스) — 손을 벤치 끝에, 엉덩이는 벤치 가까이 |
| `close_grip_bench.png` | Close-grip Bench Press (클로즈 그립 벤치프레스) — 손 간격은 어깨너비 |
| `squat.png` | Barbell Back Squat (바벨 스쿼트) — 발은 어깨너비, 발끝은 살짝 바깥 |
| `bodyweight_squat.png` | Wide Squat (와이드 스쿼트) — 발을 넓게 벌린다 |
| `goblet_squat.png` | Goblet Squat (고블릿 스쿼트) — 덤벨을 가슴 앞에 세워 든다 |
| `front_squat.png` | Front Squat (프론트 스쿼트) — 바를 어깨 앞에 얹는다 |
| `leg_press.png` | Leg Press (레그 프레스) — 허리를 등판에 붙인다 |
| `lunge.png` | Lunge (런지) — 한 발 크게 내딛는다 |
| `walking_lunge.png` | Walking Lunge (워킹 런지) — 상체를 곧게 |
| `bulgarian_split.png` | Bulgarian Split Squat (덤벨 불가리안 스플릿 스쿼트) — 뒷발을 벤치에 올린다 |
| `leg_extension.png` | Leg Extension (레그 익스텐션) — 무릎 축을 기계 축에 맞춘다 |
| `leg_curl.png` | Lying Leg Curl (레그 컬) — 엎드려 골반을 붙인다 |
| `hip_thrust.png` | Hip Thrust (힙 쓰러스트) — 등 위쪽을 벤치에 기댄다 |
| `glute_bridge.png` | Glute Bridge (힙 브릿지) — 누워서 무릎을 세운다 |
| `calf_raise.png` | Calf Raise (카프 레이즈) — 발끝으로 서서 최대한 높이 |
| `sumo_deadlift.png` | Sumo Deadlift (스모 데드리프트) — 발을 넓게, 손은 다리 안쪽 |
| `step_up.png` | Dumbbell Step-up (덤벨 스텝업) — 올라선 발로만 민다 |
| `wall_sit.png` | Wall Sit (월 싯) — 등을 벽에 붙인다 |
| `hip_abduction.png` | Hip Abduction Machine (힙 어브덕션 머신) — 허리를 등받이에 |
| `jump_squat.png` | Jump Squat (점프 스쿼트) — 스쿼트로 앉았다가 |
| `good_morning.png` | Good Morning (굿모닝) — 바를 등에 얹는다 |
| `plank.png` | Plank (플랭크) — 팔꿈치는 어깨 아래 |
| `side_plank.png` | Side Plank (사이드 플랭크) — 팔꿈치를 어깨 아래에 |
| `crunch.png` | Crunch (크런치) — 무릎을 세우고 눕는다 |
| `leg_raise.png` | Leg Raise (레그 레이즈) — 허리를 바닥에 붙인다 |
| `hanging_leg_raise.png` | Hanging Leg Raise (행잉 레그 레이즈) — 철봉에 매달린다 |
| `russian_twist.png` | Russian Twist (러시안 트위스트) — 상체를 뒤로 기울여 버틴다 |
| `bicycle_crunch.png` | Bicycle Crunch (바이시클 크런치) — 팔꿈치와 반대 무릎을 모은다 |
| `dead_bug.png` | Dead Bug (데드 벅) — 누워서 팔다리를 든다 |
| `bird_dog.png` | Bird Dog (버드 독) — 네발 자세 |
| `ab_slide.png` | Ab Wheel Rollout (AB 슬라이드) — 무릎을 대고 시작 |
| `mountain_climber.png` | Mountain Climber (사이드 마운틴 클라이머) — 푸쉬업 자세 |
| `flutter_kick.png` | Flutter Kick (플러터 킥) — 누워서 다리를 살짝 든다 |
| `v_up.png` | V-up (브이 업) — 누워서 팔다리를 뻗는다 |
| `cable_crunch.png` | Cable Crunch (케이블 크런치) — 로프를 머리 옆에 |
| `burpee.png` | Burpee (버피) — 쪼그려 앉아 손을 짚는다 |
| `jumping_jack.png` | Jumping Jack (점핑 잭) — 뛰며 팔다리를 벌린다 |
| `kettlebell_swing.png` | Kettlebell Swing (케틀벨 스윙) — 엉덩이를 뒤로 빼며 케틀벨을 다리 사이로 |
| `thruster.png` | Thruster (쓰러스터) — 프론트 스쿼트로 앉는다 |
| `farmers_walk.png` | Farmer's Walk (파머스워크) — 무거운 덤벨을 양손에 |
| `jump_rope.png` | Jump Rope (줄넘기) — 손목으로 줄을 돌린다 |
| `rowing_machine.png` | Rowing Machine (로잉 머신) — 다리 → 몸통 → 팔 순서로 당긴다 |
| `treadmill.png` | Treadmill Running (트레드밀 러닝) — 상체를 곧게 |
| `cycle.png` | Stationary Bike (싸이클) — 안장 높이는 다리가 거의 펴질 만큼 |
| `stepper.png` | Stair Climber (스텝 밀) — 손잡이에 기대지 않는다 |

## 참고
- 그림이 규칙과 다르게 나오면 "규칙대로 다시" 라고 보내면 됩니다.
- 이미 있는 홈트 플랜 그림(img/home-workout)은 그대로 둡니다.
- 운동 목록 전체(660여 종)는 js/exercise-db.js 에 있고, 자주 쓰는 종목부터 그림을 붙였습니다. 더 필요한 종목은 js/ex-media.js 에 줄을 추가하면 됩니다.
