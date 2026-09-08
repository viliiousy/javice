// js/coach.js — 운동 피드백
//
// 원칙: 여기서 나오는 문장은 전부 네 기록에서 계산된 것이다.
// AI 에게 "어떻게 운동해야 하나" 를 묻지 않는다. 물으면 그럴듯한 말을 지어내고,
// 그 말은 식단에서 겪은 '비요뜨 = 요거트 음료 100kcal' 과 같은 종류의 거짓말이 된다.
// 다만 이쪽은 틀리면 부상으로 이어진다.
//
// 그래서 판단 기준은 셋뿐이다.
//   1) 네 볼륨·빈도·중량의 변화 (Hevy)
//   2) 네 체성분 변화 (인바디)
//   3) 네가 스스로 세운 목표 (식단 설정)
// 바깥 사람의 훈련법을 인용하지 않는다 — 출처를 확인할 수 없는 인용은 지어낸 것과 같다.

const Coach = {
  WIN:  28,     // 부위 균형을 보는 창(일)
  LONG: 42,     // 정체를 보는 창(일)

  // 종목 이름 → 부위. 이름만 보고 가르는 것이라 완벽할 수 없다.
  // 못 가른 것은 버리지 않고 '기타' 로 남긴다 — 조용히 빼면 합이 안 맞는 이유를 알 수 없다.
  // '프레스' 는 가슴과 어깨 양쪽에 쓰이므로, 더 구체적인 낱말을 먼저 본다.
  GROUPS: [
    { id:'sh',    label:'어깨', push:true,  kw:['숄더','어깨','레이즈','오버헤드','델트','shoulder','raise','overhead','delt','lateral','front raise'] },
    { id:'chest', label:'가슴', push:true,  kw:['벤치','체스트','가슴','푸시업','플라이','딥스','chest','bench','push up','pushup','fly','dip'] },
    { id:'back',  label:'등',   push:false, kw:['로우','랫','풀다운','풀업','친업','데드','등','row','lat','pulldown','pull up','pullup','chin','deadlift','shrug','슈러그'] },
    { id:'leg',   label:'하체', push:null,  kw:['스쿼트','레그','런지','힙','카프','둔근','하체','squat','leg','lunge','hip','calf','glute','thrust'] },
    { id:'arm',   label:'팔',   push:null,  kw:['컬','이두','삼두','트라이','킥백','curl','bicep','tricep','pushdown','푸시다운'] },
    { id:'core',  label:'코어', push:null,  kw:['복근','플랭크','크런치','레그레이즈','ab ','abs','plank','crunch','core'] },
  ],

  _ds(d){ const t=new Date(d); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; },
  _daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return this._ds(d); },

  group(name){
    const s = String(name||'').toLowerCase();
    for(const g of this.GROUPS){ if(g.kw.some(k=>s.includes(k))) return g; }
    return { id:'etc', label:'기타', push:null };
  },

  workouts(days){
    if(typeof Hevy==='undefined') return [];
    const from = this._daysAgo(days);
    return Hevy.all().filter(w => w && w.dt && w.dt >= from);
  },

  // ── 부위별 볼륨 ─────────────────────────
  volumes(days){
    const by = {};
    let total = 0;
    for(const w of this.workouts(days)){
      for(const it of (w.items||[])){
        const g = this.group(it.name);
        const v = Number(it.vol)||0;
        if(!by[g.id]) by[g.id] = { label:g.label, push:g.push, vol:0, sets:0 };
        by[g.id].vol  += v;
        by[g.id].sets += (it.sets||[]).length;
        total += v;
      }
    }
    return { by, total };
  },

  // ── 정체 ───────────────────────────────
  // 같은 종목을 3번 이상 한 것만 본다. 두 번으로는 '안 늘었다' 고 말할 수 없다.
  // 앞 절반의 최고 중량과 뒤 절반의 최고 중량을 견준다.
  stalled(){
    const seq = {};
    for(const w of this.workouts(this.LONG).slice().sort((a,b)=>String(a.dt).localeCompare(String(b.dt)))){
      for(const it of (w.items||[])){
        const top = Number(it.top)||0;
        if(top<=0) continue;                       // 맨몸·유산소는 중량으로 볼 수 없다
        (seq[it.name] = seq[it.name] || []).push({ dt:w.dt, top, vol:Number(it.vol)||0 });
      }
    }
    const out=[];
    for(const [name, arr] of Object.entries(seq)){
      if(arr.length < 3) continue;
      const half = Math.floor(arr.length/2);
      const a = Math.max(...arr.slice(0,half).map(x=>x.top));
      const b = Math.max(...arr.slice(half).map(x=>x.top));
      const va = Math.max(...arr.slice(0,half).map(x=>x.vol));
      const vb = Math.max(...arr.slice(half).map(x=>x.vol));
      if(b <= a && vb <= va) out.push({ name, n:arr.length, top:b, since:arr[0].dt });
    }
    return out.sort((x,y)=>y.n-x.n).slice(0,3);
  },

  // ── 인바디 추세 ─────────────────────────
  trend(key, days){
    if(typeof InBody==='undefined') return null;
    let recs;
    try { recs = InBody.getRecords().filter(r=>Number(r[key])>0); } catch(e){ return null; }
    if(recs.length < 2) return null;
    const from = this._daysAgo(days);
    const late = recs.filter(r=>r.dt>=from);
    if(!late.length) return null;
    const first = late[0], last = late[late.length-1];
    if(first===last) return null;
    return { from:Number(first[key]), to:Number(last[key]),
             diff:+(Number(last[key])-Number(first[key])).toFixed(1),
             d0:first.dt, d1:last.dt, est:!!last.msEst };
  },

  // ── 단백질 ─────────────────────────────
  proteinAvg(days){
    if(typeof Diet==='undefined') return null;
    let sum=0, n=0;
    for(let i=1;i<=days;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      let data; try { data = Diet.getData(d); } catch(e){ continue; }
      const t = Object.values(data||{}).flat();
      if(!t.length) continue;                       // 기록이 없는 날은 0 이 아니라 '모름' 이다
      sum += t.reduce((a,x)=>a+(Number(x.protein)||0),0);
      n++;
    }
    return n ? { avg:Math.round(sum/n), days:n } : null;
  },

  // ── 판단 ───────────────────────────────
  findings(){
    const out=[];
    const ws = this.workouts(this.WIN);

    if(ws.length < 2){
      out.push({ sev:'info', t:`최근 ${this.WIN}일 운동 기록이 ${ws.length}회예요`,
                 d:'기록이 3회 이상 쌓이면 부위 균형과 정체를 볼 수 있어요.' });
      return out;
    }

    // 빈도
    const perWeek = +(ws.length / (this.WIN/7)).toFixed(1);
    out.push({ sev: perWeek<2 ? 'warn' : 'good',
               t:`주 ${perWeek}회 운동 중`,
               d:`최근 ${this.WIN}일 동안 ${ws.length}회. ${perWeek<2?'주 2회 아래로는 근육량 유지가 어려워요.':''}` });

    // 밀기 / 당기기
    const { by, total } = this.volumes(this.WIN);
    const push = Object.values(by).filter(g=>g.push===true).reduce((a,g)=>a+g.vol,0);
    const pull = Object.values(by).filter(g=>g.push===false).reduce((a,g)=>a+g.vol,0);
    if(push>0 && pull>0){
      const r = push/pull;
      if(r > 1.6 || r < 0.62){
        const many = r>1.6 ? '미는 운동' : '당기는 운동';
        const few  = r>1.6 ? '당기는 운동(등)' : '미는 운동(가슴·어깨)';
        out.push({ sev:'warn', t:`${many}이 ${few}보다 ${(r>1?r:1/r).toFixed(1)}배 많아요`,
                   d:`밀기 ${Math.round(push).toLocaleString('ko-KR')}kg · 당기기 ${Math.round(pull).toLocaleString('ko-KR')}kg. 한쪽만 쌓이면 어깨가 앞으로 말려요.` });
      } else {
        out.push({ sev:'good', t:'밀기와 당기기가 균형에 가까워요',
                   d:`밀기 ${Math.round(push).toLocaleString('ko-KR')}kg · 당기기 ${Math.round(pull).toLocaleString('ko-KR')}kg` });
      }
    } else if(push>0 && pull===0){
      out.push({ sev:'warn', t:'당기는 운동(등) 기록이 없어요',
                 d:`최근 ${this.WIN}일 등 볼륨 0kg. 미는 운동만 하면 어깨가 앞으로 말려요.` });
    }

    // 안 건드린 부위
    const missing = this.GROUPS.filter(g=>!by[g.id] || by[g.id].vol===0).map(g=>g.label);
    if(missing.length && total>0){
      out.push({ sev:'info', t:`${missing.join('·')} 기록이 없어요`,
                 d:`최근 ${this.WIN}일 기준. 종목 이름으로 가른 것이라 다르게 부른 건 '기타' 로 빠졌을 수 있어요.` });
    }

    // 정체
    for(const s of this.stalled()){
      out.push({ sev:'warn', t:`${s.name} — ${s.n}번째 같은 중량`,
                 d:`최고 ${s.top}kg 에서 안 올라가고 있어요(${s.since} 이후). 중량이든 횟수든 하나는 올릴 때예요.` });
    }

    // 인바디
    const ms = this.trend('ms', 30), wt = this.trend('wt', 30), bf = this.trend('bf', 30);
    if(ms) out.push({ sev: ms.diff>=0 ? 'good':'warn',
      t:`근육량 ${ms.diff>0?'+':''}${ms.diff}kg (30일)`,
      d:`${ms.d0} ${ms.from}kg → ${ms.d1} ${ms.to}kg${ms.est?' · 마지막 값은 추정치':''}` });
    if(wt && bf) out.push({ sev:'info',
      t:`체중 ${wt.diff>0?'+':''}${wt.diff}kg · 체지방률 ${bf.diff>0?'+':''}${bf.diff}%`,
      d:`${wt.d0} → ${wt.d1}` });

    // 단백질
    const p = this.proteinAvg(14);
    if(p){
      let goal=null;
      try { goal = Diet.getSettings().proteinGoal; } catch(e){}
      if(goal){
        const pct = Math.round(p.avg/goal*100);
        out.push({ sev: pct<80 ? 'warn':'good',
          t:`단백질 하루 평균 ${p.avg}g (목표 ${goal}g · ${pct}%)`,
          d:`기록이 있는 ${p.days}일 기준. ${pct<80?'운동을 늘려도 단백질이 모자라면 근육량은 안 늘어요.':''}` });
      }
    }
    return out;
  },

  html(){
    let f;
    try { f = this.findings(); } catch(e){ console.warn('[coach]', e); return ''; }
    if(!f.length) return '';
    const ICON = { warn:'!', good:'✓', info:'·' };
    return `<details class="coach">
      <summary class="coach-sum">운동 피드백 <i>${f.filter(x=>x.sev==='warn').length}건 확인 필요</i></summary>
      <div class="coach-body">
        ${f.map(x=>`<div class="coach-item coach-${x.sev}">
          <span class="coach-dot">${ICON[x.sev]||'·'}</span>
          <div><b>${x.t}</b>${x.d?`<span>${x.d}</span>`:''}</div>
        </div>`).join('')}
        <div class="coach-foot">모두 네 Hevy·인바디·식단 기록에서 계산한 값이에요. 바깥 사람의 훈련법을 인용하지 않았어요.</div>
      </div>
    </details>`;
  },
};
