// js/card-sort.js — 메인 카드·카테고리 순서를 '미니 화면' 에서 끌어서 바꾼다
//
//   1) 메인 화면: 카드 이름(제목)을 꾹 누르면 아래에서 미니 화면이 올라오고, 누른 카드가 바로 손가락에 붙는다.
//      그대로 위아래로 끌어 놓으면 끝. (손을 뗐다가 다시 끌어도 된다)
//   2) 설정 › 카테고리 · 카드: ↑↓ 단추 대신 같은 미니 화면 — 실제 화면처럼 위에 카드들, 아래에 카테고리 탭.
//      카드는 위아래로, 카테고리 탭은 옆으로 끌어서 순서를 바꾼다. 탭을 누르면 그 카테고리의 카드가 보인다.
//      카드 오른쪽 눈 모양을 누르면 그 카드를 켜고 끈다.
// 저장은 Tabs 의 열쇠(gl_cards_order · gl_tabs_order — 폰과 넓은 화면 따로)를 그대로 쓴다.
const CardSort = {
  _tab: null,       // 미니 화면에 보이는 카테고리
  LP: 480,

  // ── 저장 ──────────────────────────────
  _saveCards(tab, clsList) {
    const o = Tabs.order(), rest = o.filter(x => Tabs.tabOf(x) !== tab);
    // 다른 카테고리 카드 자리는 그대로 두고, 이 카테고리 카드만 새 순서로
    const out = []; let k = 0;
    for (const x of o) out.push(Tabs.tabOf(x) === tab ? clsList[k++] : x);
    if (k !== clsList.length) { out.length = 0; out.push(...rest, ...clsList); }
    UserStore.set(Tabs.ORDER_KEY, JSON.stringify(out)); window.FirebaseSync?.scheduleSave?.();
    Tabs.applyOrder();
  },
  _saveTabs(ids) {
    UserStore.set(Tabs.TABS_ORDER_KEY, JSON.stringify(ids)); window.FirebaseSync?.scheduleSave?.();
    Tabs._paintBar(); Tabs.set(Tabs._cur, true); Tabs.applyOrder();
  },

  // ── 미니 화면 ─────────────────────────
  // 넓은 화면(PC·태블릿): 실제 칸 격자를 줄인 판 — 카드마다 가로×세로 칸 크기를 바꾸고, 끌어서 자리를 옮긴다
  boardHtml() {
    const C = Tabs.cols(), S = Tabs.sizes(), off = Tabs.getOff();
    const list = Tabs.order().filter(x => Tabs.tabOn(Tabs.tabOf(x))).map(x => Tabs.CARDS.find(c => c.cls === x));
    const eye = on => on
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/></svg>';
    const stop = 'ontouchstart="event.stopPropagation()" onmousedown="event.stopPropagation()"';
    return `<div class="mn-ed mn-wide">
      <div class="mn-board" style="--cols:${C}" data-axis="g">
        ${list.map(c => { const [w0, h] = S[c.cls], w = Math.min(C, w0), on = !off.includes(c.cls);
          return `<div class="mn-blk${on ? '' : ' off'}" data-id="${c.cls}" style="grid-column:span ${w};grid-row:span ${h}" ontouchstart="CardSort.down(event,this)" onmousedown="CardSort.down(event,this)">
            <div class="mn-bh"><span class="mn-nm">${esc(c.name)}</span><button type="button" class="mn-eye" ${stop} onclick="CardSort.eye('${c.cls}')" aria-label="${on ? '숨기기' : '보이기'}">${eye(on)}</button></div>
            <div class="mn-sz"><button type="button" ${stop} onclick="CardSort.size('${c.cls}','w')" aria-label="가로 칸 바꾸기">↔ ${w}</button><button type="button" ${stop} onclick="CardSort.size('${c.cls}','h')" aria-label="세로 칸 바꾸기">↕ ${h}</button><b>${w}×${h}</b></div>
          </div>`; }).join('')}
      </div>
      <p class="mn-help">'오늘의 습관' 한 칸이 <b>1×1</b> · <b>↔</b> 가로 칸(1~${C}) · <b>↕</b> 세로 칸(1~2) · 카드를 끌어서 자리 옮기기 · 눈 모양은 켜고 끄기<br>칸에 맞춰 카드 안이 넓으면 옆으로 펼쳐지고, 내용이 길면 카드 안에서 스크롤됩니다.</p>
    </div>`;
  },
  size(cls, dim) {
    const S = Tabs.sizes(), C = Tabs.cols(); let [w, h] = S[cls]; w = Math.min(C, w);
    if (dim === 'w') w = w >= C ? 1 : w + 1; else h = h >= 2 ? 1 : h + 1;
    Tabs.setSize(cls, w, h); try { Haptic.light(); } catch (e) {} this.paint();
  },
  html() {
    if (Tabs._wide()) return this.boardHtml();
    const T = Tabs.tabsSorted(), tab = this._tab && T.some(t => t.id === this._tab) ? this._tab : (Tabs._cur || T[0].id);
    this._tab = tab;
    const off = Tabs.getOff(), tOn = id => Tabs.tabOn(id);
    const cards = Tabs.order().filter(x => Tabs.tabOf(x) === tab).map(x => Tabs.CARDS.find(c => c.cls === x));
    const eye = on => on
      ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/></svg>';
    const grip = '<i class="mn-grip" aria-hidden="true"><b></b><b></b><b></b></i>';
    const tabOff = !tOn(tab);
    return `<div class="mn-ed" data-tab="${tab}">
      <div class="mn-phone">
        <div class="mn-top"><i></i><i></i><i></i></div>
        <div class="mn-cards${tabOff ? ' mn-dim' : ''}" data-axis="y">
          ${cards.map(c => { const on = !off.includes(c.cls);
            return `<div class="mn-card${on ? '' : ' off'}" data-id="${c.cls}" ontouchstart="CardSort.down(event,this)" onmousedown="CardSort.down(event,this)">
              ${grip}<span class="mn-nm">${esc(c.name)}</span>
              <button type="button" class="mn-eye" aria-label="${on ? '숨기기' : '보이기'}" ontouchstart="event.stopPropagation()" onmousedown="event.stopPropagation()" onclick="CardSort.eye('${c.cls}')">${eye(on)}</button></div>`; }).join('')}
          ${tabOff ? '<p class="mn-offnote">이 카테고리는 꺼져 있습니다</p>' : ''}
        </div>
        <div class="mn-tabs" data-axis="x">
          ${T.map(t => `<div class="mn-tab${t.id === tab ? ' on' : ''}${tOn(t.id) ? '' : ' off'}" data-id="${t.id}" ontouchstart="CardSort.down(event,this)" onmousedown="CardSort.down(event,this)">
            ${Icons.svg(t.icon, 'mn-ic')}<span>${t.label}</span></div>`).join('')}
          <div class="mn-tab mn-fixed">${Icons.svg('sparkle', 'mn-ic')}<span>AI</span></div>
        </div>
      </div>
      <p class="mn-help">카드는 <b>위아래</b>로, 아래 카테고리 탭은 <b>옆으로</b> 끌어서 순서를 바꿉니다 · 탭을 누르면 그 카테고리 카드 · 눈 모양은 켜고 끄기</p>
    </div>`;
  },
  paint() { document.querySelectorAll('.mn-host').forEach(h => { h.innerHTML = this.html(); }); },
  eye(cls) { Tabs.toggleCard(cls, !Tabs.isOn(cls)); try { Haptic.light(); } catch (e) {} this.paint(); },
  pickTab(id) { this._tab = id; try { Haptic.light(); } catch (e) {} this.paint(); },

  // ── 끌기 ──────────────────────────────
  // 손가락(또는 마우스)을 대면 바로 잡는다. 미니 화면은 작아서 스크롤과 다툴 일이 거의 없다.
  // 탭은 옆으로 조금도 안 움직이고 떼면 '누름'(그 카테고리 보기)으로 친다.
  down(e, el, fromLP) {
    if (this._d) return;
    const t = e.touches ? e.touches[0] : e;
    if (!e.touches && e.button !== 0) return;
    const box = el.parentElement, axis = box.dataset.axis;
    const items = [...box.querySelectorAll(':scope > [data-id]')];
    const rects = items.map(x => x.getBoundingClientRect());
    this._d = { el, box, axis, items, rects, i: items.indexOf(el), to: items.indexOf(el), sx: t.clientX, sy: t.clientY, id: e.touches ? t.identifier : 'm', moved: !!fromLP, live: !!fromLP };
    if (fromLP) this._lift();
    if (axis === 'g') { const r = el.getBoundingClientRect(); this._d.r = r; this._d.ox = t.clientX - r.left; this._d.oy = t.clientY - r.top; if (fromLP) this._gLift(); }
    if (!this._bound) {
      this._bound = true;
      document.addEventListener('touchmove', ev => this.move(ev), { passive: false });
      document.addEventListener('touchend', ev => this.up(ev));
      document.addEventListener('touchcancel', ev => this.up(ev));
      document.addEventListener('mousemove', ev => this.move(ev));
      document.addEventListener('mouseup', ev => this.up(ev));
    }
    if (!e.touches) e.preventDefault();
  },
  // 판(격자) 끌기: 떠 있는 복사본이 손가락을 따라오고, 원래 자리는 점선 칸이 되어 놓일 곳으로 옮겨 다닌다
  _gLift() {
    const d = this._d; if (d.ghost) return;
    const g = d.el.cloneNode(true); g.classList.add('mn-ghost'); g.removeAttribute('ontouchstart'); g.removeAttribute('onmousedown');
    Object.assign(g.style, { position: 'fixed', left: d.r.left + 'px', top: d.r.top + 'px', width: d.r.width + 'px', height: d.r.height + 'px', margin: 0, pointerEvents: 'none', zIndex: 100000 });
    document.body.appendChild(g); d.ghost = g; d.el.classList.add('mn-ph');
  },
  _gMove(t) {
    const d = this._d; d.ghost.style.left = (t.clientX - d.ox) + 'px'; d.ghost.style.top = (t.clientY - d.oy) + 'px';
    const hit = document.elementFromPoint(t.clientX, t.clientY), b = hit && hit.closest && hit.closest('.mn-blk');
    if (!b || b === d.el || b.parentElement !== d.box) return;
    const r = b.getBoundingClientRect(), after = t.clientX > r.left + r.width / 2 || t.clientY > r.top + r.height * 0.75;
    const ref = after ? b.nextSibling : b;
    if (ref === d.el || (after && b.nextSibling === d.el) || (!after && b.previousSibling === d.el && false)) return;
    if (d.last === b && d.lastAfter === after) return; d.last = b; d.lastAfter = after;
    d.box.insertBefore(d.el, ref); d.to = -1;
    try { Haptic.light(); } catch (e) {}
  },
  _lift() { const d = this._d; d.el.classList.add('mn-drag'); d.box.classList.add('mn-sorting'); try { Haptic.medium(); } catch (e) {} },
  _pt(ev) {
    const d = this._d; if (!d) return null;
    if (ev.touches || ev.changedTouches) { const L = [...(ev.touches || []), ...(ev.changedTouches || [])]; return L.find(x => x.identifier === d.id) || null; }
    return d.id === 'm' ? ev : null;
  },
  move(ev) {
    const d = this._d; if (!d) return; const t = this._pt(ev); if (!t) return;
    const dx = t.clientX - d.sx, dy = t.clientY - d.sy, dv = d.axis === 'y' ? dy : dx;
    if (!d.live) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (d.axis === 'y' && Math.abs(dx) > Math.abs(dy) * 1.5 && !ev.touches) return;
      d.live = true; this._lift(); if (d.axis === 'g') this._gLift();
    }
    if (ev.cancelable) ev.preventDefault();
    if (d.axis === 'g') { this._gMove(t); return; }
    const r0 = d.rects[d.i], key = d.axis === 'y' ? 'top' : 'left', size = d.axis === 'y' ? 'height' : 'width';
    d.el.style.transform = d.axis === 'y' ? `translateY(${dy}px)` : `translateX(${dx}px)`;
    const c = r0[key] + r0[size] / 2 + dv;
    let to = d.i;
    d.rects.forEach((r, k) => { const m = r[key] + r[size] / 2; if (k > d.i && c > m) to = Math.max(to, k); if (k < d.i && c < m) to = Math.min(to, k); });
    if (to !== d.to) { d.to = to; try { Haptic.light(); } catch (e) {} }
    const gap = r0[size] + (d.items.length > 1 ? Math.abs((d.rects[1] || r0)[key] - (d.rects[0] || r0)[key]) - (d.rects[0] || r0)[size] : 0);
    d.items.forEach((x, k) => {
      if (k === d.i) return;
      let s = 0; if (d.i < to && k > d.i && k <= to) s = -gap; if (d.i > to && k < d.i && k >= to) s = gap;
      x.style.transform = s ? (d.axis === 'y' ? `translateY(${s}px)` : `translateX(${s}px)`) : '';
    });
  },
  up(ev) {
    const d = this._d; if (!d) return; if (ev && !this._pt(ev) && ev.type !== 'mouseup') return;
    this._d = null;
    d.items.forEach(x => { x.style.transform = ''; }); d.el.classList.remove('mn-drag'); d.box.classList.remove('mn-sorting');
    if (d.axis === 'g') {
      d.ghost?.remove(); d.el.classList.remove('mn-ph');
      if (!d.live) return;
      const ids = [...d.box.querySelectorAll(':scope > [data-id]')].map(x => x.dataset.id);
      const rest = Tabs.order().filter(x => !ids.includes(x));
      UserStore.set(Tabs.ORDER_KEY, JSON.stringify(ids.concat(rest))); window.FirebaseSync?.scheduleSave?.();
      Tabs.applyOrder(); try { Haptic.success ? Haptic.success() : Haptic.medium(); } catch (e) {}
      this.paint(); return;
    }
    if (!d.live) {   // 움직이지 않고 뗐다 — 탭이면 그 카테고리 보기
      if (d.axis === 'x') this.pickTab(d.el.dataset.id);
      return;
    }
    if (d.to === d.i) return;
    const ids = d.items.map(x => x.dataset.id); const [m] = ids.splice(d.i, 1); ids.splice(d.to, 0, m);
    if (d.axis === 'y') this._saveCards(d.box.closest('.mn-ed').dataset.tab, ids);
    else this._saveTabs(ids);
    try { Haptic.success ? Haptic.success() : Haptic.medium(); } catch (e) {}
    this.paint();
  },

  // ── 메인 화면: 카드 이름을 꾹 ─────────────
  sheet(tab, cls, touch) {
    document.getElementById('mnSheet')?.remove();
    this._tab = tab;
    const ov = document.createElement('div'); ov.id = 'mnSheet'; ov.className = 'mx-ov mn-ov';
    ov.innerHTML = `<div class="mx-sh mn-sh" role="dialog" aria-label="카드 순서">
      <div class="mn-sh-h"><b>${Tabs._wide() ? '카드 자리 · 크기' : '카드 순서'}</b><button type="button" class="mn-done" onclick="CardSort.closeSheet()">완료</button></div>
      <div class="mn-host">${this.html()}</div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) this.closeSheet(); });
    requestAnimationFrame(() => ov.classList.add('on'));
    // 누른 카드를 바로 손가락에 붙인다 — 손을 떼지 않고 그대로 끌면 된다
    if (cls && touch) setTimeout(() => {
      const el = ov.querySelector(`.mn-card[data-id="${cls}"], .mn-blk[data-id="${cls}"]`); if (!el || !this._lp) return;
      const r = el.getBoundingClientRect();
      const fake = { touches: touch.identifier != null ? [{ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: touch.identifier }] : null, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, preventDefault() {} };
      if (!fake.touches) delete fake.touches;
      this.down(fake, el, true);
      // 손가락 위치와 미니 카드 위치가 다르므로 기준점을 지금 손가락으로 옮긴다
      this._d.sx = touch.clientX; this._d.sy = touch.clientY;
    }, 230);
  },
  closeSheet() { const ov = document.getElementById('mnSheet'); if (!ov) return; ov.classList.remove('on'); setTimeout(() => ov.remove(), 200); },

  init() {
    const start = (e, x, y, id) => {
      const title = e.target.closest && e.target.closest('.dashboard .card .card-title'); if (!title) return;
      const card = title.closest('.card'), c = Tabs.CARDS.find(k => card.classList.contains(k.cls)); if (!c) return;
      clearTimeout(this._lpT); clearTimeout(this._lpT2); this._lp = { x, y, id };
      // PC·태블릿: 2초 꾹 → 화면 배치 편집 모드(카드가 흔들리고 끌어서 옮기기·테두리로 크기). 누르는 동안 제목 밑줄이 차오른다.
      if (Tabs._wide() && typeof CardLayout !== 'undefined') {
        this._lpT2 = setTimeout(() => { if (this._lp) title.classList.add('cl-hold'); }, 300);
        this._lpT = setTimeout(() => { title.classList.remove('cl-hold'); if (!this._lp) return; this._lp = null; CardLayout.enter(); }, 2000);
        this._lpTitle = title; return;
      }
      this._lpT = setTimeout(() => { if (!this._lp) return; this.sheet(c.tab, c.cls, { clientX: this._lp.x, clientY: this._lp.y, identifier: id }); }, this.LP);
    };
    const cancel = () => { clearTimeout(this._lpT); clearTimeout(this._lpT2); this._lpTitle?.classList.remove('cl-hold'); this._lp = null; };
    document.addEventListener('touchstart', e => { const t = e.touches[0]; start(e, t.clientX, t.clientY, t.identifier); }, { passive: true });
    document.addEventListener('touchmove', e => { if (!this._lp || this._d) return; const t = e.touches[0]; if (Math.abs(t.clientX - this._lp.x) > 8 || Math.abs(t.clientY - this._lp.y) > 8) cancel(); }, { passive: true });
    document.addEventListener('touchend', () => { if (!this._d) cancel(); }, { passive: true });
    document.addEventListener('mousedown', e => { if (e.button === 0) start(e, e.clientX, e.clientY, null); });
    document.addEventListener('mousemove', e => { if (this._lp && !this._d && (Math.abs(e.clientX - this._lp.x) > 6 || Math.abs(e.clientY - this._lp.y) > 6)) cancel(); });
    document.addEventListener('mouseup', () => { if (!this._d) cancel(); });
    // 꾹 누르는 동안 글자 선택·메뉴가 뜨지 않게
    document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.dashboard .card .card-title')) e.preventDefault(); });
  },
};
