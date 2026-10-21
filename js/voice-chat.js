// js/voice-chat.js — AI 비서 음성 대화 모드
//
// 마이크 단추를 누르면 '음성 대화' 가 켜진다. 듣기 → (말이 멈추면) 자동 보내기 → 생각 → 답을 소리로 읽기 → 다시 듣기.
// 말하는 동안에는 듣지 않는다(제 목소리를 다시 알아듣지 않도록). 동그라미를 누르면 읽기를 끊고 바로 듣는다.
// 시트를 닫거나 앱이 뒤로 가거나 30초 동안 아무 말이 없으면 끝난다.
//
// 앱(iOS·Android): @capgo/capacitor-speech-recognition + @capacitor-community/text-to-speech
// 웹: webkitSpeechRecognition + speechSynthesis (없으면 안내만 한다)

const VoiceChat = {
  active: false,
  state: 'off',            // off | listen | think | speak
  text: '',                // 이번 차례에 들은 말
  SILENCE_MS: 1200,        // 말이 멈춘 뒤 이만큼 조용하면 보낸다
  SILENCE_FINAL_MS: 800,   // 인식기가 '확정' 을 준 뒤라면 조금 더 빨리
  IDLE_MS: 30000,          // 이만큼 아무 말이 없으면 끝낸다

  _turn: 0,                // 차례 번호 — 지난 인식 세션의 늦은 이벤트를 걸러낸다
  _silT: null, _idleT: null,
  _rec: null,              // 웹 인식기
  _capture: null,          // AI 답 모으기
  _nBound: false,
  _meter: null,            // 웹 마이크 세기 (데스크톱만)

  get _nSR(){ return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.SpeechRecognition : null; },
  get _nTTS(){ return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.TextToSpeech : null; },
  get _webSR(){ return window.SpeechRecognition || window.webkitSpeechRecognition || null; },
  supported(){ return !!(this._nSR || this._webSR); },

  init() {
    if (this._inited || typeof JARVIS === 'undefined') return;
    this._inited = true;
    this._css();
    // AI 답 가로채기: 음성 대화 중 보낸 말에 대한 답(type 'ai')을 모아서 읽는다.
    const add = JARVIS._addMsg.bind(JARVIS);
    JARVIS._addMsg = (type, text) => {
      if (this._capture && type === 'ai' && text) this._capture.push(String(text));
      return add(type, text);
    };
    // 시트를 닫으면 끝낸다.
    const tog = JARVIS.toggle.bind(JARVIS);
    JARVIS.toggle = (...a) => { const r = tog(...a); if (!JARVIS.isOpen && this.active) this.stop(); return r; };
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) this.stop(); });
    try { window.Capacitor?.Plugins?.App?.addListener?.('pause', () => { if (this.active) this.stop(); }); } catch (e) {}
  },

  // ── 켜기/끄기 ─────────────────────────
  async start() {
    this.init();
    if (this.active) return;
    if (!this.supported()) {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      App.showToast(ios ? '이 브라우저는 음성 대화를 지원하지 않습니다. 키보드의 마이크 단추로 말해 주세요'
                        : '이 브라우저는 음성 대화를 지원하지 않습니다. 크롬이나 Bashy 앱에서 써 주세요', '');
      document.getElementById('jInput')?.focus();
      return;
    }
    if (this._nSR) {
      try {
        const p = await this._nSR.requestPermissions();
        if (p && p.speechRecognition && p.speechRecognition !== 'granted') {
          App.showToast('설정 → Bashy 에서 마이크·음성 인식을 허용해 주세요', 'error'); return;
        }
      } catch (e) { App.showToast('음성 인식을 시작하지 못했습니다', 'error'); return; }
      this._bindNative();
    }
    try { JARVIS._stopSpeak?.(); } catch (e) {}
    // 웹 speechSynthesis 는 사용자 손짓 안에서 한 번 깨워 두어야 이후 자동 읽기가 막히지 않는다.
    if (!this._nTTS && window.speechSynthesis) { try { const u = new SpeechSynthesisUtterance(''); speechSynthesis.speak(u); } catch (e) {} }
    this.active = true;
    this._mount(true);
    this._listen();
  },

  stop(msg) {
    if (!this.active) return;
    this.active = false;
    this._turn++;
    clearTimeout(this._silT); clearTimeout(this._idleT);
    this._capture = null;
    this._stopRec();
    this._stopTTS();
    this._meterOff();
    this.state = 'off';
    this._mount(false);
    try { JARVIS._setStatus('대기 중'); } catch (e) {}
    try { Haptic.light(); } catch (e) {}
    if (msg) App.showToast(msg, '');
  },

  toggle() { this.active ? this.stop() : this.start(); },

  // 동그라미: 말하는 중이면 끊고 듣기, 듣는 중이고 들은 말이 있으면 바로 보내기
  tap() {
    if (this.state === 'speak') { this._stopTTS(); this._listen(); }
    else if (this.state === 'listen' && this.text.trim()) this._finalize();
  },

  // ── 상태 ─────────────────────────────
  _set(st) {
    if (this.state === st) return;
    this.state = st;
    const lab = { listen: '듣는 중', think: '생각 중', speak: '말하는 중' }[st] || '';
    const hint = { listen: '말씀이 끝나면 저절로 보냅니다', think: '답을 만드는 중입니다', speak: '누르면 끊고 바로 말할 수 있습니다' }[st] || '';
    const p = document.getElementById('jVoicePanel');
    if (p) {
      p.dataset.st = st;
      const l = p.querySelector('.vc-state'); if (l) l.textContent = lab;
      const o = p.querySelector('.vc-orb');
      if (o) { o.innerHTML = Icons.svg(st === 'speak' ? 'volume' : 'mic'); o.ariaLabel = st === 'speak' ? '읽기 끊고 말하기' : st === 'listen' ? '지금 보내기' : lab; }
      if (st !== 'listen' || !this.text) this._line(hint, true);
    }
    try { JARVIS._setStatus(lab); } catch (e) {}
    try { Haptic.light(); } catch (e) {}
  },
  _line(t, hint) {
    const el = document.getElementById('jVoiceLine'); if (!el) return;
    el.textContent = t; el.classList.toggle('vc-hint', !!hint);
  },
  _level(v) {
    const p = document.getElementById('jVoicePanel'); if (!p) return;
    const lv = Math.max(0, Math.min(1, v || 0));
    p.style.setProperty('--vc-lv', lv.toFixed(3));
    p.classList.add('vc-has-lv');
  },

  // ── 듣기 ─────────────────────────────
  async _listen() {
    if (!this.active) return;
    const turn = ++this._turn;
    this.text = '';
    this._heardFinal = false;
    clearTimeout(this._silT);
    this._set('listen');
    this._line('말씀하세요', true);
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => { if (this.active && this.state === 'listen' && !this.text) this.stop('말씀이 없어 음성 대화를 마쳤습니다'); }, this.IDLE_MS);
    if (this._nSR) return this._nativeStart(turn);
    this._webStart(turn);
  },

  _heard(t, isFinal, turn) {
    if (!this.active || this.state !== 'listen' || turn !== this._turn) return;
    t = String(t || '').trim(); if (!t) return;
    const changed = t !== this.text;
    this.text = t;
    if (isFinal) this._heardFinal = true;
    this._line(t, false);
    clearTimeout(this._idleT);
    if (changed || isFinal) {
      clearTimeout(this._silT);
      this._silT = setTimeout(() => this._finalize(turn), isFinal ? this.SILENCE_FINAL_MS : this.SILENCE_MS);
    }
  },

  // 말이 멈췄다 → 인식을 끄고 보낸다
  async _finalize(turn) {
    if (turn != null && turn !== this._turn) return;
    if (!this.active || this.state !== 'listen') return;
    clearTimeout(this._silT); clearTimeout(this._idleT);
    const msg = this.text.trim();
    this._turn++;                 // 이후 늦게 오는 인식 결과는 버린다
    this._stopRec();
    this._meterOff();
    if (!msg) return this._listen();
    this._set('think');
    const got = this._capture = [];
    try { await JARVIS.send(msg); } catch (e) {}
    if (this._capture !== got) return;   // 그사이 끝났거나 다시 시작됨
    this._capture = null;
    if (!this.active) return;
    const say = this.clean(got.join('\n'));
    if (!say) return this._listen();
    await this._speak(say);
    if (this.active && this.state === 'speak') this._listen();
  },

  // ── 웹 인식 ──────────────────────────
  _webStart(turn) {
    const SR = this._webSR; if (!SR) return this.stop('음성 인식을 쓸 수 없습니다');
    this._stopRec();
    const r = new SR();
    r.lang = 'ko-KR'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = e => {
      let t = '', fin = true;
      for (let i = 0; i < e.results.length; i++) { t += e.results[i][0].transcript; if (!e.results[i].isFinal) fin = false; }
      this._heard(t, fin, turn);
    };
    r.onerror = e => {
      if (turn !== this._turn) return;
      const err = e && e.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') this.stop('마이크 권한을 허용해 주세요');
      else if (err === 'network') this.stop('인터넷 연결이 없어 음성 인식을 멈췄습니다');
      else if (err === 'audio-capture') this.stop('마이크를 찾지 못했습니다');
      // no-speech, aborted 는 onend 에서 다시 듣는다
    };
    r.onend = () => {
      if (turn !== this._turn || !this.active || this.state !== 'listen') return;
      if (this.text.trim()) this._finalize(turn);          // 인식기가 먼저 끝냈다 = 말이 끝났다
      else setTimeout(() => { if (turn === this._turn && this.active && this.state === 'listen') this._webStart(turn); }, 250);
    };
    this._rec = r;
    try { r.start(); } catch (e) { this.stop('마이크 권한이 필요합니다'); return; }
    this._meterOn();
  },

  // ── 앱(네이티브) 인식 ────────────────
  _bindNative() {
    if (this._nBound || !this._nSR) return;
    this._nBound = true;
    const SR = this._nSR;
    SR.addListener('partialResults', e => {
      const t = (e && (e.accumulatedText || (e.matches && e.matches[0]))) || '';
      this._heard(t, false, this._turn);
    }).catch(() => {});
    SR.addListener('audioLevel', e => { if (this.state === 'listen') this._level(e && e.level); }).catch(() => {});
    SR.addListener('listeningState', e => {
      const st = e && (e.state || e.status);
      if (st !== 'stopped' || !this.active || this.state !== 'listen') return;
      const turn = this._turn;
      // 인식기가 스스로 멈췄다(안드로이드는 조용해지면 끝낸다). 들은 말이 있으면 보내고, 없으면 다시 듣는다.
      if (this.text.trim()) this._finalize(turn);
      else setTimeout(() => { if (turn === this._turn && this.active && this.state === 'listen') this._nativeStart(turn); }, 350);
    }).catch(() => {});
  },
  async _nativeStart(turn, retry) {
    const SR = this._nSR;
    try {
      const r = await SR.start({ language: 'ko-KR', partialResults: true, popup: false, addPunctuation: false, maxResults: 1, muteRecognizerBeep: true });
      const m = r && r.matches && r.matches[0];
      if (m) this._heard(m, true, turn);
    } catch (e) {
      if (turn !== this._turn || !this.active) return;
      if (!retry) { setTimeout(() => this._nativeStart(turn, true), 500); return; }   // 지난 세션 정리 중일 수 있다
      this.stop('음성 인식을 시작하지 못했습니다');
    }
  },

  _stopRec() {
    if (this._rec) { const r = this._rec; this._rec = null; r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch (e) {} }
    if (this._nSR) { this._nSR.stop().catch(() => {}); }
    const p = document.getElementById('jVoicePanel'); if (p) p.classList.remove('vc-has-lv');
  },

  // 웹 마이크 세기 — 데스크톱에서만 (폰 브라우저는 인식기와 마이크를 다투다 끊긴다)
  async _meterOn() {
    if (this._meter || !matchMedia('(pointer:fine)').matches || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.active || this.state !== 'listen') { stream.getTracks().forEach(t => t.stop()); return; }
      const ctx = new AC(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 512; src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const m = this._meter = { stream, ctx, raf: 0 };
      const tick = () => {
        if (this._meter !== m) return;
        an.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const db = 20 * Math.log10(Math.max(Math.sqrt(s / buf.length), 1e-7));
        this._level((db + 50) / 50);
        m.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { this._meter = null; }
  },
  _meterOff() {
    const m = this._meter; if (!m) return; this._meter = null;
    cancelAnimationFrame(m.raf);
    try { m.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { m.ctx.close(); } catch (e) {}
  },

  // ── 읽기(TTS) ────────────────────────
  async _speak(text) {
    this._set('speak');
    const turn = this._turn;
    if (this._nTTS) {
      try { await this._nTTS.speak({ text, lang: 'ko-KR', rate: 1.0, pitch: 1.0, volume: 1.0, category: 'playback' }); } catch (e) {}
      await new Promise(r => setTimeout(r, 250));   // 스피커 끝소리를 다시 듣지 않도록 잠깐 쉰다
      return;
    }
    const S = window.speechSynthesis; if (!S) return;
    // 크롬은 긴 문장을 15초쯤에서 끊는다 — 문장 단위로 나눠 차례로 읽는다.
    const parts = text.match(/[^.!?。\n]+[.!?。]?/g) || [text];
    const ko = S.getVoices().find(v => /^ko[-_]KR/i.test(v.lang));
    for (const part of parts) {
      const t = part.trim(); if (!t) continue;
      if (!this.active || this.state !== 'speak' || turn !== this._turn) return;
      await new Promise(res => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'ko-KR'; u.rate = 1.05; u.pitch = 1.0; if (ko) u.voice = ko;
        let done = false; const fin = () => { if (!done) { done = true; clearTimeout(g); res(); } };
        u.onend = fin; u.onerror = fin;
        const g = setTimeout(fin, 3000 + t.length * 180);   // onend 가 오지 않는 브라우저 대비
        this._utterFin = fin;
        S.speak(u);
      });
    }
    this._utterFin = null;
    await new Promise(r => setTimeout(r, 200));
  },
  _stopTTS() {
    if (this._nTTS) { this._nTTS.stop().catch(() => {}); return; }
    try { window.speechSynthesis?.cancel(); } catch (e) {}
    const f = this._utterFin; this._utterFin = null; if (f) f();
  },

  // 읽을 말만 남긴다: 코드·JSON·마크다운·이모지·링크를 걷어 낸다.
  clean(s) {
    s = String(s || '');
    s = s.replace(/```[\s\S]*?```/g, ' ');
    // JSON 덩어리: 'response' 가 있으면 그것만, 아니면 통째로 버린다
    s = s.replace(/\{[\s\S]*\}/g, m => { try { const o = JSON.parse(m); return o.response || o.message || ' '; } catch (e) { return ' '; } });
    s = s.replace(/`([^`]*)`/g, '$1')
         .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
         .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
         .replace(/https?:\/\/\S+/g, ' ')
         .replace(/^\s{0,3}#{1,6}\s+/gm, '')
         .replace(/^\s*[-*•·]\s+/gm, '')
         .replace(/^\s*\d+[.)]\s+/gm, '')
         .replace(/[*_~#>|]+/g, '')
         .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
         .replace(/[ \t]+/g, ' ')
         .replace(/\s*\n\s*/g, '\n')
         .trim();
    return s.length > 600 ? s.slice(0, 600).replace(/[^.!?。\n]*$/, '') || s.slice(0, 600) : s;
  },

  // ── 화면 ─────────────────────────────
  _mount(on) {
    const wrap = document.querySelector('#jarvisPanel .j-input-wrap'); if (!wrap) return;
    document.getElementById('jarvisPanel')?.classList.toggle('vc-mode', on);
    let p = document.getElementById('jVoicePanel');
    if (on && !p) {
      p = document.createElement('div');
      p.id = 'jVoicePanel'; p.className = 'vc-panel';
      p.innerHTML = `
        <button type="button" class="vc-orb" onclick="VoiceChat.tap()" aria-label="지금 보내기">${Icons.svg('mic')}</button>
        <div class="vc-mid" aria-live="polite">
          <div class="vc-state">듣는 중</div>
          <div id="jVoiceLine" class="vc-line vc-hint">말씀하세요</div>
        </div>
        <button type="button" class="vc-end" onclick="VoiceChat.stop()">종료</button>`;
      wrap.prepend(p);
    }
    if (p) p.hidden = !on;
    if (!on && p) { p.dataset.st = ''; p.classList.remove('vc-has-lv'); }
    try { JARVIS._syncSend?.(); } catch (e) {}
  },

  _css() {
    if (document.getElementById('vcStyle')) return;
    const st = document.createElement('style'); st.id = 'vcStyle';
    st.textContent = `
#jarvisPanel.vc-mode .j-input-row, #jarvisPanel.vc-mode #jVoiceBar, #jarvisPanel.vc-mode .j-chips{ display:none !important; }
.vc-panel{ display:flex; align-items:center; gap:16px; min-height:72px; padding:8px 0; --vc-lv:0; }
.vc-panel[hidden]{ display:none; }
.vc-orb{ position:relative; flex:none; width:56px; height:56px; border-radius:50%; border:0; padding:0; cursor:pointer;
  display:flex; align-items:center; justify-content:center; background:var(--accent); color:#101113; -webkit-tap-highlight-color:transparent; }
.vc-orb .ic{ width:24px; height:24px; position:relative; z-index:1; }
.vc-orb::before{ content:''; position:absolute; inset:0; border-radius:50%; background:var(--accent); opacity:.22; transform:scale(1); transition:transform .08s linear; }
.vc-panel[data-st="listen"] .vc-orb::before{ animation:vcPulse 1.6s ease-in-out infinite; }
.vc-panel.vc-has-lv[data-st="listen"] .vc-orb::before{ animation:none; transform:scale(calc(1 + var(--vc-lv) * .6)); }
.vc-panel[data-st="think"] .vc-orb{ background:var(--border); color:var(--text3); }
.vc-panel[data-st="think"] .vc-orb::before{ opacity:1; background:none; border:2px solid transparent; border-top-color:var(--accent); inset:-4px; animation:vcSpin .9s linear infinite; }
.vc-panel[data-st="speak"] .vc-orb::before{ animation:vcPulse .9s ease-in-out infinite; }
@keyframes vcPulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.28); } }
@keyframes vcSpin{ to{ transform:rotate(360deg); } }
.vc-mid{ flex:1; min-width:0; display:flex; flex-direction:column; gap:0; }
.vc-state{ font-size:13px; font-weight:600; color:var(--accent-l, var(--accent)); line-height:16px; }
.vc-line{ font-size:15px; line-height:24px; color:var(--text); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:keep-all; overflow-wrap:anywhere; }
.vc-line.vc-hint{ color:var(--text3); font-size:14px; }
.vc-end{ flex:none; height:40px; padding:0 16px; border-radius:20px; border:1px solid var(--border); background:none; color:var(--text); font:inherit; font-size:14px; cursor:pointer; }
@media (prefers-reduced-motion:reduce){ .vc-orb::before{ animation:none !important; } }
`;
    document.head.appendChild(st);
  },
};
window.VoiceChat = VoiceChat;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => VoiceChat.init(), 0));
else setTimeout(() => VoiceChat.init(), 0);
