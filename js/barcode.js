// js/barcode.js — 바코드로 제품 찾기
//
// 이름으로 찾으면 '훈제닭가슴살' 이 51건 나오고 그중 어느 것이 내 것인지 알 수 없다.
// 바코드는 제품 하나를 가리킨다. 서버(api/barcode.js)가 식약처와 Open Food Facts 를
// 둘 다 훑어서, 품목보고번호까지 맞은 줄이면 '확실' 이라고 표시해서 돌려준다.
//
// 읽는 방법이 둘인 이유: iOS Safari 는 BarcodeDetector 를 아직 기본으로 끄고 있다.
// 그래서 있으면 그걸 쓰고, 없으면 ZXing 을 그때 내려받는다 — 스캔을 한 번도 안 쓰는
// 사람에게 336KB 를 지우지 않으려고 미리 넣지 않는다.

const Scan = {
  ZX: 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
  _stream: null, _timer: null, _busy: false, _reader: null, _native: null,

  async open(meal, ds){
    this._meal = meal; this._ds = ds;
    document.getElementById('scanWrap')?.remove();
    const el = document.createElement('div');
    el.id = 'scanWrap'; el.className = 'scan-wrap';
    el.innerHTML = `
      <div class="scan-hd">바코드 스캔<button class="scan-x" onclick="Scan.close()">✕</button></div>
      <div class="scan-view">
        <video id="scanVid" playsinline muted autoplay></video>
        <div class="scan-frame"></div>
      </div>
      <div class="scan-msg" id="scanMsg">카메라를 켜는 중…</div>
      <div class="scan-foot">
        <input id="scanNum" class="inp inp-sm" inputmode="numeric" autocomplete="off"
               placeholder="안 읽히면 바코드 숫자를 직접">
        <button class="btn-sm" onclick="Scan.manual()">조회</button>
      </div>
      <div id="scanRes"></div>`;
    document.body.appendChild(el);
    await this._start();
  },

  close(){
    clearTimeout(this._timer); this._timer = null;
    // 트랙을 끄지 않으면 화면을 닫아도 카메라 불이 계속 켜져 있다.
    if(this._stream){ this._stream.getTracks().forEach(t=>t.stop()); this._stream = null; }
    this._busy = false;
    document.getElementById('scanWrap')?.remove();
  },

  _say(html){ const m = document.getElementById('scanMsg'); if(m) m.innerHTML = html; },

  async _start(){
    const vid = document.getElementById('scanVid');
    if(!vid) return;
    if(!navigator.mediaDevices?.getUserMedia){
      this._say('이 브라우저에서는 카메라를 못 써요. 아래에 바코드 숫자를 적어 주세요'); return;
    }
    try{
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      vid.srcObject = this._stream;
      await vid.play().catch(()=>{});
    }catch(err){
      // 권한을 막았을 때와 카메라가 없을 때는 할 말이 다르다.
      const denied = /NotAllowed|Permission/i.test(err.name || '');
      this._say(denied ? '카메라 권한이 막혀 있어요. 설정에서 허용하거나, 아래에 숫자를 적어 주세요'
                       : '카메라를 열지 못했어요. 아래에 바코드 숫자를 적어 주세요');
      return;
    }
    // 있으면 브라우저 것을 쓴다 — 안드로이드 크롬은 이쪽이 훨씬 빠르다.
    if(typeof BarcodeDetector !== 'undefined'){
      try{ this._native = new BarcodeDetector({ formats:['ean_13','ean_8','upc_a','upc_e'] }); }
      catch(e){ this._native = null; }
    }
    if(!this._native){
      this._say('준비하는 중…');
      try{ await this._loadZx(); }
      catch(e){ this._say('바코드 인식기를 못 불러왔어요. 아래에 숫자를 적어 주세요'); return; }
    }
    this._say('바코드를 테두리 안에 맞춰 주세요 <i>포장의 흰 여백까지 들어와야 읽혀요</i>');
    this._tick();
  },

  _loadZx(){
    if(window.ZXing) return Promise.resolve();
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = this.ZX; s.onload = ok; s.onerror = () => no(new Error('load'));
      document.head.appendChild(s);
    });
  },

  // 한 장씩 꺼내 본다. 못 읽으면 그냥 다음 장을 본다 — 실패는 정상이고, 말하지 않는다.
  async _tick(){
    if(!this._stream) return;
    const vid = document.getElementById('scanVid');
    if(vid && vid.readyState >= 2 && !this._busy){
      this._busy = true;
      let code = null;
      try { code = this._native ? await this._nat(vid) : this._zx(vid); } catch(e){ code = null; }
      this._busy = false;
      if(code){ this._found(code); return; }
    }
    this._timer = setTimeout(()=>this._tick(), this._native ? 200 : 350);
  },

  async _nat(vid){
    const r = await this._native.detect(vid);
    return (r && r[0] && r[0].rawValue) || null;
  },

  // ZXing 에 넘기려면 회색 한 장으로 만들어야 한다. RGBA 를 그대로 주면
  // 밝기가 아니라 빨강·초록·파랑을 밝기로 읽어서 아무것도 못 찾는다.
  _zx(vid){
    const Z = window.ZXing; if(!Z) return null;
    const w = vid.videoWidth, h = vid.videoHeight;
    if(!w || !h) return null;
    const cv = this._cv || (this._cv = document.createElement('canvas'));
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(vid, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    const g = new Uint8ClampedArray(w * h);
    for(let i = 0, j = 0; j < g.length; i += 4, j++)
      g[j] = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) | 0;
    if(!this._reader){
      const hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,
        [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      this._reader = new Z.MultiFormatReader(); this._reader.setHints(hints);
    }
    try{
      const src = new Z.RGBLuminanceSource(g, w, h);
      return this._reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(src))).getText();
    }catch(e){ return null; }   // 못 찾은 것뿐이다
  },

  manual(){
    const v = (document.getElementById('scanNum')?.value || '').replace(/\D/g, '');
    if(v.length < 8){ this._say('바코드 숫자를 8자리 이상 적어 주세요'); return; }
    this._found(v);
  },

  async _found(code){
    clearTimeout(this._timer); this._timer = null;
    if(this._stream){ this._stream.getTracks().forEach(t=>t.stop()); this._stream = null; }
    const view = document.querySelector('#scanWrap .scan-view'); if(view) view.remove();
    this._say(`<b>${esc(code)}</b> 찾는 중…`);
    let j = null;
    try{ const r = await fetch(Platform.api('/api/barcode?code=' + encodeURIComponent(code))); j = await r.json(); }
    catch(e){ j = null; }
    const box = document.getElementById('scanRes'); if(!box) return;

    if(!j || !j.ok){
      // 체크디지트가 틀렸다는 건 '없는 제품' 이 아니라 '잘못 읽었다' 는 뜻이다. 갈라서 말한다.
      const bad = j && j.error === 'bad_barcode';
      this._say(bad ? '숫자가 바코드 규칙에 안 맞아요 — 한 자리를 잘못 읽었을 수 있어요'
                    : '조회에 실패했어요');
      box.innerHTML = this._retryHtml(); return;
    }
    this._render(j);
  },

  _render(j){
    const box = document.getElementById('scanRes');
    const meal = this._meal, ds = this._ds;
    this._hits = (j.hits || []).map(x => {
      const f = Diet._fromDb(x);           // 환산은 식단 쪽과 같은 공식을 쓴다
      f.e = x.src === 'off' ? '🌍' : '🥗';
      f.src = x.src;
      return f;
    });

    // 정체를 알아냈으면 먼저 말한다. 값이 없어도 이름만으로 다음 걸음이 정해진다.
    let head = '';
    if(j.id){
      head = `<div class="scan-id">
        <div class="scan-id-nm">${esc(j.id.name)}</div>
        <div class="scan-id-sub">${esc(j.id.maker || '')}${j.id.kind ? ' · ' + esc(j.id.kind) : ''}</div>
        ${j.exact ? `<div class="scan-sure">품목보고번호까지 맞았어요 — 이 제품이 확실해요</div>` : ''}
        ${j.id.ended ? `<div class="scan-warn">생산이 끝난 제품이에요 (${esc(j.id.ended)})</div>` : ''}
      </div>`;
    }

    if(!this._hits.length){
      this._say(j.id ? '제품은 찾았는데 영양성분이 어디에도 없어요' : '어느 DB 에도 없는 제품이에요');
      box.innerHTML = head + `<div class="diet-label-hint">
          ${j.id ? '이름을 알았으니 검색창에 넣어 두었어요. 값은 포장의 영양성분표를 찍어 주세요.'
                 : '포장의 영양성분표를 찍으면 적힌 값을 그대로 읽어 옵니다.'}${this._fskNote(j)}
        </div>` + this._retryHtml();
      // 이름을 알아냈으면 검색창에 넣어 준다 — 사용자가 다시 타자할 이유가 없다.
      if(j.id) this._toSearch(j.id.name);
      return;
    }

    this._say(j.exact ? '찾았어요' : '이 중에 있을 거예요');
    box.innerHTML = head
      + this._hits.map((f, i) => `<div class="diet-food">
          <div class="diet-food-main" onclick="Scan.add(${i})">
            <span class="diet-food-nm">${f.e} ${esc(f.n)}</span>
            <span class="diet-food-u">${esc(f.u)}</span>
            ${f.grp ? `<span class="diet-food-n">${esc(f.grp)}</span>` : ''}
            ${f.note ? `<span class="diet-food-note">${esc(f.note)}</span>` : ''}
          </div>
          <span class="diet-food-cal">${f.c}<i>kcal</i></span>
        </div>`).join('')
      + `<div class="diet-macro-note">🥗 식약처 실측 · 🌍 Open Food Facts${this._fskNote(j)}</div>`
      + this._retryHtml();
  },

  // 식약처에 못 물어봤으면 그 이유를 말한다. '못 찾음' 과 '못 물어봄' 은 다른 일이고,
  // 갈라 주지 않으면 낮에는 안 되고 밤에는 되는 이유를 사용자가 영영 알 수 없다.
  _fskNote(j){
    if(j.fsk === 'ok' || j.fsk === 'none') return '';
    if(j.fsk === 'closed') return ' · 식약처 오픈API 가 09~19시에는 닫혀 있어요 — 저녁에 다시 스캔하면 제품까지 특정돼요';
    if(j.fsk === 'nokey')  return ' · 식품안전나라 키가 없어 제품 특정은 건너뛰었어요';
    return ' · 식약처에 물어보지 못했어요';
  },

  _retryHtml(){
    return `<div class="scan-again">
      <button class="btn-sm" onclick="Scan.open(Scan._meal, Scan._ds)">다시 스캔</button>
      <button class="btn-sm" onclick="Scan.close()">닫기</button>
    </div>`;
  },

  _toSearch(name){
    const inp = document.getElementById('dietSearch');
    if(!inp) return;
    inp.value = name;
    Diet.searchFood(name, this._meal, this._ds);
  },

  add(i){
    const f = (this._hits || [])[i]; if(!f) return;
    // 어디서 온 값인지 남긴다. 나중에 이 숫자를 믿을지 판단할 근거가 된다.
    Diet._rememberAi({ n:f.n, u:f.u, c:f.c, p:f.p, cb:f.cb, ft:f.ft, src: f.src === 'off' ? 'off' : 'db' });
    Diet.addToCart(f, this._meal, this._ds);
    this.close();
  },
};
