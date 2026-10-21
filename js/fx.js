// js/fx.js — 체크 애니메이션 (설정 › 음성 · 소리 · 효과 › 체크 애니메이션)
//
// 기본은 꺼짐. 켜면 습관을 체크할 때 체크칸이 눌렸다 튀어 오르고, 주황 고리가 퍼지고,
// 조각들이 사방으로 튄다. 그날 습관을 다 채우면 카드 전체에 물결이 지나가고 '올클리어' 도장이 찍힌다.
// 목록은 체크하자마자 다시 그려지므로, 효과는 화면 위 고정 레이어에 따로 띄운다(다시 그려도 끊기지 않게).
const Fx = {
  KEY: 'gl_fx_anim',
  get on() { try { return UserStore.get(this.KEY) === '1'; } catch { return false; } },
  set on(v) { try { UserStore.set(this.KEY, v ? '1' : '0'); window.FirebaseSync?.scheduleSave?.(); } catch {} },
  // 아직 한 번도 고르지 않았으면(처음 체크) 효과를 먼저 보여 주고 켤지 묻는다
  get unset() { try { const v = UserStore.get(this.KEY); return v !== '1' && v !== '0'; } catch { return false; } },
  ask() {
    if (document.getElementById('fxAsk')) return;
    const el = document.createElement('div'); el.id = 'fxAsk'; el.className = 'mx-ov';
    el.innerHTML = `<div class="mx-sh fx-ask" role="dialog" aria-label="체크 애니메이션">
      <b class="fx-ask-t">방금 그 효과, 계속 볼까요?</b>
      <p class="fx-ask-p">습관을 체크할 때마다 터지고, 그날 습관을 다 채우면 올클리어 도장이 찍힙니다.</p>
      <div class="fx-ask-btns"><button type="button" class="fx-ask-no">끄기</button><button type="button" class="mx-go fx-ask-yes">켜 두기</button></div>
    </div>`;
    document.body.appendChild(el);
    const pick = v => {
      this.on = v; el.classList.remove('on'); setTimeout(() => el.remove(), 220);
      setTimeout(() => App.showToast(`${v ? '켰' : '껐'}습니다. 나중에 설정 › 소리 · 진동 · 효과에서 바꿀 수 있어요`, 'success'), 120);
    };
    el.querySelector('.fx-ask-yes').onclick = () => pick(true);
    el.querySelector('.fx-ask-no').onclick = () => pick(false);
    requestAnimationFrame(() => el.classList.add('on'));
  },
  _calm() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } },
  _layer() {
    let L = document.getElementById('fxLayer');
    if (!L) { L = document.createElement('div'); L.id = 'fxLayer'; L.setAttribute('aria-hidden', 'true'); document.body.appendChild(L); }
    return L;
  },
  _el(cls, css) { const e = document.createElement('i'); e.className = cls; Object.assign(e.style, css || {}); this._layer().appendChild(e); return e; },
  _done(a, e) { a.onfinish = () => e.remove(); a.oncancel = () => e.remove(); },

  // 체크 한 번 — el 은 다시 그린 뒤의 체크칸
  check(el, force) {
    if (!el || (!force && !this.on)) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // 1) 체크칸: 눌렸다가 크게 튀어 오른다
    el.animate([{ transform: 'scale(.6) rotate(-12deg)' }, { transform: 'scale(1.35) rotate(4deg)', offset: .45 }, { transform: 'scale(.94)', offset: .7 }, { transform: 'scale(1)' }],
      { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
    if (this._calm()) return;
    // 2) 고리 두 겹
    [[0, 3.2, 3], [90, 4.6, 1.5]].forEach(([delay, sc, bw]) => {
      const ring = this._el('fx-ring', { left: cx + 'px', top: cy + 'px', borderWidth: bw + 'px' });
      this._done(ring.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: `translate(-50%,-50%) scale(${sc})`, opacity: 0 }],
        { duration: 560, delay, easing: 'cubic-bezier(.1,.7,.2,1)', fill: 'both' }), ring);
    });
    // 3) 충격선 — 체크칸에서 바깥으로 뻗었다 사라지는 짧은 선 8개
    for (let k = 0; k < 8; k++) {
      const ang = k * 45 + 22.5, ln = this._el('fx-ray', { left: cx + 'px', top: cy + 'px', transform: `rotate(${ang}deg)` });
      this._done(ln.animate([
        { transform: `rotate(${ang}deg) translateX(10px) scaleX(.2)`, opacity: 1 },
        { transform: `rotate(${ang}deg) translateX(26px) scaleX(1)`, opacity: 1, offset: .4 },
        { transform: `rotate(${ang}deg) translateX(40px) scaleX(.1)`, opacity: 0 }], { duration: 460, easing: 'ease-out', fill: 'both' }), ln);
    }
    // 4) 조각 — 네모·막대가 포물선을 그리며 흩어진다
    const C = ['var(--accent)', 'var(--accent)', 'var(--text)', '#FFC24B'];
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70, w = 4 + Math.random() * 5, bar = Math.random() < .4;
      const p = this._el('fx-bit', { left: cx + 'px', top: cy + 'px', width: (bar ? w * .5 : w) + 'px', height: (bar ? w * 2 : w) + 'px', background: C[k % C.length] });
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 20, rot = (Math.random() - .5) * 720;
      this._done(p.animate([
        { transform: 'translate(-50%,-50%) rotate(0) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * .7}px), calc(-50% + ${dy * .7}px)) rotate(${rot * .6}deg) scale(1)`, opacity: 1, offset: .55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 46}px)) rotate(${rot}deg) scale(.4)`, opacity: 0 }],
        { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'both' }), p);
    }
    // 5) 그 줄에 주황 빛줄기가 왼쪽→오른쪽으로 한 번 지나간다
    const row = el.closest('.habit-item');
    if (row) {
      const rr = row.getBoundingClientRect();
      const sw = this._el('fx-sweep', { left: rr.left + 'px', top: rr.top + 'px', width: rr.width + 'px', height: rr.height + 'px' });
      this._done(sw.animate([{ backgroundPosition: '-120% 0', opacity: 1 }, { backgroundPosition: '220% 0', opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'both' }), sw);
    }
  },

  // 그날 습관 전부 — 카드 전체
  perfect(card, n, force) {
    if (!card || (!force && !this.on) || this._calm()) return;
    const r = card.getBoundingClientRect(); if (!r.width) return;
    // 카드 테두리가 주황으로 한 바퀴 번쩍
    const fr = this._el('fx-frame', { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    this._done(fr.animate([{ opacity: 0, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.015)', offset: .25 }, { opacity: 0, transform: 'scale(1.04)' }], { duration: 900, easing: 'ease-out', fill: 'both' }), fr);
    // 위에서 쏟아지는 조각
    const C = ['var(--accent)', '#FFC24B', 'var(--text)', 'var(--accent)'];
    for (let k = 0; k < 46; k++) {
      const x = r.left + Math.random() * r.width, w = 5 + Math.random() * 6, bar = Math.random() < .5;
      const p = this._el('fx-bit', { left: x + 'px', top: (r.top - 10) + 'px', width: (bar ? w * .45 : w) + 'px', height: (bar ? w * 2.2 : w) + 'px', background: C[k % C.length] });
      const dy = r.height * (.5 + Math.random() * .7), dx = (Math.random() - .5) * 90, rot = (Math.random() - .5) * 900;
      this._done(p.animate([
        { transform: 'translate(-50%,-30px) rotate(0)', opacity: 0 },
        { transform: `translate(-50%, 0) rotate(${rot * .1}deg)`, opacity: 1, offset: .1 },
        { transform: `translate(calc(-50% + ${dx}px), ${dy}px) rotate(${rot}deg)`, opacity: 0 }],
        { duration: 1100 + Math.random() * 700, delay: Math.random() * 260, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'both' }), p);
    }
    // 도장
    const st = this._el('fx-stamp', { left: (r.left + r.width / 2) + 'px', top: (r.top + Math.min(r.height / 2, 160)) + 'px' });
    st.innerHTML = `<b>올클리어</b><span class="num">${n || ''}${n ? '/' + n : ''}</span>`;
    this._done(st.animate([
      { transform: 'translate(-50%,-50%) scale(2.4) rotate(-14deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(.92) rotate(-8deg)', opacity: 1, offset: .18 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(-8deg)', opacity: 1, offset: .26 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(-8deg)', opacity: 1, offset: .8 },
      { transform: 'translate(-50%,-60%) scale(1) rotate(-8deg)', opacity: 0 }], { duration: 1700, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'both' }), st);
    try { Haptic.success(); } catch (e) {}
  },
};
