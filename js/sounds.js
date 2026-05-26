// js/sounds.js — 클릭음 & 달성 사운드 (Web Audio API, 무설치)

const Sounds = {
  _ctx: null,
  _enabled: true,

  get enabled() { return localStorage.getItem('gl_sound') !== 'false'; },
  set enabled(v) { localStorage.setItem('gl_sound', v ? 'true' : 'false'); },

  _getCtx() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  },

  // 기본 클릭음 - 짧고 부드러운 틱
  click() {
    if (!this.enabled) return;
    const ctx = this._getCtx(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 800;
    o.type = 'sine';
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.08);
  },

  // 체크음 - 가볍고 경쾌한 '딩'
  check() {
    if (!this.enabled) return;
    const ctx = this._getCtx(); if (!ctx) return;
    [880, 1100].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.07;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.start(t); o.stop(t + 0.15);
    });
  },

  // 해제음 - 낮고 짧은 '툭'
  uncheck() {
    if (!this.enabled) return;
    const ctx = this._getCtx(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 440;
    o.type = 'sine';
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.1);
  },

  // 추가/저장 성공음 - 경쾌한 '두 음'
  success() {
    if (!this.enabled) return;
    const ctx = this._getCtx(); if (!ctx) return;
    [660, 880].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = 'triangle';
      const t = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.start(t); o.stop(t + 0.2);
    });
  },

  // 삭제음 - 낮은 '뚝'
  delete() {
    if (!this.enabled) return;
    const ctx = this._getCtx(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.04, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.1);
  },

  // 달성/퍼펙트 - 밝고 경쾌한 팡파레
  achieve() {
    if (!this.enabled) return;
    const ctx = this._getCtx(); if (!ctx) return;
    const notes = [523, 659, 784, 1047]; // C E G C
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.start(t); o.stop(t + 0.25);
    });
  },

  // AudioContext를 즉시 resume하는 내부 헬퍼 (사용자 제스처 없이도 시도)
  _resumeCtx() {
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  },

  // 동기화 완료 - 부드러운 슈웅 사운드
  sync() {
    if (!this.enabled) return;
    const ctx = this._getCtx(); if (!ctx) return;
    // 화이트 노이즈 + 필터로 슈웅 효과
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.3);
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + 0.4);
  },
};

// ── 백그라운드 복귀 시 AudioContext 자동 resume ──────────────────────────────
// PWA/모바일에서 앱이 백그라운드로 전환되면 브라우저가 AudioContext를 suspend 시킴.
// visibilitychange 이벤트로 포그라운드 복귀를 감지해 즉시 resume 처리.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    Sounds._resumeCtx();
  }
});

// 사용자 제스처(터치/클릭) 시에도 resume 시도 — iOS Safari 대응
['touchstart', 'click', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => Sounds._resumeCtx(), { once: false, passive: true });
});
