// js/wheel.js — 숫자 휠(Wheel) · 숫자 입력(NumIn, 키패드/스크롤). workout-mode.js 에서 떼어 냄 — 식단·운동·인바디가 같이 쓴다.

// ── 숫자 휠 (아이폰 시간 고르기처럼 굴려서 고르기) ─────────────────
// 칸마다 따로 굴린다. 가운데 줄이 고른 값. 한 칸 넘어갈 때마다 '틱' 진동과 짧은 소리.
// 위아래로 갈수록 원통에 감긴 것처럼 기울고 흐려진다(rotateX).
const Wheel = {
  H: 40,   // 한 줄 높이
  open(o) {
    this.o = o;
    const cols = o.cols.map((c, ci) => `<div class="whl-col" data-c="${ci}"><div class="whl-sc">
        <div class="whl-pad"></div>${c.vals.map((v, i) => `<div class="whl-it" data-i="${i}">${esc(c.fmt ? c.fmt(v) : String(v))}</div>`).join('')}<div class="whl-pad"></div>
      </div></div>`).join('');
    App.openModal('@clock ' + o.title, `
      <div class="whl">${cols}${o.unit ? `<div class="whl-unit">${esc(o.unit)}</div>` : ''}<div class="whl-sel" aria-hidden="true"></div></div>
      ${o.note ? `<p class="pg-note whl-note">${esc(o.note)}</p>` : ''}
      ${o.extra || ''}
      <div class="modal-btns"><button class="btn-sm" onclick="Wheel.cancel()">취소</button><button class="btn-sm accent" onclick="Wheel.ok()">확인</button></div>`);
    requestAnimationFrame(() => {
      document.querySelectorAll('.whl-col').forEach((col, ci) => {
        const c = o.cols[ci], sc = col.querySelector('.whl-sc');
        let idx = Math.max(0, c.vals.indexOf(c.cur)); if (idx < 0) idx = 0;
        sc.scrollTop = idx * this.H; col._i = idx; this.paint(col);
        sc.addEventListener('scroll', () => this.onScroll(col), { passive: true });
      });
    });
  },
  // 창을 새로 띄우지 않고 지금 화면 안에 휠을 그린다(습관 알림 시각처럼 폼 안에서 고를 때)
  inline(box, cols, onChange) {
    box.innerHTML = `<div class="whl whl-inline">${cols.map((c, ci) => `<div class="whl-col" data-c="${ci}"><div class="whl-sc">
        <div class="whl-pad"></div>${c.vals.map((v, i) => `<div class="whl-it" data-i="${i}">${esc(c.fmt ? c.fmt(v) : String(v))}</div>`).join('')}<div class="whl-pad"></div>
      </div></div>`).join('')}<div class="whl-sel" aria-hidden="true"></div></div>`;
    const read = () => [...box.querySelectorAll('.whl-col')].map((col, ci) => { const c = cols[ci]; return c.vals[Math.max(0, Math.min(c.vals.length - 1, Math.round(col.querySelector('.whl-sc').scrollTop / this.H)))]; });
    requestAnimationFrame(() => box.querySelectorAll('.whl-col').forEach((col, ci) => {
      const c = cols[ci], sc = col.querySelector('.whl-sc');
      const idx = Math.max(0, c.vals.indexOf(c.cur));
      sc.scrollTop = idx * this.H; col._i = idx; this.paint(col);
      col._cb = () => onChange && onChange(read());
      sc.addEventListener('scroll', () => this.onScroll(col), { passive: true });
    }));
    return read;
  },
  onScroll(col) {
    const sc = col.querySelector('.whl-sc');
    const i = Math.round(sc.scrollTop / this.H);
    if (i !== col._i) { col._i = i; this.tick(); if (col._cb) col._cb(); }
    if (!col._raf) col._raf = requestAnimationFrame(() => { col._raf = 0; this.paint(col); });
  },
  // 가운데에서 멀수록 기울이고 흐리게 — 원통(드럼)이 도는 느낌
  paint(col) {
    const sc = col.querySelector('.whl-sc'), pos = sc.scrollTop / this.H;
    col.querySelectorAll('.whl-it').forEach(el => {
      const d = Number(el.dataset.i) - pos, ad = Math.min(Math.abs(d), 3);
      el.style.transform = `rotateX(${Math.max(-75, Math.min(75, -d * 22))}deg) scale(${1 - ad * 0.06})`;
      el.style.opacity = String(Math.max(0.12, 1 - ad * 0.32));
      el.classList.toggle('on', Math.abs(d) < 0.5);
    });
  },
  tick() {
    try { Haptic.select(); } catch (e) {}
    try {
      const W = WorkoutMode; if (!W.prefs().sound) return;
      W._audio(); const ctx = W._ac; if (!ctx) return;
      // 짧은 딸깍: 아주 짧은 잡음 + 높은 음
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.03);
    } catch (e) {}
  },
  cancel() { App.closeModal(); if (this.o && this.o.cancel) this.o.cancel(); },
  ok() {
    const vals = [...document.querySelectorAll('.whl-col')].map((col, ci) => {
      const c = this.o.cols[ci], i = Math.max(0, Math.min(c.vals.length - 1, Math.round(col.querySelector('.whl-sc').scrollTop / this.H)));
      return c.vals[i];
    });
    try { Haptic.light(); } catch (e) {}
    App.closeModal();
    try { this.o.done(vals); } catch (e) { console.warn(e); }
  },
};


// ── 숫자 입력 (무게·횟수) ──────────────────────────
// 키패드: 1~9 · 0 · 소수점 · 지우기. 처음 누르면 원래 값을 바꿔 쓴다.
// 스크롤: 자릿수마다 따로 굴린다 — 무게는 100 · 10 · 1 · 소수점, 횟수는 10 · 1.
// 위의 '키패드 / 스크롤' 을 바꾸면 그 사람은 다음부터 그 방식으로 열린다(계정에 저장).
const NumIn = {
  DEC: [0, 0.25, 0.5, 0.75],
  open(o) {
    this.o = o; this.s = o.cur !== '' && o.cur != null ? String(+o.cur) : ''; this.fresh = true;
    this.mode = WorkoutMode.prefs().numIn === 'wheel' ? 'wheel' : 'pad';
    // 다른 창(식단 담기 등) 위에서도 열리도록 자기 시트로 띄운다 — 아래 창은 그대로 남는다
    document.getElementById('niOv')?.remove();
    const ov = document.createElement('div'); ov.id = 'niOv'; ov.className = 'mx-ov ni-ov';
    ov.innerHTML = `<div class="mx-sh ni-sh" role="dialog" aria-label="${esc(o.title)}"><div class="ni-hd"><b>${esc(o.title)}</b></div><div class="ni">
      <div class="ni-seg"><button type="button" data-m="pad">키패드</button><button type="button" data-m="wheel">스크롤</button></div>
      <div class="ni-disp"><b class="num" id="niV"></b><span>${esc(o.unit || '')}</span></div>
      <div id="niBody"></div>
      ${o.hm ? `<div class="ni-step"><button type="button" class="btn-sm" onclick="NumIn.step(-10)">−10분</button><button type="button" class="btn-sm" onclick="NumIn.step(10)">+10분</button></div>` : ''}
      ${o.note ? `<p class="pg-note ni-note">${esc(o.note)}</p>` : ''}
      <div class="modal-btns"><button class="btn-sm" onclick="NumIn.close()">취소</button><button class="btn-sm accent" onclick="NumIn.ok()">확인</button></div></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) this.close(); });
    requestAnimationFrame(() => ov.classList.add('on'));
    document.querySelectorAll('.ni-seg button').forEach(b => { b.onclick = () => this.setMode(b.dataset.m); });
    this.paint();
  },
  setMode(m) {
    if (m === this.mode) return;
    this.mode = m; this.fresh = true; WorkoutMode.setPrefs({ numIn: m });
    try { Haptic.light(); } catch (e) {}
    this.paint();
  },
  _show() { const v = document.getElementById('niV'); if (!v) return;
    v.textContent = this.s === '' ? '0' : this.s; v.classList.toggle('dim', this.s === '');
    // 시간(분)은 60분이 넘으면 '1시간 30분' 도 같이
    if (this.o.hm) { const n = Number(this.s) || 0, u = v.nextElementSibling; if (u) u.textContent = n >= 60 ? `분 · ${Math.floor(n / 60)}시간${n % 60 ? ' ' + (n % 60) + '분' : ''}` : '분'; } },
  // ±10분 — 키패드·스크롤 어느 쪽이든 값만 바꾸고 다시 그린다
  step(dv) {
    const n = Math.max(0, Math.min(600, (Number(this.s) || 0) + dv));
    this.s = String(n); this.fresh = true; try { Haptic.select(); } catch (e) {}
    if (this.mode === 'wheel') this.paint(); else this._show();
  },
  paint() {
    document.querySelectorAll('.ni-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === this.mode));
    const box = document.getElementById('niBody'); if (!box) return;
    this._show();
    if (this.mode === 'pad') {
      const K = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
      box.innerHTML = `<div class="ni-pad">${K.map(k => `<button type="button" class="ni-k${k === '⌫' ? ' fn' : ''}" ${k === '.' && !this.o.dec ? 'disabled' : ''} data-k="${k}" aria-label="${k === '⌫' ? '지우기' : k === '.' ? '소수점' : k}">${k}</button>`).join('')}</div>`;
      box.querySelectorAll('.ni-k').forEach(b => { b.onclick = () => this.key(b.dataset.k); });
      return;
    }
    const v = Math.max(0, Number(this.s) || 0), I = Math.floor(v), D = v - I;
    const dg = (n) => Array.from({ length: 10 }, (_, i) => i);
    if (this.o.hm) {   // 시간 · 분 두 칸
      const H = Math.min(10, Math.floor(I / 60)), M = I % 60;
      box.innerHTML = `<div class="ni-wh"></div><div class="ni-lab"><span>시간</span><span>분</span></div>`;
      Wheel.inline(box.querySelector('.ni-wh'), [{ vals: Array.from({ length: 11 }, (_, i) => i), cur: H, fmt: x => x + '' }, { vals: Array.from({ length: 60 }, (_, i) => i), cur: M, fmt: x => String(x).padStart(2, '0') }], vals => {
        this.s = String(vals[0] * 60 + vals[1]); this._show();
      });
      return;
    }
    const cols = this.o.dec
      ? [{ vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], cur: Math.floor(I / 100) % 10, fmt: x => x + '' },
         { vals: dg(), cur: Math.floor(I / 10) % 10 },
         { vals: dg(), cur: I % 10 },
         { vals: this.DEC, cur: this.DEC.reduce((a, b) => Math.abs(b - D) < Math.abs(a - D) ? b : a, 0), fmt: x => '.' + String(x).slice(2).padEnd(1, '0') }]
      : [{ vals: dg(), cur: Math.floor(I / 10) % 10 }, { vals: dg(), cur: I % 10 }];
    box.innerHTML = `<div class="ni-wh${this.o.dec ? ' w4' : ''}"></div><div class="ni-lab${this.o.dec ? ' w4' : ''}">${(this.o.dec ? ['100', '10', '1', '소수점'] : ['10', '1']).map(t => `<span>${t}</span>`).join('')}</div>`;
    Wheel.inline(box.querySelector('.ni-wh'), cols, vals => {
      const n = this.o.dec ? vals[0] * 100 + vals[1] * 10 + vals[2] + vals[3] : vals[0] * 10 + vals[1];
      this.s = String(+n.toFixed(2)); this._show();
    });
  },
  key(k) {
    if (k === '⌫') { this.fresh = false; this.s = this.s.slice(0, -1); this._show(); try { Haptic.select(); } catch (e) {} return; }
    let s = this.fresh ? '' : this.s; this.fresh = false;
    if (k === '.') { if (!this.o.dec || s.includes('.')) return; s = (s || '0') + '.'; }
    else {
      if (s.includes('.') && s.split('.')[1].length >= 2) return;
      if (!s.includes('.') && s.replace(/^0/, '').length >= 3) return;
      s = s === '0' ? k : s + k;
    }
    this.s = s; this._show();
    try { Haptic.select(); } catch (e) {}
  },
  close() { const ov = document.getElementById('niOv'); if (!ov) return; ov.classList.remove('on'); setTimeout(() => ov.remove(), 200); },
  ok() {
    let v = this.s.replace(/\.$/, ''); v = v === '' ? '' : Number(v);
    if (v !== '' && !(v >= 0)) v = '';
    this.close();
    try { Haptic.light(); } catch (e) {}
    try { this.o.done(v); } catch (e) { console.warn(e); }
  },
};
