// js/diet-db.js — 식약처 식품영양성분DB · 영양성분표 촬영
// diet.js 의 Diet 에서 떼어 낸 부분. diet.js 다음에 읽는다(같은 객체에 메서드를 더한다).
Object.assign(Diet, {
  // ── 식약처 식품영양성분DB ────────────────
  // 내 사전에 없으면 여기서 찾는다. AI 추정보다 먼저다 —
  // '비요뜨' 를 AI 에게 물으면 "요거트 음료 100kcal" 을 지어냈지만,
  // 이 DB 에는 '비요뜨 초코링 145kcal/100g' 이 실측으로 들어 있다.
  // 식약처 한 줄을 담을 수 있는 모양으로 바꾼다. 바코드 조회(js/barcode.js)도 이걸 쓴다 —
  // 환산 공식이 두 벌이면 같은 제품이 화면마다 다른 칼로리로 보인다.
  //
  // 값은 100g 기준으로 온다. 제품 한 개의 중량을 알면 그 단위로 환산해서 담는다 —
  // 비요뜨를 100g 씩 먹지는 않으니까. 모르면 기준량(100g) 그대로 둔다.
  // 한 개 무게(가식부 기준 대략) — 식약처 '음식' 줄의 식품중량은 1인분·기준량이라 '1개' 로 쓰면 틀린다(달걀 1개가 100g 으로 보이던 것).
  // 이름이 이걸로 시작하는 기본 음식은 1개 단위로 바꿔 담는다.
  PIECE: [[/^(달걀|계란)(?!.*(말이|찜|국|탕|덮밥|샐러드|빵|볶음|장조림|조림|지단|밥|죽|라면|토스트|샌드위치))/, 50, '1개'], [/^메추리알/, 10, '1개'],
    [/^바나나/, 120, '1개'], [/^사과/, 200, '1개'], [/^배(_|$)/, 300, '1개'], [/^귤/, 80, '1개'], [/^오렌지/, 180, '1개'], [/^키위/, 90, '1개'],
    [/^고구마/, 150, '1개'], [/^감자/, 150, '1개'], [/^토마토(_|$)/, 150, '1개'], [/^방울토마토/, 15, '1개'], [/^딸기/, 15, '1개'],
    [/^(쌀밥|흰밥|밥_쌀|현미밥|잡곡밥)/, 210, '1공기'], [/^두부(_|$)/, 300, '1모'], [/^식빵/, 35, '1장'], [/^김밥(_|$)/, 230, '1줄'],
    [/초밥/, 25, '1개']],
  // 여러 개가 든 한 팩(초밥·만두·너겟…): 식약처 '식품중량' 은 팩 전체라 '1개' 로 쓰면 팩을 하나로 센다
  // (광어초밥 200g 한 팩을 1개로 보고 12개 = 3,840kcal 가 되던 것). 낱개 무게로 바꿔 담는다.
  PIECEP: [[/초밥/, 25], [/왕만두/, 70], [/물만두/, 15], [/만두/, 30], [/너겟/, 20], [/동그랑땡/, 20], [/떡꼬치/, 60], [/미니약과/, 15], [/약과/, 35], [/마카롱/, 20]],
  PIECE_NOT: /(용$|용\s|도시락|반죽|소스|쿠키|크로넛|볶음밥|덮밥|세트|토핑|피$|만두피|키트|DIY)/,
  _fromDb(x){
    const base = Number(x.per) || 100, unit = x.unit || 'g';
    const r1 = (v, k) => Math.round((Number(v)||0) * k * 10) / 10;
    const mk = (u, grams, extra) => { const k = grams / base; return {
      e: x.e || '🥗', n: x.name, u,
      c: Math.round((Number(x.kcal)||0) * k), p: r1(x.protein, k), cb: r1(x.carb, k), ft: r1(x.fat, k),
      grp: x.maker || x.group || '',
      // 환산했으면 원래 기준을 같이 보여 준다. 숫자를 확인할 길이 있어야 한다.
      note: (extra ? extra + ' · ' : '') + (grams !== base ? `${base}${unit}당 ${Math.round(x.kcal||0)}kcal` : ''),
    }; };
    // 프랜차이즈 공식값(data/franchise.json): 한 줄이 한 번 먹는 양 — '15cm(233g)' · '1마리' 그대로
    if (x.sv) { const g = Number(x.pack) || 0; const f = mk(`${x.sv}${g && !/\d\s*(g|ml|mL)/.test(x.sv) ? `(${g}${unit})` : ''}`, base); f.e = x.e || '🏷️'; f.note = x.cls === '참고' ? '공식 확인 안 됨 · 다른 사이트 값' : (x.carb == null && x.fat == null ? '브랜드가 탄수·지방은 공개 안 함' : ''); return f; }
    const generic = x.cls === '품목대표' || x.group === '음식';
    if (generic) {
      const pc = this.PIECE.find(([re]) => re.test(String(x.name)));
      if (pc && unit === 'g') return mk(`${pc[2]}(${pc[1]}g)`, pc[1]);
      // 음식 줄의 식품중량은 '1인분' 기준량이다 — 1개가 아니다
      if (x.pack && Math.abs(x.pack - base) > 0.5) return mk(`1인분(${x.pack}${unit})`, x.pack);
      return mk(`${base}${unit}`, base);
    }
    // 가공식품(상용제품)은 식품중량이 제품 한 개(한 봉지·한 팩)의 중량이다
    if (x.pack) {
      const r1g = v => Math.round(v * 10) / 10;
      // 이름에 '8p' '10개입' 처럼 개수가 있으면 팩 무게를 그 수로 나눈 낱개로
      const cnt = /(\d+)\s*(?:p|P|pcs|PCS|개입|입|피스|알)(?![a-zA-Z가-힣])/.exec(String(x.name)), N = cnt ? Number(cnt[1]) : 0;
      if (N >= 2 && N <= 100) return mk(`1개(${r1g(x.pack / N)}${unit})`, x.pack / N, `${N}개입 한 팩 ${x.pack}${unit}`);
      const pp = !this.PIECE_NOT.test(String(x.name)) && this.PIECEP.find(([re]) => re.test(String(x.name)));
      if (pp && x.pack >= pp[1] * 2.5) return mk(`1개(${pp[1]}${unit})`, pp[1], `한 팩 ${x.pack}${unit} 중 1개 약 ${pp[1]}${unit}`);
      // 기름·소스·대용량처럼 한 통을 한 번에 먹지 않는 것은 기준량(100g)으로 — 한 통이 '1개' 로 담겨 8,000kcal 가 되던 것
      if (x.pack >= 400 && (Number(x.kcal) || 0) * x.pack / base > 1000) return mk(`${base}${unit}`, base, `한 통 ${x.pack}${unit}`);
      return mk(`1개(${x.pack}${unit})`, x.pack);
    }
    return mk(`${base}${unit}`, base);
  },
  // 쪽마다 15개. 같은 검색어의 쪽은 잠시 기억해 둔다(지웠다 다시 쳐도 바로 나오게).
  _dbCache: {},
  async _dbFetch(q, page){
    const k=q+'|'+page, c=this._dbCache[k];
    if(c && Date.now()-c.t<10*60000) return c.j;
    const r = await fetch(Platform.api('/api/food?q=' + encodeURIComponent(q) + '&rows=15&page=' + page));
    const j = await r.json();
    if(j && j.ok) this._dbCache[k]={ t:Date.now(), j };
    return j;
  },
  _dbRowHtml(f, i, meal, ds){
    return `<div class="diet-food">
          <div class="diet-food-main" onclick="Diet.selectDbFood(${i},'${meal}','${ds}')">
            <span class="diet-food-nm">${this._em(f.e)}${esc(f.n)}</span>
            <span class="dt-meta"><span class="diet-food-u">${esc(f.u)}</span>${f.grp?`<span class="diet-food-n">${esc(f.grp)}</span>`:''}${f.note?`<span class="diet-food-note">${esc(f.note)}</span>`:''}</span>
          </div>
          <span class="diet-food-cal num">${f.c}<i>kcal</i></span>
        </div>`;
  },
  async _dbSearch(q, meal, ds){
    const box = document.getElementById('dietDbRes');
    if(!box) return;
    box.innerHTML = `<div class="diet-rec-hd">식약처 영양성분DB 찾는 중…</div>`;
    let j = null;
    try { j = await this._dbFetch(q, 1); } catch(e) { j = null; }
    // 오가는 사이에 검색어가 바뀌었으면 늦게 온 답은 버린다.
    const cur = (document.getElementById('dietSearch')?.value || '').trim();
    if(cur !== q) return;
    if(!j || !j.ok || !(j.items||[]).length){
      box.innerHTML = this._labelHtml(q, meal, ds) + this._aiBtnHtml(meal, ds);
      return;
    }
    this._dbQ = q; this._dbPage = 1;
    this._dbHits = j.items.map(x => this._fromDb(x));
    box.innerHTML = `<div class="diet-rec-hd">식약처 영양성분DB <i>${Number(j.total||0).toLocaleString('ko-KR')}건 중 가까운 순</i></div>
      <div id="dietDbList">${this._dbHits.map((f,i) => this._dbRowHtml(f, i, meal, ds)).join('')}</div>
      <div id="dietDbMore">${this._moreBtn(j, meal, ds)}</div>
      <div class="diet-macro-note">담은 뒤 수량을 누르면 g·개수를 직접 넣을 수 있어요</div>`
      // 목록에 내 제품이 없을 수도 있다. 그때 갈 길을 여기서 같이 연다.
      + this._labelHtml(q, meal, ds);
  },
  _moreBtn(j, meal, ds){
    return j && j.more ? `<button type="button" class="diet-more" onclick="Diet._dbMore('${meal}','${ds}')">더 보기 <span class="num">${Number(j.left||0).toLocaleString('ko-KR')}</span>개 남음</button>` : '';
  },
  // 더 보기: 다음 15개를 아래에 이어 붙인다(위에서 보던 자리는 그대로)
  async _dbMore(meal, ds){
    const q=this._dbQ, mb=document.getElementById('dietDbMore'); if(!q || !mb) return;
    mb.innerHTML=`<div class="diet-rec-hd">불러오는 중…</div>`;
    let j=null; try { j = await this._dbFetch(q, (this._dbPage||1)+1); } catch(e) {}
    if(!j || !j.ok){ mb.innerHTML=''; return; }
    this._dbPage++;
    const start=this._dbHits.length, add=j.items.map(x=>this._fromDb(x));
    this._dbHits=this._dbHits.concat(add);
    document.getElementById('dietDbList')?.insertAdjacentHTML('beforeend', add.map((f,k)=>this._dbRowHtml(f, start+k, meal, ds)).join(''));
    mb.innerHTML=this._moreBtn(j, meal, ds);
  },
  // ── 영양성분표 촬영 ──────────────────────
  // 식약처 DB 는 모든 제품을 담고 있지 않다. 실제로 '김단단 닭가슴살' 은 0건이었다.
  // 그럴 때 AI 에게 '이 제품 몇 칼로리냐' 고 묻는 건 기억을 지어내게 하는 일이다.
  // 포장의 표를 찍어 옮겨 적게 하는 건 전혀 다른 일이다 — 눈앞의 글자를 읽는 것이라
  // 지어낼 여지가 없고, 애초에 그 표가 제조사가 신고한 값이라 가장 정확하다.
  _labelHtml(q, meal, ds){
    const A = this._attr(q);
    return `<div class="diet-label-box">
      <div class="diet-rec-hd">영양성분표 찍기 <i>가장 정확해요</i></div>
      <div class="diet-label-hint">포장 뒷면의 표를 찍으면 <b>적힌 값을 그대로</b> 읽어 옵니다. 추정하지 않아요.</div>
      <input id="lblFile" type="file" accept="image/*" capture="environment" style="display:none"
             onchange="Diet._onLabelPick(this,'${A}','${meal}','${ds}')">
      <button class="btn-sm dp-rt-btn dt-ghost" onclick="document.getElementById('lblFile').click()">영양성분표 촬영 / 선택</button>
      <div id="lblResult"></div>
    </div>`;
  },
  _onLabelPick(input, q, meal, ds){
    const f = input.files && input.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = e => { this._lblB64 = String(e.target.result).split(',')[1]; this._readLabel(q, meal, ds); };
    r.readAsDataURL(f);
  },
  async _readLabel(q, meal, ds){
    const box = document.getElementById('lblResult');
    if(!box) return;
    if(!JARVIS._getKey()){
      box.innerHTML = `<div class="diet-empty-hint">표를 읽으려면 AI 키가 필요합니다. <button type="button" class="btn-sm accent" onclick="JARVIS.showKeySetup()">무료 키 넣기</button></div>`; return;
    }
    box.innerHTML = `<div class="diet-empty-hint">표를 읽는 중…</div>`;
    // 이 프롬프트의 핵심은 '추정하지 마라' 다. 아는 제품이라도 기억으로 채우면
    // 사진을 찍은 의미가 없어지고, 다시 지어낸 숫자가 사전에 저장된다.
    const prompt = `이 사진은 식품 포장의 영양성분표다. 적혀 있는 값을 그대로 옮겨 적어라.
추정하지 마라. 사진에서 읽을 수 없는 값은 null 로 둔다. 아는 제품이라도 기억으로 채우지 마라.
기준량은 표에 적힌 문구를 그대로 쓴다 (예: "총 내용량 100g", "1회 제공량 30g").
총 내용량당 값과 100g당 값이 둘 다 있으면 총 내용량 쪽을 쓴다.
JSON 만 출력한다. 다른 말은 붙이지 마라.
{"ok":true,"name":"제품명(읽히면)","basis":"기준량 문구","grams":숫자 또는 null,"kcal":숫자 또는 null,"protein":숫자 또는 null,"carb":숫자 또는 null,"fat":숫자 또는 null}
영양성분표가 사진에 없으면 {"ok":false} 만 출력한다.`;
    try{
      const data = await JARVIS.chat({ max_tokens:700, temperature:0,
        messages:[{ role:'user', content:[
          { type:'image_url', image_url:{ url:`data:image/jpeg;base64,${this._lblB64}` } },
          { type:'text', text: prompt },
        ]}] }, 'vision');
      const t = data.choices?.[0]?.message?.content || '';
      let j = null; try{ const m = t.match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; }catch(e){}
      if(!j) { box.innerHTML = `<div class="diet-empty-hint">답을 읽지 못했어요. 다시 찍어 주세요</div>`; return; }
      if(j.ok === false){ box.innerHTML = `<div class="diet-empty-hint">사진에서 영양성분표를 찾지 못했어요. 표가 잘 보이게 다시 찍어 주세요</div>`; return; }
      if(j.kcal == null){ box.innerHTML = `<div class="diet-empty-hint">열량을 읽지 못했어요. 표가 흐리면 값이 빠집니다 — 다시 찍어 주세요</div>`; return; }
      const A = s => this._attr(s);
      const nm = String(j.name || q).trim().slice(0,40) || q;
      const u  = String(j.basis || '').trim().slice(0,24);
      box.innerHTML = `<div class="diet-ai-card">
        <div class="diet-ai-hd"><span class="diet-ai-nm">${this._em('📋')}${esc(nm)}</span>
          <span class="diet-ai-u">${esc(u)}</span></div>
        <div class="diet-label-hint">읽은 값이 맞는지 보고 고칠 수 있어요. 못 읽은 칸은 비어 있습니다.</div>
        <div class="modal-grid2 dt-grid">
          <label>열량(kcal)<input id="lbC"  type="number" class="inp inp-sm" value="${j.kcal ?? ''}"></label>
          <label>단백질(g)<input id="lbP"  type="number" step="0.1" class="inp inp-sm" value="${j.protein ?? ''}"></label>
          <label>탄수(g)<input id="lbCb" type="number" step="0.1" class="inp inp-sm" value="${j.carb ?? ''}"></label>
          <label>지방(g)<input id="lbF"  type="number" step="0.1" class="inp inp-sm" value="${j.fat ?? ''}"></label>
        </div>
        <button class="btn-sm accent dp-rt-btn dt-go" onclick="Diet._saveLabel('${A(nm)}','${A(u)}','${meal}','${ds}')">담기</button>
      </div>`;
    }catch(err){
      box.innerHTML = `<div class="diet-empty-hint">읽기 실패 · ${esc(err.message)}</div>`;
    }
  },
  _saveLabel(name, unit, meal, ds){
    const num = id => { const e = document.getElementById(id); const v = e ? parseFloat(e.value) : NaN; return isFinite(v) && v >= 0 ? v : 0; };
    const f = { e:'📋', n:name, u:unit, c:Math.round(num('lbC')), p:num('lbP'), cb:num('lbCb'), ft:num('lbF') };
    if(!f.c){ App.showToast('열량을 입력해주세요','error'); return; }
    // 표에서 읽은 값이라는 걸 남긴다. 실측(db)·추정(ai)과 구분돼야 나중에 판단할 수 있다.
    this._rememberAi({ ...f, src:'label' });
    this.addToCart(f, meal, ds);
    this._lblB64 = null;
  },

  selectDbFood(i, meal, ds){
    const f = (this._dbHits||[])[i]; if(!f) return;
    // 사전에 남긴다. 같은 걸 또 검색하지 않아도 되고, 하루 1만 회 한도도 아낀다.
    this._rememberAi({ n:f.n, u:f.u, c:f.c, p:f.p, cb:f.cb, ft:f.ft, src:'db' });
    this.addToCart(f, meal, ds);
  },

  favFromSearch(i, meal, ds){
    const f=(this._hits||[])[i]; if(!f) return;
    this.toggleFav(f.n);
    const q=document.getElementById('dietSearch')?.value||'';
    this.searchFood(q, meal, ds);      // 즐겨찾기가 위로 올라가는 게 바로 보이도록 다시 그린다
  },
});
