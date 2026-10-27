// js/diet-ai.js — AI 음식 사전 · 사진 분석
// diet.js 의 Diet 에서 떼어 낸 부분. diet.js 다음에 읽는다(같은 객체에 메서드를 더한다).
Object.assign(Diet, {
  // ── AI 음식 사전 ──────────────────────
  // 사전에도 식약처 DB 에도 없는 음식만 AI 에게 묻는다. 만든 건 저장해 둔다 —
  // 같은 걸 두 번 물으면 숫자가 매번 조금씩 달라지고, 그때마다 또 기다려야 한다.
  _aiKey(){ return 'gl_food_ai'; },
  getAiFoods(){ try{ return JSON.parse(UserStore.get(this._aiKey())||'[]'); }catch{ return []; } },
  saveAiFoods(v){ UserStore.set(this._aiKey(), JSON.stringify(v.slice(0,500))); FirebaseSync?.scheduleSave(); },
  _rememberAi(f){
    const list=this.getAiFoods().filter(x=>x&&x.n!==f.n);
    list.unshift({ n:f.n, u:f.u, c:f.c, p:f.p, cb:f.cb, ft:f.ft, src:f.src||'ai', at:new Date().toISOString() });
    this.saveAiFoods(list);
  },
  // onclick="Diet.x('여기')" 자리로 들어가는 글자다. 두 번 해석된다 — HTML 이 속성을 읽고,
  // 그 결과를 JS 가 문자열로 읽는다. 따옴표 하나만 막으면 「김단단's」 같은 이름이 함수 호출을
  // 깨뜨린다. 그래서 역슬래시와 홑따옴표도 같이 막는다.
  _attr(s){ return String(s==null?'':s).replace(/[&<>"'\\]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'\\&#39;', '\\':'\\\\',
  }[c])); },

  // 출처 표시. 예전 화면(v1)은 이모지로, v2 는 작은 글자 꼬리표로 보여 준다 —
  // 둘 다 같은 뜻(어디서 온 숫자인가)이고, 어느 쪽을 쓸지는 css/v2-diet.css 가 고른다.
  SRC: { '🥗':'식약처', '🌍':'OFF', '📋':'성분표', '🤖':'AI 추정', '🏷️':'공식', '📎':'참고' },
  _em(e){ return e ? `<span class="dt-em">${e} </span>` : ''; },
  _srcTag(e){ const t=this.SRC[e]; return t ? `<span class="dt-src${e==='🤖'?' ai':''}">${t}</span>` : ''; },

  _aiBtnHtml(meal, ds){
    return `<button class="diet-ai-btn" id="dietAiBtn" onclick="Diet.aiLookup('${meal}','${ds}')">AI 로 영양정보 찾기</button>
      <div id="dietAiRes"></div>`;
  },
  async aiLookup(meal, ds){
    const q=(document.getElementById('dietSearch')?.value||'').trim();
    if(!q) return;
    const key=JARVIS._getKey();
    if(!key){ JARVIS.needKey('AI 키가 있어야 합니다 — 무료 키로 바로 쓸 수 있습니다'); return; }
    const btn=document.getElementById('dietAiBtn');
    const box=document.getElementById('dietAiRes');
    if(btn){ btn.disabled=true; btn.textContent='찾는 중…'; }
    if(box) box.innerHTML='';
    try{
      const f=await this._aiFood(q);
      this._aiPending=f;
      if(box) box.innerHTML=this._aiConfirmHtml(f, meal, ds);
    }catch(err){
      if(box) box.innerHTML=`<div class="diet-empty-hint">AI 검색 실패 · ${esc(err.message)}</div>`;
    }
    if(btn){ btn.disabled=false; btn.textContent='AI 로 다시 찾기'; }
  },
  async _aiFood(q){
    // 세트를 통째로 물으면 값이 낮게, 그리고 매번 다르게 나왔다.
    // 실제로 '버거킹 몬스터 jr 버거 라지세트' 를 다섯 번 물어 910·1000·910·1000·1010 kcal 을 받았다.
    // 실제 값은 1,300 kcal 쯤이다(버거 690 + 감자 라지 410 + 콜라 210).
    //
    // 나눠서 물으면 두 가지가 같이 해결된다. 구성품 하나하나는 모델이 잘 아는 물건이고,
    // 더하기는 우리가 한다 — 1,290 kcal 이 나왔고 세 번을 물어도 같은 값이었다.
    // 사람도 '버거 560 + 감자 470 + 콜라 260' 을 보면 어디가 틀렸는지 짚을 수 있다.
    // 합계 하나만 보여 주면 틀렸는지조차 알 수 없다.
    // 식당 메뉴(예: '비범 깻잎 페스토 들기름 막국수')는 AI 가 그 집을 알 리가 없다. 기억에만 기대면 집밥 한 접시 값(350kcal)을 냈다.
    // 그래서 ① 식약처 DB 에서 같은 음식(가게 이름을 뗀 '들기름 막국수')의 실측 1인분을 몇 개 찾아 근거로 주고,
    // ② 재료별(면·기름·소스·토핑)로 g 과 함께 나눠 받고, ③ 적게~많이 범위도 받는다. 더하기는 우리가 한다.
    let refs=null; try{ refs=await this._aiRefs(q); }catch(e){}
    const refTxt = refs && refs.items.length ? `
참고 — 식약처 영양성분DB 실측값(가게 이름을 뗀 「${refs.q}」, 1인분·한 봉 기준):
${refs.items.map(x=>`- ${x.name}: ${x.g}g ${x.kcal}kcal (단백질 ${x.p}g, 탄수 ${x.c}g, 지방 ${x.f}g)`).join('\n')}
이 값들을 기준점으로 쓰되, 식당 1인분은 보통 이보다 크거나 비슷하다.` : '';
    const prompt = `「${q}」가 사람이 먹는 음식인지 먼저 판단해라.
음식이 아니면(사물·장소·사람 등) 다른 필드 없이 {"ok":false} 만 낸다. 이때는 절대 숫자를 지어내지 않는다.
음식이면 한국에서 파는 1회 제공량 기준으로 답한다.
세트·콤보처럼 여러 음식이 묶인 이름이면 구성품을 하나씩 나눠 적고 각각의 값을 낸다.
세트는 보통 메인 + 사이드(감자튀김 등) + 음료다. 라지 세트면 사이드와 음료도 라지다.
식당에서 파는 한 그릇 요리(면·밥·덮밥·파스타 등)는 재료별로 나눠라: 주재료(면·밥, 조리 후 g), 기름(들기름·참기름 등 큰술·g), 소스·양념, 페스토·치즈·견과, 고명(김가루·깨·달걀 등). 각 재료의 양(amt)을 g 으로 적는다.
앞에 붙은 식당·브랜드 이름을 모르면 한국 일반 식당의 1인분으로 본다. 모르는 가게라고 값을 낮추지 마라.
lo·hi 에는 양이 적은 집·많은 집을 가정한 총열량 범위를 넣는다.
단일 음식이면 parts 에 그 하나만 넣는다.${refTxt}
JSON 만 출력해. 다른 말은 붙이지 마.
{"ok":true,"name":"음식 이름","unit":"기준량 (예: 1인분, 1개, 1세트)","lo":숫자,"hi":숫자,"parts":[{"n":"구성품","amt":"양(g)","cal":숫자,"protein":숫자,"carb":숫자,"fat":숫자}]}`;
    // 모델 이름은 JARVIS 가 고른다 — 한 군데서 고르지 않으면 Groq 이 모델을 내릴 때마다
    // 여기저기서 따로 죽는다. 실제로 그렇게 죽었다.
    //
    // max_tokens 가 300 이었다. 지금 모델은 답하기 전에 속으로 생각하고 그 생각도 이 예산을 먹는다.
    // '사과' 는 통과했지만 세트 메뉴처럼 조금만 복잡해지면 생각만 하다 예산이 끝나
    // 본문이 빈 채로 돌아왔다(finish_reason:'length', content:'').
    // 그렇다고 크게 잡을 수도 없다 — 무료 등급은 분당 8,000 토큰이라 금방 막힌다.
    //
    // temperature 는 0 이다. 0.2 는 같은 음식을 두 번 물으면 다른 숫자를 줬고,
    // 그중 하나가 사전에 영영 저장됐다. 추정이어도 흔들리지는 말아야 한다.
    const data=await JARVIS.chat({ max_tokens:1400, temperature:0,
      messages:[{role:'user',content:prompt}] });
    const ch=data.choices?.[0];
    const text=ch?.message?.content||'';
    // 왜 실패했는지를 구분해서 말한다. '못 찾았습니다' 한 마디로 뭉뚱그리면
    // 질문을 바꿔야 하는지, 다시 눌러야 하는지 알 수가 없다.
    if(!text.trim()) throw new Error(ch?.finish_reason==='length'
      ? '답이 길어 잘렸어요. 이름을 조금 짧게 해서 다시 눌러 주세요'
      : 'AI 가 빈 답을 보냈어요. 다시 눌러 주세요');
    let j=null; try{ const m=text.match(/\{[\s\S]*\}/); j=m?JSON.parse(m[0]):null; }catch{}
    if(!j) throw new Error('AI 답을 읽지 못했어요. 다시 눌러 주세요');
    if(j.ok===false) throw new Error('먹는 것으로 보지 않았어요');

    const num=v=>{ const n=Number(v); return isFinite(n)&&n>=0 ? n : 0; };
    // parts 가 없으면 예전 모양(cal/protein/…)으로 온 것이다. 한 덩어리로 받아 준다.
    const parts=(Array.isArray(j.parts)&&j.parts.length ? j.parts : [j])
      .map(x=>({ n:String(x.n||x.name||'').trim().slice(0,30),
                 amt:String(x.amt||'').trim().slice(0,20),
                 c:Math.round(num(x.cal)), p:num(x.protein), cb:num(x.carb), ft:num(x.fat) }))
      .filter(x=>x.c>0||x.p>0||x.cb>0||x.ft>0);
    if(!parts.length) throw new Error('AI 가 숫자를 못 냈어요. 다시 눌러 주세요');

    const sum=k=>parts.reduce((a,x)=>a+x[k],0);
    const r1=v=>Math.round(v*10)/10;
    let c=sum('c'); const p=r1(sum('p')), cb=r1(sum('cb')), ft=r1(sum('ft'));

    // 칼로리와 단탄지는 서로 묶여 있다 — 단백질·탄수 4, 지방 9 kcal.
    // 둘이 크게 어긋나면 둘 중 하나가 헛소리다. 이때는 계산으로 나오는 쪽을 믿는다.
    // (더하기는 틀릴 수가 없고, 기억해 낸 총량은 틀릴 수 있다.)
    const derived=Math.round(4*p+4*cb+9*ft);
    let fixed=false;
    if(derived>0 && Math.abs(c-derived)/derived > 0.3){ c=derived; fixed=true; }

    const name=String(j.name||q).trim().slice(0,40) || q;
    // 범위는 합계를 감싸야 말이 된다 — 아니면 버린다
    let lo=Math.round(num(j.lo)), hi=Math.round(num(j.hi)); if(!(lo>0&&hi>=lo&&lo<=c*1.05&&hi>=c*0.95)){ lo=0; hi=0; }
    return { n:name, u:String(j.unit||'').trim().slice(0,20),
             c, p, cb, ft, parts, fixed, lo, hi, refs };
  },
  // 같은 음식의 실측 1인분 — 검색어 앞쪽(가게 이름 등)을 하나씩 떼며 식약처 DB 에서 '음식'(조리 음식)·대표 품목을 찾는다
  async _aiRefs(q){
    const w=String(q||'').trim().split(/\s+/).filter(Boolean); if(!w.length) return null;
    const tries=[]; for(let k=w.length; k>=1; k--){ const sub=w.slice(w.length-k).join(' '); if(sub.length>=2 && !tries.includes(sub)) tries.push(sub); }
    // 붙여 쓴 이름(들기름막국수)도 한 번
    if(w.length>=2) tries.splice(1,0,w.slice(-2).join(''));
    for(const sub of tries.slice(0,5)){
      let j=null, j2=null; try{ j=await this._dbFetch(sub, 1); if(j&&j.more) j2=await this._dbFetch(sub, 2); }catch(e){}
      const it=[...((j&&j.items)||[]), ...((j2&&j2.items)||[])].filter(x=>Number(x.kcal)>=90);   // 100g 에 90kcal 도 안 되면 곤약·두유면 같은 별종이라 기준점에서 뺀다
      const pick=it.map(x=>{ const per=Number(x.per)||100, g=Number(x.pack)||0, unit=x.unit||'g';
          if(unit!=='g'||!(g>=120&&g<=900)) return null;   // 1인분 무게가 있는 것만(소스·한 통 대용량 제외)
          const f=v=>Math.round((Number(v)||0)*g/per*10)/10;
          return { name:x.name, g:Math.round(g), kcal:Math.round(Number(x.kcal)*g/per), p:f(x.protein), c:f(x.carb), f:f(x.fat), grp:x.group||'', cls:x.cls||'' };
        }).filter(Boolean)
        .filter(x=>!/소스|육수|양념|칩|샐러드|&|와 |정식|김밥|세트|도시락|볶음|불고기/.test(x.name))
        .sort((a,b)=>(a.grp==='음식'?0:1)-(b.grp==='음식'?0:1));
      if(pick.length>=2) return { q:sub, items:pick.slice(0,5) };
    }
    return null;
  },
  // AI 가 낸 숫자는 그대로 들어가지 않는다. 추정값이라고 말하고, 고칠 수 있게 두고,
  // 누를 때 들어간다. 한번 들어간 칼로리는 나중에 틀린 걸 알아채기가 어렵다.
  _aiConfirmHtml(f, meal, ds){
    const A=s=>this._attr(s);
    return `<div class="diet-ai-card">
      <div class="diet-ai-hd">
        <span class="diet-ai-nm">${this._em('🤖')}${esc(f.n)}</span>
        <span class="diet-ai-warn">AI 추정값 · 맞는지 보고 담으세요</span>
      </div>
      ${f.lo&&f.hi?`<div class="diet-ai-range">가게마다 양이 달라 <b class="num">${f.lo.toLocaleString('ko-KR')}~${f.hi.toLocaleString('ko-KR')}kcal</b> 사이로 봅니다</div>`:''}
      ${f.refs&&f.refs.items.length?`<details class="diet-ai-refs"><summary>근거 · 식약처 실측 「${esc(f.refs.q)}」 ${f.refs.items.length}건 (1인분 ${Math.min(...f.refs.items.map(x=>x.kcal)).toLocaleString('ko-KR')}~${Math.max(...f.refs.items.map(x=>x.kcal)).toLocaleString('ko-KR')}kcal)</summary>
        ${f.refs.items.map(x=>`<div class="dap-row"><span class="dap-n">${esc(x.name)} <i>${x.g}g</i></span><span class="dap-c num">${x.kcal}<i>kcal</i></span></div>`).join('')}</details>`:''}
      ${(f.parts&&f.parts.length>1)?`<div class="diet-ai-parts">
        ${f.parts.map(x=>`<div class="dap-row"><span class="dap-n">${esc(x.n)}${
          x.amt?` <i>${esc(x.amt)}</i>`:''}</span><span class="dap-c num">${x.c}<i>kcal</i></span></div>`).join('')}
        <div class="dap-row dap-sum"><span class="dap-n">합계</span><span class="dap-c num">${f.c}<i>kcal</i></span></div>
      </div>`:''}
      ${f.fixed?`<div class="diet-ai-note">단백질·탄수·지방으로 계산한 값과 크게 달라서 칼로리를 다시 계산했어요.</div>`:''}
      <div class="diet-ai-grid">
        <label>기준량<input id="aiU"  class="inp inp-sm" value="${A(f.u)}"></label>
        <label>kcal<input id="aiC"  type="number" class="inp inp-sm" value="${f.c}"></label>
        <label>단백질<input id="aiP"  type="number" step="0.1" class="inp inp-sm" value="${f.p}"></label>
        <label>탄수화물<input id="aiCb" type="number" step="0.1" class="inp inp-sm" value="${f.cb}"></label>
        <label>지방<input id="aiFt" type="number" step="0.1" class="inp inp-sm" value="${f.ft}"></label>
      </div>
      <div class="diet-ai-qty"><span>먹은 양</span>${[[0.7,'적게'],[1,'보통'],[1.3,'많이'],[1.6,'곱빼기']].map(([m,l])=>`<button type="button" class="${m===1?'on':''}" onclick="Diet._aiScale(${m},this)">${l}</button>`).join('')}</div>
      <button class="btn-sm accent diet-ai-add dt-go" onclick="Diet.aiConfirm('${meal}','${ds}')">담고 사전에 저장</button>
    </div>`;
  },
  // 먹은 양 — AI 가 낸 '보통 1인분' 에 곱해 칸을 바꾼다(손으로 고친 값 위에 곱하지 않게 늘 원래 값에서)
  _aiScale(m, btn){
    const f=this._aiPending; if(!f) return;
    btn?.parentElement?.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===btn));
    const set=(id,v,d)=>{ const e=document.getElementById(id); if(e) e.value=d?Math.round(v*10)/10:Math.round(v); };
    set('aiC',f.c*m); set('aiP',f.p*m,1); set('aiCb',f.cb*m,1); set('aiFt',f.ft*m,1);
    const u=document.getElementById('aiU'); if(u){ const base=f.u||'1인분'; u.value=m===1?base:`${base} × ${m}`; }
    try{ Haptic.light(); }catch(e){}
  },
  aiConfirm(meal, ds){
    const f=this._aiPending; if(!f) return;
    const num=(id,d)=>{ const e=document.getElementById(id); if(!e) return d;
      const n=parseFloat(e.value); return isFinite(n)&&n>=0 ? n : d; };
    const uEl=document.getElementById('aiU');
    const food={ e:'🤖', n:f.n, u:(uEl?uEl.value:f.u||'').trim(),
      c:Math.round(num('aiC',f.c)), p:num('aiP',f.p), cb:num('aiCb',f.cb), ft:num('aiFt',f.ft) };
    this._rememberAi(food);
    this.addToCart(food, meal, ds);
    this._aiPending=null;
    App.showToast(`「${food.n}」 사전에 저장됨 · 다음부턴 바로 검색됩니다`,'success');
    // 저장했으니 이제 그냥 검색된다 — 목록을 다시 그려서 그걸 보여 준다.
    const inp=document.getElementById('dietSearch'); if(inp) inp.value=food.n;
    this.searchFood(food.n, meal, ds);
  },

  // ── 사진 분석 ─────────────────────────
  showPhotoAnalysis(dateStr=null){
    const ds=dateStr||this._localDateStr();
    const key=JARVIS._getKey();
    if(!key){ JARVIS.needKey('AI 키가 있어야 합니다 — 무료 키로 바로 쓸 수 있습니다'); return; }
    const sug=this._suggestMeal();
    const camIc=typeof Icons!=='undefined'?Icons.svg('camera'):'';
    App.openModal('@camera 사진으로 기록',`<div class="dt dt-photo">
      <p class="dt-lead">사진을 올리면 AI 가 음식과 열량을 추정해요.</p>
      <div class="dt-field"><div class="modal-lbl">끼니</div>
        <input type="hidden" id="photoMeal" value="${sug}">
        <div class="dt-seg" role="radiogroup" aria-label="끼니">
          ${this.MEALS.map(m=>`<button type="button" role="radio" class="${m===sug?'on':''}" aria-checked="${m===sug}"
            onclick="Diet._pickPhotoMeal(this,'${m}')">${m}</button>`).join('')}
        </div>
      </div>
      <div id="photoDropZone" class="photo-drop-zone" onclick="document.getElementById('photoFileInput').click()">
        <div id="photoPreviewWrap" class="dt-drop">${camIc}
          <span>눌러서 사진 고르기</span><small>또는 여기로 끌어 놓기</small></div>
        <input id="photoFileInput" type="file" accept="image/*" style="display:none"
          onchange="Diet._onPhotoSelected(this,'${ds}')">
      </div>
      <div id="photoResult" style="display:none"></div>
      <div class="modal-btns">
        <button id="btnAnalyzePhoto" onclick="Diet._analyzePhoto('${ds}')" class="btn-sm accent" disabled>AI 분석</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div></div>`);
    setTimeout(()=>{
      const zone=document.getElementById('photoDropZone'); if(!zone) return;
      zone.addEventListener('dragover',e=>{e.preventDefault();zone.style.borderColor='var(--accent)';});
      zone.addEventListener('dragleave',()=>{zone.style.borderColor='';});
      zone.addEventListener('drop',e=>{ e.preventDefault(); zone.style.borderColor=''; const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) Diet._loadFile(f,ds); });
    },100);
  },

  _photoBase64:null,
  _pickPhotoMeal(btn, m){
    const inp=document.getElementById('photoMeal'); if(inp) inp.value=m;
    btn.parentElement.querySelectorAll('button').forEach(b=>{
      const on=b===btn; b.classList.toggle('on',on); b.setAttribute('aria-checked',on); });
  },
  _onPhotoSelected(input,dateStr){ const f=input.files[0]; if(f) this._loadFile(f,dateStr); },
  _loadFile(file,dateStr){
    const reader=new FileReader();
    reader.onload=e=>{
      this._photoBase64=e.target.result.split(',')[1];
      document.getElementById('photoPreviewWrap').innerHTML=`<img class="dt-shot" alt="고른 사진" src="data:${file.type};base64,${this._photoBase64}" style="max-width:100%;max-height:160px;border-radius:8px;object-fit:contain">`;
      const btn=document.getElementById('btnAnalyzePhoto'); if(btn){ btn.disabled=false; }
    };
    reader.readAsDataURL(file);
  },
  async _analyzePhoto(dateStr){
    if(!this._photoBase64) return;
    const btn=document.getElementById('btnAnalyzePhoto');
    if(btn){ btn.disabled=true; btn.textContent='분석 중...'; }
    const key=JARVIS._getKey();
    const meal=document.getElementById('photoMeal')?.value||'저녁';
    try{
      const data=await JARVIS.chat({ max_tokens:1000,
        messages:[{role:'user',content:[
          {type:'image_url',image_url:{url:`data:image/jpeg;base64,${this._photoBase64}`}},
          {type:'text',text:`이 사진에 있는 음식을 분석해서 아래 JSON 형식으로만 출력해줘. 다른 텍스트 없이 JSON만.
{"foods":[{"name":"음식명","amount":"양(예:100g,1개)","cal":칼로리숫자,"protein":단백질g,"carb":탄수화물g,"fat":지방g}],"total_cal":총칼로리,"meal":"아침|점심|저녁|간식","comment":"한줄코멘트"}
한국 음식 기준으로 칼로리를 최대한 정확하게 추정해줘. 음식이 없으면 foods를 빈 배열로 반환해줘.`}
        ]}] }, 'vision');
      const text=data.choices?.[0]?.message?.content||'';
      let parsed; try{ const m=text.match(/\{[\s\S]*\}/); parsed=m?JSON.parse(m[0]):null; }catch{}
      if(!parsed?.foods){ App.showToast('분석 실패','error'); if(btn){btn.disabled=false;btn.textContent='AI 분석';} return; }
      const resultEl=document.getElementById('photoResult'); if(!resultEl) return;
      resultEl.style.display='block';
      const tot=parsed.total_cal||parsed.foods.reduce((a,f)=>a+(Number(f.cal)||0),0);
      resultEl.innerHTML=`<div class="dt-pres">
        <div class="dt-pres-hd"><span class="modal-lbl">AI 추정</span>
          <span class="dt-pres-tot"><b class="num">${Math.round(tot).toLocaleString('ko-KR')}</b> kcal</span></div>
        ${parsed.foods.map(f=>`<div class="dt-pres-row"><span class="dt-pres-nm">${esc(f.name)}${f.amount?` <i>${esc(f.amount)}</i>`:''}</span><span class="dt-pres-c num">${f.cal}<i>kcal</i></span></div>`).join('')}
        ${parsed.comment?`<p class="dt-pres-cm">${esc(parsed.comment)}</p>`:''}
      </div>
      <button onclick="Diet._savePhotoFoods(${JSON.stringify(parsed.foods).replace(/"/g,'&quot;')},'${meal}','${dateStr}')" class="btn-sm accent dt-go">${meal}에 추가</button>`;
      // 결과가 나오면 주 단추는 '추가' 다. 다시 분석은 보조로 내린다.
      if(btn) btn.classList.remove('accent');
      if(btn){btn.textContent='다시 분석';btn.disabled=false;}
    }catch(err){ App.showToast('분석 실패: '+err.message,'error'); if(btn){btn.disabled=false;btn.textContent='AI 분석';} }
  },
  _savePhotoFoods(foods,meal,dateStr){
    const date=dateStr?new Date(dateStr+'T00:00:00'):new Date();
    const data=this.getData(date);
    if(!data[meal])data[meal]=[];
    foods.forEach(f=>{
      const food={name:f.name+(f.amount?`(${f.amount})`:''),cal:f.cal||0,protein:f.protein||0,carb:f.carb||0,fat:f.fat||0};
      data[meal].push(food); this.addToHistory(food);
    });
    this.saveData(data,date); this.render(date);
    App.closeModal(); App.showToast(`${meal}에 ${foods.length}개 추가됨`,'success');
    this._photoBase64=null;
  },
});
