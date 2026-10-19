// js/rowui.js — 목록 한 줄을 다루는 방식 한 벌
//
// 세 카드가 저마다 다르게 굴었다. 할일만 PC 에서 줄에 올리면 ✕ 가 떴고,
// 습관·체크리스트는 ⚙️ 편집 모드에 들어가야 지울 수 있었다.
// 스와이프·길게누르기 코드는 두 파일에 있었지만 DOM 에 한 번도 붙은 적이 없는 죽은 코드였다.
//
// 여기서 한 벌로 정한다.
//   손가락 — 길게 누르면 수정, 왼쪽으로 밀면 삭제 버튼이 나온다
//   마우스 — 글씨를 누르면 수정, 줄에 올리면 ✕ 가 나온다
//
// 미는 즉시 지우지 않는다. 버튼이 나오고, 그걸 한 번 더 눌러야 지워진다 —
// 주머니 속에서 스치기만 해도 사라지면 그건 기능이 아니라 사고다.
//
// 줄을 그리는 쪽은 마크업을 거의 안 바꾼다. 줄에 data-row 만 달고
// 그린 뒤 RowUI.paint(칸, {edit, del}) 를 부르면 된다.

const RowUI = {
  LP:   380,   // 길게 누르기로 치는 시간(ms)
  MOVE: 10,    // 이만큼 움직이면 누른 게 아니라 미는 것
  SNAP: 56,    // 이만큼 밀면 삭제 버튼이 열린 채로 멈춘다
  _open: null, // 지금 열려 있는 줄 (한 번에 하나만)

  closeOpen() {
    if (!this._open) return;
    this._open.classList.remove('rw-on');
    this._open.style.transform = '';
    this._open = null;
  },

  paint(root, h) {
    if (!root || !h) return;
    root.querySelectorAll('[data-row]').forEach(row => {
      if (row.dataset.rowOn) return;
      row.dataset.rowOn = '1';
      const id = row.dataset.i;
      const label = row.dataset.label || '항목';

      // 줄을 감싸고, 뒤에 삭제 버튼을 깐다
      const wrap = document.createElement('div');
      wrap.className = 'rw';
      row.parentNode.insertBefore(wrap, row);
      wrap.appendChild(row);
      row.classList.add('rw-slide');

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'rw-del';
      del.textContent = '삭제';
      del.setAttribute('aria-label', `${label} 삭제`);
      del.onclick = (e) => { e.stopPropagation(); this.closeOpen(); h.del(id); };
      wrap.appendChild(del);

      // PC 용 ✕ — DOM 에는 늘 있고 보이기만 숨는다.
      // 호버해야만 존재하는 버튼은 키보드로는 없는 버튼이라서다.
      // 이미 제 ✕ 를 가진 줄(할일)은 data-nox 로 빠진다. 두 개가 나란히 뜨면 그게 더 나쁘다.
      if (!row.hasAttribute('data-nox')) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'rw-x';
      x.innerHTML = '✕';
      x.setAttribute('aria-label', `${label} 삭제`);
      x.onclick = (e) => { e.stopPropagation(); h.del(id); };
      row.appendChild(x);
      }

      // ── 손가락 ──────────────────────────────
      let sx = 0, sy = 0, moved = false, sliding = false, lp = null, fired = false, dragging = false;
      const startedOpen = () => this._open === row;

      row.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        sx = t.clientX; sy = t.clientY;
        moved = false; sliding = false; fired = false; dragging = false;
        // 다른 줄이 열려 있으면 먼저 닫는다
        if (this._open && this._open !== row) this.closeOpen();
        lp = setTimeout(() => {
          if (moved) return;
          fired = true;
          try { Haptic.medium(); } catch {}
          this.closeOpen();
          // 순서를 바꿀 수 있는 목록(습관)은 길게 누르면 끌기가 시작된다.
          if (h.reorder) { dragging = true; this._dragStart(wrap, root, sy); }
          else h.edit(id);
        }, this.LP);
      }, { passive: true });

      row.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (dragging) { e.preventDefault(); this._dragMove(t.clientY); return; }
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (!moved && Math.abs(dx) < this.MOVE && Math.abs(dy) < this.MOVE) return;
        moved = true;
        clearTimeout(lp);
        // 세로로 더 움직이면 그건 스크롤이다. 가로로 확실할 때만 잡는다.
        if (!sliding && Math.abs(dx) > Math.abs(dy) * 1.5) sliding = true;
        if (!sliding) return;
        e.preventDefault();
        row.classList.add('rw-drag');
        const base = startedOpen() ? -this.SNAP : 0;
        // 오른쪽으로는 제자리까지만, 왼쪽으로는 버튼 너비보다 조금 더까지
        const x2 = Math.max(-this.SNAP - 20, Math.min(0, base + dx));
        row.style.transform = `translateX(${x2}px)`;
      }, { passive: false });

      const end = (e) => {
        clearTimeout(lp);
        if (dragging) { dragging = false; this._dragEnd(h.reorder); return; }
        if (!sliding) return;
        const dx = (e.changedTouches ? e.changedTouches[0].clientX : sx) - sx;
        const base = startedOpen() ? -this.SNAP : 0;
        const x2 = base + dx;
        row.style.transform = '';
        row.classList.remove('rw-drag');
        if (x2 < -this.SNAP / 2) { row.classList.add('rw-on'); this._open = row; try { Haptic.light(); } catch {} }
        else { row.classList.remove('rw-on'); if (startedOpen()) this._open = null; }
      };
      // 길게 누를 때 iOS 가 글씨를 선택(파란 칠)하거나 메뉴를 띄우지 못하게 한다
      row.addEventListener('contextmenu', (e) => { if (h.reorder || fired) e.preventDefault(); });
      row.addEventListener('selectstart', (e) => { if (h.reorder) e.preventDefault(); });
      row.addEventListener('touchend', end);
      row.addEventListener('touchcancel', end);

      // 마우스로도 길게 눌러 끌 수 있다 (순서를 바꿀 수 있는 목록만).
      if (h.reorder) {
        row.addEventListener('mousedown', (e) => {
          if (e.button !== 0 || e.target.closest('button, input, .habit-chk')) return;
          const y0 = e.clientY, x0 = e.clientX;
          let t = setTimeout(() => {
            t = null; fired = true; try { Haptic.medium(); } catch {} this._dragStart(wrap, root, y0);
            const mv = (ev) => { ev.preventDefault(); this._dragMove(ev.clientY); };
            const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
              this._dragEnd(h.reorder); setTimeout(() => { fired = false; }, 0); };
            document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
          }, 450);
          const cancel = (ev) => {
            if (ev.type === 'mousemove' && Math.abs(ev.clientX - x0) < 5 && Math.abs(ev.clientY - y0) < 5) return;
            if (t) clearTimeout(t);
            document.removeEventListener('mousemove', cancel); document.removeEventListener('mouseup', cancel);
          };
          document.addEventListener('mousemove', cancel); document.addEventListener('mouseup', cancel);
        });
      }

      // 열려 있을 때의 탭은 '닫기'다. 길게 눌러 수정을 띄운 뒤의 탭도 삼킨다.
      row.addEventListener('click', (e) => {
        if (fired || sliding || this._open === row) {
          e.stopPropagation(); e.preventDefault();
          if (this._open === row) this.closeOpen();
        }
      }, true);
    });
  },

  // ── 끌어서 순서 바꾸기 ─────────────────────
  // iOS 미리알림·Todoist 와 같은 구조로 간다.
  //   1) 길게 누르면 그 줄이 '들린다' — 살짝 커지고 그림자가 생긴다. 줄은 제자리(흐름 안)에 둔다.
  //   2) 손가락을 따라 들린 줄만 translateY 로 움직인다. DOM 은 건드리지 않는다.
  //   3) 지나친 줄들은 들린 줄의 높이만큼 위/아래로 부드럽게 비켜선다(transform + transition).
  //   4) 화면 위·아래 끝에 닿으면 저절로 스크롤된다.
  //   5) 놓는 순간에만 DOM 순서를 한 번 바꾸고 transform 을 지운다.
  // 예전 방식(줄을 position:fixed 로 떼고 점선 빈칸을 끼우기)은 줄이 튀고 글씨가 선택되어 파랗게 칠해졌다.
  _drag: null,
  _dragStart(wrap, root, y) {
    const items = [...root.querySelectorAll(':scope > .rw')];
    const idx = items.indexOf(wrap); if (idx < 0) return;
    const sy = window.scrollY;
    const rs = items.map(el => el.getBoundingClientRect());
    const tops = rs.map(r => r.top + sy), hs = rs.map(r => r.height);
    // 들린 줄이 비키게 만드는 거리 = 제 높이 + 줄 사이 간격
    const gap = idx < items.length - 1 ? Math.max(0, tops[idx+1] - (tops[idx] + hs[idx]))
              : idx > 0 ? Math.max(0, tops[idx] - (tops[idx-1] + hs[idx-1])) : 0;
    try { window.getSelection()?.removeAllRanges(); } catch {}
    root.classList.add('rw-sorting');
    document.body.classList.add('rw-dragging');
    wrap.classList.add('rw-lift');
    this._drag = { wrap, root, items, idx, to: idx, tops, hs, H: hs[idx] + gap, y0: y + sy, cy: y, raf: 0 };
    this._autoScroll();
  },
  _dragMove(y) {
    const d = this._drag; if (!d) return;
    d.cy = y;
    const dy = y + window.scrollY - d.y0;
    d.wrap.style.transform = `translateY(${dy}px) scale(1.02)`;
    const c = d.tops[d.idx] + d.hs[d.idx] / 2 + dy;   // 들린 줄의 가운데(페이지 좌표)
    let to = d.idx;
    for (let i = d.idx + 1; i < d.items.length; i++) if (c > d.tops[i] + d.hs[i] / 2) to = i;
    for (let i = d.idx - 1; i >= 0; i--)            if (c < d.tops[i] + d.hs[i] / 2) to = i;
    if (to !== d.to) {
      d.to = to;
      try { Haptic.select(); } catch {}
      d.items.forEach((el, i) => {
        if (i === d.idx) return;
        const sh = (d.idx < i && i <= to) ? -d.H : (to <= i && i < d.idx) ? d.H : 0;
        el.style.transform = sh ? `translateY(${sh}px)` : '';
      });
    }
  },
  // 손가락이 화면 위·아래 끝 근처면 그쪽으로 천천히 → 빠르게 스크롤한다.
  _autoScroll() {
    const d = this._drag; if (!d) return;
    const head = document.querySelector('.header-sticky-group');
    const topZ = (head ? head.getBoundingClientRect().bottom : 0) + 56;
    const tab = document.querySelector('.tabbar');
    const botZ = (tab && tab.offsetHeight ? tab.getBoundingClientRect().top : window.innerHeight) - 56;
    let v = 0;
    if (d.cy < topZ) v = -Math.min(18, (topZ - d.cy) / 3);
    else if (d.cy > botZ) v = Math.min(18, (d.cy - botZ) / 3);
    if (v) { window.scrollBy(0, v); this._dragMove(d.cy); }
    d.raf = requestAnimationFrame(() => this._autoScroll());
  },
  _dragEnd(cb) {
    const d = this._drag; if (!d) return;
    this._drag = null;
    cancelAnimationFrame(d.raf);
    document.body.classList.remove('rw-dragging');
    const moved = d.to !== d.idx;
    try { Haptic.light(); } catch {}
    // 제자리로 내려앉는 짧은 움직임: 들린 줄을 목표 칸 위치까지 옮겨 둔 뒤 DOM 을 바꾼다
    const finish = () => {
      d.root.classList.add('rw-noanim');
      d.items.forEach(el => { el.style.transform = ''; });
      d.wrap.classList.remove('rw-lift');
      if (moved) {
        const ref = d.items[d.to];
        if (d.to > d.idx) ref.after(d.wrap); else ref.before(d.wrap);
      }
      void d.root.offsetHeight;
      d.root.classList.remove('rw-noanim', 'rw-sorting');
      if (!moved) return;
      const order = [...d.root.querySelectorAll(':scope > .rw [data-row]')].map(el => el.dataset.i);
      try { cb && cb(order); } catch (e) { console.warn(e); }
    };
    let off = 0;
    if (moved) for (let i = Math.min(d.idx, d.to); i <= Math.max(d.idx, d.to); i++) if (i !== d.idx) off += (d.to > d.idx ? 1 : -1) * (d.hs[i] + (d.H - d.hs[d.idx]));
    d.wrap.classList.add('rw-drop');
    d.wrap.style.transform = `translateY(${off}px)`;
    setTimeout(() => { d.wrap.classList.remove('rw-drop'); finish(); }, 170);
  },
};

// 빈 곳을 누르면 열린 줄을 닫는다
document.addEventListener('click', (e) => {
  if (RowUI._open && !e.target.closest('.rw')) RowUI.closeOpen();
});
document.addEventListener('scroll', () => RowUI.closeOpen(), true);

// ── 긴 목록 접기 ───────────────────────────
// 목록이 길면 처음 몇 줄만 보이고 'n개 더 보기' 로 펼친다. 추가 단추(+ 습관 추가 등)는
// 목록의 일부가 아니므로 접혀 있어도 늘 맨 아래에 보인다. 펼친 상태는 화면을 새로 그려도 유지한다.
const Fold = {
  MAX: 5,
  _open: {},
  apply(root, key, max = this.MAX) {
    if (!root) return;
    root.querySelectorAll(':scope .fold-btn').forEach(b => b.remove());
    const items = [...root.querySelectorAll('.rw')].filter(el => !el.closest('.fold-skip'));
    items.forEach(el => el.classList.remove('fold-hide'));
    if (items.length <= max + 1) return;            // 한 줄 더 접느라 단추를 다는 건 손해다
    const open = !!this._open[key];
    if (!open) items.slice(max).forEach(el => el.classList.add('fold-hide'));
    // 묶음(할일 그룹)이 통째로 숨으면 그 이름표도 숨긴다
    root.querySelectorAll('.task-group').forEach(g => g.classList.toggle('fold-hide', !open && ![...g.querySelectorAll('.rw')].some(r => !r.classList.contains('fold-hide'))));
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fold-btn' + (open ? ' open' : '');
    btn.innerHTML = open ? '접기' : `${items.length - max}개 더 보기`;
    btn.onclick = (e) => { e.stopPropagation(); this._open[key] = !open; try { Haptic.select(); } catch {} this.apply(root, key, max); };
    const last = items[items.length - 1];
    const anchor = open ? last : items[max - 1];
    (anchor.closest('.task-group') || anchor).after(btn);
  },
};
