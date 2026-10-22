// js/card-layout.js — PC·태블릿 카드 배치를 화면에서 직접: 끌어서 옮기고, 테두리를 끌어 크기 조절
//
// 카드 이름을 2초 꾹 누르면 '편집 모드' — 카드들이 살짝 흔들리고, 카드를 끌면 자리가 옮겨지고
// 오른쪽·아래 테두리와 오른쪽 아래 모서리를 끌면 크기가 바뀐다.
//   가로: 언제나 열 단위(1열 · 2열 · 3열 너비, 태블릿은 1·2열) — 열 사이 간격은 20px 하나
//   세로: 50px 단위
// 다른 카드와 겹치면 겹친 카드가 아래로 비켜선다. 바깥(배경)·완료·Esc 로 저장하고 끝.
// 저장: gl_cards_free_w3 = { cards: { 카드: { c: 시작 열, s: 열 수, y, h } } } — y·h 는 50px 칸(카드 사이 20px 는 칸 안쪽에서 띄워 그린다)
// 카드 안은 너비에 맞춰 바뀌고(container query), 칸보다 내용이 길면 카드 안에서 스크롤된다.
const CardLayout = {
  KEY: 'gl_cards_free_w3', SNAP: 50, GAP: 20, MINH: 150,
  get C() { return Tabs.cols(); },
  get L() {
    try {
      const v = JSON.parse(UserStore.get(this.KEY) || 'null'); if (v && v.cards) return v;
      // 예전(px 너비로 저장한) 배치를 열 단위로 옮겨 온다
      const o = JSON.parse(UserStore.get('gl_cards_free_w2') || 'null') || JSON.parse(UserStore.get('gl_cards_free_w') || 'null');
      if (o && o.cards && o.base && !this._mig) { this._mig = true; const C = this.C, cw = o.base / C, L = { cards: {} };
        for (const [k, p] of Object.entries(o.cards)) { const c = Math.max(0, Math.min(C - 1, Math.round(p.x / cw))); L.cards[k] = { c, s: Math.max(1, Math.min(C - c, Math.round((p.w + 10) / cw))), y: this.snap(p.y), h: Math.max(this.MINH, this.snap(p.h)) }; }
        this._resolve(L); this._save(L); return L; }
    } catch (e) {}
    return null;
  },
  _save(L) { const v = JSON.stringify(L); this._sig = v; UserStore.set(this.KEY, v); window.FirebaseSync?.scheduleSave?.(); },
  reset() { UserStore.set(this.KEY, 'null'); UserStore.set('gl_cards_free_w2', 'null'); UserStore.set('gl_cards_free_w', 'null'); window.FirebaseSync?.scheduleSave?.(); this.apply(); if (this.on) this.exit(true); App.showToast('카드 배치를 처음대로 돌렸습니다', 'success'); },
  _dash() { return document.querySelector('.dashboard'); },
  _vis() { return Tabs.CARDS.filter(c => Tabs.isOn(c.cls) && Tabs.tabOn(c.tab)).map(c => c.cls); },
  _box() { const d = this._dash(), cs = getComputedStyle(d); const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0;
    const w = d.clientWidth - pl - pr, C = this.C; return { pl, pt, w, C, cw: (w - this.GAP * (C - 1)) / C }; },
  snap(v) { return Math.round(v / this.SNAP) * this.SNAP; },
  // 열 수가 바뀌면(PC 3열 ↔ 태블릿 2열) 그 안에 들어오게
  _fit(p, C) { const c = Math.max(0, Math.min(C - 1, p.c)), s = Math.max(1, Math.min(C - c, p.s)); return { ...p, c, s }; },

  // 지금 격자 배치를 그대로 읽어 첫 배치로 삼는다
  _capture() {
    const d = this._dash(), r0 = d.getBoundingClientRect(), B = this._box(), cards = {}, step = B.cw + this.GAP;
    for (const cls of this._vis()) { const el = d.querySelector('.' + cls); if (!el) continue; const r = el.getBoundingClientRect();
      const c = Math.max(0, Math.min(B.C - 1, Math.round((r.left - r0.left - B.pl) / step)));
      cards[cls] = { c, s: Math.max(1, Math.min(B.C - c, Math.round((r.width + this.GAP) / step))), y: this.snap(r.top - r0.top - B.pt), h: Math.max(this.MINH, this.snap(r.height + this.GAP)) }; }
    return { cards };
  },
  // 빠진 카드(새로 켠 것)는 맨 아래에 붙인다
  _fill(L) {
    let bottom = 0; for (const p of Object.values(L.cards)) bottom = Math.max(bottom, p.y + p.h);
    for (const cls of this._vis()) if (!L.cards[cls]) { L.cards[cls] = { c: 0, s: Math.min(this.C, (Tabs.sizes()[cls] || [1])[0]), y: bottom, h: 550 }; bottom += 550; }
    return L;
  },
  // 겹침 풀기: fixed 는 그 자리에, 나머지는 원래 자리(orig)에서 시작해 겹치면 아래로
  _resolve(L, fixed, orig) {
    const C = this.C, ids = Object.keys(L.cards).filter(k => this._vis().includes(k));
    const src = orig || L.cards, placed = [];
    const hit = (a, b) => a.c < b.c + b.s && b.c < a.c + a.s && a.y < b.y + b.h && b.y < a.y + a.h;
    if (fixed && L.cards[fixed]) { L.cards[fixed] = this._fit(L.cards[fixed], C); placed.push(L.cards[fixed]); }
    const rest = ids.filter(k => k !== fixed).sort((a, b) => src[a].y - src[b].y || src[a].c - src[b].c);
    // 빈 줄 없이 위로 붙인다: 위에서부터 차례로, 자기 열에서 비어 있는 가장 위 자리로(끌고 있는 카드는 손가락 자리 그대로)
    for (const k of rest) {
      const p = this._fit({ ...src[k] }, C);
      p.y = 0;
      let moved = true, guard = 0;
      while (moved && guard++ < 200) { moved = false; for (const q of placed) if (hit(p, q)) { p.y = q.y + q.h; moved = true; } }
      L.cards[k] = p; placed.push(p);
    }
    return L;
  },

  apply() {
    const H = document.documentElement, d = this._dash(); if (!d) return;
    const L = Tabs._wide() ? this.L : null;
    if (!L) { H.classList.remove('card-free'); Tabs.CARDS.forEach(c => { const el = d.querySelector('.' + c.cls); if (el) ['left', 'top', 'width', 'height', 'max-height'].forEach(n => el.style.removeProperty(n)); }); d.style.height = ''; return; }
    const B = this._box();
    // 판이 아직 안 보이면(로그인 화면 뒤 · 처음 그리는 중) 너비가 0 이다 — 그때 놓으면 카드가 실처럼 가늘어진다. 보일 때 다시.
    if (!(B.w > 300)) { H.classList.remove('card-free'); clearTimeout(this._rt); this._rt = setTimeout(() => this.apply(), 300); return; }
    this._fill(L); this._resolve(L);   // 저장된 배치에 빈 줄이 있어도 위로 붙여 놓는다
    H.classList.add('card-free');
    let bottom = 0;
    for (const c of Tabs.CARDS) {
      const el = d.querySelector('.' + c.cls), p0 = L.cards[c.cls]; if (!el) continue;
      if (!p0 || !this._vis().includes(c.cls)) { el.style.left = el.style.top = ''; continue; }
      const p = this._fit(p0, B.C), S = (n, v) => el.style.setProperty(n, v, 'important');
      S('left', (B.pl + p.c * (B.cw + this.GAP)) + 'px'); S('top', (B.pt + p.y) + 'px');
      S('width', (p.s * B.cw + (p.s - 1) * this.GAP) + 'px'); S('height', Math.max(40, p.h - this.GAP) + 'px'); S('max-height', 'none');
      bottom = Math.max(bottom, p.y + p.h);
    }
    d.style.height = (B.pt + bottom + 40) + 'px';
  },

  // ── 편집 모드 ─────────────────────────────
  enter() {
    if (!Tabs._wide() || this.on) return;
    this.on = true;
    const L = this.L || this._capture(); this._fill(L); this._resolve(L); this._save(L); this.apply();
    document.documentElement.classList.add('card-edit');
    const d = this._dash();
    let i = 0;
    for (const cls of this._vis()) {
      const el = d.querySelector('.' + cls); if (!el) continue;
      const ov = document.createElement('div'); ov.className = 'cl-ov'; ov.dataset.cls = cls; ov.style.setProperty('--wd', (i++ % 2 ? -1 : 1));
      ov.innerHTML = `<span class="cl-name">${esc((Tabs.CARDS.find(c => c.cls === cls) || {}).name || '')}<i class="cl-sz"></i></span><b class="cl-h cl-e" data-m="e"></b><b class="cl-h cl-s" data-m="s"></b><b class="cl-h cl-se" data-m="se"></b>`;
      el.appendChild(ov); ov.addEventListener('pointerdown', e => this._down(e, cls));
    }
    const bar = document.createElement('div'); bar.id = 'clBar';
    bar.innerHTML = `<span><b>카드 배치 편집</b> 카드를 끌어 옮기고 · 오른쪽·아래 테두리나 모서리를 끌어 크기 조절 (가로는 1·2·3열, 세로는 50px) · 바깥을 누르면 저장</span>
      <button type="button" class="cl-b" onclick="CardLayout.reset()">처음대로</button><button type="button" class="cl-b cl-done" onclick="CardLayout.exit()">완료</button>`;
    document.body.appendChild(bar);
    this._key = e => { if (e.key === 'Escape') this.exit(); }; document.addEventListener('keydown', this._key);
    // 카드 바깥(배경)을 누르면 저장하고 끝낸다 — 꾹 누른 손을 뗄 때는 무시
    setTimeout(() => { this._bg = e => { if (!this.on) return; if (e.target.closest && (e.target.closest('.cl-ov') || e.target.closest('#clBar'))) return; this.exit(); };
      document.addEventListener('pointerdown', this._bg, true); }, 400);
    this._sizes();
    try { Haptic.medium(); } catch (e) {}
  },
  exit(silent) {
    if (!this.on) return; this.on = false;
    document.querySelectorAll('.cl-ov').forEach(x => x.remove()); document.getElementById('clBar')?.remove();
    document.documentElement.classList.remove('card-edit'); document.removeEventListener('keydown', this._key);
    if (this._bg) { document.removeEventListener('pointerdown', this._bg, true); this._bg = null; }
    if (!silent) App.showToast('카드 배치를 저장했습니다', 'success');
  },
  _sizes() { const L = this.L; if (!L) return; document.querySelectorAll('.cl-ov').forEach(ov => { const p = L.cards[ov.dataset.cls]; const z = ov.querySelector('.cl-sz'); if (p && z) z.textContent = `${Math.min(this.C, p.s)}열 · ${p.h}`; }); },
  _down(e, cls) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const m = (e.target.dataset && e.target.dataset.m) || 'move', L = this.L; if (!L) return;
    const B = this._box(), step = B.cw + this.GAP;
    const orig = JSON.parse(JSON.stringify(L.cards)), p0 = this._fit({ ...L.cards[cls] }, B.C);
    const el = this._dash().querySelector('.' + cls); el.classList.add('cl-active');
    const sx = e.clientX, sy = e.clientY;
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, p = L.cards[cls] = { ...p0 };
      // 가로는 열 단위(반 열 넘게 끌면 다음 열), 세로는 50px
      if (m === 'move') { p.c = Math.max(0, Math.min(B.C - p.s, p0.c + Math.round(dx / step))); p.y = Math.max(0, this.snap(p0.y + dy)); }
      if (m === 'e' || m === 'se') p.s = Math.max(1, Math.min(B.C - p.c, p0.s + Math.round(dx / step)));
      if (m === 's' || m === 'se') p.h = Math.max(this.MINH, this.snap(p0.h + dy));
      const o = { ...orig }; o[cls] = p;
      this._resolve(L, cls, o); this._save(L); this.apply(); this._sizes();
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); el.classList.remove('cl-active');
      this._resolve(L); this._save(L); this.apply(); this._sizes();   // 놓으면 끌던 카드도 위로 붙는다
      try { Haptic.light(); } catch (er) {} };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  },

  init() {
    let t = null, lw = 0;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => this.apply(), 120); });
    // 판 너비가 바뀔 때마다(로그인 뒤 처음 보일 때 포함) 다시 놓는다
    // 다른 기기에서 바꾼 배치가 동기화로 내려오면 그걸로
    this._sig = UserStore.get(this.KEY); setInterval(() => { const v = UserStore.get(this.KEY); if (v !== this._sig && !this.on) { this._sig = v; this.apply(); } }, 3000);
    try { const d = this._dash(); if (d && window.ResizeObserver) new ResizeObserver(() => { const w = d.clientWidth; if (Math.abs(w - lw) > 2) { lw = w; clearTimeout(t); t = setTimeout(() => this.apply(), 60); } }).observe(d); } catch (e) {}
  },
};
