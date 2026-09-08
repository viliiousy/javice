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
  // 열쇠말은 EX_DB 659개를 실제로 돌려 보며 채웠다. 빠진 게 있으면 그 종목은
  // '기타' 로 밀려나 모든 판단에서 조용히 사라진다 — 그래서 시험이 비율을 지킨다.
  // 실제로 '푸쉬업'(쉬) 이 빠져 있어 가슴 종목 26개가 통째로 새고 있었다.
  GROUPS: [
    { id:'sh',    label:'어깨', push:true,  kw:['숄더','어깨','레이즈','오버헤드','델트','아놀드','비하인드 넥','페이스 풀','랜드마인 프레스','shoulder','raise','overhead','delt','lateral','front raise','arnold'] },
    { id:'chest', label:'가슴', push:true,  kw:['벤치','체스트','가슴','푸시업','푸쉬업','플라이','딥스','풀오버','크로스오버','chest','bench','push up','pushup','fly','dip','pullover','crossover'] },
    { id:'back',  label:'등',   push:false, kw:['로우','랫','풀다운','풀업','친업','데드','등','슈러그','백익스텐션','굿모닝','풀어파트','매달리기','랙풀','슈퍼맨','트랙션','row','lat','pulldown','pull up','pullup','chin','deadlift','shrug','good morning'] },
    { id:'leg',   label:'하체', push:null,  kw:['스쿼트','레그','런지','힙','카프','둔근','하체','스텝업','클램쉘','하이퍼','월싯','덩키킥','풀쓰루','하이드런트','핵','squat','leg','lunge','hip','calf','glute','thrust'] },
    { id:'arm',   label:'팔',   push:null,  kw:['컬','이두','삼두','트라이','킥백','푸시다운','푸쉬다운','curl','bicep','tricep','pushdown'] },
    { id:'core',  label:'코어', push:null,  kw:['복근','플랭크','크런치','레그레이즈','싯업','브이업','니업','사이드밴드','팔로프','버드독','초핑','플래그','러시안트위스트','ab ','abs','plank','crunch','core','sit up','situp'] },
    // 유산소는 볼륨이 없어 판단에서 빠지지만, '기타' 로 뭉뚱그리면 화면이 고장 난 것처럼 보인다.
    // 마지막에 두어 근력 종목이 먼저 잡히게 한다 ('스쿼트 버피' 는 하체로).
    { id:'cardio',label:'유산소', push:null, kw:['러닝','걷기','경보','로잉','사이클','싸이클','바이크','트레드밀','줄넘기','버피','스텝밀','스텝퍼','스텝 머신','엘립티컬','에르그','점핑잭','제자리','마운틴클라이머','배틀로프','running','treadmill','bike','burpee','elliptical','jump rope'] },
  ],

  _ds(d){ const t=new Date(d); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; },
  _daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return this._ds(d); },

  // 이름 맞추기. 같은 종목이 '풀 업' 과 '풀업' 으로 갈려 적힌다 —
  // EX_DB 는 띄어 쓰고 Hevy 번역은 붙여 쓴다. 그래서 공백을 뺀 이름으로도 본다.
  //
  // 다만 낱말 자체에 공백이 있는 열쇠말('ab ', 'push up')은 공백을 빼면 안 된다.
  // 'ab ' 에서 공백을 빼면 'cable' 이 코어로 잡힌다 — c-a-b-l-e 안에 ab 가 들어 있다.
  _match(name, kws){
    const raw  = String(name||'').toLowerCase();
    const tight = raw.replace(/\s+/g, '');
    return kws.some(k => k.includes(' ') ? raw.includes(k) : tight.includes(k));
  },

  group(name){
    for(const g of this.GROUPS){ if(this._match(name, g.kw)) return g; }
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
    let sum=0, n=0, skip=0;
    for(let i=1;i<=days;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      let data; try { data = Diet.getData(d); } catch(e){ continue; }
      const t = Object.values(data||{}).flat();
      if(!t.length) continue;                       // 기록이 없는 날은 0 이 아니라 '모름' 이다
      // 영양정보가 없는 음식이 섞인 날도 빼야 한다. 그걸 0 으로 더하면 평균이 실제보다 낮게
      // 나오고, 그 숫자로 '단백질이 모자라다' 고 말하면 없는 문제를 만들어 내는 셈이다.
      const m = (typeof Diet.sumMacros === 'function') ? Diet.sumMacros(t) : null;
      if(m && m.unknown){ skip++; continue; }
      sum += m ? m.protein : t.reduce((a,x)=>a+(Number(x.protein)||0),0);
      n++;
    }
    return n ? { avg:Math.round(sum/n), days:n, skip } : (skip ? { avg:null, days:0, skip } : null);
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

    // 운동 순서
    const oi = this.orderIssues();
    if(oi.length >= 2){
      const e = oi[oi.length-1];
      out.push({ sev:'info', t:`${e.gl} — 단관절을 먼저 하고 있어요 (${oi.length}회)`,
                 d:`${e.dt}: ${e.iso} → ${e.comp}. 작은 근육이 먼저 지치면 뒤에 오는 다관절에서 들 수 있는 무게가 줄어요. 늘리고 싶은 종목을 앞에 두는 게 보통이에요.` });
    }

    // 종목 구성
    for(const g of this.selectionGaps()){
      out.push({ sev:'info', t:`${g.label}을(를) 단관절로만 하고 있어요`,
                 d:`최근 ${this.WIN}일 ${g.names.join('·')} 등 ${g.iso}세트. 프레스·로우 같은 다관절 종목이 없어요 — 단관절만으로는 무게를 싣기 어려워요.` });
    }

    // 주간 구성
    const wk = this.weekly();
    for(const b of wk.back.slice(0,2)){
      out.push({ sev:'warn', t:`${b.label}을(를) 이틀 연속 했어요`,
                 d:`${b.d0} → ${b.d1}. 같은 부위는 하루 이상 쉬어야 회복돼요.` });
    }
    const lbl = id => (this.GROUPS.find(g=>g.id===id)||{}).label;
    const once = Object.entries(wk.freq).filter(([,n])=>n<=1).map(([id])=>lbl(id)).filter(Boolean);
    const often= Object.entries(wk.freq).filter(([,n])=>n>=Math.max(4,wk.sessions*0.6)).map(([id])=>lbl(id)).filter(Boolean);
    if(once.length && often.length){
      out.push({ sev:'info', t:`${often.join('·')}은 자주, ${once.join('·')}은 ${this.WIN}일에 한 번`,
                 d:`부위마다 주 2회쯤으로 맞추면 한쪽만 앞서가는 걸 줄일 수 있어요.` });
    }

    // 인바디
    const ms = this.trend('ms', 30), wt = this.trend('wt', 30), bf = this.trend('bf', 30);
    if(ms) out.push({ sev: ms.diff>=0 ? 'good':'warn',
      t:`근육량 ${ms.diff>0?'+':''}${ms.diff}kg (30일)`,
      d:`${ms.d0} ${ms.from}kg → ${ms.d1} ${ms.to}kg${ms.est?' · 마지막 값은 추정치':''}` });
    // 인바디와 볼륨을 나란히 놓는다. 같이 움직였다는 것이지 원인이라고 말하지 않는다 —
    // 기록 두 줄로 인과를 단정하면 그건 계산이 아니라 추측이다.
    if(ms && ms.diff < 0){
      const vt = this.volTrend();
      if(vt.prev > 0){
        const dv = Math.round((vt.now - vt.prev) / vt.prev * 100);
        const fmt = v => Math.round(v).toLocaleString('ko-KR');
        if(dv <= -10) out.push({ sev:'warn', t:'볼륨이 줄면서 근육량도 줄었어요',
          d:`최근 ${vt.half}일 ${fmt(vt.now)}kg · 그전 ${vt.half}일 ${fmt(vt.prev)}kg (${dv}%). 같이 움직인 것이지 원인이라고 단정할 수는 없어요.` });
        else out.push({ sev:'info', t:'볼륨은 유지인데 근육량이 줄었어요',
          d:`최근 ${vt.half}일 ${fmt(vt.now)}kg · 그전 ${vt.half}일 ${fmt(vt.prev)}kg (${dv>0?'+':''}${dv}%). 훈련량이 아니라면 먹는 쪽을 먼저 봐요 — 아래 단백질 항목을 확인해 보세요.` });
      }
    }
    if(wt && bf) out.push({ sev:'info',
      t:`체중 ${wt.diff>0?'+':''}${wt.diff}kg · 체지방률 ${bf.diff>0?'+':''}${bf.diff}%`,
      d:`${wt.d0} → ${wt.d1}` });

    // 단백질
    const p = this.proteinAvg(14);
    if(p && p.avg === null){
      out.push({ sev:'info', t:'단백질을 아직 볼 수 없어요',
        d:`최근 ${p.skip}일치 식단에 영양정보가 없는 음식이 섞여 있어요. 그 값을 0 으로 더하면 실제보다 낮게 나와서 세지 않았어요.` });
    } else if(p){
      let goal=null;
      try { goal = Diet.getSettings().proteinGoal; } catch(e){}
      if(goal){
        const pct = Math.round(p.avg/goal*100);
        out.push({ sev: pct<80 ? 'warn':'good',
          t:`단백질 하루 평균 ${p.avg}g (목표 ${goal}g · ${pct}%)`,
          d:`영양정보가 온전한 ${p.days}일 기준${p.skip?` (${p.skip}일은 정보가 빠져 제외)`:''}. ${pct<80?'운동을 늘려도 단백질이 모자라면 근육량은 안 늘어요.':''}` });
      }
    }
    return out;
  },

  // 최근 절반과 그전 절반의 총 볼륨. 인바디 변화와 나란히 놓고 보기 위한 것이다.
  volTrend(){
    const half = Math.floor(this.WIN/2);
    const mid  = this._daysAgo(half);
    const all  = this.workouts(this.WIN);
    const now  = all.filter(w=>w.dt>=mid).reduce((a,w)=>a+(Number(w.vol)||0),0);
    const prev = all.filter(w=>w.dt< mid).reduce((a,w)=>a+(Number(w.vol)||0),0);
    return { now, prev, half };
  },

  // ── 다관절 / 단관절 ─────────────────────
  // 순서 이야기를 하려면 이 구분이 먼저다. 이름으로 가르는 것이라 완벽하지 않아서,
  // 못 가른 것은 판단에서 빼고 '모름' 으로 둔다 — 애매한 걸 억지로 넣으면 조언이 틀린다.
  ISO_KW: ['컬','레이즈','플라이','익스텐션','킥백','푸시다운','슈러그','카프','펙덱','네크',
           'curl','raise','fly','extension','kickback','pushdown','shrug','calf','pec deck'],
  COMP_KW: ['스쿼트','데드','벤치','프레스','로우','풀업','친업','풀다운','런지','딥스','클린','스러스터','힙쓰러스트',
            'squat','deadlift','bench','press','row','pull up','pullup','chin','pulldown','lunge','dip','clean','thrust'],
  kind(name){
    if(this._match(name, this.ISO_KW))  return 'iso';    // 단관절을 먼저 본다 — '레그 익스텐션' 은 프레스가 아니다
    if(this._match(name, this.COMP_KW)) return 'comp';
    return null;
  },

  // ── 운동 순서 ───────────────────────────
  // 같은 부위에서 단관절이 다관절보다 먼저 온 세션을 센다.
  // 한 번은 의도한 것일 수 있다(선피로). 두 번 넘게 되풀이되면 습관이므로 그때만 말한다.
  orderIssues(){
    const hits = [];
    for(const w of this.workouts(this.WIN)){
      const items = (w.items||[]).map(it => ({ n:it.name, g:this.group(it.name).id,
                                               gl:this.group(it.name).label, k:this.kind(it.name) }));
      for(let i=0;i<items.length;i++){
        if(items[i].k!=='iso') continue;
        const later = items.slice(i+1).find(x => x.g===items[i].g && x.k==='comp');
        if(later){ hits.push({ dt:w.dt, iso:items[i].n, comp:later.n, gl:items[i].gl }); break; }
      }
    }
    return hits;
  },

  // ── 종목 구성 ───────────────────────────
  // 어떤 부위를 단관절로만 하고 있으면 짚는다. 레이즈만 스무 세트를 해도
  // 프레스 한 번만큼 무게를 못 싣는다 — 이건 취향이 아니라 지레의 문제다.
  selectionGaps(){
    const g = {};
    for(const w of this.workouts(this.WIN)){
      for(const it of (w.items||[])){
        const grp = this.group(it.name), k = this.kind(it.name);
        if(grp.id==='etc' || !k) continue;
        (g[grp.id] = g[grp.id] || { label:grp.label, comp:0, iso:0, names:new Set() });
        g[grp.id][k==='comp'?'comp':'iso']++;
        g[grp.id].names.add(it.name);
      }
    }
    return Object.values(g)
      .filter(x => x.iso >= 3 && x.comp === 0)
      .map(x => ({ label:x.label, iso:x.iso, names:[...x.names].slice(0,3) }));
  },

  // ── 주간 구성 ───────────────────────────
  // 같은 부위를 이틀 연속 했는지, 부위별로 주 몇 번인지.
  weekly(){
    const byDate = {};
    for(const w of this.workouts(this.WIN)){
      const set = (byDate[w.dt] = byDate[w.dt] || new Set());
      for(const it of (w.items||[])){
        const grp = this.group(it.name);
        if(grp.id!=='etc') set.add(grp.id);
      }
    }
    const dates = Object.keys(byDate).sort();
    const back = [];
    for(let i=1;i<dates.length;i++){
      const d0 = new Date(dates[i-1]+'T00:00:00'), d1 = new Date(dates[i]+'T00:00:00');
      if((d1-d0)/86400000 !== 1) continue;
      for(const id of byDate[dates[i]]){
        if(byDate[dates[i-1]].has(id)){
          const g = this.GROUPS.find(x=>x.id===id);
          back.push({ label:g?g.label:id, d0:dates[i-1], d1:dates[i] });
        }
      }
    }
    const freq = {};
    for(const d of dates) for(const id of byDate[d]) freq[id] = (freq[id]||0)+1;
    return { back, freq, sessions:dates.length };
  },

  // ══ 그날 하나를 본다 ══════════════════════
  //
  // 위의 findings() 는 28일 총평이다. 그건 "요즘 어깨가 많다" 는 말은 해 주지만
  // "어제 그 세션이 어땠나" 는 말해 주지 못한다. 여기서 그날치를 따로 본다.
  //
  // 비교 대상은 언제나 '네 지난 기록' 이다. 권장 세트수 같은 바깥 숫자를 들이대지 않는다 —
  // 출처를 확인할 수 없는 기준으로 남의 훈련을 평가하는 건 지어내는 것과 같다.

  // ds 이전의 기록만. 그날을 평가하려면 그날은 빼고 봐야 한다.
  _prior(ds){
    if(typeof Hevy==='undefined') return [];
    return Hevy.all().filter(w => w && w.dt && w.dt < ds)
                     .sort((a,b)=>String(a.dt).localeCompare(String(b.dt)));
  },
  _median(a){
    const v = a.filter(x=>isFinite(x)).slice().sort((x,y)=>x-y);
    if(!v.length) return null;
    const m = Math.floor(v.length/2);
    return v.length%2 ? v[m] : (v[m-1]+v[m])/2;
  },
  _gapDays(a, b){
    return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00')) / 86400000);
  },
  _dLabel(ds){
    const d = new Date(ds+'T00:00:00');
    return `${d.getMonth()+1}월 ${d.getDate()}일`;
  },

  // 그날 세트에서 볼 수 있는 것만 본다.
  // 맨몸·유산소는 중량이 없으니 중량 이야기를 하지 않는다 — 0kg 이라고 말하면 거짓이다.
  _setStat(sets){
    const ws = (sets||[]).filter(s=>Number(s.w)>0);
    const rs = (sets||[]).filter(s=>Number(s.r)>0);
    return {
      n: (sets||[]).length,
      loaded: ws.length,                       // 중량이 실린 세트
      top: ws.length ? Math.max(...ws.map(s=>Number(s.w))) : null,
      firstR: rs.length ? Number(rs[0].r) : null,
      lastR:  rs.length ? Number(rs[rs.length-1].r) : null,
      reps: rs.length,
    };
  },

  session(ds){
    if(!ds || typeof Hevy==='undefined') return null;
    let ws = [];
    try { ws = Hevy.byDate(ds) || []; } catch(e){ return null; }
    if(!ws.length) return null;

    // 순서를 지켜서 편다. 순서 이야기를 하려면 편 순서가 실제 순서여야 한다.
    const items = ws.flatMap(w => w.items || []);
    if(!items.length) return null;

    const prior = this._prior(ds);
    const out = [];

    // ── 개요 ───────────────────────────────
    const vol   = items.reduce((a,it)=>a+(Number(it.vol)||0), 0);
    const sets  = items.reduce((a,it)=>a+((it.sets||[]).length), 0);
    const min   = ws.reduce((a,w)=>a+(Number(w.min)||0), 0);
    const byG   = {};
    for(const it of items){
      const g = this.group(it.name);
      (byG[g.id] = byG[g.id] || { label:g.label, push:g.push, vol:0, sets:0, names:[] });
      byG[g.id].vol  += Number(it.vol)||0;
      byG[g.id].sets += (it.sets||[]).length;
      byG[g.id].names.push(it.name);
    }
    const parts = Object.values(byG).sort((a,b)=>b.sets-a.sets);
    out.push({ sev:'info', t:`${parts.map(p=>`${p.label} ${p.sets}세트`).join(' · ')}`,
      d:`종목 ${items.length}개 · 총 ${sets}세트`
        + (vol ? ` · 볼륨 ${vol.toLocaleString('ko-KR')}kg` : '')
        + (min ? ` · ${min}분` : '') });

    // ── 이 세션의 크기 ─────────────────────
    // 지난 세션들의 중앙값과 견준다. 평균이 아니라 중앙값인 이유는
    // 유난히 길었던 하루가 기준을 통째로 끌어올리기 때문이다.
    const past = prior.slice(-8).map(w=>Number(w.vol)||0).filter(v=>v>0);
    const med  = this._median(past);
    if(med && vol > 0){
      const r = vol / med;
      if(r >= 1.4) out.push({ sev:'info', t:`평소보다 큰 세션이었어요`,
        d:`직전 ${past.length}회 중앙값 ${Math.round(med).toLocaleString('ko-KR')}kg 대비 ${Math.round((r-1)*100)}% 많아요` });
      else if(r <= 0.6) out.push({ sev:'info', t:`평소보다 가벼운 세션이었어요`,
        d:`직전 ${past.length}회 중앙값 ${Math.round(med).toLocaleString('ko-KR')}kg 대비 ${Math.round((1-r)*100)}% 적어요` });
    }

    // ── 순서 ───────────────────────────────
    // 같은 부위에서 단관절을 다관절보다 먼저 했는가. 그날 실제 순서를 그대로 본다.
    for(let i=0;i<items.length;i++){
      const k = this.kind(items[i].name);
      if(k!=='iso') continue;
      const g = this.group(items[i].name);
      const later = items.slice(i+1).find(x => this.group(x.name).id===g.id && this.kind(x.name)==='comp');
      if(later){
        out.push({ sev:'warn', t:`${g.label}: ${items[i].name} 을 ${later.name} 보다 먼저 했어요`,
          d:`단관절로 먼저 지치면 다관절에서 실을 수 있는 무게가 줄어요. 선피로를 노린 게 아니라면 순서를 바꿔 보세요` });
        break;   // 한 번만 말한다. 같은 말을 종목마다 반복하면 읽히지 않는다
      }
    }

    // ── 종목별로 지난번과 견준다 ────────────
    const bestBefore = {};   // 종목 → { top, dt }
    const lastSeen   = {};   // 종목 → 마지막으로 한 날
    for(const w of prior){
      for(const it of (w.items||[])){
        lastSeen[it.name] = w.dt;
        const t = Number(it.top)||0;
        if(t > 0 && (!bestBefore[it.name] || t > bestBefore[it.name].top))
          bestBefore[it.name] = { top:t, dt:w.dt };
      }
    }
    const pr = [], down = [], fresh = [];
    for(const it of items){
      const st = this._setStat(it.sets);
      if(!lastSeen[it.name]){ fresh.push(it.name); continue; }
      if(st.top == null) continue;                    // 중량이 없는 종목은 중량으로 말하지 않는다
      const b = bestBefore[it.name];
      if(!b) continue;
      if(st.top > b.top)            pr.push({ n:it.name, now:st.top, was:b.top, dt:b.dt });
      else if(st.top < b.top * 0.9) down.push({ n:it.name, now:st.top, was:b.top, dt:b.dt });
    }
    if(pr.length) out.push({ sev:'good', t:`최고 중량을 갱신했어요 — ${pr.map(p=>p.n).join(', ')}`,
      d: pr.map(p=>`${p.n} ${p.was}→${p.now}kg`).join(' · ') });
    if(down.length) out.push({ sev:'info', t:`지난 최고보다 가볍게 들었어요`,
      d: down.map(p=>`${p.n} ${p.now}kg (최고 ${p.was}kg · ${this._dLabel(p.dt)})`).join(' · ')
         + ` — 세트수를 늘렸거나 컨디션 때문일 수 있어요` });
    if(fresh.length) out.push({ sev:'info', t:`처음 해 본 종목 ${fresh.length}개`,
      d: fresh.slice(0,4).join(', ') + ` — 다음에 같은 걸 해야 늘었는지 볼 수 있어요` });

    // ── 세트 안에서의 하락 ──────────────────
    // 첫 세트와 마지막 세트의 반복수 차이. 절반 아래로 떨어졌으면 그 종목에서 이미 다 쓴 것이다.
    const fade = [];
    for(const it of items){
      const st = this._setStat(it.sets);
      if(st.n < 3 || st.reps < 3 || !st.firstR || !st.lastR) continue;
      if(st.lastR <= st.firstR * 0.5) fade.push({ n:it.name, a:st.firstR, b:st.lastR, s:st.n });
    }
    if(fade.length) out.push({ sev:'info', t:`뒤 세트에서 반복수가 많이 떨어졌어요`,
      d: fade.map(f=>`${f.n} ${f.a}회→${f.b}회 (${f.s}세트)`).join(' · ')
         + ` — 무게를 조금 내리거나 세트를 줄이면 마지막까지 같은 질로 할 수 있어요` });

    // ── 부위 간격 ──────────────────────────
    // 같은 부위를 며칠 만에 다시 했는가. 하루 만이면 회복이 안 끝났을 수 있다.
    const lastGroup = {};
    for(const w of prior){
      for(const it of (w.items||[])){
        const g = this.group(it.name);
        if(g.id!=='etc') lastGroup[g.id] = w.dt;
      }
    }
    const tight = [], longGap = [];
    for(const id in byG){
      if(id==='etc' || !lastGroup[id]) continue;
      const g = this._gapDays(lastGroup[id], ds);
      if(g <= 1)      tight.push({ label:byG[id].label, g, dt:lastGroup[id] });
      else if(g >= 10) longGap.push({ label:byG[id].label, g, dt:lastGroup[id] });
    }
    if(tight.length) out.push({ sev:'warn', t:`${tight.map(x=>x.label).join('·')}를 ${tight[0].g===0?'같은 날':'바로 전날'} 또 했어요`,
      d:`직전 ${this._dLabel(tight[0].dt)}에 같은 부위를 했어요. 근육은 쉬는 동안 자라요` });
    if(longGap.length) out.push({ sev:'info', t:`${longGap.map(x=>`${x.label} ${x.g}일 만`).join(' · ')}`,
      d:`오래 쉬었다 하면 처음 한두 번은 무게가 안 나올 수 있어요` });

    // ── 그날 먹은 것 ───────────────────────
    // 운동 전후로 나눠 볼 수는 없다. 기록에 시각이 없으니까. 하루 총량만 말한다.
    if(typeof Diet!=='undefined'){
      try{
        const d = new Date(ds+'T00:00:00');
        const data = Diet.getData(d);
        const all  = Object.values(data||{}).flat();
        if(all.length){
          const m = Diet.sumMacros(all);
          const goals = (typeof Diet.getGoalsForDate==='function') ? Diet.getGoalsForDate(d) : null;
          const pTxt = m.unknown && !m.known ? '—' : `${Math.round(m.protein)}g${m.unknown?'⁺':''}`;
          const cTxt = `${Math.round(m.cal)}kcal`;
          let d2 = `단백질 ${pTxt} · ${cTxt}`;
          if(goals) d2 += ` (목표 ${goals.pro}g · ${goals.cal}kcal)`;
          if(m.unknown) d2 += ` · 영양정보 없는 음식 ${m.unknown}개는 빠져 있어요`;
          d2 += ' — 하루 총량이에요. 운동 전후로 나눠 볼 수는 없어요';
          const low = goals && m.known && m.protein < goals.pro * 0.7;
          out.push({ sev: low ? 'warn' : 'info',
            t: low ? `운동한 날인데 단백질이 목표의 ${Math.round(m.protein/goals.pro*100)}% 였어요` : `그날 먹은 것`,
            d: d2 });
        } else {
          out.push({ sev:'info', t:`그날 식단 기록이 없어요`,
            d:`먹은 걸 남겨 두면 운동한 날과 나란히 볼 수 있어요` });
        }
      }catch(e){ /* 식단을 못 읽어도 운동 피드백은 나와야 한다 */ }
    }

    // ── 그 무렵 인바디 ─────────────────────
    // 같이 움직인 것을 나란히 놓을 뿐, 원인이라고 말하지 않는다.
    if(typeof InBody!=='undefined'){
      try{
        const recs = InBody.getRecords().filter(r=>r&&r.dt);
        const near = recs.filter(r => Math.abs(this._gapDays(r.dt, ds)) <= 10)
                         .sort((a,b)=>Math.abs(this._gapDays(a.dt,ds))-Math.abs(this._gapDays(b.dt,ds)))[0];
        if(near){
          const bits = [];
          if(Number(near.wt)>0) bits.push(`체중 ${near.wt}kg`);
          if(Number(near.ms)>0) bits.push(`근육량 ${near.ms}kg${near.msEst?'(추정)':''}`);
          if(Number(near.bf)>0) bits.push(`체지방률 ${near.bf}%`);
          if(bits.length) out.push({ sev:'info', t:`그 무렵 인바디 — ${bits.join(' · ')}`,
            d:`${this._dLabel(near.dt)} 측정. 이 세션 하나로 몸이 달라지진 않아요, 흐름으로 보세요` });
        }
      }catch(e){ /* 인바디가 없어도 나머지는 나와야 한다 */ }
    }

    return { ds, out, vol, sets, items:items.length, parts };
  },

  sessionHtml(ds){
    let s;
    try { s = this.session(ds); } catch(e){ console.warn('[coach:session]', e); return ''; }
    if(!s) return '';
    const ICON = { warn:'!', good:'✓', info:'·' };
    const warn = s.out.filter(x=>x.sev==='warn').length;
    return `<details class="coach coach-day" open>
      <summary class="coach-sum">${this._dLabel(ds)} 운동 되짚기
        <i>${warn ? `확인 ${warn}건` : `${s.sets}세트`}</i></summary>
      <div class="coach-body">
        ${s.out.map(x=>`<div class="coach-item coach-${x.sev}">
          <span class="coach-dot">${ICON[x.sev]||'·'}</span>
          <div><b>${esc(x.t)}</b>${x.d?`<span>${esc(x.d)}</span>`:''}</div>
        </div>`).join('')}
        <div class="coach-foot">기준은 바깥 훈련법이 아니라 네 지난 기록이에요.</div>
      </div>
    </details>`;
  },

  // ══ 다음 세션 제안 ═══════════════════════
  //
  // 여기서 나오는 숫자는 전부 네 로그에서 계산된 것이다. AI 에게 묻지 않는다.
  // "요즘 AI 운동앱" 이 파는 것의 대부분은 사실 산수인데, 산수는 산수로 하는 게
  // 낫다 — 그래야 숫자마다 "지난주에 이랬으니까" 라고 근거를 댈 수 있다.
  //
  // 목표는 근비대로 둔다. 세트당 8~12회를 채우면 올리고, 못 채우면 그 무게에 머문다.
  // 이 구간만이 바깥에서 가져온 값이고, 나머지는 전부 네 기록에서 나온다.
  REP: { lo:8, hi:12 },
  READY: 2,     // 같은 부위를 다시 하기까지 최소 며칠

  // 증량 폭도 네 기록에서 뽑는다. 사람마다 원판·머신 눈금이 다른데
  // '2.5kg 씩 올리세요' 라고 말하면 그 체육관에 없는 무게를 시키는 셈이다.
  _step(name, prior){
    const tops = new Set();
    for(const w of prior) for(const it of (w.items||[]))
      if(it.name===name && Number(it.top)>0) tops.add(Number(it.top));
    const v = [...tops].sort((a,b)=>a-b);
    let min = null;
    for(let i=1;i<v.length;i++){
      const d = Math.round((v[i]-v[i-1])*10)/10;
      if(d >= 0.5 && (min===null || d < min)) min = d;
    }
    return min ? { step:min, mine:true } : { step:2.5, mine:false };
  },

  // 그 종목을 마지막으로 한 세션에서, 가장 안 나온 세트의 반복수를 본다.
  // 평균이 아니라 최소인 이유: 마지막 세트가 6회였으면 그 무게를 아직 다 못 든 것이다.
  _lastDone(name, prior){
    for(let i=prior.length-1;i>=0;i--){
      const it = (prior[i].items||[]).find(x=>x.name===name);
      if(!it) continue;
      const reps = (it.sets||[]).map(s=>Number(s.r)).filter(v=>v>0);
      const ws   = (it.sets||[]).map(s=>Number(s.w)).filter(v=>v>0);
      return { dt:prior[i].dt, sets:(it.sets||[]).length,
               minRep: reps.length ? Math.min(...reps) : null,
               top: ws.length ? Math.max(...ws) : null };
    }
    return null;
  },

  suggest(ds){
    if(typeof Hevy==='undefined') return null;
    const prior = this._prior(ds);
    if(prior.length < 2) return null;          // 기록이 두 번은 있어야 견줄 것이 생긴다

    const from = this._ds(new Date(new Date(ds+'T00:00:00').getTime() - this.WIN*86400000));
    const win  = prior.filter(w=>w.dt >= from);

    // ── 어느 부위를 할까 ───────────────────
    // 최근에 적게 한 부위 중, 회복할 시간이 지난 것.
    const g = {};
    for(const grp of this.GROUPS) g[grp.id] = { label:grp.label, sets:0, last:null };
    for(const w of win){
      for(const it of (w.items||[])){
        const grp = this.group(it.name);
        if(grp.id==='etc') continue;
        g[grp.id].sets += (it.sets||[]).length;
        if(!g[grp.id].last || w.dt > g[grp.id].last) g[grp.id].last = w.dt;
      }
    }
    // 한 번도 안 한 부위는 후보가 아니라 '할 말' 이다.
    // 세트수 0 이라고 1등으로 올리면, 무게도 종목도 모르는 부위로 계획이 만들어진다 —
    // 그건 제안이 아니라 빈칸이다. 실제로 하고 있는 것 위에서 짜고, 빠진 건 따로 말한다.
    const trained = Object.entries(g).map(([id,v]) => ({ id, ...v,
      gap: v.last ? this._gapDays(v.last, ds) : null })).filter(x => x.sets > 0);
    if(!trained.length) return null;

    const missing = Object.entries(g)
      .filter(([id,v]) => v.sets === 0 && ['chest','back','leg','sh'].includes(id))
      .map(([id,v]) => v.label);

    const ready = trained.filter(x => x.gap >= this.READY).sort((a,b) => a.sets - b.sets);
    if(!ready.length) return { ds, none:'rest' };   // 전부 어제 한 것 — 오늘은 쉬는 게 맞다

    // 유산소는 계획의 주인공이 되지 않는다 — 무게로 짤 수 있는 부위에서만 고른다.
    const lift = ready.filter(x => x.id !== 'cardio');
    if(!lift.length) return { ds, none:'rest' };
    // 팔·코어는 큰 부위에 딸려 오므로 단독 주인공으로 세우지 않는다.
    const main = lift.find(x=>['chest','back','leg','sh'].includes(x.id)) || lift[0];
    const picks = [main];
    const side  = lift.find(x => x!==main && ['arm','core'].includes(x.id));
    if(side) picks.push(side);

    // ── 어떤 종목을 할까 ───────────────────
    // 최근에 실제로 하던 것을 이어 간다. 매번 종목을 바꾸면 늘었는지 볼 수가 없다.
    const items = [];
    for(const p of picks){
      const seen = new Map();      // 이름 → 최근 몇 번 했나
      for(const w of win.slice(-6)){
        for(const it of (w.items||[])){
          if(this.group(it.name).id !== p.id) continue;
          seen.set(it.name, (seen.get(it.name)||0) + 1);
        }
      }
      const names = [...seen.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
      const cap   = p===main ? 4 : 2;
      const chosen = names.slice(0, cap);

      // 다관절만으로는 못 채운 자리는 종목 목록에서 채운다. 무게는 비워 둔다 —
      // 해 본 적 없는 종목의 무게를 우리가 정해 줄 근거는 없다.
      const hasComp = chosen.some(n=>this.kind(n)==='comp');
      if(!hasComp && typeof EX_DB!=='undefined'){
        const pool = EX_DB[p.label] || [];
        const cand = pool.find(n => this.kind(n)==='comp');
        if(cand) chosen.unshift(cand);
      }

      for(const name of chosen){
        const done = this._lastDone(name, prior);
        const kind = this.kind(name);
        if(!done){
          items.push({ name, group:p.label, kind, sets:3, reps:this.REP.lo, weight:null,
                       why:'해 본 적 없는 종목이에요. 가벼운 무게로 한 번 재 보세요', src:'db' });
          continue;
        }
        const sets = Math.max(2, Math.min(5, done.sets || 3));
        if(done.top == null){
          items.push({ name, group:p.label, kind, sets, reps:done.minRep || this.REP.lo, weight:null,
                       why:`${this._dLabel(done.dt)}에 ${sets}세트 했어요 (중량 없는 종목)`, src:'log' });
          continue;
        }
        const st = this._step(name, prior);
        let weight = done.top, reps = this.REP.lo, why;
        if(done.minRep == null){
          reps = this.REP.lo;
          why = `${this._dLabel(done.dt)} ${done.top}kg — 반복수 기록이 없어 같은 무게로 둬요`;
        } else if(done.minRep >= this.REP.hi){
          weight = Math.round((done.top + st.step)*10)/10;
          why = `${this._dLabel(done.dt)}에 ${done.top}kg 로 전 세트 ${done.minRep}회를 채웠어요 → ${st.step}kg 올려요`
              + (st.mine ? '' : ' (여태 증량한 적이 없어 2.5kg 로 잡았어요)');
        } else if(done.minRep >= this.REP.lo){
          reps = done.minRep + 1;
          why = `${this._dLabel(done.dt)}에 ${done.top}kg ${done.minRep}회 — 같은 무게로 한 회 더 노려요`;
        } else {
          reps = this.REP.lo;
          why = `${this._dLabel(done.dt)}에 ${done.top}kg 인데 마지막 세트가 ${done.minRep}회였어요 → 무게 그대로, ${this.REP.lo}회를 먼저 채워요`;
        }
        items.push({ name, group:p.label, kind, sets, reps, weight, why, src:'log' });
      }
    }
    if(!items.length) return null;

    // ── 순서 ───────────────────────────────
    // 다관절을 앞에. 단관절로 먼저 지치면 다관절에서 실을 무게가 줄어든다.
    const rank = it => it.kind==='comp' ? 0 : it.kind==='iso' ? 2 : 1;
    items.sort((a,b) => rank(a)-rank(b));

    // ── 예상 볼륨 ──────────────────────────
    const vol = items.reduce((a,it)=>a + (it.weight ? it.weight*it.reps*it.sets : 0), 0);
    const past = win.slice(-8).map(w=>Number(w.vol)||0).filter(v=>v>0);
    const med  = this._median(past);

    // ── 몸과 먹은 것 ───────────────────────
    const notes = [];
    notes.push({ sev:'info', t:`${picks.map(p=>`${p.label}(최근 ${p.sets}세트 · ${p.gap}일 쉼)`).join(' + ')}`,
      d:`28일 동안 가장 적게 했고 회복할 시간이 지난 부위예요` });
    // 아예 안 한 부위는 계획에 억지로 넣지 않고 여기서 말한다.
    if(missing.length) notes.push({ sev:'warn', t:`28일 동안 ${missing.join('·')}를 한 번도 안 했어요`,
      d:`제안에는 안 넣었어요 — 해 본 적이 없어 무게를 정할 근거가 없거든요. 넣고 싶으면 가볍게 한 번 재 보세요` });
    if(vol && med) notes.push({ sev:'info', t:`예상 볼륨 ${Math.round(vol).toLocaleString('ko-KR')}kg`,
      d:`최근 세션 중앙값 ${Math.round(med).toLocaleString('ko-KR')}kg` });

    // 근비대인데 체중이 내려가고 있으면 그 사실만 말한다. 몇 kcal 먹으라고는 하지 않는다.
    const wt = this.trend('wt', this.WIN);
    if(wt && wt.diff <= -1) notes.push({ sev:'warn', t:`체중이 ${Math.abs(wt.diff)}kg 줄었어요`,
      d:`${wt.d0}→${wt.d1}. 근비대를 노린다면 증량이 잘 안 붙을 수 있어요` });
    const pa = this.proteinAvg(14);
    if(pa && pa.avg != null && typeof Diet!=='undefined'){
      const goal = Diet.getGoalsForDate(new Date(ds+'T00:00:00')).pro;
      if(goal && pa.avg < goal*0.8) notes.push({ sev:'warn', t:`2주 평균 단백질 ${pa.avg}g (목표 ${goal}g)`,
        d:`${pa.days}일치 평균이에요${pa.skip?` · 영양정보가 빈 ${pa.skip}일은 뺐어요`:''}` });
    }

    return { ds, picks, items, vol, med, notes };
  },

  suggestHtml(ds){
    let s;
    try { s = this.suggest(ds); } catch(e){ console.warn('[coach:suggest]', e); return ''; }
    if(!s) return '';
    if(s.none === 'rest') return `<details class="coach coach-plan" open>
      <summary class="coach-sum">다음 세션 제안 <i>오늘은 쉬어요</i></summary>
      <div class="coach-body"><div class="coach-item coach-info">
        <span class="coach-dot">·</span>
        <div><b>모든 부위를 어제까지 했어요</b><span>근육은 쉬는 동안 자라요. 하루 비우고 내일 다시 보세요</span></div>
      </div></div></details>`;
    const ICON = { warn:'!', good:'✓', info:'·' };
    return `<details class="coach coach-plan" open>
      <summary class="coach-sum">다음 세션 제안 <i>${s.picks.map(p=>p.label).join('+')} · ${s.items.length}종목</i></summary>
      <div class="coach-body">
        ${s.items.map((it,i)=>`<div class="plan-row">
          <span class="plan-no">${i+1}</span>
          <div class="plan-main">
            <span class="plan-nm">${esc(it.name)}${it.src==='db'?'<em>새 종목</em>':''}</span>
            <span class="plan-why">${esc(it.why)}</span>
          </div>
          <span class="plan-set">${it.weight!=null?`${it.weight}<i>kg</i> `:''}${it.sets}<i>×</i>${it.reps}</span>
        </div>`).join('')}
        ${s.notes.map(x=>`<div class="coach-item coach-${x.sev}">
          <span class="coach-dot">${ICON[x.sev]||'·'}</span>
          <div><b>${esc(x.t)}</b>${x.d?`<span>${esc(x.d)}</span>`:''}</div>
        </div>`).join('')}
        <div class="coach-foot">전부 네 로그에서 계산했어요. 증량 폭도 네가 여태 써 온 단위예요 — AI 가 지어낸 숫자는 하나도 없어요.</div>
      </div>
    </details>`;
  },

  // ds 를 주면 그날 되짚기를 먼저 보여 준다. 총평은 그 아래 접힌 채로 둔다 —
  // 매일 보는 화면에서 알고 싶은 건 대개 '오늘/어제 그거 어땠나' 다.
  html(ds){
    // 그날 한 게 있으면 되짚고, 없으면 다음 세션을 제안한다.
    // 지난 날짜에 대고 '이렇게 하세요' 라고 말하는 건 뜻이 없으므로 오늘부터만 제안한다.
    let day = ds ? this.sessionHtml(ds) : '';
    if(ds && !day && ds >= this._ds(new Date())) day = this.suggestHtml(ds);
    let f;
    try { f = this.findings(); } catch(e){ console.warn('[coach]', e); return day; }
    if(!f.length) return day;
    const ICON = { warn:'!', good:'✓', info:'·' };
    return day + `<details class="coach">
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
