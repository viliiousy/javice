// js/fit-picker.js — 종목 고르기 · 직접 만든 운동 · 운동 하나 고르기
// fitness.js 의 Fitness 에서 떼어 낸 부분. fitness.js 다음에 읽는다(같은 객체에 메서드를 더한다).
Object.assign(Fitness, {
  // ── 종목 고르기 ───────────────────────
  // god_life 에 있던 종목 659개를 되살렸다. 예전엔 이름을 매번 손으로 쳐야 했다.
  DEFAULT_SETS: '3×12',
  ytUrl(name){
    // 원본 EX_DB 의 3번째 필드가 659개 전부 이 규칙과 일치해서 저장하지 않고 만든다
    return 'https://www.youtube.com/results?search_query=' +
      encodeURIComponent(String(name).replace(/ /g,'+') + '+운동+자세');
  },
  // 초성 테이블 — js/diet.js 에도 같은 게 있다. 두 모듈을 엮지 않으려고 따로 둔다.
  CHO: ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'],
  _cho(str){
    let out='';
    for(const ch of String(str)){
      const c=ch.charCodeAt(0)-0xAC00;
      out += (c>=0 && c<11172) ? this.CHO[Math.floor(c/588)] : ch;
    }
    return out;
  },
  _favKey(){ return 'gl_fitness_favs'; },
  getFavs(){ try{ return JSON.parse(UserStore.get(this._favKey())||'[]'); }catch{ return []; } },
  toggleFav(name){
    const f=this.getFavs(); const i=f.indexOf(name);
    if(i===-1) f.push(name); else f.splice(i,1);
    UserStore.set(this._favKey(), JSON.stringify(f));
    FirebaseSync?.scheduleSave();
    this._paintPick();
  },
  _parts(){ this._syncMyEx(); const k=Object.keys(typeof EX_DB!=='undefined' ? EX_DB : {}); return k.includes('내 운동') ? ['내 운동', ...k.filter(x=>x!=='내 운동')] : k; },
  _search(part, q){
    if(typeof EX_DB==='undefined') return [];
    this._syncMyEx();
    let src = part && EX_DB[part] ? EX_DB[part].map(n=>[part,n])
              : Object.entries(EX_DB).flatMap(([p,ns])=>ns.map(n=>[p,n]));
    q=String(q||'').trim();
    // 추천하지 않을 기구·운동은 목록에서 뺀다(설정 › 맞춤 플랜)
    if(typeof PlanGen!=='undefined') src=src.filter(([,n])=>PlanGen.pickerOk(n));
    // 기구로 거르기(맨몸·덤벨·바벨·머신 …) — 부위와 같이 쓸 수 있다
    if(this._eq && typeof PlanGen!=='undefined') src=src.filter(([,n])=>PlanGen.equipOf(n)===this._eq);
    const favs=this.getFavs();
    if(!q){
      // 검색어가 없으면 즐겨찾기를 위로 올려 그대로 보여준다 (god_life 와 같은 규칙)
      const fav=src.filter(([,n])=>favs.includes(n));
      const rest=src.filter(([,n])=>!favs.includes(n));
      return fav.concat(rest).slice(0,60);
    }
    // 띄어쓰기는 보지 않는다 — '원암덤벨' 과 '원 암 덤벨' 이 같은 운동을 찾는다
    const sp=v=>String(v).replace(/\s+/g,'');
    const lower=sp(q.toLowerCase()), qc=sp(q), isCho=/^[ㄱ-ㅎ]+$/.test(qc);
    const out=[];
    for(const [p,n] of src){
      const nm=sp(n.toLowerCase());
      let rank=-1;
      if(isCho){
        const ch=sp(this._cho(n));
        if(ch.startsWith(qc)) rank=1; else if(ch.includes(qc)) rank=3;
      } else {
        if(nm===lower) rank=0;
        else if(nm.startsWith(lower)) rank=1;
        else if(nm.includes(lower)) rank=2;
        else if(sp(this._cho(n)).includes(qc)) rank=4;
      }
      if(rank<0) continue;
      out.push([favs.includes(n)?-1:rank, n.length, p, n]);
    }
    out.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    return out.slice(0,60).map(x=>[x[2],x[3]]);
  },
  _paintPick(){
    document.querySelectorAll('.fz-pick .ex-part[data-part]').forEach(b=>
      b.classList.toggle('on', b.dataset.part === (this._part || '')));
    document.querySelectorAll('.fz-pick .ex-eq').forEach(b=>
      b.classList.toggle('on', b.dataset.eq === (this._eq || '')));
    const box=document.getElementById('exResults');
    if(box) box.innerHTML=this._pickHtml();
    const cart=document.getElementById('exCart');
    if(cart) cart.innerHTML=this._cartHtml();
    const btn=document.getElementById('exCommit');
    if(btn){
      const n=(this._cart||[]).length;
      btn.disabled=!n;
      btn.textContent = n ? (this._rid !== undefined ? `루틴 저장 · ${n}종목` : this._freeDs ? `이 ${n}종목으로 정하기` : `${n}개 추가`) : '운동을 골라 주세요';
    }
  },
  _pickHtml(){
    const hits=this._search(this._part, this._q);
    this._hits=hits;
    const q=String(this._q||'').trim();
    // 목록에 없는 운동도 이름만 쳐서 바로 넣을 수 있다.
    const own = q && !hits.some(h=>h[1].replace(/\s+/g,'')===q.replace(/\s+/g,''))
      ? `<div class="ex-row ex-own" onclick="Fitness.pickOwn()"><span class="ex-th ex-th-own">${this._ic('plus')}</span><span class="ex-row-main"><span class="ex-row-nm">'${esc(q)}' 직접 만들기</span><span class="ex-row-part">목록에 없는 운동</span></span></div>` : '';
    if(!hits.length) return own || '<div class="ex-empty">결과가 없습니다</div>';
    const favs=this.getFavs(), inCart=new Set((this._cart||[]).map(x=>x.name));
    return own + hits.map(([p,n],i)=>{
      const fv=favs.includes(n), got=inCart.has(n);
      const th=typeof ExMedia!=='undefined'?ExMedia.thumbFor(n):'';
      return `<div class="ex-row${th?' has-th':''}${got?' got':''}">
        <span class="ex-th${th?'':' none'}" onclick="Fitness.pick(${i})">${th?ExMedia.poseHtml(th):''}</span>
        <span class="ex-row-main" onclick="Fitness.pick(${i})">
          <span class="ex-row-nm">${esc(n)}</span><span class="ex-row-part">${esc(p)}${(e=>e&&p!=='스포츠'&&p!=='내 운동'?' · '+e:'')(this.eqName(n))}${got?' · 담음':''}</span>
        </span>
        <button class="ex-fav${fv?' on':''}" title="즐겨찾기" aria-label="즐겨찾기" aria-pressed="${fv}"
          onclick="event.stopPropagation();Fitness.toggleFav('${n.replace(/'/g,'&#39;')}')">${this._ic('star') || (fv?'★':'☆')}</button>
        <a class="ex-yt" href="${this.ytUrl(n)}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()" title="자세 영상" aria-label="자세 영상">${this._ic('play') || '▶'}</a>
      </div>`;
    }).join('');
  },
  _cartHtml(){
    const c=this._cart||[];
    if(!c.length) return '';
    return `<div class="ex-cart"><div class="ex-cart-hd">고른 운동 <span class="num">${c.length}</span></div>` +
      c.map((x,i)=>`<div class="ex-cart-row">
        <span class="ex-cart-nm">${esc(x.name)}</span>
        <input class="inp inp-sm ex-cart-sets num" value="${esc(x.sets)}"
          onchange="Fitness.cartSets(${i}, this.value)" aria-label="세트">
        <button class="ex-cart-del" onclick="Fitness.cartRemove(${i})" aria-label="빼기">${this._ic('x') || '✕'}</button>
      </div>`).join('') + '</div>';
  },
  pick(i){
    const hit=(this._hits||[])[i]; if(!hit) return;
    const name=hit[1];
    if(!this._cart) this._cart=[];
    if(this._cart.some(x=>x.name===name)){ App.showToast('이미 골랐어요'); return; }
    this._cart.push({ name, sets:this.defSets(name) });
    this._paintPick();
  },
  pickOwn(prefill){
    const q = prefill!=null ? prefill : String(this._q||'').trim().slice(0,40);
    this.makeEx(q, name=>{
      if(!this._cart) this._cart=[];
      if(this._cart.some(x=>x.name===name)){ App.showToast('이미 골랐어요'); return; }
      this._cart.push({ name, sets:this.defSets(name) });
      this._paintPick();
    });
  },

  // ── 직접 만든 운동 ─────────────────────
  // 목록에 없는 운동을 이름 + 종류(근력 부위 / 유산소 / 스포츠)로 저장해 두고, 다음부터 검색·교체·추가에 같이 나온다.
  MYEX_KEY: 'gl_fit_myex',   // [{ n:'주짓수 드릴', p:'스포츠' }]
  myEx(){ try{ const v=JSON.parse(UserStore.get(this.MYEX_KEY)||'[]'); return Array.isArray(v)?v.filter(x=>x&&x.n):[]; }catch{ return []; } },
  // 운동 이름마다 부위를 물을 때 쓴다(카드 한 번에 수십 번) — 읽기만 하므로 파싱해 둔 값으로 찾는다
  myPart(n){ const v=UserStore.json(this.MYEX_KEY, null); const x=Array.isArray(v)?v.find(e=>e&&e.n===n):null; return x ? x.p : null; },
  _syncMyEx(){
    if(typeof EX_DB==='undefined') return;
    const l=this.myEx(); if(l.length) EX_DB['내 운동']=l.map(x=>x.n); else delete EX_DB['내 운동'];
  },
  saveMyEx(n, p){
    const l=this.myEx().filter(x=>x.n!==n); l.unshift({ n, p }); UserStore.set(this.MYEX_KEY, JSON.stringify(l.slice(0,200)));
    FirebaseSync?.scheduleSave(); this._syncMyEx();
  },
  delMyEx(n){ UserStore.set(this.MYEX_KEY, JSON.stringify(this.myEx().filter(x=>x.n!==n))); FirebaseSync?.scheduleSave(); this._syncMyEx(); },
  defMin(n){ return typeof PlanGen!=='undefined' && PlanGen.partOf(n)==='스포츠' ? 60 : 30; },
  // 오늘의 운동 줄에서 유산소·스포츠의 시간 고치기(무게 기록 대신) — 그날 목록에 저장한다
  timeSheet(name, ds){
    const d=new Date(ds+'T00:00:00'); const list=this.exercisesFor(d).list; const i=list.findIndex(x=>x.name===name); if(i<0) return;
    const c=this.cardio(list[i].sets, name);
    const save=(m, kmh)=>{ this.applyList(ds, list.map((e,k)=>({ ...e, sets:k===i?this.cardioSets(name, m, kmh):e.sets })), 'day'); this.render(d); try{ Haptic.light(); }catch(e){} };
    NumIn.open({ title:name+' 시간', unit:'분', dec:false, hm:true, cur:c.min,
      done:val=>{ const m=Math.max(1,Math.min(600,Math.round(Number(val)||0))); if(!m) return;
        if(this.isRun(name)||this.isTread(name)) setTimeout(()=>this.speedSheet(name, c.kmh, kmh=>save(m, kmh), ()=>save(m, c.kmh)), 250); else save(m, null); } });
  },
  cardioSets(name, m, kmh){ return `${m}분${kmh?` · ${this.speedTxt(name, kmh)}`:''}`; },
  // 러닝: 페이스(1km 에 몇 분 몇 초) · 트레드밀: 속도(km/h) — 숫자 바퀴로 고른다
  speedSheet(name, kmh, done, cancel){
    const W=typeof Wheel!=='undefined'?Wheel:null; if(!W){ done(kmh); return; }
    if(this.isTread(name)){
      const v=kmh||8;
      W.open({ title:`${name} 속도`, unit:'km/h', cols:[{ vals:Array.from({length:23},(_,k)=>k+2), cur:Math.floor(v) },{ vals:Array.from({length:10},(_,k)=>k), cur:Math.round((v%1)*10)%10, fmt:x=>'.'+x }],
        done:([a,b])=>done(Math.round((a+b/10)*10)/10), cancel });   // 0.1km/h 단위
    } else {
      const sec=kmh?Math.round(3600/kmh):360;
      W.open({ title:`${name} 페이스 (1km)`, unit:'/km', cols:[{ vals:Array.from({length:13},(_,k)=>k+3), cur:Math.min(15,Math.max(3,Math.floor(sec/60))), fmt:x=>x+'분' },{ vals:Array.from({length:60},(_,k)=>k), cur:sec%60, fmt:x=>String(x).padStart(2,'0')+'초' }],
        done:([a,b])=>done(Math.round(3600/Math.max(60,a*60+b)*100)/100), cancel });   // 1초 단위(속도는 소수 둘째 자리까지 기억해 페이스가 그대로 돌아오게)
    }
  },
  defSets(n){ const p=typeof PlanGen!=='undefined'?PlanGen.partOf(n):null; return p==='스포츠' ? '60분' : p==='유산소' ? '30분' : this.DEFAULT_SETS; },
  // 운동 만들기 시트 — 지금 열린 창(고르기·교체) 위에 얹어서, 고르던 목록이 날아가지 않게 한다
  makeEx(name, done){
    document.getElementById('myExSheet')?.remove();
    const PARTS=['가슴','등','어깨','하체','이두','삼두','복근','전완근','전신'];
    this._mx={ done, kind:'str', part:'전신' };
    const old = name ? this.myEx().find(x=>x.n===name) : null;
    if(old){ this._mx.kind = old.p==='스포츠'?'sport':old.p==='유산소'?'cardio':'str'; if(this._mx.kind==='str') this._mx.part=old.p; }
    else if(name && typeof PlanGen!=='undefined'){ const g=(EX_DB['스포츠']||[]).some(x=>name.includes(x)) ? '스포츠' : PlanGen.partOf(name); if(g==='스포츠') this._mx.kind='sport'; else if(g==='유산소') this._mx.kind='cardio'; else if(PARTS.includes(g)) this._mx.part=g; }
    const el=document.createElement('div'); el.id='myExSheet'; el.className='mx-ov';
    el.innerHTML=`<div class="mx-sh" role="dialog" aria-label="운동 직접 만들기">
      <div class="mx-hd"><b>운동 직접 만들기</b><button class="mx-x" onclick="Fitness._mxClose()" aria-label="닫기">${this._ic('x')||'✕'}</button></div>
      <label class="mx-lbl" for="mxName">이름</label>
      <input id="mxName" class="inp" maxlength="40" placeholder="예: 주짓수 드릴, 케이블 크로스오버" value="${esc(name||'')}">
      <div class="mx-lbl">어떻게 하나요</div>
      <div class="mx-seg">
        <button type="button" data-k="str">근력<small>세트 · 횟수 · 무게</small></button>
        <button type="button" data-k="cardio">유산소<small>분</small></button>
        <button type="button" data-k="sport">스포츠<small>분</small></button>
      </div>
      <div class="mx-parts"><div class="mx-lbl">주로 쓰는 부위</div><div class="mx-chips">${PARTS.map(p=>`<button type="button" data-p="${p}">${p}</button>`).join('')}</div></div>
      <button class="mx-go" onclick="Fitness._mxSave()">추가</button>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e=>{
      if(e.target===el) return this._mxClose();
      const k=e.target.closest('[data-k]'), p=e.target.closest('[data-p]');
      if(k){ this._mx.kind=k.dataset.k; this._mxPaint(); }
      if(p){ this._mx.part=p.dataset.p; this._mxPaint(); }
    });
    this._mxPaint();
    requestAnimationFrame(()=>{ el.classList.add('on'); if(!name) document.getElementById('mxName')?.focus(); });
  },
  _mxPaint(){
    const el=document.getElementById('myExSheet'), m=this._mx; if(!el||!m) return;
    el.querySelectorAll('[data-k]').forEach(b=>b.classList.toggle('on', b.dataset.k===m.kind));
    el.querySelectorAll('[data-p]').forEach(b=>b.classList.toggle('on', b.dataset.p===m.part));
    el.querySelector('.mx-parts').hidden = m.kind!=='str';
  },
  _mxClose(){ const el=document.getElementById('myExSheet'); if(el){ el.classList.remove('on'); setTimeout(()=>el.remove(), 200); } this._mx=null; },
  _mxSave(){
    const m=this._mx, n=(document.getElementById('mxName')?.value||'').trim().replace(/\s+/g,' ').slice(0,40);
    if(!m) return;
    if(!n){ App.showToast('운동 이름을 입력해 주세요','error'); return; }
    const p = m.kind==='sport' ? '스포츠' : m.kind==='cardio' ? '유산소' : m.part;
    const inDb = typeof EX_DB!=='undefined' && Object.entries(EX_DB).some(([k,v])=>k!=='내 운동' && v.includes(n));
    if(!inDb) this.saveMyEx(n, p);
    const done=m.done; this._mxClose();
    App.showToast(inDb ? `${n} 을(를) 넣었습니다` : `'${n}' 을(를) 내 운동에 저장했습니다`, 'success');
    try{ done && done(n); }catch(e){ console.warn(e); }
  },
  cartSets(i,v){ const x=(this._cart||[])[i]; if(x) x.sets=String(v||'').trim(); },
  cartRemove(i){ if(this._cart){ this._cart.splice(i,1); this._paintPick(); } },
  setPart(p){ this._part = (p==null || this._part===p) ? null : p; this._paintPick(); },
  setEq(e){ this._eq = (e==null || this._eq===e) ? null : e; this._paintPick(); },
  // 고르기 창의 기구 칩 — 쓰는 순서(플랜핏 운동 가이드의 기구 분류와 같은 묶음, 케이블·TRX 는 따로)
  PICK_EQ: [['body','맨몸'],['dumbbell','덤벨'],['barbell','바벨'],['machine','머신'],['cable','케이블'],['bar','철봉·딥스바'],['band','밴드'],['kettlebell','케틀벨'],['trx','TRX·링'],['etc','기타 기구']],
  eqName(n){ const e=typeof PlanGen!=='undefined'?PlanGen.equipOf(n):''; return (this.PICK_EQ.find(x=>x[0]===e)||[])[1]||''; },
  setQ(v){ this._q=v; this._paintPick(); },

  showInlineAdd(date) {
    this._cart=[]; this._rid=undefined; this._freeDs=null;
    this._addDate = date ? new Date(date) : new Date();
    const same=this._dateStr(this._addDate)===this._dateStr(new Date());
    this._openPicker(same?'오늘 종목 추가':`${this._addDate.getMonth()+1}/${this._addDate.getDate()} 종목 추가`, '', '');
  },
  _openPicker(title, head, extraBtn) {
    this._hits=null; this._part=null; this._eq=null; this._q='';
    const routine = this._rid !== undefined;
    const parts=this._parts();
    const n=parts.reduce((a,p)=>a+EX_DB[p].length,0);
    App.openModal('@dumbbell '+title, `<div class="fz fz-pick">${head}
      <input id="exSearch" class="inp" type="search" autocomplete="off"
        placeholder="${n}개 종목에서 검색 · 초성 가능 (ㅅㅋㅌ)" oninput="Fitness.setQ(this.value)">
      <div class="ex-parts">
        <button class="ex-part ex-part-all" data-part="" onclick="Fitness.setPart(null)">전체</button>
        ${parts.map(p=>`<button class="ex-part" data-part="${p}" onclick="Fitness.setPart('${p}')">${p}</button>`).join('')}
      </div>
      <div class="ex-parts ex-eqs">
        <button class="ex-part ex-eq" data-eq="" onclick="Fitness.setEq(null)">모든 기구</button>
        ${this.PICK_EQ.map(([e,l])=>`<button class="ex-part ex-eq" data-eq="${e}" onclick="Fitness.setEq('${e}')">${l}</button>`).join('')}
      </div>
      <button type="button" class="ex-make" onclick="Fitness.pickOwn('')">${this._ic('plus')}<span>목록에 없는 운동 직접 만들기</span></button>
      <div id="exCart"></div>
      <div id="exResults" class="ex-results"></div>
      <div class="modal-btns">
        <button id="exCommit" onclick="${routine?'Fitness._commitRoutine()':'Fitness.commitCart()'}" class="btn-sm accent" disabled>운동을 골라 주세요</button>
        ${extraBtn}
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
    setTimeout(()=>{ this._paintPick(); if(!routine) document.getElementById('exSearch')?.focus(); },50);
  },

  commitCart() {
    const cart=this._cart||[];
    if(!cart.length){ App.showToast('고른 운동이 없습니다','error'); return; }
    if(this._freeDs){   // 자유 설정: 고른 운동이 그날 운동 목록이 된다(오늘만 / 앞으로 이 요일도)
      const ds=this._freeDs, scope=this._freeScope||'day'; this._freeDs=null;
      const msg=this.applyList(ds, cart.map(x=>({ name:x.name, sets:x.sets||this.defSets(x.name) })), scope);
      this._cart=[]; App.closeModal(); this.render(new Date(ds+'T00:00:00'));
      App.showToast(scope==='day' ? `오늘 운동을 ${cart.length}종목으로 정했습니다` : msg,'success'); return;
    }
    const d=this._addDate||new Date();
    const custom=this.getCustomExercises(d);
    for(const x of cart) custom.push({ name:x.name, sets:x.sets||this.DEFAULT_SETS });
    this.saveCustomExercises(custom,d);
    this._cart=[];
    this.render(d);
    App.closeModal();
    App.showToast(`${cart.length}개 추가됨`,'success');
  },

  // ── 운동 하나 고르기(교체·추가 공용) ─────────────
  // 검색어가 없으면 추천(o.recommend), 있으면 전체 종목에서 찾는다(띄어쓰기·초성 상관없이). 목록에 없으면 직접 입력.
  pickOne(o) {
    this._po = o; this._f30 = null; this._poE = null;
    // 즐겨찾기만 넘어오던 '추천' 은 이제 즐겨찾기 칸이 따로 있으니 뺀다
    if (o.recLabel === '즐겨찾기') { o.recommend = []; o.recLabel = ''; }
    const chips = [ ...((o.recommend||[]).length ? [['__rec','추천']] : []), ['__freq','자주 한'], ['__fav','즐겨찾기'], ['__all','전체'], ...this._parts().map(p=>[p,p]) ];
    App.openModal('@dumbbell ' + o.title, `<div class="fz fz-po">${o.head||''}
      <input id="poQ" class="inp" type="search" autocomplete="off" placeholder="운동 검색 · 초성 가능" oninput="Fitness._poPaint()">
      <div class="ex-parts po-parts">${chips.map(([k,l])=>`<button type="button" class="ex-part" data-pp="${esc(k)}" onclick="Fitness._poCat('${esc(k)}')">${esc(l)}</button>`).join('')}</div>
      <div class="ex-parts ex-eqs po-eqs"><button type="button" class="ex-part ex-eq" data-eq="" onclick="Fitness._poEq(null)">모든 기구</button>${this.PICK_EQ.map(([e,l])=>`<button type="button" class="ex-part ex-eq" data-eq="${e}" onclick="Fitness._poEq('${e}')">${l}</button>`).join('')}</div>
      <button type="button" class="ex-make" onclick="Fitness._poMake('')">${this._ic('plus')}<span>목록에 없는 운동 직접 만들기</span></button>
      <div id="poList" class="sw-list po-list"></div>
      <div class="modal-btns"><button class="btn-sm" onclick="App.closeModal()">닫기</button></div></div>`);
    // 교체는 '추천(같은 동작)' 부터, 추가는 지난번에 고른 칸(자주 한 / 즐겨찾기)부터
    const last = UserStore.get(this.PO_KEY);
    this._poC = (o.recommend||[]).length ? '__rec' : (['__freq','__fav'].includes(last) ? last : '__freq');
    setTimeout(()=>this._poPaint(), 0);
  },
  PO_KEY: 'gl_fit_po_tab',
  // 최근 30일 동안 몇 번(며칠) 했는지 — 체크했거나 무게를 기록한 날
  freq30() {
    if (this._f30 && Date.now() - this._f30.t < 60000) return this._f30.m;
    const m = new Map();
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = this._dateStr(d), names = new Set();
      try { const L = PlanGen.log(ds); Object.keys(L).forEach(n => { if ((L[n]||[]).length) names.add(n); }); } catch (e) {}
      try { const chk = this._checked(d); if (chk.length) { const { list } = this.exercisesFor(d); chk.forEach(k => list[k] && names.add(list[k].name)); } } catch (e) {}
      names.forEach(n => { const r = m.get(n) || { n: 0, last: i }; r.n++; r.last = Math.min(r.last, i); m.set(n, r); });
    }
    this._f30 = { t: Date.now(), m };
    return m;
  },
  // 자주 한 순(30일 횟수 많은 순 → 최근에 한 순), 같으면 즐겨찾기 먼저
  _byFreq(names) {
    const f = this.freq30(), favs = this.getFavs();
    return names.slice().sort((a, b) => ((f.get(b)?.n||0) - (f.get(a)?.n||0)) || ((f.get(a)?.last ?? 99) - (f.get(b)?.last ?? 99)) || (favs.includes(b) - favs.includes(a)));
  },
  _poEq(e){ this._poE = (e==null || this._poE===e) ? null : e; this._poPaint(); },
  _poCat(k){ this._poC=k; if(k==='__freq'||k==='__fav'){ UserStore.set(this.PO_KEY, k); FirebaseSync?.scheduleSave(); } const q=document.getElementById('poQ'); if(q) q.value=''; this._poPaint(); },
  _poFav(i, ev){ ev?.stopPropagation(); const n=(this._poNames||[])[i]; if(!n) return; const f=this.getFavs(), k=f.indexOf(n); if(k<0) f.push(n); else f.splice(k,1);
    UserStore.set(this._favKey(), JSON.stringify(f)); FirebaseSync?.scheduleSave(); try{ Haptic.light(); }catch(e){} this._poPaint(); },
  _poRow(n, i, small='') {
    const th = typeof ExMedia!=='undefined' ? ExMedia.thumbFor(n) : '';
    const fq = this.freq30().get(n), fv = this.getFavs().includes(n);
    const cnt = fq ? `<span class="po-cnt num" title="최근 30일 동안 한 날 수">${fq.n}<i>회</i></span>` : '';
    return `<div class="sw-row po-row" role="button" tabindex="0" onclick="Fitness._poPick(${i})">${th?`<span class="ex-th">${ExMedia.poseHtml(th)}</span>`:`<span class="ex-th none">${typeof Icons!=='undefined'?Icons.svg('dumbbell'):''}</span>`}<span class="sw-nm">${esc(n)}${small?`<small>${small}</small>`:''}</span>${cnt}<button type="button" class="po-star${fv?' on':''}" aria-label="즐겨찾기" aria-pressed="${fv}" onclick="Fitness._poFav(${i}, event)">${fv?'★':'☆'}</button></div>`;
  },
  _poPaint() {
    const o=this._po, box=document.getElementById('poList'); if(!o||!box) return;
    const q=(document.getElementById('poQ')?.value||'').trim();
    const ok = n => !(o.exclude||[]).includes(n) && (typeof PlanGen==='undefined' || ((PlanGen.pickerOk(n) || this.freq30().has(n)) && (!this._poE || PlanGen.equipOf(n)===this._poE)));
    document.querySelectorAll('.po-parts .ex-part').forEach(b=>b.classList.toggle('on', !q && b.dataset.pp===this._poC));
    document.querySelectorAll('.po-eqs .ex-eq').forEach(b=>b.classList.toggle('on', b.dataset.eq===(this._poE||'')));
    const part30 = n => { const p = typeof PlanGen!=='undefined' ? PlanGen.partOf(n) : ''; return p ? esc(p) : ''; };
    if(!q && (this._poC==='__freq' || this._poC==='__fav')){
      const favs=this.getFavs();
      const names = this._poC==='__fav' ? this._byFreq(favs.filter(ok)) : this._byFreq([...this.freq30().keys()].filter(ok)).slice(0, 60);
      this._poOwn=-1; this._poNames=names;
      box.innerHTML = names.length
        ? `<div class="sw-h">${this._poC==='__fav'?'즐겨찾기 · 최근 30일에 많이 한 순':'최근 30일 동안 많이 한 순 · 오른쪽 숫자는 한 날 수'}</div>` + names.map((n,i)=>this._poRow(n,i,part30(n))).join('')
        : `<p class="pg-note">${this._poC==='__fav'?'즐겨찾기한 운동이 없습니다. 운동 오른쪽 ☆ 를 누르면 여기에 모입니다.':'최근 30일 동안 기록한 운동이 없습니다. 운동을 체크하거나 무게를 기록하면 여기에 모입니다.'}</p>`;
      return;
    }
    if(!q && this._poC && this._poC!=='__rec'){
      const part = this._poC==='__all' ? null : this._poC;
      const src = part && EX_DB[part] ? EX_DB[part].map(n=>[part,n]) : Object.entries(EX_DB).flatMap(([p,ns])=>ns.map(n=>[p,n]));
      const favs=this.getFavs(), f=this.freq30();
      // 즐겨찾기 → 최근 30일에 많이 한 것 → 많이 하는 순(EX_DB 순서)
      const list = src.map((x,i)=>[x[0],x[1],i]).filter(([,n])=>ok(n))
        .sort((a,b)=>(favs.includes(b[1])-favs.includes(a[1])) || ((f.get(b[1])?.n||0)-(f.get(a[1])?.n||0)) || a[2]-b[2]).slice(0, part ? 400 : 120);
      this._poOwn=-1; this._poNames=list.map(h=>h[1]);
      box.innerHTML = list.map(([p,n],i)=>this._poRow(n,i,part?'':esc(p))).join('') + (!part ? '<p class="pg-note">전체 중 앞쪽만 보입니다 — 부위를 고르거나 이름으로 찾아 주세요.</p>' : '');
      return;
    }
    if(!q){
      const rec=o.recommend||[];
      this._poOwn=-1; this._poNames=rec.map(r=>r.n);
      box.innerHTML = rec.length ? (o.recLabel?`<div class="sw-h">${esc(o.recLabel)}</div>`:'') + rec.map((r,i)=>this._poRow(r.n,i,r.small||'')).join('')
        : '<p class="pg-note">위에 운동 이름을 검색해 주세요.</p>';
      return;
    }
    const hits=this._search(null,q).filter(([,n])=>!(o.exclude||[]).includes(n) && (!this._poE || typeof PlanGen==='undefined' || PlanGen.equipOf(n)===this._poE)).slice(0,40);
    this._poNames=hits.map(h=>h[1]);
    this._poOwn=-1;
    const own = !hits.some(h=>h[1].replace(/\s+/g,'')===q.replace(/\s+/g,'')) ? (this._poNames.push(q.slice(0,40)), this._poOwn=this._poNames.length-1, this._poRow(q.slice(0,40), this._poNames.length-1, '목록에 없는 운동 · 직접 만들기')) : '';
    box.innerHTML = hits.map(([p,n],i)=>this._poRow(n,i,esc(p))).join('') + own || '<p class="pg-note">결과가 없습니다</p>';
  },
  _poPick(i) {
    const n=(this._poNames||[])[i], o=this._po; if(!n||!o) return;
    if(this._poOwn===i) return this._poMake(n);   // 목록에 없는 이름 → 종류를 묻고 저장
    App.closeModal(); this._po=null; o.onPick(n);
  },
  _poMake(name) { const o=this._po; if(!o) return; this.makeEx(name, n=>{ App.closeModal(); this._po=null; o.onPick(n); }); },
});
