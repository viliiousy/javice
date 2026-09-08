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
    const s = String(name||'').toLowerCase();
    if(this.ISO_KW.some(k=>s.includes(k)))  return 'iso';    // 단관절을 먼저 본다 — '레그 익스텐션' 은 프레스가 아니다
    if(this.COMP_KW.some(k=>s.includes(k))) return 'comp';
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
