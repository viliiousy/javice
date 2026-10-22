// js/card-layout.js — PC·태블릿 카드 배치를 화면에서 직접: 끌어서 옮기고, 테두리를 끌어 크기 조절(20px 단위)
//
// 카드 이름을 3초 꾹 누르면 '편집 모드' — 카드들이 살짝 흔들리고, 카드를 끌면 자리가 옮겨지고
// 오른쪽·아래 테두리와 오른쪽 아래 모서리를 끌면 크기가 바뀐다. 모든 값은 20px 칸에 붙는다(12px 움직이면 20px 로).
// 다른 카드와 겹치면 겹친 카드가 아래로 비켜선다. 완료(또는 Esc)를 누르면 저장.
// 저장: gl_cards_free_w = { base: 저장할 때 판 너비, cards: { 카드: { x, y, w, h } } } — 판 너비가 바뀌면 가로만 같은 비율로 늘이고 줄인다.
// 카드 안은 너비에 맞춰 바뀌고(container query), 칸보다 내용이 길면 카드 안에서 스크롤된다.
const CardLayout = {
  KEY: 'gl_cards_free_w', SNAP: 20, GAP: 20, MINW: 220, MINH: 140,
  get L() { try { const v = JSON.parse(UserStore.get(this.KEY) || 'null'); return v && v.cards ? v : null; } catch (e) { return null; } },
  _save(L) { const v = JSON.stringify(L); this._sig = v; UserStore.set(this.KEY, v); window.FirebaseSync?.scheduleSave?.(); },
  reset() { UserStore.set(this.KEY, 'null'); window.FirebaseSync?.scheduleSave?.(); this.apply(); if (this.on) this.exit(true); App.showToast('카드 배치를 처음대로 돌렸습니다', 'success'); },
  _dash() { return document.querySelector('.dashboard'); },
  _vis() { return Tabs.CARDS.filter(c => Tabs.isOn(c.cls) && Tabs.tabOn(c.tab)).map(c => c.cls); },
  _box() { const d = this._dash(), cs = getComputedStyle(d); const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0;
    return { pl, pt, w: d.clientWidth - pl - pr }; },
  snap(v) { return Math.round(v / this.SNAP) * this.SNAP; },

  // 지금 격자 배치를 그대로 읽어 첫 배치로 삼는다
  _capture() {
    const d = this._dash(), r0 = d.getBoundingClientRect(), B = this._box(), cards = {};
    for (const cls of this._vis()) { const el = d.querySelector('.' + cls); if (!el) continue; const r = el.getBoundingClientRect();
      cards[cls] = { x: this.snap(r.left - r0.left - B.pl), y: this.snap(r.top - r0.top - B.pt), w: Math.floor(r.width / this.SNAP) * this.SNAP, h: Math.floor(r.height / this.SNAP) * this.SNAP }; }
    return { base: Math.round(B.w), cards };
  },
  // 빠진 카드(새로 켠 것)는 맨 아래에 붙이고, 겹친 것은 아래로 비킨다
  _fill(L) {
    let bottom = 0; for (const c of Object.values(L.cards)) bottom = Math.max(bottom, c.y + c.h);
    for (const cls of this._vis()) if (!L.cards[cls]) { const w = Math.min(L.base, (Tabs.sizes()[cls] || [1])[0] * Math.round(L.base / 3)); L.cards[cls] = { x: 0, y: bottom ? bottom + this.GAP : 0, w: this.snap(w), h: 560 }; bottom = L.cards[cls].y + 560; }
    return L;
  },
  // 겹침 풀기: fixed 는 그 자리에, 나머지는 원래 자리(orig)에서 시작해 겹치면 아래로
  _resolve(L, fixed, orig) {
    const ids = Object.keys(L.cards).filter(k => this._vis().includes(k));
    const src = orig || L.cards, placed = [];
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h + this.GAP && b.y < a.y + a.h + this.GAP;
    if (fixed && L.cards[fixed]) placed.push(L.cards[fixed]);
    const rest = ids.filter(k => k !== fixed).sort((a, b) => src[a].y - src[b].y || src[a].x - src[b].x);
    for (const k of rest) {
      const c = { ...src[k] }; c.x = Math.max(0, Math.min(c.x, L.base - c.w));
      let moved = true, guard = 0;
      while (moved && guard++ < 100) { moved = false; for (const p of placed) if (hit(c, p)) { c.y = p.y + p.h + this.GAP; moved = true; } }
      L.cards[k] = c; placed.push(c);
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
    this._fill(L);
    H.classList.add('card-free');
    const k = B.w / (L.base || B.w); let bottom = 0;
    for (const c of Tabs.CARDS) {
      const el = d.querySelector('.' + c.cls), p = L.cards[c.cls]; if (!el) continue;
      if (!p || !this._vis().includes(c.cls)) { el.style.left = el.style.top = ''; continue; }
      const S = (n, v) => el.style.setProperty(n, v, 'important');
      S('left', (B.pl + p.x * k) + 'px'); S('top', (B.pt + p.y) + 'px'); S('width', (p.w * k) + 'px'); S('height', p.h + 'px'); S('max-height', 'none');
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
    bar.innerHTML = `<span><b>카드 배치 편집</b> 카드를 끌어 옮기고 · 오른쪽·아래 테두리나 모서리를 끌어 크기 조절 (20px 단위)</span>
      <button type="button" class="cl-b" onclick="CardLayout.reset()">처음대로</button><button type="button" class="cl-b cl-done" onclick="CardLayout.exit()">완료</button>`;
    document.body.appendChild(bar);
    this._key = e => { if (e.key === 'Escape') this.exit(); }; document.addEventListener('keydown', this._key);
    this._sizes();
    try { Haptic.medium(); } catch (e) {}
  },
  exit(silent) {
    if (!this.on) return; this.on = false;
    document.querySelectorAll('.cl-ov').forEach(x => x.remove()); document.getElementById('clBar')?.remove();
    document.documentElement.classList.remove('card-edit'); document.removeEventListener('keydown', this._key);
    if (!silent) App.showToast('카드 배치를 저장했습니다', 'success');
  },
  _sizes() { const L = this.L; if (!L) return; document.querySelectorAll('.cl-ov').forEach(ov => { const p = L.cards[ov.dataset.cls]; const z = ov.querySelector('.cl-sz'); if (p && z) z.textContent = `${Math.round(p.w)}×${Math.round(p.h)}`; }); },
  _down(e, cls) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const m = (e.target.dataset && e.target.dataset.m) || 'move', L = this.L; if (!L) return;
    const B = this._box(), k = B.w / (L.base || B.w);
    const orig = JSON.parse(JSON.stringify(L.cards)), p0 = { ...L.cards[cls] };
    const el = this._dash().querySelector('.' + cls); el.classList.add('cl-active');
    const sx = e.clientX, sy = e.clientY;
    const mv = ev => {
      const dx = (ev.clientX - sx) / k, dy = ev.clientY - sy, c = L.cards[cls] = { ...p0 };
      if (m === 'move') { c.x = Math.max(0, Math.min(L.base - c.w, this.snap(p0.x + dx))); c.y = Math.max(0, this.snap(p0.y + dy)); }
      if (m === 'e' || m === 'se') c.w = Math.max(this.MINW, Math.min(L.base - c.x, this.snap(p0.w + dx)));
      if (m === 's' || m === 'se') c.h = Math.max(this.MINH, this.snap(p0.h + dy));
      const o = { ...orig }; o[cls] = c;
      this._resolve(L, cls, o); this._save(L); this.apply(); this._sizes();
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); el.classList.remove('cl-active'); try { Haptic.light(); } catch (er) {} };
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
