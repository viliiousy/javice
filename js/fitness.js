// js/fitness.js — 운동 트래커 (갓생일지 4분할 커팅 루틴)

const Fitness = {
  PLAN: {
    0: { name: '휴식', emoji: '😴', exercises: [] },
    1: { name: '가슴 + 삼두', emoji: '💪', exercises: [
      { name: '벤치프레스',       sets: '4 x 10' },
      { name: '인클라인 덤벨 프레스', sets: '3 x 12' },
      { name: '케이블 플라이',    sets: '3 x 15' },
      { name: '딥스',            sets: '3 x 12' },
      { name: '케이블 푸시다운', sets: '3 x 15' },
      { name: '오버헤드 익스텐션', sets: '3 x 12' },
    ]},
    2: { name: '등 + 이두', emoji: '🔙', exercises: [
      { name: '데드리프트',       sets: '4 x 8'  },
      { name: '랫풀다운',         sets: '4 x 12' },
      { name: '시티드 로우',     sets: '3 x 12' },
      { name: '원암 덤벨 로우',  sets: '3 x 12' },
      { name: '바벨 컬',          sets: '3 x 12' },
      { name: '해머 컬',          sets: '3 x 12' },
    ]},
    3: { name: '어깨 + 팔', emoji: '🦾', exercises: [
      { name: '오버헤드 프레스',  sets: '4 x 10' },
      { name: '레터럴 레이즈',   sets: '4 x 15' },
      { name: '페이스 풀',       sets: '3 x 15' },
      { name: '업라이트 로우',   sets: '3 x 12' },
      { name: '케이블 컬',        sets: '3 x 15' },
      { name: '스컬크러셔',       sets: '3 x 12' },
    ]},
    4: { name: '하체', emoji: '🦵', exercises: [
      { name: '스쿼트',           sets: '5 x 8'  },
      { name: '레그 프레스',     sets: '4 x 12' },
      { name: '레그 컬',          sets: '3 x 15' },
      { name: '레그 익스텐션',   sets: '3 x 15' },
      { name: '카프 레이즈',     sets: '4 x 20' },
      { name: '힙 쓰러스트',     sets: '3 x 12' },
    ]},
    5: { name: '크로스핏 + 복근', emoji: '🔥', exercises: [
      { name: '크로스핏 WOD',    sets: '1 세션'    },
      { name: '시티드 니업',     sets: '50개'       },
      { name: '크런치',           sets: '50개'       },
      { name: '레그레이즈',       sets: '50개'       },
      { name: '오블리크 크런치', sets: '50개'       },
      { name: '바이시클 킥',     sets: '100개'      },
      { name: '플랭크',           sets: '1분 30초'  },
    ]},
    6: { name: '유산소 + 주짓수', emoji: '🥋', exercises: [
      { name: 'Zone 2 유산소',   sets: '30-45분' },
      { name: '주짓수',           sets: '1 세션'  },
    ]},
  },

  _key() { return `gl_fitness_${new Date().toDateString()}`; },
  _checked() { return JSON.parse(localStorage.getItem(this._key()) || '[]'); },
  _save(v)   { localStorage.setItem(this._key(), JSON.stringify(v)); },

  render(dayIdx = null) {
    const day  = dayIdx !== null ? dayIdx : new Date().getDay();
    const plan = this.PLAN[day];
    const chk  = this._checked();
    const container = document.getElementById('fitnessWrap');

    document.getElementById('fitBadge').textContent = `${plan.emoji} ${plan.name}`;
    document.getElementById('fitBadge').className   = plan.exercises.length ? 'badge badge-accent' : 'badge';

    if (!plan.exercises.length) {
      container.innerHTML = `<div style="text-align:center;padding:24px 16px;color:var(--text2)">
        <div style="font-size:48px;margin-bottom:10px">😴</div>
        <p>오늘은 휴식일입니다.<br><span style="color:var(--text3);font-size:12px">잘 쉬고 내일을 준비하세요!</span></p>
      </div>`;
      return;
    }

    const done = plan.exercises.filter((_, i) => chk.includes(i)).length;
    const pct  = Math.round(done / plan.exercises.length * 100);
    const DOW  = ['일','월','화','수','목','금','토'];

    container.innerHTML = `
      <div class="fit-tabs">
        ${DOW.map((d, i) => `<button class="fit-tab${i === day ? ' active' : ''}" onclick="Fitness.render(${i})">${d}</button>`).join('')}
      </div>
      ${plan.exercises.map((ex, i) => `
        <div class="ex-item${chk.includes(i) ? ' done' : ''}" onclick="Fitness.toggle(${i},${day})">
          <div class="ex-chk">${chk.includes(i) ? '✓' : ''}</div>
          <span class="ex-name">${ex.name}</span>
          <span class="ex-sets">${ex.sets}</span>
        </div>`).join('')}
      <div class="fit-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-txt">${done}/${plan.exercises.length} (${pct}%)</span>
      </div>`;
  },

  toggle(idx, day) {
    if (day !== new Date().getDay()) return; // 오늘 날짜만 토글 가능
    const chk = this._checked();
    const i   = chk.indexOf(idx);
    if (i === -1) chk.push(idx); else chk.splice(i, 1);
    this._save(chk);
    this.render(day);
  },
};
